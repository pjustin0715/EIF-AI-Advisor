from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import os
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from services.auth import create_access_token
from services.db import supabase

router = APIRouter(prefix="/auth")

class GoogleAuthRequest(BaseModel):
    credential: str

@router.get("/config")
def auth_config():
    return {
        "google_client_id": os.getenv("GOOGLE_CLIENT_ID")
    }

@router.post("/google")
def auth_google(request: GoogleAuthRequest):
    try:
        idinfo = id_token.verify_oauth2_token(
            request.credential, 
            google_requests.Request(), 
            os.getenv("GOOGLE_CLIENT_ID")
        )
        email = idinfo.get("email")
        picture = idinfo.get("picture")
        if not email:
            raise HTTPException(status_code=400, detail="Email not found in token")
            
        if supabase:
            from config import logger
            logger.info(f"Authenticating user: {email}")
            response = supabase.table("allowed_users").select("*").eq("email", email).execute()
            if not response.data:
                raise HTTPException(status_code=403, detail="Please sign in with your EIF Google account")

        access_token = create_access_token(data={"sub": email})
        return {"access_token": access_token, "token_type": "bearer", "picture": picture}
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")
