-- storelib, for real — the official account, its thread in every inbox, and a
-- notification pointing at it.
--
-- 20260804_system_account.sql widened the schema for a system conversation and
-- then stopped, deliberately, at the one step it could not take safely: it
-- refused to invent an account, because a uuid guessed in a migration could
-- promote somebody else's profile to official. This file takes that step, but
-- it does not guess — it creates the account itself, with a uuid that is fixed
-- here and belongs to nothing else, so there is no one to promote by accident.
--
-- It is written to be pasted into the SQL editor by an operator and to just
-- work: no application deploy, no environment variable, no follow-up. Running
-- it twice adds nothing (see the `where not exists` guards throughout), and
-- every step that touches a schema this repo does not own — auth.users, and
-- whatever shape public.profiles has in a given deployment — is wrapped so a
-- difference degrades to a NOTICE instead of aborting the rest.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 0. Schema top-up.
--
-- Everything below is already in 20260804_system_account.sql and is repeated
-- here only so this file stands alone: an operator pasting one migration into
-- a database that is a version behind should still end up with a working
-- inbox rather than a half-applied one. All of it is idempotent.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.conversations') is null then
    raise notice '[storelib] public.conversations does not exist — run 20260802_messages_offers.sql first. Nothing seeded.';
    return;
  end if;

  -- A system thread is about no listing.
  alter table public.conversations alter column listing_id drop not null;

  alter table public.conversations
    add column if not exists kind text not null default 'listing'
      check (kind in ('listing', 'system'));

  -- One Storelib thread per person. The table's (listing_id, buyer_id) unique
  -- cannot police this: NULLs never compare equal, so every system row would
  -- read as distinct.
  create unique index if not exists conversations_system_unique
    on public.conversations (buyer_id)
    where kind = 'system';

  alter table public.profiles
    add column if not exists is_official boolean not null default false;
exception
  when others then
    raise notice '[storelib] schema top-up skipped: %', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. The account.
--
-- The uuid is hard-coded rather than generated so that re-running this file,
-- or running it across staging and production, always names the same account —
-- and so an operator has something concrete to put in STORELIB_SYSTEM_USER_ID
-- if they want to skip the lookup entirely.
--
-- Writing into auth.users from SQL is the delicate part of this migration:
-- GoTrue's table has picked up and dropped columns across versions, and a
-- NOT NULL that exists in one deployment does not in the next. So the insert
-- is attempted twice — once with the token columns older GoTrue builds insist
-- on, then with the minimum every version shares — and if both fail the
-- migration says so and stops seeding rather than leaving wreckage.
--
-- The password is random and thrown away on purpose. Nobody signs in as
-- Storelib; the account exists to be a sender_id. Leaving a known password on
-- an account that renders with a blue check in every inbox would be the one
-- genuinely dangerous thing this file could do.
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid := 'a7e1c0d2-5b64-4f8a-9c31-6e0d8f2b4a91';
  v_email text := 'storelib@storelib.com';
  v_pw text;
  v_existing uuid;
begin
  -- pgcrypto lives in the `extensions` schema on Supabase and in `public`
  -- elsewhere, and the SQL editor's search_path does not always carry the
  -- former. If crypt() cannot be reached, fall back to a bcrypt-shaped string
  -- that no password will ever verify against — which is the desired outcome
  -- either way, since this account is not meant to be signed into.
  begin
    v_pw := crypt(gen_random_uuid()::text, gen_salt('bf'));
  exception
    when others then
      v_pw := '$2a$10$' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  end;

  -- Already configured? Then this whole section is a no-op. The handle is the
  -- test rather than the uuid, because a deployment may have made its Storelib
  -- account by hand before this file existed, and adopting it is right where
  -- creating a second one would be wrong.
  select id into v_existing from public.profiles where username = 'storelib' limit 1;
  if v_existing is not null then
    raise notice '[storelib] profile "storelib" already exists (%), reusing it.', v_existing;
    return;
  end if;

  if exists (select 1 from auth.users where id = v_id or email = v_email) then
    raise notice '[storelib] auth user already present, reusing it.';
    return;
  end if;

  begin
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email, v_pw,
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      '', '', '', ''
    );
  exception
    when others then
      -- Newer schemas drop or rename the token columns; fall back to the set
      -- that has been stable since the beginning.
      begin
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, created_at, updated_at,
          raw_app_meta_data, raw_user_meta_data
        ) values (
          '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email, v_pw,
          now(), now(), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
        );
      exception
        when others then
          raise notice '[storelib] could not create the auth user: %. Create it in the Supabase dashboard (Authentication → Add user, email %), then re-run this file.', sqlerrm, v_email;
      end;
  end;
exception
  when others then
    raise notice '[storelib] account step skipped: %', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Its profile.
--
-- Which columns public.profiles has is deployment-specific — it is not created
-- by any migration in this repo — so the write asks for the ideal shape first
-- and settles for the portable one if that is refused. is_official is what
-- lib/system-account.ts looks for first; the username is what it falls back
-- to, and "storelib" is unavailable to everyone else because
-- lib/reserved-words.ts lists it.
--
-- avatar_url is deliberately left NULL. There is no Storelib avatar in this
-- repo that next/image would serve (the icons are SVG, which the optimizer
-- rejects without dangerouslyAllowSVG), and a broken image in every inbox is
-- worse than the purple "S" monogram components/messages/inbox.tsx already
-- draws for a profile without one. To use a real one later, upload it and:
--   update public.profiles set avatar_url = '<url>' where username = 'storelib';
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_has_avatar boolean;
begin
  select id into v_id from public.profiles where username = 'storelib' limit 1;
  if v_id is null then
    select id into v_id from auth.users where email = 'storelib@storelib.com' limit 1;
  end if;
  if v_id is null then
    raise notice '[storelib] no Storelib account to write a profile for — section 1 above will have said why.';
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url'
  ) into v_has_avatar;

  -- Two attempts, so a database whose profiles table predates is_official
  -- still ends up with the handle and the display name. That is enough on its
  -- own: lib/system-account.ts falls back to the reserved username, so the
  -- account still resolves and the only thing missing is the blue check.
  begin
    if exists (select 1 from public.profiles where id = v_id) then
      -- A signup trigger may have made the row already; correct it in place.
      update public.profiles
         set username     = 'storelib',
             display_name = 'Storelib',
             is_official  = true
       where id = v_id;
    else
      insert into public.profiles (id, username, display_name, is_official)
      values (v_id, 'storelib', 'Storelib', true);
    end if;
  exception
    when others then
      raise notice '[storelib] is_official unavailable (%), writing the profile without it.', sqlerrm;
      if exists (select 1 from public.profiles where id = v_id) then
        update public.profiles set username = 'storelib', display_name = 'Storelib' where id = v_id;
      else
        insert into public.profiles (id, username, display_name) values (v_id, 'storelib', 'Storelib');
      end if;
  end;

  if v_has_avatar then
    update public.profiles set avatar_url = null where id = v_id and avatar_url is null;
  end if;
exception
  when others then
    raise notice '[storelib] could not write the profile: %. Set it by hand: update public.profiles set is_official = true, display_name = ''Storelib'', username = ''storelib'' where id = ''<uuid>'';', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. A thread for everybody, with something in it.
--
-- lib/system-account.ts creates this thread lazily when someone opens their
-- inbox, which covers every future account. This covers the ones that already
-- exist — the whole point of the exercise is that the inbox is not empty the
-- next time the current users look at it, and none of them will get the lazy
-- path until they visit.
--
-- The join through auth.users is not decoration: buyer_id is a foreign key to
-- it, and a profiles row orphaned by a hard-deleted account would otherwise
-- abort the whole insert over one bad row.
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_convos integer := 0;
  v_msgs integer := 0;
  v_notifs integer := 0;
begin
  select id into v_id from public.profiles where username = 'storelib' limit 1;
  if v_id is null then
    raise notice '[storelib] account not configured — no threads seeded.';
    return;
  end if;

  -- One system conversation per existing user. `conversations_distinct_parties`
  -- forbids a thread with yourself, so Storelib is excluded from its own
  -- broadcast rather than special-cased.
  insert into public.conversations (listing_id, buyer_id, seller_id, kind, created_at, last_message_at)
  select null, p.id, v_id, 'system', now(), now()
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id <> v_id
     and not exists (
       select 1 from public.conversations c
        where c.buyer_id = p.id and c.kind = 'system'
     )
  on conflict do nothing;
  get diagnostics v_convos = row_count;

  -- Three short messages, in Romanian, sent a minute ago so they are already
  -- "history" rather than something that just landed while you were looking.
  -- They stay unread (read_at null), which is what puts the purple count on
  -- the row and gives a person a reason to open it.
  --
  -- NO DASH IN THE COPY. The third line read "Scrie-ne direct aici — îți
  -- răspundem", and the em-dash is a punctuation mark this product does not use
  -- in the sentences it shows people. It is also the one line that invited a
  -- reply into a thread that has no composer behind it (lib/system-account.ts
  -- says the same), so the rewrite drops the invitation and the dash together
  -- and points at the help centre, which is somewhere that can actually answer.
  --
  -- Only threads with nothing in them are filled, so a re-run never repeats
  -- itself and never lands on top of a conversation someone has replied to.
  insert into public.messages (conversation_id, sender_id, kind, body, created_at)
  select c.id, v_id, 'text', m.body, now() - interval '1 minute' + (m.ord * interval '1 second')
    from public.conversations c
    cross join (values
      (1, 'Bine ai venit pe Storelib! 💜 Ne bucurăm că ești aici.'),
      (2, 'Pe canalul ăsta îți trimitem noutăți despre aplicație și sfaturi care te ajută să vinzi mai repede: fotografii clare la lumină naturală, un titlu care spune marca și mărimea, și un preț pe care l-ai plăti și tu.'),
      (3, 'Ai o întrebare? Găsești răspunsurile și formularul de contact în Centrul de ajutor.')
    ) as m(ord, body)
   where c.kind = 'system'
     and c.seller_id = v_id
     and not exists (select 1 from public.messages x where x.conversation_id = c.id);
  get diagnostics v_msgs = row_count;

  -- AND THE ACCOUNTS ALREADY SEEDED WITH THE OLD LINE ARE CORRECTED IN PLACE.
  -- The insert above only fills empty threads, so it can never touch a message
  -- somebody has already received — every account seeded before this edit still
  -- carries the em-dash line. This rewrites exactly that one body wherever it is
  -- still the untouched original, keyed on the full old text so it cannot catch
  -- a reply or an edited message. Matched narrowly on purpose: a blanket
  -- replace of "—" across every message would rewrite what users wrote to each
  -- other, and this table is theirs, not ours.
  update public.messages
     set body = 'Ai o întrebare? Găsești răspunsurile și formularul de contact în Centrul de ajutor.'
   where sender_id = v_id
     and body = 'Ai o întrebare sau ceva nu merge? Scrie-ne direct aici — îți răspundem.';

  update public.conversations c
     set last_message_at = greatest(c.last_message_at, (
           select max(m.created_at) from public.messages m where m.conversation_id = c.id
         ))
   where c.kind = 'system' and c.seller_id = v_id;

  -- And one notification each, so the second tab has something in it too. It
  -- points at the conversation, which is where notifHref in the inbox sends a
  -- 'message' row — tapping the notification opens the thread.
  if to_regclass('public.notifications') is not null then
    insert into public.notifications (user_id, kind, actor_id, listing_id, conversation_id, created_at)
    select c.buyer_id, 'message', v_id, null, c.id, now()
      from public.conversations c
     where c.kind = 'system'
       and c.seller_id = v_id
       and not exists (
         select 1 from public.notifications n
          where n.user_id = c.buyer_id and n.conversation_id = c.id and n.kind = 'message'
       );
    get diagnostics v_notifs = row_count;
  else
    raise notice '[storelib] public.notifications missing — run 20260803_notifications.sql for the second tab.';
  end if;

  raise notice '[storelib] seeded % conversation(s), % message(s), % notification(s).', v_convos, v_msgs, v_notifs;
exception
  when others then
    raise notice '[storelib] seeding failed: %', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- Operator note.
--
-- Nothing else is required. lib/system-account.ts resolves the account without
-- any configuration: it prefers STORELIB_SYSTEM_USER_ID, then any profile with
-- is_official = true (which section 2 above sets), and finally the reserved
-- "storelib" handle — so this file alone is enough, and the account appears
-- within five minutes of running it even on a server that already cached a
-- miss. No deploy, no restart.
--
-- If you would rather skip the lookup entirely, set:
--
--   STORELIB_SYSTEM_USER_ID=a7e1c0d2-5b64-4f8a-9c31-6e0d8f2b4a91
--
-- That is the uuid section 1 creates. It is optional, and it is only correct
-- if section 1 actually created the account — if the NOTICE said an existing
-- "storelib" profile was reused, use that profile's id instead, or leave the
-- variable unset and let the lookup do its job.
--
-- To verify:
--   select id, username, display_name, is_official from public.profiles where username = 'storelib';
--   select count(*) from public.conversations where kind = 'system';
--   select count(*) from public.messages m join public.conversations c on c.id = m.conversation_id where c.kind = 'system';
-- ---------------------------------------------------------------------------
