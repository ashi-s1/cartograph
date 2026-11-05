-- Phase 7 — Pipeline Schema Extensions
-- Add commit_sha, stage, stage_message, and error tracking to analyses

alter table analyses
  add column if not exists commit_sha text,
  add column if not exists stage text default 'fetching',
  add column if not exists stage_message text default 'Fetching repository archive',
  add column if not exists error_message text;

-- Ensure repository URLs are consistent and uniquely indexable per organization
create index if not exists idx_projects_org_repo on projects(org_id, repository_url);

-- Realtime publication for per-analysis channels
-- We publish changes on analyses to the realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'analyses'
  ) then
    alter publication supabase_realtime add table analyses;
  end if;
end $$;

