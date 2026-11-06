# OnePage covers, native actions, forms and variant prices

Header settings now own an optional cover, independently of the account avatar. The saved theme stores the immutable uploaded URL, crop coordinates and zoom; preview and public rendering use the same crop. Existing covers keep their layout until edited. The shared crop loader retries the original image if optimization fails. Removing a new cover restores the preceding Header layout.

Links and visual cards support URL, WhatsApp, email, phone, Storelib product, appointment and form actions. International numbers and messages generate encoded WhatsApp addresses. Existing URL-only blocks remain compatible.

Audience → Forms and quizzes owns reusable definitions and explicit published snapshots. The OnePage block, website section and creator-page section render that same published definition. Editor previews never write submissions. Publish uses optimistic concurrency; a draft does not change the public version. Forms include contact/waitlist/training/project templates, text/contact inputs, single/multiple choices, consent, separate optional marketing opt-in, success messages and completion actions.

Public submissions are bounded and IP rate limited; the server validates against the current published revision, derives ownership and choice labels/scores, removes unknown fields and source URL query/hash, and records consent. A submission UUID deduplicates retries. A changed payload cannot reuse a prior UUID. Private tables have owner RLS and no anonymous direct access. Captured answers and consent are immutable to creator tokens; only status may be updated. Owner Leads supports full answers, statuses, deletion, notifications and a streamed, formula-safe CSV export. Integration outbox flags prepare Google Sheets/webhooks; delivery remains disconnected until configured.

## Required database rollout

Apply additive SQL parts **372** and **373**, available in Admin → SQL updates and the generated SQL bundles. The matching Supabase migrations are `20271123_native_forms_leads.sql` and `20271124_variant_catalog_prices.sql`. No database production credentials were available in this execution environment; local Postgres tests do not apply these migrations remotely. Forms require part 372. Catalogue price reads fall back to public variant rows until part 373 is applied.

The price RPC returns only facts for published, unarchived products and excludes inactive/archived/sold-out variants from advertised prices, including physical inventory at fulfilling locations. A known variant price of zero wins over a paid base; no variants keeps the original base. No stored product prices or historical orders are rewritten. Single options are selected automatically; selectors are hidden. All checkout paths, including mixed physical/digital carts, resolve options on the server before ownership checks and calculate discounts against the selected option. Variant ranges retain both endpoints when currencies change.

## Verification

- `pnpm test:push`: repository regression suites, including native form/action/price tests.
- `PROBE_CSS=source node scripts/check-native-features.mjs`: actual builder save/publish/refresh, form/quiz answers, anonymous submission, Leads and native WhatsApp; 1440/390/320px. APIs are local fixtures.
- `PROBE_CSS=source node scripts/check-onepage-header-cover.mjs`: actual Header upload/replace/remove/crop, optimizer failure, 50% avatar overlap, preview/public parity and refresh at the same widths. Storage is a local fixture.
- `node scripts/check-product-pricing-routes.mjs`: actual price route and marketplace converter with deterministic DB/FX, verifying Free precedence and separate currency contexts.
- `node scripts/check-native-form-routes.mjs`: actual routes with auth/storage boundaries supplied, including consent, antispam, outage, idempotency, notifications and private draft isolation.
- `PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node scripts/check-native-forms-rls.mjs`: execute shipped SQL twice in isolated Postgres; prove owner isolation, no anonymous table access, dedupe/status constraints, private catalogue isolation and physical availability. PGlite can be installed outside the repository.
- `PROBE_CSS=source node scripts/check-onepage-modern-blocks.mjs`: existing layouts and stable Share dialog regression.

Production build verification also needs access to Google Fonts (Inter/Roboto). Browser and route fixtures do not prove production credentials, real provider availability or external integration delivery.
