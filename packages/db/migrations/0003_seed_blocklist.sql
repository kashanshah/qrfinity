-- Starting blocklist: top-level domains that look like file names and are widely used to trick
-- people ("invoice.zip"). Admins manage the rest in /admin/blocklist.
INSERT INTO "blocklist" ("kind", "value", "reason", "created_by") VALUES
  ('tld', 'zip', 'Looks like a file name; widely used for phishing', 'system'),
  ('tld', 'mov', 'Looks like a file name; widely used for phishing', 'system')
ON CONFLICT DO NOTHING;
