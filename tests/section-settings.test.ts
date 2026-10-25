/**
 * ===========================================================================
 *  A CONTROL THAT DOES NOTHING IS WORSE THAN NO CONTROL
 * ===========================================================================
 * Measured across the fifty sections, before this suite existed:
 *
 *   253 declared settings that the section's OWN renderer never reads
 *    63 settings renderers read that no schema declares
 *
 * Which is not a tidiness problem. It is the answer to "the AI does small
 * work and nothing good":
 *
 *   • The CTA renderer reads `s.button_text`. The CTA schema declares
 *     `btn_primary_text`. They have never been the same field, so a call to
 *     action added from the panel renders WITH NO BUTTON.
 *
 *   • The hero declares thirty controls and reads five. A second button, a
 *     gradient background, a video background, an eyebrow, a badge, the
 *     padding, the text colour, the heading size — all set, all ignored.
 *
 *   • Fifteen sections resolve their colours through `color_scheme`, which
 *     their schema never offers. So nobody — creator or model — can change
 *     the colours of a hero, a CTA, a pricing table or a FAQ. They are
 *     permanently white, and the Background colour picker sitting right there
 *     in the panel does nothing at all.
 *
 * Both halves matter and they fail differently. An undeclared setting is
 * invisible: the renderer wants it, nothing offers it, the section is stuck on
 * a default for ever. An unread setting is a lie: the panel offers it, the
 * model sets it, the run reports success, and the page does not change.
 *
 * Run with:  npm run test:push
 */

import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_COLOR_SCHEMES } from "@/lib/website-builder/types"
import { BUILT_IN_SCHEME_KEYS } from "@/lib/storelib-theme/color-schemes"
import { contrastRatio } from "@/lib/website-builder/agent/review"
import { STORELIB_SCHEMAS, STORELIB_SECTION_TYPES } from "@/lib/website-builder/storelib-schemas"

const root = process.cwd()
const SECTIONS = join(root, "themes/default/sections")
const RENDERERS = join(root, "components/website-builder/sections/renderers")

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

// ── Which file renders which type, from the registry itself ────────────────

/**
 * Read out of registry.ts rather than guessed from the name. Guessing is how
 * the first version of this audit let `image_section` off — the file is
 * ImageSection.tsx, and a name-matching heuristic also matched
 * ImageBannerSection.tsx and ImageComparisonSection.tsx, so a field read by
 * any of the three counted as read by all three.
 */
const registry = readFileSync(
  join(root, "components/website-builder/sections/registry.ts"),
  "utf8",
)
const componentFile = new Map<string, string>()
for (const m of registry.matchAll(/import\s+\{\s*(\w+)\s*\}\s+from\s+"\.\/renderers\/(\w+)"/g)) {
  componentFile.set(m[1], m[2])
}
/* And the ones fetched when a page draws one (round V1: sections/lazy-section.tsx), named the same way. */
for (const m of registry.matchAll(/const\s+(\w+)\s*=\s*lazySection\(\(\)\s*=>\s*import\("\.\/renderers\/(\w+)"\)/g)) {
  componentFile.set(m[1], m[2])
}
/**
 * A section that lives in a `.storelib` file has no renderer file: its
 * source is `themes/default/sections/<type>.storelib`, and the audit reads
 * that instead. The template reads a setting as `settings.x`, which
 * `readsOf` already understands, so the contract is the same one the
 * renderers meet: everything the panel offers is read, and nothing is read
 * that it does not offer.
 *
 * They are not listed in registry.ts one by one — the registry derives them
 * from the files — so this reads the same list the registry does, and the
 * check below makes sure the registry really does derive it.
 */
const rendererFor = new Map<string, string>()
const storelibTypes = new Set<string>(STORELIB_SECTION_TYPES)
for (const type of STORELIB_SECTION_TYPES) rendererFor.set(type, `sections/${type}.storelib`)
for (const m of registry.matchAll(/^\s{2}(\w+):\s*(\w+),?\s*$/gm)) {
  const file = componentFile.get(m[2])
  if (file && !rendererFor.has(m[1])) rendererFor.set(m[1], file)
}

/**
 * COMMENTS ARE NOT CODE, and this audit reads source with regular
 * expressions. Left in, a renderer explaining "it read `s.button_text`, which
 * the schema has never had" would count as reading `button_text` — the
 * comment describing the bug would hide it. The `[^:]` guard is so that a
 * `https://` inside a string is not mistaken for a line comment.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const shared = stripComments(
  readFileSync(join(root, "components/website-builder/sections/_shared.tsx"), "utf8"),
)

interface Field {
  id: string
  type: string
  label?: string
  default?: unknown
  options?: { value: string }[]
}
interface Schema {
  fields?: Field[]
  blocks?: { type: string; fields?: Field[] }[]
  presets?: { settings?: Record<string, unknown>; blocks?: unknown[] }[]
}

/** JSON schemas, and .storelib files read through the sidebar's own adapter. */
const types = [
  ...readdirSync(SECTIONS).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", "")),
  ...STORELIB_SECTION_TYPES,
]

/** Headings and paragraphs are labels in the panel. Nothing should read them. */
const isSetting = (f: Field) => f.type !== "header" && f.type !== "paragraph"

const schemas = new Map<string, Schema>()
const sources = new Map<string, string>()
/** Code outside the section file that reads its settings for it (see the review_widget note below). */
const drawnBy = new Map<string, string>()
for (const type of types) {
  schemas.set(type, (STORELIB_SCHEMAS[type] as Schema | undefined) ?? JSON.parse(readFileSync(join(SECTIONS, `${type}.json`), "utf8")))
  const file = rendererFor.get(type)
  if (storelibTypes.has(type)) {
    // The template and the style are what render; the schema block is the
    // panel's side of the contract and is audited by tests/storelib-theme.
    const path = join(SECTIONS, `${type}.storelib`)
    const raw = existsSync(path) ? readFileSync(path, "utf8") : ""
    const withoutSchema = raw.replace(/^<schema>[\s\S]*?^<\/schema>/m, "")
    /* A template that hands its whole settings to the engine's `review_widget`
       filter is drawn by lib/reviews/widgets/render.ts, which reads each
       setting there (`settings.widget`, `s.columns`): that file is part of its
       renderer, the way a renderer's own ./parts are below. Only for "is every
       control read": that file also reads the saved look's own settings,
       which are set in Storelib Reviews › Widgets, not in this panel. */
    if (/\|\s*review_widget\b/.test(withoutSchema)) drawnBy.set(type, stripComments(readFileSync(join(root, "lib/reviews/widgets/render.ts"), "utf8")))
    sources.set(type, stripComments(withoutSchema.replace(/<!--[\s\S]*?-->/g, " ")))
    continue
  }
  /* Round 13: an FAQ section's "Questions from" is read by the page for it (lib/products/page-product.ts, withProductFaqs). */
  if (["faq", "faq_accordion", "faq_columns", "faq_cta"].includes(type)) drawnBy.set(type, stripComments(readFileSync(join(root, "lib/products/page-product.ts"), "utf8")))
  const path = file ? join(RENDERERS, `${file}.tsx`) : ""
  const own = path && existsSync(path) ? readFileSync(path, "utf8") : ""
  /* A renderer split into files of its own (ProductSection and its
     ./product/ blocks and media) is read with them: a setting read in one of
     them is read by the section. */
  /* Followed down: a part's own ./ imports (product-blocks -> offers-block) are the section's too. */
  const parts: string[] = []
  const seenParts = new Set<string>()
  const walkParts = (text: string, dir: string) => {
    for (const m of text.matchAll(/from "\.\/([\w/-]+)"/g)) {
      const p = join(dir, `${m[1]}.tsx`)
      if (seenParts.has(p) || !existsSync(p)) continue
      seenParts.add(p)
      const body = readFileSync(p, "utf8")
      parts.push(body)
      walkParts(body, join(p, ".."))
    }
  }
  walkParts(own, RENDERERS)
  sources.set(type, stripComments([own, ...parts].join("\n")))
}

function settingIds(schema: Schema): string[] {
  return [
    ...(schema.fields ?? []).filter(isSetting).map((f) => f.id),
    ...(schema.blocks ?? []).flatMap((b) => (b.fields ?? []).filter(isSetting).map((f) => f.id)),
  ]
}

/**
 * Every setting name the renderer reaches for. `s.x`, `b.settings.x` and
 * `settings.x` between them cover how every renderer in the tree reads one;
 * a renderer that invents a fourth spelling would show up as a field nothing
 * reads, which is the other half of this audit.
 */
function readsOf(src: string): string[] {
  const out = new Set<string>()
  // `\??\.` because optional chaining is a read like any other. Without it the
  // audit missed `b.settings?.parent_id` entirely — the mechanism behind the
  // header's dropdown menus — and reported the header as clean on that count.
  for (const m of src.matchAll(
    /\bs\??\.(\w+)|\bb\??\.settings\??\.(\w+)|\bsettings\??\.(\w+)|\bsettings\["(\w+)"\]/g,
  )) {
    out.add(m[1] ?? m[2] ?? m[3] ?? m[4])
  }
  return [...out]
}

/**
 * WHAT MAY BE READ WITHOUT BEING OFFERED, and why. Two kinds, and nothing
 * else: an id that is not on this list and not in a schema is a control
 * somebody can never reach.
 */

/**
 * Written by the editor's own navigation UI (the "Add sub-link" action)
 * rather than by a settings control. Putting `parent_id` in the panel would
 * ask a creator to type another block's id, which is not a thing anyone can
 * be expected to know.
 */
const STRUCTURAL: Record<string, string[]> = {
  header: ["parent_id"],
  /* The 404 page's section draws the shop's own products, which arrive
     block-shaped (`block.settings.title`) and are no setting of its own. */
  not_found: ["image", "title", "price", "url"],
  /* The collection sections draw the creator's collections and a collection's
     products, which arrive block-shaped from a collection_picker, a
     collection_list or the page's `collections`: none is a setting of theirs. */
  collection_featured: ["image", "title", "tag", "compare_price", "price", "url"],
  collections_grid: ["image", "title", "products_count", "description", "url"],
  /* The search page draws the shop's own products, which arrive block-shaped; it has no blocks of its own. */
  search: ["image", "title", "tag", "compare_price", "price", "url"],
}

/**
 * OLD NAMES, KEPT ONLY AS FALLBACKS. The header's controls were renamed —
 * `max_width` became `header_width`, `sticky` and `header_fixed` became
 * `header_sticky_enabled` — and headers saved under the old names are still
 * out there. They must never go back into the panel, which would show two
 * controls for one thing, and they are only legitimate in a fallback
 * position: `str(s.header_width, str(s.max_width, "wide"))`. The check below
 * verifies that rather than taking it on trust.
 */
const LEGACY_FALLBACK: Record<string, string[]> = {
  /* How a tab's panel switches was `animation`, the key every section's entrance uses, before it became `tab_animation`; a tabs section saved before still switches the way it did. */
  tabs_content: ["animation"],
  /* Trust logos are blocks now; a bar saved with the four numbered image settings still shows them. */
  social_proof_bar: ["trust_logo_1", "trust_logo_2", "trust_logo_3", "trust_logo_4"],
  /* `show_search` and `show_cart` are what the Header elements panel used
     to write while the header read `show_search_icon` and `show_cart_icon`,
     so those two toggles changed nothing. The panel writes the real names
     now and these stay readable only as fallbacks, so a creator who turned
     an icon off under the old name does not find it back. */
  header: [
    "max_width", "header_fixed", "sticky", "transparent_on_hero", "show_border", "show_search", "show_cart",
    /* The padding and the link gap were `vw`. They are pixels now, one per
       device, and a viewport value somebody set is translated into what it
       came to on a common screen rather than dropped. */
    "vertical_padding_vw", "link_spacing_vw",
  ],
}

/** Things every renderer has that are not section settings. */
const NOT_A_SETTING = new Set(["settings", "map", "length", "filter", "slice", "type", "id"])

// ===========================================================================
section("Every renderer has a schema, and every schema a renderer")
// ===========================================================================

{
  const orphanSchema = types.filter((t) => !sources.get(t))
  check(
    "every section type resolves to a renderer through the registry",
    orphanSchema.length === 0,
    orphanSchema.join(", "),
  )
  check(
    "and the registry is read, not guessed — every type resolved",
    rendererFor.size >= types.length,
    `${rendererFor.size} mappings for ${types.length} types`,
  )
  check(
    "a .storelib section registers itself by existing, rather than by a line somebody remembers to add",
    /STORELIB_SECTION_TYPES\.map\(\(type\) => \[type, StorelibSection\]\)/.test(registry) &&
      !/^\s{2}(hero|testimonials|hero_centered):\s*StorelibSection,/m.test(registry),
  )
}

// ===========================================================================
section("Nothing in a settings panel is a lie")
// ===========================================================================

{
  const unread: string[] = []
  let worst = ""
  let worstCount = 0
  for (const type of types) {
    const src = sources.get(type)!
    if (!src) continue
    const haystack = src + "\n" + shared + "\n" + (drawnBy.get(type) ?? "")
    /**
     * A READ, not a word that happens to appear.
     *
     * This used to grep for the bare identifier, and a break test caught it:
     * deleting the gallery's `bool(s.lightbox, true)` left the audit green,
     * because the component has a local `const lightbox` and `\blightbox\b`
     * still matched. Any setting whose id collides with a variable name was
     * exempt from the whole audit without anybody knowing.
     *
     * The shapes below are every way a renderer in this tree reaches a
     * setting; a renderer that invented a sixth would show up as a field
     * nothing reads, which is exactly what this check is for.
     */
    const dead = settingIds(schemas.get(type)!).filter(
      (id) =>
        !new RegExp(
          // A PROPERTY ACCESS ending in the id — `s.gap`, `block.settings.gap`,
          // `b.gap` where the renderer aliased `const b = block.settings`. Any
          // alias is accepted because renderers use several; what is NOT
          // accepted is the bare word, which is the hole this closes.
          `[\\w$]+\\??\\.(?:settings\\??\\.)?${id}\\b|settings\\["${id}"\\]`,
        ).test(haystack),
    )
    if (dead.length) {
      unread.push(`${type}: ${dead.join(", ")}`)
      if (dead.length > worstCount) {
        worstCount = dead.length
        worst = type
      }
    }
  }
  check(
    "every control a panel offers is read by the section it belongs to",
    unread.length === 0,
    `${unread.length} sections, worst is ${worst} with ${worstCount}\n        ${unread.join("\n        ")}`,
  )
}

// ===========================================================================
section("And nothing a renderer needs is missing from the panel")
// ===========================================================================

{
  const invented: string[] = []
  for (const type of types) {
    const src = sources.get(type)!
    if (!src) continue
    const declared = new Set(settingIds(schemas.get(type)!))
    const allowed = new Set([...(STRUCTURAL[type] ?? []), ...(LEGACY_FALLBACK[type] ?? [])])
    const missing = readsOf(src).filter(
      (id) => !declared.has(id) && !NOT_A_SETTING.has(id) && !id.startsWith("_") && !allowed.has(id),
    )
    if (missing.length) invented.push(`${type}: ${missing.join(", ")}`)
  }
  check(
    "no renderer reads a setting nobody can set",
    /**
     * THE CTA BUG, and its shape. `s.button_text` with no `button_text` in the
     * schema is a section that can never have a button — not a wrong default,
     * an unreachable one. Nothing in the editor, the AI or a type checker
     * could see it, because settings are a `Record<string, unknown>`.
     */
    invented.length === 0,
    invented.slice(0, 10).join("\n        "),
  )

  /**
   * The allow-list is only honest while the exemption holds. A legacy id that
   * stopped being a fallback and became the primary read would be a control
   * nobody can set again — with this file saying that was fine.
   */
  const notFallbacks: string[] = []
  for (const [type, ids] of Object.entries(LEGACY_FALLBACK)) {
    const src = sources.get(type) ?? ""
    for (const id of ids) {
      if (!new RegExp(`\\b${id}\\b`).test(src)) continue
      /*
        Second argument of a coercion helper — `…, str(s.max_width, …)` or
        `…, bool(s.sticky, true))` — which is what a fallback looks like.

        `headerIconOn(s.show_search_icon, s.show_search)` is the same shape
        with its own helper: the current name is read first and the old one
        only answers when it has never been written. Named here rather than
        loosened to "any second argument", which would let a legacy id sit
        anywhere in any call and still pass.
      */
      const fallback = new RegExp(
        /* legacyLogo(blocks, s.trust_logo_N): Social proof bar's numbered logos, read only while it has no Trust logo blocks. */
        `,\\s*(?:str|bool|num)\\(s\\.${id}\\b|(?:headerIconOn|headerPad|headerGap)\\(s\\.\\w+,\\s*s\\.${id}\\b|legacyLogo\\(\\w+,\\s*s\\.${id}\\b`,
      )
      if (!fallback.test(src)) notFallbacks.push(`${type}.${id}`)
    }
  }
  check(
    "and every exempted legacy name is only ever a fallback behind a real control",
    notFallbacks.length === 0,
    notFallbacks.join(", "),
  )
}

// ===========================================================================
section("Colour is controllable on every section")
// ===========================================================================

{
  const SCHEMES: string[] = [...BUILT_IN_SCHEME_KEYS]

  const usesScheme = types.filter((t) => /sectionColors\(|resolveScheme\(/.test(sources.get(t)!))
  const declaresScheme = types.filter((t) =>
    (schemas.get(t)!.fields ?? []).some((f) => f.id === "color_scheme"),
  )

  const uncontrollable = usesScheme.filter((t) => !declaresScheme.includes(t))
  check(
    "a section whose colours come from a scheme lets somebody choose the scheme",
    /**
     * Fifteen did not: cta, faq, feature_grid, gallery, hero, image_banner,
     * image_section, logo_bar, pricing, product_list, rich_text, slideshow,
     * split_content, stats, testimonials. Every one of them resolved
     * `section.settings.color_scheme`, defaulted it to "white" because it was
     * never set, and offered a Background colour picker that did nothing.
     */
    uncontrollable.length === 0,
    uncontrollable.join(", "),
  )

  const wrongOptions = declaresScheme.filter((t) => {
    const field = (schemas.get(t)!.fields ?? []).find((f) => f.id === "color_scheme")!
    /**
     * A `color_scheme` control (the registry's type, used by .storelib
     * schemas) lists every scheme the theme has by construction — FieldEditor
     * reads them from the theme, not from the field — so it has no options to
     * check, only a default. A `select` has to spell them all out.
     */
    if (field.type === "color_scheme") return !SCHEMES.includes(String(field.default))
    const values = (field.options ?? []).map((o) => o.value)
    return SCHEMES.some((s) => !values.includes(s)) || !SCHEMES.includes(String(field.default))
  })
  check(
    "and every scheme the theme has is offered, with a scheme as the default",
    wrongOptions.length === 0,
    wrongOptions.join(", "),
  )

  /**
   * A raw colour picker on top of a scheme is not wrong — a hero wants an
   * exact colour, and the check above already demands the renderer read it.
   * What matters is whether the pair a section SHIPS WITH is legible.
   *
   * WCAG 2.1 AA for body text is 4.5:1. This is the one property a settings
   * panel cannot show you and a screenshot of the editor will not either,
   * because the defaults are what somebody sees a second after they click Add
   * — before they have touched anything.
   */
  const illegible: string[] = []
  for (const type of types) {
    const schema = schemas.get(type)!
    const shipped: Record<string, unknown> = {}
    for (const f of schema.fields ?? []) if (f.default !== undefined) shipped[f.id] = f.default
    Object.assign(shipped, schema.presets?.[0]?.settings ?? {})

    const scheme = DEFAULT_COLOR_SCHEMES[
      (typeof shipped.color_scheme === "string" && shipped.color_scheme in DEFAULT_COLOR_SCHEMES
        ? shipped.color_scheme
        : "white") as keyof typeof DEFAULT_COLOR_SCHEMES
    ]

    /**
     * WHAT THE TEXT IS ACTUALLY ON. The renderers all resolve the same way —
     * the section's own colour if it has one, otherwise the scheme's — but a
     * gradient has two ends and the text has to be legible on both. Checking
     * only `bg_color` called the gradient CTA illegible while it is one of the
     * better-looking things in the library.
     */
    const grounds: string[] = []
    if (shipped.bg_type === "gradient" && shipped.gradient_from && shipped.gradient_to) {
      grounds.push(String(shipped.gradient_from), String(shipped.gradient_to))
    } else {
      grounds.push(String(shipped.bg_color || scheme.bg))
    }

    for (const id of ["text_color", "heading_color", "paragraph_color"]) {
      const value = shipped[id]
      if (typeof value !== "string" || !value) continue
      for (const bg of grounds) {
        const ratio = contrastRatio(value, bg)
        if (ratio !== null && ratio < 4.5) {
          illegible.push(`${type}.${id} ${value} on ${bg} = ${ratio.toFixed(1)}:1`)
        }
      }
    }
  }
  check(
    "what a section ships with is readable",
    illegible.length === 0,
    illegible.join("\n        "),
  )
}

// ===========================================================================
section("Spacing is a control, not a hard-coded number")
// ===========================================================================

{
  const declares = types.filter((t) =>
    (schemas.get(t)!.fields ?? []).some((f) => f.id === "padding_top"),
  )
  const ignores = declares.filter(
    (t) => !/padding_top|sectionPadding\(/.test(sources.get(t)!),
  )
  check(
    "every section that offers padding honours it",
    /**
     * Sixteen offered a padding slider and rendered a hard-coded `py-16`. Two
     * sections next to each other could not be given different spacing, which
     * is most of what "make it look designed" comes down to.
     */
    ignores.length === 0,
    ignores.join(", "),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
