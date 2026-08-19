# Finora AI
Professional personal finance dashboard using Flask + SQLite + HTML/CSS/JavaScript, with optional Google Gemini AI.

## Run on Windows
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python app.py

Open http://127.0.0.1:5000

Set GEMINI_API_KEY in .env to enable Gemini. Without it, Finora uses a safe local fallback.

All financial records are scoped to the authenticated user. New accounts start empty.
