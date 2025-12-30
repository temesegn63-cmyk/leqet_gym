import { query } from './db.js';
import bcrypt from 'bcryptjs';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

async function ensureMigrationsTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW()
    )`
  );
}

async function getAppliedMigrations() {
  const res = await query('SELECT filename FROM schema_migrations ORDER BY filename');
  return new Set((res.rows || []).map((r) => String(r.filename)));
}

async function tableExists(tableName) {
  const res = await query('SELECT to_regclass($1) AS reg', [tableName]);
  return !!res.rows?.[0]?.reg;
}

async function columnExists(tableName, columnName) {
  const res = await query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_name = $1 AND column_name = $2
     LIMIT 1`,
    [tableName, columnName]
  );
  return (res.rowCount || 0) > 0;
}

async function markMigrationApplied(filename) {
  await query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING', [filename]);
}

async function bootstrapExistingMigrationState(applied) {
  if (applied.size) return;

  const hasUsers = await tableExists('users');
  if (hasUsers) {
    await markMigrationApplied('000_base_schema.sql');
  }

  const hasEmailVerified = await columnExists('users', 'email_verified');
  if (hasEmailVerified) {
    await markMigrationApplied('001_initial_schema_enhancements.sql');
  }

  const hasWorkoutPlanDays = await tableExists('workout_plan_days');
  if (hasWorkoutPlanDays) {
    await markMigrationApplied('003_member_goals_and_plan_details.sql');
  }
}

async function applyMigrations() {
  await ensureMigrationsTable();
  let applied = await getAppliedMigrations();

  await bootstrapExistingMigrationState(applied);
  applied = await getAppliedMigrations();

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationsDir = path.resolve(__dirname, '..', 'database', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    await query('BEGIN');
    try {
      await query(sql);
      await markMigrationApplied(file);
      await query('COMMIT');
      applied.add(file);
    } catch (e) {
      await query('ROLLBACK');
      throw e;
    }
  }
}

export async function initDb() {
  // Basic connectivity check
  await query('SELECT 1;');

  await applyMigrations();

  // Seed a default admin user if none exists yet
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@leqetgym.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'password123';

  const existing = await query('SELECT id FROM users WHERE email = $1', [adminEmail]);

  if (existing.rowCount === 0) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')`,
      ['Default Admin', adminEmail, passwordHash]
    );
  }

  const exercises = await query('SELECT id FROM exercises LIMIT 1');
  if (exercises.rowCount === 0) {
    await query(
      `INSERT INTO exercises (name, description, calories_per_min)
       VALUES
         ('Treadmill Running', 'Cardio running on treadmill', 12),
         ('Bench Press', 'Chest strength training', 6),
         ('Squats', 'Lower body strength training', 8),
         ('Yoga', 'Flexibility and balance', 4),
         ('Cycling', 'Stationary bike cardio', 10)`
    );
  }
}
