// routes/requirements.js — COMPLETE FRESH FILE
const express = require('express');
const router = express.Router();
const { supabase } = require('../supabaseClient');
const { authenticateToken } = require('../middleware/auth');

// Valid pipeline statuses
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

const EXIT_STATUSES = ['Rejected', 'On Hold', 'Dropped'];

// Interview rounds
const INTERVIEW_ROUNDS = ['L1', 'L2', 'L3', 'L4', 'HR'];

// GET all requirements
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('requirements')
      .select(`
        *,
        clients(company_name),
        requirement_candidates(id, status)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const enriched = (data || []).map(req => ({
      ...req,
      client_name: req.clients?.company_name || 'Unknown',
      total_candidates: req.requirement_candidates?.length || 0,
      active_candidates: req.requirement_candidates?.filter(
        c => !EXIT_STATUSES.includes(c.status)
      ).length || 0,
    }));

    res.json(enriched);
  } catch (err) {
    console.error('Error fetching requirements:', err);
    res.status(500).json({ error: 'Failed to fetch requirements' });
  }
});

// GET single requirement with candidates
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { data: requirement, error: reqError } = await supabase
      .from('requirements')
      .select(`
        *,
        clients(id, company_name, contact_email),
        spocs(id, name, email, phone, designation)
      `)
      .eq('id', req.params.id)
      .single();

    if (reqError) throw reqError;

    // Get candidates with their details
    const { data: candidates, error: candError } = await supabase
      .from('requirement_candidates')
      .select(`
        *,
        candidates(id, name, email, phone, current_company, current_designation, 
                   experience, skills, resume_url, location, current_ctc, expected_ctc, notice_period)
      `)
      .eq('requirement_id', req.params.id)
      .order('created_at', { ascending: false });

    if (candError) throw candError;

    // Get interviews for this requirement
    const candidateIds = (candidates || []).map(c => c.candidate_id);
    let interviews = [];
    if (candidateIds.length > 0) {
      const { data: intData } = await supabase
        .from('interviews')
        .select('*')
        .eq('requirement_id', req.params.id)
        .order('scheduled_at', { ascending: true });
      interviews = intData || [];
    }

    res.json({
      ...requirement,
      client_name: requirement.clients?.company_name || 'Unknown',
      client_email: requirement.clients?.contact_email || '',
      spocs: requirement.spocs || [],
      candidates: candidates || [],
      interviews,
    });
  } catch (err) {
    console.error('Error fetching requirement:', err);
    res.status(500).json({ error: 'Failed to fetch requirement' });
  }
});

// POST create requirement
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      title, client_id, description, skills_required, experience_min, experience_max,
      budget_min, budget_max, location, positions, priority, assigned_to, status
    } = req.body;

    const { data, error } = await supabase
      .from('requirements')
      .insert({
        title, client_id, description, skills_required, experience_min, experience_max,
        budget_min, budget_max, location, positions: positions || 1,
        priority: priority || 'Medium', assigned_to, status: status || 'Open',
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating requirement:', err);
    res.status(500).json({ error: 'Failed to create requirement' });
  }
});

// PUT update requirement
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('requirements')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error updating requirement:', err);
    res.status(500).json({ error: 'Failed to update requirement' });
  }
});

// DELETE requirement
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('requirements')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Requirement deleted successfully' });
  } catch (err) {
    console.error('Error deleting requirement:', err);
    res.status(500).json({ error: 'Failed to delete requirement' });
  }
});

// PATCH update candidate status in pipeline
router.patch('/:id/candidates/:candidateId/status', authenticateToken, async (req, res) => {
  try {
    const { status, reject_reason, drop_reason, hold_reason, interview_round } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid status. Valid statuses: ${VALID_STATUSES.join(', ')}` 
      });
    }

    const updateData = { status };

    // Add reason if it's an exit status
    if (status === 'Rejected' && reject_reason) updateData.reject_reason = reject_reason;
    if (status === 'Dropped' && drop_reason) updateData.drop_reason = drop_reason;
    if (status === 'On Hold' && hold_reason) updateData.hold_reason = hold_reason;

    // Add interview round if moving to Interview
    if (status === 'Interview' && interview_round) {
      updateData.interview_round = interview_round;
    }

    // Clear reasons when moving out of exit status
    if (!EXIT_STATUSES.includes(status)) {
      updateData.reject_reason = null;
      updateData.drop_reason = null;
      updateData.hold_reason = null;
    }

    const { data, error } = await supabase
      .from('requirement_candidates')
      .update(updateData)
      .eq('requirement_id', req.params.id)
      .eq('candidate_id', req.params.candidateId)
      .select(`
        *,
        candidates(id, name, email, phone)
      `)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error updating candidate status:', err);
    res.status(500).json({ error: 'Failed to update candidate status' });
  }
});

// POST add candidate to requirement
router.post('/:id/candidates', authenticateToken, async (req, res) => {
  try {
    const { candidate_id } = req.body;

    // Check if already added
    const { data: existing } = await supabase
      .from('requirement_candidates')
      .select('id')
      .eq('requirement_id', req.params.id)
      .eq('candidate_id', candidate_id)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Candidate already added to this requirement' });
    }

    const { data, error } = await supabase
      .from('requirement_candidates')
      .insert({
        requirement_id: req.params.id,
        candidate_id,
        status: 'AM Review Pending',
        added_by: req.user.id
      })
      .select(`
        *,
        candidates(id, name, email, phone, current_company, current_designation, 
                   experience, skills, resume_url, location)
      `)
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error adding candidate:', err);
    res.status(500).json({ error: 'Failed to add candidate to requirement' });
  }
});

// DELETE remove candidate from requirement
router.delete('/:id/candidates/:candidateId', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('requirement_candidates')
      .delete()
      .eq('requirement_id', req.params.id)
      .eq('candidate_id', req.params.candidateId);

    if (error) throw error;
    res.json({ message: 'Candidate removed from requirement' });
  } catch (err) {
    console.error('Error removing candidate:', err);
    res.status(500).json({ error: 'Failed to remove candidate' });
  }
});

// POST schedule interview for a candidate
router.post('/:id/candidates/:candidateId/interview', authenticateToken, async (req, res) => {
  try {
    const { scheduled_at, round, mode, meeting_link, notes, interviewer_name } = req.body;
    const round_label = round || 'L1';

    // Insert into interviews table
    const { data: interview, error } = await supabase
      .from('interviews')
      .insert({
        requirement_id: req.params.id,
        candidate_id: req.params.candidateId,
        scheduled_at,
        round: round_label,
        mode: mode || 'Video Call',
        meeting_link: meeting_link || '',
        notes: notes || '',
        interviewer_name: interviewer_name || '',
        status: 'Scheduled',
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;

    // Also update candidate status to Interview with round info
    await supabase
      .from('requirement_candidates')
      .update({ 
        status: 'Interview', 
        interview_round: round_label 
      })
      .eq('requirement_id', req.params.id)
      .eq('candidate_id', req.params.candidateId);

    res.status(201).json(interview);
  } catch (err) {
    console.error('Error scheduling interview:', err);
    res.status(500).json({ error: 'Failed to schedule interview' });
  }
});

module.exports = router;
