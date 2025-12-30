  
--        SCHEMA ENHANCEMENTS
  

-- 1. Add security fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reset_token TEXT,
ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;

-- 2. Add created_by and updated_at to food_items
ALTER TABLE food_items
ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id);

-- 3. Add audit columns to key tables
DO $$
BEGIN
    -- Add to food_items if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'food_items' AND column_name = 'updated_at') THEN
        ALTER TABLE food_items ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
    END IF;
    
    -- Add to member_profiles
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'member_profiles' AND column_name = 'updated_at') THEN
        ALTER TABLE member_profiles ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
        ALTER TABLE member_profiles ADD COLUMN created_by INT REFERENCES users(id);
    END IF;
    
    -- Add to exercises
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'exercises' AND column_name = 'created_at') THEN
        ALTER TABLE exercises 
        ADD COLUMN created_at TIMESTAMP DEFAULT NOW(),
        ADD COLUMN updated_at TIMESTAMP DEFAULT NOW(),
        ADD COLUMN created_by INT REFERENCES users(id);
    END IF;
END $$;

-- 4. Add data validation constraints
DO $$
BEGIN
    -- Member profile constraints
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'valid_gender' AND table_name = 'member_profiles'
    ) THEN
        ALTER TABLE member_profiles 
        ADD CONSTRAINT valid_gender 
        CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say'));
    END IF;
    
    -- Nutrition constraints
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'positive_nutrition' AND table_name = 'food_items'
    ) THEN
        ALTER TABLE food_items
        ADD CONSTRAINT positive_nutrition 
        CHECK (calories >= 0 AND protein >= 0 AND fat >= 0 AND carbs >= 0);
    END IF;
    
    -- Meal log item constraints
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'positive_quantity' AND table_name = 'meal_log_items'
    ) THEN
        ALTER TABLE meal_log_items
        ADD CONSTRAINT positive_quantity CHECK (quantity > 0);
    END IF;
END $$;

-- 5. Add missing relationships
DO $$
BEGIN
    -- Add diet_plan_id to meal_logs if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'meal_logs' AND column_name = 'diet_plan_id'
    ) THEN
        ALTER TABLE meal_logs 
        ADD COLUMN diet_plan_id INT REFERENCES diet_plans(id);
    END IF;
    
    -- Add workout_plan_id to workout_logs if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'workout_logs' AND column_name = 'workout_plan_id'
    ) THEN
        ALTER TABLE workout_logs 
        ADD COLUMN workout_plan_id INT REFERENCES workout_plans(id);
    END IF;
END $$;

-- 6. Create update trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW; 
END;
$$ language 'plpgsql';

-- 7. Apply triggers to tables with updated_at
DO $$
BEGIN
    -- Food items trigger
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_food_items_updated_at'
    ) THEN
        CREATE TRIGGER update_food_items_updated_at
        BEFORE UPDATE ON food_items
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- Member profiles trigger
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_member_profiles_updated_at'
    ) THEN
        CREATE TRIGGER update_member_profiles_updated_at
        BEFORE UPDATE ON member_profiles
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- Exercises trigger
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_exercises_updated_at'
    ) THEN
        CREATE TRIGGER update_exercises_updated_at
        BEFORE UPDATE ON exercises
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- 8. Create indexes for performance
DO $$
BEGIN
    -- Index for meal logs by member and date
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_meal_logs_member_date'
    ) THEN
        CREATE INDEX idx_meal_logs_member_date 
        ON meal_logs(member_id, DATE(logged_at));
    END IF;
    
    -- Index for workout logs by member and date
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_workout_logs_member_date'
    ) THEN
        CREATE INDEX idx_workout_logs_member_date 
        ON workout_logs(member_id, DATE(logged_at));
    END IF;
    
    -- Index for notifications
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_notifications_user_read'

-- 9. Enable full-text search on food_items
-- Add search_vector column (safe to use IF NOT EXISTS since this migration runs once per DB)
ALTER TABLE food_items 
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

-- Create the index for search_vector
CREATE INDEX IF NOT EXISTS food_items_search_idx 
  ON food_items USING GIN(search_vector);

-- Create or replace the function that maintains search_vector
CREATE OR REPLACE FUNCTION food_items_search_update() 
RETURNS TRIGGER AS $food_items_search$
BEGIN
    NEW.search_vector = 
        setweight(to_tsvector('english', COALESCE(NEW.name,'')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.category,'')), 'B');
    RETURN NEW;
END
$food_items_search$ LANGUAGE plpgsql;

-- Create the trigger to update search_vector
CREATE TRIGGER tsvectorupdate 
BEFORE INSERT OR UPDATE ON food_items 
FOR EACH ROW EXECUTE FUNCTION food_items_search_update();

-- Backfill existing rows
UPDATE food_items SET search_vector = 
    setweight(to_tsvector('english', COALESCE(name,'')), 'A') ||
    setweight(to_tsvector('english', COALESCE(category,'')), 'B');

-- 10. Create a view for weekly nutrition summary
CREATE OR REPLACE VIEW weekly_nutrition_summary AS
SELECT 
    ml.member_id,
    u.full_name,
    DATE_TRUNC('week', ml.logged_at) AS week_start,
    COUNT(DISTINCT ml.id) AS meal_count,
    SUM(mli.calories) AS total_calories,
    SUM(mli.protein) AS total_protein,
    SUM(mli.fat) AS total_fat,
    SUM(mli.carbs) AS total_carbs
FROM 
    meal_logs ml
JOIN 
    meal_log_items mli ON ml.id = mli.meal_log_id
JOIN
    users u ON ml.member_id = u.id
GROUP BY 
    ml.member_id, u.full_name, DATE_TRUNC('week', ml.logged_at);

-- 11. Create a view for weekly workout summary
CREATE OR REPLACE VIEW weekly_workout_summary AS
SELECT 
    wl.member_id,
    u.full_name,
    DATE_TRUNC('week', wl.logged_at) AS week_start,
    COUNT(DISTINCT wl.id) AS workout_count,
    SUM(wli.duration_minutes) AS total_minutes,
    SUM(wli.calories_burned) AS total_calories_burned
FROM 
    workout_logs wl
JOIN 
    workout_log_items wli ON wl.id = wli.workout_log_id
JOIN
    users u ON wl.member_id = u.id
GROUP BY 
    wl.member_id, u.full_name, DATE_TRUNC('week', wl.logged_at);

-- 12. Create a function to get user's current plan status
CREATE OR REPLACE FUNCTION get_user_plan_status(user_id INT)
RETURNS TABLE(
    has_diet_plan BOOLEAN,
    has_workout_plan BOOLEAN,
    last_meal_log_date TIMESTAMP,
    last_workout_date TIMESTAMP,
    weekly_calorie_goal NUMERIC,
    weekly_workout_goal_minutes NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        EXISTS(SELECT 1 FROM diet_plans WHERE member_id = user_id AND created_at > NOW() - INTERVAL '30 days') AS has_diet_plan,
        EXISTS(SELECT 1 FROM workout_plans WHERE member_id = user_id AND created_at > NOW() - INTERVAL '30 days') AS has_workout_plan,
        (SELECT MAX(logged_at) FROM meal_logs WHERE member_id = user_id) AS last_meal_log_date,
        (SELECT MAX(logged_at) FROM workout_logs WHERE member_id = user_id) AS last_workout_date,
        (SELECT weekly_calorie_goal FROM member_goals WHERE member_id = user_id LIMIT 1) AS weekly_calorie_goal,
        (SELECT weekly_workout_minutes FROM member_goals WHERE member_id = user_id LIMIT 1) AS weekly_workout_goal_minutes;
END;
$$ LANGUAGE plpgsql;
