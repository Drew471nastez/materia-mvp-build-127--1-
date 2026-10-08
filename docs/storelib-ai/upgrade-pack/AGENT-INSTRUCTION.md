# For coding agents changing Storelib's AI builder

Paste this, with this folder, into Claude Code, Codex or Cursor working in this repository. It replaces `reference/CLAUDE-BUILD-INSTRUCTION.md`, which was written without the code.

1. Read `CLAUDE.md` first and follow it. It is the owner's, verbatim.
2. Read `docs/storelib-ai/capability-inventory.md`. Do not rebuild what is marked verified or present. Work from "Not met yet" and the missing commerce rows, in that order unless the owner says otherwise.
3. The product's AI runs on OpenAI. Change its behaviour in `lib/website-builder/agent/` and `lib/storelib-ai/`, never by adding a second provider or a longer prompt. A rule that applies to every request goes in `lib/storelib-ai/` (it is cached); one that applies to some requests is a topic in `knowledge.ts` with triggers, or a skill in `lib/agent-skills`.
4. Every rule told to the model is also checked in code (`quality.ts`, `integration.ts`, `project-check.ts`, `page-ops.ts`). A rule that is only said is followed about half the time.
5. A section is `.storelib`: `<template>`, `<style>`, `<script>`, `<schema>`, each tag on its own line. Never Liquid, never JSX. `<template>` inside a section is not allowed: it is the file's delimiter.
6. Platform data and actions are bound, never typed: products, prices, stock, shipping, the menu, the logo, the cart and checkout. A custom design may draw any of them; none may be faked.
7. Never write the page the creator has open from the server: the editor saves its own copy over it. Other pages are drafts, backed up first (`page-builder-server.ts`).
8. Prove it: `pnpm build` (with the placeholder env in `CLAUDE.md`), `npm run test:push`, and a `scripts/check-*.mjs` probe in Chromium for anything about behaviour, geometry or motion. Compare the suite's failures with `main`'s; report the numbers.
9. `pnpm` only. SQL goes in `supabase/sql/RUN_*.sql`, guarded so it can run twice, with a `CHECK_*.sql` beside it. Test it on a local Postgres when one is available.
10. Report what is done with evidence, and what is not, in plain words. Never "100%".
