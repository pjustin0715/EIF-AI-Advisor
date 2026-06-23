import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase = create_client(url, key)

response = supabase.table("messages").select("*").order("created_at", desc=True).limit(5).execute()
print("Latest 5 messages:")
for msg in response.data:
    print(msg)
