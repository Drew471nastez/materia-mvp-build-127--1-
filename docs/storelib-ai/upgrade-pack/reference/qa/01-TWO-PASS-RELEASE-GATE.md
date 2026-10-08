# Mandatory two-pass QA and repair

Verification must be actual execution results. Never substitute 'looks fine to the model' for tests. A site is **ready** only if critical functional and visual checks pass, all advertised dynamic features supported, and the output is publishable using the actual Storelib runtime.

## PASS A — structural, integration, functional
- Current Storelib grammar parses/compiles; no unclosed tags, unexpected tokens, unknown settings names, missing template/section types, invalid asset paths, missing manifests, unsupported CSS/JS syntax or over-size stylesheets.
- Every page route exists; site nav and CTA links point somewhere valid. Dynamic templates resolve product/collection instances. SEO page titles and canonical paths exist where supported.
- Component schema ↔ renderer ↔ controls ↔ stored settings round-trip; all responsive overrides persist.
- Store identity, products, collection images, prices, variants, inventory, cart, delivery, checkout, orders and digital entitlements are real and authorized.
- Commerce feature toggles, disabled payment and missing dependencies produce truthful UI. Cart/checkout use server prices and idempotent order actions.
- Security: tenant isolation, no leaked secrets, injection/XSS protection, file upload constraints, side effect permission; no network or server arbitrary code unauthorized.
- Tests: static/types/unit/integration/E2E/publish-preview parity; no regressions in existing stores.

## PASS B — real visual + interaction
- Capture desktop/tablet/mobile every key template; compare reference at matching viewport when provided.
- No clipped/truncated content, overflow, weak hierarchy, unreadable text, fake generic hero, image distortion, animation jank, overlapping fixed UI, missing focus/hover states, broken touch/keyboard interactions.
- Visually coherent design tokens across 7+ sections or full site, yet meaningful composition variation; appropriate density for vertical; real image direction and contextual copy.
- Observe app interactions: menu/drawer/search/sort/cart/select variant/signup/FAQ, modal scroll restoration, hover/tap, performance and reduced motion. Use screenshot diff thresholds on deterministic fixtures where feasible.

## Automatic repair
Errors become structured issues with file/component/page ID, severity, repro, expected/actual, repair suggestion. Agent applies smallest valid patch, reruns affected suite then full critical suite. Limit retries transparently; no infinite tool loops. A failing high-severity gate blocks publish. Report untested areas rather than silently skipping.

## Test report sample
```
Generation: draft_id, commit, site_type, pages_generated, components_changed
A: syntax PASS; schema PASS; assets PASS; data bindings FAIL (cart API missing)
B: 375px PASS; 768px PASS; 1440px PASS; motion PASS; reference image N/A
Status: NOT READY — checkout end-to-end blocked by missing cart backend
```
