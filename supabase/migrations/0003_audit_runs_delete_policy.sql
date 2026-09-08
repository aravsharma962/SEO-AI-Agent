-- Allows a client workspace member to delete their own audit runs (Audit
-- History "delete" feature). audit_pages/audit_comparisons/audit_usage all
-- reference audit_runs with ON DELETE CASCADE (see 0001_init.sql), so
-- deleting the audit_runs row cleans up everything else automatically —
-- that cascade is enforced by the FK constraint itself and isn't subject
-- to RLS on the child tables.

create policy "audit_runs: members can delete" on audit_runs
  for delete using (is_client_member(client_id));
