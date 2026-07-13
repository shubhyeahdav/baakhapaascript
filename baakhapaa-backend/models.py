from pydantic import BaseModel
from typing import List

class UserCreate(BaseModel):
    email: str
    password: str
    name: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str = "editor"
    subscription_tier: str = "free"

class ProjectCreate(BaseModel):
    title: str
    genre: str
    tone: str
    language: str = "English"
    duration_minutes: int
    target_audience: str = "General"

class GenerateStructureRequest(BaseModel):
    genre: str
    tone: str
    duration_minutes: int
    language: str = "English"
    target_audience: str = "General"

class GenerateSceneRequest(BaseModel):
    scene_description: str
    genre: str
    tone: str
    language: str = "English"
    character_names: List[str] = []

class ImproveSceneRequest(BaseModel):
    scene_text: str
    instruction: str
    language: str = "English"

class SuggestRequest(BaseModel):
    scene_text: str
    genre: str
    tone: str

class ScriptSave(BaseModel):
    content: str

class CommentCreate(BaseModel):
    script_id: str
    content: str
    line_number: int

class CheckoutRequest(BaseModel):
    tier: str

class RecommendRequest(BaseModel):
    scene_text: str = ""
    genre: str = "Drama"
    tone: str = "Emotional"

class AddSceneRequest(BaseModel):
    script_id: str
    title: str
    description: str = ""
    act_number: int = 1
    scene_type: str = "minor"
    time_allocation: float = 0
    order_index: int = 0
