-- Movie Club Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) UNIQUE,
    name VARCHAR(255),
    password VARCHAR(255),
    security_question VARCHAR(500),
    security_answer VARCHAR(500),
    genres TEXT[], -- Array of genre strings
    email VARCHAR(255),
    group_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Groups (clubs) table
CREATE TABLE IF NOT EXISTS groups (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    creator_id VARCHAR(255) REFERENCES users(id),
    code VARCHAR(50) UNIQUE NOT NULL,
    members TEXT[], -- Array of user IDs
    admins TEXT[], -- Array of admin user IDs
    settings JSONB, -- Store seasonLength, submissionsPerUser, categories
    season JSONB, -- Store season number, startDate, currentWeek, endDate
    seasons JSONB, -- Array of past seasons
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Global season table
CREATE TABLE IF NOT EXISTS global_season (
    id SERIAL PRIMARY KEY,
    season_number INTEGER DEFAULT 1,
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    current_week INTEGER DEFAULT 1,
    end_date TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Submissions table
CREATE TABLE IF NOT EXISTS submissions (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    poster_url VARCHAR(1000),
    user_id VARCHAR(255) REFERENCES users(id),
    group_id VARCHAR(255) REFERENCES groups(id),
    season_number INTEGER DEFAULT 1,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Submission archive (to track movies submitted in past seasons)
CREATE TABLE IF NOT EXISTS submission_archive (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    title_key VARCHAR(500) NOT NULL, -- Normalized lowercase title
    group_id VARCHAR(255) REFERENCES groups(id),
    season_number INTEGER,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(title_key, group_id, season_number)
);

-- History (winners) table
CREATE TABLE IF NOT EXISTS history (
    id VARCHAR(255) PRIMARY KEY,
    winners JSONB NOT NULL, -- Array of winner objects
    winner JSONB, -- Primary winner (backwards compatibility)
    picked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submissions_count INTEGER DEFAULT 0,
    group_id VARCHAR(255) REFERENCES groups(id),
    season_number INTEGER
);

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id),
    movie_title VARCHAR(500) NOT NULL,
    rating INTEGER,
    review TEXT NOT NULL,
    group_id VARCHAR(255) REFERENCES groups(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Watched movies table
CREATE TABLE IF NOT EXISTS watched (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id),
    movie_title VARCHAR(500) NOT NULL,
    group_id VARCHAR(255) REFERENCES groups(id),
    watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, movie_title, group_id)
);

-- User submissions tracking (for per-season/category tracking)
CREATE TABLE IF NOT EXISTS user_submissions (
    id SERIAL PRIMARY KEY,
    season_key VARCHAR(500) UNIQUE NOT NULL, -- Format: season_{number}_{groupId}_{userId}
    submissions JSONB NOT NULL, -- Array of {category, title, submittedAt}
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_group_id ON submissions(group_id);
CREATE INDEX IF NOT EXISTS idx_submissions_season ON submissions(group_id, season_number);
CREATE INDEX IF NOT EXISTS idx_history_group_id ON history(group_id);
CREATE INDEX IF NOT EXISTS idx_history_season ON history(group_id, season_number);
CREATE INDEX IF NOT EXISTS idx_reviews_movie_title ON reviews(movie_title);
CREATE INDEX IF NOT EXISTS idx_reviews_group_id ON reviews(group_id);
CREATE INDEX IF NOT EXISTS idx_archive_group_season ON submission_archive(group_id, season_number);

-- Initialize global season if it doesn't exist
INSERT INTO global_season (season_number, start_date, current_week) 
VALUES (1, CURRENT_TIMESTAMP, 1)
ON CONFLICT DO NOTHING;
