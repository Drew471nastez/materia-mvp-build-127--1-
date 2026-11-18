/**
 * ROUND 56 (worker b): DESIGN QUALITY OF WHAT BOTH ENGINES GENERATE
 *
 *   1. Palettes: every pair a visitor reads is readable before a palette lands
 *      (lib/storelib-ai/palette-contrast.ts), lightness moved, hue kept, the
 *      brand colour kept for fills and large type; the creator's own colours
 *      never moved. Wired into the agent's set_tokens, templates/apply and
 *      the native plan.
 *   2. Classification: the main action by trade and the creator's own words;
 *      consultancies, coaches and designers read as what they are.
 *   3. The AI-look check, recalibrated: sizes per section, round controls,
 *      opaque bars, hover, and what the starting template shipped with.
 *   4. The prompts: the standard once, the machine look once, the brief as
 *      starting material, one motion level, smaller floors.
 *   5. Variety: a seeded home order per site, recent directions and recipes
 *      avoided across creators, and the native engine's novelty pressure,
 *      measured on the six eval businesses.
 *   6. The eval's new checks.
 */
import { repairPalette, palettePairs, ratioOf, mutedAndBorderFor } from "@/lib/storelib-ai/palette-contrast"
import { tokensToThemeSettings, themeSettingsToTokens } from "@/lib/ai-builder/tokens"
import { tokensToThemeSettings as agentTokensToSettings } from "@/lib/ai-builder/agent/tokens"
import { SITE_TEMPLATES } from "@/lib/storelib-ai/templates/registry"
import { tokensFor } from "@/lib/storelib-ai/templates/apply"
import { chooseTemplate } from "@/lib/storelib-ai/templates/choose"
import { ART_DIRECTIONS } from "@/lib/storelib-ai/direction/directions"
import { briefFrom, ctaFromWords, leadingObjective } from "@/lib/storelib-ai/direction/brief"
import { chooseDirection, chooseFreshDirection } from "@/lib/storelib-ai/direction/choose"
import { evaluateSlop, slopIssues, opaqueEnough } from "@/lib/ai-builder/slop"
import { DESIGN_RULES, DESIGN_STANDARD, MACHINE_LOOK } from "@/lib/storelib-ai/design-rules"
import { AGENT_SYSTEM, PROMPT_VERSION, BANNED_WORDS } from "@/lib/ai-builder/agent/prompts"
import { STUDIO_CRAFT } from "@/lib/website-builder/ai-site/craft"
import { MIN_HOME_DISTINCT, MIN_HOME_SECTIONS, MIN_PAGE_SECTIONS } from "@/lib/ai-builder/agent/site-plan"
import { layoutStoryFor } from "@/lib/storelib-ai/layout/stories"
import { NATIVE_PROMPT_VERSION, NATIVE_RULES, nativeTurn, recentBlock } from "@/lib/website-builder/ai-site/native/generate"
import { mergeTokens, readableTokens } from "@/lib/website-builder/ai-site/native/plan"
import { brainFingerprint, leastLikeRecent, nativeDesign } from "@/lib/website-builder/ai-site/native/engine"
import { designBrainFor, varySpine, BRAIN_VERSION, RECIPES } from "@/lib/storelib-ai/library/brain"
import { fingerprintSimilarity, NOVELTY_THRESHOLD, type SiteFingerprint } from "@/lib/ai-builder/novelty"
import { readRecentDesigns } from "@/lib/ai-builder/recent-designs"
import { EVAL_SCENARIOS } from "@/lib/ai-builder/eval/scenarios"
import { checkPalette, checkSlopLook } from "@/lib/ai-builder/eval/checks"
import { CHECKS, type EvalSite } from "@/lib/ai-builder/eval/types"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import type { DesignTokens } from "@/lib/ai-builder/types"
import { nativeRegistry } from "@/lib/website-builder/ai-site/native/registry"
import { SCENARIOS as NATIVE_SCENARIOS } from "./native-engine-r2-fixtures"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)

const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return h * 60
}

async function main() {
  section("1. Palettes: readable pairs, hue kept, the brand kept")
  /* The native fitness site's palette as round R shipped it: a lime link on light grey, 1.03:1. */
  const lime = { background: "#f2f2ef", surface: "#e4e4df", text: "#141414", muted: "#686867", accent: "#d7ff3a", accentText: "#f2f2ef", border: "#d0d0cc", inverse: { background: "#0e1011", text: "#f1f2ee", accent: "#c8f031" } }
  check("the lime accent read 1.03:1 before", Math.abs(ratioOf(lime.accent, lime.background) - 1.03) < 0.02)
  const fixed = repairPalette(lime)
  check("after repair every one of the 9 pairs is readable", fixed.unresolved.length === 0 && palettePairs(fixed.colors).length === 9, fixed.unresolved)
  check("the accent as a link reads 4.5:1 or more", ratioOf(fixed.colors.accent, lime.background) >= 4.5)
  check("its hue is kept (within 6 degrees)", Math.abs(hue(fixed.colors.accent) - hue(lime.accent)) < 6, [fixed.colors.accent])
  check("the brand colour stays as brand", fixed.colors.brand === "#d7ff3a")
  check("the ground the designer chose is never moved", fixed.colors.background === lime.background && fixed.colors.surface === lime.surface)
  check("each move is one plain sentence, no em dash", fixed.moves.length >= 2 && fixed.moves.every((m) => !/—/.test(m)) && fixed.moves.filter((m) => /^accent /.test(m)).every((m) => /1\.03:1/.test(m) && /4\.\d+:1/.test(m)))
  const good = repairPalette({ background: "#ffffff", surface: "#f3f5f6", text: "#13202b", muted: "#51606d", accent: "#0d6b63", accentText: "#ffffff", border: "#dde3e7" })
  check("a palette that already reads is left exactly as it is", good.moves.length === 0 && !good.colors.brand)
  const locked = repairPalette(lime, { lock: ["accent"] })
  check("a colour the creator set (locked) is never moved; the pair is reported instead", locked.colors.accent === lime.accent && locked.unresolved.some((p) => p.id === "accent/background:link"))
  check("with the accent locked, the button label still becomes readable on it", ratioOf(locked.colors.accentText, lime.accent) >= 4.5)
  const tokens: DesignTokens = { colors: fixed.colors, fonts: { heading: "Archivo", body: "Inter" }, radius: { small: 4, medium: 4, large: 8 }, spacing: { scale: 1, sectionY: 96, pageWidth: 1280, gutter: 24 }, motion: { level: "subtle" } }
  const settings = tokensToThemeSettings(tokens, {})
  const schemes = settings.color_schemes as Record<string, Record<string, string>>
  check("the accent band is filled with the brand colour, with a label that reads on it", schemes.highlight.background === "#d7ff3a" && ratioOf(schemes.highlight.text, "#d7ff3a") >= 4.5)
  check("links on the dark band use the brand where it reads there", schemes.black.link === "#d7ff3a" && ratioOf("#d7ff3a", lime.inverse.background) >= 4.5)
  check("buttons and links on the page use the repaired accent", schemes.white.primary_button_background === fixed.colors.accent && settings.link_color === fixed.colors.accent)
  check("the brand is a token for large type and decoration (var(--t-brand))", (settings.custom_tokens as Record<string, string>).brand === "#d7ff3a")
  check("Theme settings read back carry the brand", themeSettingsToTokens(settings).colors.brand === "#d7ff3a")
  const agentMapped = agentTokensToSettings({ colors: fixed.colors }, {})
  check("the agent's mapping keeps the brand token and the band link", ((agentMapped.settings.custom_tokens ?? {}) as Record<string, string>).brand === "#d7ff3a" && ((agentMapped.settings.color_schemes as Record<string, Record<string, string>>).site_inverse.link === "#d7ff3a"))
  /* Every template with every direction's palettes lands readable. */
  let landed = 0
  const unreadable: string[] = []
  for (const t of SITE_TEMPLATES) {
    for (const d of ART_DIRECTIONS)
      for (const p of d.palettes) {
        const out = tokensFor(t, { palette: { ...p, inverse: p.inverse }, fonts: { display: "Archivo", body: "Inter" }, primary: d } as never)
        landed++
        const bad = palettePairs(out.colors).filter((x) => !x.ok)
        if (bad.length) unreadable.push(`${t.id}/${d.id}: ${bad.map((b) => b.id).join(",")}`)
      }
  }
  check(`every template with every direction palette lands with 9 readable pairs (${landed} combinations)`, unreadable.length === 0, unreadable.slice(0, 5))
  /* The native plan: muted and border mixed for the model's own background. */
  const brainTokens: DesignTokens = { ...tokens, colors: { background: "#0e1011", surface: "#1a1d1f", text: "#f1f2ee", muted: "#a3a9a4", accent: "#c8f031", accentText: "#0e1011", border: "#2b3033" } }
  const merged = mergeTokens(brainTokens, { theme: { palette: { background: "#f2f2ef", surface: "#e4e4df", text: "#141414", heading: "#0d0d0d", accent: "#d7ff3a", button: "#141414", button_text: "#f2f2ef" }, fonts: { heading: "", body: "" } } } as never)
  check("a dark brain's muted grey is not laid under a light model background", merged.colors.muted !== "#a3a9a4" && ratioOf(merged.colors.muted, "#f2f2ef") >= 4.5)
  const readable = readableTokens(merged)
  check("the native plan's tokens are repaired and each move is logged", palettePairs(readable.tokens.colors).every((p) => p.ok) && readable.moves.some((m) => /accent/.test(m)))
  const mb = mutedAndBorderFor({ background: "#ffffff", text: "#111111" })
  check("muted and border mixed from the palette's own ink and paper", ratioOf(mb.muted, "#ffffff") >= 4.5 && ratioOf(mb.border, "#ffffff") > 1.1)

  section("2. Classification: the main action by trade, in the creator's words")
  for (const sc of EVAL_SCENARIOS) {
    const b = briefFrom(sc.prompt, sc.category ? { category: sc.category } : null)
    check(`${sc.id}: ${b.business.kind} / ${b.story} / ${b.objective} ("${b.cta}")`, sc.expect.kinds.includes(b.business.kind) && sc.expect.stories.includes(b.story) && (sc.expect.objectives as string[]).includes(b.objective))
  }
  const photo = briefFrom(EVAL_SCENARIOS.find((s) => s.id === "photography")!.prompt, { category: "photographer" })
  check("a photographer who takes commissions and sells a few prints leads with the commission", photo.objective === "enquire" && photo.cta === "Enquire about a commission")
  const consulting = briefFrom(EVAL_SCENARIOS.find((s) => s.id === "consulting")!.prompt)
  check("consulting is a professional service with the creator's own action", consulting.story === "local-professional" && consulting.cta === "Book an intro call")
  check("a fitness coach's free consultation is the call to action", briefFrom(EVAL_SCENARIOS[0].prompt, { category: "fitness_coach" }).cta === "Book a free consultation")
  check("an executive coach is a professional service", briefFrom("Executive coaching for first time managers. Book a discovery call.").business.kind === "professional")
  check("a brand designer is a studio, not a product brand", briefFrom("I'm a brand designer in Leeds making identities for small food businesses.").story === "agency")
  check("a skincare shop still sells", briefFrom("A luxury skincare brand. Sell the face oil and serum online.").objective === "buy")
  check("leadingObjective: a service trade puts the enquiry before the shop", leadingObjective("photography", ["buy", "enquire"]) === "enquire" && leadingObjective("fashion", ["enquire", "buy"]) === "buy")
  check("ctaFromWords names the thing booked", ctaFromWords("people can book a shoot", "book") === "Book a shoot" && ctaFromWords("we sell things", "buy") === null)
  check("a barber's template no longer starts a consultancy", chooseTemplate(consulting).template?.id !== "salon-chair")

  section("3. The AI-look check, recalibrated (P0 unchanged)")
  const sec = (name: string, sizes: number[]) => ({ path: `sections/ai_${name}.storelib`, content: `<template><section class="s"><h2>Hi</h2></section></template><style scoped>${sizes.map((n, i) => `.s .x${i}{font-size:${n}px}`).join("")}</style><schema>{"name":"x","settings":[]}</schema>` })
  const many = Array.from({ length: 6 }, (_, i) => sec(`s${i}`, [12 + i, 14 + i, 18 + i, 24 + i, 32 + i, 48 + i]))
  const typo = evaluateSlop({ sources: many }).findings.filter((f) => f.rule === "typography" && f.severity === "warn")
  check("six sections of six sizes each are not 'too many sizes' (judged per section)", typo.length === 0)
  check("one section with 16 sizes still is", evaluateSlop({ sources: [sec("big", Array.from({ length: 16 }, (_, i) => 10 + i * 3))] }).findings.some((f) => f.rule === "typography" && f.severity === "warn"))
  const roundCss = Array.from({ length: 8 }, (_, i) => `.icon-btn-${i}{width:44px;height:44px;border-radius:999px}`).join("") + ".cart-count{min-width:17px;height:17px;border-radius:999px}"
  check("round icon buttons and the cart count are not pills", !evaluateSlop({ html: "<div></div>", css: roundCss }).findings.some((f) => f.rule === "pills" && f.severity !== "info"))
  check("real pill badges still are", evaluateSlop({ html: "<div></div>", css: Array.from({ length: 7 }, (_, i) => `.tag-${i}{padding:4px 12px;border-radius:999px}`).join("") }).findings.some((f) => f.rule === "pills" && f.severity === "warn"))
  check("blur behind a 92% opaque docked bar is not glass", opaqueEnough("background: color-mix(in srgb, var(--s-bg) 92%, transparent); backdrop-filter: blur(12px)") && !evaluateSlop({ html: "<div></div>", css: ".dock{background:color-mix(in srgb, var(--s-bg) 92%, transparent);backdrop-filter:blur(12px)}" }).findings.some((f) => f.rule === "glass"))
  check("a see-through frosted panel still is glass", evaluateSlop({ html: "<div></div>", css: ".card{background:rgba(255,255,255,0.2);backdrop-filter:blur(20px)}" }).findings.some((f) => f.rule === "glass"))
  const hover = `<template><a class="a">x</a></template><style scoped>.a{color:var(--t-accent)} .a:hover{color:var(--t-accent)} .a:focus-visible{outline-color:var(--t-accent)} .b:hover{background:var(--t-accent)} .c:focus{border-color:var(--t-accent)} .d:active{color:var(--t-accent)} .e:hover{color:var(--t-accent)}</style><schema>{"name":"x","settings":[]}</schema>`
  check("hover and focus colours are not accent overuse", !evaluateSlop({ sources: [{ path: "sections/ai_x.storelib", content: hover }] }).findings.some((f) => f.rule === "accent-overuse"))
  const sevenWarnings = { html: "<div></div>", css: [".g{background:rgba(255,255,255,.2);backdrop-filter:blur(9px)}", Array.from({ length: 7 }, (_, i) => `.t${i}{padding:2px 9px;border-radius:999px}`).join("")].join("") }
  const warns = evaluateSlop(sevenWarnings).findings.filter((f) => f.severity === "warn").map((f) => f.rule)
  const noBase = slopIssues(sevenWarnings, null, { budget: 1 })
  const withBase = slopIssues(sevenWarnings, null, { budget: 1, baseline: warns })
  check("over the budget without a baseline", noBase.some((i) => i.code === "slop.budget"), warns)
  check("what the starting template shipped with is reported, tagged, and not counted", !withBase.some((i) => i.code === "slop.budget") && withBase.filter((i) => /from the starting template/.test(i.message)).length === warns.length)
  const p0 = slopIssues({ html: "<h1 style=\"color:#6366f1\">x</h1>", css: ".a{color:#6366f1}" }, null, { baseline: ["indigo-accent"] })
  check("a P0 error is never excused by a baseline", p0.some((i) => i.severity === "error" && i.code === "slop.indigo-accent"))
  const counts = SITE_TEMPLATES.map((t) => ({ id: t.id, n: evaluateSlop({ sources: Object.entries(t.files).map(([path, content]) => ({ path, content })), tokens: t.tokens }).findings.filter((f) => f.severity === "warn").length }))
  check("every starting template ships with at most 3 of the 6 allowed warnings (was 5 or 6)", counts.every((c) => c.n <= 3), counts)

  section("4. The prompts")
  check("the version is r56", PROMPT_VERSION === "2026-11-r56" && NATIVE_PROMPT_VERSION === "native-r56" && BRAIN_VERSION === "r1.2")
  check("the standard is said once, Awwwards calibre", AGENT_SYSTEM.split(DESIGN_STANDARD).length === 2 && /Awwwards/.test(DESIGN_STANDARD))
  check("the machine look is said once, and allows any technique the concept chose", AGENT_SYSTEM.split(MACHINE_LOOK).length === 2 && /any single technique can be right when the concept chose it/.test(MACHINE_LOOK))
  check("the studio's craft list is not repeated in the agent's prompt", !AGENT_SYSTEM.includes(STUDIO_CRAFT) && !/NEVER THE EASY DEFAULT/.test(AGENT_SYSTEM))
  check("purple is named at most twice (was four times)", (AGENT_SYSTEM.match(/purple/gi) ?? []).length <= 2)
  check("the brief is starting material, the model decides", /THE BRIEF IS STARTING MATERIAL, NOT A SPEC/.test(AGENT_SYSTEM) && /you decide/.test(AGENT_SYSTEM))
  check("no '10 or more sections' and no contradiction with cutting sections", !/10 or more/.test(AGENT_SYSTEM) && /usually 6 to 12/.test(AGENT_SYSTEM))
  check("the floors: home 6 (5 distinct), other pages 3", MIN_HOME_SECTIONS === 6 && MIN_HOME_DISTINCT === 5 && MIN_PAGE_SECTIONS === 3)
  check("the prompts carry no em dash", !/—/.test(AGENT_SYSTEM) && !/—/.test(NATIVE_RULES) && !/—/.test(DESIGN_RULES))
  const visible = AGENT_SYSTEM.replace(/Never write:[^\n]*/g, "").replace(/Never: unlock[^\n]*/g, "")
  check("the banned words appear only in the lists that ban them", BANNED_WORDS.filter((w) => w !== "transform").every((w) => !new RegExp(`\\b${w}\\b`, "i").test(visible)))
  const story = layoutStoryFor({ prompt: "A personal trainer in Leeds" })
  check("the site story is ingredients, not a numbered order", /pantry, not a recipe/.test(story.text) && !/^1\. /m.test(story.text))
  check("one motion level: the story takes the brain's when given", layoutStoryFor({ prompt: "A personal trainer" }, { motion: "quiet" }).motion === "quiet")
  const fitBrief = briefFrom(EVAL_SCENARIOS[0].prompt, { category: "fitness_coach" })
  const brain = designBrainFor(fitBrief, { seed: "a" })
  check("the brain block offers home ingredients, not a numbered spine", /Home ingredients/.test(brain.block) && !/Home spine/.test(brain.block))
  const turn = nativeTurn({ request: "A personal trainer", ctx: { registry: nativeRegistry(), caps: NATIVE_SCENARIOS[0].caps, images: [], forms: [], prompt: "", seed: "r56" }, brain: { version: brain.version, block: brain.block, hints: brain.hints } }, [...(ADDABLE_SECTIONS as readonly string[])])
  check("the native turn offers SECTION IDEAS, not an order or a quota", /SECTION IDEAS/.test(turn) && !/STARTING SECTION PLAN/.test(turn) && !/use the first listed type/.test(turn))
  check("native home is 6 to 12 sections and bands follow the story", /6 to 12 sections/.test(NATIVE_RULES) && !/scheme light, alt, dark\)/.test(NATIVE_RULES))

  section("5. Variety")
  const home = designBrainFor(fitBrief).hints.sectionStrategy.home
  const orders = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((s) => varySpine(home, s, "fitness").map((x) => x.patternId).join(">")))
  check(`a seeded home order varies per site (${orders.size} different orders from 8 seeds)`, orders.size >= 4)
  check("the same seed gives the same order", varySpine(home, "a", "fitness").map((x) => x.patternId).join() === varySpine(home, "a", "fitness").map((x) => x.patternId).join())
  check("the opener stays an opener and the closer stays last", ["a", "b", "c", "d"].every((s) => { const v = varySpine(home, s, "fitness"); return v[0].role === "hero" && v[v.length - 1].role === home[home.length - 1].role }))
  const onlyOne = RECIPES.filter((r) => r.businesses.includes("wellness"))
  const wellBrief = briefFrom("A pilates studio in Bath")
  if (onlyOne.length === 1) check("a trade with one recipe keeps it even when it was used recently", designBrainFor(wellBrief, { avoidRecipes: [onlyOne[0].id] }).recipe.id === onlyOne[0].id)
  const swiss = chooseDirection(consulting, [], { seed: "s" })
  const fresh = chooseFreshDirection(consulting, [], { seed: "s", avoid: [swiss.primary.id] })
  check("a direction a recent site used gives way to another that fits", fresh.choice.primary.id !== swiss.primary.id && [...fresh.choice.primary.fits, ...fresh.choice.primary.suits].includes(consulting.business.kind))
  check("the fresh choice is reproduced by its stored prefer list", chooseDirection(consulting, [], { seed: "s", avoid: [swiss.primary.id], prefer: fresh.prefer }).primary.id === fresh.choice.primary.id)
  const asked = briefFrom("A Swiss style consultancy site")
  check("a direction the creator asked for by name is never moved", chooseFreshDirection(asked, [], { avoid: ["swiss-editorial"] }).choice.primary.id === "swiss-editorial")
  const recent = readRecentDesigns([{ dir: { primary: "swiss-editorial" }, rec: "rcp_x", fp: { v: 1, order: ["hero"], hero: "a", palette: "b", type: "c" } }, { nat: { direction: "art-gallery", recipeId: "rcp_y", fingerprint: { v: 1, order: [], hero: "x", palette: "y", type: "z" } } }])
  check("recent designs read from both engines' rows, ids and words only", recent.directions.join() === "swiss-editorial,art-gallery" && recent.recipes.join() === "rcp_x,rcp_y" && recent.fingerprints.length === 2)
  check("the native prompt names recent sites' structure (no content)", /RECENT SITES ON THIS PLATFORM/.test(recentBlock(recent.fingerprints)) && recentBlock([]) === "")
  check("leastLikeRecent picks the candidate least like any recent site", leastLikeRecent([1, 2], (n) => ({ v: 1, order: ["hero"], hero: n === 1 ? "a" : "z", palette: "l/w/r", type: "g/p" }), [{ v: 1, order: ["hero"], hero: "a", palette: "l/w/r", type: "g/p" }]) === 2)

  /*
    The native engine's novelty pressure, measured: the six eval businesses in order, each site as a model following
    its SECTION IDEAS (each idea's first type) on the brain's tokens, without and with the pressure (the platform's
    previous sites as recent). The scripted eval's native answers are fixed per business, so they cannot show it;
    this is the mechanism on the same six briefs.
  */
  const offered = [...(ADDABLE_SECTIONS as readonly string[])]
  const run = (pressure: boolean) => {
    const list: { id: string; fp: SiteFingerprint; direction: string; recipe: string }[] = []
    for (const sc of EVAL_SCENARIOS) {
      const b = briefFrom(sc.prompt, sc.category ? { category: sc.category } : null)
      const first = designBrainFor(b, {})
      const prev = list.slice(-6)
      const d = nativeDesign(b, { siteSeed: `creator-${sc.id}:install-${sc.id}`, prefer: { prefer: first.directions, preferType: first.typeSystem }, avoidDirections: pressure ? prev.map((r) => r.direction) : [], avoidRecipes: pressure ? prev.map((r) => r.recipe) : [], recent: pressure ? prev.map((r) => r.fp) : [], offered, brainOf: (x, o) => designBrainFor(x, pressure ? o : { ...o, seed: undefined }) })
      const br = d.brain as ReturnType<typeof designBrainFor>
      list.push({ id: sc.id, fp: brainFingerprint(br, offered), direction: d.choice.primary.id, recipe: br.recipe.id })
    }
    let worst = 0
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) worst = Math.max(worst, fingerprintSimilarity(list[i].fp, list[j].fp))
    return { worst: Math.round(worst * 100) / 100, directions: list.map((x) => x.direction) }
  }
  const without = run(false)
  const withPressure = run(true)
  console.log(`        native closest pair without pressure ${without.worst}, with ${withPressure.worst} (threshold ${NOVELTY_THRESHOLD}); directions ${withPressure.directions.join(", ")}`)
  check("without the pressure two of the six are near copies (the gap round R left)", without.worst >= NOVELTY_THRESHOLD)
  check("with it, no two of the six are near copies", withPressure.worst < NOVELTY_THRESHOLD)
  check("with it, no two of the six share a direction", new Set(withPressure.directions).size === withPressure.directions.length, withPressure.directions)

  section("6. The eval's new checks")
  check("palette.contrast and slop.look are eval checks", CHECKS.some((c) => c.id === "palette.contrast") && CHECKS.some((c) => c.id === "slop.look"))
  const site = (colors: Record<string, string>): EvalSite => ({ engine: "native", engineLabel: "x", scenario: EVAL_SCENARIOS[0], status: "complete", pages: [{ key: "home", sections: [] }], sources: {}, settings: tokensToThemeSettings({ ...tokens, colors: colors as never }, {}), capabilities: null, mode: "theme", notes: [] })
  check("the lime palette fails palette.contrast", checkPalette(site(lime)).status === "fail")
  check("the repaired palette passes it, naming the brand", checkPalette(site(fixed.colors as never)).status === "pass" && /brand #d7ff3a/.test(checkPalette(site(fixed.colors as never)).detail))
  check("a site of Storelib's own sections passes slop.look without judging them", checkSlopLook(site(fixed.colors as never)).status === "pass")

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
