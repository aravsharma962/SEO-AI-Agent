-- Stores the live SERP verification result (src/modules/serp-check) per
-- page: { observed_rank, checked_at, note }. Replaces trusting whatever
-- rank order the client happened to submit the URLs in.
alter table audit_pages add column if not exists serp_check jsonb;
