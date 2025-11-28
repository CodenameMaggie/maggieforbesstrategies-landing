const db = require('./utils/db');
const fs = require('fs');
const path = require('path');

/**
 * DATABASE MIGRATION RUNNER
 * Runs all SQL migration files in /migrations directory
 */
module.exports = async (req, res) => {
  const { migration } = req.query;

  try {
    console.log('[Migrations] Starting database migrations...');

    const migrationsDir = path.join(process.cwd(), 'migrations');

    // Read all SQL files in migrations directory
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Run in order

    const results = [];

    for (const file of files) {
      // If specific migration requested, only run that one
      if (migration && !file.includes(migration)) {
        continue;
      }

      console.log(`[Migrations] Running ${file}...`);

      const sqlPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(sqlPath, 'utf8');

      try {
        // Split by semicolons to handle multiple statements
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s && !s.startsWith('--') && !s.match(/^\/\*/));

        for (const statement of statements) {
          if (statement) {
            await db.query(statement);
          }
        }

        console.log(`[Migrations] ✅ ${file} completed`);
        results.push({ file, status: 'success' });

      } catch (error) {
        // Some errors are okay (table already exists, etc)
        if (error.message.includes('already exists') ||
            error.message.includes('does not exist')) {
          console.log(`[Migrations] ⚠️  ${file} - ${error.message} (continuing...)`);
          results.push({ file, status: 'skipped', reason: error.message });
        } else {
          console.error(`[Migrations] ❌ ${file} failed:`, error);
          results.push({ file, status: 'failed', error: error.message });
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Migrations completed',
      results
    });

  } catch (error) {
    console.error('[Migrations] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
