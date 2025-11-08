import json
import random
import re
import sqlite3
from pathlib import Path
from typing import List, Dict

# --- Paths ---
BASE_DIR = Path(__file__).resolve().parents[2]
RECIPES_DIR = BASE_DIR / "recipes"
DB_PATH = BASE_DIR / "recipes.db"


# --- Database setup ---
def init_db():
    """Create SQLite DB and related tables if not exist."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("PRAGMA foreign_keys = ON;")

    # --- Main table ---
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
        language TEXT,
        data JSON
    );
    """)

    # --- Categories ---
    c.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
    );
    """)

    # --- Recipe ↔ Category relation ---
    c.execute("""
    CREATE TABLE IF NOT EXISTS recipe_categories (
        recipe_id TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
        FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (recipe_id, category_id)
    );
    """)

    # --- Full-Text Search table ---
    c.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS recipes_fts USING fts5(
        title,
        ingredients,
        content='recipes',
        content_rowid='rowid'
    );
    """)

    # --- FTS triggers ---
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

    # --- Indexes ---
    c.execute("CREATE INDEX IF NOT EXISTS idx_recipes_language ON recipes(language);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_recipe_categories_recipe ON recipe_categories(recipe_id);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_recipe_categories_category ON recipe_categories(category_id);")

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
    """Map Polish difficulty level to numeric (łatwy=1, średni=2, zaawansowany=3)."""
    mapping = {"łatwy": 1, "średni": 2, "zaawansowany": 3}
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
    try:
        return float(value) if value is not None else default
    except Exception:
        return default


def safe_int(value, default=0):
    try:
        return int(value) if value is not None else default
    except Exception:
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
    """Read JSON files, normalize data, and insert into SQLite DB."""
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

    for p in RECIPES_DIR.rglob("*.json"):
        try:
            # Example: recipes/pl/desserts/soups/recipes.json
            rel_parts = p.relative_to(RECIPES_DIR).parts
            language = rel_parts[0] if len(rel_parts) > 0 else "unknown"
            categories = rel_parts[1:-1]  # all dirs between language and filename

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

                    c.execute("SELECT 1 FROM recipes WHERE id = ?", (rid,))
                    exists = c.fetchone()

                    c.execute("""
                        INSERT OR REPLACE INTO recipes
                        (id, title, rating, numberOfRatings, preparationTime,
                         totalTime, numberOfPortions, difficultyLevel, language, data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, json(?))
                    """, (
                        rid,
                        r.get("title"),
                        r.get("rating"),
                        r.get("numberOfRatings"),
                        r.get("preparationTime"),
                        r.get("totalTime"),
                        r.get("numberOfPortions"),
                        r.get("difficultyLevel"),
                        language,
                        json.dumps(r, ensure_ascii=False)
                    ))

                    # Insert categories
                    for cat in categories:
                        c.execute("INSERT OR IGNORE INTO categories(name) VALUES (?)", (cat,))
                        c.execute("""
                            INSERT OR IGNORE INTO recipe_categories(recipe_id, category_id)
                            SELECT ?, id FROM categories WHERE name = ?
                        """, (rid, cat))

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


# --- Query helpers ---
def list_recipes(
    q: str = None,
    page: int = 1,
    per_page: int = 30,
    sort: str = "rating",
    desc: bool = True,
    rating_min: float = 0.0,
    rating_max: float = 5.0,
    num_ratings_min: int = 0,
    num_ratings_max: int = 100000,
    language: str = None,
    categories: List[str] = None,
    randomize: bool = False,
    seed: int = None,
) -> dict:
    """Paginated, filtered, optionally searched and sorted list of recipes."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    params = []
    joins = []
    where = ["1=1"]

    # Filters
    where.append("r.rating BETWEEN ? AND ?")
    params.extend([rating_min, rating_max])

    where.append("r.numberOfRatings BETWEEN ? AND ?")
    params.extend([num_ratings_min, num_ratings_max])

    if language:
        where.append("r.language = ?")
        params.append(language)

    if categories:
        joins.append("""
            JOIN recipe_categories rc ON rc.recipe_id = r.id
            JOIN categories c ON c.id = rc.category_id
        """)
        where.append(f"c.name IN ({','.join(['?'] * len(categories))})")
        params.extend(categories)

    # Full-text search (using subquery, no alias)
    if q:
        if not q.endswith('*'):
            q = q + '*'
        where.append("""
            r.rowid IN (
                SELECT rowid FROM recipes_fts WHERE recipes_fts MATCH ?
            )
        """)
        params.append(q)

    # Sorting
    valid_sort_keys = {
        "rating": "r.rating",
        "numberOfRatings": "r.numberOfRatings",
        "preparationTime": "r.preparationTime",
        "totalTime": "r.totalTime",
        "difficultyLevel": "r.difficultyLevel",
        "title": "r.title"
    }
    order_by = valid_sort_keys.get(sort, "r.rating")
    order_clause = f"ORDER BY {order_by} {'DESC' if desc else 'ASC'}"

    if randomize:
        if seed is not None:
            random.seed(seed)
        order_clause = "ORDER BY RANDOM()"

    offset = (page - 1) * per_page
    joins_sql = "\n".join(joins)
    where_sql = " AND ".join(where)

    # Count
    count_sql = f"""
        SELECT COUNT(DISTINCT r.id)
        FROM recipes r
        {joins_sql}
        WHERE {where_sql}
    """
    cur.execute(count_sql, params)
    total = cur.fetchone()[0]

    # Data
    query_sql = f"""
        SELECT DISTINCT r.id, r.title, r.rating, r.numberOfRatings,
                        r.preparationTime, r.totalTime, r.difficultyLevel,
                        r.language
        FROM recipes r
        {joins_sql}
        WHERE {where_sql}
        {order_clause}
        LIMIT ? OFFSET ?
    """
    cur.execute(query_sql, params + [per_page, offset])
    items = [dict(row) for row in cur.fetchall()]

    conn.close()
    return {"items": items, "total": total}


def get_recipe(rid: str) -> Dict:
    """Get one recipe by ID, including its categories."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("SELECT * FROM recipes WHERE id = ?", (rid,))
    row = cur.fetchone()
    if not row:
        conn.close()
        return None

    result = dict(row)
    if result.get("data"):
        result["data"] = json.loads(result["data"])


    cur.execute("""
        SELECT c.name
        FROM categories c
        JOIN recipe_categories rc ON rc.category_id = c.id
        WHERE rc.recipe_id = ?
    """, (rid,))
    result["categories"] = [r["name"] for r in cur.fetchall()]

    conn.close()
    return result


def search_recipes(
    q: str,
    language: str = None,
    categories: List[str] = None,
    page: int = 1,
    per_page: int = 20,
) -> dict:
    """Full-text search using FTS5 on title and ingredients, with pagination."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    where = ["fts MATCH ?"]
    params = [q]
    join_clause = "JOIN recipes_fts fts ON r.rowid = fts.rowid"

    if language:
        where.append("r.language = ?")
        params.append(language)
    if categories:
        join_clause += """
            JOIN recipe_categories rc ON rc.recipe_id = r.id
            JOIN categories c ON c.id = rc.category_id
        """
        where.append(f"c.name IN ({','.join(['?'] * len(categories))})")
        params.extend(categories)

    where_clause = "WHERE " + " AND ".join(where)
    offset = (page - 1) * per_page

    # Main query with pagination
    cur.execute(f"""
        SELECT DISTINCT r.*
        FROM recipes r
        {join_clause}
        {where_clause}
        ORDER BY r.rating DESC
        LIMIT ? OFFSET ?
    """, params + [per_page, offset])
    items = [dict(row) for row in cur.fetchall()]

    # Count total results
    cur.execute(f"""
        SELECT COUNT(DISTINCT r.id)
        FROM recipes r
        {join_clause}
        {where_clause}
    """, params)
    total = cur.fetchone()[0]

    conn.close()
    return {"items": items, "total": total}


# --- Run import automatically if DB doesn't exist ---
if not DB_PATH.exists():
    import_json_to_db()
else:
    init_db()
