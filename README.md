# EIF AI Advisor

An AI assistant built for Eskwelabs. This web application provides a conversational interface where authenticated users can interact with specialized AI Advisors (e.g., Data Dashboard Advisor, SSOT Memo Advisor, Data Modeling Advisor).

The application uses Google OAuth for secure login, Supabase for chat history and allowlisting, and Google Gemini as the core language model. The AI's context is dynamically augmented by reading prompt instructions directly from private Google Docs.

## Tech Stack
- **Frontend**: Vanilla HTML/CSS/JS (Minimalist, Eskwelabs Light Theme)
- **Backend**: Python (FastAPI)
- **Database & Auth**: Supabase, Google OAuth 2.0
- **AI Model**: Google Gemini
- **Integrations**: Google Docs API (via Service Account)
