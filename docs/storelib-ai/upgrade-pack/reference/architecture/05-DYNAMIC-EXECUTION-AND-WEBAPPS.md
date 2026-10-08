# Websites AND real interactive webapps

Treat "build a website" and "build a webapp" as different execution profiles.

### Static/marketing websites
Rich interactions (accordion, animations, mega menu, smooth modal, contact CTA, filtered FAQs, tabs) can run client-side without a DB. Forms require a real capture endpoint or plainly labeled draft mode.

### Commerce site
Storelib catalog/media/variant/cart/checkout/account/entitlement adapters; backend owns trust. UX can be completely original, not fixed UI primitives.

### Data-driven webapp
Dashboard, authenticated membership area, calendar/scheduler, client portal, course platform, membership feed, analytics UI, quote tool, configurator: plan pages, components, state machine, CRUD models, permissions, validation, API actions, loading/empty/error states, tests and persistence. New backend primitives must be implemented by the platform developer agent and reviewed; customer-facing generation can use allowed managed collections/endpoints only.

### App runtime modes to consider after repo audit
- Storelib-native interactive section DSL: safest for standard page interactions.
- Declarative action/state graph: bind modal open, tabs, accordion, filter, cart, product variant, form states.
- Sandboxed custom component extension (e.g. isolated iframe/worker with documented messaging): for arbitrary UI code where available, with accessible rich UI and narrow permission API.
- Separate compiled app route bundle behind strict tenant boundary and explicit publish action: for true webapps needing protected data or workflows.

Never assume React/Vue or direct HTML/JS compilation is already supported by `.storelib`. Add controlled extensibility only after finding the parser/runtime semantics. Distinguish unsupported request from broken implementation and capture missing capability as a development item.

### Interactions quality
No fake cursor, inert buttons, pretend checkout. Keyboard support, Escape, outside click where appropriate, scroll lock restoration, back/forward history, focus trap/return, reduced motion, touch targets, no overlay flashing, no unexpected body scroll freeze. Test mobile sheet open/close and image-loading transitions.
