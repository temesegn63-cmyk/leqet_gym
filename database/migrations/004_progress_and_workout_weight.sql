-- ===================================
--  PROGRESS TRACKING + WORKOUT WEIGHT
-- ===================================

-- 1) Store optional weight used per workout log item
ALTER TABLE workout_log_items
  ADD COLUMN IF NOT EXISTS weight_used NUMERIC,
  ADD COLUMN IF NOT EXISTS weight_unit TEXT;

-- 2) Store body weight history for progress charts
CREATE TABLE IF NOT EXISTS weight_logs (
  id SERIAL PRIMARY KEY,
  member_id INT REFERENCES users(id) ON DELETE CASCADE,
  weight_kg NUMERIC NOT NULL,
  logged_at TIMESTAMP DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_weight_logs_member_date'
  ) THEN
    CREATE INDEX idx_weight_logs_member_date ON weight_logs(member_id, logged_at);
  END IF;
END $$;
