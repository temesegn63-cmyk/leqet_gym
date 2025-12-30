--
-- PostgreSQL database dump
--

\restrict uVxqazudMXRYsMgh2iWXtA4dLbzP1fXft5aUXcyKK7rSAPVcXcLLx6Yh4BFhyJv

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: food_items_search_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.food_items_search_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.search_vector =
        setweight(to_tsvector('english', COALESCE(NEW.name,'')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.category,'')), 'B');
    RETURN NEW;
END;
$$;


--
-- Name: generate_otp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_otp() RETURNS character
    LANGUAGE plpgsql
    AS $$
DECLARE
    otp CHAR(6);
BEGIN
    -- Generate a 6-digit OTP
    otp := LPAD(FLOOR(random() * 1000000)::TEXT, 6, '0');
    RETURN otp;
END;
$$;


--
-- Name: get_user_plan_status(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_plan_status(user_id integer) RETURNS TABLE(has_diet_plan boolean, has_workout_plan boolean, last_meal_log_date timestamp without time zone, last_workout_date timestamp without time zone, weekly_calorie_goal numeric, weekly_workout_goal_minutes numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        EXISTS (SELECT 1 FROM diet_plans WHERE member_id = user_id AND created_at > NOW() - INTERVAL '30 days'),
        EXISTS (SELECT 1 FROM workout_plans WHERE member_id = user_id AND created_at > NOW() - INTERVAL '30 days'),
        (SELECT MAX(logged_at) FROM meal_logs WHERE member_id = user_id),
        (SELECT MAX(logged_at) FROM workout_logs WHERE member_id = user_id),
        (SELECT weekly_calorie_goal FROM member_goals WHERE member_id = user_id LIMIT 1),
        (SELECT weekly_workout_minutes FROM member_goals WHERE member_id = user_id LIMIT 1);
END;
$$;


--
-- Name: send_activation_otp(integer, character varying, inet, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_activation_otp(p_user_id integer, p_email character varying, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_otp CHAR(6);
    v_expiry TIMESTAMP;
BEGIN
    -- Generate OTP and set expiry (15 minutes from now)
    v_otp := generate_otp();
    v_expiry := NOW() + INTERVAL '15 minutes';
    
    -- Update user with OTP and expiry
    UPDATE users 
    SET activation_otp = v_otp,
        otp_expires_at = v_expiry
    WHERE id = p_user_id;
    
    -- Log the OTP sending
    INSERT INTO user_activation_logs (user_id, action, ip_address, user_agent)
    VALUES (p_user_id, 'otp_sent', p_ip_address, p_user_agent);
    
    -- In a real application, you would send an email here
    -- This is a placeholder for the email sending logic
    RAISE NOTICE 'Sending OTP % to %', v_otp, p_email;
    
    RETURN v_otp;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: verify_activation_otp(integer, character varying, inet, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_activation_otp(p_user_id integer, p_otp character varying, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_user_status VARCHAR(20);
    v_stored_otp VARCHAR(6);
    v_otp_expiry TIMESTAMP;
    v_result BOOLEAN := FALSE;
BEGIN
    -- Get user status and OTP info
    SELECT status, activation_otp, otp_expires_at 
    INTO v_user_status, v_stored_otp, v_otp_expiry
    FROM users 
    WHERE id = p_user_id;
    
    -- Check if user exists
    IF v_user_status IS NULL THEN
        INSERT INTO user_activation_logs (user_id, action, ip_address, user_agent)
        VALUES (p_user_id, 'activation_failed', p_ip_address, p_user_agent);
        RETURN FALSE;
    END IF;
    
    -- Check if already active
    IF v_user_status = 'active' THEN
        INSERT INTO user_activation_logs (user_id, action, ip_address, user_agent)
        VALUES (p_user_id, 'activation_already_active', p_ip_address, p_user_agent);
        RETURN TRUE;
    END IF;
    
    -- Check OTP
    IF v_stored_otp IS NULL OR v_stored_otp != p_otp THEN
        -- Invalid OTP
        INSERT INTO user_activation_logs (user_id, action, ip_address, user_agent)
        VALUES (p_user_id, 'activation_failed_invalid_otp', p_ip_address, p_user_agent);
        RETURN FALSE;
    END IF;
    
    -- Check if OTP is expired
    IF v_otp_expiry < NOW() THEN
        -- OTP expired
        INSERT INTO user_activation_logs (user_id, action, ip_address, user_agent)
        VALUES (p_user_id, 'activation_failed_otp_expired', p_ip_address, p_user_agent);
        
        -- Clear expired OTP
        UPDATE users 
        SET activation_otp = NULL,
            otp_expires_at = NULL
        WHERE id = p_user_id;
            
        RETURN FALSE;
    END IF;
    
    -- Activate user
    UPDATE users 
    SET status = 'active',
        email_verified = TRUE,
        activation_otp = NULL,
        otp_expires_at = NULL,
        activated_at = NOW()
    WHERE id = p_user_id;
    
    -- Log successful activation
    INSERT INTO user_activation_logs (user_id, action, ip_address, user_agent)
    VALUES (p_user_id, 'activation_success', p_ip_address, p_user_agent);
    
    RETURN TRUE;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: diet_plan_meal_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diet_plan_meal_items (
    id integer NOT NULL,
    diet_plan_meal_id integer,
    food_item_id integer,
    quantity numeric NOT NULL,
    unit text DEFAULT 'g'::text NOT NULL,
    calories numeric NOT NULL,
    protein numeric NOT NULL,
    carbs numeric NOT NULL,
    fat numeric NOT NULL
);


--
-- Name: diet_plan_meal_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.diet_plan_meal_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: diet_plan_meal_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.diet_plan_meal_items_id_seq OWNED BY public.diet_plan_meal_items.id;


--
-- Name: diet_plan_meals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diet_plan_meals (
    id integer NOT NULL,
    diet_plan_id integer,
    meal_type character varying(20) NOT NULL,
    name text,
    notes text,
    CONSTRAINT diet_plan_meals_meal_type_check CHECK (((meal_type)::text = ANY ((ARRAY['breakfast'::character varying, 'lunch'::character varying, 'dinner'::character varying, 'snack'::character varying])::text[])))
);


--
-- Name: diet_plan_meals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.diet_plan_meals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: diet_plan_meals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.diet_plan_meals_id_seq OWNED BY public.diet_plan_meals.id;


--
-- Name: diet_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diet_plans (
    id integer NOT NULL,
    member_id integer,
    nutritionist_id integer,
    created_at timestamp without time zone DEFAULT now(),
    notes text,
    name text,
    goal text,
    daily_calories numeric,
    daily_protein numeric,
    daily_carbs numeric,
    daily_fat numeric,
    is_active boolean DEFAULT true
);


--
-- Name: diet_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.diet_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: diet_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.diet_plans_id_seq OWNED BY public.diet_plans.id;


--
-- Name: exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercises (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    calories_per_min numeric,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    created_by integer
);


--
-- Name: exercises_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exercises_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exercises_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exercises_id_seq OWNED BY public.exercises.id;


--
-- Name: food_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.food_items (
    id integer NOT NULL,
    name text NOT NULL,
    serving_size text,
    serving_method text,
    calories numeric,
    protein numeric,
    fat numeric,
    carbs numeric,
    category text,
    is_local boolean DEFAULT true,
    source_api text,
    created_at timestamp without time zone DEFAULT now(),
    created_by integer,
    updated_at timestamp without time zone DEFAULT now(),
    search_vector tsvector,
    CONSTRAINT positive_nutrition CHECK (((calories >= (0)::numeric) AND (protein >= (0)::numeric) AND (fat >= (0)::numeric) AND (carbs >= (0)::numeric)))
);


--
-- Name: food_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.food_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: food_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.food_items_id_seq OWNED BY public.food_items.id;


--
-- Name: meal_log_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meal_log_items (
    id integer NOT NULL,
    meal_log_id integer,
    food_item_id integer,
    quantity numeric NOT NULL,
    unit text NOT NULL,
    calories numeric NOT NULL,
    protein numeric NOT NULL,
    fat numeric NOT NULL,
    carbs numeric NOT NULL,
    CONSTRAINT positive_quantity CHECK ((quantity > (0)::numeric))
);


--
-- Name: meal_log_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.meal_log_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: meal_log_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.meal_log_items_id_seq OWNED BY public.meal_log_items.id;


--
-- Name: meal_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meal_logs (
    id integer NOT NULL,
    member_id integer,
    meal_type character varying(20) NOT NULL,
    logged_at timestamp without time zone DEFAULT now(),
    diet_plan_id integer,
    CONSTRAINT meal_logs_meal_type_check CHECK (((meal_type)::text = ANY ((ARRAY['breakfast'::character varying, 'lunch'::character varying, 'dinner'::character varying, 'snack'::character varying])::text[])))
);


--
-- Name: meal_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.meal_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: meal_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.meal_logs_id_seq OWNED BY public.meal_logs.id;


--
-- Name: member_check_ins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_check_ins (
    id integer NOT NULL,
    member_id integer,
    adherence integer,
    fatigue integer,
    pain integer,
    weight_kg numeric,
    notes text,
    logged_at timestamp without time zone DEFAULT now()
);


--
-- Name: member_check_ins_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.member_check_ins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: member_check_ins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.member_check_ins_id_seq OWNED BY public.member_check_ins.id;


--
-- Name: member_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_goals (
    member_id integer NOT NULL,
    weekly_calorie_goal numeric,
    weekly_workout_minutes numeric,
    daily_steps_goal integer,
    daily_water_liters numeric,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: member_plan_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_plan_messages (
    id integer NOT NULL,
    member_id integer,
    coach_id integer,
    sender_role character varying(20) NOT NULL,
    plan_type character varying(20) NOT NULL,
    message text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT member_plan_messages_plan_type_check CHECK (((plan_type)::text = ANY ((ARRAY['workout'::character varying, 'diet'::character varying])::text[]))),
    CONSTRAINT member_plan_messages_sender_role_check CHECK (((sender_role)::text = ANY ((ARRAY['member'::character varying, 'trainer'::character varying, 'nutritionist'::character varying, 'admin'::character varying])::text[])))
);


--
-- Name: member_plan_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.member_plan_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: member_plan_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.member_plan_messages_id_seq OWNED BY public.member_plan_messages.id;


--
-- Name: member_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_profiles (
    user_id integer NOT NULL,
    age integer,
    gender character varying(10),
    weight_kg numeric,
    height_cm numeric,
    goal character varying(50),
    activity_level character varying(30),
    is_private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now(),
    created_by integer,
    bmr numeric,
    tdee numeric,
    target_calories numeric,
    trainer_intake jsonb,
    nutrition_intake jsonb,
    CONSTRAINT valid_gender CHECK (((gender)::text = ANY ((ARRAY['male'::character varying, 'female'::character varying, 'other'::character varying, 'prefer_not_to_say'::character varying])::text[])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer,
    message text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    is_read boolean DEFAULT false
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: nutritionist_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nutritionist_assignments (
    member_id integer NOT NULL,
    nutritionist_id integer,
    assigned_at timestamp without time zone DEFAULT now()
);


--
-- Name: nutritionist_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nutritionist_feedback (
    id integer NOT NULL,
    nutritionist_id integer,
    member_id integer,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: nutritionist_feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nutritionist_feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nutritionist_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nutritionist_feedback_id_seq OWNED BY public.nutritionist_feedback.id;


--
-- Name: schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedules (
    id integer NOT NULL,
    trainer_id integer,
    member_id integer,
    session_type character varying(20),
    session_date date,
    session_time time without time zone,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT schedules_session_type_check CHECK (((session_type)::text = ANY ((ARRAY['personal'::character varying, 'online'::character varying, 'group'::character varying])::text[])))
);


--
-- Name: schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schedules_id_seq OWNED BY public.schedules.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    id integer NOT NULL,
    filename text NOT NULL,
    applied_at timestamp without time zone DEFAULT now()
);


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schema_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schema_migrations_id_seq OWNED BY public.schema_migrations.id;


--
-- Name: system_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_logs (
    id integer NOT NULL,
    log_type character varying(20),
    message text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: system_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_logs_id_seq OWNED BY public.system_logs.id;


--
-- Name: trainer_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainer_assignments (
    member_id integer NOT NULL,
    trainer_id integer,
    assigned_at timestamp without time zone DEFAULT now()
);


--
-- Name: trainer_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainer_feedback (
    id integer NOT NULL,
    trainer_id integer,
    member_id integer,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: trainer_feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trainer_feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trainer_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trainer_feedback_id_seq OWNED BY public.trainer_feedback.id;


--
-- Name: user_activation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activation_logs (
    id integer NOT NULL,
    user_id integer NOT NULL,
    action character varying(50) NOT NULL,
    ip_address inet,
    user_agent text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_activation_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_activation_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_activation_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_activation_logs_id_seq OWNED BY public.user_activation_logs.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    password_hash text,
    role character varying(20) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    email_verified boolean DEFAULT false,
    reset_token text,
    reset_token_expires timestamp without time zone,
    status character varying(20) DEFAULT 'pending'::character varying,
    activation_otp character varying(6),
    otp_expires_at timestamp without time zone,
    activated_at timestamp without time zone,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'trainer'::character varying, 'nutritionist'::character varying, 'member'::character varying])::text[]))),
    CONSTRAINT users_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'suspended'::character varying])::text[])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: weekly_nutrition_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.weekly_nutrition_summary AS
 SELECT ml.member_id,
    u.full_name,
    date_trunc('week'::text, ml.logged_at) AS week_start,
    count(DISTINCT ml.id) AS meal_count,
    sum(mli.calories) AS total_calories,
    sum(mli.protein) AS total_protein,
    sum(mli.fat) AS total_fat,
    sum(mli.carbs) AS total_carbs
   FROM ((public.meal_logs ml
     JOIN public.meal_log_items mli ON ((ml.id = mli.meal_log_id)))
     JOIN public.users u ON ((ml.member_id = u.id)))
  GROUP BY ml.member_id, u.full_name, (date_trunc('week'::text, ml.logged_at));


--
-- Name: workout_log_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_log_items (
    id integer NOT NULL,
    workout_log_id integer,
    exercise_id integer,
    duration_minutes numeric,
    calories_burned numeric,
    weight_used numeric,
    weight_unit text
);


--
-- Name: workout_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_logs (
    id integer NOT NULL,
    member_id integer,
    logged_at timestamp without time zone DEFAULT now(),
    workout_plan_id integer
);


--
-- Name: weekly_workout_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.weekly_workout_summary AS
 SELECT wl.member_id,
    u.full_name,
    date_trunc('week'::text, wl.logged_at) AS week_start,
    count(DISTINCT wl.id) AS workout_count,
    sum(wli.duration_minutes) AS total_minutes,
    sum(wli.calories_burned) AS total_calories_burned
   FROM ((public.workout_logs wl
     JOIN public.workout_log_items wli ON ((wl.id = wli.workout_log_id)))
     JOIN public.users u ON ((wl.member_id = u.id)))
  GROUP BY wl.member_id, u.full_name, (date_trunc('week'::text, wl.logged_at));


--
-- Name: weight_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weight_logs (
    id integer NOT NULL,
    member_id integer,
    weight_kg numeric NOT NULL,
    logged_at timestamp without time zone DEFAULT now()
);


--
-- Name: weight_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.weight_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: weight_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.weight_logs_id_seq OWNED BY public.weight_logs.id;


--
-- Name: workout_log_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workout_log_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workout_log_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workout_log_items_id_seq OWNED BY public.workout_log_items.id;


--
-- Name: workout_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workout_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workout_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workout_logs_id_seq OWNED BY public.workout_logs.id;


--
-- Name: workout_plan_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_plan_days (
    id integer NOT NULL,
    workout_plan_id integer,
    day_of_week character varying(20),
    name text,
    duration_minutes numeric,
    difficulty character varying(20),
    focus text,
    tips text
);


--
-- Name: workout_plan_days_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workout_plan_days_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workout_plan_days_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workout_plan_days_id_seq OWNED BY public.workout_plan_days.id;


--
-- Name: workout_plan_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_plan_exercises (
    id integer NOT NULL,
    workout_plan_day_id integer,
    exercise_id integer,
    name text NOT NULL,
    sets integer,
    reps text,
    rest text,
    duration_minutes numeric,
    instructions text,
    target_muscles text
);


--
-- Name: workout_plan_exercises_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workout_plan_exercises_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workout_plan_exercises_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workout_plan_exercises_id_seq OWNED BY public.workout_plan_exercises.id;


--
-- Name: workout_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_plans (
    id integer NOT NULL,
    member_id integer,
    trainer_id integer,
    created_at timestamp without time zone DEFAULT now(),
    notes text,
    name text,
    goal text,
    weekly_days integer,
    estimated_duration numeric,
    difficulty text,
    is_active boolean DEFAULT true
);


--
-- Name: workout_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workout_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workout_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workout_plans_id_seq OWNED BY public.workout_plans.id;


--
-- Name: diet_plan_meal_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diet_plan_meal_items ALTER COLUMN id SET DEFAULT nextval('public.diet_plan_meal_items_id_seq'::regclass);


--
-- Name: diet_plan_meals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diet_plan_meals ALTER COLUMN id SET DEFAULT nextval('public.diet_plan_meals_id_seq'::regclass);


--
-- Name: diet_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diet_plans ALTER COLUMN id SET DEFAULT nextval('public.diet_plans_id_seq'::regclass);


--
-- Name: exercises id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises ALTER COLUMN id SET DEFAULT nextval('public.exercises_id_seq'::regclass);


--
-- Name: food_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_items ALTER COLUMN id SET DEFAULT nextval('public.food_items_id_seq'::regclass);


--
-- Name: meal_log_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_log_items ALTER COLUMN id SET DEFAULT nextval('public.meal_log_items_id_seq'::regclass);


--
-- Name: meal_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_logs ALTER COLUMN id SET DEFAULT nextval('public.meal_logs_id_seq'::regclass);


--
-- Name: member_check_ins id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_check_ins ALTER COLUMN id SET DEFAULT nextval('public.member_check_ins_id_seq'::regclass);


--
-- Name: member_plan_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_plan_messages ALTER COLUMN id SET DEFAULT nextval('public.member_plan_messages_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: nutritionist_feedback id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutritionist_feedback ALTER COLUMN id SET DEFAULT nextval('public.nutritionist_feedback_id_seq'::regclass);


--
-- Name: schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules ALTER COLUMN id SET DEFAULT nextval('public.schedules_id_seq'::regclass);


--
-- Name: schema_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations ALTER COLUMN id SET DEFAULT nextval('public.schema_migrations_id_seq'::regclass);


--
-- Name: system_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_logs ALTER COLUMN id SET DEFAULT nextval('public.system_logs_id_seq'::regclass);


--
-- Name: trainer_feedback id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_feedback ALTER COLUMN id SET DEFAULT nextval('public.trainer_feedback_id_seq'::regclass);


--
-- Name: user_activation_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activation_logs ALTER COLUMN id SET DEFAULT nextval('public.user_activation_logs_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: weight_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weight_logs ALTER COLUMN id SET DEFAULT nextval('public.weight_logs_id_seq'::regclass);


--
-- Name: workout_log_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_log_items ALTER COLUMN id SET DEFAULT nextval('public.workout_log_items_id_seq'::regclass);


--
-- Name: workout_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_logs ALTER COLUMN id SET DEFAULT nextval('public.workout_logs_id_seq'::regclass);


--
-- Name: workout_plan_days id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_days ALTER COLUMN id SET DEFAULT nextval('public.workout_plan_days_id_seq'::regclass);


--
-- Name: workout_plan_exercises id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_exercises ALTER COLUMN id SET DEFAULT nextval('public.workout_plan_exercises_id_seq'::regclass);


--
-- Name: workout_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plans ALTER COLUMN id SET DEFAULT nextval('public.workout_plans_id_seq'::regclass);


--
-- Data for Name: diet_plan_meal_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.diet_plan_meal_items (id, diet_plan_meal_id, food_item_id, quantity, unit, calories, protein, carbs, fat) FROM stdin;
\.


--
-- Data for Name: diet_plan_meals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.diet_plan_meals (id, diet_plan_id, meal_type, name, notes) FROM stdin;
\.


--
-- Data for Name: diet_plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.diet_plans (id, member_id, nutritionist_id, created_at, notes, name, goal, daily_calories, daily_protein, daily_carbs, daily_fat, is_active) FROM stdin;
24	16	\N	2025-12-29 12:29:06.316819	\N	General Fitness Diet Plan	general fitness	2871	97	441	80	t
\.


--
-- Data for Name: exercises; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exercises (id, name, description, calories_per_min, created_at, updated_at, created_by) FROM stdin;
1	Treadmill Running	Cardio running on treadmill	12	2025-12-20 02:39:09.638339	2025-12-20 02:39:09.638339	\N
2	Bench Press	Chest strength training	6	2025-12-20 02:39:09.638339	2025-12-20 02:39:09.638339	\N
3	Squats	Lower body strength training	8	2025-12-20 02:39:09.638339	2025-12-20 02:39:09.638339	\N
4	Yoga	Flexibility and balance	4	2025-12-20 02:39:09.638339	2025-12-20 02:39:09.638339	\N
5	Cycling	Stationary bike cardio	10	2025-12-20 02:39:09.638339	2025-12-20 02:39:09.638339	\N
6	Chest dip	For this exercise you will need access to parallel bars. To get yourself into the starting position, hold your body at arms length (arms locked) above the bars. While breathing in, lower yourself slowly with your torso leaning forward around 30 degrees or so and your elbows flared out slightly until you feel a slight stretch in the chest. Once you feel the stretch, use your chest to bring your body back to the starting position as you breathe out. Tip: Remember to squeeze the chest at the top of the movement for a second. Repeat the movement for the prescribed amount of repetitions.  Variations: If you are new at this exercise and do not have the strength to perform it, use a dip assist machine if available. These machines use weight to help you push your bodyweight. Otherwise, a spotter holding your legs can help. More advanced lifters can add weight to the exercise by using a weight belt that allows the addition of weighted plates.	6	2025-12-25 14:54:55.256906	2025-12-25 14:54:55.256906	\N
7	Incline cable chest fly	To get yourself into the starting position, set the pulleys at the floor level (lowest level possible on the machine that is below your torso). Place an incline bench (set at 45 degrees) in between the pulleys, select a weight on each one and grab a pulley on each hand. With a handle on each hand, lie on the incline bench and bring your hands together at arms length in front of your face. This will be your starting position. With a slight bend of your elbows (in order to prevent stress at the biceps tendon), lower your arms out at both sides in a wide arc until you feel a stretch on your chest. Breathe in as you perform this portion of the movement. Tip: Keep in mind that throughout the movement, the arms should remain stationary. The movement should only occur at the shoulder joint. Return your arms back to the starting position as you squeeze your chest muscles and exhale. Hold the contracted position for a second. Tip: Make sure to use the same arc of motion used to lower the weights. Repeat the movement for the prescribed amount of repetitions.  Variation: You can vary the angle of the bench in order to target the upper chest at slightly different angles.	6	2025-12-25 14:54:55.256906	2025-12-25 14:54:55.256906	\N
8	Suspended Chest Fly	Adjust the straps to an appropriate height. The lower the position the more difficult the movement will be. Lean into the handles with your arms out in front of you, bracing your feet against a stable object if necessary. Your body should be straight, spine neutral, and your arms extended and palms facing each other. This will be your starting position. Perform the exercise by allowing your arms to move laterally, away from the midline of the body, lowering your torso between the handles. The elbows may bend slightly during the movement. Pause when the upper arm is perpendicular to the torso, and then return to the starting position.	6	2025-12-25 14:54:55.256906	2025-12-25 14:54:55.256906	\N
9	Chest Push (single response)	Begin in a kneeling position holding the medicine ball with both hands tightly into the chest. Execute the pass by exploding forward and outward with the hips while pushing the ball as far as possible. Follow through by falling forward, catching yourself with your hands.	5	2025-12-25 14:54:55.256906	2025-12-25 14:54:55.256906	\N
10	Chest Push with Run Release	Begin in an athletic stance with the knees bent, hips back, and back flat. Hold the medicine ball near your legs. This will be your starting position. While taking your first step draw the medicine ball into your chest. As you take the second step, explosively push the ball forward, immediately sprinting for 10 yards after the release. If you are really fast, you can catch your own pass!	5	2025-12-25 14:54:55.256906	2025-12-25 14:54:55.256906	\N
11	Straight-bar wrist roll-up	Hold a barbell with both hands and your palms facing down; hands spaced about shoulder width. This will be your starting position. Alternating between each of your hands, perform the movement by extending the wrist as though you were rolling up a newspaper. Continue alternating back and forth until failure. Reverse the motion by flexing the wrist, rolling the opposite direction. Continue the alternating motion until failure.	6	2025-12-26 11:18:12.535706	2025-12-26 11:18:12.535706	\N
12	T-Bar Row with Handle	Position a bar into a landmine or in a corner to keep it from moving. Load an appropriate weight onto your end. Stand over the bar, and position a Double D row handle around the bar next to the collar. Using your hips and legs, rise to a standing position. Assume a wide stance with your hips back and your chest up. Your arms should be extended. This will be your starting position. Pull the weight to your upper abdomen by retracting the shoulder blades and flexing the elbows. Do not jerk the weight or cheat during the movement. After a brief pause, return to the starting position.	6	2025-12-26 11:18:12.535706	2025-12-26 11:18:12.535706	\N
13	Barbell Deadlift	Approach the bar so that it is centered over your feet. Your feet should be about hip-width apart. Bend at the hip to grip the bar at shoulder-width allowing your shoulder blades to protract. Typically, you would use an alternating grip. With your feet and your grip set, take a big breath and then lower your hips and flex the knees until your shins contact the bar. Look forward with your head. Keep your chest up and your back arched, and begin driving through the heels to move the weight upward. After the bar passes the knees aggressively pull the bar back, pulling your shoulder blades together as you drive your hips forward into the bar. Lower the bar by bending at the hips and guiding it to the floor.	6	2025-12-26 11:18:12.535706	2025-12-26 11:18:12.535706	\N
14	Barbell back squat to box	The box squat allows you to squat to desired depth and develop explosive strength in the squat movement. Begin in a power rack with a box at the appropriate height behind you. Typically, you would aim for a box height that brings you to a parallel squat, but you can train higher or lower if desired. Begin by stepping under the bar and placing it across the back of the shoulders. Squeeze your shoulder blades together and rotate your elbows forward, attempting to bend the bar across your shoulders. Remove the bar from the rack, creating a tight arch in your lower back, and step back into position. Place your feet wider for more emphasis on the back, glutes, adductors, and hamstrings, or closer together for more quad development. Keep your head facing forward. With your back, shoulders, and core tight, push your knees and butt out and you begin your descent. Sit back with your hips until you are seated on the box. Ideally, your shins should be perpendicular to the ground. Pause when you reach the box, and relax the hip flexors. Never bounce off of a box. Keeping the weight on your heels and pushing your feet and knees out, drive upward off of the box as you lead the movement with your head. Continue upward, maintaining tightness head to toe.	5	2025-12-26 11:18:12.535706	2025-12-26 11:18:12.535706	\N
31	Straight-bar wrist roll-up	Hold a barbell with both hands and your palms facing down; hands spaced about shoulder width. This will be your starting position. Alternating between each of your hands, perform the movement by extending the wrist as though you were rolling up a newspaper. Continue alternating back and forth until failure. Reverse the motion by flexing the wrist, rolling the opposite direction. Continue the alternating motion until failure.	6	2025-12-26 11:18:13.132293	2025-12-26 11:18:13.132293	\N
15	Reverse Band Box Squat	Begin in a power rack with a box at the appropriate height behind you. Set up the bands either on band pegs or attached to the top of the rack, ensuring they will be directly above the bar during the squat. Attach the other end to the bar. Begin by stepping under the bar and placing it across the back of the shoulders. Squeeze your shoulder blades together and rotate your elbows forward, attempting to bend the bar across your shoulders. Remove the bar from the rack, creating a tight arch in your lower back, and step back into position. Place your feet wider for more emphasis on the back, glutes, adductors, and hamstrings, or closer together for more quad development. Keep your head facing forward. With your back, shoulders, and core tight, push your knees and butt out and you begin your descent. Sit back with your hips until you are seated on the box. Ideally, your shins should be perpendicular to the ground. Pause when you reach the box, and relax the hip flexors. Never bounce off of a box. Keeping the weight on your heels and pushing your feet and knees out, drive upward off of the box as you lead the movement with your head. Continue upward, maintaining tightness head to toe. Use care to return the barbell to the rack.	5	2025-12-26 11:18:12.535706	2025-12-26 11:18:12.535706	\N
16	Barbell Deadlift	Approach the bar so that it is centered over your feet. Your feet should be about hip-width apart. Bend at the hip to grip the bar at shoulder-width allowing your shoulder blades to protract. Typically, you would use an alternating grip. With your feet and your grip set, take a big breath and then lower your hips and flex the knees until your shins contact the bar. Look forward with your head. Keep your chest up and your back arched, and begin driving through the heels to move the weight upward. After the bar passes the knees aggressively pull the bar back, pulling your shoulder blades together as you drive your hips forward into the bar. Lower the bar by bending at the hips and guiding it to the floor.	6	2025-12-26 11:18:12.792301	2025-12-26 11:18:12.792301	\N
17	Barbell back squat to box	The box squat allows you to squat to desired depth and develop explosive strength in the squat movement. Begin in a power rack with a box at the appropriate height behind you. Typically, you would aim for a box height that brings you to a parallel squat, but you can train higher or lower if desired. Begin by stepping under the bar and placing it across the back of the shoulders. Squeeze your shoulder blades together and rotate your elbows forward, attempting to bend the bar across your shoulders. Remove the bar from the rack, creating a tight arch in your lower back, and step back into position. Place your feet wider for more emphasis on the back, glutes, adductors, and hamstrings, or closer together for more quad development. Keep your head facing forward. With your back, shoulders, and core tight, push your knees and butt out and you begin your descent. Sit back with your hips until you are seated on the box. Ideally, your shins should be perpendicular to the ground. Pause when you reach the box, and relax the hip flexors. Never bounce off of a box. Keeping the weight on your heels and pushing your feet and knees out, drive upward off of the box as you lead the movement with your head. Continue upward, maintaining tightness head to toe.	5	2025-12-26 11:18:12.792301	2025-12-26 11:18:12.792301	\N
18	Wide-grip barbell curl	Stand up with your torso upright while holding a barbell at the wide outer handle. The palm of your hands should be facing forward. The elbows should be close to the torso. This will be your starting position. While holding the upper arms stationary, curl the weights forward while contracting the biceps as you breathe out. Tip: Only the forearms should move. Continue the movement until your biceps are fully contracted and the bar is at shoulder level. Hold the contracted position for a second and squeeze the biceps hard. Slowly begin to bring the bar back to starting position as your breathe in. Repeat for the recommended amount of repetitions.  Variations:  You can also perform this movement using an E-Z bar or E-Z attachment hooked to a low pulley. This variation seems to really provide a good contraction at the top of the movement. You may also use the closer grip for variety purposes.	6	2025-12-26 11:18:12.792301	2025-12-26 11:18:12.792301	\N
19	Seated barbell shoulder press	Sit on a Military Press Bench with a bar behind your head and either have a spotter give you the bar (better on the rotator cuff this way) or pick it up yourself carefully with a pronated grip (palms facing forward). Tip: Your grip should be wider than shoulder width and it should create a 90-degree angle between the forearm and the upper arm as the barbell goes down. Once you pick up the barbell with the correct grip length, lift the bar up over your head by locking your arms. Hold at about shoulder level and slightly in front of your head. This is your starting position. Lower the bar down to the collarbone slowly as you inhale. Lift the bar back up to the starting position as you exhale. Repeat for the recommended amount of repetitions.  Variations:  This exercise can also be performed standing but those with lower back problems are better off performing this seated variety. The behind the neck variation is not recommended for people with shoulder problems as it can be hard on the rotator cuff due to the hyperextension created by bringing the bar behind the neck.	6	2025-12-26 11:18:12.792301	2025-12-26 11:18:12.792301	\N
20	Barbell walking lunge	Begin standing with your feet shoulder width apart and a barbell across your upper back. Step forward with one leg, flexing the knees to drop your hips. Descend until your rear knee nearly touches the ground. Your posture should remain upright, and your front knee should stay above the front foot. Drive through the heel of your lead foot and extend both knees to raise yourself back up. Step forward with your rear foot, repeating the lunge on the opposite leg.	6	2025-12-26 11:18:12.792301	2025-12-26 11:18:12.792301	\N
21	Barbell Deadlift	Approach the bar so that it is centered over your feet. Your feet should be about hip-width apart. Bend at the hip to grip the bar at shoulder-width allowing your shoulder blades to protract. Typically, you would use an alternating grip. With your feet and your grip set, take a big breath and then lower your hips and flex the knees until your shins contact the bar. Look forward with your head. Keep your chest up and your back arched, and begin driving through the heels to move the weight upward. After the bar passes the knees aggressively pull the bar back, pulling your shoulder blades together as you drive your hips forward into the bar. Lower the bar by bending at the hips and guiding it to the floor.	6	2025-12-26 11:18:12.969114	2025-12-26 11:18:12.969114	\N
29	Seated barbell shoulder press	Sit on a Military Press Bench with a bar behind your head and either have a spotter give you the bar (better on the rotator cuff this way) or pick it up yourself carefully with a pronated grip (palms facing forward). Tip: Your grip should be wider than shoulder width and it should create a 90-degree angle between the forearm and the upper arm as the barbell goes down. Once you pick up the barbell with the correct grip length, lift the bar up over your head by locking your arms. Hold at about shoulder level and slightly in front of your head. This is your starting position. Lower the bar down to the collarbone slowly as you inhale. Lift the bar back up to the starting position as you exhale. Repeat for the recommended amount of repetitions.  Variations:  This exercise can also be performed standing but those with lower back problems are better off performing this seated variety. The behind the neck variation is not recommended for people with shoulder problems as it can be hard on the rotator cuff due to the hyperextension created by bringing the bar behind the neck.	6	2025-12-26 11:18:13.049306	2025-12-26 11:18:13.049306	\N
22	Barbell back squat to box	The box squat allows you to squat to desired depth and develop explosive strength in the squat movement. Begin in a power rack with a box at the appropriate height behind you. Typically, you would aim for a box height that brings you to a parallel squat, but you can train higher or lower if desired. Begin by stepping under the bar and placing it across the back of the shoulders. Squeeze your shoulder blades together and rotate your elbows forward, attempting to bend the bar across your shoulders. Remove the bar from the rack, creating a tight arch in your lower back, and step back into position. Place your feet wider for more emphasis on the back, glutes, adductors, and hamstrings, or closer together for more quad development. Keep your head facing forward. With your back, shoulders, and core tight, push your knees and butt out and you begin your descent. Sit back with your hips until you are seated on the box. Ideally, your shins should be perpendicular to the ground. Pause when you reach the box, and relax the hip flexors. Never bounce off of a box. Keeping the weight on your heels and pushing your feet and knees out, drive upward off of the box as you lead the movement with your head. Continue upward, maintaining tightness head to toe.	5	2025-12-26 11:18:12.969114	2025-12-26 11:18:12.969114	\N
23	Wide-grip barbell curl	Stand up with your torso upright while holding a barbell at the wide outer handle. The palm of your hands should be facing forward. The elbows should be close to the torso. This will be your starting position. While holding the upper arms stationary, curl the weights forward while contracting the biceps as you breathe out. Tip: Only the forearms should move. Continue the movement until your biceps are fully contracted and the bar is at shoulder level. Hold the contracted position for a second and squeeze the biceps hard. Slowly begin to bring the bar back to starting position as your breathe in. Repeat for the recommended amount of repetitions.  Variations:  You can also perform this movement using an E-Z bar or E-Z attachment hooked to a low pulley. This variation seems to really provide a good contraction at the top of the movement. You may also use the closer grip for variety purposes.	6	2025-12-26 11:18:12.969114	2025-12-26 11:18:12.969114	\N
24	Seated barbell shoulder press	Sit on a Military Press Bench with a bar behind your head and either have a spotter give you the bar (better on the rotator cuff this way) or pick it up yourself carefully with a pronated grip (palms facing forward). Tip: Your grip should be wider than shoulder width and it should create a 90-degree angle between the forearm and the upper arm as the barbell goes down. Once you pick up the barbell with the correct grip length, lift the bar up over your head by locking your arms. Hold at about shoulder level and slightly in front of your head. This is your starting position. Lower the bar down to the collarbone slowly as you inhale. Lift the bar back up to the starting position as you exhale. Repeat for the recommended amount of repetitions.  Variations:  This exercise can also be performed standing but those with lower back problems are better off performing this seated variety. The behind the neck variation is not recommended for people with shoulder problems as it can be hard on the rotator cuff due to the hyperextension created by bringing the bar behind the neck.	6	2025-12-26 11:18:12.969114	2025-12-26 11:18:12.969114	\N
25	Barbell walking lunge	Begin standing with your feet shoulder width apart and a barbell across your upper back. Step forward with one leg, flexing the knees to drop your hips. Descend until your rear knee nearly touches the ground. Your posture should remain upright, and your front knee should stay above the front foot. Drive through the heel of your lead foot and extend both knees to raise yourself back up. Step forward with your rear foot, repeating the lunge on the opposite leg.	6	2025-12-26 11:18:12.969114	2025-12-26 11:18:12.969114	\N
26	Barbell Deadlift	Approach the bar so that it is centered over your feet. Your feet should be about hip-width apart. Bend at the hip to grip the bar at shoulder-width allowing your shoulder blades to protract. Typically, you would use an alternating grip. With your feet and your grip set, take a big breath and then lower your hips and flex the knees until your shins contact the bar. Look forward with your head. Keep your chest up and your back arched, and begin driving through the heels to move the weight upward. After the bar passes the knees aggressively pull the bar back, pulling your shoulder blades together as you drive your hips forward into the bar. Lower the bar by bending at the hips and guiding it to the floor.	6	2025-12-26 11:18:13.049306	2025-12-26 11:18:13.049306	\N
27	Barbell back squat to box	The box squat allows you to squat to desired depth and develop explosive strength in the squat movement. Begin in a power rack with a box at the appropriate height behind you. Typically, you would aim for a box height that brings you to a parallel squat, but you can train higher or lower if desired. Begin by stepping under the bar and placing it across the back of the shoulders. Squeeze your shoulder blades together and rotate your elbows forward, attempting to bend the bar across your shoulders. Remove the bar from the rack, creating a tight arch in your lower back, and step back into position. Place your feet wider for more emphasis on the back, glutes, adductors, and hamstrings, or closer together for more quad development. Keep your head facing forward. With your back, shoulders, and core tight, push your knees and butt out and you begin your descent. Sit back with your hips until you are seated on the box. Ideally, your shins should be perpendicular to the ground. Pause when you reach the box, and relax the hip flexors. Never bounce off of a box. Keeping the weight on your heels and pushing your feet and knees out, drive upward off of the box as you lead the movement with your head. Continue upward, maintaining tightness head to toe.	5	2025-12-26 11:18:13.049306	2025-12-26 11:18:13.049306	\N
28	Wide-grip barbell curl	Stand up with your torso upright while holding a barbell at the wide outer handle. The palm of your hands should be facing forward. The elbows should be close to the torso. This will be your starting position. While holding the upper arms stationary, curl the weights forward while contracting the biceps as you breathe out. Tip: Only the forearms should move. Continue the movement until your biceps are fully contracted and the bar is at shoulder level. Hold the contracted position for a second and squeeze the biceps hard. Slowly begin to bring the bar back to starting position as your breathe in. Repeat for the recommended amount of repetitions.  Variations:  You can also perform this movement using an E-Z bar or E-Z attachment hooked to a low pulley. This variation seems to really provide a good contraction at the top of the movement. You may also use the closer grip for variety purposes.	6	2025-12-26 11:18:13.049306	2025-12-26 11:18:13.049306	\N
30	Barbell walking lunge	Begin standing with your feet shoulder width apart and a barbell across your upper back. Step forward with one leg, flexing the knees to drop your hips. Descend until your rear knee nearly touches the ground. Your posture should remain upright, and your front knee should stay above the front foot. Drive through the heel of your lead foot and extend both knees to raise yourself back up. Step forward with your rear foot, repeating the lunge on the opposite leg.	6	2025-12-26 11:18:13.049306	2025-12-26 11:18:13.049306	\N
32	T-Bar Row with Handle	Position a bar into a landmine or in a corner to keep it from moving. Load an appropriate weight onto your end. Stand over the bar, and position a Double D row handle around the bar next to the collar. Using your hips and legs, rise to a standing position. Assume a wide stance with your hips back and your chest up. Your arms should be extended. This will be your starting position. Pull the weight to your upper abdomen by retracting the shoulder blades and flexing the elbows. Do not jerk the weight or cheat during the movement. After a brief pause, return to the starting position.	6	2025-12-26 11:18:13.132293	2025-12-26 11:18:13.132293	\N
33	Barbell Deadlift	Approach the bar so that it is centered over your feet. Your feet should be about hip-width apart. Bend at the hip to grip the bar at shoulder-width allowing your shoulder blades to protract. Typically, you would use an alternating grip. With your feet and your grip set, take a big breath and then lower your hips and flex the knees until your shins contact the bar. Look forward with your head. Keep your chest up and your back arched, and begin driving through the heels to move the weight upward. After the bar passes the knees aggressively pull the bar back, pulling your shoulder blades together as you drive your hips forward into the bar. Lower the bar by bending at the hips and guiding it to the floor.	6	2025-12-26 11:18:13.132293	2025-12-26 11:18:13.132293	\N
34	Barbell back squat to box	The box squat allows you to squat to desired depth and develop explosive strength in the squat movement. Begin in a power rack with a box at the appropriate height behind you. Typically, you would aim for a box height that brings you to a parallel squat, but you can train higher or lower if desired. Begin by stepping under the bar and placing it across the back of the shoulders. Squeeze your shoulder blades together and rotate your elbows forward, attempting to bend the bar across your shoulders. Remove the bar from the rack, creating a tight arch in your lower back, and step back into position. Place your feet wider for more emphasis on the back, glutes, adductors, and hamstrings, or closer together for more quad development. Keep your head facing forward. With your back, shoulders, and core tight, push your knees and butt out and you begin your descent. Sit back with your hips until you are seated on the box. Ideally, your shins should be perpendicular to the ground. Pause when you reach the box, and relax the hip flexors. Never bounce off of a box. Keeping the weight on your heels and pushing your feet and knees out, drive upward off of the box as you lead the movement with your head. Continue upward, maintaining tightness head to toe.	5	2025-12-26 11:18:13.132293	2025-12-26 11:18:13.132293	\N
35	Wide-grip barbell curl	Stand up with your torso upright while holding a barbell at the wide outer handle. The palm of your hands should be facing forward. The elbows should be close to the torso. This will be your starting position. While holding the upper arms stationary, curl the weights forward while contracting the biceps as you breathe out. Tip: Only the forearms should move. Continue the movement until your biceps are fully contracted and the bar is at shoulder level. Hold the contracted position for a second and squeeze the biceps hard. Slowly begin to bring the bar back to starting position as your breathe in. Repeat for the recommended amount of repetitions.  Variations:  You can also perform this movement using an E-Z bar or E-Z attachment hooked to a low pulley. This variation seems to really provide a good contraction at the top of the movement. You may also use the closer grip for variety purposes.	6	2025-12-26 11:18:13.132293	2025-12-26 11:18:13.132293	\N
\.


--
-- Data for Name: food_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.food_items (id, name, serving_size, serving_method, calories, protein, fat, carbs, category, is_local, source_api, created_at, created_by, updated_at, search_vector) FROM stdin;
85	bere wot	\N	\N	302	22.5	21.3	13	custom	t	\N	2025-12-28 05:44:26.3111	\N	2025-12-28 05:44:26.3111	'bere':1A 'custom':3B 'wot':2A
1	Injera (teff)	100g	Torn from shared round	157	3.4	0.6	34.6	bread	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'bread':3B 'injera':1A 'teff':2A
2	Doro Wat (chicken stew)	150g	Ladled center	250	20	15	15	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'chicken':3A 'doro':1A 'stew':4A,5B 'wat':2A
3	Misir Wat (red lentil)	150g	Spooned communal	197	7	9	24	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'lentil':4A 'misir':1A 'red':3A 'stew':5B 'wat':2A
4	Shiro Wat (chickpea stew)	200g	Thick pour over injera	300	12	10	35	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'chickpea':3A 'shiro':1A 'stew':4A,5B 'wat':2A
5	Kitfo (minced raw beef)	100g	Scooped rolls	350	20	28	0	meat dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'beef':4A 'dish':6B 'kitfo':1A 'meat':5B 'minc':2A 'raw':3A
6	Tibs (sautéed beef)	150g	Sizzling edge	400	25	30	5	meat dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'beef':3A 'dish':5B 'meat':4B 'sauté':2A 'tib':1A
7	Awaze Tibs (spicy beef)	150g	Berbere-sauced pinched	380	24	28	6	meat dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'awaz':1A 'beef':4A 'dish':6B 'meat':5B 'spici':3A 'tib':2A
8	Ful Medames (fava stew)	200g	Mashed scoop	250	15	8	30	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'fava':3A 'ful':1A 'medam':2A 'stew':4A,5B
9	Genfo (barley porridge)	150g	Butter well spooned	200	5	5	35	porridge	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'barley':2A 'genfo':1A 'porridg':3A,4B
10	Chechebsa (shredded injera)	150g	Fried hand-eaten	300	6	12	40	breakfast	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'breakfast':4B 'chechebsa':1A 'injera':3A 'shred':2A
11	Gored Gored (raw beef cubes)	100g	Injera pinch	320	22	25	2	meat dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'beef':4A 'cube':5A 'dish':7B 'gore':1A,2A 'meat':6B 'raw':3A
12	Kik Alicha (yellow pea stew)	150g	Mild ladle	180	10	6	22	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'alicha':2A 'kik':1A 'pea':4A 'stew':5A,6B 'yellow':3A
13	Tikil Gomen (cabbage stew)	120g	Soft chunks	79	2	4	10	vegetable	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'cabbag':3A 'gomen':2A 'stew':4A 'tikil':1A 'veget':5B
14	Enkulal Firfir (egg injera mix)	150g	Scrambled scoop	250	12	18	12	breakfast	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'breakfast':6B 'egg':3A 'enkul':1A 'firfir':2A 'injera':4A 'mix':5A
15	Ga'at (sorghum porridge)	200g	Hand-broken ball	220	4	6	38	porridge	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'ga':1A 'porridg':4A,5B 'sorghum':3A
16	Himbasha (spiced bread)	100g	Sliced wheel	280	6	8	45	bread	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'bread':3A,4B 'himbasha':1A 'spice':2A
17	Dabo Kolo (fried barley snack)	50g	Handful crunchy	200	5	10	25	snack	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'barley':4A 'dabo':1A 'fri':3A 'kolo':2A 'snack':5A,6B
18	Tihlo (barley balls in stew)	150g	Stew-dunked prongs	250	7	5	45	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'ball':3A 'barley':2A 'stew':5A,6B 'tihlo':1A
19	Key Sir (beet potato stew)	150g	Kid scoop	180	4	6	28	vegetable	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'beet':3A 'key':1A 'potato':4A 'sir':2A 'stew':5A 'veget':6B
20	Dinich Salata (potato salad)	150g	Dressed scoop	160	3	7	22	salad	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'dinich':1A 'potato':3A 'salad':4A,5B 'salata':2A
21	Timatim Fitfit (tomato injera)	150g	Soaked mix	140	3	5	20	salad	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'fitfit':2A 'injera':4A 'salad':5B 'timatim':1A 'tomato':3A
22	Suf Fitfit (sunflower injera)	150g	Shredded soak	220	5	10	30	dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'dish':5B 'fitfit':2A 'injera':4A 'suf':1A 'sunflow':3A
23	Telba Fitfit (flax injera)	150g	Mixed soak	230	6	12	28	dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'dish':5B 'fitfit':2A 'flax':3A 'injera':4A 'telba':1A
24	Qollo (roasted barley snack)	50g	Handful roasted	180	4	2	35	snack	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'barley':3A 'qollo':1A 'roast':2A 'snack':4A,5B
25	Kocho (enset flatbread)	200g	Steamed scoop	120	2	1	25	bread	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'bread':4B 'enset':2A 'flatbread':3A 'kocho':1A
26	Bula (enset porridge)	150g	Thin ladle	100	1.5	0.5	22	porridge	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'bula':1A 'enset':2A 'porridg':3A,4B
27	Defo Dabo (thick wheat bread)	100g	Chunk torn	260	7	5	48	bread	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'bread':5A,6B 'dabo':2A 'defo':1A 'thick':3A 'wheat':4A
69	Siga Wot (beef stew)	150g	Rich ladle	320	22	25	10	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'beef':3A 'siga':1A 'stew':4A,5B 'wot':2A
28	Dubba (gourd veg stew)	150g	Veggie ladle	90	3	2	18	vegetable	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'dubba':1A 'gourd':2A 'stew':4A 'veg':3A 'veget':5B
29	Asa Tibs (fish sauté)	150g	Edge sizzle	280	22	20	4	fish dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'asa':1A 'dish':6B 'fish':3A,5B 'sauté':4A 'tib':2A
30	Ayib (fresh cottage cheese)	100g	Scooped soft	120	8	9	3	dairy	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'ayib':1A 'chees':4A 'cottag':3A 'dairi':5B 'fresh':2A
31	Atkilt Wot (mixed veg stew)	150g	Colorful ladle	110	4	5	15	vegetable	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'atkilt':1A 'mix':3A 'stew':5A 'veg':4A 'veget':6B 'wot':2A
32	Shiro Fitfit (chickpea injera)	150g	Wet shredded	260	11	9	32	dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'chickpea':3A 'dish':5B 'fitfit':2A 'injera':4A 'shiro':1A
33	Kinche (cracked wheat porridge)	150g	Buttered spoon	190	4	3	38	porridge	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'crack':2A 'kinch':1A 'porridg':4A,5B 'wheat':3A
34	Fufu (enset dough mash)	200g	Ball scoop	130	2	1	28	porridge	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'dough':3A 'enset':2A 'fufu':1A 'mash':4A 'porridg':5B
35	Ambasha (sesame festive bread)	100g	Sliced rings	290	7	9	46	bread	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'ambasha':1A 'bread':4A,5B 'festiv':3A 'sesam':2A
36	Mula (penny bread pockets)	80g	Pocket tear	240	5	6	42	bread	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'bread':3A,5B 'mula':1A 'penni':2A 'pocket':4A
37	Kategna (crispy buttered injera)	100g	Crackle bite	220	4	10	28	bread	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'bread':5B 'butter':3A 'crispi':2A 'injera':4A 'kategna':1A
38	Quanta Firfir (jerky injera mix)	150g	Dried shred soak	210	18	8	15	dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'dish':6B 'firfir':2A 'injera':4A 'jerki':3A 'mix':5A 'quanta':1A
39	Beguni (eggplant fritter)	100g	Fried bite	180	3	12	16	vegetable	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'beguni':1A 'eggplant':2A 'fritter':3A 'veget':4B
40	Fasolia (green bean stew)	150g	Stew ladle	95	4	4	13	vegetable	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'bean':3A 'fasolia':1A 'green':2A 'stew':4A 'veget':5B
41	Gomen (collard greens stew)	150g	Chopped green	85	3	3	12	vegetable	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'collard':2A 'gomen':1A 'green':3A 'stew':4A 'veget':5B
42	Shiguro (spinach stew)	150g	Leafy scoop	90	3	4	11	vegetable	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'shiguro':1A 'spinach':2A 'stew':3A 'veget':4B
43	Dinich Wot (potato stew)	150g	Chunky mild	140	3	5	22	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'dinich':1A 'potato':3A 'stew':4A,5B 'wot':2A
44	Selatta (beet salad)	150g	Vinegar dressed	120	2	4	20	salad	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'beet':2A 'salad':3A,4B 'selatta':1A
45	Timatim Salata (tomato salad)	150g	Fresh chopped	100	2	3	18	salad	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'salad':4A,5B 'salata':2A 'timatim':1A 'tomato':3A
46	Azifa (lentil salad)	150g	Mashed cold	160	9	4	22	salad	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'azifa':1A 'lentil':2A 'salad':3A,4B
47	Hula-wat (lentil veg stew)	150g	Layered ladle	170	8	5	25	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'hula':2A 'hula-wat':1A 'lentil':4A 'stew':6A,7B 'veg':5A 'wat':3A
48	Mereqe (okra stew)	120g	Slimy scoop	70	2	2	12	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'mereq':1A 'okra':2A 'stew':3A,4B
49	Kosta (pasta tomato stew)	150g	Tomatoey mix	200	6	7	30	pasta	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'kosta':1A 'pasta':2A,5B 'stew':4A 'tomato':3A
50	Betecha (spicy green pea stew)	150g	Split green	190	11	6	24	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'betecha':1A 'green':3A 'pea':4A 'spici':2A 'stew':5A,6B
51	Yetakuria Fitfit (veggie injera)	150g	Mixed soak	150	4	5	22	dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'dish':5B 'fitfit':2A 'injera':4A 'veggi':3A 'yetakuria':1A
52	Dabo (wheat loaf bread)	100g	Loaf slice	270	8	4	52	bread	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'bread':4A,5B 'dabo':1A 'loaf':3A 'wheat':2A
53	Suf (sunflower seed porridge)	150g	Seedy sludge	210	5	9	28	porridge	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'porridg':4A,5B 'seed':3A 'suf':1A 'sunflow':2A
54	Telba (flax seed porridge)	150g	Nutty thick	240	7	14	25	porridge	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'flax':2A 'porridg':4A,5B 'seed':3A 'telba':1A
55	Ersho (fermented injera starter)	100g	Bubbly base	110	2	0.5	24	ingredient	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'ersho':1A 'ferment':2A 'ingredi':5B 'injera':3A 'starter':4A
56	Tella (barley home beer)	330ml	Poured communal	150	1	0	12	drink	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'barley':2A 'beer':4A 'drink':5B 'home':3A 'tella':1A
57	Tej (honey mead wine)	200ml	Sipped side	180	0	0	40	drink	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'drink':5B 'honey':2A 'mead':3A 'tej':1A 'wine':4A
58	Kita (barley flatbread)	100g	Rolled thin	250	6	2	50	bread	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'barley':2A 'bread':4B 'flatbread':3A 'kita':1A
59	Poridge (teff thin porridge)	150g	Breakfast ladle	130	3	1	28	porridge	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'poridg':1A 'porridg':4A,5B 'teff':2A 'thin':3A
60	Alicha Wot (mild stew)	150g	Gentle pour	140	5	6	20	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'alicha':1A 'mild':3A 'stew':4A,5B 'wot':2A
61	Siga Tibs (beef liver sauté)	100g	Organ sizzle	300	23	22	3	meat dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'beef':3A 'dish':7B 'liver':4A 'meat':6B 'sauté':5A 'siga':1A 'tib':2A
62	Dulet (tripe liver spicy mix)	100g	Raw-spicy	280	19	21	4	meat dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'dish':7B 'dulet':1A 'liver':3A 'meat':6B 'mix':5A 'spici':4A 'tripe':2A
63	Habesha Kitfo (spiced raw mince)	100g	Mince scoop	340	19	27	1	meat dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'dish':7B 'habesha':1A 'kitfo':2A 'meat':6B 'minc':5A 'raw':4A 'spice':3A
64	Lema (teff pocket bread)	100g	Pocket tear	240	5	1	50	bread	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'bread':4A,5B 'lema':1A 'pocket':3A 'teff':2A
65	Teff Porridge (creamy)	150g	Spoon smooth	140	4	1	29	porridge	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'creami':3A 'porridg':2A,4B 'teff':1A
66	Sorghum Injera (white variant)	100g	Torn light	150	3	0.5	33	bread	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'bread':5B 'injera':2A 'sorghum':1A 'variant':4A 'white':3A
67	Maize Injera (corn hybrid)	100g	Tear chewy	165	3.2	0.8	35	bread	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'bread':5B 'corn':3A 'hybrid':4A 'injera':2A 'maiz':1A
68	Wheat Injera (hybrid flat)	100g	Torn soft	170	4	1	36	bread	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'bread':5B 'flat':4A 'hybrid':3A 'injera':2A 'wheat':1A
70	Anebabero (layered injera butter)	150g	Soaked rich	280	5	12	38	dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'anebabero':1A 'butter':4A 'dish':5B 'injera':3A 'layer':2A
71	Firfir (shredded injera stew)	150g	Breakfast mix	220	6	8	30	breakfast	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'breakfast':5B 'firfir':1A 'injera':3A 'shred':2A 'stew':4A
72	Asa Goulash (fish stew)	150g	Onion tomato ladle	260	20	18	8	fish dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'asa':1A 'dish':6B 'fish':3A,5B 'goulash':2A 'stew':4A
73	Tere Siga (raw beef cubes)	100g	Mitmita dip	310	21	24	1	meat dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'beef':4A 'cube':5A 'dish':7B 'meat':6B 'raw':3A 'siga':2A 'tere':1A
74	Shekla Tibs (sizzling clay pot beef)	150g	Hot coals edge	410	26	32	4	meat dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'beef':6A 'clay':4A 'dish':8B 'meat':7B 'pot':5A 'shekla':1A 'sizzl':3A 'tib':2A
75	Enkulal Tibs (egg omelet sauté)	150g	Pepper scramble	240	13	17	10	breakfast	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'breakfast':6B 'egg':3A 'enkul':1A 'omelet':4A 'sauté':5A 'tib':2A
76	Dabb Firfir (bread injera butter)	150g	Yogurt spoon	230	7	9	32	dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'bread':3A 'butter':5A 'dabb':1A 'dish':6B 'firfir':2A 'injera':4A
77	Ti'hilo (Tigray barley dip balls)	150g	Prong sauce dunk	240	8	6	42	dish	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'ball':6A 'barley':4A 'dip':5A 'dish':7B 'hilo':2A 'ti':1A 'tigray':3A
78	Gonfo (thick grain porridge)	150g	Ball broken	210	6	4	36	porridge	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'gonfo':1A 'grain':3A 'porridg':4A,5B 'thick':2A
79	Beg Wat (sheep curry stew)	150g	Berbere heavy	290	21	20	12	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'beg':1A 'curri':4A 'sheep':3A 'stew':5A,6B 'wat':2A
80	Bere Wat (beef curry stew)	150g	Spicy simmer	310	23	22	14	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'beef':3A 'bere':1A 'curri':4A 'stew':5A,6B 'wat':2A
81	Kai Wat (extra spicy meat stew)	150g	Overload berbere	330	22	24	13	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'extra':3A 'kai':1A 'meat':5A 'spici':4A 'stew':6A,7B 'wat':2A
82	Ukkaamssa (ground beef stew)	150g	Chili onion mix	270	20	19	8	stew	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'beef':3A 'ground':2A 'stew':4A,5B 'ukkaamssa':1A
83	Qoocco (Oromia enset variant)	200g	Scoop fermented	110	2	1	23	porridge	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'enset':3A 'oromia':2A 'porridg':5B 'qoocco':1A 'variant':4A
84	Qince (shredded grain porridge)	150g	Flour-free thick	160	4	3	32	porridge	t	\N	2025-12-20 02:29:16.948133	\N	2025-12-20 02:32:24.115994	'grain':3A 'porridg':4A,5B 'qinc':1A 'shred':2A
\.


--
-- Data for Name: meal_log_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.meal_log_items (id, meal_log_id, food_item_id, quantity, unit, calories, protein, fat, carbs) FROM stdin;
6	6	60	100	g	140	5	6	20
7	7	80	100	g	310	23	22	14
8	8	52	100	g	270	8	4	52
\.


--
-- Data for Name: meal_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.meal_logs (id, member_id, meal_type, logged_at, diet_plan_id) FROM stdin;
6	16	breakfast	2025-12-28 05:43:11.143671	\N
7	16	lunch	2025-12-28 05:44:37.351117	\N
8	16	lunch	2025-12-28 05:45:03.61104	\N
\.


--
-- Data for Name: member_check_ins; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.member_check_ins (id, member_id, adherence, fatigue, pain, weight_kg, notes, logged_at) FROM stdin;
1	16	3	3	1	68	\N	2025-12-29 12:29:43.139845
2	16	3	3	1	68	\N	2025-12-29 12:29:51.429751
\.


--
-- Data for Name: member_goals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.member_goals (member_id, weekly_calorie_goal, weekly_workout_minutes, daily_steps_goal, daily_water_liters, created_at, updated_at) FROM stdin;
16	20097	300	10000	3	2025-12-27 04:01:57.77648	2025-12-29 12:29:06.16647
\.


--
-- Data for Name: member_plan_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.member_plan_messages (id, member_id, coach_id, sender_role, plan_type, message, created_at) FROM stdin;
5	16	\N	member	workout	Welcome, and thank you for joining us. I hope we both have a great time during our time together	2025-12-27 03:57:15.215565
6	16	\N	member	workout	thanks	2025-12-27 03:57:36.711562
\.


--
-- Data for Name: member_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.member_profiles (user_id, age, gender, weight_kg, height_cm, goal, activity_level, is_private, updated_at, created_by, bmr, tdee, target_calories, trainer_intake, nutrition_intake) FROM stdin;
16	28	male	69	175	muscle_gain	moderate	f	2025-12-29 12:29:06.16647	\N	1659	2571	2871	{"injuries": "", "equipment": "", "daysPerWeek": 4, "preferences": "", "primaryGoal": "general_fitness", "fitnessLevel": "beginner", "sessionLengthMinutes": 0}	{"notes": "", "budget": "medium", "allergies": "", "mealsPerDay": 3, "primaryGoal": "general_fitness", "dietPreferences": ""}
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, user_id, message, created_at, is_read) FROM stdin;
2	1	New workout plan message for member #9	2025-12-25 14:05:40.651088	t
7	14	New message from member about their workout plan	2025-12-27 03:57:36.738321	t
5	14	New message from member about their workout plan	2025-12-27 03:57:15.298548	t
8	1	New workout plan message for member #16	2025-12-27 03:57:36.871212	t
6	1	New workout plan message for member #16	2025-12-27 03:57:15.475718	t
4	1	New workout plan message for member #9	2025-12-26 10:22:26.113869	t
\.


--
-- Data for Name: nutritionist_assignments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.nutritionist_assignments (member_id, nutritionist_id, assigned_at) FROM stdin;
16	18	2025-12-27 06:56:41.144446
17	18	2025-12-27 06:56:48.096913
\.


--
-- Data for Name: nutritionist_feedback; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.nutritionist_feedback (id, nutritionist_id, member_id, content, created_at) FROM stdin;
\.


--
-- Data for Name: schedules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schedules (id, trainer_id, member_id, session_type, session_date, session_time, status, created_at) FROM stdin;
2	14	16	personal	2025-12-28	15:00:00	scheduled	2025-12-27 03:58:52.370139
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schema_migrations (id, filename, applied_at) FROM stdin;
1	000_base_schema.sql	2025-12-20 02:39:09.075919
2	001_initial_schema_enhancements.sql	2025-12-20 02:39:09.184474
3	003_member_goals_and_plan_details.sql	2025-12-20 02:39:09.197172
4	002_user_activation_flow.sql	2025-12-20 02:39:09.21653
5	004_progress_and_workout_weight.sql	2025-12-20 02:39:09.314864
6	005_member_intake_jsonb.sql	2025-12-20 02:39:09.378256
7	006_member_check_ins.sql	2025-12-20 02:39:09.392899
8	007_member_plan_messages.sql	2025-12-20 02:39:09.410794
\.


--
-- Data for Name: system_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_logs (id, log_type, message, created_at) FROM stdin;
\.


--
-- Data for Name: trainer_assignments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.trainer_assignments (member_id, trainer_id, assigned_at) FROM stdin;
16	14	2025-12-27 06:56:41.140242
17	14	2025-12-27 06:56:48.094721
\.


--
-- Data for Name: trainer_feedback; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.trainer_feedback (id, trainer_id, member_id, content, created_at) FROM stdin;
\.


--
-- Data for Name: user_activation_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_activation_logs (id, user_id, action, ip_address, user_agent, created_at) FROM stdin;
19	14	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-27 03:34:50.558597
20	14	activation_success	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-27 03:35:31.034942
21	16	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-27 03:38:34.732064
22	16	activation_success	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-27 03:39:33.492971
23	17	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-27 06:28:52.451617
24	17	activation_success	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-27 06:29:36.815412
25	18	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-27 06:55:19.941017
26	18	activation_success	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-27 06:55:54.937926
29	23	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 12:49:55.166095
30	23	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 12:50:30.614126
31	23	activation_failed_invalid_otp	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 12:51:14.620632
32	23	activation_success	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 12:51:29.668831
33	22	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 12:52:06.95902
34	22	activation_success	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 12:52:37.027763
35	21	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 12:53:05.915968
36	21	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 12:53:23.912041
37	21	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 12:53:47.545952
38	21	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 12:54:26.584055
39	21	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 12:54:51.511428
40	21	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 12:55:13.11327
41	21	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 12:56:13.899063
42	21	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 13:02:29.8291
43	21	activation_success	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 13:03:17.478473
45	25	otp_sent	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 13:08:08.843421
46	25	activation_success	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	2025-12-29 13:09:04.584185
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, full_name, email, password_hash, role, created_at, updated_at, email_verified, reset_token, reset_token_expires, status, activation_otp, otp_expires_at, activated_at) FROM stdin;
18	Solomon Getachew	mk3wftbv9j@xkxkud.com	$2a$10$zty2mvvv3DQa.M4Odo4jIuwQq5egopfRZz/Xq9y7h92z.bnHlyBSu	nutritionist	2025-12-27 06:55:09.792897	2025-12-27 06:55:09.792897	t	\N	\N	active	\N	\N	2025-12-27 06:55:54.937926
16	Tamrat Alemayehu	temesegn63@gmail.com	$2a$10$OiF.BTXOzHCLGGm2qRwREe2GawMDqBlRDAMv/hAelYQZteE296K0q	member	2025-12-27 03:38:14.105311	2025-12-27 06:56:41.114861	t	\N	\N	active	\N	\N	2025-12-27 03:39:33.492971
17	yosef desalegn	bipsiyefyo@necub.com	$2a$10$1MgXzelEiwhQseUMAsDrk.7VqJZmc6Dzyb5X2r4SBZgUsLgQyCf1G	member	2025-12-27 06:28:42.935283	2025-12-27 06:56:48.078027	t	\N	\N	active	\N	\N	2025-12-27 06:29:36.815412
1	Default Admin	admin@leqetgym.com	$2a$10$/7VVFqMn8M2NH7qsGfcDkeVJpaB1xYwb4zZD9JUvHqOmYPi05Ft/2	admin	2025-12-20 02:39:09.622316	2025-12-23 16:53:40.446907	f	\N	\N	pending	\N	\N	\N
23	w3778662@gmail.com	w3778662@gmail.com	$2a$10$.VtEzwoKtbaP5znLdmWlWeRtzYlykgTY1gZRoI9D6/.huMkeuY5.S	trainer	2025-12-29 12:48:26.239986	2025-12-29 12:48:26.239986	t	\N	\N	active	\N	\N	2025-12-29 12:51:29.668831
22	gabrielmarilopez@gmail.com	gabrielmarilopez@gmail.com	$2a$10$oEsVLTjikgGZIoSLFcFGouGFPqg/x.PeOB0qr1SBuiGyzjkGqz4wO	member	2025-12-29 12:47:24.924964	2025-12-29 12:47:24.924964	t	\N	\N	active	\N	\N	2025-12-29 12:52:37.027763
21	yonas desalegn	kai292929havertz@gmail.com	$2a$10$qDTTiG2sv.yijLQdyOyca.LMy9NmxydbcZwGyzQ/ZcyO.EvK0/rvO	member	2025-12-29 12:45:21.585849	2025-12-29 12:45:21.585849	t	\N	\N	active	\N	\N	2025-12-29 13:03:17.478473
14	Feysel Awol	vurzasokne@necub.com	$2a$10$41IJ2TDc9ZCMdL5G6j/gLOvtgWkYwNLM8CA21I4Dy/eSjeAiNpWXm	trainer	2025-12-27 03:34:25.171976	2025-12-27 03:34:25.171976	t	\N	\N	active	\N	\N	2025-12-27 03:35:31.034942
25	9gabriel9jesus99@gmail.com	9gabriel9jesus99@gmail.com	$2a$10$NPDZiZTRv/AbPg/ltdgxyuIwbbMpTevqnSp/Gc92t.fVVkGXiDbFe	member	2025-12-29 13:07:55.861592	2025-12-29 13:07:55.861592	t	\N	\N	active	\N	\N	2025-12-29 13:09:04.584185
\.


--
-- Data for Name: weight_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.weight_logs (id, member_id, weight_kg, logged_at) FROM stdin;
5	16	68	2025-12-29 12:29:43.139845
6	16	68	2025-12-29 12:29:51.429751
\.


--
-- Data for Name: workout_log_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workout_log_items (id, workout_log_id, exercise_id, duration_minutes, calories_burned, weight_used, weight_unit) FROM stdin;
\.


--
-- Data for Name: workout_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workout_logs (id, member_id, logged_at, workout_plan_id) FROM stdin;
\.


--
-- Data for Name: workout_plan_days; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workout_plan_days (id, workout_plan_id, day_of_week, name, duration_minutes, difficulty, focus, tips) FROM stdin;
48	15	monday	introfit	45	Beginner	full body	\N
\.


--
-- Data for Name: workout_plan_exercises; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workout_plan_exercises (id, workout_plan_day_id, exercise_id, name, sets, reps, rest, duration_minutes, instructions, target_muscles) FROM stdin;
57	48	1	Treadmill Running	2	1	3min	20	\N	\N
\.


--
-- Data for Name: workout_plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workout_plans (id, member_id, trainer_id, created_at, notes, name, goal, weekly_days, estimated_duration, difficulty, is_active) FROM stdin;
15	16	14	2025-12-27 04:05:27.200096	\N	kickstart week	muscle_gain	1	\N	\N	t
\.


--
-- Name: diet_plan_meal_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.diet_plan_meal_items_id_seq', 30, true);


--
-- Name: diet_plan_meals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.diet_plan_meals_id_seq', 34, true);


--
-- Name: diet_plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.diet_plans_id_seq', 24, true);


--
-- Name: exercises_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.exercises_id_seq', 35, true);


--
-- Name: food_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.food_items_id_seq', 85, true);


--
-- Name: meal_log_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.meal_log_items_id_seq', 8, true);


--
-- Name: meal_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.meal_logs_id_seq', 8, true);


--
-- Name: member_check_ins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.member_check_ins_id_seq', 2, true);


--
-- Name: member_plan_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.member_plan_messages_id_seq', 6, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.notifications_id_seq', 8, true);


--
-- Name: nutritionist_feedback_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.nutritionist_feedback_id_seq', 1, false);


--
-- Name: schedules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.schedules_id_seq', 2, true);


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.schema_migrations_id_seq', 8, true);


--
-- Name: system_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.system_logs_id_seq', 1, false);


--
-- Name: trainer_feedback_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.trainer_feedback_id_seq', 1, false);


--
-- Name: user_activation_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_activation_logs_id_seq', 46, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 25, true);


--
-- Name: weight_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.weight_logs_id_seq', 6, true);


--
-- Name: workout_log_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.workout_log_items_id_seq', 1, false);


--
-- Name: workout_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.workout_logs_id_seq', 1, false);


--
-- Name: workout_plan_days_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.workout_plan_days_id_seq', 48, true);


--
-- Name: workout_plan_exercises_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.workout_plan_exercises_id_seq', 57, true);


--
-- Name: workout_plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.workout_plans_id_seq', 15, true);


--
-- Name: diet_plan_meal_items diet_plan_meal_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diet_plan_meal_items
    ADD CONSTRAINT diet_plan_meal_items_pkey PRIMARY KEY (id);


--
-- Name: diet_plan_meals diet_plan_meals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diet_plan_meals
    ADD CONSTRAINT diet_plan_meals_pkey PRIMARY KEY (id);


--
-- Name: diet_plans diet_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diet_plans
    ADD CONSTRAINT diet_plans_pkey PRIMARY KEY (id);


--
-- Name: exercises exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);


--
-- Name: food_items food_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_items
    ADD CONSTRAINT food_items_pkey PRIMARY KEY (id);


--
-- Name: meal_log_items meal_log_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_log_items
    ADD CONSTRAINT meal_log_items_pkey PRIMARY KEY (id);


--
-- Name: meal_logs meal_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_logs
    ADD CONSTRAINT meal_logs_pkey PRIMARY KEY (id);


--
-- Name: member_check_ins member_check_ins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_check_ins
    ADD CONSTRAINT member_check_ins_pkey PRIMARY KEY (id);


--
-- Name: member_goals member_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_goals
    ADD CONSTRAINT member_goals_pkey PRIMARY KEY (member_id);


--
-- Name: member_plan_messages member_plan_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_plan_messages
    ADD CONSTRAINT member_plan_messages_pkey PRIMARY KEY (id);


--
-- Name: member_profiles member_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_profiles
    ADD CONSTRAINT member_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: nutritionist_assignments nutritionist_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutritionist_assignments
    ADD CONSTRAINT nutritionist_assignments_pkey PRIMARY KEY (member_id);


--
-- Name: nutritionist_feedback nutritionist_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutritionist_feedback
    ADD CONSTRAINT nutritionist_feedback_pkey PRIMARY KEY (id);


--
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_filename_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_filename_key UNIQUE (filename);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: system_logs system_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_logs
    ADD CONSTRAINT system_logs_pkey PRIMARY KEY (id);


--
-- Name: trainer_assignments trainer_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_assignments
    ADD CONSTRAINT trainer_assignments_pkey PRIMARY KEY (member_id);


--
-- Name: trainer_feedback trainer_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_feedback
    ADD CONSTRAINT trainer_feedback_pkey PRIMARY KEY (id);


--
-- Name: user_activation_logs user_activation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activation_logs
    ADD CONSTRAINT user_activation_logs_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: weight_logs weight_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weight_logs
    ADD CONSTRAINT weight_logs_pkey PRIMARY KEY (id);


--
-- Name: workout_log_items workout_log_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_log_items
    ADD CONSTRAINT workout_log_items_pkey PRIMARY KEY (id);


--
-- Name: workout_logs workout_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_logs
    ADD CONSTRAINT workout_logs_pkey PRIMARY KEY (id);


--
-- Name: workout_plan_days workout_plan_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_days
    ADD CONSTRAINT workout_plan_days_pkey PRIMARY KEY (id);


--
-- Name: workout_plan_exercises workout_plan_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_exercises
    ADD CONSTRAINT workout_plan_exercises_pkey PRIMARY KEY (id);


--
-- Name: workout_plans workout_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plans
    ADD CONSTRAINT workout_plans_pkey PRIMARY KEY (id);


--
-- Name: food_items_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX food_items_name_idx ON public.food_items USING gin (name public.gin_trgm_ops);


--
-- Name: food_items_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX food_items_search_idx ON public.food_items USING gin (search_vector);


--
-- Name: idx_meal_logs_member_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meal_logs_member_date ON public.meal_logs USING btree (member_id, date(logged_at));


--
-- Name: idx_member_check_ins_member_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_check_ins_member_date ON public.member_check_ins USING btree (member_id, logged_at DESC);


--
-- Name: idx_member_plan_messages_member_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_plan_messages_member_plan ON public.member_plan_messages USING btree (member_id, plan_type, created_at DESC);


--
-- Name: idx_notifications_user_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_read ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_weight_logs_member_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weight_logs_member_date ON public.weight_logs USING btree (member_id, logged_at);


--
-- Name: idx_workout_logs_member_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_logs_member_date ON public.workout_logs USING btree (member_id, date(logged_at));


--
-- Name: food_items tsvectorupdate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tsvectorupdate BEFORE INSERT OR UPDATE ON public.food_items FOR EACH ROW EXECUTE FUNCTION public.food_items_search_update();


--
-- Name: exercises update_exercises_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_exercises_updated_at BEFORE UPDATE ON public.exercises FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: food_items update_food_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_food_items_updated_at BEFORE UPDATE ON public.food_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: member_goals update_member_goals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_member_goals_updated_at BEFORE UPDATE ON public.member_goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: member_profiles update_member_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_member_profiles_updated_at BEFORE UPDATE ON public.member_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: diet_plan_meal_items diet_plan_meal_items_diet_plan_meal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diet_plan_meal_items
    ADD CONSTRAINT diet_plan_meal_items_diet_plan_meal_id_fkey FOREIGN KEY (diet_plan_meal_id) REFERENCES public.diet_plan_meals(id) ON DELETE CASCADE;


--
-- Name: diet_plan_meal_items diet_plan_meal_items_food_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diet_plan_meal_items
    ADD CONSTRAINT diet_plan_meal_items_food_item_id_fkey FOREIGN KEY (food_item_id) REFERENCES public.food_items(id);


--
-- Name: diet_plan_meals diet_plan_meals_diet_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diet_plan_meals
    ADD CONSTRAINT diet_plan_meals_diet_plan_id_fkey FOREIGN KEY (diet_plan_id) REFERENCES public.diet_plans(id) ON DELETE CASCADE;


--
-- Name: diet_plans diet_plans_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diet_plans
    ADD CONSTRAINT diet_plans_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: diet_plans diet_plans_nutritionist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diet_plans
    ADD CONSTRAINT diet_plans_nutritionist_id_fkey FOREIGN KEY (nutritionist_id) REFERENCES public.users(id);


--
-- Name: exercises exercises_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: food_items food_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_items
    ADD CONSTRAINT food_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: meal_log_items meal_log_items_food_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_log_items
    ADD CONSTRAINT meal_log_items_food_item_id_fkey FOREIGN KEY (food_item_id) REFERENCES public.food_items(id) ON DELETE CASCADE;


--
-- Name: meal_log_items meal_log_items_meal_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_log_items
    ADD CONSTRAINT meal_log_items_meal_log_id_fkey FOREIGN KEY (meal_log_id) REFERENCES public.meal_logs(id) ON DELETE CASCADE;


--
-- Name: meal_logs meal_logs_diet_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_logs
    ADD CONSTRAINT meal_logs_diet_plan_id_fkey FOREIGN KEY (diet_plan_id) REFERENCES public.diet_plans(id);


--
-- Name: meal_logs meal_logs_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_logs
    ADD CONSTRAINT meal_logs_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: member_check_ins member_check_ins_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_check_ins
    ADD CONSTRAINT member_check_ins_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: member_goals member_goals_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_goals
    ADD CONSTRAINT member_goals_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: member_plan_messages member_plan_messages_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_plan_messages
    ADD CONSTRAINT member_plan_messages_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: member_plan_messages member_plan_messages_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_plan_messages
    ADD CONSTRAINT member_plan_messages_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: member_profiles member_profiles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_profiles
    ADD CONSTRAINT member_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: member_profiles member_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_profiles
    ADD CONSTRAINT member_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: nutritionist_assignments nutritionist_assignments_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutritionist_assignments
    ADD CONSTRAINT nutritionist_assignments_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: nutritionist_assignments nutritionist_assignments_nutritionist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutritionist_assignments
    ADD CONSTRAINT nutritionist_assignments_nutritionist_id_fkey FOREIGN KEY (nutritionist_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: nutritionist_feedback nutritionist_feedback_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutritionist_feedback
    ADD CONSTRAINT nutritionist_feedback_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.users(id);


--
-- Name: nutritionist_feedback nutritionist_feedback_nutritionist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutritionist_feedback
    ADD CONSTRAINT nutritionist_feedback_nutritionist_id_fkey FOREIGN KEY (nutritionist_id) REFERENCES public.users(id);


--
-- Name: schedules schedules_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.users(id);


--
-- Name: schedules schedules_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.users(id);


--
-- Name: trainer_assignments trainer_assignments_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_assignments
    ADD CONSTRAINT trainer_assignments_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: trainer_assignments trainer_assignments_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_assignments
    ADD CONSTRAINT trainer_assignments_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: trainer_feedback trainer_feedback_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_feedback
    ADD CONSTRAINT trainer_feedback_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.users(id);


--
-- Name: trainer_feedback trainer_feedback_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_feedback
    ADD CONSTRAINT trainer_feedback_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.users(id);


--
-- Name: user_activation_logs user_activation_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activation_logs
    ADD CONSTRAINT user_activation_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: weight_logs weight_logs_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weight_logs
    ADD CONSTRAINT weight_logs_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workout_log_items workout_log_items_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_log_items
    ADD CONSTRAINT workout_log_items_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id);


--
-- Name: workout_log_items workout_log_items_workout_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_log_items
    ADD CONSTRAINT workout_log_items_workout_log_id_fkey FOREIGN KEY (workout_log_id) REFERENCES public.workout_logs(id) ON DELETE CASCADE;


--
-- Name: workout_logs workout_logs_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_logs
    ADD CONSTRAINT workout_logs_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workout_logs workout_logs_workout_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_logs
    ADD CONSTRAINT workout_logs_workout_plan_id_fkey FOREIGN KEY (workout_plan_id) REFERENCES public.workout_plans(id);


--
-- Name: workout_plan_days workout_plan_days_workout_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_days
    ADD CONSTRAINT workout_plan_days_workout_plan_id_fkey FOREIGN KEY (workout_plan_id) REFERENCES public.workout_plans(id) ON DELETE CASCADE;


--
-- Name: workout_plan_exercises workout_plan_exercises_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_exercises
    ADD CONSTRAINT workout_plan_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id);


--
-- Name: workout_plan_exercises workout_plan_exercises_workout_plan_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_exercises
    ADD CONSTRAINT workout_plan_exercises_workout_plan_day_id_fkey FOREIGN KEY (workout_plan_day_id) REFERENCES public.workout_plan_days(id) ON DELETE CASCADE;


--
-- Name: workout_plans workout_plans_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plans
    ADD CONSTRAINT workout_plans_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workout_plans workout_plans_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plans
    ADD CONSTRAINT workout_plans_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict uVxqazudMXRYsMgh2iWXtA4dLbzP1fXft5aUXcyKK7rSAPVcXcLLx6Yh4BFhyJv

