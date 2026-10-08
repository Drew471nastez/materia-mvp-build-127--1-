# SitePlan → ThemeAST/ComponentGraph → Storelib output

Develop a versioned **intermediate representation (IR)** for projects. **Example fields below are proposals, not the current Storelib DSL.** Map into the verified existing compiler, extending it safely where necessary.

Entities:
- `Project`: `id`, `type`, `mode`, locales, brandProfile, designSystem, requiredRoutes, featureFlags, userConstraints, dependencies, version.
- `Page`: `id`, route matcher/path, purpose, `kind` (static, dynamic template, protected, app view), metadata, layout component IDs, sections, data queries.
- `Section`: stable ID, component definition/ref, section schema, blocks, bindings, custom styles, animations, responsive rules, lifecycle.
- `Component`: ID, visual variant, typed props/settings, slots/nested blocks, interaction handlers, runtime capabilities, scoped code, states.
- `Binding`: source path/entity, field schema, null/loading/error state, fallback policy, reactive dependencies, locale/currency, tenant context.
- `Action`: trusted command such as open/close, select variant, add to cart, checkout, subscribe, login, search, form submit; distinct from arbitrary side effects.
- `Asset`: ID, manifest path, declared license/ownership, dimensions/type, alt/crop variants, optimization, responsive sizes.
- `ThemeConfig`: accessible color schemes, typography tokens, motion/easing tokens, spacing, border, breakpoints, page width.
- `ChangeSet`: scope, targeted stable IDs, before/after snapshots, migrations, verification results, rollback reference.

## Example IR snippet (illustrative only)
```json
{
  "project": {"type":"commerce-physical","name":"Sample", "capabilities":["catalog","cart"]},
  "pages": [{"route":"/products/:slug","kind":"product_template","sections":[{"component":"product-editorial","bindings":{"product":"storelib.products.current"},"settingsRef":"prodA"}]}],
  "actions": [{"id":"add-to-cart","kind":"platform_action","handler":"cart.add","payload":{"variant":"selectedVariant","quantity":"quantity"}}]
}
```

**Dynamic data source paths here are abstract placeholders**, not a claim that Storelib has API endpoints with these exact names. Maintain a registry to translate them into verified repo APIs. Validate from DB/API schemas automatically where possible.

## Compilation guarantees
- Unique IDs, valid references, route resolution and missing-route detection (including dynamic routes).
- Schema-defined settings with types/validation/defaults; save/load fidelity and no orphan settings.
- Theme AST outputs legal `.storelib` grammar with closed tags, permitted attributes, valid CSS/JS, correct dependency map and manifest.
- Per-page and per-section CSS isolation, reasonable bundle size/complexity; break large CSS into supported assets; no global collisions.
- Preview and live use the same render contract and bindings; differences are explicit state/test fixtures, not alternate codepaths.
- Serialized components round-trip through the visual editor without silently losing settings, code, nested blocks or responsive styling.

Use type-safe migrations when IR/schema updates occur. Never store user-generated JavaScript as executable server code without a security design.
