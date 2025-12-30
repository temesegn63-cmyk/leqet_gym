import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, randomInt } from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { query } from './db.js';
import { initDb } from './initDb.js';
import axios from 'axios';
import FormData from 'form-data';

dotenv.config();

const serverStartTime = Date.now();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PERF_WINDOW_MS = 24 * 60 * 60 * 1000;
const perfBucketsByMinute = new Map();

function bucketMinuteStart(tsMs) {
  const d = new Date(tsMs);
  d.setSeconds(0, 0);
  return d.getTime();
}

function prunePerfBuckets(nowMs) {
  for (const key of perfBucketsByMinute.keys()) {
    if (nowMs - key > PERF_WINDOW_MS) {
      perfBucketsByMinute.delete(key);
    }
  }
}

function recordPerfSample({ durationMs, bytesIn, bytesOut, finishedAtMs }) {
  const key = bucketMinuteStart(finishedAtMs);
  const existing = perfBucketsByMinute.get(key) || {
    requests: 0,
    totalDurationMs: 0,
    bytesIn: 0,
    bytesOut: 0,
  };

  existing.requests += 1;
  existing.totalDurationMs += Number(durationMs) || 0;
  existing.bytesIn += Number(bytesIn) || 0;
  existing.bytesOut += Number(bytesOut) || 0;

  perfBucketsByMinute.set(key, existing);
}

async function getCpuUsagePercent(sampleMs = 120) {
  const snapshot = () =>
    os.cpus().map((c) => {
      const t = c.times;
      return {
        idle: t.idle,
        total: t.user + t.nice + t.sys + t.irq + t.idle,
      };
    });

  const start = snapshot();
  await new Promise((r) => setTimeout(r, sampleMs));
  const end = snapshot();

  let idleDelta = 0;
  let totalDelta = 0;
  for (let i = 0; i < start.length; i += 1) {
    idleDelta += end[i].idle - start[i].idle;
    totalDelta += end[i].total - start[i].total;
  }

  if (!totalDelta) return 0;
  const used = (totalDelta - idleDelta) / totalDelta;
  return Math.max(0, Math.min(100, Math.round(used * 100)));
}

const app = express();
const port = process.env.API_PORT || 4000;

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());

const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_COOKIE = 'leqet_session';
const CSRF_COOKIE = 'leqet_csrf';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function getCookie(req, name) {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[name];
}

function setSessionCookies(res, { token, csrfToken }) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  });

  res.cookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  });
}

function clearSessionCookies(res) {
  res.cookie(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });

  res.cookie(CSRF_COOKIE, '', {
    httpOnly: false,
    secure: IS_PROD,
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });
}

function csrfMiddleware(req, res, next) {
  const method = (req.method || '').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  if (req.path.startsWith('/api/auth/')) {
    return next();
  }

  const sessionCookie = getCookie(req, SESSION_COOKIE);
  if (!sessionCookie) {
    return next();
  }

  const csrfCookie = getCookie(req, CSRF_COOKIE);
  const csrfHeader = req.get('x-csrf-token') || req.get('x-xsrf-token');
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ message: 'CSRF validation failed' });
  }

  return next();
}

function authMiddleware(req, res, next) {
  const authHeader = req.get('authorization') || '';
  let token;
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    token = getCookie(req, SESSION_COOKIE);
  }

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const jwtSecret = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

function requireAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  return next();
}

async function isMemberAssignedToTrainer(trainerId, memberId) {
  const result = await query(
    'SELECT 1 FROM trainer_assignments WHERE member_id = $1 AND trainer_id = $2',
    [memberId, trainerId]
  );
  return result.rowCount > 0;
}

async function isMemberAssignedToNutritionist(nutritionistId, memberId) {
  const result = await query(
    'SELECT 1 FROM nutritionist_assignments WHERE member_id = $1 AND nutritionist_id = $2',
    [memberId, nutritionistId]
  );
  return result.rowCount > 0;
}

function calculateCaloriesPerMinute(ex) {
  const durationMinutes = Number(ex.duration) || 0;
  const calories = Number(ex.calories) || 0;
  if (durationMinutes > 0 && calories > 0) {
    return calories / durationMinutes;
  }
  // Fallback heuristic if API does not give explicit calories
  // Use a simple mapping based on intensity/type if available
  const type = (ex.type || '').toString().toLowerCase();
  if (type.includes('cardio')) return 8;
  if (type.includes('strength')) return 6;
  return 5;
}

app.use(csrfMiddleware);
app.use('/api/admin', authMiddleware, requireAdmin);

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  const bytesIn = Number(req.headers['content-length']) || 0;

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;

    const bytesOut = Number(res.getHeader('content-length')) || 0;
    const finishedAtMs = Date.now();
    recordPerfSample({ durationMs, bytesIn, bytesOut, finishedAtMs });
    prunePerfBuckets(finishedAtMs);
  });

  next();
});

function withTimeout(promise, timeoutMs, label) {
  const ms = Number(timeoutMs) || 0;
  if (!ms) return promise;

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    }),
    timeoutPromise,
  ]);
}

function assertSmtpConfigured() {
  const missing = [];
  if (!process.env.SMTP_HOST) missing.push('SMTP_HOST');
  if (!process.env.SMTP_USER) missing.push('SMTP_USER');
  if (!process.env.SMTP_PASS) missing.push('SMTP_PASS');
  if (missing.length) {
    throw new Error(`SMTP is not configured (missing: ${missing.join(', ')})`);
  }
}

const smtpPort = Number(process.env.SMTP_PORT) || 587;
const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
const smtpConnectionTimeoutMs = Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 10_000;
const smtpSocketTimeoutMs = Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 10_000;
const smtpSendTimeoutMs = Number(process.env.SMTP_SEND_TIMEOUT_MS) || 12_000;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: smtpConnectionTimeoutMs,
  socketTimeout: smtpSocketTimeoutMs,
});

async function sendOtpEmail(email, name, otp) {
  const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;

  const mailOptions = {
    from: `Leqet Gym <${fromEmail}>`,
    to: email,
    subject: 'Your Leqet Gym account activation code',
    text: `Hi${name ? ` ${name}` : ''},\n\nYour one-time password (OTP) is: ${otp}\nIt is valid for 15 minutes.\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Hi${name ? ` ${name}` : ''},</p>
           <p>Your one-time password (OTP) is:</p>
           <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${otp}</p>
           <p>It is valid for 15 minutes.</p>
           <p>If you did not request this, you can ignore this email.</p>`,
  };

  assertSmtpConfigured();
  try {
    await withTimeout(
      transporter.sendMail(mailOptions),
      smtpSendTimeoutMs,
      'SMTP sendOtpEmail sendMail'
    );
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    throw error;
  }
}

async function sendPasswordResetEmail(email, name, otp) {
  const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;

  const mailOptions = {
    from: `Leqet Gym <${fromEmail}>`,
    to: email,
    subject: 'Your Leqet Gym password reset code',
    text: `Hi${name ? ` ${name}` : ''},\n\nYour password reset code is: ${otp}\nIt is valid for 10 minutes.\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Hi${name ? ` ${name}` : ''},</p>
           <p>Your password reset code is:</p>
           <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${otp}</p>
           <p>It is valid for 10 minutes.</p>
           <p>If you did not request this, you can ignore this email.</p>`,
  };

  assertSmtpConfigured();
  try {
    await withTimeout(
      transporter.sendMail(mailOptions),
      smtpSendTimeoutMs,
      'SMTP sendPasswordResetEmail sendMail'
    );
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    throw error;
  }
}

app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1;');
    return res.json({ ok: true });
  } catch (error) {
    console.error('Health check failed:', error);
    return res.status(500).json({ ok: false });
  }
});

// Log a meal and fetch/delete today's meals
app.post('/api/meals', authMiddleware, async (req, res) => {
  const role = req.user?.role;
  const userId = Number(req.user?.id);
  const body = req.body || {};

  if (!userId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const memberId = Number(body.member_id);
  const mealType = body.meal_type;

  if (!memberId || !mealType) {
    return res.status(400).json({ message: 'member_id and meal_type are required' });
  }

  if (role === 'member' && userId !== memberId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const mealInsert = await query(
      `INSERT INTO meal_logs (member_id, meal_type, logged_at)
       VALUES ($1, $2, NOW())
       RETURNING id`,
      [memberId, mealType]
    );

    const mealLogId = mealInsert.rows[0].id;

    const itemInsert = await query(
      `INSERT INTO meal_log_items
         (meal_log_id, food_item_id, quantity, unit, calories, protein, fat, carbs)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        mealLogId,
        body.food_item_id != null ? Number(body.food_item_id) : null,
        body.quantity != null ? Number(body.quantity) : 0,
        body.unit || 'g',
        body.calories != null ? Number(body.calories) : 0,
        body.protein != null ? Number(body.protein) : 0,
        body.fat != null ? Number(body.fat) : 0,
        body.carbs != null ? Number(body.carbs) : 0,
      ]
    );

    const itemId = itemInsert.rows[0].id;
    return res.status(201).json({ meal_log_id: mealLogId, item_id: itemId });
  } catch (error) {
    console.error('Error logging meal:', error);
    return res.status(500).json({ message: 'Failed to log meal' });
  }
});

app.get('/api/meals/today', authMiddleware, async (req, res) => {
  const role = req.user?.role;
  const requesterId = Number(req.user?.id);
  const memberId = Number(req.query.member_id);

  if (!requesterId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!memberId) {
    return res.status(400).json({ message: 'member_id is required' });
  }

  try {
    if (role === 'member' && requesterId !== memberId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const result = await query(
      `SELECT
         ml.id AS meal_log_id,
         ml.meal_type,
         ml.logged_at,
         mli.id AS item_id,
         mli.food_item_id,
         fi.name AS food_name,
         fi.category,
         mli.quantity,
         mli.unit,
         mli.calories,
         mli.protein,
         mli.carbs,
         mli.fat
       FROM meal_logs ml
       JOIN meal_log_items mli ON mli.meal_log_id = ml.id
       LEFT JOIN food_items fi ON fi.id = mli.food_item_id
       WHERE ml.member_id = $1
         AND DATE(ml.logged_at) = CURRENT_DATE
       ORDER BY ml.logged_at DESC, mli.id DESC`,
      [memberId]
    );

    return res.json({ meals: result.rows });
  } catch (error) {
    console.error('Error fetching today\'s meals:', error);
    return res.status(500).json({ message: 'Failed to fetch meals' });
  }
});

app.delete('/api/meals/items/:id', authMiddleware, async (req, res) => {
  const itemId = Number(req.params.id);

  if (!itemId) {
    return res.status(400).json({ message: 'Valid item id is required' });
  }

  try {
    await query('DELETE FROM meal_log_items WHERE id = $1', [itemId]);
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting meal item:', error);
    return res.status(500).json({ message: 'Failed to delete meal item' });
  }
});

app.post('/api/workouts', authMiddleware, async (req, res) => {
  const role = req.user?.role;
  const userId = Number(req.user?.id);
  const body = req.body || {};

  if (!userId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const memberId = Number(body.member_id);
  if (!memberId) {
    return res.status(400).json({ message: 'member_id is required' });
  }

  if (role === 'member' && userId !== memberId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const durationMinutes = body.duration_minutes != null ? Number(body.duration_minutes) : 0;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return res.status(400).json({ message: 'duration_minutes must be > 0' });
  }

  const caloriesBurnedRaw = body.calories_burned != null ? Number(body.calories_burned) : 0;
  const caloriesBurned =
    Number.isFinite(caloriesBurnedRaw) && caloriesBurnedRaw >= 0 ? caloriesBurnedRaw : 0;

  const weightUsedRaw = body.weight_used != null ? Number(body.weight_used) : null;
  const weightUsed =
    weightUsedRaw != null && Number.isFinite(weightUsedRaw) && weightUsedRaw >= 0 ? weightUsedRaw : null;
  const weightUnit =
    typeof body.weight_unit === 'string' && body.weight_unit.trim() ? body.weight_unit.trim() : null;

  const exerciseIdCandidate = body.exercise_id != null ? Number(body.exercise_id) : null;
  let exerciseId =
    exerciseIdCandidate != null && Number.isFinite(exerciseIdCandidate) && exerciseIdCandidate > 0
      ? exerciseIdCandidate
      : null;
  const exerciseName = typeof body.exercise_name === 'string' ? body.exercise_name.trim() : '';

  if (!exerciseId && !exerciseName) {
    return res.status(400).json({ message: 'exercise_id or exercise_name is required' });
  }

  try {
    if (!exerciseId && exerciseName) {
      const existing = await query(
        'SELECT id FROM exercises WHERE LOWER(name) = LOWER($1) ORDER BY id ASC LIMIT 1',
        [exerciseName]
      );
      if (existing.rowCount) {
        exerciseId = existing.rows[0].id;
      } else {
        const caloriesPerMin = durationMinutes > 0 ? caloriesBurned / durationMinutes : 0;
        const inserted = await query(
          `INSERT INTO exercises (name, description, calories_per_min)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [exerciseName, null, caloriesPerMin]
        );
        exerciseId = inserted.rows[0].id;
      }
    }

    const workoutInsert = await query(
      `INSERT INTO workout_logs (member_id, logged_at)
       VALUES ($1, NOW())
       RETURNING id`,
      [memberId]
    );
    const workoutLogId = workoutInsert.rows[0].id;

    const itemInsert = await query(
      `INSERT INTO workout_log_items
         (workout_log_id, exercise_id, duration_minutes, calories_burned, weight_used, weight_unit)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [workoutLogId, exerciseId, durationMinutes, caloriesBurned, weightUsed, weightUnit]
    );
    const itemId = itemInsert.rows[0].id;

    return res.status(201).json({ workout_log_id: workoutLogId, item_id: itemId });
  } catch (error) {
    console.error('Error logging workout:', error);
    return res.status(500).json({ message: 'Failed to log workout' });
  }
});

app.get('/api/workouts/today', authMiddleware, async (req, res) => {
  const role = req.user?.role;
  const requesterId = Number(req.user?.id);
  const memberId = Number(req.query.member_id);

  if (!requesterId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!memberId) {
    return res.status(400).json({ message: 'member_id is required' });
  }

  if (role === 'member' && requesterId !== memberId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const result = await query(
      `SELECT
         wl.id AS workout_log_id,
         wl.logged_at,
         wli.id AS item_id,
         wli.exercise_id,
         COALESCE(e.name, '') AS exercise_name,
         wli.duration_minutes,
         wli.calories_burned,
         wli.weight_used,
         wli.weight_unit
       FROM workout_logs wl
       JOIN workout_log_items wli ON wli.workout_log_id = wl.id
       LEFT JOIN exercises e ON e.id = wli.exercise_id
       WHERE wl.member_id = $1
         AND DATE(wl.logged_at) = CURRENT_DATE
       ORDER BY wl.logged_at DESC, wli.id DESC`,
      [memberId]
    );

    return res.json({ workouts: result.rows });
  } catch (error) {
    console.error("Error fetching today's workouts:", error);
    return res.status(500).json({ message: 'Failed to fetch workouts' });
  }
});

app.delete('/api/workouts/items/:id', authMiddleware, async (req, res) => {
  const itemId = Number(req.params.id);

  if (!itemId) {
    return res.status(400).json({ message: 'Valid item id is required' });
  }

  try {
    await query('DELETE FROM workout_log_items WHERE id = $1', [itemId]);
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting workout item:', error);
    return res.status(500).json({ message: 'Failed to delete workout item' });
  }
});

// Member profile (used by ProfileSetup)
app.get('/api/members/:id/profile', authMiddleware, async (req, res) => {
  const memberId = Number(req.params.id);
  const role = req.user?.role;
  const userId = Number(req.user?.id);

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  if (!userId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    if (role === 'member' && userId !== memberId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const result = await query(
      `SELECT
         u.id AS member_id,
         mp.age,
         mp.gender,
         mp.weight_kg,
         mp.height_cm,
         mp.goal,
         mp.activity_level,
         mp.trainer_intake,
         mp.nutrition_intake,
         COALESCE(mp.is_private, FALSE) AS is_private,
         mp.bmr,
         mp.tdee,
         mp.target_calories,
         mg.weekly_calorie_goal,
         mg.weekly_workout_minutes,
         mg.daily_steps_goal,
         mg.daily_water_liters
       FROM users u
       LEFT JOIN member_profiles mp ON mp.user_id = u.id
       LEFT JOIN member_goals mg ON mg.member_id = u.id
       WHERE u.id = $1`,
      [memberId]
    );

    if (!result.rowCount) {
      return res.json({ profile: null });
    }

    const row = result.rows[0];
    const profile = {
      memberId: Number(row.member_id),
      age: row.age != null ? Number(row.age) : null,
      gender: row.gender || null,
      weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
      heightCm: row.height_cm != null ? Number(row.height_cm) : null,
      goal: row.goal || null,
      activityLevel: row.activity_level || null,
      trainerIntake: row.trainer_intake || null,
      nutritionIntake: row.nutrition_intake || null,
      isPrivate: Boolean(row.is_private),
      bmr: row.bmr != null ? Number(row.bmr) : null,
      tdee: row.tdee != null ? Number(row.tdee) : null,
      targetCalories: row.target_calories != null ? Number(row.target_calories) : null,
      weeklyCalorieGoal:
        row.weekly_calorie_goal != null ? Number(row.weekly_calorie_goal) : null,
      weeklyWorkoutMinutes:
        row.weekly_workout_minutes != null ? Number(row.weekly_workout_minutes) : null,
      dailyStepsGoal: row.daily_steps_goal != null ? Number(row.daily_steps_goal) : null,
      dailyWaterLiters:
        row.daily_water_liters != null ? Number(row.daily_water_liters) : null,
    };

    return res.json({ profile });
  } catch (error) {
    console.error('Error fetching member profile:', error);
    return res.status(500).json({ message: 'Failed to fetch member profile' });
  }
});

app.put('/api/members/:id/profile', authMiddleware, async (req, res) => {
  const memberId = Number(req.params.id);
  const role = req.user?.role;
  const userId = Number(req.user?.id);
  const body = req.body || {};

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  if (!userId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (role === 'member' && userId !== memberId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const {
    age,
    gender,
    weight_kg,
    height_cm,
    goal,
    activity_level,
    trainer_intake,
    nutrition_intake,
    is_private,
    bmr,
    tdee,
    target_calories,
    weekly_calorie_goal,
    weekly_workout_minutes,
    daily_steps_goal,
    daily_water_liters,
  } = body;

  try {
    await query('BEGIN');

    await query(
      `INSERT INTO member_profiles (user_id, age, gender, weight_kg, height_cm, goal, activity_level, trainer_intake, nutrition_intake, is_private, bmr, tdee, target_calories)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (user_id) DO UPDATE SET
         age = EXCLUDED.age,
         gender = EXCLUDED.gender,
         weight_kg = EXCLUDED.weight_kg,
         height_cm = EXCLUDED.height_cm,
         goal = EXCLUDED.goal,
         activity_level = EXCLUDED.activity_level,
         trainer_intake = EXCLUDED.trainer_intake,
         nutrition_intake = EXCLUDED.nutrition_intake,
         is_private = EXCLUDED.is_private,
         bmr = EXCLUDED.bmr,
         tdee = EXCLUDED.tdee,
         target_calories = EXCLUDED.target_calories`,
      [
        memberId,
        age != null ? Number(age) : null,
        gender || null,
        weight_kg != null ? Number(weight_kg) : null,
        height_cm != null ? Number(height_cm) : null,
        goal || null,
        activity_level || null,
        trainer_intake || null,
        nutrition_intake || null,
        is_private != null ? Boolean(is_private) : false,
        bmr != null ? Number(bmr) : null,
        tdee != null ? Number(tdee) : null,
        target_calories != null ? Number(target_calories) : null,
      ]
    );

    await query(
      `INSERT INTO member_goals (member_id, weekly_calorie_goal, weekly_workout_minutes, daily_steps_goal, daily_water_liters)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (member_id) DO UPDATE SET
         weekly_calorie_goal = EXCLUDED.weekly_calorie_goal,
         weekly_workout_minutes = EXCLUDED.weekly_workout_minutes,
         daily_steps_goal = EXCLUDED.daily_steps_goal,
         daily_water_liters = EXCLUDED.daily_water_liters`,
      [
        memberId,
        weekly_calorie_goal != null ? Number(weekly_calorie_goal) : null,
        weekly_workout_minutes != null ? Number(weekly_workout_minutes) : null,
        daily_steps_goal != null ? Number(daily_steps_goal) : null,
        daily_water_liters != null ? Number(daily_water_liters) : null,
      ]
    );

    await query('COMMIT');

    // Reuse GET logic to return fresh profile
    const refreshed = await query(
      `SELECT
         u.id AS member_id,
         mp.age,
         mp.gender,
         mp.weight_kg,
         mp.height_cm,
         mp.goal,
         mp.activity_level,
         mp.trainer_intake,
         mp.nutrition_intake,
         COALESCE(mp.is_private, FALSE) AS is_private,
         mp.bmr,
         mp.tdee,
         mp.target_calories,
         mg.weekly_calorie_goal,
         mg.weekly_workout_minutes,
         mg.daily_steps_goal,
         mg.daily_water_liters
       FROM users u
       LEFT JOIN member_profiles mp ON mp.user_id = u.id
       LEFT JOIN member_goals mg ON mg.member_id = u.id
       WHERE u.id = $1`,
      [memberId]
    );

    const row = refreshed.rows[0];
    const profile = {
      memberId: Number(row.member_id),
      age: row.age != null ? Number(row.age) : null,
      gender: row.gender || null,
      weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
      heightCm: row.height_cm != null ? Number(row.height_cm) : null,
      goal: row.goal || null,
      activityLevel: row.activity_level || null,
      trainerIntake: row.trainer_intake || null,
      nutritionIntake: row.nutrition_intake || null,
      isPrivate: Boolean(row.is_private),
      bmr: row.bmr != null ? Number(row.bmr) : null,
      tdee: row.tdee != null ? Number(row.tdee) : null,
      targetCalories: row.target_calories != null ? Number(row.target_calories) : null,
      weeklyCalorieGoal:
        row.weekly_calorie_goal != null ? Number(row.weekly_calorie_goal) : null,
      weeklyWorkoutMinutes:
        row.weekly_workout_minutes != null ? Number(row.weekly_workout_minutes) : null,
      dailyStepsGoal: row.daily_steps_goal != null ? Number(row.daily_steps_goal) : null,
      dailyWaterLiters:
        row.daily_water_liters != null ? Number(row.daily_water_liters) : null,
    };

    return res.json({ profile });
  } catch (error) {
    try {
      await query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Error rolling back member profile transaction:', rollbackErr);
    }
    console.error('Error saving member profile:', error);
    return res.status(500).json({ message: 'Failed to save member profile' });
  }
});

app.get('/api/meals/by-date', authMiddleware, async (req, res) => {
  const role = req.user?.role;
  const requesterId = Number(req.user?.id);
  const memberId = Number(req.query.member_id);
  const date = typeof req.query.date === 'string' ? req.query.date.trim() : '';

  if (!requesterId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!memberId) {
    return res.status(400).json({ message: 'member_id is required' });
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: 'date must be in YYYY-MM-DD format' });
  }

  try {
    if (role === 'member') {
      if (requesterId !== memberId) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (role === 'trainer') {
      const assigned = await isMemberAssignedToTrainer(requesterId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (role === 'nutritionist') {
      const assigned = await isMemberAssignedToNutritionist(requesterId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const result = await query(
      `SELECT
         ml.meal_type,
         COUNT(DISTINCT ml.id)::int AS meal_count,
         COUNT(mli.id)::int AS items_count,
         COALESCE(SUM(mli.calories), 0) AS total_calories,
         COALESCE(SUM(mli.protein), 0) AS total_protein,
         COALESCE(SUM(mli.carbs), 0) AS total_carbs,
         COALESCE(SUM(mli.fat), 0) AS total_fat
       FROM meal_logs ml
       JOIN meal_log_items mli ON mli.meal_log_id = ml.id
       WHERE ml.member_id = $1
         AND DATE(ml.logged_at) = $2::date
       GROUP BY ml.meal_type
       ORDER BY ml.meal_type`,
      [memberId, date]
    );

    return res.json({ meals: result.rows });
  } catch (error) {
    console.error('Error fetching meals by date:', error);
    return res.status(500).json({ message: 'Failed to fetch meals' });
  }
});

// Overview of members for coaches/admins (used by trainer & nutritionist dashboards)
app.get('/api/members/overview', authMiddleware, async (req, res) => {
  const role = req.user?.role;
  const userId = Number(req.user?.id);

  if (!userId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (role !== 'trainer' && role !== 'nutritionist' && role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const params = [];
    let whereClause = "u.role = 'member'";

    if (role === 'trainer') {
      params.push(userId);
      whereClause += ` AND ta.trainer_id = $${params.length}`;
    } else if (role === 'nutritionist') {
      params.push(userId);
      whereClause += ` AND na.nutritionist_id = $${params.length}`;
    }

    const sql = `
      WITH meals_today AS (
        SELECT ml.member_id,
               COUNT(DISTINCT ml.id)::int AS meals_today
        FROM meal_logs ml
        WHERE DATE(ml.logged_at) = CURRENT_DATE
        GROUP BY ml.member_id
      ),
      workouts_week AS (
        SELECT wl.member_id,
               COUNT(DISTINCT wl.id)::int AS workouts_this_week
        FROM workout_logs wl
        WHERE wl.logged_at >= NOW() - INTERVAL '7 days'
        GROUP BY wl.member_id
      ),
      last_activity AS (
        SELECT member_id,
               MAX(last_ts) AS last_activity
        FROM (
          SELECT member_id, MAX(logged_at) AS last_ts
          FROM meal_logs
          GROUP BY member_id
          UNION ALL
          SELECT member_id, MAX(logged_at) AS last_ts
          FROM workout_logs
          GROUP BY member_id
        ) t
        GROUP BY member_id
      ),
      cal_today AS (
        SELECT ml.member_id,
               COALESCE(SUM(mli.calories), 0) AS total_calories_today
        FROM meal_logs ml
        JOIN meal_log_items mli ON mli.meal_log_id = ml.id
        WHERE DATE(ml.logged_at) = CURRENT_DATE
        GROUP BY ml.member_id
      )
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.created_at,
        mp.goal,
        ta.trainer_id,
        na.nutritionist_id,
        COALESCE(mt.meals_today, 0) AS meals_today,
        COALESCE(ww.workouts_this_week, 0) AS workouts_this_week,
        COALESCE(la.last_activity, u.created_at) AS last_activity,
        COALESCE(ct.total_calories_today, 0) AS total_calories_today
      FROM users u
      LEFT JOIN member_profiles mp ON mp.user_id = u.id
      LEFT JOIN trainer_assignments ta ON ta.member_id = u.id
      LEFT JOIN nutritionist_assignments na ON na.member_id = u.id
      LEFT JOIN meals_today mt ON mt.member_id = u.id
      LEFT JOIN workouts_week ww ON ww.member_id = u.id
      LEFT JOIN last_activity la ON la.member_id = u.id
      LEFT JOIN cal_today ct ON ct.member_id = u.id
      WHERE ${whereClause}
      ORDER BY u.created_at DESC
    `;

    const result = await query(sql, params);
    const members = (result.rows || []).map((row) => ({
      id: Number(row.id),
      full_name: String(row.full_name || ''),
      email: String(row.email || ''),
      created_at: row.created_at,
      goal: row.goal ?? null,
      trainer_id: row.trainer_id != null ? Number(row.trainer_id) : null,
      nutritionist_id: row.nutritionist_id != null ? Number(row.nutritionist_id) : null,
      meals_today: Number(row.meals_today) || 0,
      workouts_this_week: Number(row.workouts_this_week) || 0,
      last_activity: row.last_activity || row.created_at,
      total_calories_today: Number(row.total_calories_today) || 0,
    }));

    return res.json({ members });
  } catch (error) {
    console.error('Error fetching member overview:', error);
    return res.status(500).json({ message: 'Failed to fetch member overview' });
  }
});

app.get('/api/members/:id/diet-plan', authMiddleware, async (req, res) => {
  const memberId = Number(req.params.id);
  const role = req.user?.role;
  const userId = Number(req.user?.id);

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  if (!userId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const isSelfMember = role === 'member' && userId === memberId;

  if (!isSelfMember && role !== 'nutritionist' && role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    if (role === 'nutritionist') {
      const assigned = await isMemberAssignedToNutritionist(userId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const planResult = await query(
      `SELECT
         dp.id,
         dp.name,
         dp.goal,
         dp.daily_calories,
         dp.daily_protein,
         dp.daily_carbs,
         dp.daily_fat,
         dp.is_active,
         dp.created_at,
         dp.nutritionist_id,
         u.full_name AS nutritionist_name
       FROM diet_plans dp
       LEFT JOIN users u ON u.id = dp.nutritionist_id
       WHERE dp.member_id = $1
         AND COALESCE(dp.is_active, TRUE) = TRUE
       ORDER BY dp.created_at DESC
       LIMIT 1`,
      [memberId]
    );

    if (!planResult.rowCount) {
      return res.json({ plan: null });
    }

    const planRow = planResult.rows[0] || {};
    const planId = Number(planRow.id);

    const mealsResult = await query(
      `SELECT id, meal_type, name, notes
       FROM diet_plan_meals
       WHERE diet_plan_id = $1
       ORDER BY id ASC`,
      [planId]
    );

    const mealRows = mealsResult.rows || [];
    const mealIds = mealRows
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    let itemRows = [];
    if (mealIds.length) {
      const itemsResult = await query(
        `SELECT
           mi.diet_plan_meal_id,
           mi.quantity,
           mi.calories,
           mi.protein,
           mi.carbs,
           mi.fat,
           fi.name AS food_name
         FROM diet_plan_meal_items mi
         LEFT JOIN food_items fi ON fi.id = mi.food_item_id
         WHERE mi.diet_plan_meal_id = ANY($1::int[])
         ORDER BY mi.id ASC`,
        [mealIds]
      );
      itemRows = itemsResult.rows || [];
    }

    const itemsByMealId = new Map();
    for (const row of itemRows) {
      const mealId = Number(row.diet_plan_meal_id);
      if (!itemsByMealId.has(mealId)) {
        itemsByMealId.set(mealId, []);
      }
      itemsByMealId.get(mealId).push(row);
    }

    const meals = mealRows.map((mealRow) => {
      const mealId = Number(mealRow.id);
      const foodsRaw = itemsByMealId.get(mealId) || [];
      let totalCalories = 0;
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;

      const foods = foodsRaw.map((foodRow) => {
        const calories = Number(foodRow.calories) || 0;
        const protein = Number(foodRow.protein) || 0;
        const carbs = Number(foodRow.carbs) || 0;
        const fat = Number(foodRow.fat) || 0;

        totalCalories += calories;
        totalProtein += protein;
        totalCarbs += carbs;
        totalFat += fat;

        return {
          name: typeof foodRow.food_name === 'string' ? foodRow.food_name : '',
          quantity: Number(foodRow.quantity) || 0,
          calories,
          protein,
          carbs,
          fat,
        };
      });

      return {
        id: String(mealRow.id),
        mealType: String(mealRow.meal_type || '').toLowerCase(),
        foods,
        totalCalories,
        totalProtein,
        totalCarbs,
        totalFat,
        tips: typeof mealRow.notes === 'string' && mealRow.notes.trim() ? mealRow.notes : undefined,
      };
    });

    const activeFlag = planRow.is_active == null ? true : Boolean(planRow.is_active);
    const nutritionistId = planRow.nutritionist_id != null ? Number(planRow.nutritionist_id) : null;

    return res.json({
      plan: {
        id: String(planRow.id),
        name: typeof planRow.name === 'string' ? planRow.name : '',
        type: nutritionistId ? 'trainer' : 'system',
        goal: typeof planRow.goal === 'string' ? planRow.goal : '',
        dailyCalories: Number(planRow.daily_calories) || 0,
        dailyProtein: Number(planRow.daily_protein) || 0,
        dailyCarbs: Number(planRow.daily_carbs) || 0,
        dailyFat: Number(planRow.daily_fat) || 0,
        meals,
        createdBy:
          nutritionistId && typeof planRow.nutritionist_name === 'string'
            ? planRow.nutritionist_name
            : undefined,
        createdAt: planRow.created_at,
        active: activeFlag,
      },
    });
  } catch (error) {
    console.error('Error fetching diet plan:', error);
    return res.status(500).json({ message: 'Failed to fetch diet plan' });
  }
});

app.get('/api/members/:id/workout-plan', authMiddleware, async (req, res) => {
  const memberId = Number(req.params.id);
  const role = req.user?.role;
  const userId = Number(req.user?.id);

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  if (!userId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const isSelfMember = role === 'member' && userId === memberId;

  if (!isSelfMember && role !== 'trainer' && role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    if (role === 'trainer') {
      const assigned = await isMemberAssignedToTrainer(userId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const planResult = await query(
      `SELECT
         wp.id,
         wp.name,
         wp.goal,
         wp.weekly_days,
         wp.estimated_duration,
         wp.difficulty,
         wp.is_active,
         wp.created_at,
         wp.trainer_id,
         u.full_name AS trainer_name
       FROM workout_plans wp
       LEFT JOIN users u ON u.id = wp.trainer_id
       WHERE wp.member_id = $1
         AND COALESCE(wp.is_active, TRUE) = TRUE
       ORDER BY wp.created_at DESC
       LIMIT 1`,
      [memberId]
    );

    if (!planResult.rowCount) {
      return res.json({ plan: null });
    }

    const planRow = planResult.rows[0] || {};
    const planId = Number(planRow.id);

    const daysResult = await query(
      `SELECT id, day_of_week, name, duration_minutes, difficulty, focus, tips
       FROM workout_plan_days
       WHERE workout_plan_id = $1
       ORDER BY id ASC`,
      [planId]
    );

    const dayRows = daysResult.rows || [];
    const dayIds = dayRows
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    let exerciseRows = [];
    if (dayIds.length) {
      const exercisesResult = await query(
        `SELECT
           wpe.workout_plan_day_id,
           wpe.name,
           wpe.sets,
           wpe.reps,
           wpe.rest,
           wpe.duration_minutes,
           wpe.instructions,
           wpe.target_muscles
         FROM workout_plan_exercises wpe
         WHERE wpe.workout_plan_day_id = ANY($1::int[])
         ORDER BY wpe.id ASC`,
        [dayIds]
      );
      exerciseRows = exercisesResult.rows || [];
    }

    const exercisesByDayId = new Map();
    for (const row of exerciseRows) {
      const dayId = Number(row.workout_plan_day_id);
      if (!exercisesByDayId.has(dayId)) {
        exercisesByDayId.set(dayId, []);
      }
      exercisesByDayId.get(dayId).push(row);
    }

    const workouts = dayRows.map((dayRow) => {
      const dayId = Number(dayRow.id);

      const focusRaw = typeof dayRow.focus === 'string' ? dayRow.focus : '';
      const focus = focusRaw
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);

      const exerciseRaw = exercisesByDayId.get(dayId) || [];
      const exercises = exerciseRaw.map((exRow) => {
        const targetRaw = typeof exRow.target_muscles === 'string' ? exRow.target_muscles : '';
        const targetMuscles = targetRaw
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v.length > 0);

        const duration = exRow.duration_minutes != null ? Number(exRow.duration_minutes) : undefined;

        return {
          name: typeof exRow.name === 'string' ? exRow.name : '',
          sets: exRow.sets != null ? Number(exRow.sets) : 0,
          reps: typeof exRow.reps === 'string' ? exRow.reps : '',
          rest: typeof exRow.rest === 'string' ? exRow.rest : '',
          duration: Number.isFinite(duration) ? duration : undefined,
          instructions: typeof exRow.instructions === 'string' ? exRow.instructions : undefined,
          targetMuscles,
        };
      });

      const duration = dayRow.duration_minutes != null ? Number(dayRow.duration_minutes) : 0;
      const difficulty = typeof dayRow.difficulty === 'string' ? dayRow.difficulty : '';
      const tips = typeof dayRow.tips === 'string' && dayRow.tips.trim() ? dayRow.tips : undefined;

      return {
        id: String(dayRow.id),
        day: typeof dayRow.day_of_week === 'string' ? dayRow.day_of_week : '',
        name: typeof dayRow.name === 'string' ? dayRow.name : '',
        duration: Number.isFinite(duration) ? duration : 0,
        difficulty,
        focus,
        exercises,
        tips,
      };
    });

    const workoutCount = workouts.length;
    const weeklyDays = Number(planRow.weekly_days) || workoutCount || 0;

    let estimatedDuration = planRow.estimated_duration != null ? Number(planRow.estimated_duration) : NaN;
    if (!Number.isFinite(estimatedDuration) || estimatedDuration <= 0) {
      const durations = workouts.map((w) => Number(w.duration) || 0).filter((n) => n > 0);
      if (durations.length) {
        estimatedDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
      } else {
        estimatedDuration = 0;
      }
    }

    const difficultyFallback = workouts.find((w) => w.difficulty && String(w.difficulty).trim())?.difficulty;
    const planDifficulty =
      typeof planRow.difficulty === 'string' && planRow.difficulty.trim()
        ? planRow.difficulty.trim()
        : difficultyFallback || 'Custom';

    const trainerId = planRow.trainer_id != null ? Number(planRow.trainer_id) : null;
    const activeFlag = planRow.is_active == null ? true : Boolean(planRow.is_active);

    return res.json({
      plan: {
        id: String(planRow.id),
        name: typeof planRow.name === 'string' ? planRow.name : '',
        type: trainerId ? 'trainer' : 'system',
        goal: typeof planRow.goal === 'string' ? planRow.goal : '',
        weeklyDays,
        estimatedDuration,
        difficulty: planDifficulty,
        workouts,
        createdBy:
          trainerId && typeof planRow.trainer_name === 'string' ? planRow.trainer_name : undefined,
        createdAt: planRow.created_at,
        active: activeFlag,
      },
    });
  } catch (error) {
    console.error('Error fetching workout plan:', error);
    return res.status(500).json({ message: 'Failed to fetch workout plan' });
  }
});

app.post('/api/members/:id/diet-plan/generate-default', authMiddleware, async (req, res) => {
  const memberId = Number(req.params.id);
  const role = req.user?.role;
  const userId = Number(req.user?.id);

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  if (!userId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const isSelfMember = role === 'member' && userId === memberId;

  if (!isSelfMember && role !== 'nutritionist' && role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    if (role === 'nutritionist') {
      const assigned = await isMemberAssignedToNutritionist(userId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const profileResult = await query(
      `SELECT
         mp.goal,
         mp.weight_kg,
         mp.target_calories,
         mp.nutrition_intake
       FROM member_profiles mp
       WHERE mp.user_id = $1
       LIMIT 1`,
      [memberId]
    );

    const profileRow = profileResult.rows[0] || {};
    const nutritionIntake =
      profileRow.nutrition_intake && typeof profileRow.nutrition_intake === 'object'
        ? profileRow.nutrition_intake
        : {};

    const goalRaw = (nutritionIntake.primaryGoal || profileRow.goal || 'general_fitness')
      .toString()
      .toLowerCase();

    const goalKey =
      goalRaw.includes('loss') || goalRaw.includes('fat')
        ? 'fat_loss'
        : goalRaw.includes('muscle') || goalRaw.includes('gain')
          ? 'muscle_gain'
          : goalRaw.includes('strength')
            ? 'strength'
            : goalRaw.includes('endurance')
              ? 'endurance'
              : goalRaw.includes('flex')
                ? 'flexibility'
                : 'general_fitness';

    const dailyCalories =
      profileRow.target_calories != null && Number(profileRow.target_calories) > 0
        ? Math.round(Number(profileRow.target_calories))
        : 2000;

    const weightKg = profileRow.weight_kg != null ? Number(profileRow.weight_kg) : null;
    const proteinPerKg = goalKey === 'muscle_gain' ? 1.8 : goalKey === 'fat_loss' ? 1.6 : 1.4;
    const dailyProtein = weightKg && weightKg > 0 ? Math.round(weightKg * proteinPerKg) : 120;
    const dailyFat = Math.round((dailyCalories * 0.25) / 9);
    const dailyCarbs = Math.max(0, Math.round((dailyCalories - dailyProtein * 4 - dailyFat * 9) / 4));

    const allergiesText = (nutritionIntake.allergies || nutritionIntake.intolerances || '')
      .toString()
      .toLowerCase();

    const dietPrefText = (nutritionIntake.dietPreferences || nutritionIntake.preferences || '')
      .toString()
      .toLowerCase();
    const budgetText = (nutritionIntake.budget || '').toString().toLowerCase();
    const mealsPerDayRaw = Number(nutritionIntake.mealsPerDay);
    const mealsPerDay = Number.isFinite(mealsPerDayRaw) ? Math.max(1, Math.min(4, Math.floor(mealsPerDayRaw))) : 4;

    const isVegan = dietPrefText.includes('vegan');
    const isVegetarian = isVegan || dietPrefText.includes('vegetarian');
    const isPescatarian = dietPrefText.includes('pesc');

    await query('UPDATE diet_plans SET is_active = FALSE WHERE member_id = $1', [memberId]);

    const nutritionistIdForPlan = role === 'nutritionist' ? userId : null;

    const planInsert = await query(
      `INSERT INTO diet_plans (member_id, nutritionist_id, name, goal, daily_calories, daily_protein, daily_carbs, daily_fat, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
       RETURNING id`,
      [
        memberId,
        nutritionistIdForPlan,
        `${goalKey.replace('_', ' ')} diet plan`.replace(/\b\w/g, (c) => c.toUpperCase()),
        goalKey.replace('_', ' '),
        dailyCalories,
        dailyProtein,
        dailyCarbs,
        dailyFat,
      ]
    );

    const planId = planInsert.rows[0].id;

    // Do not create any meals or food items for the default plan
    return res.status(201).json({ id: planId });
  } catch (error) {
    console.error('Error generating diet plan:', error);
    return res.status(500).json({ message: 'Failed to generate diet plan' });
  }
});

// Manually created diet plan by nutritionist/admin for a member
app.post('/api/members/:id/diet-plan/manual', authMiddleware, async (req, res) => {
  const memberId = Number(req.params.id);
  const { name, goal, meals } = req.body || {};

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  const role = req.user?.role;
  const userId = Number(req.user?.id);

  if (!userId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (role !== 'nutritionist' && role !== 'admin') {
    return res.status(403).json({ message: 'Only nutritionists or admins can create manual diet plans' });
  }

  try {
    if (role === 'nutritionist') {
      const assigned = await isMemberAssignedToNutritionist(userId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const safeName = typeof name === 'string' && name.trim() ? name.trim() : 'Custom diet plan';
    const safeGoal = typeof goal === 'string' && goal.trim() ? goal.trim() : 'custom';
    const safeMeals = Array.isArray(meals) ? meals : [];

    await query('BEGIN');

    // Deactivate previous diet plans for this member
    await query('UPDATE diet_plans SET is_active = FALSE WHERE member_id = $1', [memberId]);

    const nutritionistIdForPlan = role === 'nutritionist' ? userId : null;

    const planInsert = await query(
      `INSERT INTO diet_plans (member_id, nutritionist_id, name, goal, daily_calories, daily_protein, daily_carbs, daily_fat, is_active)
       VALUES ($1, $2, $3, $4, 0, 0, 0, 0, TRUE)
       RETURNING id`,
      [memberId, nutritionistIdForPlan, safeName, safeGoal]
    );

    const dietPlanId = planInsert.rows[0].id;

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    for (const meal of safeMeals) {
      const mealType = typeof meal.mealType === 'string' && ['breakfast', 'lunch', 'dinner', 'snack'].includes(meal.mealType.toLowerCase())
        ? meal.mealType.toLowerCase()
        : 'snack';
      const mealName = typeof meal.name === 'string' && meal.name.trim() ? meal.name.trim() : mealType;
      const mealNotes = typeof meal.notes === 'string' && meal.notes.trim() ? meal.notes.trim() : null;
      const items = Array.isArray(meal.items) ? meal.items : [];

      const mealInsert = await query(
        `INSERT INTO diet_plan_meals (diet_plan_id, meal_type, name, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [dietPlanId, mealType, mealName, mealNotes]
      );
      const mealId = mealInsert.rows[0].id;

      let mealCalories = 0;
      let mealProtein = 0;
      let mealCarbs = 0;
      let mealFat = 0;

      for (const item of items) {
        const rawFoodId = item.foodId;
        const parsedFoodId = rawFoodId != null ? Number(rawFoodId) : NaN;
        let foodId = Number.isFinite(parsedFoodId) && parsedFoodId > 0 ? parsedFoodId : null;
        const foodName = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : null;
        const foodCategory = typeof item.category === 'string' && item.category.trim() ? item.category.trim() : null;
        const quantity = Number(item.quantity) || 0;
        const unit = typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : 'g';
        const calories = Number(item.calories) || 0;
        const protein = Number(item.protein) || 0;
        const carbs = Number(item.carbs) || 0;
        const fat = Number(item.fat) || 0;

        if (!foodId && foodName) {
          const existingFood = await query(
            'SELECT id FROM food_items WHERE LOWER(name) = LOWER($1) LIMIT 1',
            [foodName]
          );

          if (existingFood.rowCount) {
            foodId = existingFood.rows[0].id;
          } else {
            const safeQuantityForBase = quantity > 0 ? quantity : 100;
            const factor = safeQuantityForBase ? 100 / safeQuantityForBase : 1;
            const baseCalories = Math.round(calories * factor * 10) / 10;
            const baseProtein = Math.round(protein * factor * 10) / 10;
            const baseCarbs = Math.round(carbs * factor * 10) / 10;
            const baseFat = Math.round(fat * factor * 10) / 10;

            const foodInsert = await query(
              `INSERT INTO food_items (name, category, calories, protein, carbs, fat, is_local, source_api)
               VALUES ($1, $2, $3, $4, $5, $6, FALSE, 'manual_plan')
               RETURNING id`,
              [foodName, foodCategory, baseCalories, baseProtein, baseCarbs, baseFat]
            );
            foodId = foodInsert.rows[0]?.id ?? null;
          }
        }

        await query(
          `INSERT INTO diet_plan_meal_items (diet_plan_meal_id, food_item_id, quantity, unit, calories, protein, carbs, fat)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [mealId, foodId, quantity, unit, calories, protein, carbs, fat]
        );

        mealCalories += calories;
        mealProtein += protein;
        mealCarbs += carbs;
        mealFat += fat;
      }

      totalCalories += mealCalories;
      totalProtein += mealProtein;
      totalCarbs += mealCarbs;
      totalFat += mealFat;
    }

    // Update plan totals
    await query(
      `UPDATE diet_plans
       SET daily_calories = $1, daily_protein = $2, daily_carbs = $3, daily_fat = $4
       WHERE id = $5`,
      [totalCalories, totalProtein, totalCarbs, totalFat, dietPlanId]
    );

    await query('COMMIT');
    return res.status(201).json({ id: dietPlanId });
  } catch (error) {
    try {
      await query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error rolling back manual diet plan transaction:', rollbackError);
    }
    console.error('Error saving manual diet plan:', error);
    return res.status(500).json({ message: 'Failed to save manual diet plan' });
  }
});
 
// Manually created workout plan by trainer/admin for a member
app.post('/api/members/:id/workout-plan/manual', authMiddleware, async (req, res) => {
  const memberId = Number(req.params.id);
  const { name, goal, days } = req.body || {};

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  const role = req.user?.role;
  const userId = Number(req.user?.id);

  if (!userId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (role !== 'trainer' && role !== 'admin') {
    return res.status(403).json({ message: 'Only trainers or admins can create manual workout plans' });
  }

  try {
    if (role === 'trainer') {
      const assigned = await isMemberAssignedToTrainer(userId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const safeName = typeof name === 'string' && name.trim() ? name.trim() : 'Custom workout plan';
    const safeGoal = typeof goal === 'string' && goal.trim() ? goal.trim() : 'custom';
    const safeDays = Array.isArray(days) ? days : [];

    await query('BEGIN');

    // Deactivate previous workout plans for this member
    await query('UPDATE workout_plans SET is_active = FALSE WHERE member_id = $1', [memberId]);

    const trainerIdForPlan = role === 'trainer' ? userId : null;

    const planInsert = await query(
      `INSERT INTO workout_plans (member_id, trainer_id, name, goal, weekly_days, estimated_duration, difficulty, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       RETURNING id`,
      [
        memberId,
        trainerIdForPlan,
        safeName,
        safeGoal,
        safeDays.length || null,
        null,
        null,
      ]
    );

    const workoutPlanId = planInsert.rows[0].id;

    for (const day of safeDays) {
      const dayOfWeek = typeof day.dayOfWeek === 'string' && day.dayOfWeek.trim()
        ? day.dayOfWeek.trim()
        : null;
      const dayName = typeof day.name === 'string' && day.name.trim() ? day.name.trim() : null;
      const durationMinutes =
        day.durationMinutes != null && day.durationMinutes !== ''
          ? Number(day.durationMinutes)
          : null;
      const difficulty = typeof day.difficulty === 'string' && day.difficulty.trim()
        ? day.difficulty.trim()
        : null;
      const focus = typeof day.focus === 'string' && day.focus.trim() ? day.focus.trim() : null;
      const tips = typeof day.tips === 'string' && day.tips.trim() ? day.tips.trim() : null;

      const dayInsert = await query(
        `INSERT INTO workout_plan_days
           (workout_plan_id, day_of_week, name, duration_minutes, difficulty, focus, tips)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [workoutPlanId, dayOfWeek, dayName, durationMinutes, difficulty, focus, tips]
      );

      const dayId = dayInsert.rows[0].id;

      const exercises = Array.isArray(day.exercises) ? day.exercises : [];
      for (const ex of exercises) {
        const exName = typeof ex.name === 'string' ? ex.name.trim() : '';
        if (!exName) continue;

        const exerciseId =
          ex.exerciseId != null && ex.exerciseId !== '' ? Number(ex.exerciseId) : null;
        const sets = ex.sets != null && ex.sets !== '' ? Number(ex.sets) : null;
        const reps = typeof ex.reps === 'string' && ex.reps.trim() ? ex.reps.trim() : null;
        const rest = typeof ex.rest === 'string' && ex.rest.trim() ? ex.rest.trim() : null;
        const duration =
          ex.durationMinutes != null && ex.durationMinutes !== ''
            ? Number(ex.durationMinutes)
            : null;
        const intensity =
          typeof ex.intensity === 'string' && ex.intensity.trim() ? ex.intensity.trim() : null;
        const instructions =
          typeof ex.instructions === 'string' && ex.instructions.trim()
            ? ex.instructions.trim()
            : null;
        const instructionsCombined =
          instructions && intensity
            ? `${instructions} | Intensity: ${intensity}`
            : instructions || intensity || null;
        const targetMuscles =
          typeof ex.targetMuscles === 'string' && ex.targetMuscles.trim()
            ? ex.targetMuscles.trim()
            : typeof ex.category === 'string' && ex.category.trim()
              ? ex.category.trim()
              : null;

        await query(
          `INSERT INTO workout_plan_exercises
             (workout_plan_day_id, exercise_id, name, sets, reps, rest, duration_minutes, instructions, target_muscles)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            dayId,
            exerciseId,
            exName,
            sets,
            reps,
            rest,
            duration,
            instructionsCombined,
            targetMuscles,
          ]
        );
      }
    }

    await query('COMMIT');
    return res.status(201).json({ id: workoutPlanId });
  } catch (error) {
    try {
      await query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error rolling back manual workout plan transaction:', rollbackError);
    }
    console.error('Error saving manual workout plan:', error);
    return res.status(500).json({ message: 'Failed to save manual workout plan' });
  }
});

// Progress summary for a member (used by Progress page)
app.get('/api/members/:id/progress-summary', async (req, res) => {
  const memberId = Number(req.params.id);

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  try {
    const profileResult = await query(
      `SELECT
         COALESCE(mp.is_private, FALSE) AS is_private,
         mp.weight_kg,
         mp.target_calories,
         mg.weekly_workout_minutes
       FROM users u
       LEFT JOIN member_profiles mp ON mp.user_id = u.id
       LEFT JOIN member_goals mg ON mg.member_id = u.id
       WHERE u.id = $1`,
      [memberId]
    );

    const profileRow = profileResult.rows[0] || {};
    const calorieTarget =
      profileRow.target_calories != null && Number(profileRow.target_calories) > 0
        ? Number(profileRow.target_calories)
        : 2000;

    const weeklyWorkoutMinutes =
      profileRow.weekly_workout_minutes != null && Number(profileRow.weekly_workout_minutes) > 0
        ? Number(profileRow.weekly_workout_minutes)
        : 300;

    const weeklyWorkoutSessionsTarget = Math.max(1, Math.round(weeklyWorkoutMinutes / 30));
    const monthlyWorkoutSessionsTarget = weeklyWorkoutSessionsTarget * 4;

    const startedAtResult = await query(
      `SELECT MIN(ts) AS started_at FROM (
         SELECT MIN(logged_at) AS ts FROM meal_logs WHERE member_id = $1
         UNION ALL
         SELECT MIN(logged_at) AS ts FROM workout_logs WHERE member_id = $1
         UNION ALL
         SELECT MIN(logged_at) AS ts FROM weight_logs WHERE member_id = $1
       ) t`,
      [memberId]
    );

    const startedAt = startedAtResult.rows[0]?.started_at ?? null;

    const daysActiveResult = await query(
      `SELECT COUNT(*)::int AS days_active FROM (
         SELECT DATE(logged_at) AS d FROM meal_logs WHERE member_id = $1
         UNION
         SELECT DATE(logged_at) AS d FROM workout_logs WHERE member_id = $1
         UNION
         SELECT DATE(logged_at) AS d FROM weight_logs WHERE member_id = $1
       ) t`,
      [memberId]
    );

    const daysActive = Number(daysActiveResult.rows[0]?.days_active) || 0;

    const workoutsCompletedResult = await query(
      `SELECT COUNT(*)::int AS count
       FROM workout_logs wl
       JOIN workout_log_items wli ON wli.workout_log_id = wl.id
       WHERE wl.member_id = $1`,
      [memberId]
    );

    const workoutsCompleted = Number(workoutsCompletedResult.rows[0]?.count) || 0;

    const workoutsThisMonthResult = await query(
      `SELECT COUNT(*)::int AS count
       FROM workout_logs wl
       JOIN workout_log_items wli ON wli.workout_log_id = wl.id
       WHERE wl.member_id = $1
         AND DATE_TRUNC('month', wl.logged_at) = DATE_TRUNC('month', NOW())`,
      [memberId]
    );

    const workoutsThisMonth = Number(workoutsThisMonthResult.rows[0]?.count) || 0;

    const mealLogsResult = await query(
      `SELECT COUNT(*)::int AS count
       FROM meal_logs
       WHERE member_id = $1`,
      [memberId]
    );

    const mealLogs = Number(mealLogsResult.rows[0]?.count) || 0;

    const mealsPerDayAvg = daysActive > 0 ? Number((mealLogs / daysActive).toFixed(1)) : 0;

    const weightStartResult = await query(
      `SELECT weight_kg, logged_at
       FROM weight_logs
       WHERE member_id = $1
       ORDER BY logged_at ASC
       LIMIT 1`,
      [memberId]
    );

    const weightCurrentResult = await query(
      `SELECT weight_kg, logged_at
       FROM weight_logs
       WHERE member_id = $1
       ORDER BY logged_at DESC
       LIMIT 1`,
      [memberId]
    );

    const startWeight = weightStartResult.rowCount
      ? Number(weightStartResult.rows[0].weight_kg)
      : profileRow.weight_kg != null
        ? Number(profileRow.weight_kg)
        : null;

    const currentWeight = weightCurrentResult.rowCount
      ? Number(weightCurrentResult.rows[0].weight_kg)
      : profileRow.weight_kg != null
        ? Number(profileRow.weight_kg)
        : null;

    const weightChangeKg =
      startWeight != null && currentWeight != null ? Number((currentWeight - startWeight).toFixed(1)) : null;

    const totalWeightLostKg =
      startWeight != null && currentWeight != null ? Number((startWeight - currentWeight).toFixed(1)) : null;

    const weightChartResult = await query(
      `SELECT DATE(logged_at) AS date, AVG(weight_kg)::float AS weight
       FROM weight_logs
       WHERE member_id = $1
         AND logged_at >= NOW() - INTERVAL '180 days'
       GROUP BY DATE(logged_at)
       ORDER BY DATE(logged_at) ASC`,
      [memberId]
    );

    let weightData = (weightChartResult.rows || []).map((row) => {
      const dateObj = row.date instanceof Date ? row.date : new Date(row.date);
      const dateStr = !Number.isNaN(dateObj.getTime())
        ? dateObj.toISOString().slice(0, 10)
        : String(row.date);

      return {
        date: dateStr,
        weight: Number(row.weight) || 0,
      };
    });

    if (!weightData.length && startWeight != null && currentWeight != null) {
      const startedAtDate = startedAt ? new Date(startedAt) : null;
      const startedAtStr =
        startedAtDate && !Number.isNaN(startedAtDate.getTime())
          ? startedAtDate.toISOString().slice(0, 10)
          : null;
      const todayStr = new Date().toISOString().slice(0, 10);

      weightData = [
        {
          date: startedAtStr || todayStr,
          weight: Number(startWeight) || 0,
        },
        {
          date: todayStr,
          weight: Number(currentWeight) || 0,
        },
      ];
    }

    const workoutChartResult = await query(
      `WITH weeks AS (
         SELECT generate_series(
           DATE_TRUNC('week', CURRENT_DATE - INTERVAL '21 days'),
           DATE_TRUNC('week', CURRENT_DATE),
           INTERVAL '1 week'
         )::date AS week_start
       )
       SELECT
         w.week_start,
         COALESCE(COUNT(wli.id), 0)::int AS sessions
       FROM weeks w
       LEFT JOIN workout_logs wl
         ON wl.member_id = $1
        AND DATE_TRUNC('week', wl.logged_at)::date = w.week_start
       LEFT JOIN workout_log_items wli ON wli.workout_log_id = wl.id
       GROUP BY w.week_start
       ORDER BY w.week_start ASC`,
      [memberId]
    );

    const workoutData = (workoutChartResult.rows || []).map((row) => {
      const dateObj = row.week_start instanceof Date ? row.week_start : new Date(row.week_start);
      const weekStartStr = !Number.isNaN(dateObj.getTime())
        ? dateObj.toISOString().slice(0, 10)
        : String(row.week_start);

      return {
        week_start: weekStartStr,
        sessions: Number(row.sessions) || 0,
      };
    });

    const calorieChartResult = await query(
      `WITH days AS (
         SELECT generate_series(
           CURRENT_DATE - INTERVAL '6 days',
           CURRENT_DATE,
           INTERVAL '1 day'
         )::date AS date
       )
       SELECT
         d.date,
         COALESCE(SUM(mli.calories), 0) AS calories
       FROM days d
       LEFT JOIN meal_logs ml
         ON ml.member_id = $1
        AND DATE(ml.logged_at) = d.date
       LEFT JOIN meal_log_items mli ON mli.meal_log_id = ml.id
       GROUP BY d.date
       ORDER BY d.date ASC`,
      [memberId]
    );

    const calorieData = (calorieChartResult.rows || []).map((row) => {
      const dateObj = row.date instanceof Date ? row.date : new Date(row.date);
      const dateStr = !Number.isNaN(dateObj.getTime())
        ? dateObj.toISOString().slice(0, 10)
        : String(row.date);
      const day = !Number.isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString('en-US', { weekday: 'short' })
        : dateStr;

      return {
        date: dateStr,
        day,
        calories: Number(row.calories) || 0,
        target: calorieTarget,
      };
    });

    const calorieTolerance = 0.1;
    const consistentDays = calorieData.filter((row) => {
      const calories = Number(row.calories) || 0;
      return (
        calories >= calorieTarget * (1 - calorieTolerance) &&
        calories <= calorieTarget * (1 + calorieTolerance)
      );
    }).length;
    const calorieConsistencyPercent = calorieData.length
      ? Math.round((consistentDays / calorieData.length) * 100)
      : 0;

    return res.json({
      profile: {
        is_private: Boolean(profileRow.is_private),
      },
      stats: {
        started_at: startedAt,
        days_active: daysActive,
        start_weight_kg: startWeight,
        current_weight_kg: currentWeight,
        total_weight_lost_kg: totalWeightLostKg,
        workouts_completed: workoutsCompleted,
        workouts_this_month: workoutsThisMonth,
        meal_logs: mealLogs,
        meals_per_day_avg: mealsPerDayAvg,
        calorie_consistency_percent: calorieConsistencyPercent,
      },
      targets: {
        calorie_target: calorieTarget,
        weekly_workout_sessions_target: weeklyWorkoutSessionsTarget,
        monthly_workout_sessions_target: monthlyWorkoutSessionsTarget,
      },
      charts: {
        weight: weightData,
        workouts: workoutData,
        calories: calorieData,
      },
    });
  } catch (error) {
    console.error('Error fetching progress summary:', error);
    return res.status(500).json({ message: 'Failed to fetch progress summary' });
  }
});

// Detailed dashboard summary for a member (used by MemberDashboard & NutritionistAnalytics)
app.get('/api/members/:id/dashboard-summary', authMiddleware, async (req, res) => {
  const memberId = Number(req.params.id);
  const role = req.user?.role;
  const userId = Number(req.user?.id);

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  if (!userId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    if (role === 'member') {
      if (userId !== memberId) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (role === 'trainer') {
      const assigned = await isMemberAssignedToTrainer(userId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (role === 'nutritionist') {
      const assigned = await isMemberAssignedToNutritionist(userId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    let days = Number(req.query.days) || 14;
    if (!Number.isFinite(days) || days <= 0) {
      days = 14;
    }
    if (days > 90) {
      days = 90;
    }

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - (days - 1));
    const fromDateStr = fromDate.toISOString().slice(0, 10);

    const daysResult = await query(
      `SELECT
         d::date AS date,
         COALESCE(SUM(calories_consumed), 0) AS calories_consumed,
         COALESCE(SUM(calories_burned), 0) AS calories_burned,
         COALESCE(SUM(protein), 0) AS protein,
         COALESCE(SUM(carbs), 0) AS carbs,
         COALESCE(SUM(fat), 0) AS fat
       FROM (
         SELECT
           DATE(ml.logged_at) AS d,
           SUM(mli.calories) AS calories_consumed,
           0 AS calories_burned,
           SUM(mli.protein) AS protein,
           SUM(mli.carbs) AS carbs,
           SUM(mli.fat) AS fat
         FROM meal_logs ml
         JOIN meal_log_items mli ON mli.meal_log_id = ml.id
         WHERE ml.member_id = $1
           AND DATE(ml.logged_at) >= $2::date
         GROUP BY DATE(ml.logged_at)
         UNION ALL
         SELECT
           DATE(wl.logged_at) AS d,
           0 AS calories_consumed,
           SUM(wli.calories_burned) AS calories_burned,
           0 AS protein,
           0 AS carbs,
           0 AS fat
         FROM workout_logs wl
         JOIN workout_log_items wli ON wli.workout_log_id = wl.id
         WHERE wl.member_id = $1
           AND DATE(wl.logged_at) >= $2::date
         GROUP BY DATE(wl.logged_at)
       ) t
       GROUP BY d
       ORDER BY d`,
      [memberId, fromDateStr]
    );

    const daysRows = daysResult.rows || [];
    const daysOut = daysRows.map((row) => {
      const dateObj = row.date instanceof Date ? row.date : new Date(row.date);
      const dateStr = !Number.isNaN(dateObj.getTime())
        ? dateObj.toISOString().slice(0, 10)
        : String(row.date);
      const label = !Number.isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : String(row.date);

      return {
        date: dateStr,
        label,
        calories_consumed: Number(row.calories_consumed) || 0,
        calories_burned: Number(row.calories_burned) || 0,
        protein: Number(row.protein) || 0,
        carbs: Number(row.carbs) || 0,
        fat: Number(row.fat) || 0,
      };
    });

    const activitiesResult = await query(
      `SELECT
         ml.id,
         'meal' AS type,
         ml.logged_at,
         ml.meal_type,
         COALESCE(SUM(mli.calories), 0) AS calories
       FROM meal_logs ml
       LEFT JOIN meal_log_items mli ON mli.meal_log_id = ml.id
       WHERE ml.member_id = $1
         AND DATE(ml.logged_at) >= $2::date
       GROUP BY ml.id, ml.logged_at, ml.meal_type
       UNION ALL
       SELECT
         wl.id,
         'workout' AS type,
         wl.logged_at,
         NULL AS meal_type,
         COALESCE(SUM(wli.calories_burned), 0) AS calories
       FROM workout_logs wl
       LEFT JOIN workout_log_items wli ON wli.workout_log_id = wl.id
       WHERE wl.member_id = $1
         AND DATE(wl.logged_at) >= $2::date
       GROUP BY wl.id, wl.logged_at
       ORDER BY logged_at`,
      [memberId, fromDateStr]
    );

    const activitiesRows = activitiesResult.rows || [];
    const activitiesOut = activitiesRows.map((row) => ({
      type: row.type === 'meal' ? 'meal' : 'workout',
      id: Number(row.id),
      logged_at: row.logged_at,
      meal_type: row.meal_type || undefined,
      calories: Number(row.calories) || 0,
    }));

    return res.json({ days: daysOut, activities: activitiesOut });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    return res.status(500).json({ message: 'Failed to fetch dashboard summary' });
  }
});

// Threaded plan messages (member – coach conversations on diet/workout plans)
app.get('/api/members/:id/plan-messages', authMiddleware, async (req, res) => {
  const memberId = Number(req.params.id);
  const planType = typeof req.query.planType === 'string' ? req.query.planType.toLowerCase() : '';
  
  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  if (planType !== 'diet' && planType !== 'workout') {
    return res.status(400).json({ message: "planType must be 'diet' or 'workout'" });
  }

  let limit = Number(req.query.limit) || 50;
  if (!Number.isFinite(limit) || limit <= 0) {
    limit = 50;
  }
  if (limit > 200) {
    limit = 200;
  }

  const role = req.user?.role;
  const requesterId = Number(req.user?.id);

  if (!requesterId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    if (role === 'member') {
      if (requesterId !== memberId) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (role === 'trainer') {
      const assigned = await isMemberAssignedToTrainer(requesterId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (role === 'nutritionist') {
      const assigned = await isMemberAssignedToNutritionist(requesterId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const result = await query(
      `SELECT id, member_id, coach_id, sender_role, plan_type, message, created_at
       FROM member_plan_messages
       WHERE member_id = $1 AND plan_type = $2
       ORDER BY created_at ASC
       LIMIT $3`,
      [memberId, planType, limit]
    );

    return res.json({ messages: result.rows || [] });
  } catch (error) {
    console.error('Error fetching plan messages:', error);
    return res.status(500).json({ message: 'Failed to fetch plan messages' });
  }
});

app.post('/api/members/:id/plan-messages', authMiddleware, async (req, res) => {
  const memberId = Number(req.params.id);
  const { planType, message } = req.body || {};

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  const normalizedPlanType = typeof planType === 'string' ? planType.toLowerCase() : '';
  if (normalizedPlanType !== 'diet' && normalizedPlanType !== 'workout') {
    return res.status(400).json({ message: "planType must be 'diet' or 'workout'" });
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ message: 'Message is required' });
  }

  const role = req.user?.role;
  const userId = Number(req.user?.id);

  if (!userId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  let senderRole;
  let coachId = null;

  try {
    if (role === 'member') {
      if (userId !== memberId) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      senderRole = 'member';
    } else if (role === 'trainer') {
      if (normalizedPlanType !== 'workout') {
        return res.status(403).json({ message: 'Trainers can only post to workout plan messages' });
      }
      const assigned = await isMemberAssignedToTrainer(userId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      senderRole = 'trainer';
      coachId = userId;
    } else if (role === 'nutritionist') {
      if (normalizedPlanType !== 'diet') {
        return res.status(403).json({ message: 'Nutritionists can only post to diet plan messages' });
      }
      const assigned = await isMemberAssignedToNutritionist(userId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      senderRole = 'nutritionist';
      coachId = userId;
    } else if (role === 'admin') {
      senderRole = 'admin';
      coachId = userId;
    } else {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const result = await query(
      `INSERT INTO member_plan_messages (member_id, coach_id, sender_role, plan_type, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, member_id, coach_id, sender_role, plan_type, message, created_at`,
      [memberId, coachId, senderRole, normalizedPlanType, message.trim()]
    );

    const row = result.rows[0];

    // Create notifications for relevant users so unread messages are visible
    try {
      const notifPromises = [];
      const planLabel = normalizedPlanType === 'diet' ? 'diet plan' : 'workout plan';

      if (senderRole === 'member') {
        // Notify assigned coach based on plan type
        if (normalizedPlanType === 'workout') {
          const trainerRes = await query(
            'SELECT trainer_id FROM trainer_assignments WHERE member_id = $1',
            [memberId]
          );
          const trainerId = trainerRes.rows[0]?.trainer_id;
          if (trainerId) {
            notifPromises.push(
              query('INSERT INTO notifications (user_id, message) VALUES ($1, $2)', [
                trainerId,
                `New message from member about their ${planLabel}`,
              ])
            );
          }
        } else if (normalizedPlanType === 'diet') {
          const nutrRes = await query(
            'SELECT nutritionist_id FROM nutritionist_assignments WHERE member_id = $1',
            [memberId]
          );
          const nutritionistId = nutrRes.rows[0]?.nutritionist_id;
          if (nutritionistId) {
            notifPromises.push(
              query('INSERT INTO notifications (user_id, message) VALUES ($1, $2)', [
                nutritionistId,
                `New message from member about their ${planLabel}`,
              ])
            );
          }
        }
      } else {
        // Trainer, nutritionist or admin sent the message -> notify the member
        notifPromises.push(
          query('INSERT INTO notifications (user_id, message) VALUES ($1, $2)', [
            memberId,
            `New message about your ${planLabel}`,
          ])
        );
      }

      // Always notify admins about plan conversations (as overview)
      notifPromises.push(
        query(
          `INSERT INTO notifications (user_id, message)
           SELECT id, $1 FROM users WHERE role = 'admin' AND id <> $2`,
          [`New ${normalizedPlanType} plan message for member #${memberId}`, userId]
        )
      );

      await Promise.all(notifPromises);
    } catch (notifError) {
      console.error('Error creating plan message notifications:', notifError);
    }

    return res.status(201).json({ message: row });
  } catch (error) {
    console.error('Error creating plan message:', error);
    return res.status(500).json({ message: 'Failed to create plan message' });
  }
});

app.get('/api/notifications', authMiddleware, async (req, res) => {
  const userId = Number(req.user?.id);

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const rawOnlyUnread = req.query.only_unread;
  let onlyUnread = false;
  if (typeof rawOnlyUnread === 'string') {
    onlyUnread = rawOnlyUnread === '1' || rawOnlyUnread.toLowerCase() === 'true';
  }

  try {
    const result = await query(
      `SELECT id, message, created_at, is_read
       FROM notifications
       WHERE user_id = $1
       ${onlyUnread ? 'AND is_read = FALSE' : ''}
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );

    return res.json({ notifications: result.rows || [] });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

app.post('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  const userId = Number(req.user?.id);
  const notificationId = Number(req.params.id);

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!notificationId) {
    return res.status(400).json({ message: 'Valid notification id is required' });
  }

  try {
    await query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [
      notificationId,
      userId,
    ]);

    return res.json({ ok: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

// Member subjective check-ins (adherence, fatigue, pain, weight, notes)
app.get('/api/members/:id/check-ins', async (req, res) => {
  const memberId = Number(req.params.id);
  let limit = Number(req.query.limit) || 10;

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    limit = 10;
  }
  if (limit > 50) {
    limit = 50;
  }

  try {
    const result = await query(
      `SELECT id, member_id, adherence, fatigue, pain, weight_kg, notes, logged_at
       FROM member_check_ins
       WHERE member_id = $1
       ORDER BY logged_at DESC
       LIMIT $2`,
      [memberId, limit]
    );

    return res.json({ checkIns: result.rows || [] });
  } catch (error) {
    console.error('Error fetching member check-ins:', error);
    return res.status(500).json({ message: 'Failed to fetch member check-ins' });
  }
});

app.post('/api/members/:id/check-ins', async (req, res) => {
  const memberId = Number(req.params.id);
  const { adherence, fatigue, pain, weightKg, notes } = req.body || {};

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  try {
    await query('BEGIN');

    const insertResult = await query(
      `INSERT INTO member_check_ins
         (member_id, adherence, fatigue, pain, weight_kg, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, member_id, adherence, fatigue, pain, weight_kg, notes, logged_at`,
      [
        memberId,
        adherence != null ? Number(adherence) : null,
        fatigue != null ? Number(fatigue) : null,
        pain != null ? Number(pain) : null,
        weightKg != null ? Number(weightKg) : null,
        notes ?? null,
      ]
    );

    if (weightKg != null) {
      await query(
        'INSERT INTO weight_logs (member_id, weight_kg, logged_at) VALUES ($1, $2, NOW())',
        [memberId, Number(weightKg)]
      );
    }

    await query('COMMIT');
    const row = insertResult.rows[0];
    return res.status(201).json({ checkIn: row });
  } catch (error) {
    try {
      await query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error rolling back member check-in transaction:', rollbackError);
    }
    console.error('Error creating member check-in:', error);
    return res.status(500).json({ message: 'Failed to create member check-in' });
  }
});

// Admin list users
app.post('/api/admin/users/invite', async (req, res) => {
  const { full_name, email, role } = req.body || {};

  if (!full_name || !email || !role) {
    return res.status(400).json({ message: 'full_name, email and role are required' });
  }

  const allowedRoles = ['member', 'trainer', 'nutritionist', 'admin'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  try {
    const insertResult = await query(
      `INSERT INTO users (full_name, email, role, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [full_name, email, role]
    );

    const userRow = insertResult.rows[0];

    // Do NOT send activation OTP here. The member will request an OTP later
    // via /api/auth/request-otp when they are ready to activate their account.

    return res.status(201).json({ id: userRow.id });
  } catch (error) {
    // Unique violation on email
    if (error && error.code === '23505') {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }

    console.error('Error inviting user:', error);
    return res.status(500).json({ message: 'Failed to invite user' });
  }
});

app.get('/api/admin/users', async (_req, res) => {
  try {
    const result = await query(
      `SELECT 
         u.id,
         u.full_name AS name,
         u.email,
         u.role,
         (u.status = 'active' AND u.password_hash IS NOT NULL) AS "isActivated",
         u.created_at AS "joinDate",
         ta.trainer_id AS "trainerId",
         na.nutritionist_id AS "nutritionistId"
       FROM users u
       LEFT JOIN trainer_assignments ta ON ta.member_id = u.id
       LEFT JOIN nutritionist_assignments na ON na.member_id = u.id
       ORDER BY u.created_at DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// Admin get single user
app.get('/api/admin/users/:id', async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: 'Valid user id is required' });
  }

  try {
    const result = await query(
      `SELECT 
         u.id,
         u.full_name AS name,
         u.email,
         u.role,
         (u.status = 'active' AND u.password_hash IS NOT NULL) AS "isActivated",
         u.created_at AS "joinDate",
         ta.trainer_id AS "trainerId",
         na.nutritionist_id AS "nutritionistId"
       FROM users u
       LEFT JOIN trainer_assignments ta ON ta.member_id = u.id
       LEFT JOIN nutritionist_assignments na ON na.member_id = u.id
       WHERE u.id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user by id:', error);
    return res.status(500).json({ message: 'Failed to fetch user' });
  }
});

// Admin update user (role and assignments)
app.put('/api/admin/users/:id', async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: 'Valid user id is required' });
  }

  const { role, trainerId, nutritionistId } = req.body || {};

  try {
    if (role) {
      await query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, id]);
    }

    if (trainerId !== undefined) {
      if (trainerId === null) {
        await query('DELETE FROM trainer_assignments WHERE member_id = $1', [id]);
      } else {
        const trainerIdNum = Number(trainerId);
        await query(
          `INSERT INTO trainer_assignments (member_id, trainer_id, assigned_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (member_id) DO UPDATE
           SET trainer_id = EXCLUDED.trainer_id, assigned_at = NOW()`,
          [id, trainerIdNum]
        );
      }
    }

    if (nutritionistId !== undefined) {
      if (nutritionistId === null) {
        await query('DELETE FROM nutritionist_assignments WHERE member_id = $1', [id]);
      } else {
        const nutritionistIdNum = Number(nutritionistId);
        await query(
          `INSERT INTO nutritionist_assignments (member_id, nutritionist_id, assigned_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (member_id) DO UPDATE
           SET nutritionist_id = EXCLUDED.nutritionist_id, assigned_at = NOW()`,
          [id, nutritionistIdNum]
        );
      }
    }

    const result = await query(
      `SELECT 
         u.id,
         u.full_name AS name,
         u.email,
         u.role,
         u.created_at AS "joinDate",
         ta.trainer_id AS "trainerId",
         na.nutritionist_id AS "nutritionistId"
       FROM users u
       LEFT JOIN trainer_assignments ta ON ta.member_id = u.id
       LEFT JOIN nutritionist_assignments na ON na.member_id = u.id
       WHERE u.id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ message: 'Failed to update user' });
  }
});

// Admin delete user
app.delete('/api/admin/users/:id', async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: 'Valid user id is required' });
  }

  try {
    // Use an explicit transaction so we can safely clean up related data
    await query('BEGIN');

    // Detach coaches from plans rather than deleting the plans themselves
    await query('UPDATE diet_plans SET nutritionist_id = NULL WHERE nutritionist_id = $1', [id]);
    await query('UPDATE workout_plans SET trainer_id = NULL WHERE trainer_id = $1', [id]);

    // Remove feedback rows referencing this user as trainer/nutritionist or member
    await query('DELETE FROM trainer_feedback WHERE trainer_id = $1 OR member_id = $1', [id]);
    await query('DELETE FROM nutritionist_feedback WHERE nutritionist_id = $1 OR member_id = $1', [id]);

    // Remove schedules where this user is either the trainer or the member
    await query('DELETE FROM schedules WHERE trainer_id = $1 OR member_id = $1', [id]);

    // Finally delete the user row (other member-linked tables mostly use ON DELETE CASCADE)
    await query('DELETE FROM users WHERE id = $1', [id]);

    await query('COMMIT');
    return res.status(204).send();
  } catch (error) {
    try {
      await query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error rolling back delete user transaction:', rollbackError);
    }
    console.error('Error deleting user:', error);
    return res.status(500).json({ message: 'Failed to delete user' });
  }
});

// Request new OTP for an invited user
app.post('/api/auth/request-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const result = await query(
      'SELECT id, full_name FROM users WHERE email = $1',
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];
    const otpResult = await query(
      'SELECT send_activation_otp($1, $2, $3, $4) AS otp',
      [user.id, email, req.ip || null, req.get('user-agent') || null]
    );
    const otp = otpResult.rows[0].otp;

    await sendOtpEmail(email, user.full_name, otp);

    return res.json({ ok: true });
  } catch (error) {
    console.error('Error requesting OTP:', error);
    return res.status(500).json({ message: 'Failed to request OTP' });
  }
});

// Activate account with OTP and set password
app.post('/api/auth/activate', async (req, res) => {
  const { email, otp, full_name, password } = req.body || {};

  if (!email || !otp || !password) {
    return res.status(400).json({ message: 'email, otp and password are required' });
  }

  try {
    const result = await query(
      'SELECT id, full_name FROM users WHERE email = $1',
      [email]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const user = result.rows[0];
    const verifyResult = await query(
      'SELECT verify_activation_otp($1, $2, $3, $4) AS ok',
      [user.id, otp, req.ip || null, req.get('user-agent') || null]
    );
    if (!verifyResult.rows[0].ok) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await query(
      'UPDATE users SET password_hash = $1, full_name = COALESCE($2, full_name) WHERE id = $3',
      [passwordHash, full_name || null, user.id]
 );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error activating account:', error);
    return res.status(500).json({ message: 'Failed to activate account' });}
});

// Forgot password: request OTP
app.post('/api/auth/forgot-password/request', async (req, res) => {
  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const result = await query(
      'SELECT id, full_name, status, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (result.rowCount === 0) {
      return res.json({ ok: true });
    }

    const user = result.rows[0];

    if (user.status !== 'active' || !user.password_hash) {
      return res.json({ ok: true });
    }

    const otp = String(randomInt(0, 1000000)).padStart(6, '0');
    const otpHash = await bcrypt.hash(otp, 10);

    await query(
      `UPDATE users
       SET reset_token = $1,
           reset_token_expires = NOW() + INTERVAL '10 minutes'
       WHERE id = $2`,
      [otpHash, user.id]
    );

    await sendPasswordResetEmail(email, user.full_name, otp);

    return res.json({ ok: true });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    return res.status(500).json({ message: 'Failed to request password reset' });
  }
});

// Forgot password: verify OTP and reset password
app.post('/api/auth/forgot-password/reset', async (req, res) => {
  const { email, otp, password } = req.body || {};

  if (!email || !otp || !password) {
    return res.status(400).json({ message: 'email, otp and password are required' });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  try {
    const result = await query(
      'SELECT id, full_name, status, reset_token, reset_token_expires FROM users WHERE email = $1',
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    const user = result.rows[0];

    if (user.status !== 'active' || !user.reset_token || !user.reset_token_expires) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    if (new Date(user.reset_token_expires).getTime() < Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    const ok = await bcrypt.compare(String(otp), String(user.reset_token));
    if (!ok) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await query(
      `UPDATE users
       SET password_hash = $1,
           reset_token = NULL,
           reset_token_expires = NULL
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ message: 'Failed to reset password' });
  }
});

// Email/password login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'email and password are required' });
  }

  try {
    const result = await query(
      'SELECT id, full_name, email, role, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (result.rowCount === 0 || !result.rows[0].password_hash) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const jwtSecret = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    const csrfToken = randomBytes(32).toString('hex');
    setSessionCookies(res, { token, csrfToken });

    return res.json({
      success: true,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const id = Number(req.user?.id);
  if (!id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const result = await query('SELECT id, full_name, email, role FROM users WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const u = result.rows[0];
    return res.json({
      user: {
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        role: u.role,
      },
    });
  } catch (error) {
    console.error('Error reading session user:', error);
    return res.status(500).json({ message: 'Failed to read session' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookies(res);
  return res.json({ ok: true });
});

// Search for foods in both local DB (food_items) and Edamam API
app.get('/api/foods', async (req, res) => {
  const q = (req.query.q || '').toString().trim();

  try {
    // If no query provided, return a default list from local DB
    if (!q) {
      const result = await query(
        `SELECT 
           id::text,
           name,
           category,
           calories,
           protein,
           carbs,
           fat
         FROM food_items
         ORDER BY name
         LIMIT 50`
      );

      return res.json({ foods: result.rows });
    }

    // First search in local database
    const localResult = await query(
      `SELECT 
         id::text,
         name,
         category,
         calories,
         protein,
         carbs,
         fat,
         'local' as source
       FROM food_items 
       WHERE name ILIKE $1 
       ORDER BY name 
       LIMIT 20`,
      [`%${q}%`]
    );

    // If we have local results, return them
    if (localResult.rows.length > 0) {
      return res.json({ foods: localResult.rows });
    }

    // If no local results, try Edamam API
    // Support both backend-only env vars and Vite-style shared env vars.
    // Also strip any surrounding quotes that might be present in .env values.
    const rawAppId = process.env.EDAMAM_APP_ID || process.env.VITE_EDAMAM_APP_ID;
    const rawAppKey = process.env.EDAMAM_APP_KEY || process.env.VITE_EDAMAM_APP_KEY;
    const EDAMAM_APP_ID = rawAppId ? rawAppId.replace(/^"|"$/g, '') : undefined;
    const EDAMAM_APP_KEY = rawAppKey ? rawAppKey.replace(/^"|"$/g, '') : undefined;

    if (!EDAMAM_APP_ID || !EDAMAM_APP_KEY) {
      console.warn('Edamam API credentials not configured');
      return res.json({ foods: [] });
    }

    const response = await fetch(
      `https://api.edamam.com/api/food-database/v2/parser?app_id=${EDAMAM_APP_ID}&app_key=${EDAMAM_APP_KEY}&ingr=${encodeURIComponent(q)}&nutrition-type=logging`
    );
    
    if (!response.ok) {
      throw new Error(`Edamam API error: ${response.statusText}`);
    }

    const data = await response.json();
    const edamamFoods = data.hints?.map((hint) => ({
      id: `edamam-${hint.food.foodId}`,
      name: hint.food.label,
      category: '',
      calories: hint.food.nutrients.ENERC_KCAL || 0,
      protein: hint.food.nutrients.PROCNT || 0,
      carbs: hint.food.nutrients.CHOCDF || 0,
      fat: hint.food.nutrients.FAT || 0,
      source: 'edamam',
    })) || [];

    // Save the first 5 results to local DB for future use
    if (edamamFoods.length > 0) {
      try {
        const values = edamamFoods
          .slice(0, 5)
          .map(
            (food) =>
              `('${food.name.replace(/'/g, "''")}', ${food.calories}, ${food.protein}, ${food.carbs}, ${food.fat})`
          )
          .join(',');

        await query(
          `INSERT INTO food_items (name, calories, protein, carbs, fat)
           VALUES ${values}
           ON CONFLICT (name) DO NOTHING`
        );
      } catch (dbError) {
        console.error('Error saving foods to local DB:', dbError);
      }
    }

    return res.json({ foods: edamamFoods });
  } catch (error) {
    console.error('Food search error:', error);
    return res.status(500).json({ message: 'Failed to search for foods' });
  }
});

app.post('/api/foods', authMiddleware, async (req, res) => {
  const userId = Number(req.user?.id);
  const body = req.body || {};

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return res.status(400).json({ message: 'name is required' });
  }

  const category = typeof body.category === 'string' ? body.category.trim() : null;
  const caloriesRaw = body.calories != null ? Number(body.calories) : 0;
  const proteinRaw = body.protein != null ? Number(body.protein) : 0;
  const carbsRaw = body.carbs != null ? Number(body.carbs) : 0;
  const fatRaw = body.fat != null ? Number(body.fat) : 0;

  const calories = Number.isFinite(caloriesRaw) && caloriesRaw >= 0 ? caloriesRaw : 0;
  const protein = Number.isFinite(proteinRaw) && proteinRaw >= 0 ? proteinRaw : 0;
  const carbs = Number.isFinite(carbsRaw) && carbsRaw >= 0 ? carbsRaw : 0;
  const fat = Number.isFinite(fatRaw) && fatRaw >= 0 ? fatRaw : 0;

  try {
    const result = await query(
      `INSERT INTO food_items (name, category, calories, protein, carbs, fat, is_local)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id`,
      [name, category || null, calories, protein, carbs, fat]
    );

    return res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    console.error('Error creating food item:', error);
    return res.status(500).json({ message: 'Failed to create food item' });
  }
});

app.get('/api/exercises', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         id::text,
         name,
         COALESCE(calories_per_min, 0)::float AS "caloriesPerMinute"
       FROM exercises
       ORDER BY name
       LIMIT 100`
    );

    return res.json({ exercises: result.rows });
  } catch (error) {
    console.error('Error fetching exercises:', error);
    return res.status(500).json({ message: 'Failed to fetch exercises' });
  }
});

// Search for exercises in local DB and external API
app.get('/api/exercises/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  
  if (!q) {
    return res.status(400).json({ message: 'Search query is required' });
  }

  try {
    // First search in local database
    const localResult = await query(
      `SELECT 
         id::text,
         name,
         description,
         calories_per_min as "caloriesPerMinute",
         'local' as source
       FROM exercises 
       WHERE name ILIKE $1 
       ORDER BY name 
       LIMIT 20`,
      [`%${q}%`]
    );

    // If we have local results, return them
    if (localResult.rows.length > 0) {
      return res.json(localResult.rows);
    }

    // If no local results, try external API (API Ninjas)
    // Support both backend-only and Vite-style env variable names
    const API_NINJAS_KEY = process.env.API_NINJAS_KEY || process.env.VITE_API_NINJAS_KEY;
    if (!API_NINJAS_KEY) {
      console.warn('API Ninjas key not configured');
      return res.json([]);
    }

    const response = await fetch(
      `https://api.api-ninjas.com/v1/exercises?name=${encodeURIComponent(q)}`,
      {
        headers: {
          'X-Api-Key': API_NINJAS_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Exercise API error: ${response.statusText}`);
    }
    const exercises = await response.json();
    const formattedExercises = exercises.map((ex, index) => ({
      id: `api-${index}`,
      name: ex.name,
      description: ex.instructions || '',
      caloriesPerMinute: calculateCaloriesPerMinute(ex),
      source: 'api-ninjas',
      type: ex.type,
      muscle: ex.muscle,
      equipment: ex.equipment,
      difficulty: ex.difficulty
    }));

    // Save the first 5 results to local DB for future use
    if (formattedExercises.length > 0) {
      try {
        const values = formattedExercises
          .slice(0, 5)
          .map(
            (ex) =>
              `('${ex.name.replace(/'/g, "''")}', '${(ex.description || '').replace(/'/g, "''")}', ${ex.caloriesPerMinute || 0})`
          )
          .join(',');

        await query(
          `INSERT INTO exercises (name, description, calories_per_min)
           VALUES ${values}
           ON CONFLICT DO NOTHING`
        );
      } catch (dbError) {
        console.error('Error saving exercises to local DB:', dbError);
      }
    }

    return res.json(formattedExercises);
  } catch (error) {
    console.error('Exercise search error:', error);
    return res.status(500).json({ message: 'Failed to search for exercises' });
  }
});

app.post('/api/members/:id/trainer-feedback', authMiddleware, async (req, res) => {
  const memberId = Number(req.params.id);
  const { message } = req.body || {};

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ message: 'Message is required' });
  }

  const role = req.user?.role;
  const trainerId = Number(req.user?.id);
  if (role !== 'trainer' && role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    if (role === 'trainer') {
      const assigned = await isMemberAssignedToTrainer(trainerId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const result = await query(
      `INSERT INTO trainer_feedback (trainer_id, member_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      [trainerId, memberId, message.trim()]
    );

    return res.status(201).json({ id: result.rows[0]?.id, created_at: result.rows[0]?.created_at });
  } catch (error) {
    console.error('Error creating trainer feedback:', error);
    return res.status(500).json({ message: 'Failed to create trainer feedback' });
  }
});

app.post('/api/members/:id/nutritionist-feedback', authMiddleware, async (req, res) => {
  const memberId = Number(req.params.id);
  const { message } = req.body || {};

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ message: 'Message is required' });
  }

  const role = req.user?.role;
  const nutritionistId = Number(req.user?.id);
  if (role !== 'nutritionist' && role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    if (role === 'nutritionist') {
      const assigned = await isMemberAssignedToNutritionist(nutritionistId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const result = await query(
      `INSERT INTO nutritionist_feedback (nutritionist_id, member_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      [nutritionistId, memberId, message.trim()]
    );

    return res.status(201).json({ id: result.rows[0]?.id, created_at: result.rows[0]?.created_at });
  } catch (error) {
    console.error('Error creating nutritionist feedback:', error);
    return res.status(500).json({ message: 'Failed to create nutritionist feedback' });
  }
});

app.get('/api/trainer/schedule', authMiddleware, async (req, res) => {
  const role = req.user?.role;
  const trainerId = Number(req.user?.id);

  if (!trainerId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (role !== 'trainer' && role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const from = typeof req.query.from === 'string' ? req.query.from : null;
  const to = typeof req.query.to === 'string' ? req.query.to : null;

  try {
    const result = await query(
      `SELECT
         s.id,
         s.member_id,
         u.full_name AS member_name,
         s.session_type,
         s.session_date,
         s.session_time,
         s.status
       FROM schedules s
       JOIN users u ON u.id = s.member_id
       WHERE s.trainer_id = $1
         AND ($2::date IS NULL OR s.session_date >= $2::date)
         AND ($3::date IS NULL OR s.session_date <= $3::date)
       ORDER BY s.session_date ASC, s.session_time ASC, s.id ASC`,
      [trainerId, from, to]
    );

    return res.json({ sessions: result.rows });
  } catch (error) {
    console.error('Error fetching trainer schedule:', error);
    return res.status(500).json({ message: 'Failed to fetch trainer schedule' });
  }
});

app.post('/api/trainer/schedule', authMiddleware, async (req, res) => {
  const role = req.user?.role;
  const trainerId = Number(req.user?.id);

  if (!trainerId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (role !== 'trainer' && role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { member_id, session_type, session_date, session_time } = req.body || {};
  const memberId = Number(member_id);

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member_id is required' });
  }

  if (!session_type || !['personal', 'online', 'group'].includes(session_type)) {
    return res.status(400).json({ message: 'Valid session_type is required' });
  }

  if (!session_date || typeof session_date !== 'string') {
    return res.status(400).json({ message: 'Valid session_date is required' });
  }

  if (!session_time || typeof session_time !== 'string') {
    return res.status(400).json({ message: 'Valid session_time is required' });
  }

  try {
    if (role === 'trainer') {
      const assigned = await isMemberAssignedToTrainer(trainerId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }
    const insert = await query(
      `INSERT INTO schedules (trainer_id, member_id, session_type, session_date, session_time, status)
       VALUES ($1, $2, $3, $4::date, $5::time, 'scheduled')
       RETURNING id`,
      [trainerId, memberId, session_type, session_date, session_time]
    );

    return res.status(201).json({ id: insert.rows[0]?.id });
  } catch (error) {
    console.error('Error creating schedule session:', error);
    return res.status(500).json({ message: 'Failed to create schedule session' });
  }
});

app.get('/api/members/:id/schedule', authMiddleware, async (req, res) => {
  const memberId = Number(req.params.id);
  const role = req.user?.role;
  const userId = Number(req.user?.id);

  if (!memberId) {
    return res.status(400).json({ message: 'Valid member id is required' });
  }

  if (!userId || !role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const from = typeof req.query.from === 'string' ? req.query.from : null;
  const to = typeof req.query.to === 'string' ? req.query.to : null;

  try {
    if (role === 'member') {
      if (userId !== memberId) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (role === 'trainer') {
      const assigned = await isMemberAssignedToTrainer(userId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (role === 'nutritionist') {
      const assigned = await isMemberAssignedToNutritionist(userId, memberId);
      if (!assigned) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const result = await query(
      `SELECT
         s.id,
         s.trainer_id,
         u.full_name AS trainer_name,
         s.session_type,
         s.session_date,
         s.session_time,
         s.status
       FROM schedules s
       JOIN users u ON u.id = s.trainer_id
       WHERE s.member_id = $1
         AND ($2::date IS NULL OR s.session_date >= $2::date)
         AND ($3::date IS NULL OR s.session_date <= $3::date)
       ORDER BY s.session_date ASC, s.session_time ASC, s.id ASC`,
      [memberId, from, to]
    );

    return res.json({ sessions: result.rows });
  } catch (error) {
    console.error('Error fetching member schedule:', error);
    return res.status(500).json({ message: 'Failed to fetch member schedule' });
  }
});

app.get('/api/meals/recent', async (req, res) => {
  const limitParam = req.query.limit;
  let limit = Number(limitParam) || 10;
  if (limit <= 0 || limit > 100) {
    limit = 10;
  }

  try {
    const result = await query(
      `SELECT
         ml.id AS meal_log_id,
         ml.member_id,
         u.full_name,
         ml.meal_type,
         ml.logged_at,
         COALESCE(SUM(mli.calories), 0) AS total_calories
       FROM meal_logs ml
       JOIN users u ON u.id = ml.member_id
       LEFT JOIN meal_log_items mli ON mli.meal_log_id = ml.id
       GROUP BY ml.id, ml.member_id, u.full_name, ml.meal_type, ml.logged_at
       ORDER BY ml.logged_at DESC
       LIMIT $1`,
      [limit]
    );

    return res.json({ meals: result.rows });
  } catch (error) {
    console.error('Error fetching recent meals:', error);
    return res.status(500).json({ message: 'Failed to fetch recent meals' });
  }
});

// Helper: upload a file to pCloud and return its public link
async function uploadToPcloud(filePath, filename) {
  const accessToken = process.env.PCLOUD_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('PCLOUD_ACCESS_TOKEN is not configured on the server.');
  }

  // 1. Get folder ID for the target folder (you can customize this folder path)
  // We'll upload to a folder named 'leqet_backups' (create if missing)
  let folderId = 0; // root
  try {
    const listRes = await axios.get('https://api.pcloud.com/listfolder', {
      params: { access_token: accessToken, folderid: folderId },
    });
    const folder = listRes.data.metadata?.contents?.find(f => f.name === 'leqet_backups' && f.isfolder);
    if (folder) {
      folderId = folder.folderid;
    } else {
      // Create folder
      const createRes = await axios.get('https://api.pcloud.com/createfolderifnotexists', {
        params: { access_token: accessToken, folderid: 0, name: 'leqet_backups' },
      });
      folderId = createRes.data.metadata.folderid;
    }
  } catch (e) {
    console.error('Failed to ensure pCloud folder:', e.response?.data || e.message);
    throw new Error('Failed to prepare pCloud folder.');
  }

  // 2. Upload the file
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), filename);
  form.append('folderid', String(folderId));

  const uploadRes = await axios.post('https://api.pcloud.com/uploadfile', form, {
    params: { access_token: accessToken },
    headers: form.getHeaders(),
  });

  const fileMeta = uploadRes.data.metadata;
  if (!fileMeta || !fileMeta.fileid) {
    console.error('pCloud upload response unexpected:', uploadRes.data);
    throw new Error('pCloud upload did not return a file ID.');
  }

  // 3. Get public link (publish) for the uploaded file
  const linkRes = await axios.get('https://api.pcloud.com/getfilelink', {
    params: {
      access_token: accessToken,
      fileid: fileMeta.fileid,
      // Optional: set expiry or password if desired
    },
  });

  const publicLink = linkRes.data?.hosts?.[0] + linkRes.data.path;
  if (!publicLink) {
    console.error('Failed to retrieve public link from pCloud:', linkRes.data);
    throw new Error('Failed to retrieve public link from pCloud.');
  }

  return publicLink;
}

// Admin maintenance endpoints
app.post('/api/admin/maintenance/backup', async (_req, res) => {
  try {
    const backupsDir = path.join(__dirname, 'backups');
    await fs.promises.mkdir(backupsDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dbName = process.env.DB_NAME || process.env.PGDATABASE || 'leqet_fit_coacha';
    const filename = `${dbName}_${ts}.sql`;
    const filePath = path.join(backupsDir, filename);

    const pgDumpCmd = process.env.PG_DUMP_PATH || 'pg_dump';
    const host = process.env.DB_HOST || process.env.PGHOST || 'localhost';
    const port = String(Number(process.env.DB_PORT || process.env.PGPORT) || 5432);
    const user = process.env.DB_USER || process.env.PGUSER;
    const password = process.env.DB_PASSWORD || process.env.PGPASSWORD;

    if (!user) {
      return res.status(500).json({
        success: false,
        message: 'Database user is not configured. Set DB_USER or PGUSER on the server.',
      });
    }

    await new Promise((resolve, reject) => {
      const args = [
        '-h',
        host,
        '-p',
        port,
        '-U',
        user,
        '-d',
        dbName,
        '--no-owner',
        '--no-privileges',
        '-f',
        filePath,
      ];

      const child = spawn(pgDumpCmd, args, {
        env: {
          ...process.env,
          PGPASSWORD: password || '',
        },
        stdio: 'ignore',
      });

      child.on('error', (err) => reject(err));
      child.on('exit', (code) => {
        if (code === 0) return resolve();
        return reject(new Error(`pg_dump exited with code ${code}`));
      });
    });

    await query(
      `INSERT INTO system_logs (log_type, message)
       VALUES ('backup', $1)`,
      [`Database backup created: ${filename}`]
    );

    // Upload to pCloud and get public link
    let publicLink = null;
    try {
      publicLink = await uploadToPcloud(filePath, filename);
    } catch (uploadErr) {
      console.error('pCloud upload failed, but local backup succeeded:', uploadErr);
      // Continue without pCloud link; do not fail the whole operation
    }

    const responsePayload = {
      success: true,
      message: publicLink ? 'Backup created and uploaded to pCloud' : 'Backup created locally',
      timestamp: new Date().toISOString(),
      filename,
      publicLink,
    };

    return res.json(responsePayload);
  } catch (error) {
    console.error('Error triggering backup:', error);

    let message =
      'Failed to create backup. Ensure PostgreSQL tools are installed (pg_dump) and DB credentials are correct.';

    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      message =
        'Failed to create backup: pg_dump command not found. Install PostgreSQL client tools and/or set PG_DUMP_PATH to the full path of the pg_dump executable.';
    }

    return res.status(500).json({
      success: false,
      message,
    });
  }
});

app.post('/api/admin/maintenance/health-check', async (_req, res) => {
  try {
    await query('SELECT 1;');
    const usersResult = await query('SELECT COUNT(*)::int AS count FROM users');
    const users = usersResult.rows[0]?.count ?? 0;

    return res.json({ success: true, dbOk: true, users, message: 'Health check OK' });
  } catch (error) {
    console.error('Health check failed:', error);
    return res.status(500).json({ success: false, dbOk: false, message: 'Health check failed' });
  }
});

app.post('/api/admin/maintenance/clear-cache', async (_req, res) => {
  try {
    const result = await query(
      `DELETE FROM system_logs
       WHERE created_at < NOW() - INTERVAL '30 days'
       RETURNING id`
    );
    return res.json({ success: true, cleared: result.rowCount });
  } catch (error) {
    console.error('Error clearing cache/logs:', error);
    return res.status(500).json({ success: false, message: 'Failed to clear cache/logs' });
  }
});

// Admin system stats
app.get('/api/admin/system/stats', async (_req, res) => {
  try {
    const sizeResult = await query('SELECT pg_database_size(current_database()) AS size');
    const dbSizeBytes = Number(sizeResult.rows[0]?.size) || 0;

    const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);

    const lastBackupResult = await query(
      `SELECT created_at FROM system_logs
       WHERE log_type = 'backup'
       ORDER BY created_at DESC
       LIMIT 1`
    );
    const lastBackup = lastBackupResult.rowCount ? lastBackupResult.rows[0].created_at : null;

    return res.json({ dbSizeBytes, uptimeSeconds, lastBackup });
  } catch (error) {
    console.error('Error fetching system stats:', error);
    return res.status(500).json({ message: 'Failed to fetch system stats' });
  }
});

// Admin system monitor
app.get('/api/admin/system/monitor', async (_req, res) => {
  try {
    const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryPercent = totalMem
      ? Math.round(((totalMem - freeMem) / totalMem) * 100)
      : 0;

    const cpuPercent = await getCpuUsagePercent();

    const errorsWarningsResult = await query(
      `SELECT
         SUM(CASE WHEN log_type = 'error' THEN 1 ELSE 0 END) AS errors,
         SUM(CASE WHEN log_type = 'warning' THEN 1 ELSE 0 END) AS warnings
       FROM system_logs
       WHERE created_at >= NOW() - INTERVAL '24 hours'`
    );

    const errorsLast24h = Number(errorsWarningsResult.rows[0]?.errors) || 0;
    const warningsLast24h = Number(errorsWarningsResult.rows[0]?.warnings) || 0;

    const recentLogsResult = await query(
      `SELECT id, log_type, message, created_at
       FROM system_logs
       ORDER BY created_at DESC
       LIMIT 20`
    );

    const nowMs = Date.now();
    prunePerfBuckets(nowMs);

    const hourBuckets = new Map();
    for (const [minuteStart, bucket] of perfBucketsByMinute.entries()) {
      if (nowMs - minuteStart > PERF_WINDOW_MS) continue;
      const hourStart = Math.floor(minuteStart / (60 * 60 * 1000)) * (60 * 60 * 1000);
      const existing = hourBuckets.get(hourStart) || {
        requests: 0,
        totalDurationMs: 0,
        bytesIn: 0,
        bytesOut: 0,
      };
      existing.requests += bucket.requests;
      existing.totalDurationMs += bucket.totalDurationMs;
      existing.bytesIn += bucket.bytesIn;
      existing.bytesOut += bucket.bytesOut;
      hourBuckets.set(hourStart, existing);
    }

    const performance = [];
    const startHour = Math.floor((nowMs - PERF_WINDOW_MS) / (60 * 60 * 1000)) * (60 * 60 * 1000);
    for (let hourStart = startHour; hourStart <= nowMs; hourStart += 60 * 60 * 1000) {
      const bucket = hourBuckets.get(hourStart) || {
        requests: 0,
        totalDurationMs: 0,
        bytesIn: 0,
        bytesOut: 0,
      };
      const avgMs = bucket.requests ? bucket.totalDurationMs / bucket.requests : 0;
      performance.push({
        time: new Date(hourStart).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        requests: bucket.requests,
        responseTime: Math.round(avgMs),
      });
    }

    const dbSizeResult = await query('SELECT pg_database_size(current_database()) AS size');
    const storageUsedBytes = Number(dbSizeResult.rows[0]?.size) || 0;
    const storageLimitBytes = Number(process.env.DB_STORAGE_LIMIT_BYTES) || 100 * 1024 * 1024 * 1024;
    const storagePercent = storageLimitBytes
      ? Math.max(0, Math.min(100, Math.round((storageUsedBytes / storageLimitBytes) * 100)))
      : 0;

    let bandwidthUsedBytes24h = 0;
    for (const bucket of hourBuckets.values()) {
      bandwidthUsedBytes24h += (Number(bucket.bytesIn) || 0) + (Number(bucket.bytesOut) || 0);
    }
    const bandwidthLimitBytes24h =
      Number(process.env.BANDWIDTH_LIMIT_BYTES_24H) || 200 * 1024 * 1024 * 1024;
    const bandwidthPercent = bandwidthLimitBytes24h
      ? Math.max(0, Math.min(100, Math.round((bandwidthUsedBytes24h / bandwidthLimitBytes24h) * 100)))
      : 0;

    return res.json({
      status: 'healthy',
      uptimeSeconds,
      errorsLast24h,
      warningsLast24h,
      cpuPercent,
      memoryPercent,
      memoryTotalBytes: totalMem,
      memoryFreeBytes: freeMem,
      memoryUsedBytes: usedMem,
      storageUsedBytes,
      storageLimitBytes,
      storagePercent,
      bandwidthUsedBytes24h,
      bandwidthLimitBytes24h,
      bandwidthPercent,
      recentLogs: recentLogsResult.rows,
      performance,
    });
  } catch (error) {
    console.error('Error fetching system monitor data:', error);
    return res.status(500).json({ message: 'Failed to fetch system monitor data' });
  }
});

async function start() {
  try {
    await initDb();
    app.listen(port, () => {
      console.log(`API server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
