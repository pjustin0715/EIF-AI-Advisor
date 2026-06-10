# Eskwelabs AI Advisor

## 1. The Technology Stack 

* **FastAPI (Python)**: The backend web framework. It handles all the "routes" (URLs) that the frontend talks to. It is chosen for its speed and simplicity.
* **Vanilla HTML / CSS / JS**: The frontend is built without complex frameworks like React. It uses plain JavaScript (`app.js`) to manipulate the DOM, ensuring the codebase remains lightweight.
* **Google OAuth 2.0**: Handles the "Sign in with Google" button. It proves the user is who they say they are.
* **Supabase**: An open-source Firebase alternative based on PostgreSQL. We use it for two things:
  1. Checking if an email is on the `allowed_users` list.
  2. Storing `chats` (the chat sessions) and `messages` (the individual texts).
* **Google Gemini API**: The Large Language Model (LLM) that actually reads the user's prompt and generates the AI response.
* **Google Docs API**: Used to fetch the internal instructions/prompts for the AI so that non-technical staff can update the AI's behavior by just editing a Google Doc.

---

## 2. Directory Structure & File Manifest

The codebase is strictly organized into `frontend/` (what the user sees), `routers/` (the API URLs), and `services/` (the backend business logic).

```text
Eskwelabs/
├── config.py                 # Central configuration and environment variables
├── main.py                   # The entry point of the backend server
├── gemini.py                 # The wrapper class for the Google Gemini AI
├── ratelimit.py              # In-memory rate limiting logic
├── requirements.txt          # Python dependencies
├── .env                      # Secret keys and IDs (Not checked into Git)
│
├── frontend/                 # Client-Side Code
│   ├── index.html            # The structure of the web page
│   ├── css/styles.css        # The styling and minimal Claude-like layout
│   └── js/app.js             # The logic for clicking buttons, fetching APIs, etc.
│
├── routers/                  # API Endpoints (URLs)
│   ├── auth.py               # Handles /auth/google (Login)
│   └── chat.py               # Handles /chats, /chat, and /advisors (Messaging)
│
└── services/                 # Backend Business Logic
    ├── auth.py               # JWT token creation and validation
    ├── db.py                 # Supabase database initialization
    ├── docs.py               # Google Docs API fetching logic
    └── prompt.py             # Combines Google Docs into a final AI system prompt
```

### Backend Files

#### `main.py`
When you run `uvicorn main:app`, this is the file that executes. It initializes FastAPI, mounts the `frontend/` directory so the user can see the HTML, and registers the `auth` and `chat` routers.

#### `config.py`
Loads the hidden secrets from the `.env` file. It also sets up standard Python `logging` so we can record errors in the terminal. All other files import their settings from here.

#### `routers/auth.py`
Contains the endpoints for logging in.
- **`POST /auth/google`**: The frontend sends a Google Credential token here. The backend verifies it with Google, checks if the email exists in the Supabase `allowed_users` table, and if so, mints a custom JWT (JSON Web Token) and gives it to the frontend.

#### `routers/chat.py`
Contains the endpoints for messaging.
- **`POST /chats`**: Creates a new chat session in Supabase.
- **`GET /chats/{chat_id}`**: Retrieves the history of a specific chat so the user can see past messages.
- **`POST /chat`**: The core messaging route. It receives a user's text, saves it to Supabase, builds the AI prompt, asks Gemini for a response, saves Gemini's response to Supabase, and sends the text back to the frontend.

#### `services/auth.py`
Contains the math/logic for cryptography. It creates the JWT token (`create_access_token`) and validates the token (`get_current_user`) whenever a user tries to access a protected route like sending a message.

#### `services/docs.py` & `services/prompt.py`
When the AI is asked a question, it needs to know "who it is" (its System Prompt). `prompt.py` defines which Google Docs map to which Advisor. It calls `docs.py`, which securely connects to Google APIs using `service_account.json` to read the plaintext from those Google Docs. 

#### `gemini.py`
A wrapper class around the official `google-genai` Python SDK. It takes the user's message history and the system prompt, sends it to Google's servers, and returns the response string.

#### `ratelimit.py`
A custom, in-memory rate limiter. Before processing a message, it checks a dictionary to see how many messages the user has sent recently. It enforces strict Daily (100) and Monthly (1000) limits to prevent API abuse.

---

## 3. Data Flows

### Flow A: The Login Process

1. **User Action**: The user clicks the "Sign in with Google" button. The Google API handles the pop-up and returns a `credential` string to the frontend `app.js` via the `handleCredentialResponse(response)` function.
2. **Frontend `POST`**: `app.js` sends an HTTP POST request containing `{ "credential": "<TOKEN>" }` to the `/auth/google` endpoint.
3. **Route Handling (`routers/auth.py`)**: 
   - The `auth_google(request: GoogleAuthRequest)` function intercepts this request.
   - It calls `id_token.verify_oauth2_token()` from the `google.oauth2` library to validate the token mathematically with Google's servers.
4. **Database Check (`services/db.py`)**: 
   - Once verified, it extracts the `email` from the token.
   - It calls `supabase.table("allowed_users").select("*").eq("email", email).execute()` to query the PostgreSQL database.
   - If the email is NOT found, it throws a `403 HTTPException` ("Please sign in with your EIF Google account").
5. **JWT Minting (`services/auth.py`)**:
   - If allowed, it calls `create_access_token(data={"sub": email})`.
   - This function creates a dictionary with an expiration time (`exp`) and the email (`sub`), and signs it using the secret `ALGORITHM` (HS256) and `SECRET_KEY` from `config.py` using `jwt.encode()`.
6. **Frontend Storage**: The route returns the token to the frontend, where `app.js` stores it via `localStorage.setItem('token', data.access_token)`.

### Flow B: Sending a Message

1. **User Action**: The user types "Hello" and clicks send. The `sendMessage()` function in `app.js` is triggered.
2. **Frontend `POST`**: `app.js` reads the JWT token from `localStorage`, adds it to the HTTP Headers as `Authorization: Bearer <TOKEN>`, and sends a POST request with `{ "prompt": "Hello", "chat_id": "<ID>" }` to `/chat`.
3. **Authentication Middleware (`services/auth.py`)**:
   - Before the route logic runs, FastAPI triggers the `Depends(get_current_user)` dependency injection.
   - `get_current_user(token)` decodes the JWT token using `jwt.decode()`. If it's valid, it extracts the email and returns `{"username": email}` to the route function.
4. **Route Handling & Rate Limiting (`routers/chat.py` & `ratelimit.py`)**:
   - The `chat(request: ChatRequest, current_user: dict)` function begins.
   - It immediately calls `apply_rate_limit(current_user["username"])`. 
   - In `ratelimit.py`, this function counts the user's timestamps in an in-memory dictionary. If they exceed `DAILY_LIMIT`, it raises a `429 HTTPException`.
5. **Database Logging (`services/db.py`)**:
   - The backend validates the `chat_id` and then calls `supabase.table("messages").insert(...)` to save the user's "Hello" message to the database with the role `"user"`.
   - It then fetches the entire message history for this chat using `.select("*").eq("chat_id", request.chat_id).order("created_at")` so the AI has context of previous messages.
6. **Dynamic Prompt Assembly (`services/prompt.py` & `services/docs.py`)**:
   - The route calls `get_advisor_prompt(advisor_id)`.
   - `prompt.py` looks up the Google Doc IDs for both the "Company DNA" and the specific "Advisor".
   - It passes these IDs to `fetch_doc_text(doc_id)` in `docs.py`.
   - `docs.py` authenticates using the `GOOGLE_SERVICE_ACCOUNT_JSON` via `service_account.Credentials.from_service_account_info()`.
   - It calls `service.documents().get(documentId=doc_id).execute()` to pull the raw JSON from Google Docs, parses the paragraphs, and returns the concatenated plaintext string.
7. **AI Generation (`gemini.py`)**:
   - The combined prompt string and the chat history list are passed to `ai_platform.chat(messages_payload, system_prompt)`.
   - The `Gemini` class formats the history into `types.Content` objects. It formats the system prompt into a `types.GenerateContentConfig`.
   - It calls `self.client.models.generate_content(...)` and waits for Google Gemini to return a response.
8. **Final DB Save & Return (`routers/chat.py`)**:
   - The route takes the AI's response string and inserts it into the Supabase `messages` table with the role `"ai"`.
   - It returns the string as JSON back to `app.js`.
9. **Frontend Rendering (`app.js`)**:
   - `app.js` receives the text, removes the loading animation, and passes the text through `marked.parse(text)` to convert markdown syntax (like `**bold**`) into HTML tags (`<b>bold</b>`), injecting it into the DOM.
