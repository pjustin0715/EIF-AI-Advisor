import time
from collections import defaultdict

AUTH_RATE_LIMIT = 5
AUTH_TIME_WINDOW_SECONDS = 60

GLOBAL_RATE_LIMIT = 10
GLOBAL_TIME_WINDOW_SECONDS = 60

user_requests = defaultdict(list)

def apply_rate_limit(user_id: str):
    current_time = time.time()
    
    if user_id == "global_unauthenticated_user":
        rate_limit = GLOBAL_RATE_LIMIT
        time_window = GLOBAL_TIME_WINDOW_SECONDS
    else:
        rate_limit = AUTH_RATE_LIMIT
        time_window = AUTH_TIME_WINDOW_SECONDS
    

    user_requests[user_id] = [timestamp for timestamp in user_requests[user_id] if current_time - timestamp < time_window]

    if len(user_requests[user_id]) >= rate_limit:
        raise Exception("Rate limit exceeded. Please try again later.")
    else:
        current_usage = len(user_requests[user_id]) + 1
        print(f"User {user_id} has made {current_usage} requests in the last {time_window} seconds.")
    
    user_requests[user_id].append(current_time)
    pass