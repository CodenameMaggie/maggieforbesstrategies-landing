require('dotenv').config({ path: '.env.local' });

const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Helper to convert Vercel handler to Express
const vercelToExpress = (handlerPath) => async (req, res) => {
  try {
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
app.all('/api/contacts', vercelToExpress('./api/contacts'));
app.all('/api/tasks', vercelToExpress('./api/tasks'));
app.all('/api/memory', vercelToExpress('./api/memory'));
app.all('/api/ai-marketing-bot', vercelToExpress('./api/ai-marketing-bot'));
app.all('/api/ai-secretary-bot', vercelToExpress('./api/ai-secretary-bot'));

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
      supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      anthropic: !!process.env.ANTHROPIC_API_KEY
    }
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Not set'}`);
});
