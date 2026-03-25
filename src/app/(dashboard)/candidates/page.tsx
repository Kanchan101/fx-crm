'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import {
  Users, Plus, Search, Upload, FileText, X, AlertCircle, Sparkles,
  MapPin, Phone, Mail, Briefcase, ChevronDown, Eye, Check,
  Loader2, ChevronRight, Star,
} from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Candidate {
  id: string; name: string; email: string; phone: string; location: string;
  experience_years: number; skills: string; current_role: string; current_company: string;
  education: string; owner_name: string; pipeline_count: number; pipeline_statuses: string;
  mapped_positions: string; created_at: string;
  assessment_soft_skills: number; assessment_stability: number;
  assessment_technical: number; assessment_experience: number;
}

interface Requirement {
  id: string; title: string; client_name: string; location: string; ctc_min: number; ctc_max: number;
}

const emptyForm = {
  name: '', email: '', phone: '', location: '', experience_years: '',
  skills: '', current_role: '', current_company: '', education: '',
  current_ctc_fixed: '', current_ctc_variable: '', expected_ctc_fixed: '', expected_ctc_variable: '',
  notice_period: '', last_working_day: '', holding_offer: false, holding_offer_details: '',
  referral_name: '', referral_phone: '', referral_bonus_eligible: false,
  assessment_soft_skills: '', assessment_stability: '', assessment_technical: '', assessment_experience: '',
  job_id: '', cv_text: '',
};

export default function CandidatesPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // CV parsing state
  const [cvStep, setCvStep] = useState<'upload' | 'parsing' | 'form'>('upload');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvParsing, setCvParsing] = useState(false);
  const [cvRawText, setCvRawText] = useState('');

  // JD matching state
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<any>(null);

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  const fetchCandidates = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (ownerFilter === 'mine') params.set('owner', 'mine');
      const res = await fetch(`${API}/api/candidates?${params}`, { headers: headers() });
      const data = await res.json();
      setCandidates(data.candidates || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, ownerFilter]);

  const fetchRequirements = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/requirements?status=Open`, { headers: headers() });
      const data = await res.json();
      setRequirements(data.requirements || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);
  useEffect(() => { fetchRequirements(); }, [fetchRequirements]);

  const openAddModal = () => {
    setForm(emptyForm);
    setCvStep('upload');
    setCvFile(null);
    setCvRawText('');
    setMatchResult(null);
    setError('');
    setShowModal(true);
  };

  // Handle CV file drop/select
  const handleCvFile = async (file: File) => {
    setCvFile(file);
    setCvStep('parsing');
    setCvParsing(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('cv', file);

      const res = await fetch(`${API}/api/candidates/parse-cv`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Parse failed');

      const p = data.parsed || {};
      setCvRawText(data.raw_text || '');
      setForm(f => ({
        ...f,
        name: p.name || f.name,
        email: p.email || f.email,
        phone: (p.phone || '').replace(/\D/g, '').slice(-10) || f.phone,
        location: p.location || f.location,
        experience_years: p.experience_years ? String(p.experience_years) : f.experience_years,
        skills: p.skills || f.skills,
        current_role: p.current_role || f.current_role,
        current_company: p.current_company || f.current_company,
        education: p.education || f.education,
        cv_text: data.raw_text || '',
      }));
      setCvStep('form');
    } catch (err: any) {
      setError(err.message);
      setCvStep('upload');
    } finally {
      setCvParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleCvFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCvFile(file);
  };

  // JD Matching
  const handleMatch = async () => {
    if (!form.job_id || !form.cv_text) return;
    setMatching(true);
    setMatchResult(null);
    try {
      const res = await fetch(`${API}/api/candidates/match`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ cv_text: form.cv_text, job_id: form.job_id }),
      });
      const data = await res.json();
      setMatchResult(data);
    } catch (err) { console.error(err); }
    finally { setMatching(false); }
  };

  // Save candidate
  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        experience_years: parseFloat(form.experience_years) || null,
        current_ctc_fixed: parseFloat(form.current_ctc_fixed) || null,
        current_ctc_variable: parseFloat(form.current_ctc_variable) || null,
        expected_ctc_fixed: parseFloat(form.expected_ctc_fixed) || null,
        expected_ctc_variable: parseFloat(form.expected_ctc_variable) || null,
        assessment_soft_skills: parseInt(form.assessment_soft_skills) || null,
        assessment_stability: parseInt(form.assessment_stability) || null,
        assessment_technical: parseInt(form.assessment_technical) || null,
        assessment_experience: parseInt(form.assessment_experience) || null,
        ai_match_percent: matchResult?.match_percent || null,
        ai_match_details: matchResult || null,
      };
      const res = await fetch(`${API}/api/candidates`, {
        method: 'POST', headers: headers(), body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setShowModal(false);
      fetchCandidates();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const avgScore = (c: Candidate) => {
    const s = [c.assessment_soft_skills, c.assessment_stability, c.assessment_technical, c.assessment_experience].filter(Boolean);
    return s.length > 0 ? (s.reduce((a, b) => a + b, 0) / s.length).toFixed(1) : null;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{candidates.length} candidate{candidates.length !== 1 ? 's' : ''}</p>
        <button onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-fx-600 hover:bg-fx-700 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Add Candidate
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, skills..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
        </div>
        <button onClick={() => setOwnerFilter(ownerFilter === 'mine' ? 'all' : 'mine')}
          className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
            ownerFilter === 'mine' ? 'bg-fx-600 text-white border-fx-600' : 'bg-white text-gray-600 border-gray-200')}>
          {ownerFilter === 'mine' ? 'My Candidates' : 'All Candidates'}
        </button>
      </div>

      {/* Candidate list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No candidates yet</p>
          <p className="text-gray-400 text-xs mt-1">Upload a CV to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-100 hover:shadow-md transition-shadow overflow-hidden">
              <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                <div className="w-10 h-10 rounded-full bg-violet-50 text-violet-700 flex items-center justify-center text-sm font-semibold shrink-0">
                  {c.name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{c.name}</h3>
                    {c.pipeline_count > 0 && (
                      <span className="badge badge-open">{c.pipeline_count} position{c.pipeline_count > 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                    {c.current_role && <span>{c.current_role}{c.current_company ? ` @ ${c.current_company}` : ''}</span>}
                    {c.experience_years && <span>{c.experience_years}y exp</span>}
                    {c.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{c.location}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  {avgScore(c) && (
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-900">{avgScore(c)}</p>
                      <p className="text-[9px] text-gray-400">SCORE</p>
                    </div>
                  )}
                  <div className="text-right text-xs text-gray-400">
                    <p>{c.owner_name}</p>
                    <p>{new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  <ChevronDown className={clsx('w-4 h-4 text-gray-300 transition-transform', expandedId === c.id && 'rotate-180')} />
                </div>
              </div>
              {expandedId === c.id && (
                <div className="border-t border-gray-50 px-4 py-3 bg-gray-50/50">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                    <div><span className="text-gray-400">Email:</span> <span className="text-gray-700">{c.email || '—'}</span></div>
                    <div><span className="text-gray-400">Phone:</span> <span className="text-gray-700">{c.phone || '—'}</span></div>
                    <div><span className="text-gray-400">Skills:</span> <span className="text-gray-700">{c.skills?.substring(0, 60) || '—'}</span></div>
                    <div><span className="text-gray-400">Education:</span> <span className="text-gray-700">{c.education?.substring(0, 40) || '—'}</span></div>
                    <div><span className="text-gray-400">Mapped:</span> <span className="text-gray-700">{c.mapped_positions || '—'}</span></div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ===== ADD CANDIDATE MODAL ===== */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl my-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Add Candidate</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {cvStep === 'upload' ? 'Step 1: Upload CV' : cvStep === 'parsing' ? 'Parsing with AI...' : 'Step 2: Review & Save'}
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}

              {/* STEP 1: CV Upload */}
              {cvStep === 'upload' && (
                <div>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-200 hover:border-fx-400 rounded-xl p-12 text-center cursor-pointer transition-colors group"
                  >
                    <Upload className="w-10 h-10 text-gray-300 group-hover:text-fx-500 mx-auto mb-3 transition-colors" />
                    <p className="text-sm font-medium text-gray-700">Drag & drop CV here</p>
                    <p className="text-xs text-gray-400 mt-1">or click to browse · PDF, DOC, DOCX · Max 10MB</p>
                    <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={handleFileSelect} className="hidden" />
                  </div>
                  <div className="text-center mt-4">
                    <button onClick={() => setCvStep('form')} className="text-xs text-gray-400 hover:text-gray-600 underline">
                      Skip CV upload — fill form manually
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 1.5: Parsing */}
              {cvStep === 'parsing' && (
                <div className="py-16 text-center">
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    <div className="absolute inset-0 border-2 border-fx-200 rounded-full animate-ping" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-fx-600 animate-pulse" />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-700">AI is parsing the CV...</p>
                  <p className="text-xs text-gray-400 mt-1">Extracting name, skills, experience, contact info</p>
                  {cvFile && <p className="text-xs text-fx-600 mt-3">{cvFile.name}</p>}
                </div>
              )}

              {/* STEP 2: Form */}
              {cvStep === 'form' && (
                <div className="space-y-5">
                  {cvFile && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg text-sm text-emerald-700">
                      <Check className="w-4 h-4" />
                      <span className="font-medium">CV parsed:</span> {cvFile.name}
                      <span className="text-emerald-500 text-xs ml-auto">AI auto-filled fields below</span>
                    </div>
                  )}

                  {/* Basic Info */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Basic Information</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                        <input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                        <input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Phone (10 digits)</label>
                        <input type="tel" value={form.phone}
                          onChange={(e) => setForm({...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" maxLength={10} placeholder="9876543210" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
                        <input type="text" value={form.location} onChange={(e) => setForm({...form, location: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Experience (years)</label>
                        <input type="number" step="0.5" value={form.experience_years}
                          onChange={(e) => setForm({...form, experience_years: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Education</label>
                        <input type="text" value={form.education} onChange={(e) => setForm({...form, education: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Current Role</label>
                        <input type="text" value={form.current_role} onChange={(e) => setForm({...form, current_role: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Current Company</label>
                        <input type="text" value={form.current_company} onChange={(e) => setForm({...form, current_company: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Skills</label>
                      <input type="text" value={form.skills} onChange={(e) => setForm({...form, skills: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Java, Spring Boot, AWS..." />
                    </div>
                  </div>

                  {/* Requirement Mapping + AI Match */}
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Map to Requirement</p>
                    <div className="flex gap-3">
                      <select value={form.job_id} onChange={(e) => { setForm({...form, job_id: e.target.value}); setMatchResult(null); }}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                        <option value="">Select open position (optional)</option>
                        {requirements.map(r => (
                          <option key={r.id} value={r.id}>{r.title} — {r.client_name} ({r.location})</option>
                        ))}
                      </select>
                      {form.job_id && form.cv_text && (
                        <button onClick={handleMatch} disabled={matching}
                          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors">
                          {matching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          AI Match
                        </button>
                      )}
                    </div>
                    {matchResult && (
                      <div className="mt-3 p-3 bg-violet-50 rounded-lg border border-violet-100">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="text-2xl font-bold text-violet-700">{matchResult.match_percent}%</div>
                          <div className="flex-1">
                            <div className="h-2 bg-violet-200 rounded-full overflow-hidden">
                              <div className={clsx('h-full rounded-full', matchResult.match_percent >= 70 ? 'bg-emerald-500' : matchResult.match_percent >= 40 ? 'bg-amber-400' : 'bg-red-400')}
                                style={{width: `${matchResult.match_percent}%`}} />
                            </div>
                          </div>
                        </div>
                        {matchResult.summary && <p className="text-xs text-violet-700 mb-2">{matchResult.summary}</p>}
                        <div className="flex gap-4 text-xs">
                          {matchResult.matching_skills?.length > 0 && (
                            <div>
                              <p className="text-emerald-600 font-medium mb-1">Matching:</p>
                              <div className="flex flex-wrap gap-1">
                                {matchResult.matching_skills.map((s: string, i: number) => (
                                  <span key={i} className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px]">{s}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {matchResult.missing_skills?.length > 0 && (
                            <div>
                              <p className="text-red-500 font-medium mb-1">Missing:</p>
                              <div className="flex flex-wrap gap-1">
                                {matchResult.missing_skills.map((s: string, i: number) => (
                                  <span key={i} className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px]">{s}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* CTC */}
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Compensation (LPA)</p>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1">Current Fixed</label>
                        <input type="number" value={form.current_ctc_fixed} onChange={(e) => setForm({...form, current_ctc_fixed: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1">Current Variable</label>
                        <input type="number" value={form.current_ctc_variable} onChange={(e) => setForm({...form, current_ctc_variable: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1">Expected Fixed</label>
                        <input type="number" value={form.expected_ctc_fixed} onChange={(e) => setForm({...form, expected_ctc_fixed: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1">Expected Variable</label>
                        <input type="number" value={form.expected_ctc_variable} onChange={(e) => setForm({...form, expected_ctc_variable: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                    </div>
                  </div>

                  {/* Notice + Holding */}
                  <div className="border-t border-gray-100 pt-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Notice Period</label>
                        <input type="text" value={form.notice_period} onChange={(e) => setForm({...form, notice_period: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="30 days" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Last Working Day</label>
                        <input type="date" value={form.last_working_day} onChange={(e) => setForm({...form, last_working_day: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Holding Offer?</label>
                        <div className="flex items-center gap-3 mt-1.5">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={form.holding_offer as boolean}
                              onChange={(e) => setForm({...form, holding_offer: e.target.checked})} className="rounded" />
                            <span className="text-sm text-gray-600">Yes</span>
                          </label>
                        </div>
                      </div>
                    </div>
                    {form.holding_offer && (
                      <div className="mt-2">
                        <input type="text" value={form.holding_offer_details}
                          onChange={(e) => setForm({...form, holding_offer_details: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Offer details..." />
                      </div>
                    )}
                  </div>

                  {/* Referral */}
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Referral</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Referral Name</label>
                        <input type="text" value={form.referral_name} onChange={(e) => setForm({...form, referral_name: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Referral Phone</label>
                        <input type="tel" value={form.referral_phone}
                          onChange={(e) => setForm({...form, referral_phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" maxLength={10} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Bonus Eligible?</label>
                        <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
                          <input type="checkbox" checked={form.referral_bonus_eligible as boolean}
                            onChange={(e) => setForm({...form, referral_bonus_eligible: e.target.checked})} className="rounded" />
                          <span className="text-sm text-gray-600">Yes</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Assessment */}
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Assessment (1-10)</p>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { key: 'assessment_soft_skills', label: 'Soft Skills' },
                        { key: 'assessment_stability', label: 'Stability' },
                        { key: 'assessment_technical', label: 'Technical' },
                        { key: 'assessment_experience', label: 'Experience' },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <label className="block text-[10px] text-gray-400 mb-1">{label}</label>
                          <input type="number" min="1" max="10"
                            value={(form as any)[key]}
                            onChange={(e) => setForm({...form, [key]: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {cvStep === 'form' && (
              <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="px-5 py-2 bg-fx-600 hover:bg-fx-700 disabled:bg-fx-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Candidate
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
