const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Cron-Secret, X-Tenant-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// API Routes - Lazy load from /api directory (only when requested)
const apiDir = path.join(__dirname, 'api');
const apiHandlerCache = {};

app.all('/api/*', async (req, res, next) => {
  const apiPath = req.path.replace('/api/', '');
  const parts = apiPath.split('/');

  let filePath;
  let routeKey;

  // Handle nested routes (e.g., /api/auth/login)
  if (parts.length === 2) {
    routeKey = `${parts[0]}/${parts[1]}`;
    filePath = path.join(apiDir, parts[0], `${parts[1]}.js`);
  } else {
    routeKey = parts[0];
    filePath = path.join(apiDir, `${parts[0]}.js`);
  }

  try {
    // Check if handler is cached
    if (!apiHandlerCache[routeKey]) {
      if (fs.existsSync(filePath)) {
        // Lazy load the handler
        apiHandlerCache[routeKey] = require(filePath);
        console.log(`✓ Loaded API route: /api/${routeKey}`);
      } else {
        return res.status(404).json({ error: `API endpoint /api/${routeKey} not found` });
      }
    }

    // Call the handler
    await apiHandlerCache[routeKey](req, res);
  } catch (error) {
    console.error(`Error in /api/${routeKey}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Route rewrites (from vercel.json)
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

// Health check for Railway
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
    if (err) {
      res.status(404).send('Page not found');
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
