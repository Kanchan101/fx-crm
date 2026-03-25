'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  UserCog, Plus, Shield, Briefcase, Users, X, Edit2,
  CheckCircle2, XCircle, Clock, BarChart3,
} from 'lucide-react';
import clsx from 'clsx';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string;
  is_active: boolean;
  last_login: string;
  created_at: string;
  total_candidates: number;
  monthly_submissions: number;
  total_placements: number;
  assigned_positions: number;
}

const ROLES = ['Super Admin', 'Account Manager', 'Recruiter'];

const emptyForm = { name: '', email: '', password: '', role: 'Recruiter', phone: '', is_active: true };

export default function TeamPage() {
  const { user, isRole } = useAuth();
  const isSuperAdmin = isRole('Super Admin');

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchTeam = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.team.list();
      setTeam(data.team);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  const openAdd = () => {
    setEditingMember(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEdit = (member: TeamMember) => {
    setEditingMember(member);
    setForm({
      name: member.name,
      email: member.email,
      password: '',
      role: member.role,
      phone: member.phone || '',
      is_active: member.is_active,
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) { setError('Name and email are required'); return; }
    if (!editingMember && !form.password) { setError('Password is required for new members'); return; }

    setSaving(true);
    setError('');
    try {
      const payload: any = { name: form.name, email: form.email, role: form.role, phone: form.phone, is_active: form.is_active };
      if (form.password) payload.password = form.password;

      if (editingMember) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/team/${editingMember.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${document.cookie.split('fx_token=')[1]?.split(';')[0]}` },
          body: JSON.stringify(payload),
        }).then(r => { if (!r.ok) throw new Error('Update failed'); return r.json(); });
      } else {
        payload.password = form.password;
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/team`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${document.cookie.split('fx_token=')[1]?.split(';')[0]}` },
          body: JSON.stringify(payload),
        }).then(r => { if (!r.ok) throw new Error('Create failed'); return r.json(); });
      }
      setShowModal(false);
      fetchTeam();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const roleIcon = (role: string) => {
    if (role === 'Super Admin') return Shield;
    if (role === 'Account Manager') return Briefcase;
    return Users;
  };

  const roleColor = (role: string) => {
    if (role === 'Super Admin') return 'bg-red-50 text-red-600 border-red-100';
    if (role === 'Account Manager') return 'bg-blue-50 text-blue-600 border-blue-100';
    return 'bg-emerald-50 text-emerald-600 border-emerald-100';
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatLogin = (dateStr: string) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Group by role
  const grouped = ROLES.map(role => ({
    role,
    members: team.filter(m => m.role === role),
  })).filter(g => g.members.length > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{team.length} team member{team.length !== 1 ? 's' : ''}</p>
        {isSuperAdmin && (
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-fx-600 hover:bg-fx-700 text-white rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Add Member
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ role, members }) => {
            const Icon = roleIcon(role);
            return (
              <div key={role}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-700">{role}s</h3>
                  <span className="text-xs text-gray-400">({members.length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {members.map((member) => (
                    <div key={member.id}
                      className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow relative group">
                      {isSuperAdmin && member.id !== user?.id && (
                        <button onClick={() => openEdit(member)}
                          className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Edit2 className="w-3 h-3 text-gray-400" />
                        </button>
                      )}
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-fx-100 text-fx-700 flex items-center justify-center text-sm font-semibold">
                          {member.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900 truncate">{member.name}</p>
                            {member.is_active ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-gray-400 truncate">{member.email}</p>
                        </div>
                      </div>

                      <div className={clsx('inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium mb-4', roleColor(member.role))}>
                        <Icon className="w-3 h-3" />{member.role}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                          <p className="text-lg font-bold text-gray-900">{member.total_candidates}</p>
                          <p className="text-[10px] text-gray-400 uppercase">Candidates</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                          <p className="text-lg font-bold text-gray-900">{member.monthly_submissions}</p>
                          <p className="text-[10px] text-gray-400 uppercase">Monthly Sub</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                          <p className="text-lg font-bold text-gray-900">{member.total_placements}</p>
                          <p className="text-[10px] text-gray-400 uppercase">Placements</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                          <p className="text-lg font-bold text-gray-900">{member.assigned_positions}</p>
                          <p className="text-[10px] text-gray-400 uppercase">Positions</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                        <span className="text-[10px] text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />Last login: {formatLogin(member.last_login)}
                        </span>
                        {member.phone && <span className="text-[10px] text-gray-400">{member.phone}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{editingMember ? 'Edit Team Member' : 'Add Team Member'}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Password {editingMember ? '(leave blank to keep current)' : '*'}
                </label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Role *</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" maxLength={10} />
                </div>
              </div>
              {editingMember && (
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={form.is_active as boolean}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-fx-500/40 rounded-full peer peer-checked:bg-fx-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                  </label>
                  <span className="text-sm text-gray-700">Active</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-fx-600 hover:bg-fx-700 disabled:bg-fx-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                {saving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {editingMember ? 'Update' : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
