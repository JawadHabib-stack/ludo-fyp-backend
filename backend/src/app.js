// Express app: middleware, routes, 404 handler and error handler.
const express = require('express');
const cors = require('cors');
const { pool } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(cors());
app.use(express.json());

// Health check: confirms the server is up and MySQL answers.
app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ success: true, data: { status: 'ok', db: 'ok' } });
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/friends', require('./routes/friendRoutes'));
app.use('/api/rule-sets', require('./routes/ruleSetRoutes'));
app.use('/api/matches', require('./routes/matchRoutes'));
app.use('/api/rooms', require('./routes/roomRoutes'));
app.use('/api/tournaments', require('./routes/tournamentRoutes'));

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use(errorHandler);

module.exports = app;
