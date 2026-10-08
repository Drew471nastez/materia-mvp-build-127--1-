# Incremental implementation roadmap — working product, not presentation

**P0 foundations:** Repo reconnaissance, reproducible tests, feature registry, compiler contract and safe rollback/migration. Create a sample store and fixtures for physical/digital/coach/app. Define baseline regressions and metrics.

**P1 Universal AI orchestrator:** Build intent router + site classifier + project model + durable memory + plan validation + bounded tool-calling with typed tool outputs and granular change scopes. Remove brittle one-size-fits-all aesthetic rules, *not* safety or schema checks. Connect actual runtime requests. Add real streaming progress, resumable jobs/idempotency, retry and cancellation.

**P2 Rendering/editor platform:** Implement composable templates, configurable blocks/sections, arbitrary layout containers, component registry, custom global layout, user-designed header/footer/nav, responsive overrides, animation support, asset pipeline and dynamic binding inspector. Generate new editable components from user intent, not only editing preinstalled sections. Add safe custom-code extension execution if theme DSL cannot express interaction.

**P3 Commerce completeness:** Share typed product/variant/collection/pricing/inventory/cart/checkout abstractions between editor and runtime; connect order and delivery systems, shipping zones/profiles/origins/locations, accurate supported rates and enabled states; wire coupons and tax flows if existing engine supports; otherwise surface explicit blocked data/action. Add verified admin forms and validation, no mock 'save' actions.

**P4 Content and webapps:** Fully support digital products, courses, memberships and services plus creator/coach, SaaS and general website modes. Enable authenticated pages and rich interactive app flows with data permissions and security boundaries. E-commerce UI features appear only on relevant sites.

**P5 Visual quality:** Design skill retrieval, prompt-aware visual director, image acquisition policy, font/spacing/motion tokens, screenshot attachment analysis, computer-vision comparison where tooling exists, use browser captures and fix.

**P6 Admin / docs / migration:** Ship capability index, lifecycle dashboard, QA logs and records; make docs source-of-truth and updated via tests. Add migration fixtures preserving all existing tenant sites and a staged rollout/feature flag.

**P7 Hardening/release:** Run unit, schema, integration, visual, security, performance, accessibility and E2E tests on representative sites. Two independent QA passes; publish only after gates. Any unsupported phase remains listed as a blocker, not a success.

Each P-phase: implement code → tests → integration → browser verify → docs → prove results. Do not tick boxes based on written prompts alone.
