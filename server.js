// Load .env.local for local development, Railway provides env vars directly
require('dotenv').config({ path: '.env.local' });
require('dotenv').config(); // Also try .env as fallback

const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database on startup
let dbInitialized = false;
const initializeDatabase = async () => {
  if (process.env.DATABASE_URL) {
    try {
      const db = require('./api/utils/db');
      await db.initDb();
      dbInitialized = true;
      console.log('[Server] Database initialized successfully');
    } catch (error) {
      console.error('[Server] Database initialization failed:', error.message);
    }
  } else {
    console.log('[Server] No database connection info - database features disabled');
  }
};

// CORS configuration - allow all origins for development and production
const corsOptions = {
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Cron-Secret'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600 // Cache preflight for 10 minutes
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Helper to convert Vercel handler to Express
const vercelToExpress = (handlerPath) => async (req, res) => {
  try {
    // Set CORS headers explicitly for all API responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Cron-Secret');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Lazy load the handler to ensure env vars are available
    const handler = require(handlerPath);
    await handler(req, res);
  } catch (error) {
    console.error('API Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  }
};

// API Routes - lazy load handlers
// Auth routes (no auth required on these)
app.all('/api/auth/login', vercelToExpress('./api/auth/login'));
app.all('/api/auth/logout', vercelToExpress('./api/auth/logout'));

// Data routes
app.all('/api/contacts', vercelToExpress('./api/contacts'));
app.all('/api/tasks', vercelToExpress('./api/tasks'));
app.all('/api/memory', vercelToExpress('./api/memory'));
app.all('/api/ai-marketing-bot', vercelToExpress('./api/ai-marketing-bot'));
app.all('/api/ai-secretary-bot', vercelToExpress('./api/ai-secretary-bot'));
app.all('/api/sales-automation', vercelToExpress('./api/sales-automation'));
app.all('/api/web-prospector', vercelToExpress('./api/web-prospector'));
app.all('/api/automation-scheduler', vercelToExpress('./api/automation-scheduler'));
app.all('/api/automation-settings', vercelToExpress('./api/automation-settings'));
app.all('/api/migrate-db', vercelToExpress('./api/migrate-db'));

// Page routes - serve HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mf-landing-page.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/ai-chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ai-chat-widget.html'));
});

app.get('/ai-assistants', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ai-chat-widget.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      database: !!process.env.DATABASE_URL,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      dbInitialized: dbInitialized
    }
  });
});

// Start server
const startServer = async () => {
  // Initialize database before starting
  await initializeDatabase();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Database: ${process.env.DATABASE_URL ? 'Connected (Supabase)' : 'Not connected'}`);
    console.log(`Anthropic API: ${process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set'}`);
  });
};

startServer();
