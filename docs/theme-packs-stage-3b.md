# Stage 3b: Full .storelib-theme packages with custom renderers

## Current state (Stage 3a — shipped)

As of Stage 3a the theme exchange format (`.storelib-export.zip`) carries:

- `manifest.json`
  - `format`: `storelib-theme/v1` | `storelib-theme/v2`
  - `install`, `settings`, `pages`, `image_map` — creator's store content
  - **`theme_pack?`** — optional schema-only overrides
    - `manifest?`: override the ordered `addable_sections`, `structure_sections`, `section_categories`, and `section_order`
    - `sections?`: a map of `{ [section_type]: SectionSchemaJSON }` that **replaces** the built-in schema for that type
- `images/<sha>.<ext>` — deduped CDN images

Runtime wiring lives in `lib/website-builder/section-schemas.ts`:

- `applyThemePack(pack)` layers pack schemas on top of built-in schemas
- `getInstalledThemePack(settings)` reads the reserved `_theme_pack` key stashed by the import route

This is **schema-only customisation**. Creators can rename fields, add select options, change default colours, reorder sections — but they cannot ship a _new visual component_ for an existing `section.type`, and they cannot ship a brand-new section type that doesn't already exist in the built-in registry at `components/website-builder/sections/registry.ts`.

## What Stage 3b needs to add

Creators and agency partners want to package **custom section renderers**: the visual `.tsx` component plus its schema, distributed as a single `.storelib-theme` bundle. This unlocks:

- A fashion brand shipping its own couture `ProductCard` visual alongside the schema
- An agency shipping a white-label "Studio" theme pack for their clients
- The Storelib marketplace (eventually) listing third-party themes for purchase

## The core tension: arbitrary code execution

Shipping a `.tsx` bundle is shipping arbitrary code that runs inside every shopper's browser. Three risks:

1. **Supply chain** — a rogue pack could exfiltrate creator session tokens, redirect checkout to a look-alike, inject crypto-miners into shoppers' browsers, or silently replace the Stripe Publishable Key.
2. **Platform stability** — a pack can throw in the render tree and break the creator's entire storefront. (React Error Boundaries help, but a hot-looping infinite re-render can still pin a CPU.)
3. **Ecosystem lock-in** — if we pick the wrong delivery format we're stuck supporting it forever. Shopify learned this with Liquid.

There are three realistic delivery formats and two deployment postures, giving six options. Below is an analysis of each.

## Delivery formats

### Format A — compiled ES module bundle (`renderers.mjs`)

Ship pre-compiled JS. Pack author runs our CLI (`storelib theme build`) which esbuilds their `.tsx` sources into a single `.mjs`, type-checked against our public renderer API (`{ sections: Record<string, ComponentType<SectionProps>> }`).

**Pros:**
- No Babel/SWC in the browser — just a dynamic `import()` of the bundled module
- Pack author can use any TypeScript/JSX syntax, imports, etc. during dev
- Type contract is enforceable at build time with our published `@storelib/theme-sdk` types

**Cons:**
- Review can't inspect "the original code" — the `.mjs` is minified; two packs with identical source can have byte-different bundles
- Upgrades are painful if we change `SectionProps` — every pack needs a rebuild

### Format B — declarative JSON DSL

Define a subset — `{ tag, props, children }` nodes — that covers the ~95% of section renderers that are "compose divs + images + text from settings". A pack author writes a JSON tree, the engine walks it at render time.

**Pros:**
- No code execution — safest possible format
- Reviewable by diff tools, linting, etc.
- Small

**Cons:**
- ~5% of sections need real logic (carousels with refs, intersection observers, form submission state). These need escape hatches that _are_ code, so we end up back at Format A for those
- DSL is a new surface area to design, document, and version

### Format C — source `.tsx` compiled server-side on first render

Pack ships raw `.tsx`. Our backend SWC-compiles it on install, stores the output, serves the compiled bundle. Equivalent to Format A but we control the compilation.

**Pros:**
- Reviewable source is on disk; compiled output is ours (byte-reproducible)
- We can re-compile every pack in one sweep if `SectionProps` changes

**Cons:**
- Adds a server dependency and a compile-on-install path (more things to break)
- Compile step needs sandboxing itself — a malicious pack can attempt to exploit SWC/TS compiler bugs

## Deployment postures

### Posture 1 — curated marketplace only

All packs go through human review before they can be installed by another creator. Creators can still install their OWN packs without review (single-tenant).

**Pros:**
- Lowest risk. Stripe, Shopify, Apple all use this posture for a reason.
- Review gives us a feedback loop to shape the ecosystem before it calcifies.

**Cons:**
- Slow. A typo-fix pack update can take days.
- Requires staffing reviewers. Throttles ecosystem growth.

### Posture 2 — sandboxed runtime (any pack installable by any creator)

Packs run inside a locked-down iframe or Worker with `postMessage` to the parent. Trusted API surface (render context, product lookups) is messaged in; return-value DOM is messaged back out.

**Pros:**
- Zero-trust at runtime. A hostile pack literally cannot read the creator's cookies.
- No review bottleneck.

**Cons:**
- Rendering across a postMessage boundary is **slow** — every section render is a round-trip. Carousels, hover interactions, and animations are painful.
- Shopper experience degrades: iframes have their own stacking context, scroll containers, focus management issues.
- Implementation complexity is high. The sandbox API itself becomes another version-forever surface.

## Recommendation

**Ship Format A (compiled ES module) + Posture 1 (curated marketplace) for v1.**

Rationale:

1. **Format A over C**: compiling server-side is a lot of operational work for a marginal safety win. We get the same reviewability by having the pack author commit both the source and the compiled artifact; our review process diffs them.
2. **Format A over B**: the DSL is appealing on paper but the 5% of sections that need real code are exactly the "wow" sections creators want to buy — carousels, parallax heroes, 3D product views. Restricting them to a DSL guts the marketplace's value prop.
3. **Posture 1 over 2**: sandboxing is a year of engineering we don't need to do on day one. Curated review is boring and slow but it is known to work, and it lets us learn what creators actually want before locking in a sandbox design.
4. **Posture 2 as a later-stage escape valve**: when curated review becomes a bottleneck (realistically >100 packs/month), we can add a "sandboxed self-serve" tier alongside the curated one. The two models can coexist — the sandbox path gets a visible "unverified" badge, curated packs get "Verified by Storelib".

### Concrete v1 implementation sketch

```
.storelib-theme.zip
├── manifest.json                 # existing (format: "storelib-theme/v3")
├── pack/
│   ├── sdk.json                  # { sdk_version: "1", sections: ["hero","product"] }
│   ├── src/                      # the original .tsx/.ts sources — for review
│   │   ├── HeroSection.tsx
│   │   └── ProductSection.tsx
│   └── dist/
│       └── renderers.mjs         # compiled bundle, exports { sections }
└── images/…
```

Loading flow:

1. `app/api/website-builder/themes/import/route.ts` already validates the manifest via `parseThemePackageManifest`. Extend it to:
   - Reject any `.storelib-theme.zip` with `format: "storelib-theme/v3"` and a `pack/dist/` folder UNLESS the uploading creator is either the pack's author OR the pack has a signed review token (manifest.json `.review_signature`).
   - Upload `renderers.mjs` to a pack-specific Supabase Storage path keyed by the install ID.
2. Client-side: when an install has a `pack/renderers.mjs` URL, the renderer wrapper does `const mod = await import(/* webpackIgnore */ packUrl)` inside a React.lazy boundary. The imported `mod.sections` is merged into the registry at render time — missing keys fall through to built-ins.
3. Fail-safe: every pack component is wrapped in an ErrorBoundary that falls back to a "Section failed to render" card. No pack crash should kill the rest of the page.

### What changes for the review process

The review tool (future admin UI) diffs `pack/src/` against `pack/dist/` by re-compiling `src/` and comparing the output. Any pack where the compiled output doesn't match a deterministic re-compile is flagged for manual inspection — this catches the "source says X, bundle does Y" attack without us needing to fully read the bundle.

## Out of scope for v1

- **Server components in packs** — all pack components are client components until we have a story for running untrusted code on our Vercel functions.
- **Pack-level npm dependencies** — packs bundle everything they need. No `react`/`lucide-react` imports at runtime; those are peer-deps provided by the host.
- **Per-pack CSS imports** — packs style with inline styles or Tailwind class names on the globally-compiled stylesheet. A bring-your-own-stylesheet story is a v2 feature.

## Open questions (revisit before Stage 3b implementation)

1. Where does pack pricing + marketplace billing live? (Likely on top of existing Stripe Connect, but needs design.)
2. Do we ship a CLI (`storelib theme build`) as a separate npm package, or embed it in the dashboard as a browser-only esbuild-wasm build? (Lean: ship both; CLI is table-stakes for real pack authors.)
3. How do we version `SectionProps`? Semver + an SDK compat-matrix in `sdk.json`.
4. What happens to a creator who installed pack v1 when v2 breaks compat? Pin-to-installed-version by default; surface an "update available" CTA in the editor.

## Summary

Stage 3a is done: schema-level packs work today, are forward-compatible, and are already wired through import/export. Stage 3b adds visual-component packs, which is 10× the surface area. The recommended path is **compiled ES module bundles + curated marketplace review** for v1, with a documented path to sandboxed self-serve in v2 once we've seen real pack demand.
