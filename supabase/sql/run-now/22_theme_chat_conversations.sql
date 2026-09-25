/* Ask Storelib conversations: new chat and history. Each message belongs to a conversation on its own website, read only by the creator who owns it. Creates the chat table too if it is missing. Needs nothing else. */
CREATE TABLE IF NOT EXISTS public.theme_chat_messages ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), install_id uuid NOT NULL REFERENCES public.store_theme_installs(id) ON DELETE CASCADE, page_key text NOT NULL DEFAULT 'home', role text NOT NULL CHECK (role IN ('user', 'assistant')), content text NOT NULL DEFAULT '', ops jsonb NOT NULL DEFAULT '[]', error text, created_at timestamptz NOT NULL DEFAULT now() );
CREATE INDEX IF NOT EXISTS theme_chat_messages_install_idx ON public.theme_chat_messages (install_id, created_at);
ALTER TABLE public.theme_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.theme_chat_conversations ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), install_id uuid NOT NULL REFERENCES public.store_theme_installs(id) ON DELETE CASCADE, title text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now() );
CREATE INDEX IF NOT EXISTS theme_chat_conversations_install_idx ON public.theme_chat_conversations (install_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS theme_chat_conversations_id_install ON public.theme_chat_conversations (id, install_id);
ALTER TABLE public.theme_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theme_chat_messages ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE public.theme_chat_messages DROP CONSTRAINT IF EXISTS theme_chat_messages_conversation_fk;
ALTER TABLE public.theme_chat_messages ADD CONSTRAINT theme_chat_messages_conversation_fk FOREIGN KEY (conversation_id, install_id) REFERENCES public.theme_chat_conversations (id, install_id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS theme_chat_messages_conversation_idx ON public.theme_chat_messages (conversation_id, created_at);
DROP POLICY IF EXISTS tcc_own_read ON public.theme_chat_conversations;
CREATE POLICY tcc_own_read ON public.theme_chat_conversations FOR SELECT USING (install_id IN (SELECT i.id FROM public.store_theme_installs i JOIN public.creators c ON c.id = i.creator_id WHERE c.user_id = auth.uid()));
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'theme_chat_messages' AND policyname = 'tcm_own') THEN CREATE POLICY tcm_own ON public.theme_chat_messages USING (install_id IN (SELECT i.id FROM public.store_theme_installs i JOIN public.creators c ON c.id = i.creator_id WHERE c.user_id = auth.uid())) WITH CHECK (install_id IN (SELECT i.id FROM public.store_theme_installs i JOIN public.creators c ON c.id = i.creator_id WHERE c.user_id = auth.uid())); END IF; END $$;
