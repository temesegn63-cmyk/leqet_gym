-- Base schema for Leqet Fit Coach

-- ============================
--         COMPLETE SCHEMA
-- ============================

-- ============================
--         USERS & ROLES
-- ============================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin','trainer','nutritionist','member')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================
--       MEMBER PROFILES
-- ============================

CREATE TABLE IF NOT EXISTS member_profiles (
    user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    age INT,
    gender VARCHAR(10),
    weight_kg NUMERIC,
    height_cm NUMERIC,
    goal VARCHAR(50),
    activity_level VARCHAR(30),
    is_private BOOLEAN DEFAULT FALSE
);

-- ============================
--    TRAINER / NUTRITIONIST ASSIGNMENTS
-- ============================

CREATE TABLE IF NOT EXISTS trainer_assignments (
    member_id INT REFERENCES users(id) ON DELETE CASCADE,
    trainer_id INT REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY(member_id)
);

CREATE TABLE IF NOT EXISTS nutritionist_assignments (
    member_id INT REFERENCES users(id) ON DELETE CASCADE,
    nutritionist_id INT REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY(member_id)
);

-- ============================
--          FOOD ITEMS
--   (Local + External API)
-- ============================

CREATE TABLE IF NOT EXISTS food_items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    serving_size TEXT,
    serving_method TEXT,
    calories NUMERIC,
    protein NUMERIC,
    fat NUMERIC,
    carbs NUMERIC,
    category TEXT,
    is_local BOOLEAN DEFAULT TRUE,
    source_api TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Optional: trigram index if pg_trgm is enabled
DO $$
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes WHERE indexname = 'food_items_name_idx'
        ) THEN
            CREATE INDEX food_items_name_idx ON food_items USING GIN (name gin_trgm_ops);
        END IF;
    END IF;
END $$;

-- ============================
--        MEAL LOGGING
-- ============================

CREATE TABLE IF NOT EXISTS meal_logs (
    id SERIAL PRIMARY KEY,
    member_id INT REFERENCES users(id) ON DELETE CASCADE,
    meal_type VARCHAR(20) NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
    logged_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meal_log_items (
    id SERIAL PRIMARY KEY,
    meal_log_id INT REFERENCES meal_logs(id) ON DELETE CASCADE,
    food_item_id INT REFERENCES food_items(id) ON DELETE CASCADE,
    quantity NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    calories NUMERIC NOT NULL,
    protein NUMERIC NOT NULL,
    fat NUMERIC NOT NULL,
    carbs NUMERIC NOT NULL
);

-- ============================
--        WORKOUT SYSTEM
-- ============================

CREATE TABLE IF NOT EXISTS exercises (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    calories_per_min NUMERIC
);

CREATE TABLE IF NOT EXISTS workout_logs (
    id SERIAL PRIMARY KEY,
    member_id INT REFERENCES users(id) ON DELETE CASCADE,
    logged_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workout_log_items (
    id SERIAL PRIMARY KEY,
    workout_log_id INT REFERENCES workout_logs(id) ON DELETE CASCADE,
    exercise_id INT REFERENCES exercises(id),
    duration_minutes NUMERIC,
    calories_burned NUMERIC
);

-- ============================
--     MEAL + WORKOUT PLANS
-- ============================

CREATE TABLE IF NOT EXISTS diet_plans (
    id SERIAL PRIMARY KEY,
    member_id INT REFERENCES users(id) ON DELETE CASCADE,
    nutritionist_id INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS workout_plans (
    id SERIAL PRIMARY KEY,
    member_id INT REFERENCES users(id) ON DELETE CASCADE,
    trainer_id INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    notes TEXT
);

-- ============================
--          FEEDBACK
-- ============================

CREATE TABLE IF NOT EXISTS trainer_feedback (
    id SERIAL PRIMARY KEY,
    trainer_id INT REFERENCES users(id),
    member_id INT REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nutritionist_feedback (
    id SERIAL PRIMARY KEY,
    nutritionist_id INT REFERENCES users(id),
    member_id INT REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================
--         SCHEDULES
-- ============================

CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    trainer_id INT REFERENCES users(id),
    member_id INT REFERENCES users(id),
    session_type VARCHAR(20) CHECK (session_type IN ('personal','online','group')),
    session_date DATE,
    session_time TIME,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================
--      NOTIFICATIONS
-- ============================

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    is_read BOOLEAN DEFAULT FALSE
);

-- ============================
--        SYSTEM LOGS
-- ============================

CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    log_type VARCHAR(20),
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================
--    INSERT ALL FOOD ITEMS
-- ============================

INSERT INTO food_items 
(name, serving_size, serving_method, calories, protein, fat, carbs, category, is_local) VALUES
('Injera (teff)', '100g', 'Torn from shared round', 157, 3.4, 0.6, 34.6, 'bread', TRUE),
('Doro Wat (chicken stew)', '150g', 'Ladled center', 250, 20, 15, 15, 'stew', TRUE),
('Misir Wat (red lentil)', '150g', 'Spooned communal', 197, 7, 9, 24, 'stew', TRUE),
('Shiro Wat (chickpea stew)', '200g', 'Thick pour over injera', 300, 12, 10, 35, 'stew', TRUE),
('Kitfo (minced raw beef)', '100g', 'Scooped rolls', 350, 20, 28, 0, 'meat dish', TRUE),
('Tibs (sautéed beef)', '150g', 'Sizzling edge', 400, 25, 30, 5, 'meat dish', TRUE),
('Awaze Tibs (spicy beef)', '150g', 'Berbere-sauced pinched', 380, 24, 28, 6, 'meat dish', TRUE),
('Ful Medames (fava stew)', '200g', 'Mashed scoop', 250, 15, 8, 30, 'stew', TRUE),
('Genfo (barley porridge)', '150g', 'Butter well spooned', 200, 5, 5, 35, 'porridge', TRUE),
('Chechebsa (shredded injera)', '150g', 'Fried hand-eaten', 300, 6, 12, 40, 'breakfast', TRUE),
('Gored Gored (raw beef cubes)', '100g', 'Injera pinch', 320, 22, 25, 2, 'meat dish', TRUE),
('Kik Alicha (yellow pea stew)', '150g', 'Mild ladle', 180, 10, 6, 22, 'stew', TRUE),
('Tikil Gomen (cabbage stew)', '120g', 'Soft chunks', 79, 2, 4, 10, 'vegetable', TRUE),
('Enkulal Firfir (egg injera mix)', '150g', 'Scrambled scoop', 250, 12, 18, 12, 'breakfast', TRUE),
('Ga''at (sorghum porridge)', '200g', 'Hand-broken ball', 220, 4, 6, 38, 'porridge', TRUE),
('Himbasha (spiced bread)', '100g', 'Sliced wheel', 280, 6, 8, 45, 'bread', TRUE),
('Dabo Kolo (fried barley snack)', '50g', 'Handful crunchy', 200, 5, 10, 25, 'snack', TRUE),
('Tihlo (barley balls in stew)', '150g', 'Stew-dunked prongs', 250, 7, 5, 45, 'stew', TRUE),
('Key Sir (beet potato stew)', '150g', 'Kid scoop', 180, 4, 6, 28, 'vegetable', TRUE),
('Dinich Salata (potato salad)', '150g', 'Dressed scoop', 160, 3, 7, 22, 'salad', TRUE),
('Timatim Fitfit (tomato injera)', '150g', 'Soaked mix', 140, 3, 5, 20, 'salad', TRUE),
('Suf Fitfit (sunflower injera)', '150g', 'Shredded soak', 220, 5, 10, 30, 'dish', TRUE),
('Telba Fitfit (flax injera)', '150g', 'Mixed soak', 230, 6, 12, 28, 'dish', TRUE),
('Qollo (roasted barley snack)', '50g', 'Handful roasted', 180, 4, 2, 35, 'snack', TRUE),
('Kocho (enset flatbread)', '200g', 'Steamed scoop', 120, 2, 1, 25, 'bread', TRUE),
('Bula (enset porridge)', '150g', 'Thin ladle', 100, 1.5, 0.5, 22, 'porridge', TRUE),
('Defo Dabo (thick wheat bread)', '100g', 'Chunk torn', 260, 7, 5, 48, 'bread', TRUE),
('Dubba (gourd veg stew)', '150g', 'Veggie ladle', 90, 3, 2, 18, 'vegetable', TRUE),
('Asa Tibs (fish sauté)', '150g', 'Edge sizzle', 280, 22, 20, 4, 'fish dish', TRUE),
('Ayib (fresh cottage cheese)', '100g', 'Scooped soft', 120, 8, 9, 3, 'dairy', TRUE),
('Atkilt Wot (mixed veg stew)', '150g', 'Colorful ladle', 110, 4, 5, 15, 'vegetable', TRUE),
('Shiro Fitfit (chickpea injera)', '150g', 'Wet shredded', 260, 11, 9, 32, 'dish', TRUE),
('Kinche (cracked wheat porridge)', '150g', 'Buttered spoon', 190, 4, 3, 38, 'porridge', TRUE),
('Fufu (enset dough mash)', '200g', 'Ball scoop', 130, 2, 1, 28, 'porridge', TRUE),
('Ambasha (sesame festive bread)', '100g', 'Sliced rings', 290, 7, 9, 46, 'bread', TRUE),
('Mula (penny bread pockets)', '80g', 'Pocket tear', 240, 5, 6, 42, 'bread', TRUE),
('Kategna (crispy buttered injera)', '100g', 'Crackle bite', 220, 4, 10, 28, 'bread', TRUE),
('Quanta Firfir (jerky injera mix)', '150g', 'Dried shred soak', 210, 18, 8, 15, 'dish', TRUE),
('Beguni (eggplant fritter)', '100g', 'Fried bite', 180, 3, 12, 16, 'vegetable', TRUE),
('Fasolia (green bean stew)', '150g', 'Stew ladle', 95, 4, 4, 13, 'vegetable', TRUE),
('Gomen (collard greens stew)', '150g', 'Chopped green', 85, 3, 3, 12, 'vegetable', TRUE),
('Shiguro (spinach stew)', '150g', 'Leafy scoop', 90, 3, 4, 11, 'vegetable', TRUE),
('Dinich Wot (potato stew)', '150g', 'Chunky mild', 140, 3, 5, 22, 'stew', TRUE),
('Selatta (beet salad)', '150g', 'Vinegar dressed', 120, 2, 4, 20, 'salad', TRUE),
('Timatim Salata (tomato salad)', '150g', 'Fresh chopped', 100, 2, 3, 18, 'salad', TRUE),
('Azifa (lentil salad)', '150g', 'Mashed cold', 160, 9, 4, 22, 'salad', TRUE),
('Hula-wat (lentil veg stew)', '150g', 'Layered ladle', 170, 8, 5, 25, 'stew', TRUE),
('Mereqe (okra stew)', '120g', 'Slimy scoop', 70, 2, 2, 12, 'stew', TRUE),
('Kosta (pasta tomato stew)', '150g', 'Tomatoey mix', 200, 6, 7, 30, 'pasta', TRUE),
('Betecha (spicy green pea stew)', '150g', 'Split green', 190, 11, 6, 24, 'stew', TRUE),
('Yetakuria Fitfit (veggie injera)', '150g', 'Mixed soak', 150, 4, 5, 22, 'dish', TRUE),
('Dabo (wheat loaf bread)', '100g', 'Loaf slice', 270, 8, 4, 52, 'bread', TRUE),
('Suf (sunflower seed porridge)', '150g', 'Seedy sludge', 210, 5, 9, 28, 'porridge', TRUE),
('Telba (flax seed porridge)', '150g', 'Nutty thick', 240, 7, 14, 25, 'porridge', TRUE),
('Ersho (fermented injera starter)', '100g', 'Bubbly base', 110, 2, 0.5, 24, 'ingredient', TRUE),
('Tella (barley home beer)', '330ml', 'Poured communal', 150, 1, 0, 12, 'drink', TRUE),
('Tej (honey mead wine)', '200ml', 'Sipped side', 180, 0, 0, 40, 'drink', TRUE),
('Kita (barley flatbread)', '100g', 'Rolled thin', 250, 6, 2, 50, 'bread', TRUE),
('Poridge (teff thin porridge)', '150g', 'Breakfast ladle', 130, 3, 1, 28, 'porridge', TRUE),
('Alicha Wot (mild stew)', '150g', 'Gentle pour', 140, 5, 6, 20, 'stew', TRUE),
('Siga Tibs (beef liver sauté)', '100g', 'Organ sizzle', 300, 23, 22, 3, 'meat dish', TRUE),
('Dulet (tripe liver spicy mix)', '100g', 'Raw-spicy', 280, 19, 21, 4, 'meat dish', TRUE),
('Habesha Kitfo (spiced raw mince)', '100g', 'Mince scoop', 340, 19, 27, 1, 'meat dish', TRUE),
('Lema (teff pocket bread)', '100g', 'Pocket tear', 240, 5, 1, 50, 'bread', TRUE),
('Teff Porridge (creamy)', '150g', 'Spoon smooth', 140, 4, 1, 29, 'porridge', TRUE),
('Sorghum Injera (white variant)', '100g', 'Torn light', 150, 3, 0.5, 33, 'bread', TRUE),
('Maize Injera (corn hybrid)', '100g', 'Tear chewy', 165, 3.2, 0.8, 35, 'bread', TRUE),
('Wheat Injera (hybrid flat)', '100g', 'Torn soft', 170, 4, 1, 36, 'bread', TRUE),
('Siga Wot (beef stew)', '150g', 'Rich ladle', 320, 22, 25, 10, 'stew', TRUE),
('Anebabero (layered injera butter)', '150g', 'Soaked rich', 280, 5, 12, 38, 'dish', TRUE),
('Firfir (shredded injera stew)', '150g', 'Breakfast mix', 220, 6, 8, 30, 'breakfast', TRUE),
('Asa Goulash (fish stew)', '150g', 'Onion tomato ladle', 260, 20, 18, 8, 'fish dish', TRUE),
('Tere Siga (raw beef cubes)', '100g', 'Mitmita dip', 310, 21, 24, 1, 'meat dish', TRUE),
('Shekla Tibs (sizzling clay pot beef)', '150g', 'Hot coals edge', 410, 26, 32, 4, 'meat dish', TRUE),
('Enkulal Tibs (egg omelet sauté)', '150g', 'Pepper scramble', 240, 13, 17, 10, 'breakfast', TRUE),
('Dabb Firfir (bread injera butter)', '150g', 'Yogurt spoon', 230, 7, 9, 32, 'dish', TRUE),
('Ti''hilo (Tigray barley dip balls)', '150g', 'Prong sauce dunk', 240, 8, 6, 42, 'dish', TRUE),
('Gonfo (thick grain porridge)', '150g', 'Ball broken', 210, 6, 4, 36, 'porridge', TRUE),
('Beg Wat (sheep curry stew)', '150g', 'Berbere heavy', 290, 21, 20, 12, 'stew', TRUE),
('Bere Wat (beef curry stew)', '150g', 'Spicy simmer', 310, 23, 22, 14, 'stew', TRUE),
('Kai Wat (extra spicy meat stew)', '150g', 'Overload berbere', 330, 22, 24, 13, 'stew', TRUE),
('Ukkaamssa (ground beef stew)', '150g', 'Chili onion mix', 270, 20, 19, 8, 'stew', TRUE),
('Qoocco (Oromia enset variant)', '200g', 'Scoop fermented', 110, 2, 1, 23, 'porridge', TRUE),
('Qince (shredded grain porridge)', '150g', 'Flour-free thick', 160, 4, 3, 32, 'porridge', TRUE);
