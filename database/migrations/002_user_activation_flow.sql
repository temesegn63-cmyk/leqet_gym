-- ===================================
--       USER ACTIVATION FLOW
-- ===================================

-- 1. Add status and OTP fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
ADD COLUMN IF NOT EXISTS activation_otp VARCHAR(6),
ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP;

-- 2. Create audit log for user activations
CREATE TABLE IF NOT EXISTS user_activation_logs (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'otp_sent', 'activation_success', 'activation_failed'
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Create function to generate OTP
CREATE OR REPLACE FUNCTION generate_otp()
RETURNS CHAR(6) AS $$
DECLARE
    otp CHAR(6);
BEGIN
    -- Generate a 6-digit OTP
    otp := LPAD(FLOOR(random() * 1000000)::TEXT, 6, '0');
    RETURN otp;
END;
$$ LANGUAGE plpgsql;

-- 4. Create function to send OTP
CREATE OR REPLACE FUNCTION send_activation_otp(
    p_user_id INT,
    p_email VARCHAR(255),
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
) 
RETURNS VARCHAR(6) AS $$
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
$$ LANGUAGE plpgsql;

-- 5. Create function to verify OTP and activate user
CREATE OR REPLACE FUNCTION verify_activation_otp(
    p_user_id INT,
    p_otp VARCHAR(6),
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
) 
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql;
