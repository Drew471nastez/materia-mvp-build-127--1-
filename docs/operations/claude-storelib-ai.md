# Claude in Ask Storelib

Claude runs the same coding agent as OpenAI: section code, page changes,
tool calls, image references, schema validation, drafts and saved chat history.
Choose a model in the composer of the Ask Storelib modal. The model menu reads
Anthropic's Models API and shows the models available to the account, including
newer Sonnet, Opus, Haiku and other releases when the account has access.

## Vercel setup

In the Storelib project, open Settings → Environment Variables. Add these to
Production, and to Preview if preview deployments should use the same account:

| Variable | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | An API key created in the Anthropic Console workspace holding your API credits. Enter it securely in Vercel. |
| `AGENT_PROVIDER` | `anthropic` |

Redeploy after saving the variables. Keep `OPENAI_API_KEY` if OpenAI should
remain an option. Neither key may have a `NEXT_PUBLIC_` prefix.

Optional tier overrides are `ANTHROPIC_AGENT_MODEL` (default
`claude-sonnet-5`) and `ANTHROPIC_AGENT_STRONG_MODEL` (default
`claude-opus-5`). Use exact model IDs available to your API account. An exact
model chosen from the live menu takes priority over the tier defaults.

Anthropic Console API credits fund these requests. A Claude chat subscription
does not supply API credit. Model discovery does not generate tokens. Prompt
caching is requested by the API adapter; there is no separate Vercel variable
to enable it. Anthropic's usage dashboard remains the billing source of truth,
especially for newly released models whose rates are not in Storelib's table.

## Personal connections

Connect AI → Connections also accepts a creator's own Claude API key. It is
validated, stored encrypted using the existing personal-key infrastructure,
and used only for that creator's Claude requests. These runs do not consume
the plan's included AI edits. A refused personal key does not silently charge
Storelib's account. This optional feature uses the existing
`supabase/sql/run-now/37_own_ai_keys.sql` table and `AI_KEYS_SECRET`
configuration; the platform-key setup above does not require a new migration.

## Verify after deployment

Open Ask Storelib, choose a listed Claude model, and ask for a small draft
change. Confirm that the preview changes, the draft saves, and the conversation
reopens correctly. In Code section mode, ask for a section and verify its
schema controls. Check the request and cache usage in Anthropic Console.
The API key must stay exclusively on the server.
