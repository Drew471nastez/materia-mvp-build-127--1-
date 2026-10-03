/**
 * ===========================================================================
 *  THE PARTS OF THE DOCUMENTATION THE FRAMEWORK WRITES ABOUT ITSELF
 * ===========================================================================
 * The prose in content/developers was written by a person. The reference
 * tables are not: every control type, filter, capability, limit, refused
 * construct, colour variable, text style, theme token, media type and
 * reserved page name is read here from the module that enforces it, at the
 * moment the page is drawn.
 *
 * That is not a nicety. The first survey for this hub found the hand-written
 * docs in docs/theme already out of date in two places, an `embed` filter and
 * an `embed` capability the compiler had grown and the prose never mentioned.
 * A table generated from the compiler cannot fall behind the compiler.
 *
 * Where a table needs words the engine does not carry (what a filter does in
 * a sentence, what a capability grants, where a theme token comes from),
 * those words are keyed here by the engine's own names, and
 * tests/developer-hub.test.ts fails the moment the engine gains a name this
 * file has not described.
 */
import { CONTROLS, CONTROL_TYPES, LEGACY_TYPE_ALIASES, type ControlDefinition, type ControlType, type ValueKind } from "@/lib/storelib-theme/controls/registry"
import { EMBED_ALLOWED, FILTER_NAMES, FOREIGN_SYNTAX, FORBIDDEN_MARKUP } from "@/lib/storelib-theme/storelib/template"
import { CAPABILITIES, FORBIDDEN_IDENTIFIERS } from "@/lib/storelib-theme/storelib/script"
import { LEGACY_TO_SEMANTIC, SCHEME_COLOR_KEYS, SCHEME_CSS_VARS } from "@/lib/storelib-theme/color-schemes"
import { FONT_ROLES, TYPE_STYLE_KEYS, TYPE_STYLE_LABELS } from "@/lib/storelib-theme/typography"
import { ENGINE_VERSION, LIMITS, SECTION_SCHEMA_VERSION, THEME_FORMAT_VERSION } from "@/lib/storelib-theme/types"
import { LANGUAGE_VERSION } from "@/lib/storelib-theme/language"
import { MAX_BYTES, MAX_TOTAL_MEDIA_BYTES, MEDIA_TYPES, type MediaKind } from "@/lib/storelib-theme/media"
import { themeTokens } from "@/lib/storelib-theme/resolve"
import { RESERVED_PAGE_KEYS } from "@/lib/website-builder/site-pages"
import { POLICY_PAGES } from "@/lib/website-builder/policy-pages"
import { IMPORT_MAX_BYTES } from "@/lib/website-builder/theme-import"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { ALL_TOPICS, MAX_REPAIR_ATTEMPTS, writeSectionRules } from "@/lib/storelib-ai"
import { DYNAMIC_SOURCES, SOURCE_TARGETS, sourcesFor } from "@/lib/storelib-theme/dynamic"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import headerSchema from "@/themes/default/sections/header.json"
import footerSchema from "@/themes/default/sections/footer.json"
import { PAGE_META } from "@/lib/website-builder/types"
import { pagePath } from "@/lib/website-builder/site-pages"

import { DEVELOPER_EXAMPLES } from "./content.generated"
import { builtInSchemes, controlDescription, controlSpecimens, themeSettingGroups, typeStyleRows } from "./builder-reference"
import type { DocNode, HubMapGroup } from "./markdown"
import { DEV_GROUPS, DEV_GROUP_INFO, devPagesIn, devPath } from "./pages"

/* ── words the engine does not carry, keyed by the engine's own names ────── */

export const FILTER_DOCS: Record<string, { use: string; does: string }> = {
  default: { use: `{{ settings.label | default: "Shop" }}`, does: "The argument when the value is empty text, `null`, `false` or an empty list. `0` is a value, not empty." },
  upcase: { use: `{{ settings.tag | upcase }}`, does: "Upper case." },
  downcase: { use: `{{ settings.tag | downcase }}`, does: "Lower case." },
  capitalize: { use: `{{ settings.name | capitalize }}`, does: "The first letter in upper case; the rest as it was." },
  strip: { use: `{{ settings.name | strip }}`, does: "Removes spaces from both ends." },
  size: { use: `{{ blocks | size }}`, does: "How many items a list has, or characters a string has. Anything else is 0." },
  first: { use: `{{ blocks | first }}`, does: "The first item of a list, or the first character of a string." },
  last: { use: `{{ blocks | last }}`, does: "The last item of a list, or the last character of a string." },
  join: { use: `{{ settings.tags | join: " · " }}`, does: "A list joined into one string, with `, ` unless given another separator." },
  truncate: { use: `{{ settings.text | truncate: 80 }}`, does: "Text longer than the number, 50 unless given, is cut to one character fewer and ends with `…`, or with the second argument instead." },
  append: { use: `{{ settings.price | append: " each" }}`, does: "Adds the argument to the end." },
  prepend: { use: `{{ settings.code | prepend: "#" }}`, does: "Adds the argument to the start." },
  replace: { use: `{{ settings.text | replace: "old", "new" }}`, does: "Replaces every occurrence of the first argument with the second." },
  plus: { use: `{{ forloop.index | plus: 1 }}`, does: "Adds a number." },
  minus: { use: `{{ settings.count | minus: 1 }}`, does: "Subtracts a number." },
  times: { use: `{{ settings.columns | times: 2 }}`, does: "Multiplies by a number." },
  divided_by: { use: `{{ settings.width | divided_by: 2 }}`, does: "Divides by a number. Dividing by zero gives 0." },
  round: { use: `{{ settings.ratio | round: 2 }}`, does: "Rounds to that many decimal places, 0 unless given." },
  json: { use: `data-config="{{ settings | json }}"`, does: "The value as JSON. Output escaping makes it safe inside an attribute." },
  escape: { use: `{{ settings.text | escape }}`, does: "HTML-escaped. Output is escaped already, so this escapes twice: `a < b` shows on the page as `a &lt; b`. Leave it out." },
  raw: { use: `{{ settings.body | raw }}`, does: "Printed as HTML, without escaping. Use it on a `richtext`, `inline_richtext` or `html` setting, or on `product.description_html`: each is cleaned against an allow list before a template sees it. Nothing checks which setting it is on, and what it prints is still checked as it is drawn, so nothing in it can run." },
  url: { use: `href="{{ settings.link | url }}"`, does: "Keeps a link starting `/`, `http://`, `https://`, `mailto:`, `tel:` or `#`, keeps an empty value empty, and turns anything else, `//host` included, into `#`. Use it on every link built from a setting." },
  embed: { use: `src="{{ settings.video | embed }}"`, does: "A player address from a pasted YouTube, Vimeo, Spotify or SoundCloud link, or an empty string. Needs the `embed` capability." },
  asset: { use: `{{ block.settings.clip | asset }}`, does: "Passes a URL through unchanged. An `asset://` reference, which exists only inside a theme package, prints as an empty string on a site, because media settings arrive as URLs." },
  date: { use: `{{ settings.ends_at | date: "short" }}`, does: "A `datetime` for people to read: `long` (14 March 2026, the default), `short` (14 Mar 2026), `time` (23:00), `long_time` or `iso`. Read as written, never moved to another time zone." },
  strip_html: { use: `alt="{{ settings.heading | strip_html }}"`, does: "The words of some markup, entities decoded, on one line. For an alt text or a title made from a rich text setting." },
  lines: { use: `{% for line in block.settings.features | lines %}`, does: "Each line of a text that has something on it, trimmed, as a list, at most 100. For a `textarea` typed one item per line: the features of a plan, the lessons of a module." },
  alpha: { use: `{{ settings.color | alpha: 0.4 }}`, does: "A 3 or 6 digit hex colour at that opacity, as `rgba()`. Anything else passes through unchanged." },
}

export const CAPABILITY_DOCS: Record<string, { grants: string; now: boolean }> = {
  embed: { grants: "One `<iframe>` whose `src` comes from the `embed` filter. This is markup, not script, so it works today.", now: true },
  navigation: { grants: "`storelib.navigate(path)`: go to a page of this site. A path starting with one `/` only; the builder's canvas ignores it.", now: true },
  commerce: { grants: "`storelib.cart.add(variantId, quantity)` and `storelib.cart.get()`. Declaring it is accepted; the functions are not on `storelib` yet.", now: false },
  analytics: { grants: "`storelib.analytics.track(event, props)`. Declaring it is accepted; the function is not on `storelib` yet.", now: false },
  forms: { grants: "`storelib.forms.submit(name, fields)`, not on `storelib` yet. A sign-up form needs no script and no capability at all; see Forms.", now: false },
  timers: { grants: "The names `setTimeout`, `setInterval` and `requestAnimationFrame`.", now: true },
}

export const LIMIT_DOCS: Record<keyof typeof LIMITS, string> = {
  sourceBytes: "One section file",
  cssBytes: "A section's CSS",
  scriptBytes: "A section's script",
  settingsPerSchema: "Settings in one section",
  blocksPerSection: "Blocks in one section",
  sectionsPerTemplate: "Sections on one page",
  assetBytes: "One asset in a theme package",
  filesPerPackage: "Files in a theme package",
  packageBytes: "A theme package",
}

/**
 * Where each theme token comes from. Keyed by its path under `theme`, and
 * tests/developer-hub.test.ts fails when themeTokens() grows a token this does
 * not describe.
 */
export const THEME_TOKEN_DOCS: Record<string, string> = {
  "colors.primary": "Page colors › Primary, `primary_color`",
  "colors.secondary": "Page colors › Secondary, `secondary_color`",
  "colors.accent": "Page colors › Accent, `accent_color`",
  "colors.background": "Page colors › Page background, `background_color`",
  "colors.surface": "Page colors › Surface / card, `surface_color`",
  "colors.text": "Page colors › Heading text, `text_color`",
  "colors.muted": "Nothing yet. It reads `muted_color`, which no panel writes, so it is always this value.",
  "radius.small": "Fixed.",
  "radius.medium": "Layout › Card border radius, `border_radius`",
  "radius.large": "Twice `border_radius`",
  "radius.pill": "Fixed.",
  "spacing.small": "Fixed.",
  "spacing.medium": "Fixed.",
  "spacing.large": "Fixed.",
  "spacing.xlarge": "Fixed.",
  "typography.heading": "Typography › Heading font, `font_heading`",
  "typography.body": "Typography › Body font, `font_body`",
  "typography.accent": "Typography › Accent font, `font_accent`, or the heading font when it is empty",
}

/**
 * What a theme settings group holds when its settings are not a list of
 * fields: the colour schemes live in their own keys, drawn by their own panel.
 */
const GROUP_WITHOUT_FIELDS: Record<string, string> = {
  color_schemes: "The schemes: `color_schemes`, `default_color_scheme` and `color_scheme_remaps`. See Colour schemes below.",
}

const VALUE_WORDS: Record<ValueKind, string> = {
  string: "text",
  number: "a number",
  boolean: "true or false",
  color: "a hex colour",
  background: "a colour or a gradient",
  asset: "a URL",
  asset_list: "a list of URLs",
  reference_list: "a list of products",
  enum: "one of its options",
  none: "nothing; it only draws in the panel",
}

/** What a value is, where the registry's kind says less than the builder stores. */
const CONTROL_HOLDS: Partial<Record<ControlType, string>> = {
  color_scheme: "a scheme's key",
  font_picker: "a font family name",
  alignment: "`left`, `center` or `right`",
  icon_picker: "an icon's name",
  url: "a link",
  page_picker: "a page's address",
  product_picker: "a product page's address",
  community_picker: "a community's id; printed, its page's address",
}

const MEDIA_WORDS: Record<MediaKind, string> = { image: "Pictures", video: "Video", audio: "Sound", file: "Files" }

/* ── helpers ──────────────────────────────────────────────────────────────── */

function bytes(n: number): string {
  if (n >= 1024 * 1024) return `${n / (1024 * 1024)} MB`
  if (n >= 1024) return `${n / 1024} KB`
  return `${n} bytes`
}

const code = (s: string) => "`" + s + "`"

/** "a <script> tag inside…" as the sentence it starts. */
function sentence(s: string): string {
  const t = s.trim()
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/[.;]?$/, ".")
}

/**
 * The Vue syntax a FOREIGN_SYNTAX pattern catches, as somebody would type it.
 * `\\sv-if\\s*=` is `v-if`; the catch-all `\\s:([a-z-]+)\\s*=` is any bound
 * attribute, shown as `:attribute`.
 */
function vueLabel(re: RegExp): string {
  const s = re.source
    .replace(/\\s\*?/g, "")
    .replace(/\(\[a-z-\]\+\)/, "attribute")
    .replace(/\(\|=\|>\)$/, "")
    .replace(/=$/, "")
  return s
}

/** What a control holds when its schema gives no default. */
function fallbackWords(c: ControlDefinition): string {
  return c.value === "none" ? "nothing" : code(JSON.stringify(c.fallback))
}

/** Every leaf under an object, as dotted paths, for the theme tokens table. */
function leaves(value: unknown, prefix: string): [string, unknown][] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k))
  }
  return [[prefix, value]]
}

/** The theme tokens a template reads directly, with the value a theme that set nothing gets. */
export function themeTokenLeaves(): [string, unknown][] {
  const t = themeTokens({}) as Record<string, unknown>
  const typography = t.typography as Record<string, unknown>
  return [
    ...leaves(t.colors, "colors"),
    ...leaves(t.radius, "radius"),
    ...leaves(t.spacing, "spacing"),
    ...(["heading", "body", "accent"] as const).map((k): [string, unknown] => [`typography.${k}`, typography[k]]),
  ]
}

/** The names the library's own sections read a scheme by, which are older than the semantic ones. */
export function schemeShortNames(): [string, string][] {
  return Object.entries(LEGACY_TO_SEMANTIC).filter(([slot]) => /^(bg|paragraph|primary_btn_|secondary_btn_)/.test(slot))
}

/** The example files, by type, for anything that wants to check them. */
export function exampleTypes(): string[] {
  return Object.keys(DEVELOPER_EXAMPLES).sort()
}

/** The hub's categories with their pages, for the front page. */
export function hubMap(): HubMapGroup[] {
  return DEV_GROUPS.map((g) => ({
    name: g,
    info: DEV_GROUP_INFO[g],
    pages: devPagesIn(g)
      .filter((p) => p.slug !== "")
      .map((p) => ({ nav: p.nav, summary: p.summary, href: devPath(p.slug) })),
  }))
}

/* ── the directives ───────────────────────────────────────────────────────── */

export const DIRECTIVE_NAMES = [
  "limits", "filters", "refusals", "controls", "legacy-controls", "scheme-vars", "type-styles",
  "embed-hosts", "forbidden", "capabilities", "versions", "example", "ai-brief", "ai-topics-extra", "ai-loop",
  "builder-controls", "theme-settings", "builder-schemes", "builder-type-styles", "dynamic-sources",
  "hub-map", "theme-tokens", "scheme-names", "page-keys", "policy-pages", "media-types", "theme-setting-index", "font-options",
  "library-schema", "library-section", "chrome-settings", "default-pages", "theme-blocks", "library-block",
] as const

type ChromeField = { id?: string; type?: string; label?: string; default?: unknown; options?: { label?: string; value?: unknown }[] }
type ChromeSchema = { fields?: ChromeField[]; blocks?: { type?: string; name?: string; fields?: ChromeField[] }[] }

/**
 * The header's or the footer's settings, read from the file the builder
 * draws them from, grouped under the headings the sidebar shows. A setting
 * added to the header is in this table the next time the page is drawn.
 */
function chromeSettingsTable(schema: ChromeSchema): DocNode[] {
  const rows: string[][] = []
  let group = ""
  for (const f of schema.fields ?? []) {
    if (f.type === "header") { group = f.label ?? ""; continue }
    if (!f.id || f.type === "paragraph") continue
    const choices = f.options?.length ? f.options.map((o) => code(String(o.value ?? ""))).join(", ") : ""
    const dflt = f.default === undefined || f.default === "" ? "" : code(typeof f.default === "string" ? f.default : JSON.stringify(f.default))
    rows.push([group, code(f.id), f.label ?? "", code(f.type ?? ""), [dflt, choices].filter(Boolean).join(" · ")])
  }
  const out: DocNode[] = [{ kind: "table", head: ["Group", "Setting", "Label", "Type", "Default · choices"], rows }]
  for (const b of schema.blocks ?? []) {
    out.push({
      kind: "paragraph",
      text: `Block ${code(b.type ?? "")} (${b.name ?? b.type}): ${(b.fields ?? []).filter((f) => f.id && f.type !== "header").map((f) => code(f.id!)).join(", ")}.`,
    })
  }
  return out
}

export function expandDirective(name: string, arg?: string): DocNode[] {
  switch (name) {
    case "limits":
      return [{
        kind: "table",
        head: ["Limit", "Most allowed"],
        rows: (Object.keys(LIMIT_DOCS) as (keyof typeof LIMITS)[]).map((k) => [
          LIMIT_DOCS[k],
          /Bytes$/.test(k) ? bytes(LIMITS[k]) : String(LIMITS[k]),
        ]),
      }]

    case "filters":
      return [{
        kind: "table",
        head: ["Filter", "Example", "What it does"],
        rows: FILTER_NAMES.map((f) => [code(f), code(FILTER_DOCS[f]?.use ?? f), FILTER_DOCS[f]?.does ?? ""]),
      }]

    case "refusals":
      return [
        {
          kind: "list",
          ordered: false,
          items: [
            ...FORBIDDEN_MARKUP.map(([, message]) => sentence(message)),
            "An `<iframe>`, unless the schema declares the `embed` capability and its `src` comes from the `embed` filter.",
            "An unclosed `{{`, `{%` or `{#`, an `{% if %}` without `{% endif %}`, a `{% for %}` without `{% endfor %}`, a tag the language does not have, or a malformed expression.",
            "A name the schema does not declare, such as `{{ settings.headng }}`, and a name that is not something a section can read, such as `{{ product.title }}`.",
          ],
        },
        {
          kind: "paragraph",
          text: "One thing that looks like an error is not refused: **an unknown filter**. `{{ settings.title | shout }}` compiles and prints the value unchanged, so check every filter name against the list above.",
        },
        {
          kind: "paragraph",
          text: "Vue syntax is refused by name, with what to write instead, because it is the first thing anyone arriving from a framework reaches for:",
        },
        {
          kind: "table",
          head: ["Vue", "Write instead"],
          rows: FOREIGN_SYNTAX.map(([re, instead]) => [code(vueLabel(re)), sentence(instead)]),
        },
      ]

    case "controls":
      return [
        {
          kind: "table",
          head: ["Type", "What it is"],
          rows: CONTROL_TYPES.map((t) => [code(t), controlDescription(t)]),
        },
        {
          kind: "paragraph",
          text: "What each one holds, what a setting of that type is worth when the schema gives no `default`, and the keys it reads beyond `type`, `id`, `label`, `default` and `info`:",
        },
        {
          kind: "table",
          head: ["Type", "Holds", "With no default", "Also reads", "Responsive"],
          rows: CONTROL_TYPES.map((t) => {
            const c = CONTROLS[t]
            return [code(t), CONTROL_HOLDS[t] ?? VALUE_WORDS[c.value], fallbackWords(c), c.accepts.map(code).join(", "), c.responsive ? "yes" : "no"]
          }),
        },
        {
          kind: "paragraph",
          text: "`responsive: true` is allowed only where the last column says yes, and refused anywhere else. A gallery's `max` is accepted, and the builder does not stop at it yet.",
        },
        {
          kind: "details",
          summary: `A working declaration of each of the ${CONTROL_TYPES.length} types`,
          children: [{
            kind: "code",
            lang: "json",
            code: JSON.stringify(CONTROL_TYPES.map((t) => CONTROLS[t].example), null, 2),
          }],
        },
      ]

    case "dynamic-sources": {
      /* The setting types a placeholder can go in, asked of the same function
         the editor's Insert shop data list is built from. */
      const types = Object.keys(SOURCE_TARGETS).filter((t) => (CONTROL_TYPES as readonly string[]).includes(t))
      return [{
        kind: "table",
        head: ["Placeholder", "What it is", "Setting types it fills"],
        rows: DYNAMIC_SOURCES.map((s) => [
          code(`{{ ${s.id} }}`),
          s.templates ? `${s.description} On the product page only.` : s.description,
          types.filter((t) => sourcesFor(t, s.templates?.[0] ?? "index").some((x) => x.id === s.id)).map(code).join(" "),
        ]),
      }]
    }

    case "legacy-controls":
      return [{
        kind: "table",
        head: ["Older name", "Means"],
        rows: Object.entries(LEGACY_TYPE_ALIASES).map(([old, now]) => [code(old), code(now)]),
      }]

    case "scheme-vars":
      return [{
        kind: "table",
        head: ["In a template", "In CSS"],
        rows: SCHEME_COLOR_KEYS.map((k) => [code(`scheme.${k}`), code(`var(${SCHEME_CSS_VARS[k]})`)]),
      }]

    case "scheme-names":
      return [{
        kind: "table",
        head: ["Short name", "Is the same as"],
        rows: [
          ...schemeShortNames().map(([slot, key]) => [
            code(`scheme.${slot}`),
            slot === "bg" ? `${code(`scheme.${key}`)}, or the scheme's gradient when it has one` : code(`scheme.${key}`),
          ]),
          [code("scheme.name"), "The scheme's name, as the creator sees it in the picker."],
          [code("scheme.gradient"), "The gradient laid over the background, or empty."],
        ],
      }]

    case "type-styles":
      return [
        {
          kind: "table",
          head: ["Style", "Key"],
          rows: TYPE_STYLE_KEYS.map((k) => [TYPE_STYLE_LABELS[k], code(k)]),
        },
        {
          kind: "paragraph",
          text: `Font roles: ${FONT_ROLES.map(code).join(", ")}. A section's heading style is one of ${["h1", "h2", "h3", "h4"].map(code).join(", ")} or ${code("custom")}; its body style is ${["body", "body_large", "body_small"].map(code).join(", ")} or ${code("custom")}.`,
        },
      ]

    case "theme-tokens":
      return [{
        kind: "table",
        head: ["Path", "When the theme sets nothing", "Comes from"],
        rows: [
          ...themeTokenLeaves().map(([path, value]) => [code(`theme.${path}`), code(typeof value === "string" ? value : String(value)), THEME_TOKEN_DOCS[path] ?? ""]),
          [code("theme.typography.styles.<style>"), "the text style", "Typography › the nine text styles, each with `font`, `weight`, `size.desktop`, `size.tablet`, `size.mobile`, `line_height`, `letter_spacing` and `transform`"],
          [code("theme.schemes.<key>.<colour>"), "every scheme", "Colors: each scheme by key, under the same names `scheme` has"],
          [code("theme.settings.<id>"), "as saved", "Every theme setting, as stored. See [Themes](/developers/themes#theme-settings)."],
        ],
      }]

    case "embed-hosts":
      return [{ kind: "list", ordered: false, items: EMBED_ALLOWED.map(code) }]

    case "forbidden":
      return [{ kind: "paragraph", text: FORBIDDEN_IDENTIFIERS.map(code).join(", ") }]

    case "capabilities":
      return [{
        kind: "table",
        head: ["Capability", "Grants", "Works today"],
        rows: CAPABILITIES.map((c) => [
          code(c),
          CAPABILITY_DOCS[c]?.grants ?? "",
          CAPABILITY_DOCS[c]?.now ? "yes" : "not yet",
        ]),
      }]

    case "versions":
      return [{
        kind: "table",
        head: ["What", "Version", "Moves when"],
        rows: [
          ["The engine", String(ENGINE_VERSION), "The engine gains something a theme can require. A `theme.json` asking for a newer engine is refused."],
          ["The section schema format", String(SECTION_SCHEMA_VERSION), "The `<schema>` JSON gains or changes a key. Written as `schema_version`; a newer one is refused."],
          ["The template language", String(LANGUAGE_VERSION), "A construct changes meaning. Written as `language_version` in the schema; absent means 1 for good, and a newer one is refused."],
          ["The theme package format", String(THEME_FORMAT_VERSION), "The layout of a `.storelib-theme` file changes."],
          ["A section", "its own `version`", "Its author says so. Nothing reads it yet."],
        ],
      }]

    case "page-keys":
      return [{
        kind: "paragraph",
        text: `${[...RESERVED_PAGE_KEYS].map(code).join(", ")}.`,
      }]

    case "policy-pages":
      return [{
        kind: "table",
        head: ["Page", "Key and address"],
        rows: POLICY_PAGES.map((p) => [p.title, code(`/${p.key}`)]),
      }]

    case "media-types": {
      const kinds: MediaKind[] = ["image", "video", "audio", "file"]
      return [
        {
          kind: "table",
          head: ["Kind", "Extensions", "An export carries each up to"],
          rows: kinds.map((k) => [
            MEDIA_WORDS[k],
            Object.entries(MEDIA_TYPES).filter(([, t]) => t.kind === k).map(([ext]) => code(ext)).join(", "),
            bytes(MAX_BYTES[k]),
          ]),
        },
        {
          kind: "paragraph",
          text: `An export carries at most ${bytes(MAX_TOTAL_MEDIA_BYTES)} of media in all. An import takes a zip of up to ${bytes(IMPORT_MAX_BYTES)}, and refuses the whole package if any one asset in it is over ${bytes(LIMITS.assetBytes)}.`,
        },
      ]
    }

    case "theme-setting-index":
      return [{
        kind: "table",
        head: ["Group", "Settings"],
        rows: THEME_SETTINGS_GROUPS.map((g) => [
          g.label,
          g.fields.length ? g.fields.map((f) => code(f.id)).join(", ") : GROUP_WITHOUT_FIELDS[g.id] ?? "",
        ]),
      }]

    case "font-options": {
      const typography = THEME_SETTINGS_GROUPS.find((g) => g.id === "typography")?.fields ?? []
      return [{
        kind: "table",
        head: ["Setting", "Default", "Choices"],
        rows: typography
          .filter((f) => Array.isArray(f.options))
          .map((f) => [
            `${f.label} (${code(f.id)})`,
            f.default ? String(f.default) : "the heading font",
            (f.options ?? []).filter((o) => o.value !== "").map((o) => o.label).join(", "),
          ]),
      }]
    }

    case "hub-map":
      return [{ kind: "hubmap", groups: hubMap() }]

    case "library-schema": {
      /* A section of the library, read from the file that ships, so the page cannot describe an older one. */
      const schema = arg ? DEFAULT_THEME_SOURCES[`sections/${arg}.storelib`]?.match(/^<schema>\n([\s\S]*?)\n<\/schema>/m)?.[1] : undefined
      if (!schema) return [{ kind: "paragraph", text: `Missing example: ${code(arg ?? "")}` }]
      return [{ kind: "code", lang: "json", code: schema, title: `sections/${arg}.storelib, its schema` }]
    }

    case "chrome-settings":
      if (arg === "header") return chromeSettingsTable(headerSchema as ChromeSchema)
      if (arg === "footer") return chromeSettingsTable(footerSchema as ChromeSchema)
      return [{ kind: "paragraph", text: `Missing: ${code(arg ?? "")}` }]

    case "default-pages":
      return [{
        kind: "table",
        head: ["Page", "Key", "Address"],
        rows: [
          ...(Object.keys(PAGE_META) as (keyof typeof PAGE_META)[]).map((k) => [
            PAGE_META[k].label,
            code(k),
            k === "product" ? code("/products/<slug>") : code(pagePath(k)),
          ]),
          ...POLICY_PAGES.map((p) => [p.title, code(p.key), code(`/${p.key}`)]),
          ["Cart", "built in", code("/cart")],
        ],
      }]

    case "theme-blocks": {
      /* The theme blocks that ship, read from their files: blocks/*.storelib. */
      const rows = Object.entries(DEFAULT_THEME_SOURCES as Record<string, string>)
        .filter(([path]) => /^blocks\/[^/]+\.storelib$/.test(path))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, src]) => {
          const json = src.match(/^<schema>\n([\s\S]*?)\n<\/schema>/m)?.[1]
          let schema: { name?: string; settings?: { id?: string; type?: string }[]; blocks?: { type?: string }[]; presets?: { name?: string }[] } = {}
          try { schema = json ? JSON.parse(json) : {} } catch { /* a file that does not parse is listed by its path */ }
          const holds = (schema.blocks ?? []).map((b) => code(String(b.type))).join(", ")
          return [
            code(path),
            schema.name ?? "",
            (schema.settings ?? []).filter((f) => f.id && f.type !== "header" && f.type !== "paragraph").map((f) => code(String(f.id))).join(", "),
            holds || "nothing",
            (schema.presets ?? []).map((p) => String(p.name)).join(", "),
          ]
        })
      return [{ kind: "table", head: ["File", "Name", "Settings", "Holds", "Presets"], rows }]
    }

    case "library-block": {
      const src = arg ? DEFAULT_THEME_SOURCES[`blocks/${arg}.storelib`] : undefined
      if (!src) return [{ kind: "paragraph", text: `Missing example: ${code(arg ?? "")}` }]
      const body = src.replace(/^\{#[\s\S]*?#\}\n/, "").trimEnd()
      return [{ kind: "code", lang: "storelib", code: body, title: `blocks/${arg}.storelib` }]
    }

    case "library-section": {
      const src = arg ? DEFAULT_THEME_SOURCES[`sections/${arg}.storelib`] : undefined
      if (!src) return [{ kind: "paragraph", text: `Missing example: ${code(arg ?? "")}` }]
      /* The note a library file opens with is for whoever edits it, and is left out here. */
      const body = src.replace(/^\{#[\s\S]*?#\}\n/, "").trimEnd()
      const noted = body.length !== src.trimEnd().length
      return [{
        kind: "details",
        summary: `The whole file, sections/${arg}.storelib${noted ? ", without the note at its top" : ""}`,
        children: [{ kind: "code", lang: "storelib", code: body, title: `sections/${arg}.storelib` }],
      }]
    }

    case "example": {
      const src = arg ? DEVELOPER_EXAMPLES[arg] : undefined
      if (!src) return [{ kind: "paragraph", text: `Missing example: ${code(arg ?? "")}` }]
      return [{ kind: "code", lang: "storelib", code: src.trimEnd(), title: `sections/${arg}.storelib` }]
    }

    case "ai-brief":
      return [{
        kind: "details",
        summary: "The full brief, word for word",
        children: [{ kind: "code", lang: "text", code: writeSectionRules() }],
      }]

    case "ai-topics-extra": {
      const brief = writeSectionRules()
      return ALL_TOPICS
        .filter((t) => !brief.includes(t.text))
        .map((t) => ({
          kind: "details" as const,
          summary: t.id.replace(/-/g, " "),
          children: [{ kind: "code" as const, lang: "text", code: t.text }],
        }))
    }

    case "builder-controls":
      return [{ kind: "specimens", items: controlSpecimens() }]

    case "theme-settings": {
      /* One group, or all of them, each under its own heading. */
      const groups = themeSettingGroups().filter((g) => !arg || g.id === arg)
      if (arg) return groups.flatMap((g) => [{ kind: "specimens" as const, items: g.items }])
      return groups.flatMap((g) => [
        { kind: "heading" as const, level: 3 as const, text: g.label, id: `settings-${g.id}` },
        { kind: "specimens" as const, items: g.items },
      ])
    }

    case "builder-schemes":
      return [{ kind: "schemes", schemes: builtInSchemes() }]

    case "builder-type-styles":
      return [{
        kind: "table",
        head: ["Style", "Key", "Font", "Weight", "Size, px (desktop / tablet / phone)", "Line height", "Letter spacing, px"],
        rows: typeStyleRows(),
      }]

    case "ai-loop":
      return [{
        kind: "list",
        ordered: true,
        items: [
          "Write the whole file.",
          "Compile it with the same compiler the code editor saves through. Every error comes back with its file and line.",
          "Check it against the section contract: the colour scheme, the phone layout, no sideways scroll, safe to place twice, reduced motion, real elements for anything interactive.",
          `Fix exactly what failed, quoting the errors back, and try again. The builder allows ${MAX_REPAIR_ATTEMPTS} attempts in all, then shows the person what is still wrong rather than keeping a file that does not compile.`,
          "Keep the file only when it compiles. A file that does not compile is never stored.",
        ],
      }]
  }
  return [{ kind: "paragraph", text: `Unknown directive: ${code(name)}` }]
}

/** A parsed page with every directive replaced by what it generates. */
export function expandAll(nodes: DocNode[]): DocNode[] {
  return nodes.flatMap((n) => (n.kind === "directive" ? expandDirective(n.name, n.arg) : [n]))
}
