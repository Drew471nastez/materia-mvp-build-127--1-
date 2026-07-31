-- Notifications: the inbox's second tab.
--
-- One row per event, addressed to one recipient. The row stores only ids —
-- who acted, which listing, which conversation — and the API enriches at read
-- time, so a renamed profile or retitled listing never leaves stale copy here.
-- Cascades mean a deleted account or listing takes its notifications with it.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('follow', 'offer_received', 'offer_accepted', 'offer_declined', 'message')),
  actor_id uuid references auth.users(id) on delete cascade,
  listing_id uuid references public.products(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- The feed is always "my latest", and the badge is always "my unread" — one
-- index per question, the second partial because read rows never matter to it.
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

-- You read your own rows and mark your own rows read. There is deliberately NO
-- insert policy: notifications are created server-side through the admin
-- client from trusted code paths, so a client can never forge one — not even
-- for itself.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
