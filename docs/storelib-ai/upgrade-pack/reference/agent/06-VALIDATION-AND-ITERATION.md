# Build → verify → inspect → improve

## Hard failures (must fix before success)

- SitePlan invalid or includes routes/section identifiers that collide.
- Theme parser/compiler rejects tags, identifiers or settings.
- Template references missing sections; missing assets/manifest entries; stylesheet exceeds known limits.
- Internal navigation contains broken destinations; CTA has no valid action; asset URL unusable.
- Checkout is visible as active while not configured, or claims an unavailable capability.
- Product/collection route cannot bind to current Storelib data model.
- Existing Storelib core tests regress, or preview/published output diverges.

## Quality scores (0–5 each)

1. Brand differentiation (not a generic shell).
2. Information architecture (right pages, no filler).
3. Design consistency (tokens, header, footer, images).
4. Visual hierarchy (hero, rhythm, section purpose).
5. Mobile usability (not simply scaled desktop).
6. Authenticity of content/data (no fake claims or assets).
7. Functional completeness (links, navigation, forms, commerce).
8. Customizability (editable sections + settings).
9. Accessibility and performance.
10. Preview/publish consistency.

Target >= 4 for qualitative dimensions, zero hard failures. Scores must reflect actual evidence, not self-congratulation. When images aren't viewable, mark visual measures unverified.

## Browser QA where available

Capture home, catalog, product and one support route at 375 / 768 / 1440 CSS-pixel widths. Observe header, menu, product grid, variant selector, buy button, footer and sticky interactions. Try keyboard focus, menu open/close, mobile scroll and focus preservation. Where screenshot comparison is possible, use image-aware model critique and repair offending sections. No false claim that a screenshot was inspected.

## Per-stage checks

Planner → JSON schema validation; Compiler → real Storelib theme validator; Build → assets and manifest; Runtime → reachable routes and data; UI → visual responsiveness; Release → no known hard failures. Log precise compiler errors and auto-fix the smallest affected section (bounded retries).

## Reports

Return new/modified pages, design direction, reusable settings, verified functionality, unsupported capabilities, tests performed, scores with evidence, and any blockers. Never say "100% working" without runtime tests.
