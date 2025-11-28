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

        let successCount = 0;
        let errorCount = 0;
        let lastError = null;

        for (const statement of statements) {
          if (statement) {
            try {
              await db.query(statement);
              successCount++;
            } catch (stmtError) {
              // Ignore "already exists" errors - those are fine
              if (stmtError.message.includes('already exists')) {
                console.log(`[Migrations] ⚠️  Skipping (already exists): ${statement.substring(0, 50)}...`);
                successCount++; // Count as success
              } else {
                console.error(`[Migrations] Error on statement: ${statement.substring(0, 100)}...`);
                console.error(`[Migrations] Error:`, stmtError.message);
                errorCount++;
                lastError = stmtError;
              }
            }
          }
        }

        if (errorCount === 0) {
          console.log(`[Migrations] ✅ ${file} completed successfully (${successCount} statements)`);
          results.push({ file, status: 'success', statements: successCount });
        } else if (successCount > 0) {
          console.log(`[Migrations] ⚠️  ${file} partially completed (${successCount} success, ${errorCount} errors)`);
          results.push({ file, status: 'partial', success: successCount, errors: errorCount, lastError: lastError?.message });
        } else {
          console.error(`[Migrations] ❌ ${file} failed completely`);
          results.push({ file, status: 'failed', error: lastError?.message });
        }

      } catch (error) {
        console.error(`[Migrations] ❌ ${file} failed:`, error);
        results.push({ file, status: 'failed', error: error.message });
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
