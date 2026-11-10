-- Phase 10 — Explanations Cache and Pinned Model Columns
alter table explanations
  alter column file_id drop not null;

alter table explanations
  add column if not exists target_type text not null default 'file' check (target_type in ('file', 'folder')),
  add column if not exists target_path text not null default '',
  add column if not exists content_hash text not null default '',
  add column if not exists model_name text not null default '',
  add column if not exists cache_key text not null default '';

create index if not exists idx_explanations_cache_key on explanations(org_id, cache_key);
create index if not exists idx_explanations_target on explanations(analysis_id, target_type, target_path);
