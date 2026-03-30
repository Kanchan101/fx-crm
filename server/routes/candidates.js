// routes/candidates.js — COMPLETE FRESH FILE
const express = require('express');
const router = express.Router();
const { supabase } = require('../supabaseClient');
const { authenticateToken } = require('../middleware/auth');

// GET all candidates
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, skills, experience_min, experience_max, page = 1, limit = 50 } = req.query;
    
    let query = supabase
      .from('candidates')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,current_company.ilike.%${search}%`);
    }
    if (skills) {
      query = query.ilike('skills', `%${skills}%`);
    }
    if (experience_min) {
      query = query.gte('experience', parseFloat(experience_min));
    }
    if (experience_max) {
      query = query.lte('experience', parseFloat(experience_max));
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ candidates: data || [], total: count || 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('Error fetching candidates:', err);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

// GET single candidate
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    // Get all requirement mappings for this candidate
    const { data: reqMappings } = await supabase
      .from('requirement_candidates')
      .select(`
        *,
        requirements(id, title, clients(company_name))
      `)
      .eq('candidate_id', req.params.id);

    // Get interviews
    const { data: interviews } = await supabase
      .from('interviews')
      .select('*')
      .eq('candidate_id', req.params.id)
      .order('scheduled_at', { ascending: false });

    res.json({ ...data, requirements: reqMappings || [], interviews: interviews || [] });
  } catch (err) {
    console.error('Error fetching candidate:', err);
    res.status(500).json({ error: 'Failed to fetch candidate' });
  }
});

// POST create candidate
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      name, email, phone, current_company, current_designation,
      experience, skills, resume_url, location, current_ctc, expected_ctc,
      notice_period, source, notes
    } = req.body;

    // Check duplicate by email or phone
    if (email) {
      const { data: existing } = await supabase
        .from('candidates')
        .select('id')
        .eq('email', email)
        .single();
      if (existing) {
        return res.status(400).json({ error: 'Candidate with this email already exists', existing_id: existing.id });
      }
    }

    const { data, error } = await supabase
      .from('candidates')
      .insert({
        name, email, phone, current_company, current_designation,
        experience: experience ? parseFloat(experience) : null,
        skills, resume_url, location, 
        current_ctc: current_ctc ? parseFloat(current_ctc) : null,
        expected_ctc: expected_ctc ? parseFloat(expected_ctc) : null,
        notice_period, source: source || 'Manual',
        notes, created_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating candidate:', err);
    res.status(500).json({ error: 'Failed to create candidate' });
  }
});

// PUT update candidate
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('candidates')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error updating candidate:', err);
    res.status(500).json({ error: 'Failed to update candidate' });
  }
});

// DELETE candidate
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    // Remove from all requirements first
    await supabase
      .from('requirement_candidates')
      .delete()
      .eq('candidate_id', req.params.id);

    const { error } = await supabase
      .from('candidates')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Candidate deleted successfully' });
  } catch (err) {
    console.error('Error deleting candidate:', err);
    res.status(500).json({ error: 'Failed to delete candidate' });
  }
});

// POST upload resume and parse with AI
router.post('/upload-resume', authenticateToken, async (req, res) => {
  try {
    const { file_url, file_name, requirement_id } = req.body;

    if (!file_url) {
      return res.status(400).json({ error: 'file_url is required' });
    }

    // Fetch the PDF content
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(file_url);
    const buffer = await response.buffer();
    const base64Content = buffer.toString('base64');

    // Parse with Claude Haiku
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const aiResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20241022',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [{
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64Content }
        }, {
          type: 'text',
          text: `Parse this resume and extract the following in JSON format only (no markdown, no backticks):
{
  "name": "",
  "email": "",
  "phone": "",
  "current_company": "",
  "current_designation": "",
  "experience": 0,
  "skills": "",
  "location": "",
  "current_ctc": null,
  "expected_ctc": null,
  "notice_period": ""
}
Experience should be a number in years. Skills should be comma-separated. CTC in LPA if mentioned, else null.`
        }]
      }]
    });

    let parsed;
    const aiText = aiResponse.content[0].text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    // Remove null bytes that can break PostgreSQL
    const cleanText = aiText.replace(/\0/g, '');
    parsed = JSON.parse(cleanText);

    // Check for duplicate
    let existingCandidate = null;
    if (parsed.email) {
      const { data: dup } = await supabase
        .from('candidates')
        .select('*')
        .eq('email', parsed.email)
        .single();
      existingCandidate = dup;
    }

    let candidate;
    if (existingCandidate) {
      // Update existing
      const { data } = await supabase
        .from('candidates')
        .update({ ...parsed, resume_url: file_url })
        .eq('id', existingCandidate.id)
        .select()
        .single();
      candidate = data;
    } else {
      // Create new
      const { data } = await supabase
        .from('candidates')
        .insert({ ...parsed, resume_url: file_url, source: 'Resume Upload', created_by: req.user.id })
        .select()
        .single();
      candidate = data;
    }

    // Add to requirement if provided, with default status AM Review Pending
    if (requirement_id && candidate) {
      const { data: existingLink } = await supabase
        .from('requirement_candidates')
        .select('id')
        .eq('requirement_id', requirement_id)
        .eq('candidate_id', candidate.id)
        .single();

      if (!existingLink) {
        await supabase
          .from('requirement_candidates')
          .insert({
            requirement_id,
            candidate_id: candidate.id,
            status: 'AM Review Pending',
            added_by: req.user.id
          });
      }
    }

    res.json({ candidate, parsed, is_duplicate: !!existingCandidate });
  } catch (err) {
    console.error('Error uploading resume:', err);
    res.status(500).json({ error: 'Failed to process resume' });
  }
});

module.exports = router;
