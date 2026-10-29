-- Adds storage for two new Claude-generated outputs:
-- - schema_recommendations (per page): ready-to-paste JSON-LD snippets for
--   schema types genuinely relevant to that specific page and missing from it
--   (src/modules/schema-recommendations).
-- - content_briefs (per audit run): structural writing briefs for the
--   highest-priority content gaps (src/modules/content-brief).
-- The audit_pages.internal_links column already exists (0001_init.sql, never
-- wired up until now) and is reused for internal-link suggestions
-- (src/modules/internal-links) rather than adding another column.

alter table audit_pages add column if not exists schema_recommendations jsonb;
alter table audit_comparisons add column if not exists content_briefs jsonb;
