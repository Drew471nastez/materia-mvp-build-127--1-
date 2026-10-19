/**
 * ===========================================================================
 *  A SECTION THAT DOES WHAT WAS ASKED, NOT A SAFER ONE NEXT TO IT
 * ===========================================================================
 * Asked for "a section with the president of Romania's image and a flag, with
 * a CSS animation shimmering around Romania", the writer came back with a
 * picture and a paragraph. Every part of the request that was not a heading
 * and an image had been dropped, and nothing said so.
 *
 * Three things fix that, and all three are here so the section writer
 * (./write-section.ts) and the page assistant (./loop.ts) read the same words:
 *
 *   CREATIVE_RULES   what the format can actually do that a model forgets:
 *                    shapes drawn in inline SVG, real @keyframes, layers,
 *                    a photo slot the creator fills. With a worked example
 *                    that compiles and passes the strict gate
 *                    (tests/ask-images-u.test.ts holds it to that).
 *   THE PLAN         before a word of the file: what the picture shows, and
 *                    every element the creator named, one a line
 *                    (planRequest, readPlan).
 *   THE SELF CHECK   after the file compiles and draws: each named element,
 *                    present or missing, against the request and the picture,
 *                    and one refined file when anything is missing
 *                    (reviewRequest, readReview).
 *
 * Pure text and parsers. No provider, no database.
 */

/** The worked example: a flag drawn in SVG with a light sweeping across it, and a photo slot beside it. */
export const CREATIVE_EXAMPLE = `<template>
<section class="s fx" data-scheme="{{ settings.color_scheme }}" style="--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }}; --s-heading: {{ settings.heading_color }}; --s-accent: {{ scheme.accent }}; --s-pt: {{ settings.padding_top }}px; --s-pb: {{ settings.padding_bottom }}px; --fx-1: {{ settings.stripe_1 }}; --fx-2: {{ settings.stripe_2 }}; --fx-3: {{ settings.stripe_3 }};">
  <div class="fx__in">
    <figure class="fx__photo">
      {% if settings.portrait %}
        <img src="{{ settings.portrait | asset }}" alt="{{ settings.portrait_alt }}" width="640" height="800" loading="lazy">
      {% elsif page.in_editor %}
        <div class="fx__empty"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg><span>{{ settings.portrait_hint }}</span></div>
      {% endif %}
    </figure>
    <div class="fx__copy">
      <div class="fx__flag" role="img" aria-label="{{ settings.flag_label }}">
        <svg viewBox="0 0 3 2" preserveAspectRatio="none" aria-hidden="true"><rect class="fx__s1" x="0" width="1" height="2"/><rect class="fx__s2" x="1" width="1" height="2"/><rect class="fx__s3" x="2" width="1" height="2"/></svg>
        <span class="fx__shine" aria-hidden="true"></span>
      </div>
      <h2 class="fx__h">{{ settings.heading }}</h2>
      <p class="fx__p">{{ settings.text }}</p>
    </div>
  </div>
</section>
</template>

<style scoped>
.fx { container-type: inline-size; background: var(--s-bg); color: var(--s-text); }
.fx__in { display: grid; gap: 32px; max-width: var(--theme-page-width, 1200px); margin: 0 auto; padding: var(--s-pt) var(--theme-padding-x, 24px) var(--s-pb); align-items: center; }
@container (min-width: 760px) { .fx__in { grid-template-columns: 5fr 7fr; gap: 56px; } }
.fx__photo { margin: 0; aspect-ratio: 4 / 5; border-radius: var(--theme-image-radius, 16px); overflow: hidden; }
.fx__photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fx__empty { height: 100%; display: grid; place-content: center; gap: 8px; justify-items: center; border: 1px dashed var(--s-text); opacity: 0.6; font-size: 14px; }
.fx__empty svg { width: 48px; height: 48px; fill: none; stroke: var(--s-text); stroke-width: 1.5; }
.fx__flag { position: relative; width: min(100%, 360px); aspect-ratio: 3 / 2; border-radius: 10px; overflow: hidden; animation: fx-glow 3.2s ease-in-out infinite; }
.fx__flag svg { width: 100%; height: 100%; display: block; }
.fx__s1 { fill: var(--fx-1); } .fx__s2 { fill: var(--fx-2); } .fx__s3 { fill: var(--fx-3); }
.fx__shine { position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.55) 50%, transparent 70%); transform: translateX(-100%); animation: fx-sweep 2.8s ease-in-out infinite; }
@keyframes fx-sweep { to { transform: translateX(100%); } }
@keyframes fx-glow { 50% { box-shadow: 0 0 0 6px var(--s-accent); } }
.fx__h { margin: 24px 0 0; color: var(--s-heading); font-size: var(--section-heading-size, 40px); line-height: var(--section-heading-line-height, 1.1); font-weight: var(--section-heading-weight, 700); }
.fx__p { margin: 12px 0 0; font-size: 17px; line-height: 1.6; }
@media (prefers-reduced-motion: reduce) { .fx__flag, .fx__shine { animation: none; } }
</style>

<schema>
{
  "type": "flag_feature",
  "name": "Flag feature",
  "settings": [
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "white" },
    { "type": "image_picker", "id": "portrait", "label": "Portrait", "default": "" },
    { "type": "text", "id": "portrait_alt", "label": "Portrait description", "default": "Portrait" },
    { "type": "text", "id": "portrait_hint", "label": "Empty photo note", "default": "Add the portrait" },
    { "type": "text", "id": "flag_label", "label": "Flag description", "default": "Flag" },
    { "type": "color", "id": "stripe_1", "label": "Stripe 1", "default": "#002B7F" },
    { "type": "color", "id": "stripe_2", "label": "Stripe 2", "default": "#FCD116" },
    { "type": "color", "id": "stripe_3", "label": "Stripe 3", "default": "#CE1126" },
    { "type": "color", "id": "heading_color", "label": "Heading", "default": "scheme.heading" },
    { "type": "text", "id": "heading", "label": "Heading", "default": "A heading about this" },
    { "type": "text", "id": "text", "label": "Text", "default": "One or two sentences that say what this is." },
    { "type": "range", "id": "padding_top", "label": "Top padding", "min": 0, "max": 160, "step": 4, "unit": "px", "default": 80 },
    { "type": "range", "id": "padding_bottom", "label": "Bottom padding", "min": 0, "max": 160, "step": 4, "unit": "px", "default": 80 }
  ],
  "presets": [{ "name": "Flag feature" }]
}
</schema>`

/**
 * What the format can do, said plainly, with the example above. Stable text:
 * it sits in the cached prefix of both surfaces.
 */
export const CREATIVE_RULES = `BUILD WHAT WAS ASKED, ALL OF IT. A request is a list of things the creator wants to see. Every one of them is in the section you write, and nothing is swapped for a safer, plainer version. A flag is drawn, a map outline is drawn, an animation moves, a photo has its slot. If one part truly cannot be done in a section, build every other part and say in one line what you left out and why.

WHAT A SECTION CAN DRAW, BEYOND TEXT AND A PICTURE:
  SHAPES IN INLINE SVG. Flags, badges, icons, dividers, simple outlines and maps are <svg> in the template with a viewBox, drawn from rect, circle, path and polygon. Colour them from CSS classes (.part { fill: var(--fx-1) }) whose variables come from color settings, so a flag's own colours are colour settings with the flag's real hex values as defaults. A country outline is a simplified path in its own viewBox; a recognisable approximation is right, and say so in the plan. Decorative SVG gets aria-hidden="true"; one that means something sits in a wrapper with role="img" and an aria-label from a setting.
  REAL ANIMATION IN CSS. Write the motion the design needs. A shimmer can be a gradient band (transparent, rgba(255, 255, 255, 0.55), transparent) moved across with translateX on an overlay span; a glow a box-shadow or filter: drop-shadow pulsing on a keyframe; a gradient sweep is background-position animated over a background-size larger than the box; a float is translateY. Name keyframes with the section's own prefix. prefers-reduced-motion is a courtesy, not a requirement. No SMIL (<animate>) inside SVG: animate SVG parts with CSS classes.
  LAYERS. position: relative on the frame and absolute children (inset: 0) for an overlay, a light sweep, a badge on a photo, text over a picture. Use isolation: isolate on the frame when layers blend.
  A PHOTO THE CREATOR WILL PROVIDE. A person, a product, a place: an image_picker setting with default "" and a sensible size (width, height, aspect-ratio, object-fit: cover), and behind {% elsif page.in_editor %} a placeholder of the same shape that names what goes there ("Add the portrait"), from a text setting. Never a stock address and never a photo of a real person you invented. Their portrait is theirs to upload; Storelib offers them the upload once the section is on the page.
  REAL WORDS. Names, places and facts the creator gave go in the defaults as they gave them.

A WORKED EXAMPLE of all four, which compiles and passes every check (a photo slot, a three stripe flag in SVG coloured from settings, a light sweeping across it and a glow pulsing round it, both stopped for reduced motion):

${CREATIVE_EXAMPLE}`

/**
 * The same rules in brief, for the page assistant, which writes code less
 * often and pays for its prompt on every turn: no example, the facts only.
 */
export const CREATIVE_BRIEF = `WHEN YOU WRITE A SECTION'S CODE, design it: one heading size doing the work, body 16 to 18px at most 65 characters wide, one spacing scale (8, 16, 24, 32, 48, 64, 96), one primary action, an asymmetric split or a list before three identical cards, one column on a phone with the wide layout inside @container, and every visible word, picture, link and colour a setting the markup reads. BUILD EVERY PART THAT WAS ASKED FOR, never a plainer stand in: shapes, flags, icons and simple outlines as inline <svg> coloured from CSS classes whose variables come from color settings (a flag's colours are colour settings defaulting to its real hex values); motion as the CSS the design needs (a shimmer is a gradient band moved with translateX on an overlay span, a glow a pulsing box-shadow), prefers-reduced-motion a courtesy, never SMIL; layers with position: relative and absolute children; a photo the creator will provide as an image_picker with default "" and an in-editor placeholder of the same shape, then ask_creator for it with "Upload image" and "Paste image URL". Before you finish, list to yourself every element the creator named and check each is on the page.`

/**
 * ===========================================================================
 *  CRAFT, IN NUMBERS, AND WHAT A DESIGNED VERSION OF A COMMON ASK LOOKS LIKE
 * ===========================================================================
 * lib/storelib-ai/design.ts names the habits that make a page look machine
 * made. Naming them stops them; it does not say what to do instead, and a
 * model told only what to avoid writes the same three cards with less
 * decoration. So these are the defaults a designer starts from, as numbers,
 * and five of the asks that come in most, each as the generic answer and the
 * designed one. The section writer reads all of it (stable text, cached);
 * DESIGN_RUBRIC is what both surfaces score their work against before they
 * answer (reviewRequest, and selfCheckNote in ./loop.ts).
 */
export const DESIGN_CRAFT = `CRAFT, IN NUMBERS. Defaults for every decision nobody has made yet:
- TYPE. One heading size per section does the work. Body 16 to 18px at line-height 1.5 to 1.7, running at most about 65 characters wide (max-width: 36rem on paragraphs). Headings at line-height 1.05 to 1.2. A large heading is sized with clamp() so a long word fits a phone: font-size: clamp(32px, 6cqi, 64px). Letter-spacing only on small uppercase labels.
- SPACE. One scale: 4, 8, 12, 16, 24, 32, 48, 64, 96. Space inside a group is smaller than space between groups, so what belongs together reads together. The section's own top and bottom come from its padding settings.
- HIERARCHY. One thing a visitor reads first and one action they take. A second action is quieter (an outline or a text link), never a second primary button.
- LAYOUT FROM THE CONTENT. Two things side by side, three or four as a grid, more as a list or a slider with a clear rhythm. An odd count stays odd. An asymmetric split (5fr 7fr, an offset picture) reads designed; everything centred reads generated.
- PICTURES. A fixed frame (aspect-ratio) with object-fit: cover, so mixed photos line up. Corners match the site's buttons and cards.
- INTERACTION. Every link and button has a hover and a visible :focus-visible outline. Transitions of 150 to 250ms on transform and opacity only.
- PHONE. One column first; the wide layout inside @container (min-width: 760px). Touch targets 44px tall. Nothing wider than 100%.

WORKED EXAMPLES, THE GENERIC ANSWER AND THE DESIGNED ONE:
- FEATURES. Generic: three icon cards, a title and two lines each. Designed: a split, one sharp claim in the heading size on the left; on the right four benefits as a list, each a bold first phrase and one sentence, divided by hairline borders. One column on a phone.
- TESTIMONIALS. Generic: three identical cards with five stars. Designed: one quote large, in the heading font, with the person's name and what they bought; two shorter ones beside it in body size. Real quotes only; without them, slots the creator fills.
- PRICING. Generic: three equal boxes, the middle one glowing. Designed: the plans as columns of one table, names and prices on one baseline, the recommended plan marked by a filled button and a one word label, features as rows the eye can run across. Stacked cards on a phone.
- HERO. Generic: a centred headline, a subheading, two buttons on a gradient. Designed: the headline says what is sold and to whom, one primary button, the product or the person in a real picture taking half the width, and one line of proof under the button when there is real proof.
- FAQ. Generic: five one-line answers. Designed: the six questions buyers ask before paying (delivery, refunds, what is included, who it is for), answers of two or three sentences, the first open, in a narrow column beside a heading and a contact link.`

/** What both surfaces score their own work against before they answer. */
export const DESIGN_RUBRIC = `SCORE IT BEFORE YOU ANSWER, each line pass or fix:
1. Asked for: every element the creator named is there, none swapped for a plainer one.
2. Hierarchy: one clear first read and one primary action.
3. Type: sizes from one scale, body readable, the longest heading fits 390px.
4. Space: one spacing scale; groups tight inside and apart from each other.
5. Phone: one column at 390px, nothing sideways, touch targets 44px.
6. Settings: every visible word, picture, link and colour has a setting, and every setting changes something.
7. Native: colour scheme, theme fonts and buttons where they fit; live menus, products and checkout.
8. Not generic: no decoration without a reason, no filler copy, no three cards because three is usual.`

/** The rules for reading a picture closely, for both surfaces. */
export const IMAGE_FIDELITY_RULES = `WHEN A PICTURE IS ATTACHED, IT IS THE SPECIFICATION. Look at it before anything else and build it closely: the same layout and column widths, the same order, the same spacing rhythm, the same weight and size relationships in the type, the same colours (as colour settings defaulting to what you see when no scheme of this site is close), the same corner radii, borders and shadows, the same imagery in the same places, and the words you can read in it as the starting copy. Swap another business's name, logo and prices for this creator's own; keep everything else as you see it. Before you write, describe what you see; after you write, compare your section with the picture part by part and fix what differs. Complete: same counts, every icon (inline SVG) and line of text, a clean phone stack, no placeholders.`

/* ── the plan ─────────────────────────────────────────────────────────── */

/** What the writer is asked for first: a plan, not a file. */
export function planRequest(hasImages: boolean): string {
  return [
    "STEP 1 OF 3: PLAN. Do not write the file yet. Answer in exactly this shape, plain text, no markdown:",
    "NAME: the section's name, two to four words, about what it shows (\"Hero with flag\")",
    hasImages
      ? "SEE: what the picture shows, in order from top to bottom: the layout and columns, the spacing, the colours with hex values, the type sizes and weights, every image and icon and where it is, and every word you can read in it"
      : "",
    "ELEMENTS: one line each, starting with \"- \", every distinct thing the creator named or the picture shows (a photo, a flag, an animation, a heading, a button, a list of plans). Nothing they asked for may be missing from this list.",
    "BUILD: three to six lines: the layout, the settings and blocks it needs, how each animation or drawn shape is made.",
    "If this is not a section to build (a greeting, a question, or far too vague), answer REPLY: and the sentence instead, as the rules say.",
  ]
    .filter(Boolean)
    .join("\n")
}

export interface SectionPlan {
  name: string
  /** Every element named, one a line, for the self check. */
  elements: string[]
  /** What the picture shows, when one came. */
  seen: string
  /** The whole plan as the model wrote it, for the next turns. */
  text: string
}

/** The plan as the model wrote it, read leniently: a model that ignores the shape still planned. */
export function readPlan(text: string): SectionPlan {
  const clean = text.replace(/\r/g, "").trim()
  const field = (key: string) => {
    const m = new RegExp(`^${key}:\\s*(.*)$`, "im").exec(clean)
    return m ? m[1].trim() : ""
  }
  const name = field("NAME")
    .replace(/^["'“]|["'”]$/g, "")
    .replace(/[.!]+$/, "")
    .slice(0, 48)
  const at = clean.search(/^ELEMENTS:/im)
  const elements: string[] = []
  if (at >= 0) {
    const rest = clean.slice(at).split("\n").slice(1)
    for (const line of rest) {
      if (/^[A-Z]{3,}:/.test(line.trim())) break
      const item = line.replace(/^\s*[-*•\d.)]+\s*/, "").trim()
      if (item) elements.push(item.slice(0, 140))
    }
  }
  const seenAt = clean.search(/^SEE:/im)
  let seen = ""
  if (seenAt >= 0) {
    const after = clean.slice(seenAt + 4)
    const end = after.search(/^\s*(ELEMENTS|BUILD|NAME):/im)
    seen = (end >= 0 ? after.slice(0, end) : after).trim()
  }
  return { name, elements: elements.slice(0, 16), seen, text: clean }
}

/** The plan as the chat shows it: the elements, one a line, short. */
export function planForChat(plan: SectionPlan): string {
  if (plan.elements.length === 0) return ""
  return plan.elements
    .slice(0, 6)
    .map((e) => e.replace(/\s+/g, " ").slice(0, 80))
    .join("\n")
}

/** "New section: Hero with flag", or "New section" before it has a name. */
export function newSectionSubject(name: string): string {
  const n = name.replace(/\s+/g, " ").trim()
  return n ? `New section: ${n}` : "New section"
}

/** "Editing Pricing". */
export function editingSubject(name: string): string {
  const n = name.replace(/\s+/g, " ").trim()
  return n ? `Editing ${n}` : "Editing the page"
}

/* ── writing it, after the plan ───────────────────────────────────────── */

export function writeRequest(): string {
  return "STEP 2 OF 3: WRITE. Now write the whole file from your plan. Every element in ELEMENTS is in it. Answer with the file only."
}

/* ── the self check ───────────────────────────────────────────────────── */

/**
 * After the file compiles and draws: each element, present or missing, the
 * design rubric, and what the checks noted about the drawn section (a picture
 * with no size, a colour hard to read), then one refined file if anything is
 * missing or weak.
 */
export function reviewRequest(plan: SectionPlan | null, hasImages: boolean, notes: string[] = []): string {
  const list = plan?.elements.length ? plan.elements.map((e) => `- ${e}`).join("\n") : "- every thing the creator named in the request"
  return [
    "STEP 3 OF 3: CHECK YOUR FILE BEFORE IT IS KEPT. It compiles and draws. Now read it against the request" + (hasImages ? " and the picture" : "") + ", element by element:",
    list,
    hasImages ? "- the layout, spacing, colours, type and imagery of the picture" : "",
    "",
    DESIGN_RUBRIC,
    notes.length ? `\nTHE CHECKS ALSO FOUND, in the section as drawn:\n${notes.slice(0, 6).map((n) => `- ${n}`).join("\n")}` : "",
    "",
    "Answer in one of two ways:",
    "  OK, then one line per element saying where it is in the file. Only when every element is there, nothing differs and every rubric line passes.",
    "  Otherwise the whole corrected file and nothing else, starting with `<template>`. Change only what is missing or wrong; keep the setting ids and everything that already works.",
  ]
    .filter((l) => l !== "")
    .join("\n")
}

export type Review = { kind: "ok"; notes: string } | { kind: "file"; source: string } | { kind: "unclear" }

/** What the self check came back with. */
export function readReview(text: string): Review {
  const t = text.trim()
  if (/^OK\b/i.test(t)) return { kind: "ok", notes: t.replace(/^OK[.:!]?\s*/i, "").slice(0, 600) }
  const start = t.search(/<template>|\{#/)
  if (start >= 0 && /<schema>[\s\S]*<\/schema>/.test(t)) {
    const body = t.slice(start).replace(/\n```\s*$/, "").trim()
    return { kind: "file", source: body }
  }
  return { kind: "unclear" }
}

/**
 * The image settings a written section leaves for the creator to fill: what
 * the chat offers to upload once it is on the page. Read from the schema's
 * own settings (and its blocks' are left alone: a block's picture is one of
 * many, and the creator fills those in the panel).
 */
export function emptyImageSlots(schema: { settings?: { type?: string; id?: string; label?: string; default?: unknown }[] }): { setting: string; label: string }[] {
  return (schema.settings ?? [])
    .filter((s) => s?.type === "image_picker" && typeof s.id === "string" && (s.default === undefined || s.default === ""))
    .map((s) => ({ setting: String(s.id), label: String(s.label ?? s.id) }))
    .slice(0, 3)
}
