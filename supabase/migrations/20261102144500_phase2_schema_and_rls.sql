-- Phase 2 — Dashboard and schema
-- Eight tables: projects, analyses, files, edges, routes, explanations, file_roles, insights.
-- Every one of them owns its rows through a foreign key to an organization,
-- and deleting the organization removes them.
-- Row-level security on all eight, with the predicate reading the organization claim off the auth token.

-- 1. Organizations table
create table if not exists organizations (
  id text primary key,
  name text not null,
  slug text,
  created_at timestamptz not null default now()
);

-- Enable RLS on organizations
alter table organizations enable row level security;

-- Helper function to extract org_id claim from JWT token (supports standard JWT and Clerk template)
create or replace function public.auth_org_id()
returns text
language sql
stable
security invoker
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id',
    nullif(current_setting('request.jwt.claim.org_id', true), ''),
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-organization-id',
    auth.jwt() ->> 'org_id'
  );
$$;

-- RLS Policy for organizations
drop policy if exists "organizations_org_isolation" on organizations;
create policy "organizations_org_isolation" on organizations
  for all to authenticated
  using ( (select public.auth_org_id()) = id )
  with check ( (select public.auth_org_id()) = id );

-- 2. Projects table
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  name text not null,
  repository_url text,
  created_at timestamptz not null default now()
);

alter table projects enable row level security;
create index if not exists idx_projects_org_id on projects(org_id);

drop policy if exists "projects_org_isolation" on projects;
create policy "projects_org_isolation" on projects
  for all to authenticated
  using ( (select public.auth_org_id()) = org_id )
  with check ( (select public.auth_org_id()) = org_id );

-- 3. Analyses table
create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  summary jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table analyses enable row level security;
create index if not exists idx_analyses_org_id on analyses(org_id);
create index if not exists idx_analyses_project_id on analyses(project_id);

drop policy if exists "analyses_org_isolation" on analyses;
create policy "analyses_org_isolation" on analyses
  for all to authenticated
  using ( (select public.auth_org_id()) = org_id )
  with check ( (select public.auth_org_id()) = org_id );

-- 4. Files table
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  analysis_id uuid not null references analyses(id) on delete cascade,
  path text not null,
  folder text not null,
  lines integer not null default 0,
  bytes integer not null default 0,
  hash text,
  fan_in integer not null default 0,
  fan_out integer not null default 0,
  created_at timestamptz not null default now()
);

alter table files enable row level security;
create index if not exists idx_files_org_id on files(org_id);
create index if not exists idx_files_analysis_id on files(analysis_id);

drop policy if exists "files_org_isolation" on files;
create policy "files_org_isolation" on files
  for all to authenticated
  using ( (select public.auth_org_id()) = org_id )
  with check ( (select public.auth_org_id()) = org_id );

-- 5. Edges table
create table if not exists edges (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  analysis_id uuid not null references analyses(id) on delete cascade,
  source_file_id uuid not null references files(id) on delete cascade,
  target_file_id uuid references files(id) on delete cascade,
  target_path text not null,
  kind text not null check (kind in ('import', 're_export', 'dynamic_import')),
  created_at timestamptz not null default now()
);

alter table edges enable row level security;
create index if not exists idx_edges_org_id on edges(org_id);
create index if not exists idx_edges_analysis_id on edges(analysis_id);

drop policy if exists "edges_org_isolation" on edges;
create policy "edges_org_isolation" on edges
  for all to authenticated
  using ( (select public.auth_org_id()) = org_id )
  with check ( (select public.auth_org_id()) = org_id );

-- 6. Routes table
create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  analysis_id uuid not null references analyses(id) on delete cascade,
  file_id uuid references files(id) on delete cascade,
  method text not null,
  path text not null,
  created_at timestamptz not null default now()
);

alter table routes enable row level security;
create index if not exists idx_routes_org_id on routes(org_id);
create index if not exists idx_routes_analysis_id on routes(analysis_id);

drop policy if exists "routes_org_isolation" on routes;
create policy "routes_org_isolation" on routes
  for all to authenticated
  using ( (select public.auth_org_id()) = org_id )
  with check ( (select public.auth_org_id()) = org_id );

-- 7. Explanations table
create table if not exists explanations (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  analysis_id uuid not null references analyses(id) on delete cascade,
  file_id uuid not null references files(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table explanations enable row level security;
create index if not exists idx_explanations_org_id on explanations(org_id);
create index if not exists idx_explanations_analysis_id on explanations(analysis_id);

drop policy if exists "explanations_org_isolation" on explanations;
create policy "explanations_org_isolation" on explanations
  for all to authenticated
  using ( (select public.auth_org_id()) = org_id )
  with check ( (select public.auth_org_id()) = org_id );

-- 8. File Roles table
create table if not exists file_roles (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  analysis_id uuid not null references analyses(id) on delete cascade,
  file_id uuid not null references files(id) on delete cascade,
  role text not null,
  confidence numeric not null default 1.0,
  created_at timestamptz not null default now()
);

alter table file_roles enable row level security;
create index if not exists idx_file_roles_org_id on file_roles(org_id);
create index if not exists idx_file_roles_analysis_id on file_roles(analysis_id);

drop policy if exists "file_roles_org_isolation" on file_roles;
create policy "file_roles_org_isolation" on file_roles
  for all to authenticated
  using ( (select public.auth_org_id()) = org_id )
  with check ( (select public.auth_org_id()) = org_id );

-- 9. Insights table
create table if not exists insights (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  analysis_id uuid not null references analyses(id) on delete cascade,
  kind text not null,
  title text not null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table insights enable row level security;
create index if not exists idx_insights_org_id on insights(org_id);
create index if not exists idx_insights_analysis_id on insights(analysis_id);

drop policy if exists "insights_org_isolation" on insights;
create policy "insights_org_isolation" on insights
  for all to authenticated
  using ( (select public.auth_org_id()) = org_id )
  with check ( (select public.auth_org_id()) = org_id );
