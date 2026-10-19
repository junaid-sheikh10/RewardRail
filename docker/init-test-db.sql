-- Runs once, the first time the Postgres container starts with an empty volume.
-- The tests use a separate database so they can wipe it freely.
CREATE DATABASE rewardrail_test OWNER rewardrail;
