from pydantic import BaseModel
from typing import List, Dict, Optional


class RecipeSummary(BaseModel):
    id: str
    title: str
    rating: Optional[float]
    numberOfRatings: Optional[int]
    preparationTime: Optional[str]
    totalTime: Optional[str]


class Recipe(RecipeSummary):
    numberOfPortions: Optional[str]
    ingredients: Optional[List[str]]
    recipe: Optional[List[str]]
    tips: Optional[List[str]]
    usefulItems: Optional[List[str]]
    difficultyLevel: Optional[str]
    nutrition: Optional[Dict]
