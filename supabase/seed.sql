-- Phase 2 — Seed Data
-- Matches the JavaScript Mastery Cartograph tutorial exactly:
-- Org 1 (ashis-routray5242's Organization / Adrian's team): 5 analyses
-- Org 2 (JS Mastery Demo): 2 analyses

alter table analyses drop constraint if exists analyses_status_check;
alter table analyses add constraint analyses_status_check
  check (status in ('pending', 'running', 'completed', 'failed', 'queued', 'parsing', 'complete'));

alter table analyses add column if not exists commit text;

do $$
declare
  org1 text := 'org_3LYQkGpnrO5Qg50ZP1Kut016tRZ'; -- ashis-routray5242's Organization
  org2 text := 'org_3La9hsRfzfLTfHiAfUPdh18AIbm'; -- JS Mastery Demo
  
  -- Projects for Org 1
  p_tailwind uuid := gen_random_uuid();
  p_next uuid := gen_random_uuid();
  p_shadcn uuid := gen_random_uuid();

  -- Projects for Org 2
  p_clerk uuid := gen_random_uuid();
  p_supabase uuid := gen_random_uuid();
begin
  -- -------------------------------------------------------------
  -- 1. Seed Org 1: ashis-routray5242's Organization (5 analyses)
  -- -------------------------------------------------------------
  insert into organizations (id, name, slug)
  values (org1, 'ashis-routray5242''s Organization', 'ashis-routray5242-org')
  on conflict (id) do update set name = excluded.name;

  delete from analyses where org_id = org1;
  delete from projects where org_id = org1;

  insert into projects (id, org_id, name, repository_url) values
    (p_tailwind, org1, 'tailwindlabs/tailwindcss', 'https://github.com/tailwindlabs/tailwindcss'),
    (p_next, org1, 'vercel/next.js', 'https://github.com/vercel/next.js'),
    (p_shadcn, org1, 'shadcn-ui/ui', 'https://github.com/shadcn-ui/ui');

  -- Row 1: tailwindlabs/tailwindcss | queued | — | 4m ago | —
  insert into analyses (org_id, project_id, status, commit, summary, created_at, completed_at)
  values (org1, p_tailwind, 'queued', null, '{}'::jsonb, now() - interval '4 minutes', null);

  -- Row 2: vercel/next.js | parsing | a93be01 | 6m ago | —
  insert into analyses (org_id, project_id, status, commit, summary, created_at, completed_at)
  values (org1, p_next, 'parsing', 'a93be01', '{"commit": "a93be01", "progress": "parsing files"}'::jsonb, now() - interval '6 minutes', null);

  -- Row 3: shadcn-ui/ui | failed | — | 5h ago | 5h ago
  insert into analyses (org_id, project_id, status, commit, summary, created_at, completed_at)
  values (org1, p_shadcn, 'failed', null, '{"error": "Repository archive download timed out"}'::jsonb, now() - interval '5 hours', now() - interval '5 hours');

  -- Row 4: shadcn-ui/ui | complete | 0c7d9e2 | 24h ago | 24h ago
  insert into analyses (org_id, project_id, status, commit, summary, created_at, completed_at)
  values (org1, p_shadcn, 'complete', '0c7d9e2', '{"commit": "0c7d9e2", "files_count": 88}'::jsonb, now() - interval '24 hours', now() - interval '24 hours' + interval '42 seconds');

  -- Row 5: vercel/next.js | complete | 4f1c2a9 | 3d ago | 3d ago
  insert into analyses (org_id, project_id, status, commit, summary, created_at, completed_at)
  values (org1, p_next, 'complete', '4f1c2a9', '{"commit": "4f1c2a9", "files_count": 312}'::jsonb, now() - interval '3 days', now() - interval '3 days' + interval '1 minute');

  -- -------------------------------------------------------------
  -- 2. Seed Org 2: JS Mastery Demo (2 analyses)
  -- -------------------------------------------------------------
  insert into organizations (id, name, slug)
  values (org2, 'JS Mastery Demo', 'js-mastery-demo')
  on conflict (id) do update set name = excluded.name;

  delete from analyses where org_id = org2;
  delete from projects where org_id = org2;

  insert into projects (id, org_id, name, repository_url) values
    (p_clerk, org2, 'clerk/javascript', 'https://github.com/clerk/javascript'),
    (p_supabase, org2, 'supabase/supabase-js', 'https://github.com/supabase/supabase-js');

  -- Row 1: clerk/javascript | queued | — | 2m ago | —
  insert into analyses (org_id, project_id, status, commit, summary, created_at, completed_at)
  values (org2, p_clerk, 'queued', null, '{}'::jsonb, now() - interval '2 minutes', null);

  -- Row 2: supabase/supabase-js | complete | 7e2b4d1 | 6h ago | 6h ago
  insert into analyses (org_id, project_id, status, commit, summary, created_at, completed_at)
  values (org2, p_supabase, 'complete', '7e2b4d1', '{"commit": "7e2b4d1", "files_count": 42}'::jsonb, now() - interval '6 hours', now() - interval '6 hours' + interval '25 seconds');

end $$;
