-- Pricing model 2026-10-16: plans are free, starter, plus, pro and unlimited.
-- The old 'business' plan maps to 'unlimited'; 'pro' keeps its name.
UPDATE "user" SET "plan" = 'unlimited' WHERE "plan" = 'business';
