require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const teamRoutes = require('./routes/team');
const requirementRoutes = require('./routes/requirements');
const candidateRoutes = require('./routes/candidates');
const pipelineRoutes = require('./routes/pipeline');
const interviewRoutes = require('./routes/interviews');
const reportRoutes = require('./routes/reports');
const outreachRoutes = require('./routes/outreach');
const spocRoutes = require('./routes/spocs');
const sendcvRoutes = require('./routes/sendcv');
const { authenticate } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 4000;

// Performance middleware
app.use(compression());  // Gzip all responses — 60-80% size reduction
app.use(helmet());
app.use(morgan('short')); // Shorter logs — less overhead
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

// Rate limiting
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many attempts' } });
const apiLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 200, message: { error: 'Rate limit exceeded' } });

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/clients', authenticate, apiLimiter, clientRoutes);
app.use('/api/clients', authenticate, apiLimiter, spocRoutes);
app.use('/api/team', authenticate, apiLimiter, teamRoutes);
app.use('/api/requirements', authenticate, apiLimiter, requirementRoutes);
app.use('/api/candidates', authenticate, apiLimiter, candidateRoutes);
app.use('/api/pipeline', authenticate, apiLimiter, pipelineRoutes);
app.use('/api/interviews', authenticate, apiLimiter, interviewRoutes);
app.use('/api/reports', authenticate, apiLimiter, reportRoutes);
app.use('/api/outreach', authenticate, outreachRoutes);
app.use('/api/send-cv', authenticate, sendcvRoutes);

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`FX CRM API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`DB pool: max 30 connections`);
});
