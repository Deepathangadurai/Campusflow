import os, re, uuid, logging, hashlib, jwt
from typing import Optional
from dotenv import load_dotenv
load_dotenv()
from datetime import datetime, timedelta
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks, Header
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey, JSON, LargeBinary
from sqlalchemy import inspect as sa_inspect, text as sa_text
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from . import rag

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("campusflow")
SECRET = os.environ["JWT_SECRET"]
STORE = os.getenv("STORAGE_DIR", "./data/files"); os.makedirs(STORE, exist_ok=True)
PUBLIC = os.getenv("PUBLIC_URL", "http://localhost:5173")
EXT, MAX_BYTES = {"pdf", "jpg", "jpeg", "png", "docx", "txt"}, 25 << 20
NOT_FOUND = "I couldn't find this in the available published documents. Please check with the college office."

DB_URL = os.getenv("DATABASE_URL", "sqlite:///./data/campusflow.db")  # PostgreSQL URL also works
eng = create_engine(DB_URL, connect_args={"check_same_thread": False, "timeout": 30} if DB_URL.startswith("sqlite") else {}); Session_ = sessionmaker(eng); Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True); name = Column(String); username = Column(String, unique=True)
    pw_hash = Column(String); role = Column(String); department = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True); file_name = Column(String); file_type = Column(String)
    storage_path = Column(String); uploaded_by = Column(ForeignKey("users.id"))
    uploaded_by_name = Column(String); uploaded_by_role = Column(String); department = Column(String)
    uploaded_at = Column(DateTime, default=datetime.utcnow); status = Column(String, default="uploaded")
    error = Column(Text); page_count = Column(Integer)

class Chunk(Base):
    __tablename__ = "document_chunks"
    id = Column(Integer, primary_key=True); document_id = Column(ForeignKey("documents.id"), index=True)
    page_number = Column(Integer); text = Column(Text); embedding = Column(LargeBinary)

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(Integer, primary_key=True); student_id = Column(ForeignKey("users.id"), index=True)
    title = Column(String); created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

class Message(Base):
    __tablename__ = "chat_messages"  # meta holds sources (answer_sources), confidence, share_text
    id = Column(Integer, primary_key=True); student_id = Column(ForeignKey("users.id"), index=True)
    session_id = Column(ForeignKey("chat_sessions.id"), index=True)
    role = Column(String); text = Column(Text); meta = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

hp = lambda pw: hashlib.pbkdf2_hmac("sha256", pw.encode(), SECRET.encode(), 100_000).hex()

app = FastAPI(title="CampusFlow")
app.add_middleware(CORSMiddleware, allow_origins=[PUBLIC], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def boot():
    Base.metadata.create_all(eng)
    # upgrade older databases: add session_id and group old questions into one chat
    cols = [c["name"] for c in sa_inspect(eng).get_columns("chat_messages")]
    if "session_id" not in cols:
        with eng.begin() as c: c.execute(sa_text("ALTER TABLE chat_messages ADD COLUMN session_id INTEGER"))
    with Session_() as s:
        for (sid,) in s.query(Message.student_id).filter(Message.session_id.is_(None)).distinct().all():
            cs = ChatSession(student_id=sid, title="Earlier questions"); s.add(cs); s.flush()
            s.query(Message).filter(Message.student_id == sid, Message.session_id.is_(None)).update({"session_id": cs.id})
        s.commit()
    with Session_() as s:
        for n, u, pw, r, dep in [("Prof. Rao", "staff", os.getenv("STAFF_PASSWORD", "staff123"), "staff", "Examinations"),
                                 ("Ananya K.", "student", os.getenv("STUDENT_PASSWORD", "student123"), "student", "CSE")]:
            if not s.query(User).filter_by(username=u).first():
                s.add(User(name=n, username=u, pw_hash=hp(pw), role=r, department=dep))
        s.commit()

def db():
    s = Session_()
    try: yield s
    finally: s.close()

def current(authorization: str = Header(None), s: Session = Depends(db)):
    try: uid = int(jwt.decode((authorization or "").removeprefix("Bearer "), SECRET, algorithms=["HS256"])["sub"])
    except Exception: raise HTTPException(401, "Not authenticated")
    u = s.get(User, uid)
    if not u: raise HTTPException(401, "Not authenticated")
    return u

def staff(u: User = Depends(current)):
    if u.role != "staff": raise HTTPException(403, "Staff access only")
    return u

class Login(BaseModel): username: str; password: str; role: str
class Ask(BaseModel): question: str; session_id: Optional[int] = None

@app.post("/api/login")
def login(b: Login, s: Session = Depends(db)):
    u = s.query(User).filter_by(username=b.username).first()
    if not u or u.pw_hash != hp(b.password) or u.role != b.role:
        log.warning("failed login: %s", b.username); raise HTTPException(401, "Invalid username, password or role")
    log.info("login: %s (%s)", u.username, u.role)
    return {"token": jwt.encode({"sub": str(u.id), "exp": datetime.utcnow() + timedelta(hours=8)}, SECRET)}

@app.get("/api/me")
def me(u: User = Depends(current), s: Session = Depends(db)):
    return {"name": u.name, "role": u.role, "department": u.department,
            "indexed": s.query(Document).filter_by(status="ready").count()}

dj = lambda d: {k: getattr(d, k) for k in ("id", "file_name", "file_type", "uploaded_by_name", "uploaded_by_role",
                "department", "status", "error", "page_count")} | {"uploaded_at": d.uploaded_at.isoformat() + "Z"}

def process(doc_id: int):
    s = Session_(); d = s.get(Document, doc_id)
    try:
        d.status, d.error = "processing", None; s.commit()
        s.query(Chunk).filter_by(document_id=doc_id).delete()
        pages = rag.extract(d.storage_path, d.file_type); d.page_count = len(pages); items = []
        for n, text in enumerate(pages, 1):
            for c in rag.chunk(text):
                ch = Chunk(document_id=doc_id, page_number=n, text=c); s.add(ch); items.append(ch)
        if not items: raise ValueError("No readable text found in this document")
        for ch, v in zip(items, rag.emb([c.text for c in items])): ch.embedding = rag.to_bytes(v)
        d.status = "ready"  # searchable only after successful indexing
        log.info("indexed doc %s (%d chunks)", doc_id, len(items))
    except Exception as e:
        s.rollback(); d = s.get(Document, doc_id); d.status, d.error = "failed", str(e)[:500]
        log.exception("processing failed for doc %s", doc_id)
    finally:
        s.commit(); s.close()

@app.post("/api/documents")
async def upload(bg: BackgroundTasks, files: list[UploadFile] = File(...), u: User = Depends(staff), s: Session = Depends(db)):
    out = []
    for f in files:
        ext = f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else ""
        if ext not in EXT: out.append({"file": f.filename, "error": "Unsupported file type"}); continue
        data = await f.read()
        if len(data) > MAX_BYTES: out.append({"file": f.filename, "error": "File exceeds 25 MB"}); continue
        path = os.path.join(STORE, f"{uuid.uuid4().hex}.{ext}")
        with open(path, "wb") as fh: fh.write(data)
        d = Document(file_name=os.path.basename(f.filename), file_type=ext, storage_path=path, uploaded_by=u.id,
                     uploaded_by_name=u.name, uploaded_by_role=u.role, department=u.department)
        s.add(d); s.commit(); bg.add_task(process, d.id)
        log.info("upload: %s by %s", d.file_name, u.username); out.append(dj(d))
    return out

@app.get("/api/documents")
def documents(u: User = Depends(staff), s: Session = Depends(db)):
    return [dj(d) for d in s.query(Document).order_by(Document.id.desc())]

@app.post("/api/documents/{doc_id}/retry")
def retry(doc_id: int, bg: BackgroundTasks, u: User = Depends(staff), s: Session = Depends(db)):
    d = s.get(Document, doc_id)
    if not d or d.status in ("uploaded", "processing"): raise HTTPException(400, "Document is already being processed")
    bg.add_task(process, doc_id); return {"ok": True}

@app.get("/api/documents/{doc_id}/file")
def file(doc_id: int, download: bool = False, u: User = Depends(current), s: Session = Depends(db)):
    d = s.get(Document, doc_id)
    if not d or (u.role != "staff" and d.status != "ready"): raise HTTPException(404, "Document not found")
    log.info("file access: doc %s by %s (download=%s)", doc_id, u.username, download)
    return FileResponse(d.storage_path, filename=d.file_name,
                        content_disposition_type="attachment" if download else "inline")

@app.post("/api/chat")
def chat(b: Ask, u: User = Depends(current), s: Session = Depends(db)):
    q = b.question.strip()
    if not q: raise HTTPException(400, "Question is empty")
    cs = s.get(ChatSession, b.session_id) if b.session_id else None
    if b.session_id and (not cs or cs.student_id != u.id): raise HTTPException(404, "Chat not found")
    if not cs:
        cs = ChatSession(student_id=u.id, title=q[:48] + ("…" if len(q) > 48 else "")); s.add(cs); s.flush()
    cs.updated_at = datetime.utcnow()
    s.add(Message(student_id=u.id, session_id=cs.id, role="user", text=q, meta={}))
    rows = (s.query(Chunk.id, Chunk.text, Chunk.page_number, Chunk.embedding, Document.id.label("did"), Document.file_name)
            .join(Document, Document.id == Chunk.document_id).filter(Document.status == "ready").all())
    by = {r.id: r for r in rows}
    hits = rag.search(q, [(r.id, r.text, r.embedding, r.did) for r in rows], k=3) if rows else []
    conf = max((h[2] for h in hits), default=0.0)
    log.info("q=%r ready_chunks=%d conf=%.2f thresh=%.2f hits=%s", q, len(rows), conf, rag.THRESH, [(by[c].file_name, by[c].page_number, round(sc, 2)) for c, _, sc in hits])
    answer, meta = NOT_FOUND, {"grounded": False, "confidence": round(conf, 2), "sources": [], "threshold": rag.THRESH,
                    "reason": "low_confidence" if rows else "no_documents"}
    if hits and conf >= rag.THRESH:
        ctx = "\n\n".join(f"[{by[c].file_name}, page {by[c].page_number}] {by[c].text}" for c, _, _ in hits[:2])
        try: out = rag.llm(q, ctx)
        except Exception:
            log.exception("LLM failure"); raise HTTPException(503, "The language model is unavailable. Please try again shortly.")
        log.info("LLM replied: %r", out[:150])
        meta["reason"] = "not_in_context"
        if "NOT_FOUND" not in out:
            # Filter out common college/academic boilerplate words so they don't cause false grounding matches
            GENERIC_WORDS = {
                "department", "engineering", "technology", "dindigul", "institution", "academic",
                "autonomous", "office", "student", "students", "faculty", "following", "please",
                "circular", "members", "details", "subject", "semester", "session", "campusflow",
                "assistant", "associate", "professor", "classes", "class", "conducted", "attended",
                "regards", "according", "available", "published", "documents", "course", "college",
                "answer", "teaches", "teach", "hours", "period", "periods", "schedule", "timetable"
            }
            raw_tokens = [re.sub(r"[^a-z0-9]", "", w.lower()) for w in out.split()]
            ans_keywords = {w for w in raw_tokens if len(w) >= 3 and w not in GENERIC_WORDS and w not in rag.STOP}

            # Score each candidate chunk by exact answer keyword matches, then dense score
            scored = []
            seen_keys = set()
            for c, rrf, sc in hits:
                r = by[c]
                key = (r.file_name, r.page_number)
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                chunk_lower = r.text.lower()
                matches = sum(1 for w in ans_keywords if w in chunk_lower)
                scored.append((matches, sc, r))

            scored.sort(key=lambda x: (x[0], x[1]), reverse=True)

            srcs = []
            if scored and scored[0][0] > 0:
                top_m, top_sc, top_r = scored[0]
                srcs.append({"document_id": top_r.did, "file_name": top_r.file_name, "page": top_r.page_number, "score": round(top_sc, 2)})
            elif hits:
                top_hit = hits[0]
                r = by[top_hit[0]]
                srcs.append({"document_id": r.did, "file_name": r.file_name, "page": r.page_number, "score": round(top_hit[2], 2)})

            top = srcs[0]
            share = (f"*CampusFlow Answer*\n{out}\n\nSource: {top['file_name']}\nPage: {top['page']}\n"
                     f"Source / Download: {PUBLIC} (sign in to open)")
            answer, meta = out, {"grounded": True, "confidence": round(conf, 2), "sources": srcs, "share_text": share}
    s.add(Message(student_id=u.id, session_id=cs.id, role="assistant", text=answer, meta=meta)); s.commit()
    return {"role": "assistant", "text": answer, "session_id": cs.id, **meta}

def own_chat(chat_id: int, u: User, s: Session):
    cs = s.get(ChatSession, chat_id)
    if not cs or cs.student_id != u.id: raise HTTPException(404, "Chat not found")
    return cs

@app.get("/api/chats")
def chats(u: User = Depends(current), s: Session = Depends(db)):
    rows = s.query(ChatSession).filter_by(student_id=u.id).order_by(ChatSession.updated_at.desc()).all()
    return [{"id": c.id, "title": c.title, "updated_at": c.updated_at.isoformat() + "Z"} for c in rows]

@app.get("/api/chats/{chat_id}")
def chat_messages(chat_id: int, u: User = Depends(current), s: Session = Depends(db)):
    own_chat(chat_id, u, s)
    ms = s.query(Message).filter_by(session_id=chat_id).order_by(Message.id).all()
    return [{"role": m.role, "text": m.text, **(m.meta or {})} for m in ms]

@app.delete("/api/chats/{chat_id}")
def delete_chat(chat_id: int, u: User = Depends(current), s: Session = Depends(db)):
    cs = own_chat(chat_id, u, s)
    s.query(Message).filter_by(session_id=chat_id).delete(); s.delete(cs); s.commit()
    return {"ok": True}