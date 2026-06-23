import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase = create_client(url, key)

try:
    resp = supabase.table("turn_logs").insert({
        "status": "ok"
    }).execute()
    print("turn_logs exists!")
except Exception as e:
    print(f"turn_logs error: {e}")
