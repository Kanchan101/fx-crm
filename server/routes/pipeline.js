// routes/pipeline.js — COMPLETE FRESH FILE
const express = require('express');
const router = express.Router();
const { supabase } = require('../supabaseClient');
const { authenticateToken } = require('../middleware/auth');

const VALID_STATUSES = [
  'AM Review Pending',
  'AM Review Select',
  'Client Review Pending',
  'Interview',
  'Offered',
  'Joined',
  'Rejected',
  'On Hold',
  'Dropped'
];

// GET pipeline data for a requirement (used by Kanban board)
router.get('/requirement/:requirementId', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('requirement_candidates')
      .select(`
        *,
        candidates(id, name, email, phone, current_company, current_designation,
                   experience, skills, resume_url, location, current_ctc, expected_ctc, notice_period)
      `)
      .eq('requirement_id', req.params.requirementId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Group by status for Kanban
    const pipeline = {};
    VALID_STATUSES.forEach(s => { pipeline[s] = []; });
    (data || []).forEach(item => {
      if (pipeline[item.status]) {
        pipeline[item.status].push(item);
      }
    });

    res.json({ pipeline, candidates: data || [] });
  } catch (err) {
    console.error('Error fetching pipeline:', err);
    res.status(500).json({ error: 'Failed to fetch pipeline data' });
  }
});

// GET global pipeline overview (all requirements)
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('requirement_candidates')
      .select(`
        *,
        candidates(id, name, email, phone, current_company),
        requirements(id, title, clients(company_name))
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const pipeline = {};
    VALID_STATUSES.forEach(s => { pipeline[s] = []; });
    (data || []).forEach(item => {
      if (pipeline[item.status]) {
        pipeline[item.status].push(item);
      }
    });

    res.json({ pipeline, total: (data || []).length });
  } catch (err) {
    console.error('Error fetching pipeline overview:', err);
    res.status(500).json({ error: 'Failed to fetch pipeline overview' });
  }
});

// PATCH update candidate status (drag & drop in Kanban)
router.patch('/move', authenticateToken, async (req, res) => {
  try {
    const { requirement_id, candidate_id, status, reject_reason, drop_reason, hold_reason, interview_round } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateData = { status };
    if (status === 'Rejected' && reject_reason) updateData.reject_reason = reject_reason;
    if (status === 'Dropped' && drop_reason) updateData.drop_reason = drop_reason;
    if (status === 'On Hold' && hold_reason) updateData.hold_reason = hold_reason;
    if (status === 'Interview' && interview_round) updateData.interview_round = interview_round;

    if (!['Rejected', 'On Hold', 'Dropped'].includes(status)) {
      updateData.reject_reason = null;
      updateData.drop_reason = null;
      updateData.hold_reason = null;
    }

    const { data, error } = await supabase
      .from('requirement_candidates')
      .update(updateData)
      .eq('requirement_id', requirement_id)
      .eq('candidate_id', candidate_id)
      .select(`*, candidates(id, name, email, phone)`)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error moving candidate:', err);
    res.status(500).json({ error: 'Failed to update candidate status' });
  }
});

module.exports = router;
