import os
import json
import re
import sqlite3
from pathlib import Path
from typing import List, Dict

# --- Paths ---
RECIPES_DIR = Path(__file__).resolve().parents[2] / "recipes"
DB_PATH = Path(__file__).resolve().parents[2] / "recipes.db"


# --- Database setup ---
def init_db():
    """Create SQLite DB and FTS5 tables if not exist."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("PRAGMA foreign_keys = ON;")

    # Main table
    c.execute("""
    CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        rating REAL,
        numberOfRatings INTEGER,
        preparationTime INTEGER,
        totalTime INTEGER,
        numberOfPortions INTEGER,
        difficultyLevel INTEGER,
        data JSON
    );
    """)

    # FTS5 virtual table for full-text search
    c.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS recipes_fts USING fts5(
        title,
        ingredients,
        content='recipes',
        content_rowid='rowid'
    );
    """)

    # Triggers to keep FTS index updated
    c.executescript("""
    CREATE TRIGGER IF NOT EXISTS recipes_ai AFTER INSERT ON recipes BEGIN
      INSERT INTO recipes_fts(rowid, title, ingredients)
      VALUES (
        new.rowid,
        new.title,
        json_extract(new.data, '$.ingredients')
      );
    END;

    CREATE TRIGGER IF NOT EXISTS recipes_ad AFTER DELETE ON recipes BEGIN
      DELETE FROM recipes_fts WHERE rowid = old.rowid;
    END;

    CREATE TRIGGER IF NOT EXISTS recipes_au AFTER UPDATE ON recipes BEGIN
      UPDATE recipes_fts
         SET title = new.title,
             ingredients = json_extract(new.data, '$.ingredients')
       WHERE rowid = old.rowid;
    END;
    """)

    conn.commit()
    conn.close()


# --- Normalization helpers ---
def parse_time(time_str: str) -> int:
    """Convert time like '1 godz. 30 min' or '40 min' to minutes."""
    if not time_str:
        return 0
    time_str = time_str.lower()
    hours = re.search(r"(\d+)\s*godz", time_str)
    mins = re.search(r"(\d+)\s*min", time_str)
    total = 0
    if hours:
        total += int(hours.group(1)) * 60
    if mins:
        total += int(mins.group(1))
    return total


def parse_portions(portions: str) -> int:
    """Extract integer from '2 porcje' or similar."""
    if not portions:
        return 0
    m = re.search(r"\d+", portions)
    return int(m.group()) if m else 0


def map_difficulty(level: str) -> int:
    """Map Polish difficulty level to numeric (łatwy=1, średni=2, trudny=3)."""
    mapping = {"łatwy": 1, "średni": 2, "trudny": 3}
    return mapping.get(level.strip().lower(), 0) if level else 0


def clean_ingredients(ingredients: list) -> list:
    """Remove newlines and excessive whitespace from ingredients."""
    return [re.sub(r"\s+", " ", ing).strip() for ing in ingredients]


def clean_nutrition(nutrition: dict) -> dict:
    """Clean and normalize nutrition data (floats, kcal only)."""
    if not nutrition:
        return {}
    values = nutrition.get("values", {})
    clean_values = {}
    for k, v in values.items():
        if "Kalorie" in k:
            match = re.search(r"([\d.,]+)\s*kcal", v.replace(",", "."))
            if match:
                clean_values["Kalorie"] = float(match.group(1))
        else:
            num = re.search(r"([\d.,]+)", v.replace(",", "."))
            clean_values[k] = float(num.group(1)) if num else 0.0
    return {
        "perServing": nutrition.get("perServing", "").strip(),
        "values": clean_values
    }

def safe_float(value, default=0.0):
    if value is None:
        # print("⚠️ Found None when expecting float")
        return default
    try:
        return float(value)
    except Exception as e:
        # print(f"⚠️ Failed float conversion for value {value}: {e}")
        return default

def safe_int(value, default=0):
    if value is None:
        # print("⚠️ Found None when expecting int")
        return default
    try:
        return int(value)
    except Exception as e:
        # print(f"⚠️ Failed int conversion for value {value}: {e}")
        return default


def normalize_recipe(r: dict) -> dict:
    """Normalize and clean recipe fields."""
    r["rating"] = safe_float(r.get("rating"))
    r["numberOfRatings"] = safe_int(r.get("numberOfRatings"))
    r["preparationTime"] = safe_int(parse_time(r.get("preparationTime")))
    r["totalTime"] = safe_int(parse_time(r.get("totalTime")))
    r["numberOfPortions"] = safe_int(parse_portions(r.get("numberOfPortions")))
    r["difficultyLevel"] = safe_int(map_difficulty(r.get("difficultyLevel")))
    r["ingredients"] = clean_ingredients(r.get("ingredients", []))
    r["nutrition"] = clean_nutrition(r.get("nutrition", {}))
    return r


# --- Import logic ---
def import_json_to_db():
    """Read JSON files, normalize data, and insert into SQLite DB, tracking duplicates."""
    if DB_PATH.exists():
        print("Database already exists — skipping import.")
        return

    print("Building SQLite database from JSON files...")
    init_db()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    inserted_count = 0
    replaced_count = 0
    total_count = 0

    for p in RECIPES_DIR.glob("*.json"):
        try:
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    data = [data]
                if not isinstance(data, list):
                    continue

                for r in data:
                    total_count += 1
                    r = normalize_recipe(r)
                    rid = r.get("id") or p.stem

                    # Check if recipe with this ID already exists
                    c.execute("SELECT 1 FROM recipes WHERE id = ?", (rid,))
                    exists = c.fetchone()

                    c.execute("""
                        INSERT OR REPLACE INTO recipes
                        (id, title, rating, numberOfRatings, preparationTime,
                         totalTime, numberOfPortions, difficultyLevel, data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, json(?))
                    """, (
                        rid,
                        r.get("title"),
                        r.get("rating"),
                        r.get("numberOfRatings"),
                        r.get("preparationTime"),
                        r.get("totalTime"),
                        r.get("numberOfPortions"),
                        r.get("difficultyLevel"),
                        json.dumps(r, ensure_ascii=False)
                    ))

                    if exists:
                        replaced_count += 1
                    else:
                        inserted_count += 1

        except Exception as e:
            print(f"⚠️ Failed to import {p}: {e}")

    conn.commit()
    conn.close()

    print(f"Processed {total_count} recipes.")
    print(f"    Inserted: {inserted_count}")
    print(f"    Duplicated: {replaced_count}")


# --- Public functions ---
def list_recipes() -> List[Dict]:
    """List up to 100 recipes sorted by rating."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("""
        SELECT id, title, rating, numberOfRatings, preparationTime, totalTime
        FROM recipes
        ORDER BY rating DESC
        LIMIT 100
    """)
    data = [dict(row) for row in cur.fetchall()]
    conn.close()
    return data


def get_recipe(rid: str) -> Dict:
    """Get one recipe by ID."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM recipes WHERE id = ?", (rid,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def search_recipes(q: str) -> List[Dict]:
    """Full-text search using FTS5 on title and ingredients."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("""
        SELECT r.*
        FROM recipes r
        JOIN recipes_fts fts ON r.rowid = fts.rowid
        WHERE fts MATCH ?
        ORDER BY r.rating DESC
        LIMIT 100
    """, (q,))
    data = [dict(row) for row in cur.fetchall()]
    conn.close()
    return data


# --- Run import automatically if DB doesn't exist ---
if not DB_PATH.exists():
    import_json_to_db()
else:
    init_db()
