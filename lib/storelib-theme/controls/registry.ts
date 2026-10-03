/**
 * ===========================================================================
 *  THE CONTROL REGISTRY
 * ===========================================================================
 * Every setting type a section may declare, in one place. This is the single
 * source of truth for what a setting IS:
 *
 *   • the editor reads it to know which control to draw,
 *   • the validator reads it to check a schema,
 *   • the AI reads it to know what it is allowed to ask for,
 *   • the docs are generated from it,
 *   • `storelib-controls.json` beside this file is emitted from it, and a
 *     test asserts the two never drift.
 *
 * A setting type that is not here does not exist. A theme cannot add one,
 * and a section cannot define an editor input of its own: it names one of
 * these, and the editor draws the one canonical component for it. That is
 * how an image picker looks the same in every section of every theme.
 *
 * Adding a type is adding an entry here. Changing what an existing type means
 * is a migration, never an edit — see docs/theme/13-versioning.md.
 */
import { z } from "zod"

import { cleanBackground, cleanFocalPoint, MENU_HANDLE, parseDatetime, parseVideoUrl, VIDEO_HOSTS } from "../values"
import { schemeTokenName } from "../color-schemes"

export const CONTROL_TYPES = [
  // ── values a person types or picks ──
  "text",
  "textarea",
  "richtext",
  "number",
  "toggle",
  "checkbox",
  "select",
  "radio",
  "range",
  "color",
  "color_scheme",
  "color_background",
  "font_picker",
  "alignment",
  "inline_richtext",
  "html",
  "datetime",
  "focal_point",
  // ── values that are references ──
  "image_picker",
  "image_gallery",
  "video_picker",
  "file_picker",
  "icon_picker",
  "url",
  "video_url",
  "page_picker",
  "product_picker",
  "product_list",
  "link_list",
  "community_picker",
  "collection_picker",
  "collection_list",
  // ── presentational: draw something, hold nothing ──
  "header",
  "paragraph",
  "divider",
] as const

export type ControlType = (typeof CONTROL_TYPES)[number]

/**
 * What a value of this type is, in plain terms. Drives the zod schema and the
 * docs, and tells the resolver how to treat it (an `asset` is turned into a
 * URL; `none` is never stored).
 */
export type ValueKind = "string" | "number" | "boolean" | "color" | "background" | "asset" | "asset_list" | "reference_list" | "enum" | "none"

export interface ControlDefinition {
  type: ControlType
  label: string
  description: string
  value: ValueKind
  /** Validates a stored value. `undefined` is always allowed: it means "use the default". */
  schema: z.ZodTypeAny
  /** What the setting holds when the schema gives no default of its own. */
  fallback: unknown
  /** May carry a value per breakpoint when the setting says `responsive: true`. */
  responsive: boolean
  /** The one React component that draws it. A key, not an import: the registry has no React in it. */
  component: string
  /** Which extra schema keys this type reads (beyond id/label/default/info). */
  accepts: string[]
  /** A copyable example for the docs. */
  example: Record<string, unknown>
}

const hex = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "a hex colour like #6366f1")
const assetRef = z.string().regex(/^asset:\/\/[a-f0-9]{16,64}$/, "an asset reference like asset://a18c…")
/** During migration a URL is still accepted where an asset is expected. */
const assetOrUrl = z.union([assetRef, z.string().url(), z.string().startsWith("/"), z.literal("")])
const alignment = z.enum(["left", "center", "right"])

const def = (d: ControlDefinition) => d

export const CONTROLS: Record<ControlType, ControlDefinition> = {
  text: def({
    type: "text",
    label: "Text",
    description: "A single line of text.",
    value: "string",
    schema: z.string().max(2000),
    fallback: "",
    responsive: false,
    component: "TextInput",
    accepts: ["placeholder"],
    example: { type: "text", id: "heading", label: "Heading", default: "Welcome" },
  }),
  textarea: def({
    type: "textarea",
    label: "Text area",
    description: "Several lines of plain text.",
    value: "string",
    schema: z.string().max(20000),
    fallback: "",
    responsive: false,
    component: "TextArea",
    accepts: ["placeholder"],
    example: { type: "textarea", id: "body", label: "Body" },
  }),
  richtext: def({
    type: "richtext",
    label: "Rich text",
    description: "Formatted text. Stored as sanitised HTML; output with the `raw` filter.",
    value: "string",
    schema: z.string().max(50000),
    fallback: "",
    responsive: false,
    component: "RichTextEditor",
    accepts: [],
    example: { type: "richtext", id: "content", label: "Content" },
  }),
  number: def({
    type: "number",
    label: "Number",
    description: "A number typed in.",
    value: "number",
    schema: z.number().finite(),
    fallback: 0,
    responsive: true,
    component: "NumberInput",
    accepts: ["min", "max", "step", "unit", "placeholder"],
    example: { type: "number", id: "columns", label: "Columns", min: 1, max: 6, default: 3 },
  }),
  toggle: def({
    type: "toggle",
    label: "Toggle",
    description: "On or off.",
    value: "boolean",
    schema: z.boolean(),
    fallback: false,
    responsive: false,
    component: "Toggle",
    accepts: [],
    example: { type: "toggle", id: "show_badge", label: "Show badge", default: true },
  }),
  checkbox: def({
    type: "checkbox",
    label: "Checkbox",
    description: "On or off, drawn as a checkbox. Prefer `toggle` for a single switch.",
    value: "boolean",
    schema: z.boolean(),
    fallback: false,
    responsive: false,
    component: "Checkbox",
    accepts: [],
    example: { type: "checkbox", id: "agree", label: "Require agreement" },
  }),
  select: def({
    type: "select",
    label: "Select",
    description: "One of a list, drawn as a dropdown.",
    value: "enum",
    schema: z.string(),
    fallback: "",
    responsive: false,
    component: "Select",
    accepts: ["options"],
    example: {
      type: "select",
      id: "layout",
      label: "Layout",
      options: [{ label: "Centre", value: "center" }, { label: "Split", value: "split" }],
      default: "center",
    },
  }),
  radio: def({
    type: "radio",
    label: "Radio",
    description: "One of a short list, every option visible.",
    value: "enum",
    schema: z.string(),
    fallback: "",
    responsive: false,
    component: "RadioGroup",
    accepts: ["options"],
    example: {
      type: "radio",
      id: "style",
      label: "Button style",
      options: [{ label: "Filled", value: "filled" }, { label: "Outline", value: "outline" }],
      default: "filled",
    },
  }),
  range: def({
    type: "range",
    label: "Range",
    description: "A number on a slider.",
    value: "number",
    schema: z.number().finite(),
    fallback: 0,
    responsive: true,
    component: "Slider",
    accepts: ["min", "max", "step", "unit"],
    example: { type: "range", id: "padding", label: "Padding", min: 0, max: 160, step: 4, unit: "px", default: 64, responsive: true },
  }),
  color: def({
    type: "color",
    label: "Colour",
    description: "A hex colour. The default may name a scheme colour, \"scheme.accent\", which the setting follows until somebody picks one.",
    value: "color",
    schema: z.union([
      hex,
      z.literal(""),
      z.string().refine((v) => schemeTokenName(v) !== null, "a scheme colour like scheme.accent"),
    ]),
    fallback: "",
    responsive: false,
    component: "ColorPicker",
    accepts: [],
    example: { type: "color", id: "background", label: "Background", default: "#ffffff" },
  }),
  color_scheme: def({
    type: "color_scheme",
    label: "Colour scheme",
    description: "One of the theme's named colour schemes, by key: the built-in white, light, dark, black and highlight (Light, Soft, Dark, Brand and Accent in the editor) or one the creator added. The editor offers every scheme the theme has; see docs/theme/16-design-tokens.md.",
    value: "enum",
    schema: z.string(),
    fallback: "white",
    responsive: false,
    component: "ColorSchemePicker",
    accepts: [],
    example: { type: "color_scheme", id: "scheme", label: "Colour scheme", default: "white" },
  }),
  color_background: def({
    type: "color_background",
    label: "Background",
    description: "A colour or a CSS gradient for something to sit on. Only colours, gradient functions, angles and stops: a value that could leave the declaration it is written in is refused.",
    value: "background",
    schema: z.string().max(600).refine((v) => v === "" || cleanBackground(v) !== "", "a colour or a linear, radial or conic gradient"),
    fallback: "",
    responsive: false,
    component: "BackgroundPicker",
    accepts: [],
    example: { type: "color_background", id: "backdrop", label: "Backdrop", default: "linear-gradient(135deg, #f8f9fa 0%, #e5e7eb 100%)" },
  }),
  inline_richtext: def({
    type: "inline_richtext",
    label: "Inline rich text",
    description: "One line of formatted text: bold, italic, underline and links, nothing that starts a new block. Stored as cleaned HTML; output with the `raw` filter.",
    value: "string",
    schema: z.string().max(4000),
    fallback: "",
    responsive: false,
    component: "InlineRichText",
    accepts: ["placeholder"],
    example: { type: "inline_richtext", id: "heading", label: "Heading", default: "Made <em>slowly</em>, by hand" },
  }),
  html: def({
    type: "html",
    label: "HTML",
    description: "Markup a creator pastes, such as an embed from another service. Cleaned on save against the custom HTML allow list: no script, no forms, frames only from known players. Output with the `raw` filter.",
    value: "string",
    schema: z.string().max(50000),
    fallback: "",
    responsive: false,
    component: "HtmlInput",
    accepts: ["placeholder"],
    example: { type: "html", id: "embed", label: "Embed code" },
  }),
  datetime: def({
    type: "datetime",
    label: "Date and time",
    description: "A date, or a date and a time, written as 2026-03-14 or 2026-03-14T23:00 with an optional zone such as +02:00. Read as written, never shifted to the server's time zone. Format it with the `date` filter.",
    value: "string",
    schema: z.string().max(40).refine((v) => v === "" || parseDatetime(v) !== null, "a date like 2026-03-14 or 2026-03-14T23:00"),
    fallback: "",
    responsive: false,
    component: "DateTimeInput",
    accepts: [],
    example: { type: "datetime", id: "ends_at", label: "Sale ends" },
  }),
  focal_point: def({
    type: "focal_point",
    label: "Focal point",
    description: "Where the important part of a picture is, as `object-position` reads it: \"30% 70%\". Name the picture setting it belongs to with `image`, and the editor lets the creator tap the spot on that picture.",
    value: "string",
    schema: z.string().max(20).refine((v) => v === "" || cleanFocalPoint(v) !== "", "two percentages, like 50% 30%"),
    fallback: "50% 50%",
    responsive: false,
    component: "FocalPointPicker",
    accepts: ["image"],
    example: { type: "focal_point", id: "image_focus", label: "Focus", default: "50% 30%" },
  }),
  font_picker: def({
    type: "font_picker",
    label: "Font",
    description: "A font family from the theme's font list.",
    value: "string",
    schema: z.string().max(120),
    fallback: "",
    responsive: false,
    component: "FontPicker",
    accepts: [],
    example: { type: "font_picker", id: "font", label: "Heading font", default: "Inter" },
  }),
  alignment: def({
    type: "alignment",
    label: "Alignment",
    description: "Left, centre or right.",
    value: "enum",
    schema: alignment,
    fallback: "left",
    responsive: true,
    component: "AlignmentPicker",
    accepts: [],
    example: { type: "alignment", id: "align", label: "Align", default: "center" },
  }),
  image_picker: def({
    type: "image_picker",
    label: "Image",
    description: "One image from the media library. Stored as an asset reference, rendered as a URL.",
    value: "asset",
    schema: assetOrUrl,
    fallback: "",
    responsive: false,
    component: "ImagePicker",
    accepts: [],
    example: { type: "image_picker", id: "image", label: "Image" },
  }),
  image_gallery: def({
    type: "image_gallery",
    label: "Image gallery",
    description: "Several images, in order.",
    value: "asset_list",
    schema: z.array(assetOrUrl).max(60),
    fallback: [],
    responsive: false,
    component: "ImageGallery",
    accepts: ["max"],
    example: { type: "image_gallery", id: "images", label: "Images", max: 12 },
  }),
  video_picker: def({
    type: "video_picker",
    label: "Video",
    description: "A video file from the media library, or a hosted video URL.",
    value: "asset",
    schema: assetOrUrl,
    fallback: "",
    responsive: false,
    component: "VideoPicker",
    accepts: [],
    example: { type: "video_picker", id: "video", label: "Background video" },
  }),
  file_picker: def({
    type: "file_picker",
    label: "File",
    description: "Any file from the media library.",
    value: "asset",
    schema: assetOrUrl,
    fallback: "",
    responsive: false,
    component: "FilePicker",
    accepts: [],
    example: { type: "file_picker", id: "download", label: "Downloadable file" },
  }),
  icon_picker: def({
    type: "icon_picker",
    label: "Icon",
    description: "One icon from Storelib's icon library, by name.",
    value: "string",
    schema: z.string().regex(/^[a-z0-9-]*$/, "an icon name like user-plus"),
    fallback: "",
    responsive: false,
    component: "IconPicker",
    accepts: [],
    example: { type: "icon_picker", id: "icon", label: "Icon", default: "zap" },
  }),
  url: def({
    type: "url",
    label: "Link",
    description: "Where something links to: a page of the site, a product, or any address.",
    value: "string",
    schema: z.string().max(2048),
    fallback: "",
    responsive: false,
    component: "LinkPicker",
    accepts: ["placeholder"],
    example: { type: "url", id: "button_url", label: "Button link", default: "/shop" },
  }),
  video_url: def({
    type: "video_url",
    label: "Video link",
    description: "A YouTube or Vimeo link, in any shape people paste: a watch page, a short link, a Shorts link or a player address. Anything else is refused. Show it with `src=\"{{ settings.video | embed }}\"` and the `embed` capability. `accept` narrows it to one host.",
    value: "string",
    schema: z.string().max(500).refine((v) => v === "" || parseVideoUrl(v) !== null, "a YouTube or Vimeo link"),
    fallback: "",
    responsive: false,
    component: "VideoUrlInput",
    accepts: ["accept", "placeholder"],
    example: { type: "video_url", id: "video", label: "Video", accept: ["youtube", "vimeo"] },
  }),
  page_picker: def({
    type: "page_picker",
    label: "Page",
    description: "One of the site's pages, by key.",
    value: "string",
    schema: z.string().max(120),
    fallback: "",
    responsive: false,
    component: "PagePicker",
    accepts: [],
    example: { type: "page_picker", id: "page", label: "Page" },
  }),
  product_picker: def({
    type: "product_picker",
    label: "Product",
    description: "One of the creator's products. Printed on its own it is the product's address, so `href=\"{{ settings.product | url }}\"` works as it always has; it also carries the product's live `title`, `price`, `compare_price`, `image`, `url` and `id`, read as `settings.product.title`, whenever the page knows that product.",
    value: "string",
    schema: z.string().max(200),
    fallback: "",
    responsive: false,
    component: "ProductPicker",
    accepts: [],
    example: { type: "product_picker", id: "product", label: "Product" },
  }),
  product_list: def({
    type: "product_list",
    label: "Product list",
    description: "Several of the creator's products, chosen and ordered by the creator, stored by id. The template receives them block-shaped, like `products`, with the live title, price and picture: `{% for block in settings.featured %}`. `limit` caps how many, 12 unless given, never more than 24.",
    value: "reference_list",
    schema: z.array(z.string().max(200)).max(24),
    fallback: [],
    responsive: false,
    component: "ProductListPicker",
    accepts: ["limit"],
    example: { type: "product_list", id: "featured", label: "Products", limit: 4 },
  }),
  link_list: def({
    type: "link_list",
    label: "Menu",
    description: "One of the site's menus, by handle. The template receives `{ handle, title, links }`, each link `{ title, url, links }` with every address already made safe. `main-menu` is the header's own links unless the creator made a menu of that name.",
    value: "string",
    schema: z.string().max(40).refine((v) => v === "" || MENU_HANDLE.test(v), "a menu handle like main-menu"),
    fallback: "",
    responsive: false,
    component: "MenuPicker",
    accepts: [],
    example: { type: "link_list", id: "menu", label: "Menu", default: "main-menu" },
  }),
  community_picker: def({
    type: "community_picker",
    label: "Community",
    description: "One of the creator's own communities, stored by id. Printed on its own it is the community page's address, so `href=\"{{ settings.community | url }}\"` works; it also carries the community's live `name`, `tagline`, `image` (the cover), `logo`, `members`, `members_label`, `posts`, `events` (upcoming), `price` and `join_label`, read as `settings.community.name`. Only a community that is the creator's own, published and public, while communities are on: any other id is empty, so `{% if settings.community.name %}` draws nothing for it.",
    value: "string",
    schema: z.string().max(120),
    fallback: "",
    responsive: false,
    component: "CommunityPicker",
    accepts: [],
    example: { type: "community_picker", id: "community", label: "Community" },
  }),
  collection_picker: def({
    type: "collection_picker",
    label: "Collection",
    description: "One of the creator's own collections, from Products › Collections, stored by id. Printed on its own it is the collection's address, `/collections/<handle>`, so `href=\"{{ settings.collection | url }}\"` works; it also carries `title`, `handle`, `description`, `image`, `url`, `products_count` and `products`, the first twelve of its published products block-shaped like `products`, read as `settings.collection.title`. Only a published collection of this creator's: any other id is empty, so `{% if settings.collection.title %}` draws nothing for it.",
    value: "string",
    schema: z.string().max(120),
    fallback: "",
    responsive: false,
    component: "CollectionPicker",
    accepts: [],
    example: { type: "collection_picker", id: "collection", label: "Collection" },
  }),
  collection_list: def({
    type: "collection_list",
    label: "Collection list",
    description: "Several of the creator's collections, chosen and ordered by the creator, stored by id. The template receives them block-shaped, `{% for block in settings.collections %}`, each `block.settings` holding the same fields a collection picker carries. A collection that is unpublished or gone is left out. `limit` caps how many, 12 unless given, never more than 24.",
    value: "reference_list",
    schema: z.array(z.string().max(120)).max(24),
    fallback: [],
    responsive: false,
    component: "CollectionListPicker",
    accepts: ["limit"],
    example: { type: "collection_list", id: "collections", label: "Collections", limit: 6 },
  }),
  header: def({
    type: "header",
    label: "Header",
    description: "A heading in the sidebar. Holds no value.",
    value: "none",
    schema: z.undefined(),
    fallback: undefined,
    responsive: false,
    component: "SettingsHeader",
    accepts: [],
    example: { type: "header", id: "hdr_content", label: "Content" },
  }),
  paragraph: def({
    type: "paragraph",
    label: "Paragraph",
    description: "A line of help text in the sidebar. Holds no value.",
    value: "none",
    schema: z.undefined(),
    fallback: undefined,
    responsive: false,
    component: "SettingsParagraph",
    accepts: ["content"],
    example: { type: "paragraph", id: "note", content: "Shown above the fold on every page." },
  }),
  divider: def({
    type: "divider",
    label: "Divider",
    description: "A rule between groups of settings. Holds no value.",
    value: "none",
    schema: z.undefined(),
    fallback: undefined,
    responsive: false,
    component: "SettingsDivider",
    accepts: [],
    example: { type: "divider", id: "div_1" },
  }),
}

/**
 * The names the existing theme JSON uses, mapped to the registry. These are
 * read on the way in and written back on the way out unchanged, so a
 * `.json` section that says `"type": "link"` still validates and still means
 * what it meant. New files should use the registry's names.
 */
export const LEGACY_TYPE_ALIASES: Record<string, ControlType> = {
  link: "url",
  image: "image_picker",
  video: "video_picker",
  icon: "icon_picker",
  font: "font_picker",
  spacing: "range",
}

/**
 * SHOPIFY'S NAMES, FOR THE SAME THINGS.
 *
 * Somebody bringing a section across from a Shopify theme writes the types
 * they know. Where Storelib has the same control under another name, the
 * name is accepted and means the Storelib control, so the schema validates
 * and the panel draws the right thing. Written back unchanged, like the
 * older names above.
 */
export const SHOPIFY_TYPE_ALIASES: Record<string, ControlType> = {
  text_alignment: "alignment",
  product: "product_picker",
  page: "page_picker",
  collection: "collection_picker",
  /*
    Shopify's `liquid` is markup with Liquid in it. Here the section's own
    template is where logic lives, so a `liquid` setting is an `html` one:
    the markup is kept, cleaned against the custom HTML allow list, and
    any Liquid tag in it is printed as the text it is, never run.
  */
  liquid: "html",
}

/**
 * SHOPIFY TYPES WITH NOTHING TO POINT AT HERE, AND WHY.
 *
 * Refused like any unknown type, but with the reason, because "not a
 * Storelib control" sends somebody looking for a spelling when the real
 * answer is that the thing it picks does not exist on Storelib.
 */
export const UNSUPPORTED_TYPES: Record<string, string> = {
  blog: "A Storelib website has no blog of its own yet, so there is no blog to pick.",
  article: "A Storelib website has no blog of its own yet, so there are no posts to pick.",
  metaobject: "Storelib has no metaobjects. Use blocks for repeated content.",
  metaobject_list: "Storelib has no metaobjects. Use blocks for repeated content.",
  color_scheme_group: "Colour schemes are the theme's, edited in Theme settings › Colors. A section picks one with color_scheme.",
}

export function resolveControlType(type: string): ControlType | null {
  if ((CONTROL_TYPES as readonly string[]).includes(type)) return type as ControlType
  return LEGACY_TYPE_ALIASES[type] ?? SHOPIFY_TYPE_ALIASES[type] ?? null
}

export function controlFor(type: string): ControlDefinition | null {
  const t = resolveControlType(type)
  return t ? CONTROLS[t] : null
}

/** Does this type hold a value at all? Headers, paragraphs and dividers do not. */
export function holdsValue(type: string): boolean {
  const c = controlFor(type)
  return !!c && c.value !== "none"
}

/**
 * The machine-readable form. Emitted to `storelib-controls.json` by
 * scripts/emit-controls.mjs and checked against it in tests, so what the
 * AI and the editor read from the file is what this registry says.
 */
export function controlsAsJson(): Record<string, unknown> {
  const types: Record<string, unknown> = {}
  for (const t of CONTROL_TYPES) {
    const c = CONTROLS[t]
    types[t] = {
      label: c.label,
      description: c.description,
      value: c.value,
      fallback: c.fallback,
      responsive: c.responsive,
      component: c.component,
      accepts: c.accepts,
      example: c.example,
    }
  }
  return {
    $comment: "Generated from lib/storelib-theme/controls/registry.ts. Do not edit by hand.",
    version: 1,
    types,
    legacy_aliases: LEGACY_TYPE_ALIASES,
    shopify_aliases: SHOPIFY_TYPE_ALIASES,
    unsupported: UNSUPPORTED_TYPES,
  }
}

/**
 * docs/theme/05-controls-reference.md, from the same registry. Rule 39: the
 * docs are generated from source, so the reference cannot describe a control
 * the code does not have, or leave out one it does.
 */
export function controlsAsMarkdown(): string {
  const lines: string[] = []
  lines.push("# Controls reference")
  lines.push("")
  lines.push("Generated from `lib/storelib-theme/controls/registry.ts` by `scripts/emit-controls.ts`. Do not edit by hand; edit the registry and run `npx tsx scripts/emit-controls.ts`.")
  lines.push("")
  lines.push("Every `type` a schema setting may use is here, and only these. A setting's `type` names one entry; the entry decides what the stored value may be, what the template sees when nothing was set, whether the setting may carry a value per breakpoint, and which editor control draws it. The same list is available as JSON at `lib/storelib-theme/controls/storelib-controls.json` for the AI and the editor.")
  lines.push("")
  lines.push("| Type | Holds | Default when unset | Responsive | Extra keys |")
  lines.push("| --- | --- | --- | --- | --- |")
  for (const t of CONTROL_TYPES) {
    const c = CONTROLS[t]
    lines.push(`| [\`${t}\`](#${t}) | ${c.value} | \`${JSON.stringify(c.fallback)}\` | ${c.responsive ? "yes" : "no"} | ${c.accepts.length ? c.accepts.map((a) => `\`${a}\``).join(", ") : ""} |`)
  }
  lines.push("")
  lines.push("## Legacy names")
  lines.push("")
  lines.push("The JSON schemas the builder shipped with used a few other names. They still validate, and mean:")
  lines.push("")
  for (const [from, to] of Object.entries(LEGACY_TYPE_ALIASES)) lines.push(`- \`${from}\` → \`${to}\``)
  lines.push("")
  lines.push("### Shopify names")
  lines.push("")
  lines.push("A schema written for a Shopify theme may use Shopify's names for the controls Storelib has under another name. They validate and mean:")
  lines.push("")
  for (const [from, to] of Object.entries(SHOPIFY_TYPE_ALIASES)) lines.push(`- \`${from}\` → \`${to}\``)
  lines.push("")
  lines.push("These Shopify types have nothing to point at on Storelib and are refused with the reason:")
  lines.push("")
  for (const [type, why] of Object.entries(UNSUPPORTED_TYPES)) lines.push(`- \`${type}\`: ${why}`)
  lines.push("")
  for (const t of CONTROL_TYPES) {
    const c = CONTROLS[t]
    lines.push(`## ${t}`)
    lines.push("")
    lines.push(`**${c.label}.** ${c.description}`)
    lines.push("")
    lines.push(`- Value: ${c.value}${c.value === "none" ? " (draws in the sidebar, stores nothing)" : ""}`)
    lines.push(`- Default when the schema gives none: \`${JSON.stringify(c.fallback)}\``)
    lines.push(`- Responsive: ${c.responsive ? "may carry `{desktop, tablet, mobile}` when the setting says `\"responsive\": true`" : "no"}`)
    lines.push(`- Editor control: \`${c.component}\``)
    if (c.accepts.length) lines.push(`- Reads these extra keys: ${c.accepts.map((a) => `\`${a}\``).join(", ")}`)
    lines.push("")
    lines.push("```json")
    lines.push(JSON.stringify(c.example, null, 2))
    lines.push("```")
    lines.push("")
  }
  return lines.join("\n")
}
