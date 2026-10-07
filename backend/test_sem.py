import requests
import sqlite3
from app import rag

con = sqlite3.connect('data/campusflow.db')
cur = con.cursor()
rows = cur.execute('SELECT c.id, c.text, c.embedding, d.id, d.file_name, c.page_number FROM document_chunks c JOIN documents d ON d.id=c.document_id WHERE d.status="ready"').fetchall()

q = "list the faculty and subjects from the timetable"
hits = rag.search(q, [(r[0], r[1], r[2], r[3]) for r in rows])
by = {r[0]: r for r in rows}
ctx = "\n\n".join(f"[{by[c][4]}, page {by[c][5]}] {by[c][1]}" for c, _, _ in hits)

r = requests.post(f"{rag.OLLAMA}/api/chat", timeout=90, json={
    "model": rag.MODEL, "stream": False, "options": {"temperature": 0, "num_predict": 180},
    "messages": [{"role": "system", "content": "You are CampusFlow. Extract the requested information accurately from the context. If not found, reply NOT_FOUND."},
                 {"role": "user", "content": f"Context:\n{ctx}\n\nQuestion: {q}"}]})

out = r.json()["message"]["content"].strip()
print("Answer:\n", out)
