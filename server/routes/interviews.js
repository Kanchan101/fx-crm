// routes/interviews.js — COMPLETE FRESH FILE
// Powers the main Interviews tab on homepage - date-wise view of all interviews
const express = require('express');
const router = express.Router();
const { supabase } = require('../supabaseClient');
const { authenticateToken } = require('../middleware/auth');

// GET all interviews (for main Interviews page, date-wise)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { date_from, date_to, status, round } = req.query;

    let query = supabase
      .from('interviews')
      .select(`
        *,
        candidates(id, name, email, phone, current_company, current_designation),
        requirements(id, title, clients(company_name))
      `)
      .order('scheduled_at', { ascending: true });

    if (date_from) query = query.gte('scheduled_at', date_from);
    if (date_to) query = query.lte('scheduled_at', date_to);
    if (status) query = query.eq('status', status);
    if (round) query = query.eq('round', round);

    const { data, error } = await query;
    if (error) throw error;

    // Group by date for the frontend
    const grouped = {};
    (data || []).forEach(interview => {
      const date = new Date(interview.scheduled_at).toISOString().split('T')[0];
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(interview);
    });

    res.json({ interviews: data || [], grouped });
  } catch (err) {
    console.error('Error fetching interviews:', err);
    res.status(500).json({ error: 'Failed to fetch interviews' });
  }
});

// GET single interview
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('interviews')
      .select(`
        *,
        candidates(id, name, email, phone, current_company),
        requirements(id, title, clients(company_name))
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error fetching interview:', err);
    res.status(500).json({ error: 'Failed to fetch interview' });
  }
});

// POST create interview
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { 
      requirement_id, candidate_id, scheduled_at, round, 
      mode, meeting_link, notes, interviewer_name 
    } = req.body;

    const { data, error } = await supabase
      .from('interviews')
      .insert({
        requirement_id,
        candidate_id,
        scheduled_at,
        round: round || 'L1',
        mode: mode || 'Video Call',
        meeting_link: meeting_link || '',
        notes: notes || '',
        interviewer_name: interviewer_name || '',
        status: 'Scheduled',
        created_by: req.user.id
      })
      .select(`
        *,
        candidates(id, name, email, phone),
        requirements(id, title)
      `)
      .single();

    if (error) throw error;

    // Update candidate status to Interview with round
    await supabase
      .from('requirement_candidates')
      .update({ status: 'Interview', interview_round: round || 'L1' })
      .eq('requirement_id', requirement_id)
      .eq('candidate_id', candidate_id);

    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating interview:', err);
    res.status(500).json({ error: 'Failed to create interview' });
  }
});

// PUT update interview
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('interviews')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error updating interview:', err);
    res.status(500).json({ error: 'Failed to update interview' });
  }
});

// DELETE interview
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('interviews')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Interview deleted' });
  } catch (err) {
    console.error('Error deleting interview:', err);
    res.status(500).json({ error: 'Failed to delete interview' });
  }
});

module.exports = router;
