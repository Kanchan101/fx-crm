'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

/* ═══════════════════════════════════════════════════════════════════
   WinU.ai — Job Tracker CRM
   Kanban-style job pipeline with AI job discovery & analytics
   Persistent storage via localStorage (will migrate to Supabase)
   ═══════════════════════════════════════════════════════════════════ */

type JobStatus = 'saved' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected'
type Job = {
  id: string
  title: string
  company: string
  location: string
  salary: string
  url: string
  source: string
  status: JobStatus
  notes: string
  appliedDate: string
  interviewDate: string
  contactName: string
  contactEmail: string
  fitScore: number
  createdAt: string
  updatedAt: string
}

const COLUMNS: { key: JobStatus; label: string; color: string; icon: string }[] = [
  { key: 'saved', label: 'Saved', color: '#60a5fa', icon: '📌' },
  { key: 'applied', label: 'Applied', color: '#d4a017', icon: '📤' },
  { key: 'screening', label: 'Screening', color: '#f59e0b', icon: '📞' },
  { key: 'interview', label: 'Interview', color: '#a855f7', icon: '🎙️' },
  { key: 'offer', label: 'Offer', color: '#22c55e', icon: '🎉' },
  { key: 'rejected', label: 'Rejected', color: '#6b7280', icon: '✗' },
]

const SOURCES = ['LinkedIn', 'Naukri', 'Indeed', 'Company Website', 'Referral', 'Recruiter', 'Glassdoor', 'Instahyre', 'AngelList', 'Other']

function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5) }

// Storage helpers
function loadJobs(): Job[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('winu_jobs') || '[]') } catch { return [] }
}
function saveJobs(jobs: Job[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem('winu_jobs', JSON.stringify(jobs))
}

export default function JobTracker() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [view, setView] = useState<'board' | 'list' | 'stats'>('board')
  const [showAdd, setShowAdd] = useState(false)
  const [editJob, setEditJob] = useState<Job | null>(null)
  const [dragJob, setDragJob] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<JobStatus | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [showAiDiscover, setShowAiDiscover] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiJobs, setAiJobs] = useState<any[]>([])
  const [targetRole, setTargetRole] = useState('')
  const [targetLocation, setTargetLocation] = useState('')

  // Load on mount
  useEffect(() => { setJobs(loadJobs()) }, [])
  // Save on change
  useEffect(() => { if (jobs.length > 0) saveJobs(jobs) }, [jobs])

  // Add or update job
  const upsertJob = (job: Job) => {
    setJobs(prev => {
      const exists = prev.find(j => j.id === job.id)
      if (exists) return prev.map(j => j.id === job.id ? { ...job, updatedAt: new Date().toISOString() } : j)
      return [...prev, { ...job, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
    })
    setShowAdd(false)
    setEditJob(null)
  }

  const deleteJob = (id: string) => {
    if (confirm('Delete this job?')) setJobs(prev => prev.filter(j => j.id !== id))
  }

  const moveJob = (id: string, newStatus: JobStatus) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: newStatus, updatedAt: new Date().toISOString(), appliedDate: newStatus === 'applied' && !j.appliedDate ? new Date().toISOString().split('T')[0] : j.appliedDate } : j))
  }

  // Filter jobs
  const filtered = jobs.filter(j => {
    if (searchQuery && !j.title.toLowerCase().includes(searchQuery.toLowerCase()) && !j.company.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterSource && j.source !== filterSource) return false
    return true
  })

  // AI Job Discovery
  const discoverJobs = async () => {
    if (!targetRole.trim()) return
    setAiLoading(true)
    setAiJobs([])
    try {
      const res = await fetch('/api/optimize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3000, messages: [{ role: 'user', content: `You are a job search assistant. Find realistic job opportunities for this candidate:

Role: ${targetRole}
Location: ${targetLocation || 'India (Remote or Major Cities)'}

Generate 8 realistic job listings that this person should apply to. Mix sources: LinkedIn, Naukri, company career pages, startup boards. Include a range of company sizes (startups to MNCs).

Return ONLY JSON array:
[
  {
    "title": "Job Title",
    "company": "Company Name",
    "location": "City or Remote",
    "salary_range": "₹XL - ₹YL",
    "source": "LinkedIn/Naukri/Company/etc",
    "url": "Realistic URL to the job posting",
    "fit_reason": "Why this is a good fit (1 sentence)",
    "fit_score": 75-95,
    "posted_ago": "2 days ago / 1 week ago / etc"
  }
]` }] })
      })
      const data = await res.json()
      const raw = data.content?.[0]?.text?.replace(/```json|```/g, '').trim() || '[]'
      const lb = raw.lastIndexOf(']')
      setAiJobs(JSON.parse(raw.substring(0, lb + 1)))
    } catch { }
    setAiLoading(false)
  }

  const addDiscoveredJob = (aj: any) => {
    const job: Job = {
      id: generateId(), title: aj.title, company: aj.company, location: aj.location,
      salary: aj.salary_range || '', url: aj.url || '', source: aj.source || 'AI Discovery',
      status: 'saved', notes: aj.fit_reason || '', appliedDate: '', interviewDate: '',
      contactName: '', contactEmail: '', fitScore: aj.fit_score || 80,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }
    upsertJob(job)
  }

  // Stats
  const stats = {
    total: jobs.length,
    saved: jobs.filter(j => j.status === 'saved').length,
    applied: jobs.filter(j => j.status === 'applied').length,
    screening: jobs.filter(j => j.status === 'screening').length,
    interview: jobs.filter(j => j.status === 'interview').length,
    offer: jobs.filter(j => j.status === 'offer').length,
    rejected: jobs.filter(j => j.status === 'rejected').length,
    responseRate: jobs.filter(j => j.status === 'applied').length > 0
      ? Math.round((jobs.filter(j => ['screening', 'interview', 'offer'].includes(j.status)).length / jobs.filter(j => j.status !== 'saved').length) * 100)
      : 0,
    topSources: SOURCES.map(s => ({ source: s, count: jobs.filter(j => j.source === s).length })).filter(s => s.count > 0).sort((a, b) => b.count - a.count),
    thisWeek: jobs.filter(j => { const d = new Date(j.createdAt); const now = new Date(); return (now.getTime() - d.getTime()) < 7 * 86400000 }).length,
  }

  const S = {
    inp: { width: '100%', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', fontSize: '13px', fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#f0ece4', background: 'rgba(255,255,255,0.03)', outline: 'none' } as React.CSSProperties,
    lbl: { fontSize: '10px', fontWeight: 600, color: 'rgba(240,236,228,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: '4px', display: 'block' } as React.CSSProperties,
    card: { background: '#16161f', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px' } as React.CSSProperties,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#f0ece4', fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder, textarea::placeholder, select { color: rgba(240,236,228,0.2); }
        select option { background: #16161f; color: #f0ece4; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>

      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(16px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <a href="/" style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '20px', color: '#f0ece4', textDecoration: 'none' }}>Win<span style={{ color: '#d4a017' }}>U</span>.ai</a>
          <span style={{ fontSize: '12px', color: 'rgba(240,236,228,0.2)' }}>|</span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(240,236,228,0.5)' }}>Job Tracker</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* View toggles */}
          {(['board', 'list', 'stats'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', textTransform: 'uppercase' as const, letterSpacing: '0.04em',
              background: view === v ? 'rgba(212,160,23,0.1)' : 'transparent',
              color: view === v ? '#d4a017' : 'rgba(240,236,228,0.3)',
            }}>{v === 'board' ? '📋 Board' : v === 'list' ? '📄 List' : '📊 Stats'}</button>
          ))}
          <button onClick={() => setShowAiDiscover(true)} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, border: '1px solid rgba(168,85,247,0.2)', cursor: 'pointer', fontFamily: 'inherit', background: 'rgba(168,85,247,0.06)', color: '#a855f7' }}>
            🤖 AI Discover
          </button>
          <button onClick={() => { setEditJob(null); setShowAdd(true) }} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: '#d4a017', color: '#0a0a0f' }}>
            + Add Job
          </button>
        </div>
      </nav>

      {/* Search + Filter bar */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' as const }}>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search jobs by title or company..." style={{ ...S.inp, paddingLeft: '32px' }} />
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', opacity: 0.3 }}>🔍</span>
        </div>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={{ ...S.inp, width: '160px', cursor: 'pointer' }}>
          <option value="">All sources</option>
          {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ fontSize: '12px', color: 'rgba(240,236,228,0.25)' }}>{filtered.length} jobs</div>
      </div>

      {/* Quick stats bar */}
      <div style={{ padding: '10px 24px', display: 'flex', gap: '16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {COLUMNS.map(col => {
          const count = filtered.filter(j => j.status === col.key).length
          return (
            <div key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: col.color }} />
              <span style={{ color: 'rgba(240,236,228,0.35)' }}>{col.label}</span>
              <span style={{ fontWeight: 700, color: col.color }}>{count}</span>
            </div>
          )
        })}
        {stats.responseRate > 0 && (
          <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#22c55e', fontWeight: 600 }}>
            {stats.responseRate}% response rate
          </div>
        )}
      </div>

      {/* ═══ BOARD VIEW ═════════════════════════════════════ */}
      {view === 'board' && (
        <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: `repeat(${COLUMNS.length}, 1fr)`, gap: '12px', minHeight: 'calc(100vh - 160px)' }}>
          {COLUMNS.map(col => (
            <div key={col.key}
              onDragOver={e => { e.preventDefault(); setDragOver(col.key) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => { if (dragJob) { moveJob(dragJob, col.key); setDragJob(null); setDragOver(null) } }}
              style={{ background: dragOver === col.key ? 'rgba(255,255,255,0.02)' : 'transparent', borderRadius: '12px', padding: '8px', transition: 'background 0.2s', border: dragOver === col.key ? `1px dashed ${col.color}40` : '1px solid transparent' }}
            >
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px' }}>{col.icon}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: col.color }}>{col.label}</span>
                <span style={{ fontSize: '10px', color: 'rgba(240,236,228,0.2)', background: 'rgba(255,255,255,0.04)', padding: '1px 6px', borderRadius: '4px', marginLeft: '4px' }}>
                  {filtered.filter(j => j.status === col.key).length}
                </span>
              </div>

              {/* Job cards */}
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto', paddingRight: '4px' }}>
                {filtered.filter(j => j.status === col.key).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map(job => (
                  <div key={job.id} draggable
                    onDragStart={() => setDragJob(job.id)}
                    onDragEnd={() => { setDragJob(null); setDragOver(null) }}
                    onClick={() => { setEditJob(job); setShowAdd(true) }}
                    style={{
                      ...S.card, cursor: 'grab', animation: 'fadeUp 0.3s ease', transition: 'all 0.15s',
                      opacity: dragJob === job.id ? 0.4 : 1,
                      borderLeft: `3px solid ${col.color}`,
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#f0ece4', marginBottom: '3px', lineHeight: 1.3 }}>{job.title}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(240,236,228,0.4)', marginBottom: '6px' }}>{job.company}{job.location ? ` · ${job.location}` : ''}</div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' as const }}>
                      {job.source && <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', color: 'rgba(240,236,228,0.3)' }}>{job.source}</span>}
                      {job.salary && <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(34,197,94,0.06)', color: '#22c55e' }}>{job.salary}</span>}
                      {job.fitScore > 0 && <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(212,160,23,0.08)', color: '#d4a017' }}>{job.fitScore}% fit</span>}
                      {job.interviewDate && <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(168,85,247,0.08)', color: '#a855f7' }}>📅 {job.interviewDate}</span>}
                    </div>
                  </div>
                ))}

                {filtered.filter(j => j.status === col.key).length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', fontSize: '11px', color: 'rgba(240,236,228,0.15)', border: '1px dashed rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                    Drag jobs here
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ LIST VIEW ══════════════════════════════════════ */}
      {view === 'list' && (
        <div style={{ padding: '16px 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Job Title', 'Company', 'Location', 'Status', 'Source', 'Salary', 'Applied', 'Fit'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 8px', fontSize: '10px', fontWeight: 600, color: 'rgba(240,236,228,0.3)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map(job => {
                const col = COLUMNS.find(c => c.key === job.status)!
                return (
                  <tr key={job.id} onClick={() => { setEditJob(job); setShowAdd(true) }} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                    <td style={{ padding: '10px 8px', fontSize: '13px', fontWeight: 600 }}>{job.title}</td>
                    <td style={{ padding: '10px 8px', fontSize: '12px', color: 'rgba(240,236,228,0.5)' }}>{job.company}</td>
                    <td style={{ padding: '10px 8px', fontSize: '12px', color: 'rgba(240,236,228,0.35)' }}>{job.location || '—'}</td>
                    <td style={{ padding: '10px 8px' }}><span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '6px', background: `${col.color}15`, color: col.color, fontWeight: 600 }}>{col.icon} {col.label}</span></td>
                    <td style={{ padding: '10px 8px', fontSize: '11px', color: 'rgba(240,236,228,0.3)' }}>{job.source || '—'}</td>
                    <td style={{ padding: '10px 8px', fontSize: '11px', color: '#22c55e' }}>{job.salary || '—'}</td>
                    <td style={{ padding: '10px 8px', fontSize: '11px', color: 'rgba(240,236,228,0.3)' }}>{job.appliedDate || '—'}</td>
                    <td style={{ padding: '10px 8px', fontSize: '11px', color: '#d4a017', fontWeight: 600 }}>{job.fitScore ? `${job.fitScore}%` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div style={{ padding: '60px', textAlign: 'center', fontSize: '14px', color: 'rgba(240,236,228,0.2)' }}>No jobs tracked yet. Click "+ Add Job" to start.</div>}
        </div>
      )}

      {/* ═══ STATS VIEW ═════════════════════════════════════ */}
      {view === 'stats' && (
        <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '24px', marginBottom: '24px' }}>Pipeline Analytics</div>

          {/* Funnel */}
          <div style={{ ...S.card, marginBottom: '16px', padding: '24px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>📊 Conversion Funnel</div>
            {COLUMNS.filter(c => c.key !== 'rejected').map((col, i) => {
              const count = jobs.filter(j => j.status === col.key).length
              const maxCount = Math.max(...COLUMNS.map(c => jobs.filter(j => j.status === c.key).length), 1)
              return (
                <div key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <div style={{ width: '80px', fontSize: '11px', color: 'rgba(240,236,228,0.4)', textAlign: 'right' as const }}>{col.icon} {col.label}</div>
                  <div style={{ flex: 1, height: '24px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(count / maxCount) * 100}%`, background: col.color, borderRadius: '6px', transition: 'width 0.8s ease', display: 'flex', alignItems: 'center', paddingLeft: '8px', fontSize: '11px', fontWeight: 700, color: '#0a0a0f', minWidth: count > 0 ? '30px' : '0' }}>
                      {count > 0 ? count : ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Key metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Total Jobs', value: stats.total, color: '#f0ece4' },
              { label: 'Response Rate', value: `${stats.responseRate}%`, color: stats.responseRate > 30 ? '#22c55e' : '#f59e0b' },
              { label: 'This Week', value: stats.thisWeek, color: '#60a5fa' },
              { label: 'Interviews', value: stats.interview, color: '#a855f7' },
            ].map((m, i) => (
              <div key={i} style={{ ...S.card, textAlign: 'center', padding: '18px' }}>
                <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '28px', color: m.color as string }}>{m.value}</div>
                <div style={{ fontSize: '10px', color: 'rgba(240,236,228,0.3)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginTop: '4px' }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Source breakdown */}
          {stats.topSources.length > 0 && (
            <div style={{ ...S.card, padding: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '14px' }}>📍 Applications by Source</div>
              {stats.topSources.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ width: '100px', fontSize: '12px', color: 'rgba(240,236,228,0.5)' }}>{s.source}</div>
                  <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(s.count / (stats.topSources[0]?.count || 1)) * 100}%`, background: '#d4a017', borderRadius: '3px' }} />
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#d4a017', width: '30px', textAlign: 'right' as const }}>{s.count}</div>
                </div>
              ))}
            </div>
          )}

          {jobs.length === 0 && <div style={{ padding: '60px', textAlign: 'center', fontSize: '14px', color: 'rgba(240,236,228,0.2)' }}>Start adding jobs to see analytics</div>}
        </div>
      )}

      {/* ═══ ADD/EDIT MODAL ═════════════════════════════════ */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => { setShowAdd(false); setEditJob(null) }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#16161f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '28px', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto', animation: 'fadeUp 0.3s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '20px' }}>{editJob ? 'Edit Job' : 'Add Job'}</div>
              <button onClick={() => { setShowAdd(false); setEditJob(null) }} style={{ background: 'none', border: 'none', color: 'rgba(240,236,228,0.3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            <JobForm job={editJob} onSave={upsertJob} onDelete={editJob ? () => deleteJob(editJob.id) : undefined} styles={S} />
          </div>
        </div>
      )}

      {/* ═══ AI DISCOVER MODAL ══════════════════════════════ */}
      {showAiDiscover && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setShowAiDiscover(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#16161f', border: '1px solid rgba(168,85,247,0.15)', borderRadius: '20px', padding: '28px', maxWidth: '600px', width: '100%', maxHeight: '85vh', overflowY: 'auto', animation: 'fadeUp 0.3s ease' }}>
            <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '20px', marginBottom: '4px' }}>🤖 AI Job Discovery</div>
            <div style={{ fontSize: '13px', color: 'rgba(240,236,228,0.4)', marginBottom: '20px' }}>AI finds relevant job openings matching your profile</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div><label style={S.lbl}>Target Role</label><input value={targetRole} onChange={e => setTargetRole(e.target.value)} placeholder="e.g. Product Manager" style={S.inp} /></div>
              <div><label style={S.lbl}>Location</label><input value={targetLocation} onChange={e => setTargetLocation(e.target.value)} placeholder="e.g. Bangalore, Remote" style={S.inp} /></div>
            </div>

            <button onClick={discoverJobs} disabled={aiLoading} style={{ width: '100%', padding: '12px', background: aiLoading ? 'rgba(168,85,247,0.2)' : '#a855f7', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: '16px' }}>
              {aiLoading ? '🔍 Searching...' : '🤖 Find Jobs for Me'}
            </button>

            {aiJobs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
                {aiJobs.map((aj, i) => (
                  <div key={i} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{aj.title}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(240,236,228,0.4)' }}>{aj.company} · {aj.location}</div>
                      <div style={{ fontSize: '10px', color: 'rgba(240,236,228,0.25)', marginTop: '2px' }}>{aj.fit_reason}</div>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                        <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(34,197,94,0.06)', color: '#22c55e' }}>{aj.salary_range}</span>
                        <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(240,236,228,0.04)', color: 'rgba(240,236,228,0.3)' }}>{aj.source}</span>
                        <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(212,160,23,0.08)', color: '#d4a017' }}>{aj.fit_score}% fit</span>
                      </div>
                    </div>
                    <button onClick={() => addDiscoveredJob(aj)} style={{ padding: '6px 12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: '8px', fontSize: '11px', fontWeight: 600, color: '#22c55e', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}>
                      + Save
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Job Form Component ──────────────────────────────────────── */
function JobForm({ job, onSave, onDelete, styles: S }: { job: Job | null; onSave: (j: Job) => void; onDelete?: () => void; styles: any }) {
  const [form, setForm] = useState<Job>(job || {
    id: generateId(), title: '', company: '', location: '', salary: '', url: '', source: '',
    status: 'saved', notes: '', appliedDate: '', interviewDate: '', contactName: '', contactEmail: '',
    fitScore: 0, createdAt: '', updatedAt: ''
  })

  const set = (k: keyof Job, v: string | number) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div><label style={S.lbl}>Job Title *</label><input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Senior Product Manager" style={S.inp} /></div>
        <div><label style={S.lbl}>Company *</label><input value={form.company} onChange={e => set('company', e.target.value)} placeholder="Google" style={S.inp} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div><label style={S.lbl}>Location</label><input value={form.location} onChange={e => set('location', e.target.value)} placeholder="Bangalore / Remote" style={S.inp} /></div>
        <div><label style={S.lbl}>Salary Range</label><input value={form.salary} onChange={e => set('salary', e.target.value)} placeholder="₹25L - ₹35L" style={S.inp} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={S.lbl}>Source</label>
          <select value={form.source} onChange={e => set('source', e.target.value)} style={{ ...S.inp, cursor: 'pointer' }}>
            <option value="">Select source</option>
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={S.lbl}>Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} style={{ ...S.inp, cursor: 'pointer' }}>
            {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
          </select>
        </div>
      </div>
      <div><label style={S.lbl}>Job URL</label><input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://linkedin.com/jobs/..." style={S.inp} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div><label style={S.lbl}>Applied Date</label><input type="date" value={form.appliedDate} onChange={e => set('appliedDate', e.target.value)} style={S.inp} /></div>
        <div><label style={S.lbl}>Interview Date</label><input type="date" value={form.interviewDate} onChange={e => set('interviewDate', e.target.value)} style={S.inp} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div><label style={S.lbl}>Contact Name</label><input value={form.contactName} onChange={e => set('contactName', e.target.value)} placeholder="Recruiter name" style={S.inp} /></div>
        <div><label style={S.lbl}>Contact Email</label><input value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} placeholder="recruiter@company.com" style={S.inp} /></div>
      </div>
      <div><label style={S.lbl}>Notes</label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Any notes about this opportunity..." style={{ ...S.inp, resize: 'vertical' as const }} /></div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
        <button onClick={() => onSave(form)} disabled={!form.title.trim() || !form.company.trim()} style={{
          flex: 1, padding: '12px', background: '#d4a017', color: '#0a0a0f', border: 'none', borderRadius: '10px',
          fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          opacity: !form.title.trim() || !form.company.trim() ? 0.4 : 1,
        }}>
          {job ? 'Update Job' : 'Save Job'}
        </button>
        {onDelete && (
          <button onClick={onDelete} style={{ padding: '12px 20px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '10px', fontSize: '13px', fontWeight: 600, color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
