/**
 * Round O (O3): the anti-AI-slop engine, everywhere.
 *
 *   1. designRulesFor: every surface gets stable rule text (the cached
 *      prefix), the seven sins and the cliché combinations, no em dash.
 *   2. The seven cardinal sins (P0, finish refused): Tailwind indigo accent,
 *      two-stop trust gradient, emoji icons, a hardcoded default display face,
 *      the rounded card with a coloured left border, invented metrics, filler
 *      and instructions to the creator in visible text (editor-only empty
 *      states are fine).
 *   3. Soft and polish tells (P1 / P2): placeholder image services, raw hex,
 *      accent overuse, eyebrows over every heading, the Hero > Features >
 *      Pricing > FAQ > CTA skeleton, three equal cards second, radius and
 *      shadow everywhere, pill walls, decorative waves; the warning budget.
 *   4. Cliché COMBINATIONS (spec 8.1): the editorial-serif look Andrew saw on
 *      the personal trainer build is refused, on the files and on the
 *      rendered page; the same look ASKED FOR by the creator passes; the
 *      SaaS-gradient look is refused; the concept's own words warn early.
 *   5. Brief allowances: only the creator's words allow purple, emoji, the
 *      editorial serif or default fonts once a brief is known; "no purple"
 *      allows nothing.
 *   6. The section gates: compile-feedback's checkSectionSource (strict)
 *      refuses a section that tells the creator what to do; an edit is held
 *      only to what it brought; the classic pipeline's phrase check.
 *   7. Diversity: fingerprints, similarity, the soft novelty warning (never
 *      an error), malformed rows dropped.
 *   8. N4's 14 examples still pass the engine with a neutral concept and an
 *      empty brief.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-slop-o3.test.ts
 */
import { DESIGN_RULES, designRulesFor, type DesignRulesSurface } from "@/lib/storelib-ai/design-rules"
import {
  AI_DEFAULT_INDIGO,
  SLOP_WARNING_BUDGET,
  briefAllowances,
  conceptClicheIssues,
  creatorInstructionIn,
  evaluateSlop,
  isCream,
  isTerracotta,
  sectionRole,
  slopIssues,
  withoutEditorOnly,
  type SlopInput,
  type SlopReport,
} from "@/lib/ai-builder/slop"
import { NOVELTY_THRESHOLD, fingerprintSimilarity, noveltyIssues, readFingerprints, siteFingerprint, type SiteFingerprint } from "@/lib/ai-builder/novelty"
import { sectionSlopFindings } from "@/lib/website-builder/agent/slop-gate"
import { checkSectionSource } from "@/lib/website-builder/agent/compile-feedback"
import { allExamples, exampleById, knowledgeById, type VisualConcept } from "@/lib/storelib-ai/library"
import { librarySlop } from "@/lib/ai-builder/agent/knowledge"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 1200)}`}`)
  }
}

const has = (r: SlopReport, rule: string, severity?: "error" | "warn" | "info") => r.findings.some((f) => f.rule === rule && (!severity || f.severity === severity))
const rules = (r: SlopReport) => r.findings.map((f) => `${f.rule}:${f.severity}`)
const errorsOf = (input: SlopInput, concept?: VisualConcept | null) => slopIssues(input, concept).filter((i) => i.severity === "error")

/** A .storelib section file, as the agent writes one. */
const section = (name: string, html: string, css = "", settings = "[]") => ({
  path: `sections/${name}.storelib`,
  content: `<template>\n${html}\n</template>\n<style scoped>\n${css}\n</style>\n<schema>\n{ "name": "${name}", "type": "${name}", "settings": ${settings} }\n</schema>`,
})

/** A neutral concept: a grotesk, a white page, a deep green accent. */
const NEUTRAL: VisualConcept = {
  name: "Plain Ledger",
  mood: ["exact", "warm"],
  styles: ["swiss"],
  typeSystem: { display: "Archivo", body: "Work Sans", scaleRatio: 1.25 },
  palette: { mode: "light", background: "#ffffff", text: "#111111", muted: "#555555", accent: "#1d5c4a", accentUse: "the one action" },
  layout: { principles: ["flush left"], density: "balanced", radius: 2 },
  motion: { stance: "subtle", moves: [] },
  imagery: { direction: "real work in daylight", avoid: [] },
  signatureMoves: ["a numbered index"],
}

/* ── what Andrew saw: the personal trainer build ─────────────────────── */

const TRAINER_BRIEF = "Build me a website for my personal training business. I coach strength and mobility one to one and want people to book a first session."
const TRAINER_CONCEPT: VisualConcept = {
  ...NEUTRAL,
  name: "Beside You",
  styles: ["editorial"],
  typeSystem: { display: "Instrument Serif", body: "Inter", mono: "DM Mono", scaleRatio: 1.5, rule: "italic display, labels in mono caps tracked 0.14em" },
  palette: { mode: "light", background: "#f5efe6", text: "#1f1b16", muted: "#5d554b", accent: "#b4532a", accentUse: "the booking button" },
}
const TRAINER_HERO = section(
  "ai_hero_beside",
  `<section class="hero">
  <p class="hero__eyebrow">One to one coaching</p>
  <h1 class="hero__title">Strength training, <em>with someone beside you.</em></h1>
  <figure class="hero__photo"><div class="hero__ph">Add your portrait in the sidebar</div><figcaption class="hero__cap">PHOTO: YOUR NAME, YOUR GYM</figcaption></figure>
  <a class="hero__cta" href="/contact">BOOK A FIRST SESSION</a>
</section>`,
  `.hero { background: #f5efe6; padding: clamp(48px, 8vw, 120px) 24px; }
.hero__eyebrow { font-family: "DM Mono", monospace; text-transform: uppercase; letter-spacing: 0.14em; font-size: 13px; }
.hero__title { font-family: "Instrument Serif", serif; font-style: italic; font-size: clamp(48px, 9vw, 128px); letter-spacing: -0.02em; font-weight: 400; }
.hero__ph { background: #d9d4cc; aspect-ratio: 4 / 5; display: grid; place-items: center; }
.hero__cap { font-family: "DM Mono", monospace; text-transform: uppercase; letter-spacing: 0.12em; }
.hero__cta { background: #b4532a; color: #fff; font-family: "DM Mono", monospace; text-transform: uppercase; letter-spacing: 0.16em; padding: 16px 24px; }
@media (min-width: 900px) { .hero { display: grid; grid-template-columns: 1.2fr 1fr; } }`,
)
/* The same hero as a visitor gets it, drawn. */
const TRAINER_RENDERED = {
  page: "home",
  html: `<section class="hero"><p class="hero__eyebrow">One to one coaching</p><h1 class="hero__title">Strength training, <em>with someone beside you.</em></h1><figure class="hero__photo"><div class="hero__ph">Add your portrait in the sidebar</div><figcaption class="hero__cap">PHOTO: YOUR NAME, YOUR GYM</figcaption></figure><a class="hero__cta" href="/contact">BOOK A FIRST SESSION</a></section>`,
  css: TRAINER_HERO.content.split("<style scoped>")[1].split("</style>")[0],
}

/* A literary journal that ASKED for the editorial look, done with care: no instructions, real words, fluid type. */
const JOURNAL_BRIEF = "A site for our small literary journal: an editorial, magazine feel with a serif display face, warm paper colours and a reading list."
const JOURNAL = section(
  "ai_issue_cover",
  `<section class="cover">
  <p class="cover__issue">Issue 14, Autumn</p>
  <h1 class="cover__title">Letters from <em>the edge of the map</em></h1>
  <p class="cover__lede">Eleven stories about leaving and the places that stay with you.</p>
  <a class="cover__cta" href="/issues">Read the issue</a>
</section>`,
  `.cover { background: #f6f0e6; color: #1d1a16; padding: clamp(48px, 8vw, 128px) clamp(16px, 4vw, 48px); }
.cover__issue { font-family: "IBM Plex Mono", monospace; text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.875rem; }
.cover__title { font-family: "Instrument Serif", serif; font-style: italic; font-weight: 400; font-size: clamp(2.75rem, 7vw, 6.5rem); letter-spacing: -0.02em; line-height: 0.98; }
.cover__lede { font-size: 1.125rem; max-width: 38ch; }
.cover__cta { color: #a8431f; text-decoration: underline; text-underline-offset: 4px; }`,
)

async function main() {
  console.log("\n1. designRulesFor: stable rule text for every prompt")
  {
    const surfaces: DesignRulesSurface[] = ["site_agent", "section_writer", "ask_edit", "classic", "sites_agent", "other"]
    for (const s of surfaces) {
      const t = designRulesFor(s)
      check(`${s}: rule text, stable across calls`, t.length > 200 && t === designRulesFor(s))
      check(`${s}: no em dash`, !/—/.test(t))
      check(`${s}: names the indigo accent, emoji icons and instructions to the creator`, /indigo/i.test(t) && /emoji/i.test(t) && /(?:Add your|instructions? to the creator)/i.test(t), t.slice(0, 300))
    }
    check("the website agent gets the whole set: seven sins, soft tells, combinations, 80/20", DESIGN_RULES === designRulesFor("site_agent") && /SEVEN CARDINAL SINS/.test(DESIGN_RULES) && /SOFT TELLS/.test(DESIGN_RULES) && /EDITORIAL-SERIF SLOP/.test(DESIGN_RULES) && /80% PROVEN/.test(DESIGN_RULES))
    check("every Tailwind default indigo hex is in the rules", AI_DEFAULT_INDIGO.every((h) => DESIGN_RULES.includes(h)))
    check("the cliché combination names Andrew's look (italic serif, cream, mono caps, terracotta)", /italic display serif/i.test(DESIGN_RULES) && /cream/i.test(DESIGN_RULES) && /mono all-caps/i.test(DESIGN_RULES) && /terracotta/i.test(DESIGN_RULES))
    check("the Sites agent's rules speak of its own font variable, not Storelib's theme", /var\(--font-display\)/.test(designRulesFor("sites_agent")) && !/--theme-font-heading/.test(designRulesFor("sites_agent")))
    check("an edit is told to keep the site's own direction", /KEEP THE SITE'S OWN DIRECTION/.test(designRulesFor("ask_edit")))
  }

  console.log("\n2. the seven cardinal sins (P0)")
  {
    const indigo = evaluateSlop({ sources: [section("ai_a", `<section><h2>Plans</h2><a class="btn" href="/p">See plans</a></section>`, `.btn { background: #4f46e5; color: #fff; }`)] })
    check("a Tailwind indigo hex is an error", has(indigo, "indigo-accent", "error"), rules(indigo))
    check("as a P0", indigo.findings.find((f) => f.rule === "indigo-accent")?.tier === "P0")
    check("bg-indigo-600 in the markup too", has(evaluateSlop({ html: `<section><a class="bg-indigo-600 text-white" href="/">Go</a></section>` }), "indigo-accent", "error"))
    check("and an indigo accent token", has(evaluateSlop({ tokens: { colors: { accent: "#7C3AED" } as never } }), "indigo-accent", "error"))
    check("a considered purple is not Tailwind's", !has(evaluateSlop({ sources: [section("ai_a", `<section><h2>x</h2></section>`, `.a { color: #5b2a86; }`)] }), "indigo-accent"))
    check("allowed when the creator asked for purple", has(evaluateSlop({ brief: "A purple and gold site for my band", sources: [section("ai_a", `<section><h2>x</h2></section>`, `.btn { background: #7c3aed; }`)] }), "indigo-accent", "info"))
    check("not allowed by the model's own concept once the brief is known", has(evaluateSlop({ brief: "A site for my bakery", sources: [section("ai_a", `<section><h2>x</h2></section>`, `.btn { background: #7c3aed; }`)] }, { ...NEUTRAL, allow: ["purple"] }), "indigo-accent", "error"))

    const trust = evaluateSlop({ sources: [section("ai_hero", `<section class="hero"><h1>Your coach</h1></section>`, `.hero { background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%); }`)] })
    check("a purple to blue two-stop gradient is an error", has(trust, "trust-gradient", "error"), rules(trust))
    check("blue to cyan too", has(evaluateSlop({ sources: [section("ai_h", `<section><h1>x</h1></section>`, `.h { background: linear-gradient(90deg, #2563eb, #06b6d4); }`)] }), "trust-gradient", "error"))
    check("Tailwind from-indigo to-pink too", has(evaluateSlop({ html: `<section class="bg-gradient-to-r from-indigo-500 to-pink-500"><h1>x</h1></section>` }), "trust-gradient", "error"))
    check("a photo scrim is not a trust gradient", !has(evaluateSlop({ sources: [section("ai_h", `<section><h1>x</h1></section>`, `.h::after { background: linear-gradient(transparent, rgba(0, 0, 0, 0.6)); }`)] }), "trust-gradient"))
    check("a warm two stop is not the trust gradient", !has(evaluateSlop({ sources: [section("ai_h", `<section><h1>x</h1></section>`, `.h { background: linear-gradient(#f3a712, #e4572e); }`)] }), "trust-gradient"))

    const emoji = evaluateSlop({ html: `<section><h2>🚀 Fast setup</h2><p>Text</p></section>` })
    check("one emoji in a heading is an error", has(emoji, "emoji-icons", "error"), rules(emoji))
    check("an emoji in a button too", has(evaluateSlop({ html: `<section><button type="button">✨ Start</button></section>` }), "emoji-icons", "error"))
    check("an emoji in an icon slot too", has(evaluateSlop({ html: `<section><span class="icon">🎯</span><h3>Aim</h3></section>` }), "emoji-icons", "error"))
    check("a tick in a list is typography, not an emoji icon", !has(evaluateSlop({ html: `<section><ul><li>✓ Free returns</li></ul></section>` }), "emoji-icons"))
    check("emoji allowed when the creator asked for emoji", has(evaluateSlop({ brief: "a playful site with lots of emoji", html: `<section><h2>🚀 Fast</h2></section>` }), "emoji-icons", "info"))

    const inter = evaluateSlop({ sources: [section("ai_h", `<section><h1 class="t">Coach</h1></section>`, `h1 { font-family: Inter, sans-serif; font-size: clamp(40px, 6vw, 80px); letter-spacing: -0.02em; }`)] })
    check("Inter hardcoded on display text is an error", has(inter, "default-fonts", "error"))
    check("system-ui too", has(evaluateSlop({ sources: [section("ai_h", `<section><h1>Coach</h1></section>`, `h1 { font-family: system-ui; }`)] }), "default-fonts", "error"))
    const bound = evaluateSlop({ sources: [section("ai_h", `<section><h1>Coach</h1></section>`, `h1 { font-family: "Archivo", sans-serif; }`)] }, { ...NEUTRAL, typeSystem: { ...NEUTRAL.typeSystem, display: "Fraunces" } })
    check("a heading hardcoding another face than the concept's display is an error", has(bound, "default-fonts", "error"), rules(bound))
    check("reading the token is fine", !has(evaluateSlop({ sources: [section("ai_h", `<section><h1>Coach</h1></section>`, `h1 { font-family: var(--theme-font-heading); }`)] }, NEUTRAL), "default-fonts"))

    const card = evaluateSlop({ sources: [section("ai_c", `<section><div class="note"><h3>Tip</h3><p>Rest days count.</p></div></section>`, `.note { border-left: 4px solid var(--t-accent); border-radius: 12px; padding: 16px; }`)] })
    check("a rounded card with a coloured left border is an error", has(card, "left-border-card", "error"), rules(card))
    check("a left rule without the radius is fine", !has(evaluateSlop({ sources: [section("ai_c", `<section><blockquote class="q">x</blockquote></section>`, `.q { border-left: 2px solid #111111; }`)] }), "left-border-card"))
    check("Tailwind rounded-lg border-l-4 too", has(evaluateSlop({ html: `<section><div class="rounded-lg border-l-4 border-indigo-500 p-4">x</div></section>` }), "left-border-card", "error"))

    for (const claim of ["10x faster results", "99.9% uptime", "98% satisfaction", "3× more productive", "500+ happy clients"]) {
      check(`invented metric "${claim}" is an error`, has(evaluateSlop({ html: `<section><h2>Why us</h2><p>${claim}</p></section>` }), "fake-proof", "error"))
    }
    check("a number the store supplied is not invented", !has(evaluateSlop({ html: `<section><p>98% satisfaction</p></section>`, facts: { numbers: ["98"] } }), "fake-proof"))
    check("a real ingredient percentage is not a metric", !has(evaluateSlop({ html: `<section><p>With 2% salicylic acid</p></section>` }), "fake-proof"))

    for (const filler of ["Lorem ipsum dolor sit amet", "Feature one", "Placeholder text for the intro", "Sample content goes in this card"]) {
      check(`filler "${filler}" is an error`, has(evaluateSlop({ html: `<section><h2>x</h2><p>${filler}</p></section>` }), "placeholder-copy", "error"))
    }
    for (const told of ["Add your portrait in the sidebar", "Your Name", "YOUR GYM", "Replace this with your story", "Upload an image of your studio", "PHOTO: YOUR NAME, YOUR GYM", "Pick a photo in the theme settings"]) {
      check(`an instruction to the creator, "${told}", is an error`, has(evaluateSlop({ html: `<section><h2>About</h2><p>${told}</p></section>` }), "placeholder-copy", "error"))
    }
    check("in a schema default (the words a visitor reads) too", has(evaluateSlop({ sources: [section("ai_x", `<section><h2>{{ settings.caption }}</h2></section>`, "", `[{ "type": "text", "id": "caption", "label": "Caption", "default": "PHOTO: YOUR NAME, YOUR GYM" }]`)] }), "placeholder-copy", "error"))
    check("but not in a setting's label, info or placeholder (the editor's words)", !has(evaluateSlop({ sources: [section("ai_x", `<section><h2>{{ settings.caption }}</h2></section>`, "", `[{ "type": "image_picker", "id": "photo", "label": "Your portrait", "info": "Add your portrait in the sidebar", "placeholder": "Your Name" }]`)] }), "placeholder-copy"))
    check("an editor-only empty state is not visible copy (if request.design_mode)", !has(evaluateSlop({ sources: [section("ai_x", `<section>{% if section.settings.photo %}<img src="{{ section.settings.photo | asset }}" alt="">{% elsif request.design_mode %}<p>Add your portrait in the sidebar</p>{% endif %}</section>`)] }), "placeholder-copy"))
    check("nor inside if page.in_editor", !has(evaluateSlop({ html: `<section>{% if page.in_editor %}<p>Upload an image</p>{% endif %}<h2>Real</h2></section>` }), "placeholder-copy"))
    check("a form's 'Your name' label is not an instruction", !has(evaluateSlop({ html: `<section><form><label for="n">Your name</label><input id="n" name="name"></form></section>` }), "placeholder-copy"))
    check("withoutEditorOnly keeps the else branch a visitor sees", withoutEditorOnly(`a{% if request.design_mode %}EDITOR{% if x %}y{% endif %}{% else %}VISITOR{% endif %}b`).replace(/\{%[^%]*%\}/g, "") === "aVISITORb")
    check("filler is never excused, even by the brief", has(evaluateSlop({ brief: "editorial purple emoji", html: `<section><p>Add your portrait in the sidebar</p></section>` }), "placeholder-copy", "error"))
    check("creatorInstructionIn finds the phrase for the classic pipeline", creatorInstructionIn("<p>Add your portrait in the sidebar</p>") === "Add your portrait" || /Add your portrait|in the sidebar/.test(creatorInstructionIn("<p>Add your portrait in the sidebar</p>") ?? ""), creatorInstructionIn("<p>Add your portrait in the sidebar</p>"))
    check("and nothing in real copy", creatorInstructionIn("Book a first session. Strength and mobility, one to one, in Leeds.") === null)
  }

  console.log("\n3. soft and polish tells (P1 / P2) and the warning budget")
  {
    const cdn = evaluateSlop({ html: `<section><img src="https://images.unsplash.com/photo-1" alt="gym"></section>` })
    check("an unsplash image is a P1 warning", has(cdn, "stock-imagery", "warn") && cdn.findings.find((f) => f.rule === "stock-imagery")?.tier === "P1", rules(cdn))
    check("placehold.co in a CSS url() too", has(evaluateSlop({ sources: [section("ai_i", `<section><h2>x</h2></section>`, `.i { background-image: url(https://placehold.co/600x400); }`)] }), "stock-imagery"))

    const hexes = Array.from({ length: 14 }, (_, i) => `.c${i} { color: #${(0x101010 + i * 0x0a0b0c).toString(16).slice(0, 6)}; }`).join("\n")
    check("more than 12 raw hex values outside the tokens is a warning", has(evaluateSlop({ sources: [section("ai_h", `<section><h2>x</h2></section>`, hexes)] }), "raw-hex", "warn"))
    check("hex inside :root tokens does not count", !has(evaluateSlop({ sources: [section("ai_h", `<section><h2>x</h2></section>`, `:root { ${Array.from({ length: 14 }, (_, i) => `--c${i}: #${(0x202020 + i * 0x0a0b0c).toString(16).slice(0, 6)};`).join(" ")} }`)] }), "raw-hex"))

    const accent = `.a { color: var(--t-accent); } .b { border-color: var(--t-accent); } .c { background: var(--t-accent); } .d { outline-color: var(--t-accent); } .e { fill: var(--t-accent); } .f { text-decoration-color: var(--t-accent); }`
    check("the accent used six times in one section is a warning", has(evaluateSlop({ sources: [section("ai_h", `<section><h2>x</h2></section>`, accent)] }), "accent-overuse", "warn"))

    const eyebrows = `<section><p class="eyebrow">Programmes</p><h2>One</h2></section><section><p class="eyebrow">Coach</p><h2>Two</h2></section><section><p class="eyebrow">Prices</p><h2>Three</h2></section><section><p class="eyebrow">Contact</p><h2>Four</h2></section>`
    check("a tiny uppercase label above every heading is a warning", has(evaluateSlop({ html: eyebrows, css: `.eyebrow { text-transform: uppercase; font-size: 12px; }` }), "eyebrow-labels", "warn"))
    check("one label over one heading is fine", !has(evaluateSlop({ html: `<section><p class="eyebrow">New</p><h2>One</h2></section><section><h2>Two</h2></section><section><h2>Three</h2></section>`, css: `.eyebrow { text-transform: uppercase; }` }), "eyebrow-labels"))

    const skeleton = evaluateSlop({ sections: ["header", "ai_hero", "ai_features", "ai_pricing", "ai_faq", "ai_cta", "footer"].map((type) => ({ type })) })
    check("Hero > Features > Pricing > FAQ > CTA with nothing else is a warning", has(skeleton, "template-skeleton", "warn"), rules(skeleton))
    check("with sections only this business has, it is not", !has(evaluateSlop({ sections: ["ai_hero", "ai_timetable", "ai_features", "ai_coach_story", "ai_pricing", "ai_faq", "ai_cta"].map((type) => ({ type })) }), "template-skeleton"))
    check("sectionRole reads file names", sectionRole("sections/ai_pricing_plans.storelib") === "pricing" && sectionRole("ai_site_header") === "header" && sectionRole("ai_timetable") === "other")

    const cards = `<div class="perks">${[1, 2, 3].map((n) => `<div class="perk-card"><h3>P${n}</h3><p>t</p></div>`).join("")}</div>`
    const second = evaluateSlop({ sources: [section("ai_hero", `<section class="h"><h1>Coach</h1></section>`, `.h { min-height: 80svh; }`), section("ai_perks", `<section>${cards}</section>`, `.perks { display: grid; grid-template-columns: repeat(3, 1fr); } .perk-card { border-radius: 16px; }`)] })
    check("three equal rounded cards as the second section is a warning", has(second, "three-cards-second", "warn"), rules(second))

    const soft = Array.from({ length: 5 }, (_, i) => `.s${i} { border-radius: 24px; box-shadow: 0 8px 24px rgba(0,0,0,.08); }`).join("\n")
    check("24px radius and a shadow on everything is a warning", has(evaluateSlop({ sources: [section("ai_h", `<section><h2>x</h2></section>`, soft)] }), "radius-shadow", "warn"))
    check("a wall of pill badges is a warning", has(evaluateSlop({ html: `<section>${Array.from({ length: 7 }, (_, i) => `<span class="badge">Tag ${i}</span>`).join("")}<h2>x</h2></section>` }), "pills", "warn"))
    const waves = evaluateSlop({ html: `<section><svg class="wave" viewBox="0 0 10 1"></svg><h2>x</h2></section>` })
    check("a decorative wave is a P2 note", has(waves, "decorative-shapes", "info") && waves.findings.find((f) => f.rule === "decorative-shapes")?.tier === "P2", rules(waves))

    /* The budget: many P1 warnings together refuse finish. */
    const many: SlopInput = {
      sections: ["ai_hero", "ai_features", "ai_pricing", "ai_faq", "ai_cta"].map((type) => ({ type })),
      sources: [
        section("ai_hero", `<section class="h"><img src="https://images.unsplash.com/x" alt=""><h1>Coach</h1></section>`, `${hexes}\n${accent}\n${soft}\n.glass { backdrop-filter: blur(12px); }`),
        section("ai_features", eyebrows + `<section>${Array.from({ length: 7 }, (_, i) => `<span class="badge">Tag ${i}</span>`).join("")}</section>`, `.eyebrow { text-transform: uppercase; }`),
      ],
    }
    const warnings = evaluateSlop(many).findings.filter((f) => f.severity === "warn").length
    const issues = slopIssues(many)
    check(`more than ${SLOP_WARNING_BUDGET} P1 warnings add one error (slop.budget)`, warnings > SLOP_WARNING_BUDGET && issues.some((i) => i.code === "slop.budget" && i.severity === "error"), { warnings, codes: issues.map((i) => i.code) })
    check("within the budget, no budget error", !slopIssues({ html: `<section><img src="https://images.unsplash.com/x" alt=""><h2>x</h2></section>` }).some((i) => i.code === "slop.budget"))
    check("issues carry their tier in words", slopIssues({ html: `<section><h2>🚀 Go</h2></section>` }).some((i) => i.message.startsWith("[P0]")))
  }

  console.log("\n4. cliché combinations: what Andrew saw is refused")
  {
    const files = evaluateSlop({ brief: TRAINER_BRIEF, sources: [TRAINER_HERO] }, TRAINER_CONCEPT)
    check("the personal trainer hero: the editorial-serif combination is an error", has(files, "cliche-combo", "error"), rules(files))
    check("and its instructions to the creator are an error", has(files, "placeholder-copy", "error"))
    check("so slopIssues refuses finish", errorsOf({ brief: TRAINER_BRIEF, sources: [TRAINER_HERO] }, TRAINER_CONCEPT).some((i) => i.code === "slop.cliche-combo"))
    const ev = files.findings.find((f) => f.rule === "cliche-combo")!
    check("the finding names each part of the look", /display serif|italic/.test(ev.message) && /cream/.test(ev.message) && /mono/.test(ev.message) && /terracotta/.test(ev.message), ev.message)
    check("with no concept at all, the files alone are enough", has(evaluateSlop({ brief: TRAINER_BRIEF, sources: [TRAINER_HERO] }), "cliche-combo", "error"), rules(evaluateSlop({ brief: TRAINER_BRIEF, sources: [TRAINER_HERO] })))
    const page = evaluateSlop({ brief: TRAINER_BRIEF, rendered: [TRAINER_RENDERED] })
    check("the rendered page alone is refused too (combination and instructions)", has(page, "cliche-combo", "error") && has(page, "placeholder-copy", "error"), rules(page))
    check("the model's concept cannot allow it (allow is not the creator's words)", has(evaluateSlop({ brief: TRAINER_BRIEF, sources: [TRAINER_HERO] }, { ...TRAINER_CONCEPT, allow: ["centered-hero"] }), "cliche-combo", "error"))
    const real = await librarySlop({ files: [{ path: TRAINER_HERO.path, text: TRAINER_HERO.content }], concept: TRAINER_CONCEPT, capabilities: null, brief: TRAINER_BRIEF, rendered: [TRAINER_RENDERED], settings: { font_heading: "Instrument Serif", background_color: "#f5efe6", primary_color: "#b4532a" } })
    check("the agent's verify evaluator (librarySlop) refuses it with the brief, tokens and rendered page", real.some((i) => i.code === "slop.cliche-combo" && i.severity === "error") && real.some((i) => i.code === "slop.placeholder-copy" && i.severity === "error"), real.map((i) => i.code))
    check("the section gate refuses the hero file on its own (facts: instructions to the creator)", sectionSlopFindings(TRAINER_HERO.path, TRAINER_HERO.content, null, { brief: TRAINER_BRIEF }).some((f) => f.id === "slop-placeholder-copy"))

    const journal = evaluateSlop({ brief: JOURNAL_BRIEF, sources: [JOURNAL] }, { ...TRAINER_CONCEPT, name: "Edge of the Map", typeSystem: { display: "Instrument Serif", body: "Source Serif 4", mono: "IBM Plex Mono", scaleRatio: 1.5, rule: "italic display" }, palette: { ...TRAINER_CONCEPT.palette, background: "#f6f0e6", accent: "#a8431f" } })
    check("the same look, asked for by a literary journal, is excused (info)", has(journal, "cliche-combo", "info") && !has(journal, "cliche-combo", "error"), rules(journal))
    check("and the deliberate editorial site has no P0 at all", journal.findings.filter((f) => f.severity === "error").length === 0, rules(journal))
    check("the same journal file with no brief asking for it is refused", has(evaluateSlop({ brief: "A site for my plumbing business", sources: [JOURNAL] }), "cliche-combo"), rules(evaluateSlop({ brief: "A site for my plumbing business", sources: [JOURNAL] })))

    const saas = evaluateSlop({ html: `<section class="text-center bg-gradient-to-br from-indigo-500 to-blue-500"><span class="badge rounded-full">New</span><h1>Transform your workflow</h1><div class="blur-3xl"></div></section><section><div><svg class="icon"><path d=""/></svg><h3>A</h3><p>t</p></div><div><svg class="icon"><path d=""/></svg><h3>B</h3><p>t</p></div><div><svg class="icon"><path d=""/></svg><h3>C</h3><p>t</p></div></section>`, css: `.x { color: #6d28d9; } .y { color: #4338ca; }` })
    check("the SaaS-gradient combination is refused", has(saas, "cliche-combo", "error"), rules(saas))

    check("cream and terracotta are recognised", isCream("#f5efe6") && isCream("#efe3d6") && !isCream("#ffffff") && !isCream("#111111") && isTerracotta("#b4532a") && isTerracotta("#9c4f2e") && !isTerracotta("#1d5c4a"))
    check("cream alone, or a serif alone, is not a combination", !has(evaluateSlop({ sources: [section("ai_a", `<section class="a"><h1>Bread</h1></section>`, `.a { background: #f5efe6; }`)] }), "cliche-combo") && !has(evaluateSlop({ sources: [section("ai_b", `<section><h1 class="t">Bread</h1></section>`, `.t { font-family: "Fraunces", serif; }`)] }), "cliche-combo"))
    check("the concept's own words warn at plan time", conceptClicheIssues(TRAINER_CONCEPT, TRAINER_BRIEF).some((i) => i.code === "slop.cliche-combo" && i.severity === "warning"))
    check("not when the creator asked for the editorial look", conceptClicheIssues(TRAINER_CONCEPT, JOURNAL_BRIEF).length === 0)
    check("not for a neutral concept", conceptClicheIssues(NEUTRAL, TRAINER_BRIEF).length === 0)
  }

  console.log("\n5. brief allowances")
  {
    check("purple asked for", briefAllowances("A purple and gold site").has("purple"))
    check("\"no purple\" asks for nothing", !briefAllowances("No purple please, and nothing with gradients").has("purple") && !briefAllowances("no purple please").has("gradients") === true)
    check("\"without gradients\" asks for nothing", !briefAllowances("clean, without gradients").has("gradients"))
    check("editorial, magazine, serif ask for the editorial look", ["an editorial feel", "like a magazine", "serif headlines"].every((b) => briefAllowances(b).has("editorial")))
    check("a font asked for by name allows it", briefAllowances("set it in Inter please").has("default-fonts") && !briefAllowances("make it interactive").has("default-fonts"))
  }

  console.log("\n6. the section gates")
  {
    const base = exampleById("ai_marquee")!.source
    const told = base.replace(`<section class="mq"`, `<p class="mq__note">Add your portrait in the sidebar</p>\n<section class="mq"`)
    const ok = checkSectionSource({ path: "sections/ai_marquee.storelib", type: "ai_marquee", source: base, strict: true, brief: "" })
    check("the clean example passes the strict gate", ok.ok === true, ok)
    const refused = checkSectionSource({ path: "sections/ai_marquee.storelib", type: "ai_marquee", source: told, strict: true, brief: "" })
    check("an instruction to the creator in visible text refuses the save", refused.ok === false && /Anti-slop \(placeholder-copy\)/.test(refused.ok === false ? refused.feedback : ""), refused)
    const lenient = checkSectionSource({ path: "sections/ai_marquee.storelib", type: "ai_marquee", source: told, strict: true, lenient: true, brief: "" })
    check("still refused on a lenient pass: it is a fact, not a taste", lenient.ok === false && lenient.ok === false && lenient.reason === "structure", lenient)
    const already = checkSectionSource({ path: "sections/ai_marquee.storelib", type: "ai_marquee", source: told.replace("Add lines", "Add more lines"), before: told, strict: true, brief: "" })
    check("an edit is held only to what it brought (the file already had it)", already.ok === true, already)
    const indigoFile = base.replace("</style>", ".mq__item { color: #4f46e5; }\n</style>")
    check("a default indigo refuses the save", checkSectionSource({ path: "sections/ai_marquee.storelib", type: "ai_marquee", source: indigoFile, strict: true, brief: "" }).ok === false)
    check("unless the creator asked for purple", checkSectionSource({ path: "sections/ai_marquee.storelib", type: "ai_marquee", source: indigoFile, strict: true, brief: "make the words purple" }).ok === true)
    check("a default indigo is let through on a lenient pass (a taste, not a fact)", checkSectionSource({ path: "sections/ai_marquee.storelib", type: "ai_marquee", source: indigoFile, strict: true, lenient: true, brief: "" }).ok === true)
    check("not strict (Storelib's own files): no anti-slop gate", checkSectionSource({ path: "sections/ai_marquee.storelib", type: "ai_marquee", source: indigoFile, strict: false, brief: "" }).ok === true)
    check("numbers the creator typed are facts for the gate", sectionSlopFindings("sections/ai_s.storelib", section("ai_s", `<section><p>12 years coaching, 98% satisfaction</p></section>`).content, null, { brief: "say 98% satisfaction from my survey" }).length === 0)
  }

  console.log("\n7. diversity: fingerprints and the soft novelty warning")
  {
    const sources = { "sections/ai_hero.storelib": section("ai_hero", `<section class="h"><img src="{{ settings.image | asset }}" alt=""><h1>x</h1></section>`, `.h { display: grid; grid-template-columns: 1fr 1fr; }`).content }
    const home = ["ai_site_header", "ai_hero", "ai_features", "ai_pricing", "ai_faq", "ai_site_footer"].map((type) => ({ type }))
    const a = siteFingerprint({ home, sources, tokens: { colors: { background: "#f5efe6", accent: "#b4532a" } as never, fonts: { heading: "Instrument Serif", body: "Inter" } }, concept: TRAINER_CONCEPT })
    check("a fingerprint is short words only", a.v === 1 && a.order.join(",") === "hero,features,pricing,faq" && a.hero === "split+media" && a.palette === "light/cream/rust" && a.type === "serif/italic", a)
    check("the same site is 100% alike", fingerprintSimilarity(a, a) === 1)
    const b: SiteFingerprint = { v: 1, order: ["hero", "other", "testimonials", "other", "cta"], hero: "fullbleed+media", palette: "dark/dark/green", type: "condensed/caps" }
    check("a different site is not alike", fingerprintSimilarity(a, b) < 0.4, fingerprintSimilarity(a, b))
    const near = noveltyIssues(a, [b, { ...a, order: [...a.order, "other"] }])
    check("a near copy of a recent site is a warning", near.length === 1 && near[0].severity === "warning" && near[0].code === "slop.novelty", near)
    check("never an error", noveltyIssues(a, [a, a, a]).every((i) => i.severity === "warning"))
    check("no recent sites: nothing", noveltyIssues(a, []).length === 0 && noveltyIssues(a, [b]).length === 0)
    check("the threshold is soft (above 0.8)", NOVELTY_THRESHOLD > 0.8 && NOVELTY_THRESHOLD < 0.95)
    check("malformed rows from the database are dropped", readFingerprints([null, { v: 2 }, "x", a, { ...a, order: "no" }]).length === 1)
  }

  console.log("\n8. N4's examples still pass")
  {
    const ex = allExamples()
    check("14 examples", ex.length >= 14)
    for (const e of ex) {
      const errs = slopIssues({ sources: [{ path: `sections/${e.id}.storelib`, content: e.source }], brief: "" }, NEUTRAL).filter((i) => i.severity === "error")
      check(`${e.id}: no anti-slop error with an empty brief`, errs.length === 0, errs)
      /* The library is what the model copies: no italic display, no tiny uppercase eyebrow over a heading (round O). */
      const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(e.source)?.[1] ?? ""
      check(`${e.id}: no italic type for the model to copy`, !/font-style\s*:\s*italic/i.test(style))
      check(`${e.id}: no tracked uppercase label`, !/text-transform\s*:\s*uppercase[^}]*letter-spacing\s*:\s*0\.1|letter-spacing\s*:\s*0\.1\d?em[^}]*text-transform\s*:\s*uppercase/i.test(style))
    }
    const lib = knowledgeById("typography-type-library")
    check("the type library says the editorial-serif look is not the default", !!lib && /Not the default/.test(lib.body) && /only when the creator asked/i.test(lib.body))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
