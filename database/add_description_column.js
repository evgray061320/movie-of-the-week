// Migration script to add description column to groups table
// Run this if your database was created before the description field was added

const { query, pool } = require('./db');

async function addDescriptionColumn() {
  try {
    console.log('Checking if description column exists...');
    
    // Check if column exists
    const checkResult = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='groups' AND column_name='description'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log('✅ Description column already exists');
      return;
    }
    
    console.log('Adding description column to groups table...');
    
    // Add the column
    await query(`
      ALTER TABLE groups 
      ADD COLUMN IF NOT EXISTS description TEXT
    `);
    
    console.log('✅ Description column added successfully');
  } catch (error) {
    console.error('❌ Error adding description column:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the migration
addDescriptionColumn()
  .then(() => {
    console.log('Migration completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
