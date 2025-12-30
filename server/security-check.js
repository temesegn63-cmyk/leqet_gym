const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function checkSecurity() {
  const pool = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });

  try {
    const client = await pool.connect();
    
    console.log('🔒 Running Security Checks...\n');
    
    // 1. Check for plain text passwords
    const passwordCheck = await client.query(`
      SELECT email, password_hash 
      FROM users 
      WHERE password_hash NOT LIKE '$2a$%'
      LIMIT 5
    `);
    
    if (passwordCheck.rows.length > 0) {
      console.log('❌ WARNING: Found users with non-bcrypt password hashes:');
      console.log(passwordCheck.rows);
    } else {
      console.log('✅ All passwords are properly hashed with bcrypt');
    }
    
    // 2. Check for admin users with weak passwords
    const weakPasswords = ['password', '123456', 'admin123', 'leqetgym'];
    const weakPasswordCheck = await client.query(`
      SELECT email, role 
      FROM users 
      WHERE role = 'admin'
    `);
    
    console.log('\n🔑 Admin users:');
    for (const user of weakPasswordCheck.rows) {
      console.log(`- ${user.email} (${user.role})`);
    }
    
    // 3. Check for proper indexes
    const indexCheck = await client.query(`
      SELECT tablename, indexname, indexdef 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
    
    console.log('\n📊 Database indexes:');
    const indexGroups = indexCheck.rows.reduce((acc, row) => {
      if (!acc[row.tablename]) acc[row.tablename] = [];
      acc[row.tablename].push(row.indexname);
      return acc;
    }, {});
    
    Object.entries(indexGroups).forEach(([table, indexes]) => {
      console.log(`  ${table}: ${indexes.join(', ')}`);
    });
    
    console.log('\n🔍 Security check completed');
    
  } catch (error) {
    console.error('Error during security check:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkSecurity();
