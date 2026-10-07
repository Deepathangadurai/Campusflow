"""Extraction, chunking, hybrid retrieval (dense + BM25 + RRF) and Ollama call."""
import os, re, fitz, docx, requests, pytesseract
from io import BytesIO
from PIL import Image
from rank_bm25 import BM25Okapi
import numpy as np

OLLAMA = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
THRESH = float(os.getenv("CONF_THRESHOLD", "0.25"))  # 0.25 optimal for scanned & OCR documents
_m = None

import threading
_lock = threading.Lock()

def emb(texts):
    global _m
    with _lock:  # one thread at a time: avoids model-load races when several files are processed
        if _m is None:
            from sentence_transformers import SentenceTransformer  # lazy: keeps startup fast
            _m = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        return _m.encode(texts, normalize_embeddings=True).tolist()

to_bytes = lambda v: np.array(v, dtype="float32").tobytes()

STOP = set("a an the is are was were be to of in on for and or who what when where which how do does did can i me my we you it this that with from at by as about".split())

def stem(w):
    if w.endswith("ies") and len(w) > 4: return w[:-3] + "y"
    if w.endswith(("sses", "xes", "ches", "shes")): return w[:-2]
    if w.endswith("s") and not w.endswith("ss") and len(w) > 3: return w[:-1]
    return w

tok = lambda s: [stem(w) for w in re.findall(r"[a-z0-9][a-z0-9\-/]*", s.lower()) if w not in STOP]

for _p in [
    os.getenv("TESSERACT_CMD"),
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
]:
    if _p and os.path.exists(_p):
        pytesseract.pytesseract.tesseract_cmd = _p
        break

def _preprocess(pil_img):
    """Greyscale, auto-correct 90° landscape-in-portrait rotation, upscale, and sharpen."""
    import PIL.ImageFilter
    img = pil_img.convert("L")
    w, h = img.size
    # Landscape timetables scanned into portrait PDFs are rotated 90° CW → correct CCW
    if h > w * 1.2:
        img = img.rotate(90, expand=True)
    nw, nh = img.size
    if nw < 1600:
        img = img.resize((nw * 2, nh * 2), Image.LANCZOS)
    img = img.filter(PIL.ImageFilter.SHARPEN)
    return img

def ocr(img):
    try:
        preprocessed = _preprocess(img)
        cfg = r"--oem 3 --psm 6"
        return pytesseract.image_to_string(preprocessed, config=cfg)
    except Exception:
        return ""

_READABLE = re.compile(r"[A-Za-z0-9]{2,}")  # at least 2 alphanumeric chars → real content

def _table_rows(page):
    """Extract table rows from a PDF page, skipping garbled noise rows."""
    rows = []
    try:
        for tb in page.find_tables().tables:
            for r in tb.extract():
                cells = [(c or "").replace("\n", " ").strip() for c in r]
                joined = " | ".join(cells)
                # Only keep rows where at least 2 cells have readable text
                readable = sum(1 for c in cells if _READABLE.search(c))
                if readable >= 2:
                    rows.append(joined)
    except Exception:
        pass
    return rows

def extract(path, ext):
    """Return one text string per page."""
    if ext == "pdf":
        out = []
        with fitz.open(path) as d:
            for p in d:
                t = p.get_text().strip()
                table_rows = _table_rows(p)
                if table_rows:
                    t += "\n" + "\n".join(table_rows)
                if len(t) < 20:  # truly blank page -> render + OCR
                    raw = ocr(Image.open(BytesIO(p.get_pixmap(dpi=300).tobytes("png"))))
                    if raw.strip():
                        t = raw
                out.append(t)
        return out
    if ext in ("jpg", "jpeg", "png"):
        return [ocr(Image.open(path))]
    if ext == "docx":
        d = docx.Document(path)
        parts = [p.text for p in d.paragraphs]
        for t in d.tables:
            parts += [" | ".join(c.text for c in r.cells) for r in t.rows]
        return ["\n".join(parts)]
    return [open(path, encoding="utf-8", errors="ignore").read()]

def chunk(text, size=120, overlap=30):
    w, out, i = text.split(), [], 0
    while i < len(w):
        out.append(" ".join(w[i:i + size]))
        if i + size >= len(w): break
        i += size - overlap
    return out

def search(q, corpus, k=3, per_doc=2):
    """corpus: [(chunk_id, text, embedding_bytes, doc_id)] of READY documents.
    Dense cosine + BM25 fused with RRF. At most `per_doc` chunks per document, so one long
    document cannot crowd out the others. Returns [(chunk_id, rrf, dense_score)]."""
    ids = [c[0] for c in corpus]; docs = {c[0]: c[3] for c in corpus}
    qv = np.array(emb([q])[0], dtype="float32")
    sims = np.stack([np.frombuffer(c[2], dtype="float32") for c in corpus]) @ qv
    allsim = {ids[i]: float(sims[i]) for i in range(len(ids))}
    dense = [ids[i] for i in np.argsort(-sims)[:20]]
    sc = BM25Okapi([tok(c[1]) or [""] for c in corpus]).get_scores(tok(q))
    lex = [ids[i] for i in np.argsort(-sc)[:20] if sc[i] > 0]
    rrf = {}
    for lst in (dense, lex):
        for r, c in enumerate(lst):
            rrf[c] = rrf.get(c, 0) + 1 / (60 + r + 1)
    out, n = [], {}
    for c in sorted(rrf, key=rrf.get, reverse=True):
        if n.get(docs[c], 0) < per_doc:
            n[docs[c]] = n.get(docs[c], 0) + 1; out.append((c, rrf[c], allsim[c]))
        if len(out) == k: break
    return out

SYS = ("You are CampusFlow, a college information assistant. Answer the student's question using ONLY the context "
       "excerpts, which come from several different documents; combine them when needed. Give names, dates and numbers "
       "exactly as written. If the excerpts do not contain the answer, reply exactly NOT_FOUND. Never invent facts. Be concise.")

def llm(q, ctx):
    r = requests.post(f"{OLLAMA}/api/chat", timeout=90, json={
        "model": MODEL, "stream": False, "options": {"temperature": 0, "num_predict": 80, "num_ctx": 1024},
        "messages": [{"role": "system", "content": SYS},
                     {"role": "user", "content": f"Context:\n{ctx}\n\nQuestion: {q}"}]})
    r.raise_for_status()
    return r.json()["message"]["content"].strip()