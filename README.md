# 🍳 Cookidone - Recipes App

A modern recipe discovery app with powerful filtering and search capabilities. Browse through recipes with smart ingredient grouping.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)

## Features

- 🔍 **Full-text search** across recipe titles and descriptions
- 🥕 **Smart ingredient filtering** - grouped ingredients (e.g., "tomato" matches tomatoes, cherry tomatoes, tomato paste, etc.)
- ⭐ **Rating & popularity filters** with custom range sliders
- 🏷️ **Category filtering** - browse by meal type, cuisine, dietary preferences
- 🌐 **Multi-language support** (English & Polish recipes)
- 📱 **Responsive design** with beautiful card-based layout
- ⚡ **Fast pagination** with 36 recipes per page

## Tech Stack

**Frontend:** React 19, Vite, react-select, react-range  
**Backend:** FastAPI, SQLite, Python 3.10+  
**Database:** 20,000+ recipes with ingredients, categories, and images (not included)

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Project Structure

```
recipes-app/
├── backend/
│   └── app/
│       ├── main.py          # FastAPI routes
│       └── data_loader.py   # Database queries
├── frontend/
│   └── src/
│       ├── components/
│       │   └── RecipeList.jsx
│       └── App.jsx
├── ingredients/
│   └── ingredients_grouped.json
├── images/
│   └── recipes/
├── recipes.db               # SQLite database
└── scripts/
    └── group_ingredients.py
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/recipes` | List recipes with filters |
| `GET /api/recipes/{id}` | Get single recipe details |
| `GET /api/ingredients` | Get grouped ingredients |
| `GET /api/categories` | List all categories |
| `GET /api/languages` | List available languages |

## License

MIT

