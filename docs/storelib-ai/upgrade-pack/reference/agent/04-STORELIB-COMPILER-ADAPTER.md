# Integrate with REAL Storelib (not pretend React or Liquid is Storelib)

## Discover the existing contract

In the repository find actual declarations and fixtures for: `.storelib` section format; allowed template/style/script/schema structure; block schemas; page templates and routing; setting names; translations; asset manifest; stylesheet limits; supported data sources; dynamic collections/product context; ecommerce toggles; preview engine; publish engine; validation errors. Record the actual APIs and limits. **The JSON examples in this pack are an intermediate planning schema only.**

## The critical boundary

AI models naturally output JSX, Tailwind or Shopify Liquid unless given hard constraints. Insert a trusted **Storelib adapter/compiler** between the SitePlan and theme output. Prefer validated structured AST / tooling over raw text-only generation. Reuse real section serialization routines; don't create parallel parsers that disagree with preview/publish.

## Implementation architecture

```text
Customer prompt
  -> intent classifier + project context loader
  -> website planner (SitePlan JSON + validator)
  -> art direction + design tokens
  -> page/section planner
  -> existing Storelib theme compiler and schema-safe generators
  -> route, ecommerce, asset and manifest resolver
  -> parser/schema/CSS checks
  -> preview & image capture
  -> UX + visual critique + targeted repair
  -> draft persistence / optional publish
```

## Schema safety

Every referenced section type must exist; section settings must reference declared IDs only; all template tags must close; braces and parentheses must parse; every manifest asset exists in package; no unsupported remote assets; hard stylesheet limits respected by extracting shared CSS or splitting appropriately; no private URLs embedded. Validate render and published forms against the same contracts.

## What to preserve

Keep existing users/themes/routes/data untouched unless their project is explicitly being modified. Existing ecommerce subsystem remains source of truth for product, variants, inventory, pricing and checkout. Preserve auth/payment/security checks. Never rewrite core data to fit a pretty template. Use progressive enhancement and migrations only when required, with rollback.

## AI agent retrieval (implementation requirement)

Store this pack's runtime policies in project-local versioned files or datastore, then implement knowledge retrieval/selection per request:
- Always: Storelib compiler rules + `01-AGENT-BEHAVIOR` + minimal current page/project context.
- New full site: `02-PLANNING-PIPELINE` + `03-VISUAL-STANDARDS`.
- Ecommerce: `05-ECOMMERCE` and actual enabled feature map.
- Fix/redesign: constraints from existing theme and relevant QA rules.
- Optional retrieved UI design skill references: only pertinent excerpts or tool outputs; do not stuff complete CSV databases into every context window.

Consider system prompt token budget, model/tool calls, cache keys, versioning, explicit schema validation, retries and traceable per-stage logs.

## Future feature gates

Feature flag the upgraded builder, version its prompt policy and structured schema; retain fallback to current builder; measure generation success, number of corrective loops, user acceptance and preview/publish mismatches. Build error feedback into a safe iterative fix instead of displaying raw compiler failures only.
