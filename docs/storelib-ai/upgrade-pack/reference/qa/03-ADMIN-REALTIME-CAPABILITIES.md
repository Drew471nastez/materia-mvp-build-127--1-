# Owner /admin capability dashboard — reliable, not performative

Expose real read-only technical state + admin-safe repair workflows. Main index answers: what commerce, theme, editor, data and agent features exist; which are wired and tested; which have broken linkage or disabled provider.

Each tile: capability name, internal schema/API/UI implementation status, tenant flag readiness, last test result and timestamp, dependency chain, last deployment hash/commit, severity, link to exact test/log, remediation action. Distinguish `unknown` from `unimplemented`, and feature `off` from `broken`. Do not show fabricated green 100%.

## Sections
- **Builder:** parser, sections, blocks, global templates, responsive controls, custom components, dynamic bindings, asset packaging, import/export, publish parity.
- **AI:** input/vision, planner, context memory, scopes, schema generation, iteration, auto-repair, tool execution, token/latency, quality pass coverage.
- **Catalog:** product/variant/collection, search, media, inventory/stock, data integrity.
- **Physical:** location, shipping profile, zone/rate, fulfillment, discounts/taxes, order lifecycle.
- **Digital:** entitlements/downloads/courses/subscriptions/service bookings and real enabled services.
- **Payments:** provider connection status, live versus sandbox, webhook processing, checkout activation (display only, never secret keys).
- **Publishing:** theme draft, CDN, route parity, sitemap, dynamic page loading, asset accessibility.

## Implementation
Real health probes read actual database/API/worker state; scheduled smoke tests and release checks produce artifacts. Security and permission-gate all reports; redact secret tokens and customer financial data. Test buttons perform real tests with status and logs. No pretend simulation that writes to live orders. Admin API reflects source of truth.
