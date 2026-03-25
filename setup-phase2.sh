#!/bin/bash
# FX CRM Phase 2 — Clients + Team Modules
# Run from: cd /Users/kanchankuwarbi/Downloads/fx-crm && bash setup-phase2.sh

set -e
echo "🚀 FX CRM Phase 2 — Clients + Team Modules"
echo ""

# ========================
# BACKEND: server/routes/clients.js
# ========================
cat > server/routes/clients.js << 'ENDOFFILE'
const express = require('express');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/clients — list all clients with filters
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, tier, vertical, search, sort_by, sort_order } = req.query;
    let sql = `
      SELECT c.*,
        (SELECT COUNT(*) FROM jobs j WHERE j.client_id = c.id AND j.status = 'Open') as open_positions,
        (SELECT COUNT(*) FROM jobs j WHERE j.client_id = c.id) as total_positions,
        t.name as created_by_name
      FROM clients c
      LEFT JOIN team t ON t.id = c.created_by
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (status && status !== 'All') {
      sql += ` AND c.status = $${paramIdx++}`;
      params.push(status);
    }
    if (tier && tier !== 'All') {
      sql += ` AND c.tier = $${paramIdx++}`;
      params.push(tier);
    }
    if (vertical && vertical !== 'All') {
      sql += ` AND c.vertical = $${paramIdx++}`;
      params.push(vertical);
    }
    if (search) {
      sql += ` AND (LOWER(c.name) LIKE $${paramIdx} OR LOWER(c.spoc_name) LIKE $${paramIdx} OR LOWER(c.location) LIKE $${paramIdx})`;
      params.push(`%${search.toLowerCase()}%`);
      paramIdx++;
    }

    const validSorts = ['name', 'tier', 'status', 'created_at', 'location'];
    const sortCol = validSorts.includes(sort_by) ? sort_by : 'created_at';
    const sortDir = sort_order === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY c.${sortCol} ${sortDir}`;

    const result = await query(sql, params);
    res.json({ clients: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('List clients error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/clients/:id — single client with positions
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, t.name as created_by_name FROM clients c
       LEFT JOIN team t ON t.id = c.created_by WHERE c.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });

    const positions = await query(
      `SELECT j.*, (SELECT COUNT(*) FROM pipeline p WHERE p.job_id = j.id) as candidates_count
       FROM jobs j WHERE j.client_id = $1 ORDER BY j.created_at DESC`,
      [req.params.id]
    );

    res.json({ client: result.rows[0], positions: positions.rows });
  } catch (err) {
    console.error('Get client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/clients — create client (AM + Super Admin only)
router.post('/', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const {
      name, industry, vertical, domain, spoc_name, spoc_role, spoc_email, spoc_phone,
      location, tier, fee_percent, payment_terms, contract_end_date, notes
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Client name is required' });

    const result = await query(
      `INSERT INTO clients (name, industry, vertical, domain, spoc_name, spoc_role, spoc_email, spoc_phone,
        location, tier, fee_percent, payment_terms, contract_end_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [name, industry, vertical, domain, spoc_name, spoc_role, spoc_email, spoc_phone,
       location, tier, fee_percent || null, payment_terms, contract_end_date || null, notes, req.user.id]
    );

    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'CREATE', 'client', result.rows[0].id, JSON.stringify({ name })]
    );

    res.status(201).json({ client: result.rows[0] });
  } catch (err) {
    console.error('Create client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/clients/:id — update client
router.put('/:id', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const {
      name, industry, vertical, domain, spoc_name, spoc_role, spoc_email, spoc_phone,
      location, tier, fee_percent, payment_terms, contract_end_date, status, notes
    } = req.body;

    const result = await query(
      `UPDATE clients SET
        name=$1, industry=$2, vertical=$3, domain=$4, spoc_name=$5, spoc_role=$6,
        spoc_email=$7, spoc_phone=$8, location=$9, tier=$10, fee_percent=$11,
        payment_terms=$12, contract_end_date=$13, status=$14, notes=$15, updated_at=NOW()
       WHERE id=$16 RETURNING *`,
      [name, industry, vertical, domain, spoc_name, spoc_role, spoc_email, spoc_phone,
       location, tier, fee_percent || null, payment_terms, contract_end_date || null, status, notes, req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });

    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'UPDATE', 'client', req.params.id, JSON.stringify({ name })]
    );

    res.json({ client: result.rows[0] });
  } catch (err) {
    console.error('Update client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/clients/:id — Super Admin only
router.delete('/:id', authenticate, authorize('Super Admin'), async (req, res) => {
  try {
    const result = await query('DELETE FROM clients WHERE id = $1 RETURNING name', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });

    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'DELETE', 'client', req.params.id, JSON.stringify({ name: result.rows[0].name })]
    );

    res.json({ message: 'Client deleted' });
  } catch (err) {
    console.error('Delete client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
ENDOFFILE
echo "✅ server/routes/clients.js"

# ========================
# BACKEND: server/routes/team.js
# ========================
cat > server/routes/team.js << 'ENDOFFILE'
const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/team — list all team members with stats
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT t.id, t.name, t.email, t.role, t.phone, t.is_active, t.last_login, t.created_at,
        (SELECT COUNT(*) FROM candidates c WHERE c.owner_id = t.id) as total_candidates,
        (SELECT COUNT(*) FROM pipeline p
         JOIN candidates c ON c.id = p.candidate_id
         WHERE c.owner_id = t.id AND p.status = 'Submitted to Client'
         AND p.created_at >= DATE_TRUNC('month', NOW())) as monthly_submissions,
        (SELECT COUNT(*) FROM pipeline p
         JOIN candidates c ON c.id = p.candidate_id
         WHERE c.owner_id = t.id AND p.status = 'Joined') as total_placements,
        (SELECT COUNT(*) FROM job_assignments ja WHERE ja.team_member_id = t.id) as assigned_positions
      FROM team t
      ORDER BY t.role, t.name
    `);
    res.json({ team: result.rows });
  } catch (err) {
    console.error('List team error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/team/:id — single team member
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, email, role, phone, is_active, last_login, created_at FROM team WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Team member not found' });
    res.json({ member: result.rows[0] });
  } catch (err) {
    console.error('Get team member error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/team — add team member (Super Admin only)
router.post('/', authenticate, authorize('Super Admin'), async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    }

    const validRoles = ['Super Admin', 'Account Manager', 'Recruiter'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existing = await query('SELECT id FROM team WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO team (name, email, password_hash, role, phone) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, phone, is_active, created_at',
      [name, email, hash, role, phone || null]
    );

    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'CREATE', 'team', result.rows[0].id, JSON.stringify({ name, role })]
    );

    res.status(201).json({ member: result.rows[0] });
  } catch (err) {
    console.error('Create team member error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/team/:id — update team member (Super Admin only)
router.put('/:id', authenticate, authorize('Super Admin'), async (req, res) => {
  try {
    const { name, email, role, phone, is_active, password } = req.body;

    let sql, params;
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      sql = `UPDATE team SET name=$1, email=$2, role=$3, phone=$4, is_active=$5, password_hash=$6, updated_at=NOW() WHERE id=$7
             RETURNING id, name, email, role, phone, is_active, created_at`;
      params = [name, email, role, phone || null, is_active, hash, req.params.id];
    } else {
      sql = `UPDATE team SET name=$1, email=$2, role=$3, phone=$4, is_active=$5, updated_at=NOW() WHERE id=$6
             RETURNING id, name, email, role, phone, is_active, created_at`;
      params = [name, email, role, phone || null, is_active, req.params.id];
    }

    const result = await query(sql, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Team member not found' });

    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'UPDATE', 'team', req.params.id, JSON.stringify({ name, role })]
    );

    res.json({ member: result.rows[0] });
  } catch (err) {
    console.error('Update team member error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
ENDOFFILE
echo "✅ server/routes/team.js"

# ========================
# BACKEND: Update server/index.js to mount new routes
# ========================
cat > server/index.js << 'ENDOFFILE'
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const teamRoutes = require('./routes/team');
const { authenticate } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const allowedOrigins = [
  'http://localhost:3000',
  'https://crm.fxconsulting.in',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { error: 'Too many login attempts, try again later' },
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/clients', authenticate, clientRoutes);
app.use('/api/team', authenticate, teamRoutes);

// Future routes:
// app.use('/api/requirements', authenticate, requirementRoutes);
// app.use('/api/candidates', authenticate, candidateRoutes);
// app.use('/api/pipeline', authenticate, pipelineRoutes);
// app.use('/api/interviews', authenticate, interviewRoutes);
// app.use('/api/reports', authenticate, reportRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => { console.log(`FX CRM API running on port ${PORT}`); });
ENDOFFILE
echo "✅ server/index.js (updated with clients + team routes)"

# ========================
# FRONTEND: Clients page
# ========================
cat > "src/app/(dashboard)/clients/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
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

  const openEdit = (client: Client) => {
    setEditingClient(client);
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
ENDOFFILE
echo "✅ src/app/(dashboard)/clients/page.tsx"

# ========================
# FRONTEND: Team page
# ========================
cat > "src/app/(dashboard)/team/page.tsx" << 'ENDOFFILE'
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
ENDOFFILE
echo "✅ src/app/(dashboard)/team/page.tsx"

echo ""
echo "=========================================="
echo "🎉 Phase 2 setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Restart backend:  cd server && Ctrl+C && node index.js"
echo "  2. Frontend auto-reloads (or restart: cd .. && npm run dev)"
echo "  3. Test: Login → Clients → Add/Edit clients"
echo "  4. Test: Login → Team → View stats, add members"
echo "  5. Deploy: git add . && git commit -m 'Phase 2: Clients + Team' && git push"
echo ""
