import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Successfully connected to PostgreSQL database');
    
    // Test query
    const result = await client.query('SELECT NOW()');
    console.log('📅 Current database time:', result.rows[0].now);
    
    // Check if users table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    console.log('📊 Users table exists:', tableCheck.rows[0].exists);
    
    // Count users
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    console.log('👥 Total users in database:', userCount.rows[0].count);
    
    client.release();
  } catch (error) {
    console.error('❌ Database connection error:');
    console.error(error.message);
  } finally {
    await pool.end();
  }
}

testConnection();
