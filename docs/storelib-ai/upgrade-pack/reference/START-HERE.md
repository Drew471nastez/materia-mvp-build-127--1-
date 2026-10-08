# Storelib Universal AI Builder — Architecture & implementation pack v2

**This is one package for an AI coding agent to integrate into the existing Storelib repository.** Not just sneaker shops: digital-products platforms, subscriptions, courses, single-product funnels, full physical e-commerce, coach sites, portfolio/agency sites, software landing pages, editorial sites, blogs, membership portals, dashboards, interactive mini-apps and any viable custom website requested.

## START HERE
1. Give this ZIP to Claude Code with access to the **real Storelib repo** and the Storelib developer docs. Paste the instruction in `CLAUDE-BUILD-INSTRUCTION.md`.
2. Claude must read `implementation/00-DISCOVERY-FIRST.md` and create a current, evidence-backed capability map. It should NOT blindly claim features are implemented.
3. Treat `runtime/`? No. Actual runtime AI instructions live in `agent/` and are to be **wired into the customer-facing Storelib AI**, not just loaded into Claude Code.
4. Follow `implementation/01-EXECUTION-ROADMAP.md` through all phases and use `qa/` gates; do not stop at mockups.
5. Run `python3 tools/check_site_plan.py examples/*.plan.json` to validate the **illustrative plans**. Production validation also requires actual Storelib tests, theme compiler, end-to-end browser checks, commerce simulations and visual comparisons.

## Critical principles
- Arbitrary design freedom with governed execution. Allow custom visual components, layouts, animations, complex interactions, custom navigation/search/cart UX; keep **real** Storelib data and trusted commerce actions via platform adapters. Never bypass checkout, security, permissions, money or schema integrity.
- Intent-aware editing: 'change FAQ' modifies FAQ only; 'rebuild FAQ completely' replaces the FAQ implementation; 'remake whole website' is site-wide. Preserve unrelated customizations, stable content/data links and version history.
- Responsive complete websites, not 3 generic boxes. But *site size follows the brief*: a one-page landing may be one page; a full apparel brand usually deserves multiple routes and rich templates, with real data and editable sections.
- Two different verifications before release: structural/functional checks and visual/interaction review on multiple viewports. A failing check means repair or an explicit blocker—never a false 'done'.
- The attached documents are **a detailed blueprint/specification, not a completed code patch to Storelib**. No access to your Storelib source code, databases or running app was supplied to build this ZIP, so no Storelib production functionality can be audited or truthfully declared completed here.

## Navigation
- `CLAUDE-BUILD-INSTRUCTION.md` — copy/paste agent instruction
- `implementation/` — discovery, phased build, evidence reporting, parity matrix
- `architecture/` — agent architecture, reusable IR, project memory, capabilities, runtime, custom code policy
- `framework/` — section system, settings, navigation, dynamic data and pages
- `commerce/` — physical, digital, cart, checkout, shipping, subscriptions etc.
- `design/` — design principles, screenshots, motion, all categories, asset and image guidance
- `agent/` — generation and editing semantics; existing v1 guidance retained
- `admin/` — operator dashboard and audits
- `qa/` — validation, scenarios, visual and commerce testing
- `examples/` — real example site-plan JSON fixtures (examples, not executable Storelib themes)
- `sources/` — Shopify, public design skills, Lovable/Bolt links and licensing guidance
- `tools/` — offline plan checker and optional public skill downloader

## Build delivery definition
Your Claude implementation must **modify product code**, integrate user-facing AI backend and frontend, add tests and capability introspection, provide migrations when necessary, show a truthful readiness scorecard with failing/blocked cases, and retain previews+rollbacks. It cannot claim 100% until the actual repo and E2E tests prove it.
