'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  Briefcase, Plus, Search, MapPin, Users, Clock, ChevronRight,
  X, Filter, Building2, AlertCircle, Share2,
} from 'lucide-react';
import clsx from 'clsx';
import ShareJD from '@/components/ShareJD';

interface Requirement {
  id: string;
  title: string;
  client_id: string;
  client_name: string;
  client_tier: string;
  client_domain: string;
  location: string;
  type: string;
  ctc_min: number;
  ctc_max: number;
  exp_min: number;
  exp_max: number;
  description: string;
  skills: string;
  priority: string;
  deadline: string;
  positions_count: number;
  status: string;
  internal_notes: string;
  total_candidates: number;
  active_candidates: number;
  assigned_count: number;
  assigned_team: { team_member_id: string; name: string; role: string }[];
  created_at: string;
}

interface Client { id: string; name: string; }
interface TeamMember { id: string; name: string; role: string; email: string; is_active?: boolean; }

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const STATUSES = ['Open', 'On Hold', 'Closed', 'Filled'];
const JOB_TYPES = ['Full Time', 'Part Time', 'Contract', 'Freelance'];

const emptyForm = {
  title: '', client_id: '', location: '', type: 'Full Time',
  ctc_min: '', ctc_max: '', exp_min: '', exp_max: '',
  description: '', skills: '', priority: 'Medium', deadline: '',
  positions_count: '1', status: 'Open', internal_notes: '',
  assigned_team_ids: [] as string[],
};

export default function RequirementsPage() {
  const router = useRouter();
  const { user, isRole } = useAuth();
  const canEdit = isRole('Super Admin', 'Account Manager');

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [myPositions, setMyPositions] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingReq, setEditingReq] = useState<Requirement | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [shareJob, setShareJob] = useState<Requirement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchRequirements = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterStatus !== 'All') params.set('status', filterStatus);
      if (filterPriority !== 'All') params.set('priority', filterPriority);
      if (myPositions) params.set('my_positions', 'true');
      const data = await api.requirements.list(params.toString());
      setRequirements(data.requirements);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, filterStatus, filterPriority, myPositions]);

  const fetchMeta = useCallback(async () => {
    try {
      const [clientData, teamData] = await Promise.all([
        api.clients.list(''),
        api.team.list(),
      ]);
      setClients(clientData.clients);
      setTeamMembers(teamData.team);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchRequirements(); }, [fetchRequirements]);
  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  const openAdd = () => {
    setEditingReq(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEdit = (req: Requirement) => {
    setEditingReq(req);
    setForm({
      title: req.title, client_id: req.client_id, location: req.location,
      type: req.type, ctc_min: String(req.ctc_min || ''), ctc_max: String(req.ctc_max || ''),
      exp_min: String(req.exp_min || ''), exp_max: String(req.exp_max || ''),
      description: req.description || '', skills: req.skills || '',
      priority: req.priority, deadline: req.deadline ? req.deadline.split('T')[0] : '',
      positions_count: String(req.positions_count || 1), status: req.status,
      internal_notes: req.internal_notes || '',
      assigned_team_ids: req.assigned_team?.map(a => a.team_member_id) || [],
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    if (!form.client_id) { setError('Client is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        ctc_min: parseFloat(form.ctc_min) || 0,
        ctc_max: parseFloat(form.ctc_max) || 0,
        exp_min: parseInt(form.exp_min) || 0,
        exp_max: parseInt(form.exp_max) || 0,
        positions_count: parseInt(form.positions_count) || 1,
      };
      if (editingReq) {
        await api.requirements.update(editingReq.id, payload);
      } else {
        await api.requirements.create(payload);
      }
      setShowModal(false);
      fetchRequirements();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const toggleAssignment = (id: string) => {
    setForm(f => ({
      ...f,
      assigned_team_ids: f.assigned_team_ids.includes(id)
        ? f.assigned_team_ids.filter(x => x !== id)
        : [...f.assigned_team_ids, id],
    }));
  };

  const priorityColor = (p: string) => {
    const map: Record<string, string> = { Critical: 'badge-critical', High: 'badge-high', Medium: 'badge-medium', Low: 'badge-low' };
    return map[p] || 'badge-medium';
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = { Open: 'badge-open', 'On Hold': 'badge-onhold', Closed: 'badge-closed', Filled: 'badge-closed' };
    return map[s] || 'badge-closed';
  };

  const formatCTC = (min: number, max: number) => {
    if (!min && !max) return '—';
    const fmt = (n: number) => n >= 100000 ? `${(n/100000).toFixed(1)}L` : `${n}`;
    if (min && max) return `${fmt(min)} - ${fmt(max)}`;
    if (max) return `Up to ${fmt(max)}`;
    return `${fmt(min)}+`;
  };

  // Count by status
  const openCount = requirements.filter(r => r.status === 'Open').length;
  const totalCount = requirements.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <p className="text-sm text-gray-500">{totalCount} position{totalCount !== 1 ? 's' : ''} · {openCount} open</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setMyPositions(!myPositions)}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              myPositions ? 'bg-fx-600 text-white border-fx-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
            {myPositions ? 'My Positions' : 'All Positions'}
          </button>
          {canEdit && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-fx-600 hover:bg-fx-700 text-white rounded-lg text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Add Requirement
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, client, location..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="All">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="All">All Priority</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Requirements list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : requirements.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Briefcase className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No requirements found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requirements.map((req) => (
            <div key={req.id}
              className="bg-white rounded-xl border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all cursor-pointer group"
              onClick={() => router.push(`/requirements/${req.id}`)}>
              <div className="p-5 flex items-center gap-4">
                {/* Priority indicator */}
                <div className={clsx('w-1 h-14 rounded-full shrink-0',
                  req.priority === 'Critical' ? 'bg-red-500' : req.priority === 'High' ? 'bg-orange-400' :
                  req.priority === 'Medium' ? 'bg-blue-400' : 'bg-green-400')} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-fx-700 transition-colors">{req.title}</h3>
                    <span className={clsx('badge', priorityColor(req.priority))}>{req.priority}</span>
                    <span className={clsx('badge', statusColor(req.status))}>{req.status}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{req.client_name}</span>
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{req.location || '—'}</span>
                    <span>Exp: {req.exp_min}-{req.exp_max} yrs</span>
                    <span>CTC: {formatCTC(req.ctc_min, req.ctc_max)}</span>
                    {req.deadline && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(req.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900">{req.active_candidates}</p>
                    <p className="text-[10px] text-gray-400 uppercase">Active</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900">{req.assigned_count}</p>
                    <p className="text-[10px] text-gray-400 uppercase">Assigned</p>
                  </div>

                  {/* Assigned avatars */}
                  {req.assigned_team && req.assigned_team.length > 0 && (
                    <div className="flex -space-x-2">
                      {req.assigned_team.slice(0, 3).map((m, i) => (
                        <div key={m.team_member_id} title={m.name}
                          className="w-7 h-7 rounded-full bg-fx-100 text-fx-700 flex items-center justify-center text-[10px] font-medium border-2 border-white">
                          {m.name.split(' ').map(w => w[0]).join('').substring(0, 2)}
                        </div>
                      ))}
                      {req.assigned_team.length > 3 && (
                        <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-medium border-2 border-white">
                          +{req.assigned_team.length - 3}
                        </div>
                      )}
                    </div>
                  )}

                  {canEdit && (
                    <button onClick={(e) => { e.stopPropagation(); openEdit(req); }}
                      className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                  )}

                  <button onClick={(e) => { e.stopPropagation(); setShareJob(req); }}
                      className="w-8 h-8 rounded-lg hover:bg-blue-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Share2 className="w-3.5 h-3.5 text-blue-500" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                </div>
              </div>

              {/* Skills bar */}
              {req.skills && (
                <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                  {req.skills.split(',').slice(0, 6).map((skill, i) => (
                    <span key={i} className="px-2 py-0.5 bg-gray-50 text-gray-500 rounded text-[10px]">{skill.trim()}</span>
                  ))}
                  {req.skills.split(',').length > 6 && (
                    <span className="px-2 py-0.5 text-gray-400 text-[10px]">+{req.skills.split(',').length - 6} more</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl my-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-lg font-semibold text-gray-900">{editingReq ? 'Edit Requirement' : 'Add Requirement'}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Job Title *</label>
                  <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. Sr. Service Engineer" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Client *</label>
                  <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    <option value="">Select client</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
                  <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. Mumbai" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Positions</label>
                  <input type="number" value={form.positions_count} onChange={(e) => setForm({ ...form, positions_count: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" min="1" />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CTC Min (LPA)</label>
                  <input type="number" value={form.ctc_min} onChange={(e) => setForm({ ...form, ctc_min: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CTC Max (LPA)</label>
                  <input type="number" value={form.ctc_max} onChange={(e) => setForm({ ...form, ctc_max: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Exp Min (yrs)</label>
                  <input type="number" value={form.exp_min} onChange={(e) => setForm({ ...form, exp_min: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Exp Max (yrs)</label>
                  <input type="number" value={form.exp_max} onChange={(e) => setForm({ ...form, exp_max: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Deadline</label>
                  <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>

              {editingReq && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Skills (comma separated)</label>
                <input type="text" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Java, Spring Boot, Microservices" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Job Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" rows={4} placeholder="Full job description..." />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Internal Notes</label>
                <textarea value={form.internal_notes} onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" rows={2} />
              </div>

              {/* Team Assignment */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Assign Team Members</p>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {teamMembers.filter(m => m.is_active !== false).map((member) => (
                    <button key={member.id} type="button"
                      onClick={() => toggleAssignment(member.id)}
                      className={clsx(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all',
                        form.assigned_team_ids.includes(member.id)
                          ? 'border-fx-500 bg-fx-50 text-fx-700'
                          : 'border-gray-100 hover:border-gray-200 text-gray-600'
                      )}>
                      <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium shrink-0',
                        form.assigned_team_ids.includes(member.id) ? 'bg-fx-600 text-white' : 'bg-gray-100 text-gray-400')}>
                        {form.assigned_team_ids.includes(member.id) ? '✓' : member.name.split(' ').map(w => w[0]).join('').substring(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{member.name}</p>
                        <p className="text-[10px] text-gray-400">{member.role}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {form.assigned_team_ids.length > 0 && (
                  <p className="text-xs text-fx-600 mt-2">{form.assigned_team_ids.length} member{form.assigned_team_ids.length > 1 ? 's' : ''} selected</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-fx-600 hover:bg-fx-700 disabled:bg-fx-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                {saving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {editingReq ? 'Update' : 'Add Requirement'}
              </button>
            </div>
          </div>
        
      {shareJob && (
        <ShareJD
          show={!!shareJob}
          onClose={() => setShareJob(null)}
          job={{
            id: shareJob.id,
            title: shareJob.title,
            client_name: shareJob.client_name,
            location: shareJob.location,
            exp_min: shareJob.exp_min,
            exp_max: shareJob.exp_max,
            ctc_min: shareJob.ctc_min,
            ctc_max: shareJob.ctc_max,
            skills: shareJob.skills,
            description: shareJob.description || '',
            type: shareJob.type || 'Full Time',
            positions_count: shareJob.positions_count || 1,
            client_industry: shareJob.client_domain || '',
          }}
        />
      )}
</div>
      )}
    </div>
  );
}
