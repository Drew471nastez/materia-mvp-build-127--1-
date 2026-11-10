/**
 * Round O (O5): motion that feels made, and layout that is not one template.
 *
 *   1. The motion feel: Theme settings › Animations › Motion feel (quiet,
 *      balanced, expressive) maps to --t-motion-* on the page root (the
 *      editor's canvas and the live page both draw themeVars), inside the
 *      spec's 5.3 ranges; the agent's tokens and the site's own design
 *      settings write it; a site without one is unchanged.
 *   2. Reduced motion: the page's stylesheet stills every variable with
 *      !important for a site with a feel; every primitive keeps its still
 *      state as the default.
 *   3. The primitives: each recipe's example compiles through the agent's
 *      own file check, draws, passes the render check and the anti-slop
 *      evaluator, has its params as schema settings, moves only transform,
 *      opacity or clip-path, and never hijacks the scroll.
 *   4. Site stories: fitness, wellness, a sample pack store and an agency
 *      get different sequences, actions and motion; the brief carries them.
 *   5. The planner refuses the generic Hero, Features, Pricing, FAQ, CTA
 *      skeleton for a fitness coach and accepts it for software.
 *   6. In Chromium at 390px: no sideways scroll, and with reduced motion no
 *      running animation, a still headline and plain sticky steps; with motion
 *      the primitives animate and the marquee's own switch pauses it.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-motion-layout-o5.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  MOTION_TIERS,
  MOTION_TIER_PARAMS,
  MOTION_RECIPES,
  MOTION_TIER_SETTING,
  motionVars,
  motionTierOf,
  motionTierFor,
  motionForPrompt,
  tierFromStance,
  type MotionTier,
} from "@/lib/storelib-ai/motion"
import { LAYOUT_COMPOSITIONS, SITE_STORIES, classifyStory, layoutStoryFor, planSkeletonIssue, skeletonMatch, compositionById, motionAndLayoutBrief } from "@/lib/storelib-ai/layout"
import { exampleById, knowledgeById } from "@/lib/storelib-ai/library"
import { THEME_ROOT_ATTRIBUTE, themeStylesheet, themeVars } from "@/lib/website-builder/theme-css"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { tokensToThemeSettings as fullMapper, themeSettingsToTokens, tokenPatch } from "@/lib/ai-builder/tokens"
import { tokensToThemeSettings as agentMapper } from "@/lib/ai-builder/agent/tokens"
import { designPatch, cleanDesignSettings } from "@/lib/ai-builder/site-settings"
import { readSitePlan, MIN_HOME_SECTIONS } from "@/lib/ai-builder/agent/site-plan"
import { briefMessage } from "@/lib/ai-builder/agent/prompts"
import { validateFile } from "@/lib/ai-builder/agent/validate"
import { renderCheck, esbuildScriptParser } from "@/lib/ai-builder/render-check"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { storefrontData } from "@/lib/website-builder/storefront-data"
import { slopIssues } from "@/lib/ai-builder/slop"
import type { DesignTokens } from "@/lib/ai-builder/types"
import type { RuntimeCapabilities } from "@/lib/ai-builder/runtime-contract"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`)
  }
}
const ms = (v: string) => Number(v.replace(/ms$/, ""))
const px = (v: string) => Number(v.replace(/px$/, ""))

const TOKENS: DesignTokens = {
  colors: { background: "#f3f1ec", surface: "#e8e4dc", text: "#151515", muted: "#4d4d4d", accent: "#1f4fd1", accentText: "#ffffff", border: "#cfcac0" },
  fonts: { heading: "Archivo", body: "Archivo" },
  radius: { small: 2, medium: 4, large: 8 },
  spacing: { scale: 1, sectionY: 96, pageWidth: 1280, gutter: 24 },
  motion: { level: "subtle" },
}

/* The examples drawn as a page, the way the canvas and the live page draw them: one root with themeVars and themeStylesheet. */
/* A photo address the renderer keeps (it drops data: URLs); the browser below answers it with a grey picture, nothing leaves the machine. */
const PIXEL = "https://images.example.test/photo.svg"
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#5a6b7c"/></svg>`
function instanceOf(id: string, source: string): SectionInstance {
  const schema = JSON.parse(/<schema>([\s\S]*?)<\/schema>/.exec(source)![1]) as { settings?: { id?: string; type?: string }[]; presets?: { blocks?: { type: string; settings?: Record<string, unknown> }[] }[]; blocks?: { type: string; settings?: { id?: string; type?: string }[] }[] }
  const settings: Record<string, unknown> = {}
  for (const s of schema.settings ?? []) if (s.type === "image_picker" && s.id) settings[s.id] = PIXEL
  const blocks = (schema.presets?.[0]?.blocks ?? []).map((b, i) => {
    const imgs = Object.fromEntries((schema.blocks?.find((d) => d.type === b.type)?.settings ?? []).filter((s) => s.type === "image_picker" && s.id).map((s) => [s.id!, PIXEL]))
    return { id: `b${i}`, type: b.type, settings: { ...imgs, ...(b.settings ?? {}) } }
  })
  return { id: `s-${id}`, type: id, name: id, settings, blocks } as unknown as SectionInstance
}
function pageHtml(theme: Record<string, unknown>, ids: string[]): string {
  const parts: string[] = []
  for (const id of ids) {
    const e = exampleById(id)!
    const out = renderStorelibSection(instanceOf(id, e.source), theme as unknown as ThemeSettingsValues, { template: "index" }, { [`sections/${id}.storelib`]: e.source })
    if (out.ok) parts.push(`<div data-o5="${id}">${out.css ? `<style>${out.css}</style>` : ""}${out.html}</div>`)
    else parts.push(`<p data-o5-failed="${id}"></p>`)
  }
  const vars = Object.entries(themeVars(theme as unknown as ThemeSettingsValues)).map(([k, v]) => `${k}:${String(v).replace(/[;"<>]/g, "")}`).join(";")
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0}</style></head><body><div ${THEME_ROOT_ATTRIBUTE}="" style="${vars.replace(/"/g, "&quot;")};container-type:inline-size"><style>${themeStylesheet(theme as unknown as ThemeSettingsValues)}</style>${parts.join("")}</div></body></html>`
}

async function main() {
  console.log("\n1. the motion feel is a Theme setting and the page's variables")
  {
    const group = THEME_SETTINGS_GROUPS.find((g) => g.id === "animations")
    const field = group?.fields.find((f) => f.id === MOTION_TIER_SETTING) as { type?: string; default?: unknown; options?: { value: string }[]; label?: string } | undefined
    check("Theme settings › Animations has Motion feel: quiet, balanced, expressive, default balanced", !!field && field.type === "select" && field.default === "balanced" && JSON.stringify(field.options?.map((o) => o.value)) === JSON.stringify(MOTION_TIERS), field)
    check("its label and help are plain, with no em dash", !!field && field.label === "Motion feel" && !/—/.test(JSON.stringify(field)))

    const values = MOTION_TIERS.map((t) => motionVars({ [MOTION_TIER_SETTING]: t }))
    check("each tier prints the motion variables", values.every((v) => ["--t-motion-duration", "--t-motion-ease", "--t-motion-distance", "--t-motion-stagger", "--t-motion-hover", "--t-motion-ease-ui", "--t-motion-lift", "--t-motion-scale", "--t-motion-parallax", "--t-motion-on"].every((k) => typeof v[k] === "string" && v[k] !== "")))
    const [q, b, x] = values
    check("quiet < balanced < expressive in duration, travel, stagger and lift", ms(q["--t-motion-duration"]) < ms(b["--t-motion-duration"]) && ms(b["--t-motion-duration"]) < ms(x["--t-motion-duration"]) && px(q["--t-motion-distance"]) < px(b["--t-motion-distance"]) && px(b["--t-motion-distance"]) < px(x["--t-motion-distance"]) && ms(q["--t-motion-stagger"]) < ms(x["--t-motion-stagger"]) && px(q["--t-motion-lift"]) < px(x["--t-motion-lift"]))
    const inRange = MOTION_TIERS.every((t) => {
      const p = MOTION_TIER_PARAMS[t]
      return p.durationMs >= 450 && p.durationMs <= 850 && p.staggerMs >= 40 && p.staggerMs <= 90 && p.distancePx >= 12 && p.distancePx <= 36 && p.hoverMs >= 140 && p.hoverMs <= 260 && p.liftPx >= 2 && p.liftPx <= 8 && p.parallaxPct >= 3 && p.parallaxPct <= 10
    })
    check("every value is inside the spec's recommended ranges (5.3)", inRange)
    check("entrances and interaction do not share one easing curve", MOTION_TIERS.every((t) => MOTION_TIER_PARAMS[t].ease !== MOTION_TIER_PARAMS[t].easeUi))

    const plain = themeVars({} as never) as Record<string, string>
    check("a site that never had a feel or tokens prints nothing new (its page is what it was)", Object.keys(plain).every((k) => !k.startsWith("--t-motion")) && !/--t-motion/.test(themeStylesheet({} as never)))
    const ai = fullMapper(TOKENS)
    check("the agent's tokens write motion_tier (subtle is balanced)", ai[MOTION_TIER_SETTING] === "balanced")
    check("and an explicit tier wins", fullMapper({ ...TOKENS, motion: { level: "subtle", tier: "expressive" } })[MOTION_TIER_SETTING] === "expressive")
    const site = { ...ai, site_chrome: "home" }
    for (const t of MOTION_TIERS) {
      const v = themeVars({ ...site, [MOTION_TIER_SETTING]: t } as never) as Record<string, string>
      check(`the canvas root (themeVars) carries the ${t} values`, v["--t-motion-duration"] === `${MOTION_TIER_PARAMS[t].durationMs}ms` && v["--t-motion-tier"] === t)
    }
    check("the tier reads back into tokens", themeSettingsToTokens({ ...site, [MOTION_TIER_SETTING]: "quiet" }).motion.tier === "quiet")
    check("the token panel's motion group writes the tier and only what moved", JSON.stringify(tokenPatch("motion", { ...themeSettingsToTokens(site), motion: { ...themeSettingsToTokens(site).motion, tier: "expressive" } }, site)) === JSON.stringify({ [MOTION_TIER_SETTING]: "expressive" }))

    const agent = agentMapper({ motion: { level: "expressive" } } as never, {})
    check("the agent's set_tokens writes the tier and a page transition that suits it", agent.settings[MOTION_TIER_SETTING] === "expressive" && agent.settings.page_transition === "rise" && agent.issues.length === 0, agent.settings)
    const kept = agentMapper({ motion: { level: "subtle", tier: "quiet" } } as never, { page_transition: "slide" })
    check("a page transition already chosen stays", kept.settings[MOTION_TIER_SETTING] === "quiet" && kept.settings.page_transition === undefined)
    check("a tier that is not one is said, and the level decides", agentMapper({ motion: { level: "none", tier: "wild" } } as never, {}).issues.some((i) => i.code === "token.motion_tier") && agentMapper({ motion: { level: "none", tier: "wild" } } as never, {}).settings[MOTION_TIER_SETTING] === "quiet")

    const ds = cleanDesignSettings([{ label: "Motion", settings: [{ id: "feel", label: "Motion feel", token: "motion.tier" }] }])
    const setting = ds.groups[0]?.settings[0]
    check("the site's own design settings can bind a Motion feel select to the tier", !!setting && setting.type === "select" && JSON.stringify(setting.options?.map((o) => o.value)) === JSON.stringify(MOTION_TIERS))
    check("changing it there writes motion_tier", !!setting && designPatch(site, setting, "quiet")[MOTION_TIER_SETTING] === "quiet")
    check("a site with no stored tier reads balanced, as the panel shows", motionTierOf({}) === "balanced" && motionTierOf({ [MOTION_TIER_SETTING]: "nope" }) === "balanced")
    check("a concept's stance maps to a tier", tierFromStance("cinematic") === "expressive" && tierFromStance("none") === "quiet" && tierFromStance("subtle") === "balanced")
    check("the creator's words win: no animations is quiet, lots of motion expressive", motionTierFor("a photographer, but no animations please") === "quiet" && motionTierFor("an accountant with lots of motion") === "expressive" && motionTierFor("a family law firm") === "quiet" && motionTierFor("music producer") === "expressive")
  }

  console.log("\n2. reduced motion stills it everywhere")
  {
    const css = themeStylesheet({ custom_tokens: {}, [MOTION_TIER_SETTING]: "expressive" } as never)
    const rule = /@media \(prefers-reduced-motion:reduce\),\(update:slow\)\{\[data-storelib-theme\]\{([^}]*)\}\}/.exec(css)
    check("the page's stylesheet stills the variables for reduced motion and slow screens", !!rule)
    check("with !important, so it beats the root's inline values", !!rule && ["--t-motion-on:0!important", "--t-motion-duration:0ms!important", "--t-motion-distance:0px!important", "--t-motion-lift:0px!important", "--t-motion-scale:1!important", "--t-motion-parallax:0%!important"].every((d) => rule[1].includes(d)), rule?.[1])
  }

  console.log("\n3. the primitives: compile, draw, editable, transform and opacity only")
  {
    const parse = await esbuildScriptParser()
    const data = storefrontData({ dynamic: { shop: { name: "Iron Room" }, creator: {} } as never, catalog: [], menus: {} as never })
    const theme = { site_chrome: "home" } as unknown as ThemeSettingsValues
    const wanted = ["reveal-stagger", "mask-reveal", "image-scale-in", "sticky-story", "horizontal-gallery", "marquee", "hover-lift", "counter", "page-transition", "cursor-aware"]
    check("the recipe library has the spec's primitives", wanted.every((id) => MOTION_RECIPES.some((r) => r.id === id)), MOTION_RECIPES.map((r) => r.id))
    check("every recipe says its phone, low power and reduced motion behaviour", MOTION_RECIPES.every((r) => r.mobile && r.lowPower && r.reducedMotion))
    const pt = MOTION_RECIPES.find((r) => r.id === "page-transition")!
    const anim = THEME_SETTINGS_GROUPS.find((g) => g.id === "animations")!.fields.map((f) => f.id)
    check("page transitions are the Theme setting the creator edits", pt.params.every((p) => anim.includes(p)))
    for (const r of MOTION_RECIPES.filter((x) => x.example)) {
      const e = exampleById(r.example)
      check(`${r.id}: its example ${r.example} exists`, !!e)
      if (!e) continue
      const path = `sections/${e.id}.storelib`
      const instance = instanceOf(e.id, e.source)
      const schema = JSON.parse(/<schema>([\s\S]*?)<\/schema>/.exec(e.source)![1]) as { settings: { id: string }[] }
      const ids = schema.settings.map((s) => s.id)
      check(`${r.id}: its params are schema settings the editor shows (${r.params.join(", ") || "none"})`, r.params.every((p) => ids.includes(p)), ids)
      const errors = validateFile(path, e.source, { instances: [instance], theme: theme as never }).filter((i) => i.severity === "error")
      check(`${r.id}: compiles and passes the agent's file check`, errors.length === 0, errors)
      const drawn = renderStorelibSection(instance, theme, { template: "index" }, { [path]: e.source }, undefined, data)
      check(`${r.id}: draws`, drawn.ok === true && drawn.html.length > 200)
      const rc = await renderCheck({ page: "home", sections: [instance], sources: { [path]: e.source }, theme, template: "index", data, parseScript: parse ?? undefined, extraRoutes: ["/about"] })
      check(`${r.id}: the render check finds no error`, rc.issues.filter((i) => i.severity === "error").length === 0, rc.issues.filter((i) => i.severity === "error"))
      check(`${r.id}: no anti-slop error`, slopIssues({ sources: [{ path, content: e.source }] }).filter((i) => i.severity === "error").length === 0)
      const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(e.source)?.[1] ?? ""
      const keyframes = [...style.matchAll(/@keyframes[^{]+\{([\s\S]*?\})\s*\}/g)].map((m) => m[1]).join(" ")
      const moved = [...keyframes.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]).filter((p) => !p.startsWith("--"))
      check(`${r.id}: keyframes move only transform, opacity or clip-path`, moved.every((p) => ["transform", "opacity", "clip-path"].includes(p)), moved)
      const transitions = [...style.matchAll(/transition\s*:\s*([^;]+);/g)].map((m) => m[1])
      check(`${r.id}: no transition: all, no layout property transitioned`, transitions.every((t) => !/\ball\b|\b(?:width|height|top|left|margin|padding)\b/.test(t)), transitions)
      check(`${r.id}: motion only where reduced motion is handled`, !/@keyframes|transition\s*:|animation\s*:/.test(style) || /prefers-reduced-motion/.test(style))
      check(`${r.id}: no scroll hijacking (no wheel or scroll script, no locked page)`, !/wheel|preventDefault|scrollTo\(|overflow\s*:\s*hidden[^}]*\}\s*(?:html|body)/.test(e.source) && !/\b(?:html|body)\s*\{[^}]*overflow\s*:\s*hidden/.test(style))
      if (r.params.includes("motion")) {
        check(`${r.id}: reads the site's motion feel (--t-motion-*) and honours "Still"`, /var\(--t-motion-/.test(style) && /data-motion="\{\{ settings\.motion \}\}"/.test(e.source) && /\[data-motion="off"\]/.test(style))
      }
    }
    check("the five new primitives are in the interactive library entry", ["ai_mask_reveal", "ai_image_reveal", "ai_sticky_story", "ai_hover_lift", "ai_cursor_tilt"].every((id) => knowledgeById("component-interactive-library")!.body.includes(id)))
    check("the cursor-aware tilt reads no pointer position (a section script cannot) and is fine-pointer only", !/<script/.test(exampleById("ai_cursor_tilt")!.source) && /\(hover: hover\) and \(pointer: fine\)/.test(exampleById("ai_cursor_tilt")!.source))
    check("the marquee has its own pause switch, no script", /mq__toggle:checked/.test(exampleById("ai_marquee")!.source) && !/<script/.test(exampleById("ai_marquee")!.source))
    check("the sticky story becomes plain steps on phones (wide container only)", /@container \(min-width: 860px\)/.test(exampleById("ai_sticky_story")!.source))
    check("knowledge: motion-tiers and motion-recipes are entries", !!knowledgeById("motion-tiers") && !!knowledgeById("motion-recipes") && MOTION_RECIPES.filter((r) => r.example).every((r) => knowledgeById("motion-recipes")!.body.includes(r.example)))
    const prompt = motionForPrompt("quiet")
    check("motionForPrompt names the tier, the variables, the params and the rules", /feel: quiet/.test(prompt) && /var\(--t-motion-duration, 450ms\)/.test(prompt) && /motion_strength/.test(prompt) && /no scroll hijacking/.test(prompt) && /prefers-reduced-motion: no-preference/.test(prompt) && !/—/.test(prompt))
    check("a quiet site is offered no showcase recipe; an expressive one the tilt", !/ai_sticky_story/.test(motionForPrompt("quiet")) && /ai_cursor_tilt/.test(motionForPrompt("expressive")))
  }

  console.log("\n4. site stories differ by business")
  {
    const briefs: Record<string, string> = {
      "fitness-coach": "I'm a personal trainer in Salford. I coach busy parents to lift three times a week.",
      "wellness-studio": "A small reformer pilates studio in Bristol, classes for all levels",
      "sample-pack-store": "I sell sample packs and drum kits for lo-fi producers",
      agency: "Website for our brand design agency in Berlin",
    }
    const stories = Object.fromEntries(Object.entries(briefs).map(([k, p]) => [k, layoutStoryFor({ prompt: p })]))
    for (const [k, s] of Object.entries(stories)) check(`"${briefs[k].slice(0, 40)}..." is the ${k} story`, s.story.id === k, s.story.id)
    const seqs = Object.values(stories).map((s) => s.story.beats.map((b) => b.composition).join(">"))
    check("the four sequences are all different", new Set(seqs).size === 4)
    const firsts = Object.values(stories).map((s) => s.story.beats[0].composition)
    check("and open differently", new Set(firsts).size >= 3, firsts)
    check("with different actions: book, book, buy, enquire", JSON.stringify(Object.values(stories).map((s) => s.objective)) === JSON.stringify(["book", "book", "buy", "enquire"]))
    check("and motion: balanced, quiet, expressive, expressive", JSON.stringify(Object.values(stories).map((s) => s.motion)) === JSON.stringify(["balanced", "quiet", "expressive", "expressive"]))
    check("every story has at least ten beats, each a known composition", SITE_STORIES.every((s) => s.beats.length >= MIN_HOME_SECTIONS && s.beats.every((b) => !!compositionById(b.composition))))
    check("no story is the generic skeleton itself", SITE_STORIES.filter((s) => s.id !== "saas").every((s) => skeletonMatch(s.beats.map((b) => b.beat)) < 4))
    check("a story covers its own essentials", SITE_STORIES.every((s) => planSkeletonIssue(s.beats.map((b) => `ai_x: ${b.beat}`), { prompt: s.name }) === null))
    check("the start screen's categories map to stories", classifyStory({ category: "fitness_coach" }).id === "fitness-coach" && classifyStory({ category: "photographer" }).id === "photographer" && classifyStory({ category: "candle_shop" }).id === "product-brand" && classifyStory({ category: "online_course" }).id === "digital-creator")
    check("an objective in the brief wins", layoutStoryFor({ prompt: briefs["fitness-coach"], objective: "sell the programme" }).objective === "buy")
    check("the grammar has the spec's compositions (split editorial, full bleed, reading column, asymmetric, product-led, conversion)", ["split-editorial", "full-bleed-photo-hero", "narrow-reading-column", "unequal-mosaic", "product-led-demo", "booking-cta"].every((id) => !!compositionById(id)) && LAYOUT_COMPOSITIONS.length >= 20)
    check("every composition says how a phone gets it", LAYOUT_COMPOSITIONS.every((c) => c.mobile.length > 10))
    const text = stories["fitness-coach"].text
    check("layoutStoryFor text: the beats, the action, conversion, phone and copy rules, no em dash", /SITE STORY \(Fitness coach/.test(text) && /Primary action: book/.test(text) && /Never href="#"/.test(text) && /360 to 390px/.test(text) && /Unleash your best self/.test(text) && !/—/.test(text))
    check("knowledge: the grammar and stories are entries with every id", !!knowledgeById("layout-grammar") && LAYOUT_COMPOSITIONS.every((c) => knowledgeById("layout-grammar")!.body.includes(`**${c.id}**`)) && SITE_STORIES.every((s) => knowledgeById("layout-site-stories")!.body.includes(`**${s.id}**`)) && !!knowledgeById("layout-art-direction") && !!knowledgeById("layout-conversion-copy"))
    const job = (prompt: string, extra: Record<string, unknown> = {}) => ({ jobId: "j", installId: "i", creatorId: "c", prompt, mode: "blank", options: { generation: "blank" }, ...extra }) as never
    const brief = briefMessage({ job: job(briefs["fitness-coach"]), caps: null, pages: [{ key: "home", sections: [] }], files: [], knowledge: [] })
    check("a new website's brief carries its site story and motion feel", brief.includes(motionAndLayoutBrief({ prompt: briefs["fitness-coach"] })) && /SITE STORY \(Fitness coach/.test(brief) && /MOTION \(this site's feel: balanced/.test(brief))
    check("the brief still ends on the order of work", /render_check on every page, finish\.$/.test(brief))
    check("an edit job's brief does not", !/SITE STORY/.test(briefMessage({ job: job("make the hero calmer", { edit: true }), caps: null, pages: [], files: [], knowledge: [] })))
  }

  console.log("\n5. the planner refuses the generic skeleton where it does not fit")
  {
    const caps = { products: [], collections: [], communities: [], forms: [], pages: [], menus: [], reviews: { count: 0 }, features: [], store: { name: "Iron Room", currency: "GBP" }, blog: { posts: 0 } } as unknown as RuntimeCapabilities
    const templates = ["cart", "404", "contact", "products", "search", "product", "collection"].map((key) => ({ key, sections: [], reason: "Keeps the platform's working layout for now." }))
    const plan = (home: string[]) => [{ key: "home", sections: home }, ...templates]
    const generic = ["ai_hero: big promise and a get started button", "ai_features: three feature cards", "ai_benefits: why choose us", "ai_stats: numbers", "ai_logos: trusted by", "ai_testimonials: reviews", "ai_pricing: three plans", "ai_faq: common questions", "ai_newsletter: subscribe", "ai_cta: final call to action"]
    const fitness = { prompt: "I'm a personal trainer in Salford. I coach busy parents to lift.", category: "fitness_coach" }
    const read = readSitePlan(plan(generic), caps, fitness)
    check("a fitness coach's Hero, Features, Pricing, FAQ, CTA home is refused", read.ok === false)
    const msg = read.ok === false ? read.missing.join(" | ") : ""
    check("  with the reason and the coach's story as the way forward", /generic Hero, Features, Pricing, FAQ, CTA skeleton/.test(msg) && /fitness coach/.test(msg) && /the method/.test(msg), msg)
    check("the same plan for a software product is fine", readSitePlan(plan(generic), caps, { prompt: "a SaaS for invoicing freelancers" }).ok === true)
    check("without a brief the check is not run (older callers unchanged)", readSitePlan(plan(generic), caps).ok === true)
    const story = layoutStoryFor(fitness).story.beats.map((b, i) => `ai_s${i}: ${b.beat}`)
    check("the coach's own story is accepted", readSitePlan(plan(story), caps, fitness).ok === true, (readSitePlan(plan(story), caps, fitness) as { missing?: string[] }).missing)
    const mixed = ["ai_hero: who the coaching is for, over a training photo", "ai_coach: meet the coach, a real story", "ai_for: who it is for and not for", "ai_features: what you get", "ai_method: how the twelve weeks work", "ai_marquee: next intake date", "ai_pricing: programmes from the store", "ai_gallery: a training day", "ai_faq: kit and injuries", "ai_cta: book a consultation"]
    check("a plan with a hero, pricing and an FAQ that tells the coach's story is fine", readSitePlan(plan(mixed), caps, fitness).ok === true)
    check("the agent passes the creator's words and category to the check", /readSitePlan\(pages, c, planBrief\)/.test(readFileSync(join(process.cwd(), "lib/ai-builder/agent/tools-impl.ts"), "utf8")) && /planBrief = \{ prompt: job\.prompt, category: job\.options\?\.category \?\? null \}/.test(readFileSync(join(process.cwd(), "lib/ai-builder/agent/tools-impl.ts"), "utf8")))
  }

  console.log("\n6. in Chromium at 390px: reduced motion and the phone")
  {
    const chrome = process.env.CHROME ?? "/opt/pw-browsers/chromium"
    if (!existsSync(chrome)) {
      console.log("  --    no Chromium here: unverified in a browser")
    } else {
      const puppeteer = (await import("puppeteer-core")).default
      const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
      try {
        const ids = MOTION_RECIPES.filter((r) => r.example).map((r) => r.example)
        const theme = { ...fullMapper(TOKENS), site_chrome: "home", [MOTION_TIER_SETTING]: "expressive" }
        const html = pageHtml(theme, ids)
        check("every primitive drew into the page", !/data-o5-failed/.test(html))
        const open = async (width: number, reduce: boolean) => {
          const page = await browser.newPage()
          await page.setViewport({ width, height: 844 })
          await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }])
          await page.setRequestInterception(true)
          page.on("request", (req) => (req.url() === PIXEL ? req.respond({ status: 200, contentType: "image/svg+xml", body: SVG }) : req.abort()))
          await page.setContent(html, { waitUntil: "load" })
          return page
        }
        const still = await open(390, true)
        const r = await still.evaluate(() => {
          const root = document.querySelector("[data-storelib-theme]") as HTMLElement
          const cs = getComputedStyle(root)
          /* The sideways gallery's progress line follows the visitor's own swipe (a scroll timeline, not motion of its own), so it stays. */
          const running = document.getAnimations().map((a) => (a as CSSAnimation).animationName ?? "transition").filter((n) => !n.endsWith("hg-fill"))
          const words = [...document.querySelectorAll(".mr__words")].map((w) => getComputedStyle(w).transform)
          const story = document.querySelector(".ss__media") as HTMLElement | null
          const inline = [...document.querySelectorAll(".ss__inline")].map((i) => getComputedStyle(i).display)
          const pause = document.querySelector(".mq__pause") as HTMLElement | null
          const hidden = [...document.querySelectorAll("[data-o5] h1, [data-o5] h2, [data-o5] h3, [data-o5] p, [data-o5] img")].filter((el) => Number(getComputedStyle(el).opacity) < 1).length
          return {
            scrollWidth: document.documentElement.scrollWidth,
            duration: cs.getPropertyValue("--t-motion-duration").trim(),
            distance: cs.getPropertyValue("--t-motion-distance").trim(),
            on: cs.getPropertyValue("--t-motion-on").trim(),
            running,
            words,
            storyMedia: story ? getComputedStyle(story).display : "missing",
            inline,
            pause: pause ? getComputedStyle(pause).display : "missing",
            hidden,
          }
        })
        check("reduced motion at 390px: nothing scrolls sideways", r.scrollWidth <= 390, r.scrollWidth)
        check("  the motion variables are zero on the page root", r.duration === "0ms" && r.distance === "0px" && r.on === "0", r)
        check("  no animation runs (the sideways gallery's progress line, tied to the visitor's own swipe, aside)", r.running.length === 0, r.running)
        check("  the masked headline stands whole", r.words.length === 3 && r.words.every((t) => t === "none"), r.words)
        check("  the sticky story is plain steps with their own pictures", r.storyMedia === "none" && r.inline.length === 3 && r.inline.every((d) => d === "block"), r)
        check("  the marquee's pause switch is not drawn (nothing moves)", r.pause === "none", r.pause)
        check("  nothing is left invisible", r.hidden === 0, r.hidden)
        await still.close()

        const moving = await open(390, false)
        const m = await moving.evaluate(() => {
          const root = document.querySelector("[data-storelib-theme]") as HTMLElement
          const names = document.getAnimations().map((a) => (a as CSSAnimation).animationName)
          const story = document.querySelector(".ss__media") as HTMLElement | null
          return { scrollWidth: document.documentElement.scrollWidth, duration: getComputedStyle(root).getPropertyValue("--t-motion-duration").trim(), names, storyMedia: story ? getComputedStyle(story).display : "missing", pause: getComputedStyle(document.querySelector(".mq__pause") as HTMLElement).display }
        })
        check("with motion at 390px: nothing scrolls sideways", m.scrollWidth <= 390, m.scrollWidth)
        check("  the expressive feel is on the root", m.duration === "850ms", m.duration)
        check("  the masked headline, the reveal, the image curtain and the marquee animate", ["mr-rise", "rv-rise", "ir-settle", "mq-run"].every((n) => m.names.some((x) => x.endsWith(`-${n}`))), m.names)
        check("  the sticky story is still plain steps on a phone", m.storyMedia === "none")
        await moving.evaluate(() => (document.querySelector(".mq__toggle") as HTMLInputElement).click())
        const paused = await moving.evaluate(() => document.getAnimations().filter((a) => (a as CSSAnimation).animationName.endsWith("-mq-run")).map((a) => a.playState))
        check("  the marquee's own switch pauses it", m.pause !== "none" && paused.length === 1 && paused[0] === "paused", { pause: m.pause, paused })
        await moving.close()

        const wide = await open(1280, false)
        const w = await wide.evaluate(() => {
          const story = document.querySelector(".ss__media") as HTMLElement | null
          return { storyMedia: story ? getComputedStyle(story).display : "missing", position: story ? getComputedStyle(story).position : "", scrollWidth: document.documentElement.scrollWidth, supported: CSS.supports("timeline-scope: none") }
        })
        if (w.supported) check("at 1280px the story's picture column sticks beside the steps", w.storyMedia === "block" && w.position === "sticky", w)
        else console.log("  --    this Chromium has no timeline-scope: the story stays plain steps, as designed")
        check("at 1280px nothing scrolls sideways", w.scrollWidth <= 1280, w.scrollWidth)
        await wide.close()

        const quiet = await browser.newPage()
        await quiet.setViewport({ width: 390, height: 844 })
        await quiet.setRequestInterception(true)
        quiet.on("request", (req) => (req.url() === PIXEL ? req.respond({ status: 200, contentType: "image/svg+xml", body: SVG }) : req.abort()))
        await quiet.setContent(pageHtml({ ...theme, [MOTION_TIER_SETTING]: "quiet" as MotionTier }, ["ai_mask_reveal"]), { waitUntil: "load" })
        const qd = await quiet.evaluate(() => getComputedStyle(document.querySelector("[data-storelib-theme]") as HTMLElement).getPropertyValue("--t-motion-duration").trim())
        check("switching the setting to quiet changes what the page reads", qd === "450ms", qd)
        await quiet.close()
      } finally {
        await browser.close()
      }
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
