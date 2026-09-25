/* Ask Storelib reports: one row per answer a creator flags, with the question and reply as they were. Written by the server only; no browser can read or write it. Needs nothing else. Source: supabase/migrations/20261003_theme_chat_reports.sql. */
CREATE TABLE IF NOT EXISTS public.theme_chat_reports ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), install_id uuid NOT NULL REFERENCES public.store_theme_installs(id) ON DELETE CASCADE, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, conversation_id uuid, message_id uuid NOT NULL, reply_message_id uuid, reason text, prompt text NOT NULL DEFAULT '', reply text NOT NULL DEFAULT '', engine text, created_at timestamptz NOT NULL DEFAULT now() );
CREATE UNIQUE INDEX IF NOT EXISTS theme_chat_reports_message ON public.theme_chat_reports (message_id);
CREATE INDEX IF NOT EXISTS theme_chat_reports_created_idx ON public.theme_chat_reports (created_at DESC);
ALTER TABLE public.theme_chat_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theme_chat_reports DROP CONSTRAINT IF EXISTS theme_chat_reports_reason_length;
ALTER TABLE public.theme_chat_reports ADD CONSTRAINT theme_chat_reports_reason_length CHECK (reason IS NULL OR char_length(reason) <= 500) NOT VALID;
