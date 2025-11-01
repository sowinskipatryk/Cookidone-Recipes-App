from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from typing import Optional, List
import math

from app.recipes_loader import (
    list_recipes,
    get_recipe,
    search_recipes,
    RECIPES_DIR,
)
import sqlite3

app = FastAPI(title="Recipes API")

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
    sort: Optional[str] = Query(None),
    desc: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    seed: Optional[int] = Query(None),
    randomize: bool = Query(False),      # optional
    first_load: bool = Query(False),     # new
    rating_min: float = Query(0.0),
    rating_max: float = Query(5.0),
    num_ratings_min: int = Query(0),
    num_ratings_max: int = Query(100000),
    language: Optional[str] = Query(None),
    categories: Optional[list[str]] = Query(None),
):
    """List recipes with optional search, filters, sorting, pagination, and first-load shuffle."""
    result = list_recipes(
        page=page,
        per_page=per_page,
        randomize=randomize or first_load,
        rating_min=rating_min,
        rating_max=rating_max,
        num_ratings_min=num_ratings_min,
        num_ratings_max=num_ratings_max,
        language=language,
        categories=categories,
        seed=seed,
    )

    items = result["items"]
    total = result["total"]

    # Sorting
    if sort:
        items = sorted(items, key=lambda it: parse_sort_key(it, sort), reverse=desc)

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "items": items,
    }



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
    from app.recipes_loader import DB_PATH

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
    from app.recipes_loader import DB_PATH

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


# --- Optionally serve frontend build ---
# app.mount("/", StaticFiles(directory="../frontend/dist", html=True), name="frontend")
