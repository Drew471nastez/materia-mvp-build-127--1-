# Short prompt → full site: planning pipeline

This is the capability you want Storelib to have, instead of generating the first hero it thinks of.

### Step 1. Normalize the request

From "make me a beautiful website selling sneakers", infer:
- Domain: physical ecommerce, footwear; goal = discover and purchase shoes.
- Primary audience: sneaker shoppers, unless user specifies another.
- Site complexity: multi-page shop, not marketing splash only.
- Constraints: actual Storelib commerce capabilities, no unauthorized product claims.
- Brand tone: propose a coherent fresh direction; default direction is editable.

Respect explicit constraints: "one page", "no animation", "just the homepage", "do not touch existing products" override inferred defaults.

### Step 2. Retrieve real capabilities

From Storelib, obtain: enabled commerce features; real products/collections, variants and stock; existing pages; templates/section types; image/media sources; schema limits; naming and package rules; theme render/publish API. Mark capabilities `supported`, `disabled`, `unknown`, `unsupported`.

### Step 3. Establish a design brief

A 1–2 paragraph rationale and tokens: brand positioning, page rhythm, typography, primary/secondary colors, layout vocabulary, imagery, motion, light/dark. Examples:
- Curated streetwear shop → editorial type, textured backgrounds, giant product photography, offset grids, high contrast.
- Trail runners → practical product comparison, technical specs, filters, rugged outdoor imagery.
- Luxury leather shoes → quiet minimal, sophisticated serif, abundant whitespace, subdued palettes.
Do not select the same visual language for all three.

### Step 4. Plan the sitemap

Choose purpose and slug for each page. Distinguish static pages, data-driven templates and optional functional pages. Give each a conversion goal, SEO description, layout and list of section types.

### Step 5. Plan content and page narrative

Homepage shouldn't be an arbitrary stack: lead with a clear offer, provide category discovery, showcase products, give story, reduce uncertainty, close with a logical action. Vary scale, composition, backgrounds, photo crop, information density and spacing.

For each planned section define:
`id`, `semantic_type`, `purpose`, `layout_variant`, `content`, `asset_requirements`, `bindings`, `customizer_settings`, `responsive_notes`, `interaction`.

### Step 6. Resolve data & media

Use the user's uploaded assets and verified product catalog first. If a licensed remote image source is enabled, acquire relevant images under its terms and ensure package storage and manifest match. If imagery isn't available, use intentional editable placeholders without pretending a stock image is a real product.

### Step 7. Generate pages in a dependency-aware order

Site shell + tokens → product/collection templates and data wiring → home → supporting pages → metadata and navigation → validation. For time/token budgets, build an MVP site first with coherent complete flows, then enrich with polish. Avoid one giant all-or-nothing generation where failures are hard to locate.

### Step 8. Validate / preview / critique / repair

Validate structured plan before compilation; compile sections with Storelib's **actual** DSL; run parsing, schema, asset checks; render routes; check responsive behavior, keyboard focus, functioning CTAs; take screenshots and critique visually where supported. Repair and run again. Only report a publishable site when all hard gates pass.

## Orchestration example (pseudocode, NOT the Storelib API)

```text
request = sanitizeInput(userPrompt)
capabilities = inspectLiveStorelibFeatures(storeId)
context = retrieveProjectContentAndDesignRules(storeId)
intent = classifyIntent(request, context)
if intent is targeted edit: planMinimalSafePatch()
else:
    brief = deriveBrief(request, context)
    plan = model.planSite(brief, capabilities, rules)
    validateSitePlan(plan, capabilities)
    designSystem = model.chooseBrandDesign(plan, designKnowledge)
    artifacts = compileStorelibTheme(plan, designSystem, existingStorelibCompiler)
    assertThemeSyntaxSchemasAndAssets(artifacts)
    preview = renderAllRoutes(artifacts)
    issues = runFunctionalAndVisualQA(preview)
    repairUntilAcceptable(issues, boundedRetries=2)
    persistDraftAndOfferPreview()
```

**Note:** Use typed tools/function calls and strict schemas when the actual model API supports them; avoid trusting unconstrained free-text code as valid theme packages.
