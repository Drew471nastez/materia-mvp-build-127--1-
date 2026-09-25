/* Ask Storelib reports: one row per answer a creator flags from the chat, with the question and the reply as they were, so a report can still be read after the conversation is deleted. Written by the server only (app/api/website-builder/themes/[installId]/chat/report), after it proves the creator owns the website. The same statements as supabase/sql/run-now/XX_theme_chat_reports.sql. Safe to run twice. */
CREATE TABLE IF NOT EXISTS public.theme_chat_reports ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), install_id uuid NOT NULL REFERENCES public.store_theme_installs(id) ON DELETE CASCADE, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, conversation_id uuid, message_id uuid NOT NULL, reply_message_id uuid, reason text, prompt text NOT NULL DEFAULT '', reply text NOT NULL DEFAULT '', engine text, created_at timestamptz NOT NULL DEFAULT now() );

/* One report per question: reporting it again replaces the reason (the route upserts on message_id). */
CREATE UNIQUE INDEX IF NOT EXISTS theme_chat_reports_message ON public.theme_chat_reports (message_id);

/* Newest first, for whoever reads them. */
CREATE INDEX IF NOT EXISTS theme_chat_reports_created_idx ON public.theme_chat_reports (created_at DESC);

/* Server only: row level security on and no policy, so no browser can read or write a report. */
ALTER TABLE public.theme_chat_reports ENABLE ROW LEVEL SECURITY;

/* A reason is a sentence. Checked on new rows only (NOT VALID). */
ALTER TABLE public.theme_chat_reports DROP CONSTRAINT IF EXISTS theme_chat_reports_reason_length;
ALTER TABLE public.theme_chat_reports ADD CONSTRAINT theme_chat_reports_reason_length CHECK (reason IS NULL OR char_length(reason) <= 500) NOT VALID;
