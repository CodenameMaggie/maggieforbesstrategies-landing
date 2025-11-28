require('dotenv').config({ path: '.env.local' });
const { initDb } = require('./api/utils/db');

async function initialize() {
  console.log('Initializing Vercel Postgres database...');
  console.log('Using connection string:', process.env.POSTGRES_URL ? 'POSTGRES_URL (Vercel)' : process.env.DATABASE_URL ? 'DATABASE_URL' : 'NOT SET');

  try {
    await initDb();
    console.log('✅ Database initialized successfully!');
    console.log('All tables created with proper tenant_id fields.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

initialize();
