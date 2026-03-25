const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { generateToken, authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const result = await query(
      'SELECT id, name, email, password_hash, role, is_active FROM team WHERE LOWER(email) = LOWER($1)', [email.trim()]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'Account is deactivated' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    await query('UPDATE team SET last_login = NOW() WHERE id = $1', [user.id]);
    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)',
      [user.id, 'LOGIN', 'auth', JSON.stringify({ ip: req.ip })]
    );

    const token = generateToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, email, role, phone, is_active, last_login, created_at FROM team WHERE id = $1', [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', authenticate, async (req, res) => {
  try {
    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'LOGOUT', 'auth', '{}']
    );
    res.json({ message: 'Logged out' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
