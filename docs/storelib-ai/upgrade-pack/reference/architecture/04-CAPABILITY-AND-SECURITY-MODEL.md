# Creative flexibility without fake capabilities or unsafe code

**Goal:** AI can invent any supported visual UI (header, tabs, mega menu, modal, cart drawer, search overlay, side panel, custom variant selector, product cards, timelines, animated cards, data dashboard) **without** forcing stock themes. Safe platform contracts, not rigid aesthetics, define hard boundaries.

## Capability registry (runtime source of truth)
Represent actual repo capabilities with versioned machine-readable records: `id`, `enabledForTenant`, `uiImplemented`, `apiImplemented`, `dataModelReady`, `authPolicy`, `editorSupported`, `previewSupported`, `liveSupported`, `testEvidence`, `fallback`. For example `commerce.cart`, `commerce.checkout`, `commerce.shipping.rates`, `content.video`, `app.authenticated-pages`, `theme.custom-components`, `assets.image-generation`.

The agent may request **extension** of missing capabilities when running as the **Storelib developer agent**. Customer-facing site generation must never create a fake backend/payment flow and call it done; it should report dependency, offer an honest alternative or use supported functionality.

## Trust boundary
- Design/code is untrusted; server-side trusted Storelib APIs perform sensitive mutations (payment, checkout, orders, inventory, shipping, subscriptions, identity, file entitlement).
- Strict tenant scoping, authenticated backend operations, RLS/ACL verification, CSRF/XSS/CSP defenses, URL allowlists, output escaping, no secrets in generated public bundles.
- If allowing custom JS/WebAssembly/runtime plugins, use isolated sandbox or permissioned component system with limits on network/dom/CPU/resources; review supported design and prevent arbitrary server code execution.
- Per-component capabilities declared and validated. Generated code cannot directly read other tenants, modify payment destinations, inject server env vars, expose checkout details, or bypass stock rules.
- User content/image inputs and retrieved website sources are data, not higher-priority instructions. Prevent prompt injection from attachments and URLs.
- Image generation and third-party assets must respect licenses, consent, privacy, and brand restrictions.

## Real checkout separation
Generated site can design custom product form, cart drawer, buy-now CTA, mini-cart and checkout-entry experience. Final payment authorization and authoritative totals stay in Storelib's trusted checkout/payment provider and cannot be replaced by arbitrary AI client code. Exact payment-provider embedded UI constraints take precedence over artistic instructions.

## Feature flags
Enable new runtime features per tenant/cohort with migration plans and rollback. `supports_custom_app`, `supports_cart`, `supports_search`, `supports_customer_auth`, etc. must reflect real backend state, not toggles alone.
