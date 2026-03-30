'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { MapPin, Briefcase, Clock, Building2, Upload, Check, Loader2, AlertCircle, ChevronDown, Star, Zap, Users, Target, Award } from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Strip metadata from top of JD — removes role title, location, experience, reports to etc
function stripJDMetadata(text: string, jobTitle: string): { cleanTitle: string; cleanBody: string } {
  if (!text) return { cleanTitle: jobTitle, cleanBody: '' };

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let startIdx = 0;
  let extractedTitle = jobTitle;

  // Patterns that indicate metadata (not real JD content)
  const metaPatterns = [
    /^location$/i,
    /^function$/i,
    /^experience$/i,
    /^reports?\s*to$/i,
    /^department$/i,
    /^team$/i,
    /^division$/i,
    /^type$/i,
    /^\d+[–\-]\d+\s*(years|yrs)/i,
    /^(bengaluru|bangalore|mumbai|delhi|noida|hyderabad|chennai|pune|gurugram|kolkata|pan india|india)/i,
    /^(remote|onsite|on-site|hybrid|full[\s-]?time|part[\s-]?time|contract)$/i,
    /^head of /i,
    /^(sr\.?|senior|junior|staff|lead|principal)\s/i,
    /^(engineering|product|design|data|sales|marketing|operations|finance|technology)$/i,
    /^(commerce|membership|promise|platform|infrastructure|backend|frontend|devops)/i,
  ];

  // Check if first line is a fuller version of the title
  if (lines.length > 0) {
    const firstLine = lines[0];
    const titleLower = jobTitle.toLowerCase();
    if (firstLine.toLowerCase().startsWith(titleLower) && firstLine.length > jobTitle.length) {
      // First line has the full title — extract it
      extractedTitle = firstLine;
      startIdx = 1;
    } else if (firstLine.toLowerCase() === titleLower) {
      startIdx = 1;
    }
  }

  // Skip metadata lines from the top
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];

    // Stop skipping once we hit real content
    if (line.match(/^(About|The Role|Overview|Summary|Position Overview|Role Overview|Job Summary|What You|Key Resp|We are|Join us|This role|This is a|As a|The .+ will)/i)) {
      startIdx = i;
      break;
    }

    // Check if this line is metadata
    const isMeta = metaPatterns.some(p => p.test(line));
    const isShort = line.length < 50;
    const isNoBullet = !line.startsWith('•') && !line.startsWith('-') && !line.startsWith('*');

    if ((isMeta || isShort) && isNoBullet && i < 15) {
      startIdx = i + 1;
    } else if (line.length > 80) {
      // Long line = probably real content
      startIdx = i;
      break;
    }
  }

  const cleanBody = lines.slice(startIdx).join('\n');
  return { cleanTitle: extractedTitle, cleanBody };
}

// Parse JD into structured sections
function parseJD(text: string) {
  if (!text) return [];
  const sections: { title: string; content: string; bullets: string[] }[] = [];
  const lines = text.split('\n');
  let currentSection = { title: '', content: '', bullets: [] as string[] };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isBullet = trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*');

    // Detect section headers
    const isHeader = (
      !isBullet &&
      trimmed.length < 80 &&
      trimmed.length > 3 &&
      (
        trimmed.match(/^(About|The Role|What You|Key |Why |How |Strong |Required|Preferred|Responsib|Qualific|Require|Domain|Team|Talent|Execution|Reliab|Technical|What This|What Success)/i) ||
        (trimmed.match(/^[A-Z]/) && !trimmed.match(/^[A-Z][a-z]+ (is|are|was|were|has|have|the|a |an |this|that|our|we|in|at|on|for|to|of|with|and)/i) && trimmed.length < 60 && !trimmed.includes('. '))
      )
    );

    if (isHeader) {
      if (currentSection.title || currentSection.content || currentSection.bullets.length > 0) {
        sections.push({ ...currentSection });
      }
      currentSection = { title: trimmed, content: '', bullets: [] };
    } else if (isBullet) {
      currentSection.bullets.push(trimmed.replace(/^[•\-*]\s*/, ''));
    } else {
      if (currentSection.content) currentSection.content += ' ' + trimmed;
      else currentSection.content = trimmed;
    }
  }
  if (currentSection.title || currentSection.content || currentSection.bullets.length > 0) {
    sections.push(currentSection);
  }
  return sections;
}

function getSectionIcon(title: string) {
  const l = title.toLowerCase();
  if (l.includes('about') || l.includes('overview') || l.includes('summary') || l.includes('the role')) return Target;
  if (l.includes('what you will') || l.includes('responsib') || l.includes('what you do') || l.includes('execution') || l.includes('delivery')) return Zap;
  if (l.includes('what you bring') || l.includes('qualif') || l.includes('require') || l.includes('skill') || l.includes('strong differ')) return Award;
  if (l.includes('success') || l.includes('outcome')) return Star;
  if (l.includes('team') || l.includes('talent') || l.includes('org') || l.includes('leadership')) return Users;
  if (l.includes('technical') || l.includes('architecture') || l.includes('reliab') || l.includes('domain')) return Briefcase;
  if (l.includes('what this is not')) return AlertCircle;
  return Briefcase;
}

// Generate a gradient based on role keywords
function getRolePoster(title: string): { gradient: string; emoji: string; tagline: string } {
  const l = title.toLowerCase();
  if (l.includes('devops') || l.includes('sre') || l.includes('infrastructure')) return { gradient: 'from-cyan-900 via-blue-900 to-slate-900', emoji: '⚙️', tagline: 'Build the infrastructure that powers everything' };
  if (l.includes('data scientist') || l.includes('data analyst') || l.includes('analytics')) return { gradient: 'from-purple-900 via-indigo-900 to-slate-900', emoji: '📊', tagline: 'Turn data into decisions that matter' };
  if (l.includes('data engineer') || l.includes('bigdata') || l.includes('big data')) return { gradient: 'from-violet-900 via-purple-900 to-slate-900', emoji: '🔬', tagline: 'Engineer the data pipelines of tomorrow' };
  if (l.includes('frontend') || l.includes('react') || l.includes('ui') || l.includes('ux')) return { gradient: 'from-rose-900 via-pink-900 to-slate-900', emoji: '🎨', tagline: 'Craft experiences that delight millions' };
  if (l.includes('backend') || l.includes('java') || l.includes('python') || l.includes('architect')) return { gradient: 'from-emerald-900 via-teal-900 to-slate-900', emoji: '🏗️', tagline: 'Architect systems that scale without limits' };
  if (l.includes('mobile') || l.includes('android') || l.includes('ios')) return { gradient: 'from-sky-900 via-blue-900 to-slate-900', emoji: '📱', tagline: 'Build mobile experiences used by millions' };
  if (l.includes('product') || l.includes('manager')) return { gradient: 'from-amber-900 via-orange-900 to-slate-900', emoji: '🚀', tagline: 'Shape products that change how people live' };
  if (l.includes('director') || l.includes('head') || l.includes('vp') || l.includes('leader')) return { gradient: 'from-slate-800 via-zinc-900 to-neutral-900', emoji: '👑', tagline: 'Lead teams building the future' };
  if (l.includes('sales') || l.includes('business development')) return { gradient: 'from-green-900 via-emerald-900 to-slate-900', emoji: '📈', tagline: 'Drive growth at scale' };
  if (l.includes('hvac') || l.includes('service engineer') || l.includes('mechanical')) return { gradient: 'from-orange-900 via-amber-900 to-slate-900', emoji: '🔧', tagline: 'Engineer solutions that keep the world running' };
  if (l.includes('project manager') || l.includes('program')) return { gradient: 'from-blue-900 via-indigo-900 to-slate-900', emoji: '🎯', tagline: 'Orchestrate projects that deliver impact' };
  return { gradient: 'from-[#1a1a2e] via-[#16213e] to-[#1a1a2e]', emoji: '💼', tagline: 'Join a team that is shaping the future' };
}

export default function PublicJDPage() {
  const params = useParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showApply, setShowApply] = useState(false);
  const [applyForm, setApplyForm] = useState({ name: '', email: '', phone: '', location: '', experience_years: '', current_company: '', current_role: '' });
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [applyError, setApplyError] = useState('');

  useEffect(() => {
    fetch(`${API}/api/public/jobs/${params.id}`)
      .then(r => r.json())
      .then(data => { if (data.error) setError(data.error); else setJob(data); })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleApply = async () => {
    if (!applyForm.name.trim() || !applyForm.email.trim() || !cvFile) {
      setApplyError('Name, email, and CV are required'); return;
    }
    setSubmitting(true); setApplyError('');
    try {
      const fd = new FormData();
      fd.append('cv', cvFile);
      fd.append('name', applyForm.name.trim());
      fd.append('email', applyForm.email.trim());
      if (applyForm.phone) fd.append('phone', applyForm.phone.replace(/\D/g, '').slice(-10));
      if (applyForm.location) fd.append('location', applyForm.location);
      if (applyForm.experience_years) fd.append('experience_years', applyForm.experience_years);
      if (applyForm.current_company) fd.append('current_company', applyForm.current_company);
      if (applyForm.current_role) fd.append('current_role', applyForm.current_role);
      const res = await fetch(`${API}/api/public/jobs/${params.id}/apply`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) setSubmitted(true); else setApplyError(data.error || 'Failed');
    } catch { setApplyError('Something went wrong.'); }
    finally { setSubmitting(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-2 border-[#d4830a] border-t-transparent rounded-full animate-spin" /><p className="text-sm text-gray-400">Loading...</p></div>
    </div>
  );

  if (error || !job) return (
    <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center p-6">
      <div className="text-center max-w-md bg-white rounded-2xl p-10 shadow-sm border border-gray-100">
        <Briefcase className="w-12 h-12 text-gray-200 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Position Not Available</h1>
        <p className="text-gray-500 text-sm">{error || 'This position has been closed.'}</p>
      </div>
    </div>
  );

  // Process JD
  const { cleanTitle, cleanBody } = stripJDMetadata(job.description, job.title);
  const jdSections = parseJD(cleanBody);
  const poster = getRolePoster(cleanTitle);

  return (
    <div className="min-h-screen bg-[#fafaf8]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');
        * { font-family: 'DM Sans', system-ui, sans-serif; }
        .section-card { transition: all 0.2s ease; }
        .section-card:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
        .bullet-item { position: relative; padding-left: 20px; }
        .bullet-item::before { content: ''; position: absolute; left: 0; top: 10px; width: 6px; height: 6px; background: #d4930a; border-radius: 50%; }
      `}</style>

      {/* Nav */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#d4930a] flex items-center justify-center text-white text-[10px] font-bold">FX</div>
            <span className="text-sm font-semibold text-gray-800">FX Consulting</span>
          </div>
          {!submitted && (
            <button onClick={() => { setShowApply(true); setTimeout(() => document.getElementById('apply-section')?.scrollIntoView({ behavior: 'smooth' }), 100); }}
              className="px-5 py-2 bg-[#d4930a] text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity">
              Apply Now
            </button>
          )}
        </div>
      </nav>

      {/* Hero Poster */}
      <div className={`bg-gradient-to-br ${poster.gradient} text-white relative overflow-hidden`}>
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-white opacity-[0.02] -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-[#d4930a] opacity-[0.04] translate-y-1/3 -translate-x-1/4" />

        <div className="max-w-4xl mx-auto px-6 py-16 sm:py-20 relative z-10">
          <div className="text-5xl mb-6">{poster.emoji}</div>

          <div className="flex flex-wrap gap-2 mb-6">
            <span className="px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs font-medium border border-white/5">{job.type}</span>
            <span className="px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs font-medium border border-white/5">{job.experience}</span>
            {job.positions > 1 && <span className="px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs font-medium border border-white/5">{job.positions} openings</span>}
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 leading-tight tracking-tight max-w-2xl">{cleanTitle}</h1>

          <p className="text-lg text-white/40 italic mb-8 max-w-xl">{poster.tagline}</p>

          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 bg-white/[0.08] backdrop-blur-sm px-4 py-2.5 rounded-xl border border-white/[0.06]">
              <MapPin className="w-4 h-4 text-[#d4930a]" />
              <span className="text-sm text-white/90">{job.location}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/[0.08] backdrop-blur-sm px-4 py-2.5 rounded-xl border border-white/[0.06]">
              <Building2 className="w-4 h-4 text-[#d4930a]" />
              <span className="text-sm text-white/90">{job.company}</span>
            </div>
          </div>

          {!submitted && (
            <button onClick={() => { setShowApply(true); setTimeout(() => document.getElementById('apply-section')?.scrollIntoView({ behavior: 'smooth' }), 100); }}
              className="mt-10 inline-flex items-center gap-2 px-8 py-3.5 bg-[#d4930a] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-lg shadow-black/30">
              <Upload className="w-5 h-5" /> Apply Now — Upload Your CV
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
          {/* Left */}
          <div className="space-y-5">
            {job.skills && (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 section-card">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-[#d4930a]/10 flex items-center justify-center"><Award className="w-4 h-4 text-[#d4930a]" /></div>
                  <h2 className="text-base font-semibold text-gray-900">Required Skills</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {job.skills.split(',').map((s: string, i: number) => (
                    <span key={i} className="px-3 py-1.5 bg-[#fef7ec] text-[#92600a] rounded-lg text-xs font-medium border border-[#f5e6c8]">{s.trim()}</span>
                  ))}
                </div>
              </div>
            )}

            {jdSections.length > 0 ? (
              jdSections.map((section, idx) => {
                const Icon = getSectionIcon(section.title);
                return (
                  <div key={idx} className="bg-white rounded-2xl border border-gray-100 p-6 section-card">
                    {section.title && (
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-[#d4930a]/10 flex items-center justify-center"><Icon className="w-4 h-4 text-[#d4930a]" /></div>
                        <h2 className="text-base font-semibold text-gray-900">{section.title}</h2>
                      </div>
                    )}
                    {section.content && <p className="text-sm text-gray-600 leading-relaxed mb-4">{section.content}</p>}
                    {section.bullets.length > 0 && (
                      <div className="space-y-2.5">
                        {section.bullets.map((b, bi) => <div key={bi} className="bullet-item text-sm text-gray-600 leading-relaxed">{b}</div>)}
                      </div>
                    )}
                  </div>
                );
              })
            ) : cleanBody && (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 section-card">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-[#d4930a]/10 flex items-center justify-center"><Briefcase className="w-4 h-4 text-[#d4930a]" /></div>
                  <h2 className="text-base font-semibold text-gray-900">About the Role</h2>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{cleanBody}</p>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 sticky top-20 section-card">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Quick Overview</h3>
              <div className="space-y-4">
                {[
                  { label: 'Location', value: job.location, icon: MapPin },
                  { label: 'Experience', value: job.experience, icon: Clock },
                  { label: 'Job Type', value: job.type, icon: Briefcase },
                  { label: 'Company', value: job.company, icon: Building2 },
                ].map(({ label, value, icon: Ic }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0"><Ic className="w-3.5 h-3.5 text-gray-400" /></div>
                    <div><p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p><p className="text-sm text-gray-800 font-medium">{value}</p></div>
                  </div>
                ))}
                {job.positions > 1 && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0"><Users className="w-3.5 h-3.5 text-gray-400" /></div>
                    <div><p className="text-[10px] text-gray-400 uppercase tracking-wider">Openings</p><p className="text-sm text-gray-800 font-medium">{job.positions} positions</p></div>
                  </div>
                )}
              </div>
              {!submitted && (
                <button onClick={() => { setShowApply(true); setTimeout(() => document.getElementById('apply-section')?.scrollIntoView({ behavior: 'smooth' }), 100); }}
                  className="w-full mt-6 py-3 bg-[#d4930a] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4" /> Apply for this role
                </button>
              )}
              <div className="mt-4 pt-4 border-t border-gray-50 text-center">
                <p className="text-[10px] text-gray-400">Posted by FX Consulting</p>
                <p className="text-[10px] text-gray-300 mt-0.5">fxconsulting.in</p>
              </div>
            </div>
          </div>
        </div>

        {/* Apply */}
        <div id="apply-section" className="mt-10">
          {submitted ? (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-10 text-center max-w-xl mx-auto">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-5"><Check className="w-8 h-8 text-emerald-600" /></div>
              <h2 className="text-xl font-bold text-emerald-900 mb-2">Application Submitted</h2>
              <p className="text-sm text-emerald-700">Thank you for your interest. Our team will review your profile and get back to you.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden max-w-2xl mx-auto shadow-sm">
              <button onClick={() => setShowApply(!showApply)} className="w-full flex items-center justify-between p-6 hover:bg-gray-50/50 transition-colors text-left">
                <div><h2 className="text-lg font-bold text-gray-900">Apply for this position</h2><p className="text-sm text-gray-400 mt-0.5">Upload your CV and our team will review it</p></div>
                <ChevronDown className={clsx('w-5 h-5 text-gray-400 transition-transform', showApply && 'rotate-180')} />
              </button>
              {showApply && (
                <div className="px-6 pb-6 space-y-4 border-t border-gray-100 pt-5">
                  {applyError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{applyError}</div>}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Upload CV *</label>
                    <div onClick={() => fileInputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setCvFile(f); }}
                      className={clsx('border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all', cvFile ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 hover:border-[#d4930a]/40')}>
                      {cvFile ? (
                        <div className="flex items-center justify-center gap-2 text-emerald-700"><Check className="w-5 h-5" /><span className="text-sm font-medium">{cvFile.name}</span><button onClick={e => { e.stopPropagation(); setCvFile(null); }} className="text-xs text-emerald-500 underline ml-2">Change</button></div>
                      ) : (<><Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-600 font-medium">Drag & drop or click to browse</p><p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX — Max 10MB</p></>)}
                      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={e => { const f = e.target.files?.[0]; if (f) setCvFile(f); }} className="hidden" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { key: 'name', label: 'Full Name *', placeholder: 'Your full name', type: 'text' },
                      { key: 'email', label: 'Email *', placeholder: 'you@email.com', type: 'email' },
                      { key: 'phone', label: 'Phone', placeholder: '10 digit number', type: 'tel' },
                      { key: 'location', label: 'Location', placeholder: 'City', type: 'text' },
                      { key: 'experience_years', label: 'Experience (years)', placeholder: 'e.g. 5', type: 'number' },
                      { key: 'current_company', label: 'Current Company', placeholder: 'Company', type: 'text' },
                    ].map(({ key, label, placeholder, type }) => (
                      <div key={key}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                        <input type={type} value={(applyForm as any)[key]}
                          onChange={e => setApplyForm({ ...applyForm, [key]: key === 'phone' ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#d4930a]/30 focus:border-[#d4930a]/50"
                          placeholder={placeholder} maxLength={key === 'phone' ? 10 : undefined} />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Role</label>
                    <input type="text" value={applyForm.current_role} onChange={e => setApplyForm({ ...applyForm, current_role: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#d4930a]/30" placeholder="Your designation" />
                  </div>
                  <button onClick={handleApply} disabled={submitting}
                    className="w-full py-3.5 bg-[#d4930a] text-white rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {submitting ? 'Submitting...' : 'Submit Application'}
                  </button>
                  <p className="text-xs text-gray-400 text-center">By submitting, you agree to share your CV with FX Consulting for recruitment purposes.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-gray-100 pb-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-[#d4930a] flex items-center justify-center text-white text-[10px] font-bold">FX</div>
              <div><p className="text-sm font-semibold text-gray-800">FX Consulting</p><p className="text-[10px] text-gray-400">Building Exceptional Teams Since 2018</p></div>
            </div>
            <div className="text-right"><p className="text-xs text-[#d4930a] font-medium">fxconsulting.in</p><p className="text-[10px] text-gray-400">careers@fxconsulting.in</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}
