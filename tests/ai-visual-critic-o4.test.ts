/**
 * ===========================================================================
 *  ROUND O, O4: THE RENDERED VISUAL CRITIC
 * ===========================================================================
 * The agent must SEE its draft and fix specific defects before it finishes
 * (lib/ai-builder/visual-critic, lib/ai-builder/agent/loop.ts designReview).
 *
 *   1. The rules, pure: scripts stripped and forbidden, the network fence,
 *      the measurements as defects (the hard gates), the review's answer
 *      validated, the scores and the target.
 *   2. The review with a scripted vision model: the pictures are sent as
 *      image blocks, a bad JSON answer gets ONE repair retry, two bad answers
 *      are a review not done.
 *   3. REAL CHROMIUM (/opt/pw-browsers/chromium, or CHROMIUM_PATH): a page
 *      whose own script would hide its overflow is photographed with the
 *      overflow still there (JavaScript disabled, proven); a draft drawn from
 *      .storelib sections is measured: sideways scroll at 390, a dead call to
 *      action and unreadable text are hard gates; the critic sends the vision
 *      model 4 pictures per page and counts its spend; a spending cap that
 *      cannot fit the review leaves it "measured" with no call made.
 *   4. The agent loop, a whole website, with the real browser and a scripted
 *      vision model: the overflow found at 390 comes back to the agent as a
 *      numbered repair task naming the file, the agent fixes it, the second
 *      review passes the gate and the job completes with the review in its
 *      summary; the review's spend is in the job's spend; "Reviewing the
 *      design" is a step in the progress events.
 *   5. No browser: "Not visually checked", never a pass. A gate still failing
 *      after the last review ends the job partial, honestly.
 *
 * Without a browser on this machine section 3 and 4 say so and are skipped.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-visual-critic-o4.test.ts
 */
import { NO_TEMPLATES } from "@/lib/ai-builder/agent/templates"
import { existsSync } from "node:fs"
import { runAgentSlice } from "@/lib/ai-builder/agent/loop"
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import type { AgentDeps, AgentJobInput, ModelRole } from "@/lib/ai-builder/agent/ports"
import { DEFAULT_JOB_BUDGET, type AgentEvent, type JobBudget } from "@/lib/ai-builder/types"
import type { AgentProvider, ProviderRequest, ProviderTurn } from "@/lib/sites/agent/types"
import { CRITIC_CSP, composeDraftDocument, stripScripts } from "@/lib/ai-builder/visual-critic/document"
import { LIMITS, measuredDefects, mergeDefects, type Measurements } from "@/lib/ai-builder/visual-critic/measure"
import { extractJson, readReview, runReview, REVIEW_SYSTEM, type ReviewPageInput } from "@/lib/ai-builder/visual-critic/review"
import { allowRequest, browserAvailable, isPublicHost, shootPages } from "@/lib/ai-builder/visual-critic/shoot"
import { createVisualCritic, type VisualCriticRunner } from "@/lib/ai-builder/visual-critic/critic"
import { belowTarget, weightedScore, type CriticReport, type CriticScores } from "@/lib/ai-builder/visual-critic/types"
import { ABOUT, CAPS, CONCEPT, FOOTER, HEADER, HERO, PROGRAMS, scripted, type Step } from "./ai-builder-agent-fixtures"
import { homeSections, pageSections, sitePlan, templateCalls, writeWholeSite } from "./ai-builder-whole-site-fixtures"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail)?.slice(0, 1500)}`}`)
  }
}

const CHROMIUM = process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH) ? process.env.CHROMIUM_PATH : existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null
const launchReal = async () => {
  const puppeteer = (await import("puppeteer-core")).default
  return puppeteer.launch({ executablePath: CHROMIUM as string, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--font-render-hinting=none"] })
}

const T0 = Date.UTC(2026, 10, 10, 12, 0, 0)
const JOB_ID = "44444444-2222-3333-4444-555555555555"

/* ── a scripted vision model ──────────────────────────────────────────── */

const GOOD: CriticScores = { identity: 4, composition: 4, typography: 4, offer: 4, mobile: 4, motion: 3, technical: 4 }
const LOW: CriticScores = { identity: 3, composition: 3, typography: 3, offer: 4, mobile: 2, motion: 3, technical: 3 }

function vision(answers: (string | ((req: ProviderRequest) => string))[], usage = { input: 9_000, output: 700 }): AgentProvider & { requests: ProviderRequest[] } {
  let i = 0
  const self = {
    id: "vision",
    requests: [] as ProviderRequest[],
    async complete(req: ProviderRequest): Promise<ProviderTurn> {
      self.requests.push({ ...req, turns: [...req.turns] })
      const a = answers[Math.min(i++, answers.length - 1)]
      const text = typeof a === "function" ? a(req) : a
      return { text, toolCalls: [], raw: [{ type: "text", text }], usage: { inputTokens: usage.input, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: usage.output }, stop: "done" }
    },
  }
  return self
}

const answer = (scores: CriticScores, defects: Record<string, unknown>[] = [], verdict = "Clear and direct.") => JSON.stringify({ scores, verdict, defects })

/* ── fixtures ─────────────────────────────────────────────────────────── */

/** The hero, with a headline that does not wrap: at 390 it runs off the screen. */
const WIDE_HERO = HERO.replace("@container (min-width: 820px)", ".hx__h { white-space: nowrap; font-size: 84px; }\n@container (min-width: 820px)")

/** A section with every hard gate: a nowrap strip wider than a phone, a dead call to action, unreadable text. */
const BAD = `<template>
<section class="bd">
  <h1 class="bd__h">{{ settings.heading }}</h1>
  <a class="bd__cta" href="#">Book a session</a>
  <p class="bd__faint">{{ settings.note }}</p>
  <div class="bd__strip">{{ settings.strip }}</div>
</section>
</template>

<style scoped>
.bd { padding: 24px; background: #ffffff; color: #111111; }
.bd__h { font-size: 40px; margin: 0 0 12px; }
.bd__cta { display: inline-block; padding: 14px 22px; background: #111; color: #fff; text-decoration: none; }
.bd__faint { color: #dddddd; font-size: 16px; }
.bd__strip { white-space: nowrap; font-size: 32px; }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_bad_hero",
  "name": "Bad hero",
  "category": "hero",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Train with us" },
    { "type": "text", "id": "note", "label": "Note", "default": "Small groups every morning and evening." },
    { "type": "text", "id": "strip", "label": "Strip", "default": "SQUAT · BENCH · DEADLIFT · PRESS · CARRY · ROW · PULL" }
  ]
}
</schema>
`

function measurements(over: Partial<Measurements>): Measurements {
  return { viewport: "mobile", width: 390, foldHeight: 844, scrollOverflow: 0, widest: null, headings: [], smallTargets: [], contrast: [], brokenImages: [], missingImages: [], foldCtas: [{ sectionId: "s1", sectionType: "ai_hero", selector: "a.cta", href: "/book", tag: "a", hooked: false, text: "Book" }], placeholders: [], pageHeight: 2000, ...over }
}

function jobInput(over: Partial<AgentJobInput> = {}, budget: Partial<JobBudget> = {}): AgentJobInput {
  return { jobId: JOB_ID, creatorId: "creator-a", installId: "install-a", prompt: "A website for my strength coaching: small group classes and an 8 week program.", mode: "blank", options: { generation: "blank", category: "fitness_coach" }, budget: { ...DEFAULT_JOB_BUDGET, ...budget }, startedAt: T0, spentUsd: 0, lastEventSeq: 0, ...over }
}

function depsFor(store: ReturnType<typeof memoryStore>, steps: Step[], critic?: VisualCriticRunner) {
  let i = 0
  const loopRequests: ProviderRequest[] = []
  const role = (id: string) => ({
    id,
    async complete(req: ProviderRequest) {
      loopRequests.push({ ...req, turns: [...req.turns] })
      return scripted([steps[i++] ?? { calls: [["finish", { summary: "Done." }]] }]).complete(req)
    },
  })
  const clock = { t: T0 }
  const deps: AgentDeps = {
    store,
    models: { plan: { provider: role("plan"), model: "claude-opus-5-5", effort: "medium" }, loop: { provider: role("loop"), model: "claude-sonnet-5-5", effort: "low" }, small: { provider: role("loop"), model: "claude-haiku-5-5" }, ownKey: false },
    templates: NO_TEMPLATES,
    capabilities: async () => CAPS,
    now: () => (clock.t += 1_000),
    ...(critic ? { visualCritic: critic } : {}),
  }
  return { deps, loopRequests }
}

const TOKENS = { colors: { background: "#f4efe6", surface: "#ebe4d8", text: "#1d1b18", muted: "#5c564d", accent: "#c2410c", accentText: "#ffffff", border: "#d6cdbd", inverse: { background: "#1d1b18", text: "#f4efe6", accent: "#fb923c" } }, fonts: { heading: "Oswald", body: "Inter" } }

/** The whole website (tests/ai-builder-whole-site-n3.test.ts's), its hero given as `hero`, ending in finish. */
function wholeSite(hero: string): Step[] {
  return [
    { calls: [["report_progress", { phase: "plan", label: "Concept and plan", concept: CONCEPT, pages: sitePlan(["programs", "about"]) }], ["set_tokens", { tokens: TOKENS }]] },
    {
      calls: [
        ["write_file", { path: "sections/ai_coach_header.storelib", content: HEADER }],
        ["write_file", { path: "sections/ai_coach_hero.storelib", content: hero }],
        ["write_file", { path: "sections/ai_program_list.storelib", content: PROGRAMS }],
        ["write_file", { path: "sections/ai_coach_footer.storelib", content: FOOTER }],
        ["write_file", { path: "sections/ai_coach_story.storelib", content: ABOUT }],
      ],
    },
    ...writeWholeSite().map((calls) => ({ calls })),
    { calls: [["add_page", { key: "programs", title: "Programs" }], ["add_page", { key: "about", title: "About" }]] },
    {
      calls: [
        ["set_page_sections", { page: "home", sections: homeSections([{ type: "ai_coach_hero" }, { type: "ai_program_list" }]) }],
        ["set_page_sections", { page: "programs", sections: pageSections({ type: "ai_program_list", settings: { heading: "All programs" } }) }],
        ["set_page_sections", { page: "about", sections: pageSections({ type: "ai_coach_story" }) }],
        ...templateCalls(),
      ],
    },
    { calls: [["finish", { summary: "The whole site." }]] },
  ]
}

/** The last tool output the model was handed that contains `text`. */
function lastOutput(req: ProviderRequest | undefined, text: string): string {
  const turns = (req?.turns ?? []) as { role: string; results?: { output: string }[] }[]
  const out = turns.flatMap((t) => (t.role === "tool" ? (t.results ?? []).map((r) => r.output) : []))
  return [...out].reverse().find((o) => o.includes(text)) ?? ""
}

async function main() {
  console.log("\n1. The rules, pure")
  {
    const dirty = `<div onclick="steal()">a</div><script>alert(1)</script><a href="javascript:alert(1)">x</a><iframe src="https://x.test"></iframe><img src=x onerror='boom()'>`
    const clean = stripScripts(dirty)
    check("scripts, inline handlers, javascript: addresses and frames are stripped", !/script|onclick|onerror|javascript:|iframe/i.test(clean), clean)
    check("  and the document forbids scripts outright (CSP script-src 'none')", /script-src 'none'/.test(CRITIC_CSP) && /default-src 'none'/.test(CRITIC_CSP))
    check("the network fence: public hosts yes; localhost, private ranges, metadata, bare names no", isPublicHost("images.unsplash.com") && !isPublicHost("localhost") && !isPublicHost("127.0.0.1") && !isPublicHost("10.2.3.4") && !isPublicHost("169.254.169.254") && !isPublicHost("192.168.1.2") && !isPublicHost("metadata.google.internal") && !isPublicHost("intranet") && !isPublicHost("[::1]"))
    check("  pictures, fonts and styles may load; scripts, fetches and sockets never", allowRequest("https://fonts.gstatic.com/a.woff2", "font") && allowRequest("data:image/png;base64,AA", "image") && !allowRequest("https://cdn.test/x.js", "script") && !allowRequest("https://api.test/x", "fetch") && !allowRequest("http://127.0.0.1/x.png", "image"))

    const over = measuredDefects("home", measurements({ scrollOverflow: 230, widest: { sectionId: "s1", sectionType: "ai_hero", selector: "h1.hx__h", over: 230 } }))
    const o = over.find((d) => d.kind === "overflow")
    check("sideways scroll at 390 is a hard gate, with the section, the selector and the size", !!o && o.gate && o.sectionType === "ai_hero" && o.selector === "h1.hx__h" && /230px/.test(o.what), o)
    const desktopOver = measuredDefects("home", measurements({ viewport: "desktop", width: 1440, scrollOverflow: 40 }))
    check("  (measured at 390 only: 1440 is not a phone gate)", !desktopOver.some((d) => d.kind === "overflow"))
    const dead = measuredDefects("home", measurements({ foldCtas: [{ sectionId: "s1", sectionType: "ai_hero", selector: "a.cta", href: "#", tag: "a", hooked: false, text: "Book now" }] }))
    check("a call to action in the first screen that goes to # is a hard gate", dead.some((d) => d.kind === "dead-cta" && d.gate))
    const hooked = measuredDefects("home", measurements({ foldCtas: [{ sectionId: "s1", sectionType: "ai_hero", selector: "a.cta", href: "#", tag: "a", hooked: true, text: "Cart" }] }))
    check("  one that opens a storefront hook is not dead", !hooked.some((d) => d.kind === "dead-cta"))
    const none = measuredDefects("home", measurements({ foldCtas: [] }))
    check("no call to action in the first screen is a high defect (not a gate)", none.some((d) => d.kind === "no-cta" && d.severity === "high" && !d.gate))
    const contrast = measuredDefects("home", measurements({ contrast: [{ sectionId: "s2", sectionType: "ai_band", selector: "p", ratio: 1.4, large: false, color: "rgb(221, 221, 221)", background: "rgb(255, 255, 255)", text: "Faint" }, { sectionId: "s3", sectionType: "ai_note", selector: "p", ratio: 3.9, large: false, color: "rgb(120, 120, 120)", background: "rgb(255, 255, 255)", text: "Grey" }] }))
    check("unreadable contrast (1.4:1) is a gate; under AA (3.9:1) is a defect, not a gate", contrast.some((d) => d.kind === "contrast" && d.gate && /1\.4:1/.test(d.what)) && contrast.some((d) => d.kind === "contrast" && !d.gate && /3\.9:1/.test(d.what)))
    const wrap = measuredDefects("home", measurements({ headings: [{ sectionId: "s1", sectionType: "ai_hero", selector: "h1", level: 1, lines: LIMITS.firstHeadingLines.mobile + 1, fontSize: 64, first: true, text: "with someone beside you every single day" }] }))
    check("a hero headline that wraps into too many lines at 390 is a specific high defect", wrap.some((d) => d.kind === "heading-wrap" && d.severity === "high" && /wraps into 6 lines at 64px on a 390px screen/.test(d.what)))
    const merged = mergeDefects([...measuredDefects("home", measurements({ foldCtas: [] })), ...measuredDefects("home", measurements({ viewport: "desktop", foldCtas: [] }))])
    check("the same fault at both widths is said once, as both", merged.filter((d) => d.kind === "no-cta").length === 1 && merged.find((d) => d.kind === "no-cta")?.viewport === "both")

    check("weighted score uses spec 8.2's weights", weightedScore(GOOD) === 3.9 && weightedScore(LOW) === 3.05, { good: weightedScore(GOOD), low: weightedScore(LOW) })
    check("  under target: weighted, or identity or composition under 4", belowTarget(LOW) && !belowTarget(GOOD) && belowTarget({ ...GOOD, identity: 3 }))

    const pages: ReviewPageInput[] = [{ page: "home", sections: [{ id: "s1", type: "ai_coach_hero" }, { id: "s2", type: "ai_band" }], shots: { page: "home", heights: { desktop: 1, mobile: 1 }, cut: false } }]
    const ok = readReview(JSON.parse(answer(GOOD, [{ severity: "high", page: "home", section: "ai_coach_hero", selector: "h1", viewport: "mobile", observation: "Headline wraps into five lines.", why: "Hides the subject.", fix: "clamp() the size.", observed: true }, { severity: "critical", page: "nowhere", section: "s2", observation: "Maybe the band flickers.", why: "Distracting.", fix: "Calm it.", observed: false }])), pages)
    check("a valid review is read, sections mapped by type or id to the page's own", ok.ok && ok.review.defects[0].sectionId === "s1" && ok.review.defects[0].viewport === "mobile" && ok.review.defects[1].sectionId === "s2" && ok.review.defects[1].page === "home", ok)
    check("  a hypothesis (observed: false) is kept but demoted to low", ok.ok && ok.review.defects[1].severity === "low")
    const bad = readReview({ scores: { ...GOOD, mobile: 9 } }, pages)
    check("a score out of 1 to 5 is refused with the axis named", !bad.ok && /scores\.mobile/.test((bad as { error: string }).error), bad)
    check("JSON in fences and prose is found", (extractJson("Here:\n```json\n{\"a\":1}\n```") as { a: number }).a === 1 && (extractJson('Sure. {"a":2} done') as { a: number }).a === 2)
  }

  console.log("\n2. The review with a scripted vision model")
  {
    const pages: ReviewPageInput[] = [{ page: "home", sections: [{ id: "s1", type: "ai_coach_hero" }], shots: { page: "home", desktopFold: "AAAA", desktopFull: "BBBB", mobileFold: "CCCC", mobileFull: "DDDD", heights: { desktop: 3000, mobile: 5000 }, cut: true } }]
    const v = vision(["I think it looks great!", answer(GOOD)])
    const r = await runReview({ brief: "A strength coach", pages, measured: ["[critical, must fix] home: overflow"] }, { provider: v, model: "claude-opus-5-5" })
    check("a bad answer gets one repair retry, then the review is read", !!r.result && v.requests.length === 2 && r.usages.length === 2, { calls: v.requests.length, error: r.error })
    const first = v.requests[0]
    const turn = first.turns[0] as { role: string; content: string; images?: { mediaType: string; data: string }[] }
    check("  the four pictures go as image content blocks (JPEG), named in the text in order", turn.images?.length === 4 && turn.images.every((im) => im.mediaType === "image/jpeg") && /Image 1: home, desktop 1440, first screen/.test(turn.content) && /Image 4: home, phone 390, whole page in columns \(cut at the bottom\)/.test(turn.content))
    check("  with the spec 11.2 reviewer as the system prompt, no tools, and the measurements as facts", first.system === REVIEW_SYSTEM && first.tools.length === 0 && /WHAT THE BROWSER MEASURED \(facts\)/.test(turn.content) && /creative director/.test(first.system))
    check("  the retry says what was wrong", /could not be used/.test(String((v.requests[1].turns[2] as { content?: string }).content)))
    const v2 = vision(["nope", "still nope"])
    const r2 = await runReview({ brief: "x", pages, measured: [] }, { provider: v2, model: "claude-opus-5-5" })
    check("two bad answers: no review, an error said, both calls' usage returned (it is spend)", r2.result === null && !!r2.error && r2.usages.length === 2 && v2.requests.length === 2)
    const v3 = vision(["nope", answer(GOOD)])
    const r3 = await runReview({ brief: "x", pages, measured: [] }, { provider: v3, model: "claude-opus-5-5", attempts: 1 })
    check("  a review whose retry would not fit the spend asks once", r3.result === null && v3.requests.length === 1)
  }

  console.log("\n3. Real Chromium: photographs and measurements, JavaScript off")
  if (!CHROMIUM) {
    console.log("  skip  no Chromium here (CHROMIUM_PATH or /opt/pw-browsers/chromium): sections 3 and 4 were not run")
  } else {
    /* A page whose own script would fix its overflow and mark itself: neither happens. */
    const raw = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">
      <div data-critic-section="s1" data-critic-type="ai_raw"><h1 id="t">Static</h1><a href="/book" style="display:inline-block;padding:14px;background:#000;color:#fff">Book a class</a>
      <div id="wide" style="width:900px;height:20px;background:#333"></div></div>
      <script>document.getElementById('wide').remove();document.documentElement.setAttribute('data-critic-js','ran');document.getElementById('t').textContent='Changed'</script>
      <img src="data:," onerror="document.documentElement.setAttribute('data-critic-js','handler')"></body></html>`
    const shot = await shootPages([{ page: "home", html: raw }], { launch: launchReal, timeoutMs: 60_000 })
    check("the page was photographed", !!shot && shot.shots.length === 1, shot === null ? "null" : undefined)
    if (shot) {
      const m = shot.measurements[0]
      check("JavaScript is disabled: neither the page's script nor an inline handler ran (proven)", shot.jsDisabled === true && m.desktop.headings[0]?.text === "Static", { js: shot.jsDisabled, heading: m.desktop.headings[0] })
      check("  so the overflow the script would have removed is measured at 390: the page scrolls sideways", m.mobile.scrollOverflow > 400, m.mobile.scrollOverflow)
      const defects = measuredDefects("home", m.mobile)
      check("  and it is a hard gate naming the section", defects.some((d) => d.kind === "overflow" && d.gate && d.sectionType === "ai_raw"), defects)
      const s = shot.shots[0]
      check("four photographs: desktop and phone, first screen and whole page", !!(s.desktopFold && s.desktopFull && s.mobileFold && s.mobileFull))
    }

    /* A draft drawn from the job's own .storelib sections. */
    const sources = { "sections/ai_bad_hero.storelib": BAD, "sections/ai_coach_hero.storelib": HERO }
    const doc = composeDraftDocument({ page: "home", pages: [{ key: "home", sections: [{ id: "bad1", type: "ai_bad_hero", settings: {} }, { id: "hero1", type: "ai_coach_hero", settings: {} }] as never }], settings: {}, sources, capabilities: CAPS })
    check("the draft document is drawn from the sections with no script in it", doc.drawn.length === 2 && !/<script/i.test(doc.html) && /Content-Security-Policy/.test(doc.html), doc.failed)
    const drawn = await shootPages([{ page: "home", html: doc.html }], { launch: launchReal, timeoutMs: 60_000 })
    const all = drawn ? mergeDefects([...measuredDefects("home", drawn.measurements[0].desktop), ...measuredDefects("home", drawn.measurements[0].mobile)]) : []
    check("overflow detected at 390 in the bad section, as a gate, pointing at the strip", all.some((d) => d.kind === "overflow" && d.gate && d.sectionId === "bad1" && d.selector === "div.bd__strip"), all.map((d) => `${d.kind}:${d.sectionId}:${d.gate}`))
    check("the dead call to action (#) in the first screen, as a gate", all.some((d) => d.kind === "dead-cta" && d.gate && d.sectionId === "bad1"))
    check("the unreadable text (#ddd on white), as a gate", all.some((d) => d.kind === "contrast" && d.gate && d.sectionId === "bad1"))
    check("  the gates come first", all.length > 0 && all[0].gate)

    const v = vision([answer(LOW, [{ severity: "high", page: "home", section: "ai_coach_hero", selector: "h1", viewport: "mobile", observation: "The headline sits under a strip that runs off the screen.", why: "The first screen reads as broken.", fix: "Wrap the strip and stack it under 640px.", observed: true }])])
    const visionRole: ModelRole = { provider: v, model: "claude-opus-5-5", effort: "medium" }
    const kept: string[] = []
    const critic = createVisualCritic({ review: visionRole, available: () => ({ ok: true }), launch: launchReal, keepShot: async (jpeg) => (kept.push(jpeg), true) })
    const project = { pages: [{ key: "home", sections: [{ id: "bad1", type: "ai_bad_hero", settings: {} }, { id: "hero1", type: "ai_coach_hero", settings: {} }] as never }], settings: {}, sources, capabilities: CAPS }
    const rep = await critic({ brief: "A strength coach in Leeds", pages: ["home"], project, maxUsd: 5, timeoutMs: 120_000 })
    check("the critic reviews: status reviewed, scores, the review's defect with the section mapped", rep.status === "reviewed" && rep.weighted === weightedScore(LOW) && rep.defects.some((d) => d.source === "review" && d.sectionId === "hero1"), { status: rep.status, reason: rep.reason, defects: rep.defects.map((d) => d.kind) })
    check("  the vision model saw 4 pictures of the page, and the browser's gates as facts", (v.requests[0]?.turns[0] as { images?: unknown[] }).images?.length === 4 && /must fix/.test(String((v.requests[0]?.turns[0] as { content: string }).content)))
    check("  its spend is counted (Opus price of the usage)", rep.usage.calls === 1 && rep.usage.usd > 0 && rep.usage.inputTokens === 9_000, rep.usage)
    check("  the first screen was kept for the progress panel", kept.length === 1 && rep.shotKept === true)
    const v0 = vision([answer(GOOD)])
    const capped = await createVisualCritic({ review: { provider: v0, model: "claude-opus-5-5" }, available: () => ({ ok: true }), launch: launchReal })({ brief: "x", pages: ["home"], project, maxUsd: 0.001, timeoutMs: 120_000 })
    check("a spending cap that cannot fit the review: measured only, said, no call made", capped.status === "measured" && /spending cap/.test(capped.reason ?? "") && v0.requests.length === 0 && capped.defects.some((d) => d.gate))
  }

  console.log("\n4. The agent loop: a whole website, a real browser, a scripted vision model")
  if (CHROMIUM) {
    const store = memoryStore({ pages: { home: [] }, settings: {} })
    let fixRequest: ProviderRequest | null = null
    const steps: Step[] = [
      ...wholeSite(WIDE_HERO),
      /* The design review refused finish: the agent fixes what it was told, and finishes again. */
      (req) => {
        fixRequest = req
        return { calls: [["write_file", { path: "sections/ai_coach_hero.storelib", content: HERO }]] }
      },
      { calls: [["finish", { summary: "Fixed the hero." }]] },
    ]
    const v = vision([answer(LOW, [{ severity: "high", page: "home", section: "ai_coach_hero", viewport: "mobile", observation: "The headline runs off the phone screen.", why: "The promise is cut.", fix: "Let it wrap; clamp its size.", observed: true }]), answer(GOOD)])
    const critic = createVisualCritic({ review: { provider: v, model: "claude-opus-5-5", effort: "medium" }, available: () => ({ ok: true }), launch: launchReal })
    const { deps } = depsFor(store, steps, critic)
    const r = await runAgentSlice(jobInput(), null, deps, { deadline: T0 + 30 * 60_000 })
    const said = fixRequest ? lastOutput(fixRequest, "design review") : ""
    check("the first finish is refused by the design review with the overflow at 390 as a must-fix", /Not finished: the design review drew the pages in a browser/.test(said) && /must fix\]/.test(said) && /390px/.test(said), said.slice(0, 1200))
    check("  a numbered task naming the component's file", /1\. \[critical, must fix\] home \/ section ai_coach_hero/.test(said) && /file sections\/ai_coach_hero\.storelib/.test(said), said.slice(0, 800))
    check("  'Reviewing the design' is a step in the progress events, then the repair phase", r.events.some((e) => e.kind === "phase" && e.label === "Reviewing the design") && r.events.some((e) => e.kind === "phase" && e.phase === "repair" && /design problem/.test(e.label)))
    check("after the fix the second review passes the gate and the job completes", r.status === "complete", { status: r.status, summary: r.summary })
    check("  two reviews, two vision calls, and the summary says the review honestly", r.checkpoint.critic?.rounds === 2 && v.requests.length === 2 && /Design review: 3\.9 of 5/.test(r.summary ?? ""), { critic: r.checkpoint.critic, summary: r.summary })
    if (process.env.O4_DEBUG) console.log(JSON.stringify(r.checkpoint.critic, null, 1), said)
    const reviewSpend = r.events.filter((e): e is Extract<AgentEvent, { kind: "spend" }> => e.kind === "spend" && e.inputTokens === 9_000)
    check("  the review's spend is in the job's spend (spend events, totalUsd)", reviewSpend.length === 2 && r.totalUsd >= reviewSpend.reduce((n, e) => n + e.usd, 0) && r.checkpoint.usd === r.totalUsd, { n: reviewSpend.length, total: r.totalUsd })
    const notes = r.events.filter((e): e is Extract<AgentEvent, { kind: "note" }> => e.kind === "note").map((e) => e.text)
    check("  each review leaves a plain line for the panel", notes.some((t) => /^Looked at (the page|\d+ pages) on desktop and phone/.test(t) && /must be fixed/.test(t)), notes)
  }

  console.log("\n5. No browser, and a gate that will not go")
  {
    const prev = process.env.CHROMIUM_PATH
    process.env.CHROMIUM_PATH = "/nonexistent/chromium"
    check("browserAvailable: a CHROMIUM_PATH that is not there is no browser", browserAvailable().ok === false)
    check("  nor is a laptop with neither CHROMIUM_PATH nor a function host", browserAvailable({} as unknown as NodeJS.ProcessEnv).ok === false && browserAvailable({ VERCEL: "1" } as unknown as NodeJS.ProcessEnv).ok === true)
    const v = vision([answer(GOOD)])
    const critic = createVisualCritic({ review: { provider: v, model: "claude-opus-5-5" } })
    const store = memoryStore({ pages: { home: [] }, settings: {} })
    const { deps } = depsFor(store, wholeSite(HERO), critic)
    const r = await runAgentSlice(jobInput(), null, deps, { deadline: T0 + 30 * 60_000 })
    check("no browser: the job completes, and the summary says 'Not visually checked' (never a pass)", r.status === "complete" && /Not visually checked: no browser is installed on this server/.test(r.summary ?? "") && !/Design review:/.test(r.summary ?? ""), r.summary)
    check("  a note says so in the progress list, and no vision call was made", r.events.some((e) => e.kind === "note" && /^Not visually checked/.test(e.text)) && v.requests.length === 0 && r.checkpoint.critic?.status === "unverified")
    if (prev === undefined) delete process.env.CHROMIUM_PATH
    else process.env.CHROMIUM_PATH = prev

    /* A gate that stays: a fake critic that always finds sideways scrolling. */
    let calls = 0
    const stubborn: VisualCriticRunner = async (req) => {
      calls++
      const report: CriticReport = { status: "measured", reason: "no vision model was available for the review", pages: req.pages, defects: [{ severity: "critical", kind: "overflow", page: "home", sectionId: "x", sectionType: "ai_coach_hero", selector: "h1", viewport: "mobile", what: "h1 sticks out 200px past a 390px wide screen.", why: "Sideways scroll.", fix: "Wrap it.", gate: true, source: "measure" }], shots: [], usage: { usd: 0.02, inputTokens: 100, outputTokens: 10, calls: 1 }, ms: 1 }
      return report
    }
    const store2 = memoryStore({ pages: { home: [] }, settings: {} })
    const { deps: deps2 } = depsFor(store2, [...wholeSite(HERO), { calls: [["finish", { summary: "Tried." }]] }], stubborn)
    const p = await runAgentSlice(jobInput(), null, deps2, { deadline: T0 + 30 * 60_000 })
    check("a gate still failing after the last review: partial, saying what must be fixed", p.status === "partial" && calls === 2 && /The design review still finds 1 problem that must be fixed: home \(coach hero\): h1 sticks out 200px/.test(p.summary ?? ""), { status: p.status, calls, summary: p.summary })
    check("  and the file is in the failing list", (p.checkpoint.final?.failing ?? []).includes("sections/ai_coach_hero.storelib"), p.checkpoint.final)

    /* No critic at all (the suites that do not wire one): nothing changes, nothing is claimed. */
    const store3 = memoryStore({ pages: { home: [] }, settings: {} })
    const { deps: deps3 } = depsFor(store3, wholeSite(HERO))
    const q = await runAgentSlice(jobInput(), null, deps3, { deadline: T0 + 30 * 60_000 })
    check("without a critic the job is as before: complete, no review words", q.status === "complete" && q.summary === "The whole site." && !q.checkpoint.critic?.status, q.summary)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
