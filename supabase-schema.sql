create table if not exists public.tracker_tasks (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  level integer not null default 0,
  due_date date null,
  completed_date date null,
  checked boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tracker_tasks enable row level security;

create policy "Users can read their own tasks"
on public.tracker_tasks
for select
using (auth.uid() = user_id);

create policy "Users can insert their own tasks"
on public.tracker_tasks
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own tasks"
on public.tracker_tasks
for update
using (auth.uid() = user_id);

create policy "Users can delete their own tasks"
on public.tracker_tasks
for delete
using (auth.uid() = user_id);

create index if not exists tracker_tasks_user_position_idx
on public.tracker_tasks (user_id, position);
