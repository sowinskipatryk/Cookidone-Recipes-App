from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from typing import Optional
import math, random

from app.recipes_loader import list_recipes, get_recipe, search_recipes, RECIPES_DIR


app = FastAPI(title="Recipes API")

# Allow local dev from vite
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# serve images statically from /images
IMAGES_DIR = Path(__file__).resolve().parents[2] / "images"
if IMAGES_DIR.exists():
    app.mount("/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")


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


@app.get("/api/recipes")
def api_list_recipes(
    q: Optional[str] = Query(None),
    sort: Optional[str] = Query(None),
    desc: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    randomize: bool = Query(False),
    rating_min: float = Query(0.0),
    rating_max: float = Query(5.0),
    num_ratings_min: int = Query(0),
    num_ratings_max: int = Query(100000),
):
    if q:
        items = search_recipes(q)
        total = len(items)
        start = (page - 1) * per_page
        end = start + per_page
        page_items = items[start:end]
    else:
        result = list_recipes(
            page=page,
            per_page=per_page,
            randomize=randomize,
            rating_min=rating_min,
            rating_max=rating_max,
            num_ratings_min=num_ratings_min,
            num_ratings_max=num_ratings_max,
        )
        items = result["items"]
        total = result["total"]

    if sort:
        items = sorted(items, key=lambda it: parse_sort_key(it, sort), reverse=desc)

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "items": items,
    }



@app.get("/api/recipes/{rid}")
def api_get_recipe(rid: str):
    r = get_recipe(rid)
    if not r:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return r


# Simple health
@app.get("/api/health")
def health():
    return {"status": "ok"}


# If you want to serve the frontend build here, mount it similarly
# app.mount("/", StaticFiles(directory="../frontend/dist", html=True), name="frontend")