# Discovery audit — no unsupported assumptions

Search the real repo before coding. Create `docs/storelib/capability-inventory.md` **with evidence for every claim**. Do NOT infer implementation from menu labels, screenshots or migration names alone. Mark one of `verified`, `partial`, `missing`, `disabled`, `unknown`, `blocked` with evidence, test command, owner and next action.

Inspect these real modules by function (file names illustrative only):
- AI message intake, image upload/vision inputs, agent tool definitions, prompts, model providers, context limits, tool traces, project memory, rate limits, cancellation and progress streaming.
- Theme parser/AST, `.storelib` grammar, schema, default templates, sections, blocks, global/layout areas, CSS/JS bundles, validator, assets/manifest, compiler, preview and published renderer, CDN, per-store isolation.
- Drag/drop section editor, per-setting UI, binding picker, responsive overrides, image picker, import/export, live preview, menus, pages/routes, icons, fonts, theme settings, search and mobile editor.
- Store/merchant entities, catalogs, dynamic products, variants, media, collections, inventory, markets/currencies, discounts, taxes, shipping zones/profiles/rates/origin/locations, POD/3PL/fulfillment, cart vs buy-now, checkout, orders, refunds/disputes, payment enabled state, transaction logs.
- Digital products, file access/entitlements, downloads, memberships, courses, services/appointments, OnePage, creator profiles, custom domains, analytics, email subscriptions, auth and permissions.
- Real database migrations, policies/RLS, server/client API schemas, jobs/events, tenancy boundaries, tests and E2E automation.
- How missing features fail when the AI asks for them and whether UI messages accurately indicate blocked.

For every existing validator identify its exact rules, why it exists and how to extend allowed capabilities without disabling protection. Include past known theme failure classes as regression tests: unclosed template, bad punctuation/parentheses, undeclared settings, missing asset in manifest, bad theme file path, invalid section type in a template, CSS stylesheet size violation, hidden text color on button background, non-matching preview and publish.

End this phase with a table: `feature | status | exact files/functions | evidence/test | UI state | integration edges | gap | migration | priority`. Implement no sweeping rewrite until you know these facts.
