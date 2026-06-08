import os
import json
from datetime import datetime, timedelta
from jose import jwt, JWTError
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from gemini import Gemini
import dotenv
from ratelimit import apply_rate_limit
from supabase import create_client, Client
from google.oauth2 import service_account
from googleapiclient.discovery import build

dotenv.load_dotenv(override=True)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    return {"username": username}

gemini_api_key = os.getenv("GEMINI_API_KEY")

if not gemini_api_key:
    raise ValueError("GEMINI_API_KEY is not set in environment variables")

ai_platform = Gemini(api_key=gemini_api_key)

ADVISORS = {
    "advisor1": {"name": "Data Dashboard Advisor", "doc_id": os.getenv("DOC_ID_ADVISOR1", "")},
    "advisor2": {"name": "SSOT Memo Advisor", "doc_id": os.getenv("DOC_ID_ADVISOR2", "")},
    "advisor3": {"name": "Data Modeling Advisor", "doc_id": os.getenv("DOC_ID_ADVISOR3", "")}
}

DOCS_SCOPES = ['https://www.googleapis.com/auth/documents.readonly']
docs_service = None

def get_docs_service():
    global docs_service
    if docs_service:
        return docs_service
        
    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if sa_json:
        try:
            creds_info = json.loads(sa_json)
            creds = service_account.Credentials.from_service_account_info(
                creds_info, scopes=DOCS_SCOPES)
            docs_service = build('docs', 'v1', credentials=creds)
            return docs_service
        except Exception as e:
            print(f"Failed to load service account from env: {e}")
            
    if os.path.exists("service_account.json"):
        creds = service_account.Credentials.from_service_account_file(
            "service_account.json", scopes=DOCS_SCOPES)
        docs_service = build('docs', 'v1', credentials=creds)
    return docs_service

def fetch_doc_text(doc_id: str) -> str:
    service = get_docs_service()
    if not service or not doc_id:
        return ""
    try:
        document = service.documents().get(documentId=doc_id).execute()
        text = ""
        for element in document.get('body').get('content'):
            if 'paragraph' in element:
                for p_element in element.get('paragraph').get('elements'):
                    if 'textRun' in p_element:
                        text += p_element.get('textRun').get('content')
        return text.strip()
    except Exception as e:
        print(f"Failed to fetch doc {doc_id}: {e}")
        return ""

def get_advisor_prompt(advisor_id: str) -> str:
    company_dna_id = os.getenv("DOC_ID_COMPANY_DNA")
    dna_text = fetch_doc_text(company_dna_id) if company_dna_id else ""
    
    # Try getting doc_id from ADVISORS, fallback to os.getenv dynamically
    safe_advisor_id = advisor_id or "advisor1"
    doc_id = ADVISORS.get(safe_advisor_id, {}).get("doc_id")
    if not doc_id:
        env_key = f"DOC_ID_{safe_advisor_id.upper()}"
        doc_id = os.getenv(env_key)
        
    advisor_text = fetch_doc_text(doc_id) if doc_id else ""
    
    if not dna_text and not advisor_text:
        return ""
        
    combined = f"{dna_text}\n\n{advisor_text}".strip()
    return combined

@app.get("/advisors")
def get_advisors():
    return ADVISORS

@app.get("/debug-docs")
def debug_docs():
    return {"prompt": get_advisor_prompt("advisor1")}

class ChatRequest(BaseModel):
    prompt: str
    chat_id: str

class ChatResponse(BaseModel):
    response: str

class ChatCreateRequest(BaseModel):
    title: str
    advisor_id: str

@app.get("/", response_class=HTMLResponse)
def root():
    with open("chat.html", "r", encoding="utf-8") as f:
        return f.read()

class GoogleAuthRequest(BaseModel):
    credential: str

@app.get("/auth/config")
def auth_config():
    return {
        "google_client_id": os.getenv("GOOGLE_CLIENT_ID")
    }

@app.post("/auth/google")
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
            print(email)
            response = supabase.table("allowed_users").select("*").eq("email", email).execute()
            if not response.data:
                raise HTTPException(status_code=403, detail="Please sign in with your EIF Google account")

        access_token = create_access_token(data={"sub": email})
        return {"access_token": access_token, "token_type": "bearer", "picture": picture}
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

@app.post("/chats")
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

@app.get("/chats")
def list_chats(current_user: dict = Depends(get_current_user)):
    if not supabase:
        return []
    response = supabase.table("chats").select("*").eq("user_email", current_user["username"]).order("created_at", desc=True).execute()
    return response.data

@app.get("/chats/{chat_id}")
def get_chat_messages(chat_id: str, current_user: dict = Depends(get_current_user)):
    if not supabase:
        return {"chat": {}, "messages": []}
    chat_resp = supabase.table("chats").select("*").eq("id", chat_id).eq("user_email", current_user["username"]).execute()
    if not chat_resp.data:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    msg_resp = supabase.table("messages").select("*").eq("chat_id", chat_id).order("created_at", desc=False).execute()
    return {"chat": chat_resp.data[0], "messages": msg_resp.data}

@app.delete("/chats/{chat_id}")
def delete_chat(chat_id: str, current_user: dict = Depends(get_current_user)):
    if not supabase:
        return {"status": "error"}
    chat_resp = supabase.table("chats").select("*").eq("id", chat_id).eq("user_email", current_user["username"]).execute()
    if not chat_resp.data:
        raise HTTPException(status_code=404, detail="Chat not found")
        
    supabase.table("chats").delete().eq("id", chat_id).execute()
    return {"status": "success"}

@app.post("/chat", response_model=ChatResponse)
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
    
    # Get full conversation
    msg_resp = supabase.table("messages").select("*").eq("chat_id", request.chat_id).order("created_at", desc=False).execute()
    history = [{"role": m["role"], "content": m["content"]} for m in msg_resp.data]
    
    advisor_id = chat_resp.data[0].get("advisor_id", "advisor1")
    live_prompt = get_advisor_prompt(advisor_id)
    
    response_txt = ai_platform.chat(history, system_prompt=live_prompt)
    
    # Save model response
    supabase.table("messages").insert({
        "chat_id": request.chat_id,
        "role": "model",
        "content": response_txt
    }).execute()
    
    return ChatResponse(response=response_txt)