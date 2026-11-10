/**
 * ===========================================================================
 *  THE ANTI-AI-SLOP RULES, FOR EVERY PROMPT THAT DESIGNS SOMETHING
 * ===========================================================================
 * Andrew's rule for round O: every AI generation goes through the filters of
 * not creating AI slop. This is the text half of that filter, distilled from
 * the anti-AI-slop spec (the seven cardinal sins, the soft and polish tells,
 * "80% proven + 20% distinctive") and the design intelligence spec 8.1
 * (reject cliché COMBINATIONS, not single features), plus the look Andrew saw
 * on the first real agent build: the editorial-serif slop.
 *
 * The code half is lib/ai-builder/slop.ts (evaluateSlop / slopIssues), which
 * checks the same rules deterministically on the files a model writes and on
 * the page as it renders. The words here and the rule names there match, so a
 * finding the model gets back reads like the rule it was given.
 *
 * `designRulesFor(surface)` picks the right amount for each prompt. Every
 * string is a constant: the text sits in a prompt's cached prefix and must be
 * byte for byte the same on every call (prompt caching).
 *
 * Pure text. Browser safe. No em dashes (the rules forbid them in output, and
 * a prompt that uses them teaches them).
 */

export type DesignRulesSurface = "site_agent" | "section_writer" | "ask_edit" | "classic" | "sites_agent" | "other"

/** The P0 list: a site that does any of these is refused at finish. Same order as the slop engine's P0 rules. */
export const SEVEN_SINS = `THE SEVEN CARDINAL SINS (refused, the check runs on every file and on the rendered page):
1. Default Tailwind indigo or violet as the accent (#6366f1 #4f46e5 #4338ca #3730a3 #8b5cf6 #7c3aed #a855f7, bg-indigo-600 and friends). The accent comes from the site's tokens.
2. A two-stop "trust" gradient: purple to blue, blue to cyan, indigo to pink. A flat surface and intentional type beat it every time.
3. Emoji as icons or bullets (in a heading, a button, a list item, an icon slot). If an icon helps recognition, one inline SVG set, one stroke width, currentColor.
4. A hardcoded default face (Inter, Roboto, system-ui, Poppins...) on display text. Headings read the display token: var(--theme-font-heading).
5. A rounded card with a coloured left border. Drop the radius or the border.
6. Invented metrics and proof: "10x faster", "99.9% uptime", "98% satisfaction", "500+ happy clients", star ratings, testimonials, logos the store or creator did not supply.
7. Filler and instructions to the creator rendered to visitors: lorem ipsum, "feature one / two / three", "placeholder text", "sample content", and ANY editor instruction on the live page ("Add your portrait in the sidebar", "Upload an image", "Replace this", "Your name", "YOUR GYM", "PHOTO: YOUR NAME"). A missing fact is left out, or shown only in the editor inside {% if request.design_mode %}, never to a visitor.`

/** P1: each one counts toward a small warning budget; past it, finish is refused. */
export const SOFT_TELLS = `SOFT TELLS (warnings; too many of them together and the site is refused):
- The Hero, Features, Pricing, FAQ, CTA skeleton with no variation. Order sections by what this visitor needs and include at least one section only this business would have.
- Three equal rounded cards as the second section; a row of equal cards on every section.
- 20 to 24px radius and a soft shadow on everything. One radius system from the concept.
- A tiny uppercase label (eyebrow) above every heading. Use one where it carries information, not as decoration.
- Walls of pill badges and chips that repeat the heading.
- Placeholder image services (unsplash, placehold.co, picsum, placekitten). Image settings with the creator's own pictures, or a designed empty state in the editor.
- More than about 12 raw hex values outside the tokens; the accent used more than twice per screen.
- Decorative blobs, waves, orbs and glows that mean nothing.`

/** Spec 8.1: combinations, not single features. */
export const CLICHE_COMBINATIONS = `REJECT CLICHE COMBINATIONS, NOT SINGLE FEATURES. Each of these is fine alone when it fits; together they are the machine look and are refused unless the creator asked for that look:
- EDITORIAL-SERIF SLOP (the 2025-26 AI look): a huge italic display serif (Instrument Serif, Fraunces, Playfair, DM Serif, Cormorant) + cream or off-white background + mono all-caps eyebrows and captions + terracotta or rust accent + letter-spaced mono caps buttons. A personal trainer is not a literary magazine.
- SAAS-GRADIENT SLOP: purple or blue gradient glow + centred "Transform your X" hero + pill badge + three icon cards + floating dashboard mockup for a business with no dashboard.
- Identical layouts for a fitness coach, a photographer and a consultant. Generic stock photos of people smiling at laptops. Infinite reveal animations and perpetual marquees. Small low-contrast type in the name of minimalism.
Cards, gradients, shadows, serifs, cream and icons are all valid when the business and the composition call for them. The gate rejects the generic, unmotivated default, not creativity.`

/** Fit the business, not a style. */
export const BUSINESS_FIT = `FIT THE BUSINESS FIRST. The direction comes from who this is for and what they should do: a personal trainer is performance and energy, real photography of training, a booking action up front; a ceramicist is material and process; a law firm is plain, calm and exact. Pick type, colour, layout and motion for that, then make one move only this business could own.`

/** "How to add soul": 80% proven + 20% distinctive. */
export const SOUL = `80% PROVEN, 20% DISTINCTIVE. Use patterns people already understand for the 80%. Spend the 20% on: one bold visual move (a typography choice, a single colour decision, an unexpected proportion); voice and microcopy ("Book a first session" beats "Get started"); one micro-interaction worth remembering (a press that moves 2px, a number that counts up from real data); one detail only someone who knows this business would put there. If someone outside the project could not tell whose site a screenshot is from, it is a template: change it.`

const HONEST = `REAL DATA ONLY. Products, prices, reviews, numbers, logos, quotes and dates come from the store or the creator. When something is missing, design the section without it, or leave a labelled empty state that only the editor shows. Never print instructions to the creator on the page.`

const COPY = `COPY: specific, compact, the owner's own voice. Never: unlock, elevate, seamless, powerful, effortless, supercharge, transform, game changer, cutting edge, next level, empower, streamline, "Welcome to our website", "Learn more", "Get started today". No em dashes.`

const EDIT_RULES = `KEEP THE SITE'S OWN DIRECTION: change only what was asked, in the site's tokens, type and spacing. A change never introduces the defaults: no indigo or violet accent, no purple to blue gradient, no emoji icons, no hardcoded Inter or system-ui heading, no rounded card with a coloured left border, no invented numbers or quotes, no filler or instructions to the creator in visible text ("Add your photo", "Your name", "Replace this"); a missing fact stays out or goes in an editor-only empty state ({% if request.design_mode %}).`

/** The whole rule set, for the website agent's system prompt. */
export const DESIGN_RULES = [
  "ANTI-AI-SLOP RULES (checked in code on every file you write and on every rendered page; a P0 finding refuses finish)",
  BUSINESS_FIT,
  SEVEN_SINS,
  SOFT_TELLS,
  CLICHE_COMBINATIONS,
  HONEST,
  COPY,
  SOUL,
].join("\n\n")

const SECTION_WRITER = [
  "ANTI-AI-SLOP RULES (the file is checked in code before it is kept)",
  SEVEN_SINS,
  `ALSO AVOID: three equal rounded cards, 24px radius and a shadow on everything, a tiny uppercase eyebrow over every heading, pill badge walls, decorative blobs and waves, placeholder image services. Never the editorial-serif cliché (italic display serif + cream + mono caps captions + terracotta) or the SaaS-gradient cliché (purple glow + centred hero + pill + icon cards) unless the creator asked for that look.`,
  `SOUL: about 80% proven pattern, 20% distinctive choice: one bold move that fits this site, specific microcopy, real data only.`,
].join("\n\n")

const CLASSIC = [
  "ANTI-AI-SLOP RULES (checked in code after every section)",
  BUSINESS_FIT,
  SEVEN_SINS,
  `SKELETON: do not plan Hero, Features, Pricing, FAQ, CTA in that order and nothing else; do not open with a centred hero over three equal cards. Choose sections for this business, with at least one only it would have. Never the editorial-serif cliché (italic display serif + cream + mono caps captions + terracotta) or the SaaS-gradient cliché unless the creator asked for it.`,
  COPY,
].join("\n\n")

const SITES_AGENT = [
  "ANTI-AI-SLOP RULES FOR EVERY PAGE YOU BUILD",
  BUSINESS_FIT,
  SEVEN_SINS.replace("Headings read the display token: var(--theme-font-heading).", "Headings read the display font variable you defined, var(--font-display)."),
  SOFT_TELLS,
  CLICHE_COMBINATIONS,
  SOUL,
].join("\n\n")

const OTHER = [
  "ANTI-AI-SLOP RULES",
  `Never: an indigo or violet default accent, a purple to blue gradient, emoji as icons, Inter or system-ui as display type, a rounded card with a coloured left border, invented numbers or testimonials, filler copy or instructions to the creator in visible text. Avoid cliché combinations (italic serif + cream + mono caps + terracotta; purple glow + centred hero + pill + three icon cards) unless asked for. About 80% proven patterns, 20% one distinctive choice that fits this business.`,
  COPY,
].join("\n\n")

const BY_SURFACE: Record<DesignRulesSurface, string> = {
  site_agent: DESIGN_RULES,
  section_writer: SECTION_WRITER,
  ask_edit: `ANTI-AI-SLOP RULES\n\n${EDIT_RULES}`,
  classic: CLASSIC,
  sites_agent: SITES_AGENT,
  other: OTHER,
}

/**
 * The rule text for one prompt. Stable per surface (a constant string), so it
 * can sit in the cached system prefix. Unknown surfaces get the compact set.
 */
export function designRulesFor(surface: DesignRulesSurface): string {
  return BY_SURFACE[surface] ?? OTHER
}
