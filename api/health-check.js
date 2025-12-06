/**
 * Health Check & Environment Diagnostic Endpoint
 * Checks if required environment variables and database are configured
 */

const db = require('./utils/db');

module.exports = async (req, res) => {
  const checks = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    environment: {},
    database: {},
    errors: []
  };

  try {
    // Check environment variables (don't expose actual values)
    checks.environment = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Missing',
      PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY ? '✅ Set' : '❌ Missing',
      OPEN_API_KEY: process.env.OPEN_API_KEY ? '✅ Set' : '❌ Missing',
      DATABASE_URL: process.env.DATABASE_URL ? '✅ Set' : '❌ Missing',
      MFS_TENANT_ID: process.env.MFS_TENANT_ID ? '✅ Set' : '❌ Missing',
      NODE_ENV: process.env.NODE_ENV || 'development'
    };

    // Check database connection
    try {
      const result = await db.queryOne('SELECT NOW() as current_time');
      checks.database.connection = '✅ Connected';
      checks.database.timestamp = result.current_time;

      // Check if key tables exist
      const tables = ['contacts', 'tasks', 'ai_conversations', 'users', 'contact_activities'];
      checks.database.tables = {};

      for (const table of tables) {
        try {
          const count = await db.queryOne(`SELECT COUNT(*) as count FROM ${table}`);
          checks.database.tables[table] = `✅ Exists (${count.count} rows)`;
        } catch (err) {
          checks.database.tables[table] = '❌ Missing or inaccessible';
          checks.errors.push(`Table ${table}: ${err.message}`);
        }
      }
    } catch (err) {
      checks.database.connection = '❌ Failed';
      checks.database.error = err.message;
      checks.errors.push(`Database: ${err.message}`);
      checks.status = 'unhealthy';
    }

    // Check critical missing configs
    if (!process.env.ANTHROPIC_API_KEY) {
      checks.errors.push('ANTHROPIC_API_KEY is required for AI assistants');
      checks.status = 'degraded';
    }

    if (!process.env.DATABASE_URL) {
      checks.errors.push('DATABASE_URL is required');
      checks.status = 'unhealthy';
    }

  } catch (error) {
    checks.status = 'error';
    checks.errors.push(error.message);
  }

  // Return appropriate status code
  const statusCode = checks.status === 'healthy' ? 200 :
                     checks.status === 'degraded' ? 200 : 500;

  return res.status(statusCode).json(checks);
};
