import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase = create_client(url, key)

chat_id = "0a9a95c1-cb72-443b-96b5-8b5c239ef235"

print("Trying to insert without citations...")
resp1 = supabase.table("messages").insert({
    "chat_id": chat_id,
    "role": "model",
    "content": "Test model message"
}).execute()
print("Success without citations!" if resp1.data else "Failed")

print("\nTrying to insert WITH citations...")
try:
    resp2 = supabase.table("messages").insert({
        "chat_id": chat_id,
        "role": "model",
        "content": "Test model message with citations",
        "citations": ["Citation 1"]
    }).execute()
    print("Success with citations!" if resp2.data else "Failed")
except Exception as e:
    print(f"Exception during insert: {e}")
