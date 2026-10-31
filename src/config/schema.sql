-- PRSNN PostgreSQL Database Schema
-- Version 1.0 (Relational migration from MongoDB with zero data loss)

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    role VARCHAR(32) DEFAULT 'user',
    verification_status VARCHAR(32) DEFAULT 'not_submitted',
    is_email_verified BOOLEAN DEFAULT false,
    verified_by VARCHAR(255),
    display_name VARCHAR(255),
    full_name VARCHAR(255),
    phone_number VARCHAR(32),
    gender VARCHAR(32) DEFAULT 'prefer_not_to_say',
    gender_preference VARCHAR(32) DEFAULT 'women_only',
    gender_consent_acknowledged BOOLEAN DEFAULT false,
    gender_consent_timestamp TIMESTAMP WITH TIME ZONE,
    agreement_accepted BOOLEAN DEFAULT false,
    agreement_version VARCHAR(32) DEFAULT '1.0',
    agreement_timestamp TIMESTAMP WITH TIME ZONE,
    city VARCHAR(100),
    area VARCHAR(100),
    profile_photo_url TEXT,
    id_proof_front_url TEXT,
    id_proof_back_url TEXT,
    backup_photo_url TEXT,
    otp VARCHAR(32),
    otp_expires TIMESTAMP WITH TIME ZONE,
    description TEXT,
    price_per_hour NUMERIC(10, 2),
    start_time VARCHAR(32),
    end_time VARCHAR(32),
    tags JSONB DEFAULT '[]'::jsonb,
    availability JSONB DEFAULT '{"monday": true, "tuesday": true, "wednesday": true, "thursday": true, "friday": true, "saturday": true, "sunday": true}'::jsonb,
    rating NUMERIC(3, 2) DEFAULT 5.00,
    review_count INTEGER DEFAULT 0,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, verification_status);
CREATE INDEX IF NOT EXISTS idx_users_city ON users(city);
CREATE INDEX IF NOT EXISTS idx_users_gender ON users(gender);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS bookings (
    id VARCHAR(64) PRIMARY KEY,
    requester_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    companion_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(64) DEFAULT 'pending',
    activity VARCHAR(255) DEFAULT 'Coffee',
    city VARCHAR(100) DEFAULT 'Chennai',
    location TEXT,
    message TEXT,
    price_per_hour NUMERIC(10, 2) NOT NULL,
    platform_fee NUMERIC(10, 2) DEFAULT 50,
    total_amount NUMERIC(10, 2),
    start_time VARCHAR(32) NOT NULL,
    end_time VARCHAR(32),
    duration VARCHAR(32) NOT NULL,
    scheduled_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    gender_preference VARCHAR(32) DEFAULT 'women_only',
    gender_consent_acknowledged BOOLEAN DEFAULT false,
    payment_status VARCHAR(64) DEFAULT 'pending',
    offered_companion_ids JSONB DEFAULT '[]'::jsonb,
    current_offer_companion_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    offer_expires_at TIMESTAMP WITH TIME ZONE,
    allocated_companion_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    cancellation_reason TEXT,
    razorpay_order_id VARCHAR(255),
    razorpay_payment_id VARCHAR(255),
    razorpay_signature VARCHAR(255),
    amount_paid NUMERIC(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_requester ON bookings(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_companion ON bookings(companion_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_status_payment ON bookings(status, payment_status);

CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(64) PRIMARY KEY,
    booking_id VARCHAR(64) REFERENCES bookings(id) ON DELETE CASCADE,
    sender_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    recipient_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_booking ON messages(booking_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, is_read);

CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(64) NOT NULL,
    title VARCHAR(255),
    message TEXT NOT NULL,
    booking_id VARCHAR(64) REFERENCES bookings(id) ON DELETE SET NULL,
    is_read BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS reviews (
    id VARCHAR(64) PRIMARY KEY,
    booking_id VARCHAR(64) REFERENCES bookings(id) ON DELETE CASCADE,
    reviewer_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    companion_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    rating NUMERIC(3, 2) NOT NULL,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_companion ON reviews(companion_id, created_at DESC);
