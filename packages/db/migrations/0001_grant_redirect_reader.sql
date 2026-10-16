-- Grant the redirect Worker's read-only role access to the view, if the role exists in this
-- environment (see sql/redirect-reader.sql). Re-run in any migration that recreates the view.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'redirect_reader') THEN
    GRANT USAGE ON SCHEMA public TO redirect_reader;
    GRANT SELECT ON redirect_lookup TO redirect_reader;
  END IF;
END
$$;
