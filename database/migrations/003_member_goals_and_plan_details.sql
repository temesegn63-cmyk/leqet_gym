-- ===================================
--  MEMBER GOALS AND PLAN DETAILS
-- ===================================

-- 1. Extend member_profiles with calculated metrics
ALTER TABLE member_profiles
  ADD COLUMN IF NOT EXISTS bmr NUMERIC,
  ADD COLUMN IF NOT EXISTS tdee NUMERIC,
  ADD COLUMN IF NOT EXISTS target_calories NUMERIC;

-- 2. Member goals table (per-member targets)
CREATE TABLE IF NOT EXISTS member_goals (
    member_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    weekly_calorie_goal NUMERIC,
    weekly_workout_minutes NUMERIC,
    daily_steps_goal INT,
    daily_water_liters NUMERIC,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Extend diet_plans with summary fields and metadata
ALTER TABLE diet_plans
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS goal TEXT,
  ADD COLUMN IF NOT EXISTS daily_calories NUMERIC,
  ADD COLUMN IF NOT EXISTS daily_protein NUMERIC,
  ADD COLUMN IF NOT EXISTS daily_carbs NUMERIC,
  ADD COLUMN IF NOT EXISTS daily_fat NUMERIC,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 4. Diet plan meals and items
CREATE TABLE IF NOT EXISTS diet_plan_meals (
    id SERIAL PRIMARY KEY,
    diet_plan_id INT REFERENCES diet_plans(id) ON DELETE CASCADE,
    meal_type VARCHAR(20) NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
    name TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS diet_plan_meal_items (
    id SERIAL PRIMARY KEY,
    diet_plan_meal_id INT REFERENCES diet_plan_meals(id) ON DELETE CASCADE,
    food_item_id INT REFERENCES food_items(id),
    quantity NUMERIC NOT NULL,
    unit TEXT NOT NULL DEFAULT 'g',
    calories NUMERIC NOT NULL,
    protein NUMERIC NOT NULL,
    carbs NUMERIC NOT NULL,
    fat NUMERIC NOT NULL
);

-- 5. Extend workout_plans with summary fields
ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS goal TEXT,
  ADD COLUMN IF NOT EXISTS weekly_days INT,
  ADD COLUMN IF NOT EXISTS estimated_duration NUMERIC,
  ADD COLUMN IF NOT EXISTS difficulty TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 6. Workout plan days and exercises
CREATE TABLE IF NOT EXISTS workout_plan_days (
    id SERIAL PRIMARY KEY,
    workout_plan_id INT REFERENCES workout_plans(id) ON DELETE CASCADE,
    day_of_week VARCHAR(20),
    name TEXT,
    duration_minutes NUMERIC,
    difficulty VARCHAR(20),
    focus TEXT,
    tips TEXT
);

CREATE TABLE IF NOT EXISTS workout_plan_exercises (
    id SERIAL PRIMARY KEY,
    workout_plan_day_id INT REFERENCES workout_plan_days(id) ON DELETE CASCADE,
    exercise_id INT REFERENCES exercises(id),
    name TEXT NOT NULL,
    sets INT,
    reps TEXT,
    rest TEXT,
    duration_minutes NUMERIC,
    instructions TEXT,
    target_muscles TEXT
);

-- 7. Trigger for member_goals updated_at
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_member_goals_updated_at'
    ) THEN
        CREATE TRIGGER update_member_goals_updated_at
        BEFORE UPDATE ON member_goals
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
