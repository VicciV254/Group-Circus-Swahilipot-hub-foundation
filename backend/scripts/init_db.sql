-- Nexus Enterprise — PostgreSQL Initialization
-- Runs once when the database container is first created

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- Full-text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";  -- GIN indexes for JSONB

-- Ensure the database has proper settings
ALTER DATABASE Nexus_db SET timezone TO 'Africa/Nairobi';
ALTER DATABASE Nexus_db SET default_text_search_config TO 'pg_catalog.english';

-- Grant all privileges to our user
GRANT ALL PRIVILEGES ON DATABASE Nexus_db TO Nexus_user;

-- Log initialization
DO $$
BEGIN
  RAISE NOTICE 'Nexus database initialized at %', NOW();
END $$;
