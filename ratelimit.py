import time
from collections import defaultdict
from fastapi import HTTPException

# Limits
DAILY_LIMIT = 100
MONTHLY_LIMIT = 1000

# Time Windows (in seconds)
DAILY_WINDOW = 86400
MONTHLY_WINDOW = 30 * 86400

user_requests = defaultdict(list)

def apply_rate_limit(user_id: str):
    current_time = time.time()
    
    # Filter out timestamps older than the longest window (monthly)
    user_requests[user_id] = [ts for ts in user_requests[user_id] if current_time - ts < MONTHLY_WINDOW]

    timestamps = user_requests[user_id]
    
    # Count requests in each window
    monthly_count = len(timestamps)
    daily_count = sum(1 for ts in timestamps if current_time - ts < DAILY_WINDOW)

    if daily_count >= DAILY_LIMIT:
        raise HTTPException(status_code=429, detail="Daily rate limit exceeded. Please try again tomorrow.")
    if monthly_count >= MONTHLY_LIMIT:
        raise HTTPException(status_code=429, detail="Monthly rate limit exceeded.")
    
    user_requests[user_id].append(current_time)