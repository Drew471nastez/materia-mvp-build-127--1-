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

/**
 * Every AI surface that designs or edits a look. O6 wires them (lib/storelib-ai/surfaces.ts) with the names
 * fixed in its brief: editor_agent (Ask for a change), classic_planner and classic_fill; the shorter names
 * are kept as aliases (ask_edit = editor_agent, classic = classic_planner).
 */
export type DesignRulesSurface = "site_agent" | "section_writer" | "editor_agent" | "ask_edit" | "classic_planner" | "classic" | "classic_fill" | "sites_agent" | "other"
export type DesignSurface = DesignRulesSurface

/** The P0 list: a site that does any of these is refused at finish. Same order as the slop engine's P0 rules. */
export const SEVEN_SINS = `THE SEVEN CARDINAL SINS (refused, the check runs on every file and on the rendered page):
1. Default Tailwind indigo or violet as the accent (#6366f1 #4f46e5 #4338ca #3730a3 #8b5cf6 #7c3aed #a855f7, bg-indigo-600 and friends). The accent comes from the site's tokens.
2. A two-stop "trust" gradient: purple to blue, blue to cyan, indigo to pink. A flat surface and intentional type beat it every time.
3. Emoji as icons or bullets (in a heading, a button, a list item, an icon slot). If an icon helps recognition, one inline SVG set, one stroke width, currentColor.
4. A hardcoded default face (Inter, Roboto, system-ui, Poppins...) on display text. Headings read the display token: var(--theme-font-heading).
5. A rounded card with a coloured left border. Drop the radius or the border.
6. Invented metrics and proof: "10x faster", "99.9% uptime", "98% satisfaction", "500+ happy clients", star ratings, testimonials, logos the store or creator did not supply.
7. Filler and instructions to the creator rendered to visitors: lorem ipsum, "feature one / two / three", "placeholder text", "sample content". No instruction to the creator in the visible copy ("Add your portrait in the sidebar", "Upload an image", "Replace this", "Your name", "YOUR GYM", "PHOTO: YOUR NAME"). A missing fact is left out, or shown only in the editor inside {% if request.design_mode %}, never to a visitor.`

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
- Editorial serif slop (the 2025-26 AI look): a huge italic display serif (Instrument Serif, Fraunces, Playfair, DM Serif, Cormorant) + cream or off-white background + mono all-caps eyebrows and captions + terracotta or rust accent + letter-spaced mono caps buttons. A personal trainer is not a literary magazine.
- SAAS-GRADIENT SLOP: purple or blue gradient glow + centred "Transform your X" hero + pill badge + three icon cards + floating dashboard mockup for a business with no dashboard.
- Identical layouts for a fitness coach, a photographer and a consultant. Generic stock photos of people smiling at laptops. Infinite reveal animations and perpetual marquees. Small low-contrast type in the name of minimalism.
Cards, gradients, shadows, serifs, cream and icons are all valid when the business and the composition call for them. The gate rejects the generic, unmotivated default, not creativity.`

/** Fit the business, not a style. */
export const BUSINESS_FIT = `FIT THE BUSINESS FIRST. The direction comes from who this is for and what they should do: a personal trainer is performance and energy, real photography of training, a booking action up front; a ceramicist is material and process; a law firm is plain, calm and exact. Pick type, colour, layout and motion for that, then make one move only this business could own.`

/** "How to add soul": 80% proven + 20% distinctive. */
export const SOUL = `80% PROVEN, 20% DISTINCTIVE. Use patterns people already understand for the 80%. Spend the 20% on: one bold visual move (a typography choice, a single colour decision, an unexpected proportion); voice and microcopy ("Book a first session" beats "Get started"); one micro-interaction worth remembering (a press that moves 2px, a number that counts up from real data); one detail only someone who knows this business would put there. If someone outside the project could not tell whose site a screenshot is from, it is a template: change it.`

const HONEST = `REAL DATA ONLY. Products, prices, reviews, numbers, logos, quotes and dates come from the store or the creator. When something is missing, design the section without it, or leave a labelled empty state that only the editor shows. Never print instructions to the creator on the page.`

const COPY = `COPY: specific, compact, the owner's own voice. Never: unlock, elevate, seamless, powerful, effortless, supercharge, transform, game changer, cutting edge, next level, empower, streamline, "Welcome to our website", "Learn more", "Get started today". No em dashes.`

const EDIT_RULES = `KEEP THE SITE'S OWN DIRECTION: change only what was asked, in the site's tokens, type and spacing. A change never introduces the defaults: no indigo or violet accent, no purple to blue gradient, no emoji icons, no hardcoded Inter or system-ui heading, no rounded card with a coloured left border, no invented numbers or quotes, no filler or instructions to the creator in visible text ("Add your photo", "Your name", "Replace this"); a missing fact stays out or goes in an editor-only empty state ({% if request.design_mode %}). Never drift toward the editorial-serif cliché (italic display serif + cream background + mono caps captions + terracotta) or the SaaS-gradient cliché unless the creator asked for that look.`

/**
 * Round 56: the goal, said once, as a designer would hear it. The owner asked for output "like a top designer would
 * make, without so many filters", Awwwards calibre, different every time. The prohibitions below stay (the code
 * enforces them), but they are the floor, not the brief.
 */
export const DESIGN_STANDARD = `THE STANDARD: design this site the way the best independent studio you know would, for this one client. The bar is the work on curated galleries (Awwwards, Siteinspire, Godly): one clear idea carried through every page, type used as image, the client's real work or product as the hero, a rhythm of scale and density that changes on purpose, details that reward a second look, and a phone layout designed rather than shrunk. You have taste: use it. Decide, commit, and make one move nobody would expect from a generated site. Clean means considered, not empty.`

/**
 * Round 56: the machine look, said once. It replaces the four overlapping anti-slop lists the agent was given. A
 * technique on this list is not banned: it is the default a machine reaches for without a reason.
 */
export const MACHINE_LOOK = `THE MACHINE LOOK (what to avoid unless the concept chose it on purpose; any single technique can be right when the concept chose it, the combination without a reason is what reads as generated):
- Editorial serif slop: a huge italic display serif (Instrument Serif, Fraunces, Playfair, DM Serif, Cormorant) on cream or off-white, mono all-caps eyebrows and captions, a terracotta or rust accent, letter-spaced mono caps buttons. A personal trainer is not a literary magazine.
- SaaS-gradient slop: purple or blue gradient glow, a centred "Transform your X" hero, a pill badge, three icon cards, a floating dashboard for a business with no dashboard.
- Kit habits: rows of identical rounded cards, card inside card, bento grids, 20px corners and a soft shadow on everything, glass panels, an eyebrow over every heading, icons beside every label, walls of pills, decorative blobs and glows, every section the same width and padding.
- Sameness: the same layout for a coach, a photographer and a consultant; stock people smiling at laptops; perpetual marquees and reveal-on-everything; small grey text in the name of minimalism.`

/** The whole rule set, for the website agent's system prompt (round 56: the standard, the look to avoid, what the code refuses, the copy). */
export const DESIGN_RULES = [
  "DESIGN RULES (the code checks every file you write and every rendered page; a P0 finding refuses finish)",
  DESIGN_STANDARD,
  BUSINESS_FIT,
  MACHINE_LOOK,
  SEVEN_SINS,
  HONEST,
  COPY,
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

const FILL = [
  "ANTI-AI-SLOP RULES FOR THE WORDS YOU WRITE",
  `Specific to this business, in the owner's voice. Nothing invented: no metrics ("10x faster", "98% satisfaction"), ratings, testimonials, logos, prices or years in business the store or creator did not give. No filler (lorem ipsum, "feature one", "sample content") and no instruction to the creator in the visible copy ("Add your portrait in the sidebar", "Your name", "YOUR GYM", "Replace this"): leave a missing fact out. No emoji as icons.`,
  COPY,
].join("\n\n")

const EDIT = `ANTI-AI-SLOP RULES\n\n${EDIT_RULES}`

const BY_SURFACE: Record<DesignRulesSurface, string> = {
  site_agent: DESIGN_RULES,
  section_writer: SECTION_WRITER,
  editor_agent: EDIT,
  ask_edit: EDIT,
  classic_planner: CLASSIC,
  classic: CLASSIC,
  classic_fill: FILL,
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
