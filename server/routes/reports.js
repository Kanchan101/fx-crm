// routes/reports.js — COMPLETE FRESH FILE
const express = require('express');
const router = express.Router();
const { supabase } = require('../supabaseClient');
const { authenticateToken } = require('../middleware/auth');

// GET dashboard stats
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    // Total candidates
    const { count: totalCandidates } = await supabase
      .from('candidates')
      .select('*', { count: 'exact', head: true });

    // Total requirements
    const { count: totalRequirements } = await supabase
      .from('requirements')
      .select('*', { count: 'exact', head: true });

    // Active requirements (Open)
    const { count: activeRequirements } = await supabase
      .from('requirements')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Open');

    // Total clients
    const { count: totalClients } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true });

    // Pipeline status counts
    const { data: pipeline } = await supabase
      .from('requirement_candidates')
      .select('status');

    const statusCounts = {};
    (pipeline || []).forEach(p => {
      statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
    });

    // Interviews this week
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const { count: interviewsThisWeek } = await supabase
      .from('interviews')
      .select('*', { count: 'exact', head: true })
      .gte('scheduled_at', weekStart.toISOString())
      .lt('scheduled_at', weekEnd.toISOString());

    // Placements (Joined)
    const joinedCount = statusCounts['Joined'] || 0;

    // Offers
    const offeredCount = statusCounts['Offered'] || 0;

    // Submitted to client
    const submittedCount = statusCounts['Client Review Pending'] || 0;

    res.json({
      totalCandidates: totalCandidates || 0,
      totalRequirements: totalRequirements || 0,
      activeRequirements: activeRequirements || 0,
      totalClients: totalClients || 0,
      interviewsThisWeek: interviewsThisWeek || 0,
      placements: joinedCount,
      offers: offeredCount,
      submitted: submittedCount,
      statusCounts,
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// GET team performance report
router.get('/team-performance', authenticateToken, async (req, res) => {
  try {
    const { data: team } = await supabase
      .from('users')
      .select('id, name, email, role');

    const { data: allPipeline } = await supabase
      .from('requirement_candidates')
      .select('added_by, status');

    const performance = (team || []).map(member => {
      const memberPipeline = (allPipeline || []).filter(p => p.added_by === member.id);
      return {
        ...member,
        total_sourced: memberPipeline.length,
        am_review: memberPipeline.filter(p => p.status === 'AM Review Pending').length,
        am_selected: memberPipeline.filter(p => p.status === 'AM Review Select').length,
        submitted: memberPipeline.filter(p => p.status === 'Client Review Pending').length,
        interviews: memberPipeline.filter(p => p.status === 'Interview').length,
        offered: memberPipeline.filter(p => p.status === 'Offered').length,
        joined: memberPipeline.filter(p => p.status === 'Joined').length,
        rejected: memberPipeline.filter(p => p.status === 'Rejected').length,
      };
    });

    res.json(performance);
  } catch (err) {
    console.error('Error fetching team performance:', err);
    res.status(500).json({ error: 'Failed to fetch team performance' });
  }
});

module.exports = router;
