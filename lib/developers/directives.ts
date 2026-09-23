/**
 * ===========================================================================
 *  THE PARTS OF THE DOCUMENTATION THE FRAMEWORK WRITES ABOUT ITSELF
 * ===========================================================================
 * The prose in content/developers was written by a person. The reference
 * tables are not: every control type, filter, capability, limit, refused
 * construct, colour variable and text style is read here from the module that
 * enforces it, at the moment the page is drawn.
 *
 * That is not a nicety. The first survey for this hub found the hand-written
 * docs in docs/theme already out of date in two places, an `embed` filter and
 * an `embed` capability the compiler had grown and the prose never mentioned.
 * A table generated from the compiler cannot fall behind the compiler.
 *
 * Where a table needs words the engine does not carry (what a filter does in
 * a sentence, what a capability grants), those words are keyed here by the
 * engine's own names, and tests/developer-hub.test.ts fails the moment the
 * engine gains a name this file has not described.
 */
import { CONTROLS, CONTROL_TYPES, LEGACY_TYPE_ALIASES, type ValueKind } from "@/lib/storelib-theme/controls/registry"
import { EMBED_ALLOWED, FILTER_NAMES, FOREIGN_SYNTAX, FORBIDDEN_MARKUP } from "@/lib/storelib-theme/storelib/template"
import { CAPABILITIES, FORBIDDEN_IDENTIFIERS } from "@/lib/storelib-theme/storelib/script"
import { SCHEME_COLOR_KEYS, SCHEME_CSS_VARS } from "@/lib/storelib-theme/color-schemes"
import { FONT_ROLES, TYPE_STYLE_KEYS, TYPE_STYLE_LABELS } from "@/lib/storelib-theme/typography"
import { ENGINE_VERSION, LIMITS, SECTION_SCHEMA_VERSION, THEME_FORMAT_VERSION } from "@/lib/storelib-theme/types"
import { ALL_TOPICS, MAX_REPAIR_ATTEMPTS, writeSectionRules } from "@/lib/storelib-ai"

import { DEVELOPER_EXAMPLES } from "./content.generated"
import type { DocNode } from "./markdown"

/* ── words the engine does not carry, keyed by the engine's own names ────── */

export const FILTER_DOCS: Record<string, { use: string; does: string }> = {
  default: { use: `{{ settings.label | default: "Shop" }}`, does: "The argument when the value is empty, `null` or `false`." },
  upcase: { use: `{{ settings.tag | upcase }}`, does: "Upper case." },
  downcase: { use: `{{ settings.tag | downcase }}`, does: "Lower case." },
  capitalize: { use: `{{ settings.name | capitalize }}`, does: "The first letter in upper case." },
  strip: { use: `{{ settings.name | strip }}`, does: "Removes spaces from both ends." },
  size: { use: `{{ blocks | size }}`, does: "How many items a list has, or characters a string has." },
  first: { use: `{{ blocks | first }}`, does: "The first item of a list, or the first character of a string." },
  last: { use: `{{ blocks | last }}`, does: "The last item of a list, or the last character of a string." },
  join: { use: `{{ settings.tags | join: " · " }}`, does: "A list joined into one string, with `, ` unless given another separator." },
  truncate: { use: `{{ settings.text | truncate: 80 }}`, does: "Cut to that many characters, 50 unless given, ending with `…` or the second argument." },
  append: { use: `{{ settings.price | append: " each" }}`, does: "Adds the argument to the end." },
  prepend: { use: `{{ settings.code | prepend: "#" }}`, does: "Adds the argument to the start." },
  replace: { use: `{{ settings.text | replace: "old", "new" }}`, does: "Replaces every occurrence of the first argument with the second." },
  plus: { use: `{{ forloop.index | plus: 1 }}`, does: "Adds a number." },
  minus: { use: `{{ settings.count | minus: 1 }}`, does: "Subtracts a number." },
  times: { use: `{{ settings.columns | times: 2 }}`, does: "Multiplies by a number." },
  divided_by: { use: `{{ settings.width | divided_by: 2 }}`, does: "Divides by a number. Dividing by zero gives 0." },
  round: { use: `{{ settings.ratio | round: 2 }}`, does: "Rounds to that many decimal places, 0 unless given." },
  json: { use: `data-config="{{ settings | json }}"`, does: "The value as JSON, escaped for an attribute." },
  escape: { use: `{{ settings.text | escape }}`, does: "HTML-escaped. Output already is, so this is rarely needed." },
  raw: { use: `{{ settings.body | raw }}`, does: "Printed without escaping. Only on a `richtext` setting, which was cleaned before it was stored." },
  url: { use: `href="{{ settings.link | url }}"`, does: "Keeps a link starting `/`, `http://`, `https://`, `mailto:`, `tel:` or `#`, keeps an empty value empty, and turns anything else into `#`. Use it on every link built from a setting." },
  embed: { use: `src="{{ settings.video | embed }}"`, does: "A player address from a pasted YouTube, Vimeo, Spotify or SoundCloud link, or an empty string. Needs the `embed` capability." },
  asset: { use: `{{ block.settings.clip | asset }}`, does: "An `asset://` reference as the URL this account serves it from. A plain URL passes through." },
  alpha: { use: `{{ settings.color | alpha: 0.4 }}`, does: "A hex colour at that opacity, as `rgba()`." },
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
  assetBytes: "One asset",
  filesPerPackage: "Files in a theme package",
  packageBytes: "A theme package",
}

const VALUE_WORDS: Record<ValueKind, string> = {
  string: "text",
  number: "a number",
  boolean: "true or false",
  color: "a hex colour",
  asset: "an asset",
  asset_list: "a list of assets",
  enum: "one of its options",
  none: "nothing; it only draws in the panel",
}

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

/** The example files, by type, for anything that wants to check them. */
export function exampleTypes(): string[] {
  return Object.keys(DEVELOPER_EXAMPLES).sort()
}

/* ── the directives ───────────────────────────────────────────────────────── */

export const DIRECTIVE_NAMES = [
  "limits", "filters", "refusals", "controls", "legacy-controls", "scheme-vars", "type-styles",
  "embed-hosts", "forbidden", "capabilities", "versions", "example", "ai-brief", "ai-topics-extra", "ai-loop",
] as const

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
            "An unclosed `{{` or `{%`, an `{% if %}` without `{% endif %}`, an unknown tag, an unknown filter, or a malformed expression.",
            "A name the schema does not declare, such as `{{ settings.headng }}`.",
          ],
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
          head: ["Type", "What it is", "Holds", "Responsive"],
          rows: CONTROL_TYPES.map((t) => {
            const c = CONTROLS[t]
            return [code(t), c.description, VALUE_WORDS[c.value], c.responsive ? "yes" : "no"]
          }),
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
          ["The engine", String(ENGINE_VERSION), "The engine gains something a theme can require."],
          ["The section schema format", String(SECTION_SCHEMA_VERSION), "The `<schema>` JSON gains or changes a key. Written as `schema_version`."],
          ["The theme package format", String(THEME_FORMAT_VERSION), "The layout of a `.storelib-theme` file changes."],
          ["A section", "its own `version`", "Its author says so. `migrations` refer to it."],
        ],
      }]

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
