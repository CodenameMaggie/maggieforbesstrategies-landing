const { Pool } = require('pg');

// Supabase connection - optimized for serverless with strict connection limits
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Supabase
  },
  max: 1, // Supabase free tier: 3 connections max. Use 1 to be safe in serverless
  min: 0, // Don't maintain idle connections
  idleTimeoutMillis: 500, // Aggressively close idle connections
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: true // Allow pool to close completely when idle (important for serverless)
});

// Handle pool errors
pool.on('error', (err, client) => {
  console.error('[DB Pool Error]:', err.message);
});

// Log successful connections in development
pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[DB] Client connected to database');
  }
});

// Initialize tables
const initDb = async () => {
  const client = await pool.connect();
  try {
    // Contacts table (email is nullable for prospects)
    await client.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) NOT NULL DEFAULT 'mfs-001',
        full_name VARCHAR(255),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(50),
        company VARCHAR(255),
        stage VARCHAR(50) DEFAULT 'new',
        lead_source VARCHAR(100),
        notes TEXT,
        client_type VARCHAR(50) DEFAULT 'mfs_client',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tasks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) NOT NULL DEFAULT 'mfs-001',
        user_id VARCHAR(100),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        priority VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(50) DEFAULT 'pending',
        due_date_text VARCHAR(100),
        contact_id INTEGER REFERENCES contacts(id),
        source VARCHAR(50) DEFAULT 'manual',
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // AI Memory Store table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_memory_store (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) NOT NULL DEFAULT 'mfs-001',
        category VARCHAR(100) NOT NULL,
        key VARCHAR(255) NOT NULL,
        value TEXT,
        last_updated TIMESTAMP DEFAULT NOW(),
        UNIQUE(tenant_id, category, key)
      )
    `);

    // AI Conversations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) NOT NULL DEFAULT 'mfs-001',
        user_id VARCHAR(100),
        bot_type VARCHAR(50),
        started_at TIMESTAMP DEFAULT NOW(),
        last_message_at TIMESTAMP DEFAULT NOW(),
        messages JSONB DEFAULT '[]',
        message_count INTEGER DEFAULT 0,
        conversation_summary TEXT,
        key_facts JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) NOT NULL DEFAULT 'mfs-001',
        email VARCHAR(255) NOT NULL UNIQUE,
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Contact Activities table
    await client.query(`
      CREATE TABLE IF NOT EXISTS contact_activities (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) NOT NULL DEFAULT 'mfs-001',
        contact_id INTEGER REFERENCES contacts(id),
        type VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Social Posts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_posts (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) NOT NULL DEFAULT 'mfs-001',
        user_id VARCHAR(100),
        platform VARCHAR(50),
        post_type VARCHAR(50),
        content TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('[DB] Tables initialized successfully');
  } catch (error) {
    console.error('[DB] Error initializing tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Query helper with automatic connection, retry logic, and error handling
const query = async (text, params, retries = 2) => {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let client;
    try {
      client = await pool.connect();
      const result = await client.query(text, params);
      client.release();
      return result;
    } catch (error) {
      if (client) client.release();

      lastError = error;
      const isRetryable = error.message.includes('timeout') ||
                         error.message.includes('Connection terminated') ||
                         error.code === 'ECONNRESET' ||
                         error.code === '57P01';

      if (attempt < retries && isRetryable) {
        console.log(`[DB] Retry ${attempt + 1}/${retries} after error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
        continue;
      }

      console.error('[DB Query Error]:', error.message);
      console.error('[DB Query]:', text.substring(0, 200));
      console.error('[DB Params]:', params);
      throw error;
    }
  }

  throw lastError;
};

// Get single row
const queryOne = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0] || null;
};

// Get all rows
const queryAll = async (text, params) => {
  const result = await query(text, params);
  return result.rows;
};

// Insert and return
const insert = async (table, data) => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const columns = keys.join(', ');

  const text = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
  const result = await query(text, values);
  return result.rows[0];
};

// Update and return
const update = async (table, data, whereClause, whereParams) => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

  const text = `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`;
  const allParams = [...values, ...whereParams];
  const result = await query(text, allParams);
  return result.rows[0];
};

module.exports = {
  pool,
  query,
  queryOne,
  queryAll,
  insert,
  update,
  initDb
};
