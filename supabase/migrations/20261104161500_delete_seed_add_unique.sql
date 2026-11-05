-- Delete mock seed analyses that do not have real files behind them
delete from analyses
where id not in (
  select distinct analysis_id from files
);

-- Delete mock projects that have no analyses remaining
delete from projects
where id not in (
  select distinct project_id from analyses
);

-- Enforce one analysis per project at the database level
alter table analyses
  drop constraint if exists analyses_project_id_key;

alter table analyses
  add constraint analyses_project_id_key unique (project_id);

-- Enforce one project per repository URL per organization
alter table projects
  drop constraint if exists projects_org_repo_key;

alter table projects
  add constraint projects_org_repo_key unique (org_id, repository_url);

