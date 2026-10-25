"""Extraction, chunking, hybrid retrieval (dense + BM25 + RRF) and Ollama call."""
import difflib, os, re, fitz, docx, requests, pytesseract
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
    """Greyscale, upscale, enhance contrast, and sharpen without assuming page orientation."""
    import PIL.ImageFilter, PIL.ImageOps
    img = pil_img.convert("L")
    nw, nh = img.size
    if nw < 1600:
        img = img.resize((nw * 2, nh * 2), Image.LANCZOS)
    # Enhance contrast (helps WhatsApp screenshots with light backgrounds)
    img = PIL.ImageOps.autocontrast(img, cutoff=1)
    img = img.filter(PIL.ImageFilter.SHARPEN)
    return img

def ocr(img):
    """Choose the page orientation with the strongest Tesseract word confidence."""
    try:
        candidates = []
        source = img.convert("L")
        for rotation in (0, 90, 270):
            oriented = source if rotation == 0 else source.rotate(rotation, expand=True)
            processed = _preprocess(oriented)
            data = pytesseract.image_to_data(
                processed, config=r"--oem 3 --psm 3", output_type=pytesseract.Output.DICT
            )
            confidence = 0.0
            readable_chars = 0
            for word, score in zip(data["text"], data["conf"]):
                chars = len(re.findall(r"[a-zA-Z0-9]", word))
                if chars:
                    confidence += chars * max(float(score), 0.0)
                    readable_chars += chars
            score = confidence / readable_chars if readable_chars else 0.0
            candidates.append((score, readable_chars, processed))
        best = max(candidates, key=lambda candidate: (candidate[0], candidate[1]))
        return pytesseract.image_to_string(best[2], config=r"--oem 3 --psm 3")
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

def correct_query(q, texts):
    """Correct close spellings against indexed words before retrieval and generation."""
    vocabulary = {word for text in texts for word in tok(text)}
    if not vocabulary:
        return q
    fuzzy_vocabulary = sorted(word for word in vocabulary if len(word) >= 5)

    def replace(match):
        word = match.group()
        normalized = stem(word.lower())
        if len(normalized) < 5 or normalized in vocabulary:
            return word
        matches = difflib.get_close_matches(normalized, fuzzy_vocabulary, n=1, cutoff=0.65)
        if not matches:
            return word
        corrected = matches[0]
        return corrected.capitalize() if word.istitle() else corrected

    return re.sub(r"[a-zA-Z0-9][a-zA-Z0-9\-/]*", replace, q)

def excerpt(text, q):
    """Keep the sentences that best match the question to reduce prompt size."""
    terms = {word for word in tok(q) if word not in STOP}
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    scored = [(len(terms & set(tok(sentence))), i, sentence)
              for i, sentence in enumerate(sentences)]
    best = max((score for score, _, _ in scored), default=0)
    if best == 0:
        return text
    selected = [(i, sentence) for score, i, sentence in scored if score == best][:2]
    return " ".join(sentence for _, sentence in selected)

def search(q, corpus, k=3, per_doc=2):
    """corpus: [(chunk_id, text, embedding_bytes, doc_id)] of READY documents.
    Dense cosine + BM25 fused with RRF. At most `per_doc` chunks per document, so one long
    document cannot crowd out the others. Returns [(chunk_id, rrf, dense_score)]."""
    q = correct_query(q, [c[1] for c in corpus])
    ids = [c[0] for c in corpus]; docs = {c[0]: c[3] for c in corpus}
    qv = np.array(emb([q])[0], dtype="float32")
    sims = np.stack([np.frombuffer(c[2], dtype="float32") for c in corpus]) @ qv
    allsim = {ids[i]: float(sims[i]) for i in range(len(ids))}
    dense = [ids[i] for i in np.argsort(-sims)[:20]]
    tokenized = [tok(c[1]) or [""] for c in corpus]
    query_tokens = tok(q)
    vocabulary = {word for document in tokenized for word in document}
    fuzzy_vocabulary = sorted(word for word in vocabulary if len(word) >= 5)
    expanded_query = list(query_tokens)
    for word in query_tokens:
        if len(word) >= 5 and word not in vocabulary:
            expanded_query.extend(difflib.get_close_matches(word, fuzzy_vocabulary, n=1, cutoff=0.82))
    sc = BM25Okapi(tokenized).get_scores(expanded_query)
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
       "provided. Match question misspellings to names in the context. For holidays shared by festivals, report the "
       "listed total dates without assigning separate days to each festival. Preserve dates and numbers exactly. "
       "If the answer is absent, reply exactly NOT_FOUND. Never invent facts. Answer in one concise sentence.")

def llm(q, ctx):
    """Call the local Ollama model for grounded text generation."""
    r = requests.post(f"{OLLAMA}/api/chat", timeout=90, json={
        "model": MODEL, "stream": False, "keep_alive": "30m",
        "options": {"temperature": 0, "num_predict": 64, "num_ctx": 2048},
        "messages": [
            {"role": "system", "content": SYS},
            {"role": "user", "content": f"Context:\n{ctx}\n\nQuestion: {q}"},
        ],
    })
    r.raise_for_status()
    return r.json()["message"]["content"].strip()

def warm_llm():
    """Load the configured Ollama model and keep it resident for upcoming questions."""
    r = requests.post(f"{OLLAMA}/api/generate", timeout=90, json={
        "model": MODEL, "prompt": " ", "stream": False, "keep_alive": "30m",
        "options": {"num_predict": 1},
    })
    r.raise_for_status()