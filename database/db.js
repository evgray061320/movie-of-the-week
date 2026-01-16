// Database connection and query helpers
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : {
    rejectUnauthorized: false
  }
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  // Don't exit - let the app handle errors gracefully
  // This prevents the server from crashing on connection errors
});

// Helper function to run queries
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Initialize database schema
async function initializeDatabase() {
  try {
    const fs = require('fs');
    const path = require('path');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Split by semicolons and execute each statement
    const statements = schema.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        await query(statement);
      }
    }
    
    // Add description column if it doesn't exist (migration for existing databases)
    try {
      const checkResult = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='groups' AND column_name='description'
      `);
      
      if (checkResult.rows.length === 0) {
        console.log('Adding description column to groups table...');
        await query('ALTER TABLE groups ADD COLUMN description TEXT');
        console.log('✅ Description column added');
      }
    } catch (migrationError) {
      // Ignore migration errors - column might already exist or table might not exist yet
      console.log('Note: Could not add description column (may already exist):', migrationError.message);
    }
    
    console.log('✅ Database schema initialized');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    // Don't throw - schema might already exist
  }
}

module.exports = {
  query,
  pool,
  initializeDatabase
};
