from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from typing import Optional, List
import math
import json

from app.data_loader import (
    list_recipes,
    get_recipe,
    search_recipes,
    RECIPES_DIR,
)
import sqlite3

app = FastAPI(title="Recipes API")

# --- Load grouped ingredients ---
INGREDIENTS_GROUPED_FILE = Path(__file__).resolve().parents[2] / "ingredients" / "ingredients_grouped.json"
INGREDIENTS_GROUPED = {}
if INGREDIENTS_GROUPED_FILE.exists():
    with open(INGREDIENTS_GROUPED_FILE, 'r', encoding='utf-8') as f:
        INGREDIENTS_GROUPED = json.load(f)

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Static files (images) ---
IMAGES_DIR = Path(__file__).resolve().parents[2] / "images"
if IMAGES_DIR.exists():
    app.mount("/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")


# --- Helper: sorting ---
def parse_sort_key(item, key: str):
    try:
        if key == "rating":
            return item.get("rating") or 0
        if key == "numberOfRatings":
            return item.get("numberOfRatings") or 0
        if key in ("preparationTime", "totalTime"):
            return item.get(key) or 0
        return item.get(key) or ""
    except Exception:
        return 0


# --- Main list endpoint ---
@app.get("/api/recipes")
def api_list_recipes(
    q: Optional[str] = Query(None),
    sort: Optional[str] = Query("rating"),
    desc: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=200),
    seed: Optional[int] = Query(None),
    randomize: bool = Query(False),
    rating_min: float = Query(0.0),
    rating_max: float = Query(5.0),
    num_ratings_min: int = Query(0),
    num_ratings_max: int = Query(100000),
    language: Optional[str] = Query(None),
    categories: Optional[List[str]] = Query(None),
    includeIngredients: Optional[List[str]] = Query(None),
    excludeIngredients: Optional[List[str]] = Query(None),
):
    # Expand include ingredients to groups (at least one from each group)
    # Expand exclude ingredients to flat list (exclude any of these)
    include_groups = expand_ingredient_ids(includeIngredients) if includeIngredients else None
    exclude_flat = flatten_ingredient_ids(excludeIngredients) if excludeIngredients else None
    
    result = list_recipes(
        q=q,
        page=page,
        per_page=per_page,
        sort=sort,
        desc=desc,
        rating_min=rating_min,
        rating_max=rating_max,
        num_ratings_min=num_ratings_min,
        num_ratings_max=num_ratings_max,
        language=language,
        categories=categories,
        randomize=randomize,
        seed=seed,
        include_ingredient_groups=include_groups,
        exclude_ingredients=exclude_flat,
    )
    return result


@app.get("/api/ingredients")
def api_list_ingredients(grouped: bool = Query(True)):
    """
    Return ingredients for filtering.
    If grouped=True (default): returns base ingredient names with their variant IDs
    If grouped=False: returns all individual ingredients
    """
    if grouped and INGREDIENTS_GROUPED.get("baseIngredients"):
        # Return grouped base ingredients (sorted by count, most common first)
        return [
            {"id": item["name"], "name": item["name"].title(), "ids": item["ids"], "count": item["count"]}
            for item in INGREDIENTS_GROUPED["baseIngredients"]
            if item["count"] > 0
        ]
    
    # Fallback: return all individual ingredients from database
    from app.data_loader import DB_PATH
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id, name FROM ingredients ORDER BY name COLLATE NOCASE;")
    items = [{"id": row[0], "name": row[1]} for row in cur.fetchall()]
    conn.close()
    return items


def expand_ingredient_ids(ingredient_names: List[str]) -> List[List[str]]:
    """
    Expand base ingredient names to groups of variant IDs.
    Returns a list of lists - each inner list contains all IDs for one base ingredient.
    This allows the query to require "at least one from each group".
    """
    if not INGREDIENTS_GROUPED.get("baseToIds"):
        # Fallback: treat each name as its own group
        return [[name] for name in ingredient_names]
    
    groups = []
    base_to_ids = INGREDIENTS_GROUPED["baseToIds"]
    
    for name in ingredient_names:
        name_lower = name.lower()
        if name_lower in base_to_ids:
            # It's a base ingredient name - get all variant IDs as a group
            groups.append(base_to_ids[name_lower])
        else:
            # It might be an individual ID - treat as single-item group
            groups.append([name])
    
    return groups


def flatten_ingredient_ids(ingredient_names: List[str]) -> List[str]:
    """
    Flatten base ingredient names to a single list of all variant IDs.
    Used for exclude logic (exclude ANY of these IDs).
    """
    if not INGREDIENTS_GROUPED.get("baseToIds"):
        return ingredient_names
    
    expanded = []
    base_to_ids = INGREDIENTS_GROUPED["baseToIds"]
    
    for name in ingredient_names:
        name_lower = name.lower()
        if name_lower in base_to_ids:
            expanded.extend(base_to_ids[name_lower])
        else:
            expanded.append(name)
    
    return list(set(expanded))


# --- Single recipe ---
@app.get("/api/recipes/{rid}")
def api_get_recipe(rid: str):
    r = get_recipe(rid)
    if not r:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return r


# --- Languages endpoint ---
@app.get("/api/languages")
def api_list_languages():
    """Return list of all available languages."""
    from app.data_loader import DB_PATH

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT language FROM recipes ORDER BY language")
    langs = [row[0] for row in cur.fetchall() if row[0]]
    conn.close()
    return langs


# --- Categories endpoint ---
@app.get("/api/categories")
def api_list_categories():
    """Return list of all distinct categories."""
    from app.data_loader import DB_PATH

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT name FROM categories")
    cats = [row[0] for row in cur.fetchall() if row[0]]
    conn.close()
    return cats


# --- Health check ---
@app.get("/api/health")
def health():
    return {"status": "ok"}

