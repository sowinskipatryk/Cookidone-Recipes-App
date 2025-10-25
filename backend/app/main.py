from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from typing import Optional
import math

from .recipes_loader import list_recipes, get_recipe, search_recipes, RECIPES_DIR
from .schemas import Recipe, RecipeSummary

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
    # handle numeric fields and times; fallback to None
    if key == "rating":
        return item.get("rating") or 0
    if key == "numberOfRatings":
        return item.get("numberOfRatings") or 0
    if key in ("preparationTime", "totalTime"):
        # try to parse minutes: simple digits extraction
        tv = item.get(key) or ""
        digits = [int(s) for s in tv.replace("h", " godz.").split() if s.isdigit()]
        if digits:
            return digits[0]
        return 0
    return item.get(key) or ""


@app.get("/api/recipes")
def api_list_recipes(
    q: Optional[str] = Query(None, description="Search query for title or ingredients"),
    sort: Optional[str] = Query(None, description="Sort field: rating, numberOfRatings, preparationTime, totalTime"),
    desc: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
):
    if q:
        items = search_recipes(q)
    else:
        items = list_recipes()


    # Pagination + sort
    if sort:
        items = sorted(items, key=lambda it: parse_sort_key(it, sort), reverse=desc)


    total = len(items)
    start = (page - 1) * per_page
    end = start + per_page
    page_items = items[start:end]


    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "items": page_items,
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