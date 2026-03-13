create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  color text default '#4f7cff',
  due_date date,
  due_soon_days integer not null default 7,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('editor', 'viewer', 'member')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now()
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  due_date date,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  milestone_id uuid references public.milestones(id) on delete set null,
  parent_task_id uuid references public.tasks(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'blocked', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date,
  completed_date date,
  completed_by uuid references auth.users(id) on delete set null,
  position integer not null default 0,
  level integer not null default 0,
  archived boolean not null default false,
  collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table public.task_dependencies (
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.project_meetings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  notes text,
  scheduled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index projects_owner_idx on public.projects(owner_id);
create index project_members_user_idx on public.project_members(user_id, project_id);
create index invitations_project_idx on public.project_invitations(project_id);
create index milestones_project_idx on public.milestones(project_id, position);
create index tasks_project_idx on public.tasks(project_id, position);
create index tasks_parent_idx on public.tasks(parent_task_id);
create index tasks_milestone_idx on public.tasks(milestone_id);
create index task_comments_task_idx on public.task_comments(task_id, created_at);
create index meetings_project_idx on public.project_meetings(project_id, scheduled_at);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invitations enable row level security;
alter table public.milestones enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.task_comments enable row level security;
alter table public.project_meetings enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do update
  set email = excluded.email;
  return new;
end;
$$;

create or replace function public.add_project_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists add_project_owner_membership on public.projects;
create trigger add_project_owner_membership
after insert on public.projects
for each row execute procedure public.add_project_owner_as_member();

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
  );
$$;

create or replace function public.is_project_editor(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.role in ('owner', 'editor')
  );
$$;

create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.role = 'owner'
  );
$$;

create or replace function public.accept_pending_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted_count integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  insert into public.project_members (project_id, user_id, role)
  select distinct
    invitation.project_id,
    auth.uid(),
    case
      when invitation.role in ('owner', 'editor', 'viewer') then invitation.role
      else 'viewer'
    end
  from public.project_invitations invitation
  where lower(invitation.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and invitation.status = 'pending'
  on conflict (project_id, user_id) do update
  set role = excluded.role;

  update public.project_invitations invitation
  set status = 'accepted'
  where lower(invitation.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and invitation.status = 'pending';

  get diagnostics accepted_count = row_count;
  return accepted_count;
end;
$$;

create policy "profiles_select"
on public.profiles
for select
using (true);

create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id);

create policy "projects_select_members"
on public.projects
for select
using (public.is_project_member(id) or public.is_project_owner(id));

create policy "projects_insert_owner"
on public.projects
for insert
with check (owner_id = auth.uid());

create policy "projects_update_owner"
on public.projects
for update
using (public.is_project_owner(id));

create policy "projects_delete_owner"
on public.projects
for delete
using (public.is_project_owner(id));

create policy "project_members_select_members"
on public.project_members
for select
using (public.is_project_member(project_id) or public.is_project_owner(project_id));

create policy "project_members_insert_owner"
on public.project_members
for insert
with check (public.is_project_owner(project_id));

create policy "project_members_update_owner"
on public.project_members
for update
using (public.is_project_owner(project_id));

create policy "project_members_delete_owner_or_self"
on public.project_members
for delete
using (
  public.is_project_owner(project_id)
  or (auth.uid() = user_id and role <> 'owner')
);

create policy "project_invitations_select_members"
on public.project_invitations
for select
using (
  public.is_project_member(project_id)
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy "project_invitations_insert_owner"
on public.project_invitations
for insert
with check (public.is_project_owner(project_id));

create policy "project_invitations_update_owner"
on public.project_invitations
for update
using (public.is_project_owner(project_id));

create policy "project_invitations_delete_owner"
on public.project_invitations
for delete
using (public.is_project_owner(project_id));

create policy "milestones_select_members"
on public.milestones
for select
using (public.is_project_member(project_id) or public.is_project_owner(project_id));

create policy "milestones_insert_owner"
on public.milestones
for insert
with check (public.is_project_owner(project_id));

create policy "milestones_update_owner"
on public.milestones
for update
using (public.is_project_owner(project_id));

create policy "milestones_delete_owner"
on public.milestones
for delete
using (public.is_project_owner(project_id));

create policy "tasks_select_members"
on public.tasks
for select
using (public.is_project_member(project_id) or public.is_project_owner(project_id));

create policy "tasks_insert_editors"
on public.tasks
for insert
with check (public.is_project_editor(project_id) or public.is_project_owner(project_id));

create policy "tasks_update_editors"
on public.tasks
for update
using (public.is_project_editor(project_id) or public.is_project_owner(project_id));

create policy "tasks_delete_editors"
on public.tasks
for delete
using (public.is_project_editor(project_id) or public.is_project_owner(project_id));

create policy "task_assignees_select_members"
on public.task_assignees
for select
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_assignees.task_id
      and (public.is_project_member(t.project_id) or public.is_project_owner(t.project_id))
  )
);

create policy "task_assignees_insert_editors"
on public.task_assignees
for insert
with check (
  exists (
    select 1
    from public.tasks t
    where t.id = task_assignees.task_id
      and (public.is_project_editor(t.project_id) or public.is_project_owner(t.project_id))
  )
);

create policy "task_assignees_delete_editors"
on public.task_assignees
for delete
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_assignees.task_id
      and (public.is_project_editor(t.project_id) or public.is_project_owner(t.project_id))
  )
);

create policy "task_dependencies_select_members"
on public.task_dependencies
for select
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_dependencies.task_id
      and (public.is_project_member(t.project_id) or public.is_project_owner(t.project_id))
  )
);

create policy "task_dependencies_insert_editors"
on public.task_dependencies
for insert
with check (
  exists (
    select 1
    from public.tasks t
    where t.id = task_dependencies.task_id
      and (public.is_project_editor(t.project_id) or public.is_project_owner(t.project_id))
  )
);

create policy "task_dependencies_delete_editors"
on public.task_dependencies
for delete
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_dependencies.task_id
      and (public.is_project_editor(t.project_id) or public.is_project_owner(t.project_id))
  )
);

create policy "task_comments_select_members"
on public.task_comments
for select
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_comments.task_id
      and (public.is_project_member(t.project_id) or public.is_project_owner(t.project_id))
  )
);

create policy "task_comments_insert_members"
on public.task_comments
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.tasks t
    where t.id = task_comments.task_id
      and (public.is_project_member(t.project_id) or public.is_project_owner(t.project_id))
  )
);

create policy "task_comments_delete_owner_or_author"
on public.task_comments
for delete
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.tasks t
    where t.id = task_comments.task_id
      and public.is_project_owner(t.project_id)
  )
);

create policy "meetings_select_members"
on public.project_meetings
for select
using (public.is_project_member(project_id) or public.is_project_owner(project_id));

create policy "meetings_insert_editors"
on public.project_meetings
for insert
with check (public.is_project_editor(project_id) or public.is_project_owner(project_id));

create policy "meetings_update_editors"
on public.project_meetings
for update
using (public.is_project_editor(project_id) or public.is_project_owner(project_id));

create policy "meetings_delete_editors"
on public.project_meetings
for delete
using (public.is_project_editor(project_id) or public.is_project_owner(project_id));
