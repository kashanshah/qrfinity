-- Read-only role for the redirect Worker (connects through Cloudflare Hyperdrive).
-- Run once per environment as the database owner, with a strong password:
--   psql "$DATABASE_URL" -v password="'...'" -f packages/db/sql/redirect-reader.sql
-- The role can read only the redirect_lookup view: no emails, no designs, no other tables.
CREATE ROLE redirect_reader LOGIN PASSWORD :password;
GRANT USAGE ON SCHEMA public TO redirect_reader;
GRANT SELECT ON redirect_lookup TO redirect_reader;
