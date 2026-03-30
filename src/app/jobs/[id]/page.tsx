'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { MapPin, Briefcase, Clock, Building2, Upload, Check, Loader2, AlertCircle, ChevronDown, Star, Zap, Users, Target, Award } from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
      .then(data => {
        if (data.error) setError(data.error);
        else setJob(data);
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleApply = async () => {
    if (!applyForm.name.trim() || !applyForm.email.trim() || !cvFile) {
      setApplyError('Name, email, and CV are required');
      return;
    }
    setSubmitting(true);
    setApplyError('');
    try {
      const formData = new FormData();
      formData.append('cv', cvFile);
      formData.append('name', applyForm.name.trim());
      formData.append('email', applyForm.email.trim());
      if (applyForm.phone) formData.append('phone', applyForm.phone.replace(/\D/g, '').slice(-10));
      if (applyForm.location) formData.append('location', applyForm.location);
      if (applyForm.experience_years) formData.append('experience_years', applyForm.experience_years);
      if (applyForm.current_company) formData.append('current_company', applyForm.current_company);
      if (applyForm.current_role) formData.append('current_role', applyForm.current_role);

      const res = await fetch(`${API}/api/public/jobs/${params.id}/apply`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) setSubmitted(true);
      else setApplyError(data.error || 'Failed to submit');
    } catch (err) {
      setApplyError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Parse JD into structured sections
  const parseJD = (text: string) => {
    if (!text) return [];
    const sections: { title: string; content: string; bullets: string[] }[] = [];
    const lines = text.split('\n');
    let currentSection = { title: '', content: '', bullets: [] as string[] };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Detect section headers (lines that are short, no bullet, often Title Case)
      const isHeader = (
        trimmed.length < 80 &&
        !trimmed.startsWith('•') &&
        !trimmed.startsWith('-') &&
        !trimmed.startsWith('*') &&
        !trimmed.match(/^[a-z]/) &&
        (trimmed.match(/^[A-Z]/) || trimmed.match(/^What |^The |^About |^Key |^Why |^How |^Strong |^Required|^Preferred|^Responsibilities|^Qualifications|^Requirements/))
      );

      const isBullet = trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*');

      if (isHeader && !isBullet) {
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
  };

  const getSectionIcon = (title: string) => {
    const lower = title.toLowerCase();
    if (lower.includes('role') || lower.includes('about') || lower.includes('overview') || lower.includes('summary')) return Target;
    if (lower.includes('what you will') || lower.includes('responsibilit') || lower.includes('what you do')) return Zap;
    if (lower.includes('what you bring') || lower.includes('qualif') || lower.includes('require') || lower.includes('skill')) return Award;
    if (lower.includes('success') || lower.includes('outcome')) return Star;
    if (lower.includes('team') || lower.includes('talent') || lower.includes('org') || lower.includes('leadership')) return Users;
    if (lower.includes('not') || lower.includes('differentiator') || lower.includes('strong')) return Star;
    return Briefcase;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-[#d4830a] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading opportunity...</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center p-6">
        <div className="text-center max-w-md bg-white rounded-2xl p-10 shadow-sm border border-gray-100">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Briefcase className="w-8 h-8 text-gray-300" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Position Not Available</h1>
          <p className="text-gray-500 text-sm">{error || 'This position has been closed or removed.'}</p>
        </div>
      </div>
    );
  }

  const jdSections = parseJD(job.description);

  return (
    <div className="min-h-screen bg-[#fafaf8]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');
        * { font-family: 'DM Sans', system-ui, sans-serif; }
        .jd-gradient { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #1a1a2e 100%); }
        .gold-accent { color: #d4930a; }
        .gold-bg { background-color: #d4930a; }
        .gold-border { border-color: #d4930a; }
        .section-card { transition: all 0.2s ease; }
        .section-card:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
        .bullet-item { position: relative; padding-left: 20px; }
        .bullet-item::before { content: ''; position: absolute; left: 0; top: 10px; width: 6px; height: 6px; background: #d4930a; border-radius: 50%; }
      `}</style>

      {/* Navigation bar */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md gold-bg flex items-center justify-center text-white text-[10px] font-bold">FX</div>
            <span className="text-sm font-semibold text-gray-800">FX Consulting</span>
            <span className="text-xs text-gray-300 ml-1">Recruitment</span>
          </div>
          {!submitted && (
            <button onClick={() => { setShowApply(true); setTimeout(() => document.getElementById('apply-section')?.scrollIntoView({ behavior: 'smooth' }), 100); }}
              className="px-5 py-2 gold-bg text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity">
              Apply Now
            </button>
          )}
        </div>
      </nav>

      {/* Hero */}
      <div className="jd-gradient text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-[#d4930a] opacity-[0.04] -translate-y-1/2 translate-x-1/4" />
        <div className="max-w-4xl mx-auto px-6 py-14 relative z-10">
          <div className="flex items-center gap-2 mb-5">
            <span className="px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs font-medium backdrop-blur-sm border border-white/5">{job.type}</span>
            {job.positions > 1 && <span className="px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs font-medium">{job.positions} openings</span>}
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold mb-5 leading-tight tracking-tight">{job.title}</h1>

          <p className="text-white/60 text-sm mb-8 max-w-xl">{job.company}</p>

          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 bg-white/[0.07] backdrop-blur-sm px-4 py-2.5 rounded-xl border border-white/[0.06]">
              <MapPin className="w-4 h-4 text-[#d4930a]" />
              <span className="text-sm text-white/90">{job.location}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/[0.07] backdrop-blur-sm px-4 py-2.5 rounded-xl border border-white/[0.06]">
              <Clock className="w-4 h-4 text-[#d4930a]" />
              <span className="text-sm text-white/90">{job.experience}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/[0.07] backdrop-blur-sm px-4 py-2.5 rounded-xl border border-white/[0.06]">
              <Briefcase className="w-4 h-4 text-[#d4930a]" />
              <span className="text-sm text-white/90">{job.type}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
          {/* Left — JD content */}
          <div className="space-y-5">
            {/* Skills */}
            {job.skills && (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 section-card">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-[#d4930a]/10 flex items-center justify-center">
                    <Award className="w-4 h-4 text-[#d4930a]" />
                  </div>
                  <h2 className="text-base font-semibold text-gray-900">Required Skills</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {job.skills.split(',').map((s: string, i: number) => (
                    <span key={i} className="px-3 py-1.5 bg-[#fef7ec] text-[#92600a] rounded-lg text-xs font-medium border border-[#f5e6c8]">{s.trim()}</span>
                  ))}
                </div>
              </div>
            )}

            {/* JD Sections */}
            {jdSections.length > 0 ? (
              jdSections.map((section, idx) => {
                const Icon = getSectionIcon(section.title);
                return (
                  <div key={idx} className="bg-white rounded-2xl border border-gray-100 p-6 section-card">
                    {section.title && (
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-[#d4930a]/10 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-[#d4930a]" />
                        </div>
                        <h2 className="text-base font-semibold text-gray-900">{section.title}</h2>
                      </div>
                    )}
                    {section.content && (
                      <p className="text-sm text-gray-600 leading-relaxed mb-4">{section.content}</p>
                    )}
                    {section.bullets.length > 0 && (
                      <div className="space-y-2.5">
                        {section.bullets.map((bullet, bi) => (
                          <div key={bi} className="bullet-item text-sm text-gray-600 leading-relaxed">{bullet}</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              job.description && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 section-card">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-[#d4930a]/10 flex items-center justify-center">
                      <Briefcase className="w-4 h-4 text-[#d4930a]" />
                    </div>
                    <h2 className="text-base font-semibold text-gray-900">About the Role</h2>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{job.description}</p>
                </div>
              )
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-5">
            {/* Quick info card */}
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
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 mt-0.5">
                      <Ic className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
                      <p className="text-sm text-gray-800 font-medium">{value}</p>
                    </div>
                  </div>
                ))}
                {job.positions > 1 && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 mt-0.5">
                      <Users className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">Openings</p>
                      <p className="text-sm text-gray-800 font-medium">{job.positions} positions</p>
                    </div>
                  </div>
                )}
              </div>

              {/* CTA */}
              {!submitted && (
                <button onClick={() => { setShowApply(true); setTimeout(() => document.getElementById('apply-section')?.scrollIntoView({ behavior: 'smooth' }), 100); }}
                  className="w-full mt-6 py-3 gold-bg text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4" /> Apply for this role
                </button>
              )}

              <div className="mt-4 pt-4 border-t border-gray-50">
                <p className="text-[10px] text-gray-400 text-center">Posted by FX Consulting</p>
                <p className="text-[10px] text-gray-300 text-center mt-0.5">fxconsulting.in</p>
              </div>
            </div>
          </div>
        </div>

        {/* Apply Section */}
        <div id="apply-section" className="mt-10">
          {submitted ? (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-10 text-center max-w-xl mx-auto">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-emerald-900 mb-2">Application Submitted</h2>
              <p className="text-sm text-emerald-700">Thank you for your interest in the <strong>{job.title}</strong> position. Our recruitment team will review your profile and get back to you shortly.</p>
              <p className="text-xs text-emerald-500 mt-6">— FX Consulting</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden max-w-2xl mx-auto shadow-sm">
              <button onClick={() => setShowApply(!showApply)}
                className="w-full flex items-center justify-between p-6 hover:bg-gray-50/50 transition-colors text-left">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Apply for this position</h2>
                  <p className="text-sm text-gray-400 mt-0.5">Upload your CV and our team will review it</p>
                </div>
                <ChevronDown className={clsx('w-5 h-5 text-gray-400 transition-transform', showApply && 'rotate-180')} />
              </button>

              {showApply && (
                <div className="px-6 pb-6 space-y-4 border-t border-gray-100 pt-5">
                  {applyError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />{applyError}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Upload your CV *</label>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setCvFile(f); }}
                      className={clsx(
                        'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
                        cvFile ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 hover:border-[#d4930a]/40 hover:bg-[#fef7ec]/30'
                      )}
                    >
                      {cvFile ? (
                        <div className="flex items-center justify-center gap-2 text-emerald-700">
                          <Check className="w-5 h-5" />
                          <span className="text-sm font-medium">{cvFile.name}</span>
                          <button onClick={e => { e.stopPropagation(); setCvFile(null); }} className="text-xs text-emerald-500 underline ml-2">Change</button>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-600 font-medium">Drag & drop your CV or click to browse</p>
                          <p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX — Max 10MB</p>
                        </>
                      )}
                      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={e => { const f = e.target.files?.[0]; if (f) setCvFile(f); }} className="hidden" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                      <input type="text" value={applyForm.name} onChange={e => setApplyForm({ ...applyForm, name: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#d4930a]/30 focus:border-[#d4930a]/50" placeholder="Your full name" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      <input type="email" value={applyForm.email} onChange={e => setApplyForm({ ...applyForm, email: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#d4930a]/30 focus:border-[#d4930a]/50" placeholder="you@email.com" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input type="tel" value={applyForm.phone} onChange={e => setApplyForm({ ...applyForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#d4930a]/30 focus:border-[#d4930a]/50" placeholder="10 digit number" maxLength={10} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <input type="text" value={applyForm.location} onChange={e => setApplyForm({ ...applyForm, location: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#d4930a]/30 focus:border-[#d4930a]/50" placeholder="City" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Experience (years)</label>
                      <input type="number" value={applyForm.experience_years} onChange={e => setApplyForm({ ...applyForm, experience_years: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#d4930a]/30 focus:border-[#d4930a]/50" placeholder="e.g. 5" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Current Company</label>
                      <input type="text" value={applyForm.current_company} onChange={e => setApplyForm({ ...applyForm, current_company: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#d4930a]/30 focus:border-[#d4930a]/50" placeholder="Company name" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Role</label>
                    <input type="text" value={applyForm.current_role} onChange={e => setApplyForm({ ...applyForm, current_role: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#d4930a]/30 focus:border-[#d4930a]/50" placeholder="Your current designation" />
                  </div>

                  <button onClick={handleApply} disabled={submitting}
                    className="w-full py-3.5 gold-bg text-white rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
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
              <div className="w-7 h-7 rounded-md gold-bg flex items-center justify-center text-white text-[10px] font-bold">FX</div>
              <div>
                <p className="text-sm font-semibold text-gray-800">FX Consulting</p>
                <p className="text-[10px] text-gray-400">Building Exceptional Teams Since 2018</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#d4930a] font-medium">fxconsulting.in</p>
              <p className="text-[10px] text-gray-400">careers@fxconsulting.in</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
