'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, getToken } from '@/lib/api';
import {
  Building2, Plus, Search, Filter, MapPin, Phone, Mail, User,
  ChevronDown, X, Edit2, Trash2, ExternalLink, Briefcase,
} from 'lucide-react';
import clsx from 'clsx';

interface Client {
  id: string;
  name: string;
  industry: string;
  vertical: string;
  domain: string;
  spoc_name: string;
  spoc_role: string;
  spoc_email: string;
  spoc_phone: string;
  location: string;
  tier: string;
  fee_percent: number;
  payment_terms: string;
  contract_end_date: string;
  status: string;
  notes: string;
  open_positions: number;
  total_positions: number;
  created_at: string;
}

const DOMAINS = ['IT Product', 'IT Services', 'BFSI', 'Manufacturing', 'HVAC', 'Telecom', 'Internet', 'Healthcare', 'Automotive', 'Retail'];
const TIERS = ['Platinum', 'Gold', 'Silver'];
const VERTICALS = ['IT', 'Non-IT'];
const STATUSES = ['Active', 'Inactive', 'On Hold'];
const PAYMENT_TERMS = ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90'];

const emptyForm = {
  name: '', industry: '', vertical: '', domain: '', spoc_name: '', spoc_role: '',
  spoc_email: '', spoc_phone: '', location: '', tier: 'Silver', fee_percent: '8.33',
  payment_terms: 'Net 30', contract_end_date: '', status: 'Active', notes: '',
};

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ClientsPage() {
  const { isRole } = useAuth();
  const canEdit = isRole('Super Admin', 'Account Manager');
  const canDelete = isRole('Super Admin');

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [additionalSpocs, setAdditionalSpocs] = useState<any[]>([]);
  const [newSpoc, setNewSpoc] = useState({ name: '', email: '', phone: '', designation: '' });
  const [showAddSpoc, setShowAddSpoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterTier !== 'All') params.set('tier', filterTier);
      if (filterStatus !== 'All') params.set('status', filterStatus);
      const data = await api.clients.list(params.toString());
      setClients(data.clients);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search, filterTier, filterStatus]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const openAdd = () => {
    setEditingClient(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const fetchClientSpocs = async (clientId: string) => {
    try {
      const res = await fetch(`${API}/api/clients/${clientId}/spocs`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      setAdditionalSpocs(data.spocs || []);
    } catch(e) { console.error(e); }
  };

  const addSpoc = async (clientId: string) => {
    if (!newSpoc.name || !newSpoc.email) return;
    try {
      await fetch(`${API}/api/clients/${clientId}/spocs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newSpoc),
      });
      setNewSpoc({ name: '', email: '', phone: '', designation: '' });
      setShowAddSpoc(false);
      fetchClientSpocs(clientId);
    } catch(e) { console.error(e); }
  };

  const removeSpoc = async (clientId: string, spocId: string) => {
    if (!confirm('Remove this SPOC?')) return;
    try {
      await fetch(`${API}/api/clients/${clientId}/spocs/${spocId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      fetchClientSpocs(clientId);
    } catch(e) { console.error(e); }
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    fetchClientSpocs(client.id);
    setForm({
      name: client.name || '',
      industry: client.industry || '',
      vertical: client.vertical || '',
      domain: client.domain || '',
      spoc_name: client.spoc_name || '',
      spoc_role: client.spoc_role || '',
      spoc_email: client.spoc_email || '',
      spoc_phone: client.spoc_phone || '',
      location: client.location || '',
      tier: client.tier || 'Silver',
      fee_percent: String(client.fee_percent || '8.33'),
      payment_terms: client.payment_terms || 'Net 30',
      contract_end_date: client.contract_end_date ? client.contract_end_date.split('T')[0] : '',
      status: client.status || 'Active',
      notes: client.notes || '',
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Client name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, fee_percent: parseFloat(form.fee_percent) || null };
      if (editingClient) {
        await api.clients.update(editingClient.id, payload);
      } else {
        await api.clients.create(payload);
      }
      setShowModal(false);
      fetchClients();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (client: Client) => {
    if (!confirm(`Delete "${client.name}"? This will also delete all their positions.`)) return;
    try {
      await api.clients.update(client.id, { ...client, status: 'Inactive' });
      fetchClients();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const tierColor = (tier: string) => {
    if (tier === 'Platinum') return 'badge-platinum';
    if (tier === 'Gold') return 'badge-gold';
    return 'badge-silver';
  };

  const statusColor = (status: string) => {
    if (status === 'Active') return 'badge-open';
    if (status === 'On Hold') return 'badge-onhold';
    return 'badge-closed';
  };

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
        </div>
        {canEdit && (
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-fx-600 hover:bg-fx-700 text-white rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Add Client
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients, SPOC, location..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
        </div>
        <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="All">All Tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="All">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Client cards */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : clients.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Building2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No clients found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {clients.map((client) => (
            <div key={client.id}
              className="bg-white rounded-xl border border-gray-100 hover:shadow-md transition-shadow overflow-hidden">
              {/* Main row */}
              <div className="p-5 flex items-center gap-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === client.id ? null : client.id)}>
                <div className="w-11 h-11 rounded-xl bg-fx-50 text-fx-700 flex items-center justify-center text-sm font-bold shrink-0">
                  {client.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{client.name}</h3>
                    <span className={clsx('badge', tierColor(client.tier))}>{client.tier}</span>
                    <span className={clsx('badge', statusColor(client.status))}>{client.status}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{client.location || '—'}</span>
                    <span>{client.domain || client.industry}</span>
                    <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{client.open_positions} open / {client.total_positions} total</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canEdit && (
                    <button onClick={(e) => { e.stopPropagation(); openEdit(client); }}
                      className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
                      <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  )}
                  <ChevronDown className={clsx('w-4 h-4 text-gray-400 transition-transform', expandedId === client.id && 'rotate-180')} />
                </div>
              </div>

              {/* Expanded details */}
              {expandedId === client.id && (
                <div className="border-t border-gray-50 px-5 py-4 bg-gray-50/50">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">SPOC</p>
                      <p className="font-medium text-gray-800">{client.spoc_name || '—'}</p>
                      {client.spoc_role && <p className="text-xs text-gray-500">{client.spoc_role}</p>}
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Contact</p>
                      {client.spoc_email && <p className="text-xs text-gray-600 flex items-center gap-1"><Mail className="w-3 h-3" />{client.spoc_email}</p>}
                      {client.spoc_phone && <p className="text-xs text-gray-600 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{client.spoc_phone}</p>}
                      {!client.spoc_email && !client.spoc_phone && <p className="text-xs text-gray-400">—</p>}
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Agreement</p>
                      <p className="text-xs text-gray-600">Fee: {client.fee_percent}%</p>
                      <p className="text-xs text-gray-600">Terms: {client.payment_terms}</p>
                      {client.contract_end_date && <p className="text-xs text-gray-600">Ends: {new Date(client.contract_end_date).toLocaleDateString()}</p>}
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Vertical / Domain</p>
                      <p className="text-xs text-gray-600">{client.vertical} — {client.domain}</p>
                      <p className="text-xs text-gray-600 mt-1">Industry: {client.industry}</p>
                    </div>
                  </div>
                  {client.notes && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-400 mb-1">Notes</p>
                      <p className="text-xs text-gray-600">{client.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{editingClient ? 'Edit Client' : 'Add Client'}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Company Name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Enter company name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vertical</label>
                  <select value={form.vertical} onChange={(e) => setForm({ ...form, vertical: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    <option value="">Select</option>
                    {VERTICALS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Domain</label>
                  <select value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    <option value="">Select</option>
                    {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Industry</label>
                  <input type="text" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. Technology" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
                  <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. Mumbai" />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">SPOC Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">SPOC Name</label>
                    <input type="text" value={form.spoc_name} onChange={(e) => setForm({ ...form, spoc_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">SPOC Role</label>
                    <input type="text" value={form.spoc_role} onChange={(e) => setForm({ ...form, spoc_role: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">SPOC Email</label>
                    <input type="email" value={form.spoc_email} onChange={(e) => setForm({ ...form, spoc_email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">SPOC Phone</label>
                    <input type="tel" value={form.spoc_phone} onChange={(e) => setForm({ ...form, spoc_phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" maxLength={10} placeholder="10 digits" />
                  </div>
                </div>
              </div>

              {/* Additional SPOCs — only show when editing existing client */}
              {editingClient && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Additional SPOCs ({additionalSpocs.length})</p>
                    <button type="button" onClick={() => setShowAddSpoc(!showAddSpoc)} className="text-xs text-fx-600 hover:text-fx-700 font-medium flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Add SPOC
                    </button>
                  </div>
                  {additionalSpocs.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {additionalSpocs.map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{s.name} {s.is_primary && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded ml-1">Primary</span>}</p>
                            <p className="text-xs text-gray-500">{s.email}{s.phone ? ` · ${s.phone}` : ''}{s.designation ? ` · ${s.designation}` : ''}</p>
                          </div>
                          <button type="button" onClick={() => removeSpoc(editingClient.id, s.id)} className="w-6 h-6 rounded hover:bg-red-50 flex items-center justify-center text-red-400 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {showAddSpoc && (
                    <div className="p-3 bg-blue-50 rounded-lg space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="Name *" value={newSpoc.name} onChange={(e) => setNewSpoc({...newSpoc, name: e.target.value})} className="px-2 py-1.5 border border-gray-200 rounded text-sm" />
                        <input type="email" placeholder="Email *" value={newSpoc.email} onChange={(e) => setNewSpoc({...newSpoc, email: e.target.value})} className="px-2 py-1.5 border border-gray-200 rounded text-sm" />
                        <input type="tel" placeholder="Phone" value={newSpoc.phone} onChange={(e) => setNewSpoc({...newSpoc, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})} className="px-2 py-1.5 border border-gray-200 rounded text-sm" maxLength={10} />
                        <input type="text" placeholder="Designation" value={newSpoc.designation} onChange={(e) => setNewSpoc({...newSpoc, designation: e.target.value})} className="px-2 py-1.5 border border-gray-200 rounded text-sm" />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button type="button" onClick={() => setShowAddSpoc(false)} className="px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded">Cancel</button>
                        <button type="button" onClick={() => addSpoc(editingClient.id)} className="px-3 py-1 text-xs bg-fx-600 hover:bg-fx-700 text-white rounded font-medium">Add</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Agreement</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tier</label>
                    <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                      {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Fee %</label>
                    <input type="number" step="0.01" value={form.fee_percent} onChange={(e) => setForm({ ...form, fee_percent: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Payment Terms</label>
                    <select value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                      {PAYMENT_TERMS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Contract End</label>
                    <input type="date" value={form.contract_end_date} onChange={(e) => setForm({ ...form, contract_end_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                </div>
              </div>

              {editingClient && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" rows={3} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-fx-600 hover:bg-fx-700 disabled:bg-fx-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                {saving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {editingClient ? 'Update Client' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
