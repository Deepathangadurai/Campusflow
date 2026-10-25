import { useEffect, useRef, useState } from 'react'

type Role = 'staff' | 'student'
type User = { name: string; role: Role; department?: string; email?: string; indexed: number }
type Doc = {
  id: number; file_name: string; file_type: string; uploaded_by_name: string; uploaded_by_role: string
  department: string; uploaded_at: string; status: 'uploaded' | 'processing' | 'ready' | 'failed'; error?: string; page_count?: number
  category?: string | null; note?: string | null
}
type Cat = { key: string; label: string; hint: string }
type Upd = { id: number; file_name: string; category: string; note: string; uploaded_at: string }
type Answer = { category: string; note: string }
const NOTE_MAX = 100
type Src = { document_id: number; file_name: string; page: number }
<<<<<<< Updated upstream
type Msg = { role: 'user' | 'assistant'; text: string; grounded?: boolean; confidence?: number; sources?: Src[]; share_text?: string; threshold?: number; reason?: string; updates?: { label: string; items: Upd[] } }
=======
type Msg = { role: 'user' | 'assistant'; text: string; grounded?: boolean; confidence?: number; sources?: Src[]; share_text?: string; threshold?: number; reason?: string }
type StudentRow = { id: number; name: string; email: string; department: string; created_at: string }
type StudentImportResult = { created: number; skipped: number; errors: { row: number; message: string }[] }
type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; isFinal: boolean }>>; resultIndex: number }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
}
>>>>>>> Stashed changes

const API = import.meta.env.VITE_API ?? '/api'
let tok = sessionStorage.getItem('t') ?? ''
let notify: (t: string) => void = () => { }

async function call(path: string, o: RequestInit = {}) {
  const h: Record<string, string> = { Authorization: 'Bearer ' + tok }
  if (!(o.body instanceof FormData)) h['Content-Type'] = 'application/json'
  const r = await fetch(API + path, { ...o, headers: h })
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || r.statusText) }
  return r.json()
}
// Files are fetched with the auth header and opened from a blob, so no token ever appears in a URL.
async function openDoc(id: number, name: string, download: boolean, page?: number) {
  try {
    const r = await fetch(`${API}/documents/${id}/file${download ? '?download=true' : ''}`, { headers: { Authorization: 'Bearer ' + tok } })
    if (!r.ok) throw new Error('Could not open the file')
    const url = URL.createObjectURL(await r.blob())
    if (download) { const a = document.createElement('a'); a.href = url; a.download = name; a.click() }
    else window.open(url + (page ? `#page=${page}` : ''), '_blank')
  } catch (e) { notify((e as Error).message) }
}

const Logo = () => (
  <div className="logo"><i><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M4 12h6l2-6 3 12 2-6h3" /></svg></i>CampusFlow</div>
)

export default function App() {
  const [view, setView] = useState<'land' | 'login' | 'register' | 'app'>('land')
  const [role, setRole] = useState<Role>('student')
  const [user, setUser] = useState<User | null>(null)
  const [toast, setToast] = useState('')
  notify = t => { setToast(t); setTimeout(() => setToast(''), 2600) }
  useEffect(() => {
    if (tok) call('/me').then(u => { setUser(u); setView('app') }).catch(() => { tok = ''; sessionStorage.removeItem('t') })
  }, [])
  const out = () => { tok = ''; sessionStorage.removeItem('t'); setUser(null); setView('land') }
  return (<>
    {view === 'land' && <Landing pick={r => { setRole(r); setView('login') }} />}
    {view === 'login' && <Login role={role} back={() => setView('land')} done={u => { setUser(u); setView('app') }}
      goRegister={() => setView('register')} />}
    {view === 'register' && <Register back={() => { setRole('staff'); setView('login') }} done={u => { setUser(u); setView('app') }} />}
    {view === 'app' && user && (user.role === 'staff' ? <Staff user={user} out={out} /> : <Student user={user} out={out} />)}
    <div className={'toast' + (toast ? ' on' : '')}>{toast}</div>
  </>)
}

function Landing({ pick }: { pick: (r: Role) => void }) {
  return (
    <section id="land" className="view on">
      <div className="hero">
        <Logo />
        <div>
          <h1>Every circular, answered with its source.</h1>
          <p>Ask about exams, fees, schedules or regulations. CampusFlow answers only from documents your college has published, and shows you exactly where to verify.</p>
        </div>
        <div className="facts"><div><b>PDF · DOCX · Image</b>accepted formats</div><div><b>AI-powered</b>instant answers</div></div>
      </div>
      <div className="pick">
        <small>Continue as</small>
        <button className="role" onClick={() => pick('staff')}><span className="ic"><svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4m0 0L8 8m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg></span><div><b>Admin / Staff</b><span>Upload and manage official documents</span></div><span className="arr">→</span></button>
        <button className="role" onClick={() => pick('student')}><span className="ic"><svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg></span><div><b>Student</b><span>Ask questions, verify answers, share them</span></div><span className="arr">→</span></button>
      </div>
    </section>
  )
}

function Login({ role, back, done, goRegister }: { role: Role; back: () => void; done: (u: User) => void; goRegister: () => void }) {
  const [f, setF] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setLoading(true)
    try {
      const r = await call('/login', { method: 'POST', body: JSON.stringify({ ...f, role }) })
      tok = r.token; sessionStorage.setItem('t', tok); done(await call('/me'))
    } catch (x) { setErr((x as Error).message) } finally { setLoading(false) }
  }
  return (
    <form className="login" onSubmit={go}>
      <Logo />
      <h2>{role === 'staff' ? 'Staff sign in' : 'Student sign in'}</h2>
      <p>{role === 'staff' ? 'Sign in to manage documents and student accounts.' : 'Sign in with credentials provided by your staff.'}</p>
      <label className="label">Email</label>
      <input className="field" type="email" placeholder="you@college.edu" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoFocus required />
      <label className="label">Password</label>
      <input className="field" type="password" placeholder="••••••••" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required />
      {err && <div className="err">{err}</div>}
      <button className="btn p" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
      {role === 'staff' && <p className="switch-text">Don't have an account? <button type="button" className="link-btn" onClick={goRegister}>Create account</button></p>}
      <button type="button" className="link" onClick={back}>← Choose a different role</button>
    </form>
  )
}

function Register({ back, done }: { back: () => void; done: (u: User) => void }) {
  const [f, setF] = useState({ name: '', department: '', email: '', password: '' })
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setLoading(true)
    try {
      const r = await call('/register', { method: 'POST', body: JSON.stringify(f) })
      tok = r.token; sessionStorage.setItem('t', tok); done(await call('/me'))
    } catch (x) { setErr((x as Error).message) } finally { setLoading(false) }
  }
  return (
    <form className="login register" onSubmit={go}>
      <Logo />
      <h2>Create staff account</h2>
      <p>Register to start uploading documents and managing students.</p>
      <label className="label">Full name</label>
      <input className="field" placeholder="Dr. Jane Smith" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoFocus required />
      <label className="label">Department</label>
      <input className="field" placeholder="e.g. Computer Science" value={f.department} onChange={e => setF({ ...f, department: e.target.value })} required />
      <label className="label">Email</label>
      <input className="field" type="email" placeholder="you@college.edu" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required />
      <label className="label">Password</label>
      <input className="field" type="password" placeholder="Min. 6 characters" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} minLength={6} required />
      {err && <div className="err">{err}</div>}
      <button className="btn p" disabled={loading}>{loading ? 'Creating account…' : 'Create account'}</button>
      <button type="button" className="link" onClick={back}>← Back to sign in</button>
    </form>
  )
}

const LAB = { uploaded: ['warn', 'Queued'], processing: ['warn', 'Processing'], ready: ['ok', 'Ready'], failed: ['bad', 'Failed'] } as const
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

<<<<<<< Updated upstream
// Questions staff answer for a document: what is it about, plus a short note (max 100 chars) students will see.
function MetaDialog({ title, action, items, cats, onCancel, onSubmit }: {
  title: string; action: string; items: { name: string; category?: string | null; note?: string | null }[]
  cats: Cat[]; onCancel: () => void; onSubmit: (a: Answer[]) => void
}) {
  const [ans, setAns] = useState<Answer[]>(items.map(i => ({ category: i.category ?? '', note: i.note ?? '' })))
  const set = (i: number, p: Partial<Answer>) => setAns(a => a.map((x, j) => j === i ? { ...x, ...p } : x))
  const ok = ans.every(a => a.category && a.note.trim())
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="modal-sub">Students see these options in their chatbot, so they know what is available.</p>
        <div className="modal-body">
          {items.map((it, i) => {
            const hint = cats.find(c => c.key === ans[i].category)?.hint ?? 'Pick a topic above, then write one line for students'
            return (
              <div key={i} className="qcard">
                <div className="qfile">{it.name}</div>
                <div className="qlabel">What is this document about?</div>
                <div className="qopts">
                  {cats.map(c => <button key={c.key} type="button" className={'qopt' + (ans[i].category === c.key ? ' on' : '')}
                    onClick={() => set(i, { category: c.key })}>{c.label}</button>)}
                </div>
                <div className="qlabel">Short note for students <span className={'qcount' + (ans[i].note.length >= NOTE_MAX ? ' full' : '')}>{ans[i].note.length}/{NOTE_MAX}</span></div>
                <input className="field" maxLength={NOTE_MAX} value={ans[i].note} placeholder={hint}
                  onChange={e => set(i, { note: e.target.value })} />
              </div>
            )
          })}
        </div>
        <div className="modal-acts">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn p" disabled={!ok} onClick={() => onSubmit(ans.map(a => ({ ...a, note: a.note.trim() })))}>{action}</button>
        </div>
      </div>
    </div>
  )
=======
function DocActionIcon({ name }: { name: 'view' | 'download' | 'reprocess' | 'delete' }) {
  const paths = {
    view: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>,
    reprocess: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
    delete: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
>>>>>>> Stashed changes
}

function Staff({ user, out }: { user: User; out: () => void }) {
  const [tab, setTab] = useState<'documents' | 'students'>('documents')
  const [docs, setDocs] = useState<Doc[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [hot, setHot] = useState(false)
  const [cats, setCats] = useState<Cat[]>([])
  const [staged, setStaged] = useState<File[]>([])       // files chosen, waiting for the staff's answers
  const [editing, setEditing] = useState<Doc | null>(null)
  const pick = useRef<HTMLInputElement>(null)
<<<<<<< Updated upstream
  const load = () => call('/documents').then(setDocs).catch(e => notify(e.message))
  useEffect(() => { load(); const t = setInterval(load, 2500); return () => clearInterval(t) }, [])
  useEffect(() => { call('/categories').then(setCats).catch(e => notify(e.message)) }, [])
  const stage = (fl: FileList | null) => { if (fl?.length) setStaged([...fl]) }
  const upload = async (answers: Answer[]) => {
    const fd = new FormData(); staged.forEach(f => fd.append('files', f)); fd.append('meta', JSON.stringify(answers))
    setStaged([])
=======
  const loadDocs = () => call('/documents').then(setDocs).catch(e => notify(e.message))
  const loadStudents = () => call('/students').then(setStudents).catch(e => notify(e.message))
  useEffect(() => { loadDocs(); loadStudents(); const t = setInterval(loadDocs, 2500); return () => clearInterval(t) }, [])
  const upload = async (fl: FileList | null) => {
    if (!fl?.length) return
    const fd = new FormData();[...fl].forEach(f => fd.append('files', f))
>>>>>>> Stashed changes
    try {
      const r = await call('/documents', { method: 'POST', body: fd })
      r.filter((x: any) => x.error).forEach((x: any) => notify(`${x.file}: ${x.error}`)); loadDocs()
    } catch (e) { notify((e as Error).message) }
  }
  const deleteStudent = async (id: number) => {
    if (!confirm('Remove this student? Their chat history will also be deleted.')) return
    try { await call(`/students/${id}`, { method: 'DELETE' }); loadStudents() } catch (e) { notify((e as Error).message) }
  }
  const deleteDocument = async (doc: Doc) => {
    if (!confirm(`Delete "${doc.file_name}"? This will permanently remove the file and its indexed content.`)) return
    try {
      await call(`/documents/${doc.id}`, { method: 'DELETE' })
      loadDocs()
      notify('Document deleted')
    } catch (e) { notify((e as Error).message) }
  }
  const reprocessDocument = async (doc: Doc) => {
    try {
      await call(`/documents/${doc.id}/retry`, { method: 'POST' })
      loadDocs()
      notify('Document queued for reprocessing')
    } catch (e) { notify((e as Error).message) }
  }
  const saveMeta = async (a: Answer[]) => {
    const d = editing; setEditing(null)
    if (!d) return
    try { await call(`/documents/${d.id}`, { method: 'PATCH', body: JSON.stringify(a[0]) }); load() } catch (e) { notify((e as Error).message) }
  }
  const catLabel = (k?: string | null) => cats.find(c => c.key === k)?.label
  const n = (...s: string[]) => docs.filter(d => s.includes(d.status)).length
  return (
    <section className="view on staff-view">
      <header className="staff-header">
        <div className="staff-header-inner">
          <Logo />
          <nav className="staff-tabs">
            <button className={'tab-btn' + (tab === 'documents' ? ' active' : '')} onClick={() => setTab('documents')}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Documents
            </button>
            <button className={'tab-btn' + (tab === 'students' ? ' active' : '')} onClick={() => setTab('students')}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Students
            </button>
          </nav>
          <div className="staff-user">
            <div className="av">{user.name.slice(0, 1)}</div>
            <div className="nm">
              <b>{user.name}</b>
              <small>{user.department}</small>
            </div>
            <button className="btn-exit" onClick={out} title="Sign out">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <main className="staff-main">
        <div className="staff-content">
<<<<<<< Updated upstream
          <div className="top">
            <p className="top-sub">Files become searchable only after indexing succeeds.</p>
            <button className="btn p" onClick={() => pick.current?.click()}>Upload documents</button>
          </div>
          <div className="stats">
            <div className="stat"><span>Total</span><b>{docs.length}</b></div><div className="stat"><span>Ready</span><b>{n('ready')}</b></div>
            <div className="stat"><span>Processing</span><b>{n('uploaded', 'processing')}</b></div><div className="stat"><span>Failed</span><b>{n('failed')}</b></div>
          </div>
          <input ref={pick} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.docx,.txt" onChange={e => { stage(e.target.files); e.target.value = '' }} />
          <div className={'drop' + (hot ? ' hot' : '')} onClick={() => pick.current?.click()}
            onDragOver={e => { e.preventDefault(); setHot(true) }} onDragLeave={() => setHot(false)}
            onDrop={e => { e.preventDefault(); setHot(false); stage(e.dataTransfer.files) }}>
            <b>Drop files here, or click to browse</b><span>PDF, scanned PDF, JPG, PNG, DOCX, TXT · up to 25 MB each</span>
          </div>
          <div className="card scroll"><table>
            <thead><tr><th>File</th><th>Uploaded by</th><th>Date & time</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id}>
                  <td><div className="fn"><span className="ft">{d.file_type.toUpperCase()}</span><div>{d.file_name}<small>{d.page_count ? `${d.page_count} page(s)` : '—'}</small>
                    {d.note && <small className="dnote"><b>{catLabel(d.category) ?? 'Other'}:</b> {d.note}</small>}</div></div></td>
                  <td>{d.uploaded_by_name}<small>{d.uploaded_by_role} · {d.department}</small></td>
                  <td>{when(d.uploaded_at)}</td>
                  <td><span className={'chip ' + LAB[d.status][0]} title={d.error}>{LAB[d.status][1]}</span>{d.error && <small>{d.error}</small>}</td>
                  <td>
                    <button className="lnk" onClick={() => openDoc(d.id, d.file_name, false)}>View</button>
                    <button className="lnk" onClick={() => openDoc(d.id, d.file_name, true)}>Download</button>
                    <button className="lnk" onClick={() => setEditing(d)}>{d.note ? 'Edit note' : 'Add note'}</button>
                    {(d.status === 'failed' || d.status === 'ready') && <button className="lnk" onClick={() => call(`/documents/${d.id}/retry`, { method: 'POST' }).then(load).catch(e => notify(e.message))}>{d.status === 'failed' ? 'Retry' : 'Reprocess'}</button>}
                  </td>
                </tr>
              ))}
              {!docs.length && <tr><td colSpan={5} style={{ color: 'var(--mute)' }}>No documents yet.</td></tr>}
            </tbody>
          </table></div>
=======
          {tab === 'documents' && <>
            <div className="top">
              <p className="top-sub">Files become searchable only after indexing succeeds.</p>
              <button className="btn p" onClick={() => pick.current?.click()}>Upload documents</button>
            </div>
            <div className="stats">
              <div className="stat"><span>Total</span><b>{docs.length}</b></div><div className="stat"><span>Ready</span><b>{n('ready')}</b></div>
              <div className="stat"><span>Processing</span><b>{n('uploaded', 'processing')}</b></div><div className="stat"><span>Failed</span><b>{n('failed')}</b></div>
            </div>
            <input ref={pick} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.docx,.txt" onChange={e => { upload(e.target.files); e.target.value = '' }} />
            <div className={'drop' + (hot ? ' hot' : '')} onClick={() => pick.current?.click()}
              onDragOver={e => { e.preventDefault(); setHot(true) }} onDragLeave={() => setHot(false)}
              onDrop={e => { e.preventDefault(); setHot(false); upload(e.dataTransfer.files) }}>
              <b>Drop files here, or click to browse</b><span>PDF, scanned PDF, JPG, PNG, DOCX, TXT · up to 25 MB each</span>
            </div>
            <div className="card scroll"><table>
              <thead><tr><th>File</th><th>Uploaded by</th><th>Date & time</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id}>
                    <td><div className="fn"><span className="ft">{d.file_type.toUpperCase()}</span><div>{d.file_name}<small>{d.page_count ? `${d.page_count} page(s)` : '—'}</small></div></div></td>
                    <td>{d.uploaded_by_name}<small>{d.uploaded_by_role} · {d.department}</small></td>
                    <td>{when(d.uploaded_at)}</td>
                    <td><span className={'chip ' + LAB[d.status][0]} title={d.error}>{LAB[d.status][1]}</span>{d.error && <small>{d.error}</small>}</td>
                    <td><div className="doc-actions">
                      <button className="icon-action" aria-label={`View ${d.file_name}`} title="View" onClick={() => openDoc(d.id, d.file_name, false)}>
                        <DocActionIcon name="view" />
                      </button>
                      <button className="icon-action" aria-label={`Download ${d.file_name}`} title="Download" onClick={() => openDoc(d.id, d.file_name, true)}>
                        <DocActionIcon name="download" />
                      </button>
                      {(d.status === 'failed' || d.status === 'ready') && <button className="icon-action" aria-label={d.status === 'failed' ? `Retry ${d.file_name}` : `Reprocess ${d.file_name}`} title={d.status === 'failed' ? 'Retry processing' : 'Reprocess'} onClick={() => reprocessDocument(d)}>
                        <DocActionIcon name="reprocess" />
                      </button>}
                      <button className="icon-action danger" aria-label={`Delete ${d.file_name}`} title={d.status === 'processing' || d.status === 'uploaded' ? 'Available after processing' : 'Delete'} disabled={d.status === 'processing' || d.status === 'uploaded'} onClick={() => deleteDocument(d)}>
                        <DocActionIcon name="delete" />
                      </button>
                    </div>
                    </td>
                  </tr>
                ))}
                {!docs.length && <tr><td colSpan={5} style={{ color: 'var(--mute)' }}>No documents yet.</td></tr>}
              </tbody>
            </table></div>
          </>}
          {tab === 'students' && <StudentManager students={students} reload={loadStudents} onDelete={deleteStudent} />}
>>>>>>> Stashed changes
        </div>
      </main>
      {!!staged.length && <MetaDialog title={staged.length > 1 ? `Tell students about these ${staged.length} documents` : 'Tell students about this document'}
        action="Upload" items={staged.map(f => ({ name: f.name }))} cats={cats} onCancel={() => setStaged([])} onSubmit={upload} />}
      {editing && <MetaDialog title="Edit note for students" action="Save" items={[{ name: editing.file_name, category: editing.category, note: editing.note }]}
        cats={cats} onCancel={() => setEditing(null)} onSubmit={saveMeta} />}
    </section>
  )
}

function StudentManager({ students, reload, onDelete }: { students: StudentRow[]; reload: () => void; onDelete: (id: number) => void }) {
  const [f, setF] = useState({ name: '', department: '', email: '', password: '' })
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [bulkFile, setBulkFile] = useState<File | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const [bulkResult, setBulkResult] = useState<StudentImportResult | null>(null)
  const bulkInput = useRef<HTMLInputElement>(null)
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setLoading(true)
    try {
      await call('/students', { method: 'POST', body: JSON.stringify(f) })
      setF({ name: '', department: '', email: '', password: '' }); setShowForm(false); reload()
      notify('Student account created')
    } catch (x) { setErr((x as Error).message) } finally { setLoading(false) }
  }
  const importBulk = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bulkFile) return
    setBulkError(''); setBulkResult(null); setBulkLoading(true)
    const form = new FormData()
    form.append('file', bulkFile)
    try {
      const result = await call('/students/import', { method: 'POST', body: form }) as StudentImportResult
      setBulkResult(result); setBulkFile(null)
      if (bulkInput.current) bulkInput.current.value = ''
      reload()
      notify(`${result.created} student account${result.created === 1 ? '' : 's'} created`)
    } catch (x) { setBulkError((x as Error).message) } finally { setBulkLoading(false) }
  }
  return (
    <div className="students-section">
      <div className="top">
        <div>
          <p className="top-sub">Manage student accounts. Students can only log in with credentials you create here.</p>
        </div>
        <button className="btn p" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ Add student manually'}</button>
      </div>
      <form className="bulk-student-import" onSubmit={importBulk}>
        <div className="bulk-import-copy">
          <span className="bulk-import-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4m0 0L8 8m4-4 4 4" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
            </svg>
          </span>
          <div>
            <div className="bulk-import-title">
              <b>Import student list</b>
              <span className="bulk-import-badge">Excel · .xlsx</span>
            </div>
            <p>One spreadsheet is all you need. Use columns <strong>Name</strong>, <strong>Department</strong>, <strong>Mail ID</strong>, and <strong>Password</strong>.</p>
            <small>Passwords must be at least 6 characters · Up to 1,000 students · 5 MB max</small>
          </div>
        </div>
        <div className="bulk-import-controls">
          <input
            ref={bulkInput}
            id="student-excel-file"
            className="bulk-file-input"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={e => { setBulkFile(e.target.files?.[0] ?? null); setBulkError(''); setBulkResult(null) }}
            required
          />
          <label className="bulk-file-picker" htmlFor="student-excel-file">
            <span className="bulk-file-name">{bulkFile?.name ?? 'Choose an Excel file'}</span>
            <span className="bulk-file-browse">{bulkFile ? 'Change file' : 'Browse'}</span>
          </label>
          <button className="btn p bulk-upload-button" disabled={bulkLoading || !bulkFile}>
            {bulkLoading ? <><span className="bulk-spinner" aria-hidden="true" />Importing…</> : 'Upload students'}
          </button>
        </div>
        {bulkError && <div className="err bulk-import-feedback" role="alert">{bulkError}</div>}
        {bulkResult && <div className="bulk-import-result bulk-import-feedback" role="status">
          <b>Import complete:</b> {bulkResult.created} created, {bulkResult.skipped} skipped.
          {bulkResult.errors.length > 0 && <ul>
            {bulkResult.errors.map(error => <li key={error.row}>Row {error.row}: {error.message}</li>)}
          </ul>}
        </div>}
      </form>
      {showForm && (
        <form className="add-student-form" onSubmit={add}>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Student name</label>
              <input className="field" placeholder="e.g. Ananya K." value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="label">Department</label>
              <input className="field" placeholder="e.g. CSE" value={f.department} onChange={e => setF({ ...f, department: e.target.value })} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Email</label>
              <input className="field" type="email" placeholder="student@college.edu" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="label">Password</label>
              <input className="field" type="password" placeholder="Min. 6 characters" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} minLength={6} required />
            </div>
          </div>
          {err && <div className="err">{err}</div>}
          <button className="btn p" disabled={loading}>{loading ? 'Creating…' : 'Create student account'}</button>
        </form>
      )}
      <div className="card scroll" style={{ marginTop: 20 }}><table>
        <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Created</th><th></th></tr></thead>
        <tbody>
          {students.map(s => (
            <tr key={s.id}>
              <td><b>{s.name}</b></td>
              <td>{s.email}</td>
              <td>{s.department}</td>
              <td>{s.created_at ? when(s.created_at) : '—'}</td>
              <td><button className="lnk bad-lnk" onClick={() => onDelete(s.id)}>Remove</button></td>
            </tr>
          ))}
          {!students.length && <tr><td colSpan={5} style={{ color: 'var(--mute)' }}>No students yet. Click "+ Add student" to create one.</td></tr>}
        </tbody>
      </table></div>
    </div>
  )
}

type Chat = { id: number; title: string; updated_at: string }
const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
const groupOf = (iso: string) => {
  const d = Math.round((dayStart(new Date()) - dayStart(new Date(iso))) / 864e5)
  return d < 1 ? 'Today' : d < 2 ? 'Yesterday' : d < 8 ? 'Previous 7 days' : 'Older'
}

function Student({ user, out }: { user: User; out: () => void }) {
  const [chats, setChats] = useState<Chat[]>([])
  const [active, setActive] = useState<number | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const inp = useRef<HTMLInputElement>(null)
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const voiceStartText = useRef('')
  const voiceHasResult = useRef(false)
  const voiceHadError = useRef(false)
  const [idx, setIdx] = useState(user.indexed)
  const [cats, setCats] = useState<Cat[]>([])
  const [upd, setUpd] = useState<Upd[]>([])
  const loadUpdates = () => call('/updates').then(setUpd).catch(() => { })
  const loadChats = () => { call('/me').then(u => setIdx(u.indexed)).catch(() => { }); loadUpdates(); return call('/chats').then(setChats).catch(() => { }) }
  useEffect(() => { call('/categories').then(setCats).catch(() => { }) }, [])
  // only topics that currently have a published document, in the order staff defined them
  const avail = cats.map(c => ({ ...c, items: upd.filter(u => u.category === c.key) })).filter(c => c.items.length)
  const showCat = (c: { label: string; items: Upd[] }) =>
    setMsgs(m => [...m, { role: 'assistant', text: '', updates: { label: c.label, items: c.items } }])
  useEffect(() => { loadChats() }, [])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])
  useEffect(() => () => recognition.current?.abort(), [])
  const toggleVoiceInput = () => {
    if (listening) {
      recognition.current?.stop()
      return
    }
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      notify('Voice input is not supported in this browser. Try Chrome or Edge.')
      return
    }
    const voice = new SpeechRecognition()
    voice.lang = navigator.language || 'en-US'
    voice.continuous = false
    voice.interimResults = true
    voiceStartText.current = q.trim()
    voiceHasResult.current = false
    voiceHadError.current = false
    setVoiceStatus('')
    voice.onresult = event => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript.trim())
        .filter(Boolean)
        .join(' ')
      if (transcript) {
        voiceHasResult.current = true
        setQ(`${voiceStartText.current}${voiceStartText.current ? ' ' : ''}${transcript}`)
      }
    }
    voice.onerror = event => {
      voiceHadError.current = true
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceStatus('Microphone access is blocked. Allow microphone access in your browser settings.')
      } else if (event.error === 'audio-capture') {
        setVoiceStatus('No microphone was found. Check that one is connected and enabled.')
      } else if (event.error === 'network') {
        setVoiceStatus('The speech recognition service could not be reached. Check your internet connection and try again.')
      } else if (event.error === 'no-speech') {
        setVoiceStatus('No speech was detected. Tap the microphone and speak clearly.')
      } else if (event.error !== 'aborted') {
        setVoiceStatus('Voice input failed. Please try again.')
      }
    }
    voice.onend = () => {
      recognition.current = null
      setListening(false)
      if (!voiceHasResult.current && !voiceHadError.current) {
        setVoiceStatus('No speech was detected. Tap the microphone and speak clearly.')
      }
    }
    recognition.current = voice
    try {
      voice.start()
      setListening(true)
    } catch {
      recognition.current = null
      setListening(false)
      notify('Could not start voice input. Please try again.')
    }
  }
  const open = async (id: number) => { try { setMsgs(await call(`/chats/${id}`)); setActive(id) } catch (e) { notify((e as Error).message) } }
  const fresh = () => { setActive(null); setMsgs([]); inp.current?.focus() }
  const del = async (id: number) => {
    try { await call(`/chats/${id}`, { method: 'DELETE' }); if (id === active) fresh(); loadChats() } catch (e) { notify((e as Error).message) }
  }
  const ask = async (t = q) => {
    t = t.trim()
    if (!t) return
    if (busy) {
      notify('Please wait, CampusFlow is generating an answer...')
      return
    }
    setQ('')
    setMsgs(m => [...m, { role: 'user', text: t }])
    setBusy(true)
    try {
      const a = await call('/chat', { method: 'POST', body: JSON.stringify({ question: t, session_id: active }) })
      setActive(a.session_id)
      setMsgs(m => [...m, a])
      loadChats()
    } catch (e) {
      const message = (e as Error).message
      notify(message)
      setMsgs(m => [...m, { role: 'assistant', text: `Could not generate an answer: ${message}`, reason: 'request_error' }])
    } finally {
      setBusy(false)
      inp.current?.focus()
    }
  }
  return (
    <section className="view on"><div className="shell">
      <aside className="side">
        <Logo />
        <button className="nav on" onClick={fresh}>+ New chat</button>
        <div className="chats">
          {!chats.length && <div className="grp" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>No chats yet</div>}
          {['Today', 'Yesterday', 'Previous 7 days', 'Older'].map(g => {
            const items = chats.filter(c => groupOf(c.updated_at) === g)
            return items.length ? (
              <div key={g}><div className="grp">{g}</div>
                {items.map(c => (
                  <div key={c.id} className={'chat' + (c.id === active ? ' on' : '')}>
                    <button className="hist" title={c.title} onClick={() => open(c.id)}>{c.title}</button>
                    <button className="del" title="Delete chat" onClick={() => del(c.id)}>×</button>
                  </div>))}
              </div>) : null
          })}
        </div>
        <div className="who">
          <div className="av">{user.name.slice(0, 1)}</div>
          <div className="nm">{user.name}<br /><small style={{ color: 'var(--mute)' }}>Student · {user.department}</small></div>
          <button className="sign-out-btn" onClick={out} title="Sign out">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>
      <div className="chatwrap">
        <div className="chead"><div style={{ minWidth: 0 }}><b>{chats.find(c => c.id === active)?.title ?? 'Ask CampusFlow'}</b><span>Answers come only from published documents</span></div>
          <span className="chip ok">{idx} document{idx === 1 ? '' : 's'} indexed</span></div>
        <div className="feed"><div className="col">
          {!msgs.length && <div className="welcome"><h3>What would you like to know?</h3><p>Ask in plain language. Every answer shows where it came from.</p>
            {!!avail.length && <><div className="sugg-title">Available right now, tap to see</div>
              <div className="sugg">{avail.map(c => <button key={c.key} onClick={() => showCat(c)}>{c.label}<span className="cnt">{c.items.length}</span></button>)}</div></>}
          </div>}
          {msgs.map((m, i) => m.role === 'user' ? <div key={i} className="msg u">{m.text}</div> : m.updates ? (
            <div key={i} className="msg a">
              <div className="lbl"><span>{m.updates.label}</span><span className="chip ok">{m.updates.items.length} available</span></div>
              {m.updates.items.map(u => (
                <div key={u.id} className="upd">
                  <p>{u.note || u.file_name}</p>
                  <div className="upd-row"><small>{u.file_name} · {when(u.uploaded_at)}</small>
                    <span><button className="lnk" onClick={() => openDoc(u.id, u.file_name, false)}>View</button>{' '}
                      <button className="lnk" onClick={() => openDoc(u.id, u.file_name, true)}>Download</button></span></div>
                </div>))}
            </div>
          ) : (
            <div key={i} className="msg a">
              <div className="lbl"><span>{m.reason === 'request_error' ? 'Request failed' : m.grounded ? 'Answer' : 'CampusFlow'}</span>
                {m.grounded ? <span className="chip ok">Verified</span> : <span className="chip warn">{m.reason === 'request_error' ? 'Error' : 'No source found'}</span>}</div>
              <p>{m.text}</p>
              {!m.grounded && m.reason && <div className="hint">{m.reason === 'request_error' ? 'Check that the backend and Ollama are running, then try again.'
                : m.reason === 'no_documents' ? 'No documents are indexed yet.'
                : m.reason === 'low_confidence' ? 'No clear answer was found in the published documents. Try a more specific question, e.g. include the subject, year or department.'
                  : 'Related text was found in documents, but did not contain the exact answer.'}</div>}
              {!!m.sources?.length && <>
                <div className="src"><small>Sources</small>
                  {m.sources.map((s, j) => <div key={j} className="srow"><b>{s.file_name}</b><span>Page {s.page}</span>
                    <span style={{ marginLeft: 'auto' }}><button className="lnk" onClick={() => openDoc(s.document_id, s.file_name, false, s.page)}>View</button>{' '}
                      <button className="lnk" onClick={() => openDoc(s.document_id, s.file_name, true)}>Download</button></span></div>)}
                </div>
                <div className="acts"><button className="btn wa" onClick={() => window.open('https://wa.me/?text=' + encodeURIComponent(m.share_text ?? m.text), '_blank')}>Share on WhatsApp</button></div>
              </>}
            </div>))}
          {busy && (
            <div className="msg a">
              <div className="lbl"><span>CampusFlow</span><span className="chip warn">Thinking...</span></div>
              <div className="dots"><i></i><i></i><i></i></div>
            </div>
          )}
          <div ref={end} />
        </div></div>
        <div className="composer">
          {!!msgs.length && !!avail.length && <div className="sugg compact">{avail.map(c => <button key={c.key} onClick={() => showCat(c)}>{c.label}<span className="cnt">{c.items.length}</span></button>)}</div>}
          <div className="box">
          <input ref={inp} value={q} disabled={busy} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} placeholder={busy ? 'CampusFlow is thinking...' : 'Ask about circulars, exams, fees…'} />
          <button type="button" className={'voice-btn' + (listening ? ' listening' : '')} onClick={toggleVoiceInput} disabled={busy} aria-label={listening ? 'Stop voice input' : 'Start voice input'} aria-pressed={listening} title={listening ? 'Stop listening' : 'Speak your question'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
            </svg>
          </button>
          <button className="btn p" onClick={() => ask()} disabled={busy}>{busy ? 'Thinking...' : 'Ask'}</button></div>
          <div className={'note' + ((listening || voiceStatus) ? ' voice-note' : '')} aria-live="polite">{listening ? 'Listening… your words will appear here as they are recognized.' : voiceStatus || (busy ? 'Generating answer from verified documents...' : 'Always check the source document for official confirmation.')}</div></div>
      </div>
    </div></section>
  )
}
