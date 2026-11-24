-- Prisma stores timestamps without a zone, in UTC. Make SQL-side now() comparisons use UTC as well.
DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC'); END $$;
