import os
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Header
from jose import jwt, JWTError
from passlib.context import CryptContext
from dotenv import load_dotenv

from models import UserCreate, UserLogin, UserResponse
from database import supabase, get_user_by_email

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "fallback-secret")
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(prefix="/auth", tags=["auth"])


def create_token(user_id: str, email: str) -> str:
    expire = datetime.utcnow() + timedelta(days=7)
    payload = {"sub": user_id, "email": email, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@router.post("/register", response_model=UserResponse)
def register(user: UserCreate):
    existing = get_user_by_email(user.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed = pwd_context.hash(user.password)
    result = supabase.table("users").insert({
        "email": user.email,
        "name": user.name,
        "password_hash": hashed,
        "role": "editor",
        "subscription_tier": "free",
    }).execute()

    new_user = result.data[0]
    return UserResponse(
        id=new_user["id"], email=new_user["email"], name=new_user["name"],
        role=new_user["role"], subscription_tier=new_user["subscription_tier"],
    )


@router.post("/login")
def login(credentials: UserLogin):
    user = get_user_by_email(credentials.email)
    if not user or not pwd_context.verify(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(user["id"], user["email"])
    return {
        "token": token,
        "user": UserResponse(
            id=user["id"], email=user["email"], name=user["name"],
            role=user["role"], subscription_tier=user["subscription_tier"],
        ),
    }


@router.get("/me", response_model=UserResponse)
def get_me(user_id: str = Depends(get_current_user)):
    from database import get_user_by_id
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(
        id=user["id"], email=user["email"], name=user["name"],
        role=user["role"], subscription_tier=user["subscription_tier"],
    )
