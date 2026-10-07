import { useEffect, useRef, useState } from 'react'

type Role = 'staff' | 'student'
type User = { name: string; role: Role; department?: string; indexed: number }
type Doc = {
  id: number; file_name: string; file_type: string; uploaded_by_name: string; uploaded_by_role: string
  department: string; uploaded_at: string; status: 'uploaded' | 'processing' | 'ready' | 'failed'; error?: string; page_count?: number
}
type Src = { document_id: number; file_name: string; page: number }
type Msg = { role: 'user' | 'assistant'; text: string; grounded?: boolean; confidence?: number; sources?: Src[]; share_text?: string; threshold?: number; reason?: string }

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
  const [view, setView] = useState<'land' | 'login' | 'app'>('land')
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
    {view === 'login' && <Login role={role} back={() => setView('land')} done={u => { setUser(u); setView('app') }} />}
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
        <div className="facts"><div><b>PDF · DOCX · Image</b>accepted formats</div><div><b>On-premises</b>local model, no cloud LLM</div></div>
      </div>
      <div className="pick">
        <small>Continue as</small>
        <button className="role" onClick={() => pick('staff')}><span className="ic"><svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4m0 0L8 8m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg></span><div><b>Admin / Staff</b><span>Upload and manage official documents</span></div><span className="arr">→</span></button>
        <button className="role" onClick={() => pick('student')}><span className="ic"><svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg></span><div><b>Student</b><span>Ask questions, verify answers, share them</span></div><span className="arr">→</span></button>
      </div>
    </section>
  )
}

function Login({ role, back, done }: { role: Role; back: () => void; done: (u: User) => void }) {
  const [f, setF] = useState({ username: '', password: '' })
  const [err, setErr] = useState('')
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    try {
      const r = await call('/login', { method: 'POST', body: JSON.stringify({ ...f, role }) })
      tok = r.token; sessionStorage.setItem('t', tok); done(await call('/me'))
    } catch (x) { setErr((x as Error).message) }
  }
  return (
    <form className="login" onSubmit={go}>
      <Logo />
      <h2>{role === 'staff' ? 'Staff sign in' : 'Student sign in'}</h2>
      <p>Use the account issued by your college.</p>
      <input className="field" placeholder="Username" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} autoFocus />
      <input className="field" type="password" placeholder="Password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
      {err && <div className="err">{err}</div>}
      <button className="btn p">Sign in</button>
      <button type="button" className="link" onClick={back}>← Choose a different role</button>
    </form>
  )
}

function Side({ user, out, children }: { user: User; out: () => void; children?: React.ReactNode }) {
  return (
    <aside className="side">
      <Logo />{children}
      <div className="who"><div className="av">{user.name.slice(0, 1)}</div><div className="nm">{user.name}<br /><small style={{ color: 'var(--mute)' }}>{user.role === 'staff' ? 'Staff' : 'Student'} · {user.department}</small></div><button onClick={out}>Exit</button></div>
    </aside>
  )
}

const LAB = { uploaded: ['warn', 'Queued'], processing: ['warn', 'Processing'], ready: ['ok', 'Ready'], failed: ['bad', 'Failed'] } as const
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function Staff({ user, out }: { user: User; out: () => void }) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [hot, setHot] = useState(false)
  const pick = useRef<HTMLInputElement>(null)
  const load = () => call('/documents').then(setDocs).catch(e => notify(e.message))
  useEffect(() => { load(); const t = setInterval(load, 2500); return () => clearInterval(t) }, [])
  const upload = async (fl: FileList | null) => {
    if (!fl?.length) return
    const fd = new FormData();[...fl].forEach(f => fd.append('files', f))
    try {
      const r = await call('/documents', { method: 'POST', body: fd })
      r.filter((x: any) => x.error).forEach((x: any) => notify(`${x.file}: ${x.error}`)); load()
    } catch (e) { notify((e as Error).message) }
  }
  const n = (...s: string[]) => docs.filter(d => s.includes(d.status)).length
  return (
    <section className="view on staff-view">
      <header className="staff-header">
        <div className="staff-header-inner">
          <Logo />
          <div className="staff-user">
            <div className="av">{user.name.slice(0, 1)}</div>
            <div className="nm">
              <b>{user.name}</b>
              <small>{user.role === 'staff' ? 'Staff' : 'Student'}{user.department ? ` · ${user.department}` : ''}</small>
            </div>
            <button className="btn-exit" onClick={out} title="Sign out">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Exit</span>
            </button>
          </div>
        </div>
      </header>
      <main className="staff-main">
        <div className="staff-content">
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
            <thead><tr><th>File</th><th>Uploaded by</th><th>Date & time</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id}>
                  <td><div className="fn"><span className="ft">{d.file_type.toUpperCase()}</span><div>{d.file_name}<small>{d.page_count ? `${d.page_count} page(s)` : '—'}</small></div></div></td>
                  <td>{d.uploaded_by_name}<small>{d.uploaded_by_role} · {d.department}</small></td>
                  <td>{when(d.uploaded_at)}</td>
                  <td><span className={'chip ' + LAB[d.status][0]} title={d.error}>{LAB[d.status][1]}</span>{d.error && <small>{d.error}</small>}</td>
                  <td>
                    <button className="lnk" onClick={() => openDoc(d.id, d.file_name, false)}>View</button>
                    <button className="lnk" onClick={() => openDoc(d.id, d.file_name, true)}>Download</button>
                    {(d.status === 'failed' || d.status === 'ready') && <button className="lnk" onClick={() => call(`/documents/${d.id}/retry`, { method: 'POST' }).then(load).catch(e => notify(e.message))}>{d.status === 'failed' ? 'Retry' : 'Reprocess'}</button>}
                  </td>
                </tr>
              ))}
              {!docs.length && <tr><td colSpan={5} style={{ color: 'var(--mute)' }}>No documents yet.</td></tr>}
            </tbody>
          </table></div>
        </div>
      </main>
    </section>
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
  const end = useRef<HTMLDivElement>(null)
  const inp = useRef<HTMLInputElement>(null)
  const [idx, setIdx] = useState(user.indexed)
  const loadChats = () => { call('/me').then(u => setIdx(u.indexed)).catch(() => { }); return call('/chats').then(setChats).catch(() => { }) }
  useEffect(() => { loadChats() }, [])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])
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
      notify((e as Error).message)
    } finally {
      setBusy(false)
      inp.current?.focus()
    }
  }
  return (
    <section className="view on"><div className="shell">
      <Side user={user} out={out}>
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
      </Side>
      <div className="chatwrap">
        <div className="chead"><div style={{ minWidth: 0 }}><b>{chats.find(c => c.id === active)?.title ?? 'Ask CampusFlow'}</b><span>Answers come only from published documents</span></div>
          <span className="chip ok">{idx} document{idx === 1 ? '' : 's'} indexed</span></div>
        <div className="feed"><div className="col">
          {!msgs.length && <div className="welcome"><h3>What would you like to know?</h3><p>Ask in plain language. Every answer shows where it came from.</p></div>}
          {msgs.map((m, i) => m.role === 'user' ? <div key={i} className="msg u">{m.text}</div> : (
            <div key={i} className="msg a">
              <div className="lbl"><span>{m.grounded ? 'Answer' : 'CampusFlow'}</span>
                {m.grounded ? <span className="chip ok">Verified</span> : <span className="chip warn">No source found</span>}</div>
              <p>{m.text}</p>
              {!m.grounded && m.reason && <div className="hint">{m.reason === 'no_documents' ? 'No documents are indexed yet.'
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
        <div className="composer"><div className="box">
          <input ref={inp} value={q} disabled={busy} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} placeholder={busy ? 'CampusFlow is thinking...' : 'Ask about circulars, exams, fees…'} />
          <button className="btn p" onClick={() => ask()} disabled={busy}>{busy ? 'Thinking...' : 'Ask'}</button></div>
          <div className="note">{busy ? 'Generating answer from verified documents...' : 'Always check the source document for official confirmation.'}</div></div>
      </div>
    </div></section>
  )
}