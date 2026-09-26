-- ===========================================================================
--  ASK STORELIB KEEPS THE PICTURES IN A CONVERSATION FOR THIRTY DAYS
-- ===========================================================================
-- A creator attaches a screenshot and says "build this". The chat shows the
-- picture while they are there, and it should show it again after a reload
-- and when the conversation is opened from the history. For that the bytes
-- are kept in a private bucket and each message names its pictures in a
-- table. Both were only ever in sql/20260924_theme_chat_attachments.sql,
-- which is not one of the parts in supabase/sql/run-now, so on a database
-- built from the parts every picture was dropped on the way in and the chat
-- read back "[an image attached]" and nothing else.
--
-- The same objects as that file, in the one statement per line shape of the
-- parts (supabase/sql/run-now/34_theme_chat_attachments.sql), with one
-- change: rows are READ ONLY for a browser. The older file's policy allowed
-- every command, which would let a creator's own client write a row naming
-- any storage path; the server signs only paths under the install it has
-- proved is theirs either way (lib/website-builder/agent/attachment-store.ts),
-- and now no client can write a row at all.
--
-- PRIVATE. The bucket has no storage policy: the bytes are reached only
-- through a signed URL the server mints after checking ownership, and they go
-- after thirty days (app/api/cron/purge-chat-attachments). Idempotent. Needs
-- theme_chat_messages (run-now part 24).

/* The private bucket: pictures only, 3MB each at most (the composer sends a
   few hundred kilobytes). A second run keeps it private. */
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('theme-chat-attachments', 'theme-chat-attachments', false, 3145728, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']) ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 3145728, allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/* One row per picture: which message it was attached to, where its bytes are
   ('<install_id>/<uuid>.<ext>'), and when it goes. */
CREATE TABLE IF NOT EXISTS public.theme_chat_attachments ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), install_id uuid NOT NULL REFERENCES public.store_theme_installs(id) ON DELETE CASCADE, message_id uuid REFERENCES public.theme_chat_messages(id) ON DELETE CASCADE, storage_path text NOT NULL, media_type text NOT NULL, byte_size integer NOT NULL DEFAULT 0, name text, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days') );

/* A conversation's pictures are read by message; the collector reads by date;
   deleting every chat on a website reads by install. */
CREATE INDEX IF NOT EXISTS theme_chat_attachments_message_idx ON public.theme_chat_attachments (message_id);
CREATE INDEX IF NOT EXISTS theme_chat_attachments_expiry_idx ON public.theme_chat_attachments (expires_at);
CREATE INDEX IF NOT EXISTS theme_chat_attachments_install_idx ON public.theme_chat_attachments (install_id);

/* Readable by the creator who owns the website, through the same ownership
   chain every theme table uses, and writable by no client: the agent route
   writes with the service role after proving ownership. */
ALTER TABLE public.theme_chat_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tca_own ON public.theme_chat_attachments;
DROP POLICY IF EXISTS tca_own_read ON public.theme_chat_attachments;
CREATE POLICY tca_own_read ON public.theme_chat_attachments FOR SELECT USING (install_id IN (SELECT i.id FROM public.store_theme_installs i JOIN public.creators c ON c.id = i.creator_id WHERE c.user_id = auth.uid()));
