from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any
from services.db import supabase
from services.auth import get_current_user
from services.prompt import ADVISORS, get_advisor_prompt
from gemini import Gemini
from ratelimit import apply_rate_limit
from config import GEMINI_API_KEY

router = APIRouter()
ai_platform = Gemini(api_key=GEMINI_API_KEY)

class ChatRequest(BaseModel):
    prompt: str
    chat_id: str

class ChatResponse(BaseModel):
    response: str

class ChatCreateRequest(BaseModel):
    title: str
    advisor_id: str

@router.get("/advisors")
def get_advisors():
    return ADVISORS

@router.get("/debug-docs")
def debug_docs():
    return {"prompt": get_advisor_prompt("advisor1")}

@router.post("/chats")
def create_chat(req: ChatCreateRequest, current_user: dict = Depends(get_current_user)):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")
    if req.advisor_id not in ADVISORS:
        raise HTTPException(status_code=400, detail="Invalid advisor ID")
        
    response = supabase.table("chats").insert({
        "user_email": current_user["username"],
        "title": req.title,
        "advisor_id": req.advisor_id
    }).execute()
    return response.data[0]

@router.get("/chats")
def list_chats(current_user: dict = Depends(get_current_user)):
    if not supabase:
        return []
    response = supabase.table("chats").select("*").eq("user_email", current_user["username"]).order("created_at", desc=True).execute()
    return response.data

@router.get("/chats/{chat_id}")
def get_chat_messages(chat_id: str, current_user: dict = Depends(get_current_user)):
    if not supabase:
        return {"chat": {}, "messages": []}
    chat_resp = supabase.table("chats").select("*").eq("id", chat_id).eq("user_email", current_user["username"]).execute()
    if not chat_resp.data:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    msg_resp = supabase.table("messages").select("*").eq("chat_id", chat_id).order("created_at", desc=False).execute()
    return {"chat": chat_resp.data[0], "messages": msg_resp.data}

@router.delete("/chats/{chat_id}")
def delete_chat(chat_id: str, current_user: dict = Depends(get_current_user)):
    if not supabase:
        return {"status": "error"}
    chat_resp = supabase.table("chats").select("*").eq("id", chat_id).eq("user_email", current_user["username"]).execute()
    if not chat_resp.data:
        raise HTTPException(status_code=404, detail="Chat not found")
        
    supabase.table("chats").delete().eq("id", chat_id).execute()
    return {"status": "success"}

@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest, current_user: dict = Depends(get_current_user)):
    apply_rate_limit(current_user["username"])
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")
        
    chat_resp = supabase.table("chats").select("*").eq("id", request.chat_id).eq("user_email", current_user["username"]).execute()
    if not chat_resp.data:
        raise HTTPException(status_code=404, detail="Chat not found")
        
    # Save user message
    supabase.table("messages").insert({
        "chat_id": request.chat_id,
        "role": "user",
        "content": request.prompt
    }).execute()
    
    # Retrieve chat history for context
    msg_resp = supabase.table("messages").select("*").eq("chat_id", request.chat_id).order("created_at", desc=False).execute()
    
    messages_payload = [{"role": m["role"], "content": m["content"]} for m in msg_resp.data]
    
    advisor_id = chat_resp.data[0].get("advisor_id", "advisor1")
    prompt_instructions = get_advisor_prompt(advisor_id)
    
    ai_response = ai_platform.chat(messages_payload, system_prompt=prompt_instructions)
    
    supabase.table("messages").insert({
        "chat_id": request.chat_id,
        "role": "model",
        "content": ai_response
    }).execute()
    
    return {"response": ai_response}
