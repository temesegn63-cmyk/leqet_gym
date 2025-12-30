-- ================================
--  MEMBER CHECK-INS (SUBJECTIVE PROGRESS)
-- ================================

CREATE TABLE IF NOT EXISTS member_check_ins (
  id SERIAL PRIMARY KEY,
  member_id INT REFERENCES users(id) ON DELETE CASCADE,
  adherence INT,
  fatigue INT,
  pain INT,
  weight_kg NUMERIC,
  notes TEXT,
  logged_at TIMESTAMP DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_member_check_ins_member_date'
  ) THEN
    CREATE INDEX idx_member_check_ins_member_date
      ON member_check_ins(member_id, logged_at DESC);
  END IF;
END $$;
