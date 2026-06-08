import time
from collections import defaultdict
from fastapi import HTTPException

RATE_LIMIT = 10
TIME_WINDOW_SECONDS = 60

user_requests = defaultdict(list)

def apply_rate_limit(user_id: str):
    current_time = time.time()
    
    user_requests[user_id] = [timestamp for timestamp in user_requests[user_id] if current_time - timestamp < TIME_WINDOW_SECONDS]

    if len(user_requests[user_id]) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again later.")
    
    user_requests[user_id].append(current_time)