-- ===================================
--  MEMBER INTAKE (TRAINER + NUTRITION)
-- ===================================

ALTER TABLE member_profiles
  ADD COLUMN IF NOT EXISTS trainer_intake JSONB,
  ADD COLUMN IF NOT EXISTS nutrition_intake JSONB;
