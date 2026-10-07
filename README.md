# CampusFlow
Role-based RAG assistant. FastAPI + SQLite + in-process vector search + BM25 + Ollama; React/TypeScript/Vite UI.
No Docker, no vector-database server.

## One-time setup
1. Install **Python 3.10+**, **Node 18+**, **Ollama** (https://ollama.com) and **Tesseract OCR**
   (Windows: https://github.com/UB-Mannheim/tesseract/wiki and add it to PATH; macOS: `brew install tesseract`; Ubuntu: `sudo apt install tesseract-ocr`).
2. `ollama pull llama3.2:3b`
3. Backend:
   ```
   cd backend
   python -m venv .venv
   .venv\Scripts\activate          (macOS/Linux: source .venv/bin/activate)
   pip install -r requirements.txt
   copy ..\.env.example ..\.env    (macOS/Linux: cp ../.env.example ../.env)   then edit JWT_SECRET
   ```
   `HF_TOKEN` is optional; add your Hugging Face access token to that field in `.env` to raise download rate limits.
4. Frontend: `cd frontend && npm install`

## Run (two terminals)
- Backend (inside `backend`, venv active): `uvicorn app.main:app --reload --port 8000`
- Frontend (inside `frontend`): `npm run dev`
- Open http://localhost:5173  ·  Staff: `staff` / `staff123`  ·  Student: `student` / `student123`

The first upload downloads the MiniLM embedding model (internet needed once). Data lives in `backend/data/`.
`CONF_THRESHOLD` is the confidence gate (spec suggests 0.72; defaults to 0.35 - raise it until off-topic questions hit the fallback).
API docs: http://localhost:8000/docs
