/**
 * Diagnostic API to test what's working
 */

module.exports = async (req, res) => {
  const start = Date.now();

  try {
    // Test 1: Environment variables
    const hasDbUrl = !!process.env.DATABASE_URL;
    const dbUrlStart = process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : 'missing';

    // Test 2: Can we require pg?
    let canRequirePg = false;
    try {
      require('pg');
      canRequirePg = true;
    } catch (e) {
      canRequirePg = false;
    }

    // Test 3: Can we create a pool?
    let canCreatePool = false;
    try {
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      canCreatePool = true;
      await pool.end();
    } catch (e) {
      canCreatePool = e.message;
    }

    // Test 4: Can we connect to database?
    let canConnect = false;
    let connectTime = 0;
    try {
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
      });
      const connectStart = Date.now();
      const result = await pool.query('SELECT NOW()');
      connectTime = Date.now() - connectStart;
      canConnect = true;
      await pool.end();
    } catch (e) {
      canConnect = e.message;
    }

    const totalTime = Date.now() - start;

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      tests: {
        hasDbUrl,
        dbUrlStart,
        canRequirePg,
        canCreatePool,
        canConnect,
        connectTime: connectTime + 'ms'
      },
      timing: {
        totalTime: totalTime + 'ms'
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
};
