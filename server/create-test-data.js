const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

const SALT_ROUNDS = 10;

const testUsers = [
  {
    email: 'admin@leqetgym.com',
    password: 'password123',
    full_name: 'Admin User',
    role: 'admin'
  },
  {
    email: 'trainer@leqetgym.com',
    password: 'trainer123',
    full_name: 'Fitness Trainer',
    role: 'trainer'
  },
  {
    email: 'nutrition@leqetgym.com',
    password: 'nutrition123',
    full_name: 'Nutrition Expert',
    role: 'nutritionist'
  },
  {
    email: 'member@leqetgym.com',
    password: 'member123',
    full_name: 'Gym Member',
    role: 'member'
  }
];

async function createTestData() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create test users
    for (const user of testUsers) {
      const hashedPassword = await bcrypt.hash(user.password, SALT_ROUNDS);
      await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (email) DO NOTHING`,
        [user.email, hashedPassword, user.full_name, user.role]
      );
      console.log(`✅ Created/Updated user: ${user.email}`);
    }
    
    // Add sample workout for the member
    await client.query(`
      INSERT INTO workout_logs (user_id, workout_date, duration_minutes, notes)
      SELECT id, CURRENT_DATE, 60, 'Test workout session'
      FROM users WHERE email = 'member@leqetgym.com'
      ON CONFLICT DO NOTHING
    `);
    
    // Add sample meal for the member
    await client.query(`
      INSERT INTO meal_logs (user_id, meal_date, meal_type, notes, calories)
      SELECT id, CURRENT_DATE, 'Lunch', 'Test meal entry', 650
      FROM users WHERE email = 'member@leqetgym.com'
      ON CONFLICT DO NOTHING
    `);
    
    await client.query('COMMIT');
    console.log('✅ Test data created successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating test data:', error);
    throw error;
  } finally {
    client.release();
    process.exit(0);
  }
}

createTestData().catch(console.error);
