-- The questions the agent asked, kept with the message that asked them.
--
-- Without this they live only in the event stream: ask four questions, reload
-- the page before answering, and they are gone — along with any idea that the
-- agent wanted to know anything. The creator is then looking at a site full of
-- invented details and no explanation of which ones were invented.
--
-- Beside `steps` rather than in a table of their own. They belong to exactly
-- one message, they are read only with that message, and they are never
-- queried across messages — which is the shape of a column, not a relation.
alter table public.site_chat_messages
  add column if not exists questions jsonb not null default '[]'::jsonb;

comment on column public.site_chat_messages.questions is
  'What the agent asked the creator during this run: [{id, question, why, suggestions, placeholder}]. Empty when it asked nothing.';
