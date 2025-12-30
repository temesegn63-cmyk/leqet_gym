-- ================================
--  MEMBER PLAN MESSAGES (COACH–MEMBER CONVERSATIONS)
-- ================================

CREATE TABLE IF NOT EXISTS member_plan_messages (
  id SERIAL PRIMARY KEY,
  member_id INT REFERENCES users(id) ON DELETE CASCADE,
  coach_id INT REFERENCES users(id) ON DELETE SET NULL,
  sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('member', 'trainer', 'nutritionist', 'admin')),
  plan_type VARCHAR(20) NOT NULL CHECK (plan_type IN ('workout', 'diet')),
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_member_plan_messages_member_plan'
  ) THEN
    CREATE INDEX idx_member_plan_messages_member_plan
      ON member_plan_messages(member_id, plan_type, created_at DESC);
  END IF;
END $$;
