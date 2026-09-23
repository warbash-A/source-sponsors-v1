create table public.sponsor_workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null unique,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.sponsor_workflows to anon, authenticated;
grant all on public.sponsor_workflows to service_role;

alter table public.sponsor_workflows enable row level security;

create policy "Public workflow sync"
  on public.sponsor_workflows
  for all
  to anon, authenticated
  using (true)
  with check (true);