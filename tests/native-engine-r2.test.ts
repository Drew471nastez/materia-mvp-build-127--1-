/**
 * ===========================================================================
 *  ROUND R, R2: THE NATIVE ENGINE (OpenPage-style JSON over real sections)
 * ===========================================================================
 *   1. the registry is generated from the real schemas, and fails on drift
 *   2. the tool is strict-ready; the flag reads as documented
 *   3. validation: types, allowed values, ranges, links, bindings to this
 *      creator only, no markup or script, nothing invented; unsupported
 *      features mapped or dropped, and recorded; stable ids
 *   4. generation -> validation -> repair with the exact issues, bounded
 *   5. the classic job with the native engine: placed through the same build,
 *      the write step skips what was generated, photos fill the briefs,
 *      fallback to the classic planner when nothing can be placed
 *   6. six businesses, six different section strategies and token sets
 *   7. through the real routes (tests/_journey): saved as drafts, edited and
 *      re-read through the editor's sections route, drawn by the native
 *      renderer, other creators kept out
 *
 * SCRIPTED, SAID PLAINLY: the model is a script (./native-engine-r2-fixtures.ts).
 * Everything it sends is checked and placed by the real code; nothing here says
 * how good a real model's website would be.
 */
import "./_journey/env"
process.env.CHROMIUM_PATH = "/nonexistent/chromium"
process.env.AI_JOB_SECRET = "native-r2-ai-job-secret-for-tests-only"
process.env.AI_BUILDER_AGENT = "0"
import { checker } from "./ai-builder-e2e-kit"
import { SCENARIOS, CALL_FORM, kv, sec, site } from "./native-engine-r2-fixtures"
import { ceramicsPlan, fakeOpenverse, fakeProvider, memorySite, type CallLog } from "./ai-site-fakes"
import { SECTION_SCHEMAS, ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { DESIGN_PRESETS } from "@/lib/website-builder/design-presets"
import { ADJUSTABLE_SETTINGS } from "@/lib/website-builder/agent/site-plan"
import { strictReady } from "@/lib/sites/agent/strict-schema"
import { buildNativeRegistry, nativeRegistry, registryFingerprints, EXCLUDED, OVERRIDES, ALIASES } from "@/lib/website-builder/ai-site/native/registry"
import { NATIVE_REGISTRY_SNAPSHOT } from "@/lib/website-builder/ai-site/native/registry-snapshot"
import { nativeTool, NATIVE_TOOL } from "@/lib/website-builder/ai-site/native/schema"
import { validateNativeSite } from "@/lib/website-builder/ai-site/native/validate"
import { generateNativeSite, NativeGenerationError, readBrainHints, strategyPlan, offeredTypes } from "@/lib/website-builder/ai-site/native/generate"
import { nativeEngineEnabled } from "@/lib/website-builder/ai-site/native/flag"
import { isNativePlan } from "@/lib/website-builder/ai-site/native/plan"
import type { NativeContext } from "@/lib/website-builder/ai-site/native/types"
import { newJob, runUntil, type JobDeps } from "@/lib/website-builder/ai-site/job"
import { PLAN_MODEL, SMALL_MODEL, WRITE_MODEL, type Models } from "@/lib/website-builder/ai-site/models"
import { designBrainFor } from "@/lib/storelib-ai/library/brain"
import { briefFrom } from "@/lib/storelib-ai/direction"
import type { AgentProvider, ProviderRequest, ProviderTurn } from "@/lib/sites/agent/types"
import type { SiteState } from "@/lib/website-builder/ai-site/apply"
import type { Capabilities } from "@/lib/website-builder/ai-site/capabilities"

const { check, done, section } = checker()
const reg = nativeRegistry()
const FORMS = [{ url: CALL_FORM, id: CALL_FORM, name: "First call" }]
const ctxFor = (caps: Capabilities, prompt = "", extra: Partial<NativeContext> = {}): NativeContext => ({ registry: reg, caps, images: [], forms: FORMS, prompt, seed: "r2seed01", ...extra })
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))
const USAGE = { inputTokens: 1000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 2000 }

/** A provider that answers the native tool from a script and every other call like ./ai-site-fakes' careful model. */
function scripted(answers: (unknown | ((req: ProviderRequest) => unknown))[], log: { native: ProviderRequest[]; other: CallLog[] }, opts: { plan?: unknown } = {}): AgentProvider {
  const other = fakeProvider(log.other, { plan: opts.plan })
  let n = 0
  return {
    id: "scripted",
    async complete(req: ProviderRequest): Promise<ProviderTurn> {
      if (!req.tools.some((t) => t.name === NATIVE_TOOL)) return other.complete(req)
      log.native.push(req)
      const a = answers[Math.min(n++, answers.length - 1)]
      const value = typeof a === "function" ? (a as (r: ProviderRequest) => unknown)(req) : a
      if (value instanceof Error) throw value
      return { text: "", toolCalls: [{ id: `n${n}`, name: NATIVE_TOOL, argumentsJson: typeof value === "string" ? value : JSON.stringify(value) }], raw: null, usage: USAGE, stop: "tool_calls" }
    },
  }
}
const modelsOf = (provider: AgentProvider): Models => ({ plan: { provider, model: PLAN_MODEL }, write: { provider, model: WRITE_MODEL }, small: { provider, model: SMALL_MODEL } })

function startingSite(): SiteState {
  return {
    settings: {},
    pages: {
      home: [
        { id: "header-1", type: "header", name: "Header", settings: {}, blocks: [] },
        { id: "footer-1", type: "footer", name: "Footer", settings: {}, blocks: [] },
      ],
    },
  }
}

async function main() {
  /* A call that hangs waits on timers Node does not count as work: keep the process up until done() exits it. */
  setInterval(() => undefined, 60_000)
  /* ── 1 ─────────────────────────────────────────────────────────────── */
  section("1. The registry is generated from the real schemas")
  const addable = [...ADDABLE_SECTIONS]
  check("every type Add section offers is in the registry or excluded with a reason", addable.every((t) => !!reg.sections[t] !== !!reg.excluded[t]) && Object.values(reg.excluded).every((why) => why.length > 8), addable.filter((t) => !!reg.sections[t] === !!reg.excluded[t]))
  check("  nothing outside Add section's list", Object.keys(reg.sections).every((t) => addable.includes(t)))
  check("  forty or more section types usable for generation", Object.keys(reg.sections).length >= 40, Object.keys(reg.sections).length)
  const NOT = new Set(["header", "paragraph", "divider"])
  const drift: string[] = []
  for (const [type, def] of Object.entries(reg.sections)) {
    const schema = SECTION_SCHEMAS[type]
    const fields = schema.fields.filter((f) => !NOT.has(f.type))
    if (fields.map((f) => f.id).join() !== def.settings.map((s) => s.id).join()) drift.push(`${type}: setting ids`)
    for (const f of fields) {
      const s = def.settings.find((x) => x.id === f.id)!
      if (!s || s.fieldType !== f.type) drift.push(`${type}.${f.id}: type`)
      if (s && JSON.stringify(s.values ?? null) !== JSON.stringify((f.type === "select" || f.type === "radio") && f.options?.length ? f.options.map((o) => String(o.value)) : null)) drift.push(`${type}.${f.id}: values`)
      if (s && (s.min !== f.min || s.max !== f.max || JSON.stringify(s.default) !== JSON.stringify(f.default) || !!s.responsive !== !!f.responsive)) drift.push(`${type}.${f.id}: range/default/responsive`)
    }
    if ((schema.blocks ?? []).map((b) => b.type).join() !== def.blocks.map((b) => b.type).join()) drift.push(`${type}: block types`)
    for (const b of schema.blocks ?? []) {
      const nb = def.blocks.find((x) => x.type === b.type)!
      if (b.fields.filter((f) => !NOT.has(f.type)).map((f) => `${f.id}:${f.type}`).join() !== nb.settings.map((s) => `${s.id}:${s.fieldType}`).join()) drift.push(`${type}/${b.type}: block settings`)
      if ((b.limit ?? null) !== nb.limit) drift.push(`${type}/${b.type}: limit`)
    }
    if ((schema.max_blocks ?? null) !== def.maxBlocks) drift.push(`${type}: max_blocks`)
  }
  check("  every setting, choice, range, default, block and limit is the schema's own", drift.length === 0, drift.slice(0, 20))
  const pickers = Object.values(reg.sections).flatMap((d) => [...d.settings, ...d.blocks.flatMap((b) => b.settings)])
  check("  image, product, collection, community and form bindings are classified", pickers.filter((s) => /picker|_list/.test(s.fieldType) && s.role !== "fixed").every((s) => !!s.binding) && reg.sections.native_form.settings.find((s) => s.id === "form_url")?.binding === "form" && reg.sections.product_grid.bindings.includes("product_list") && reg.sections.collection_featured.bindings.includes("collection"))
  check("  people's words and faces are never generated", ["proof_testimonials", "testimonial_wall", "team_grid"].every((t) => reg.sections[t].blocks.every((b) => b.settings.filter((s) => /^(quote|name|role|avatar|photo|rating)$/.test(s.id)).every((s) => !s.generated))))
  const fonts = (id: string) => (THEME_SETTINGS_GROUPS.flatMap((g) => g.fields ?? []).find((f) => f.id === id)?.options ?? []).map((o) => String(o.value)).filter(Boolean)
  check("theme tokens from Theme settings and the presets", JSON.stringify(reg.theme.fonts.heading) === JSON.stringify(fonts("font_heading")) && JSON.stringify(reg.theme.fonts.body) === JSON.stringify(fonts("font_body")) && reg.theme.presets.map((p) => p.id).join() === DESIGN_PRESETS.map((p) => p.id).join() && reg.theme.settings.every((s) => (ADJUSTABLE_SETTINGS as readonly string[]).includes(s.id)) && reg.theme.settings.length >= 8 && reg.theme.schemes.includes("dark"))
  const rebuilt = buildNativeRegistry({ schemas: SECTION_SCHEMAS, addable: ADDABLE_SECTIONS, groups: THEME_SETTINGS_GROUPS, presets: DESIGN_PRESETS })
  check("  building again gives the same registry", JSON.stringify(rebuilt) === JSON.stringify(reg))
  check("the curated part names only real types and settings", Object.keys(EXCLUDED).every((t) => addable.includes(t)) && Object.keys(OVERRIDES).every((k) => { const [t, f] = k.split("."); return SECTION_SCHEMAS[t]?.fields.some((x) => x.id === f) }) && Object.values(ALIASES).every((t) => !!reg.sections[t]))
  const fp = registryFingerprints(reg)
  const changed = [...new Set([...Object.keys(fp), ...Object.keys(NATIVE_REGISTRY_SNAPSHOT)])].filter((k) => fp[k] !== NATIVE_REGISTRY_SNAPSHOT[k])
  check("DRIFT: the registry matches its reviewed snapshot (lib/website-builder/ai-site/native/registry-snapshot.ts)", changed.length === 0, changed.length ? `changed: ${changed.join(", ")} (the new snapshot is printed below)` : undefined)
  if (changed.length) console.log(`NEW NATIVE_REGISTRY_SNAPSHOT, after review:\n${Object.entries(fp).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n")}`)
  const drifted = buildNativeRegistry({ schemas: { ...SECTION_SCHEMAS, hero_split: { ...SECTION_SCHEMAS.hero_split, fields: SECTION_SCHEMAS.hero_split.fields.map((f) => (f.id === "image_side" ? { ...f, options: [...(f.options ?? []), { label: "Top", value: "top" }] } : f)) } }, addable: ADDABLE_SECTIONS, groups: THEME_SETTINGS_GROUPS, presets: DESIGN_PRESETS })
  check("  a changed schema (a new choice on hero_split) is caught by that check", registryFingerprints(drifted).hero_split !== NATIVE_REGISTRY_SNAPSHOT.hero_split && registryFingerprints(drifted).hero_centered === NATIVE_REGISTRY_SNAPSHOT.hero_centered)

  /* ── 2 ─────────────────────────────────────────────────────────────── */
  section("2. The tool and the flag")
  const types = Object.keys(reg.sections)
  const tool = nativeTool(reg, types)
  check("the tool schema is strict-ready for both providers", strictReady(tool.parameters) && strictReady(tool.parameters, { allRequired: true }))
  const params = tool.parameters as { properties: { pages: { items: { properties: { sections: { items: { properties: { type: { enum: string[] } } } } } } }; theme: { properties: { preset: { enum: string[] } } } } }
  check("  section types, presets and fonts are the registry's enums", params.properties.pages.items.properties.sections.items.properties.type.enum.join() === types.join() && params.properties.theme.properties.preset.enum.join() === DESIGN_PRESETS.map((p) => p.id).join())
  check("  small enough to send with every call (under 40 KB)", JSON.stringify(tool).length < 40_000, JSON.stringify(tool).length)
  check("AI_NATIVE_ENGINE: on by default, off with 0/off/false/no", nativeEngineEnabled({}) && nativeEngineEnabled({ AI_NATIVE_ENGINE: "1" }) && ["0", "off", "false", "NO"].every((v) => !nativeEngineEnabled({ AI_NATIVE_ENGINE: v })))

  /* ── 3 ─────────────────────────────────────────────────────────────── */
  section("3. Validation")
  for (const s of SCENARIOS) {
    const v = validateNativeSite(s.answer, ctxFor(s.caps, s.prompt))
    check(`${s.id}: the scripted answer is valid, nothing mapped`, v.issues.length === 0 && v.mapped.length === 0 && v.site.pages[0].key === "home", v.issues.slice(0, 5))
  }
  const fit = SCENARIOS[0]
  const again = validateNativeSite(fit.answer, ctxFor(fit.caps, fit.prompt))
  const once = validateNativeSite(fit.answer, ctxFor(fit.caps, fit.prompt))
  check("stable ids: the same answer gives the same section and block ids", JSON.stringify(again.site) === JSON.stringify(once.site) && again.site.pages[0].sections.every((s) => s.id.includes("r2seed01")) && new Set(again.site.pages.flatMap((p) => p.sections.map((s) => s.id))).size === again.site.pages.reduce((n, p) => n + p.sections.length, 0))
  const bad = clone(fit.answer) as ReturnType<typeof site>
  const home = bad.pages[0].sections
  home[0].settings = kv({ heading: 'Lift <script>alert(1)</script>', button_text: "Go", button_url: "javascript:alert(1)", position: "middle", padding_top: 900 })
  home[2].settings = kv({ heading: "<b>Bold</b> plan", columns: { desktop: 9, mobile: 1 } })
  home[3].settings = kv({ heading: "Your first month", subheading: "Visit https://example.com for more" })
  home.push(sec("cta_simple", "light", { heading: "Only $9 today", button_text: "Buy", button_url: "https://evil.example/pay" }))
  home.push(sec("hero_product", "light", { heading: "Someone else's", button_text: "Buy", button_url: "/products/not-mine" }))
  const v = validateNativeSite(bad, ctxFor(fit.caps, fit.prompt))
  const has = (re: RegExp) => v.issues.some((i) => re.test(`${i.path} ${i.message}`))
  check("a script in a heading is refused", has(/sections\[0\]\.settings\.heading .*script/))
  check("a javascript: link is refused", has(/sections\[0\]\.settings\.button_url .*not a safe address/))
  check("a choice outside the control's values is refused, with the list", has(/position "middle" is not one of bottom_left/))
  check("a range is clamped to the control, and noted", v.site.pages[0].sections[0].settings.padding_top === 160 && v.notes.some((n) => /padding_top: 900 set to 160/.test(n)))
  check("a responsive value is kept per breakpoint, clamped", JSON.stringify(v.site.pages[0].sections[2].settings.columns) === JSON.stringify({ desktop: 4, mobile: 1 }))
  check("HTML in a plain text setting is refused", has(/sections\[2\]\.settings\.heading .*no HTML/))
  check("a link outside the site and its products is refused", has(/evil\.example/))
  check("an invented price is refused", has(/names a price \(\$9\)/))
  check("a product that is not this store's is refused", has(/not-mine.* not one of this store's published products/))
  check("  the refused values are not in the placed site", !JSON.stringify(v.site).includes("script") && !JSON.stringify(v.site).includes("evil.example") && !JSON.stringify(v.site).includes("not-mine"))

  const other = clone(fit.answer) as ReturnType<typeof site>
  other.pages[0].sections.unshift({ ...sec("navbar", "light", { logo: "x" }) }, { ...sec("hero", "dark", { heading: "Strong at any age", button_text: "Book", button_url: "/book" }) }, { ...sec("popup", "light", { heading: "Wait" }) }, { ...sec("proof_testimonials", "light", { heading: "What they say" }) })
  other.pages.push({ key: "products", title: "Shop", purpose: "x", sections: [sec("cta_simple", "light", { heading: "Shop" })] })
  other.pages[0].sections.push(sec("hero_product", "light", { heading: "The block", button_text: "Join", button_url: "p-strength" }))
  const m = validateNativeSite(other, ctxFor(fit.caps, fit.prompt))
  const mapped = (from: string, to: string | null) => m.mapped.some((x) => x.from === from && x.to === to)
  check("unsupported: OpenPage's \"navbar\" left out (the header is the frame), recorded", mapped("navbar", null) && !m.site.pages[0].sections.some((s) => s.type === "navbar"))
  check("unsupported: \"hero\" mapped to hero_centered, recorded", mapped("hero", "hero_centered") && m.site.pages[0].sections[0].type === "hero_centered")
  check("unsupported: an excluded type (popup) refused with its reason", mapped("popup", null) && m.issues.some((i) => /popup.*the creator's choice/.test(i.message)))
  check("unsupported: testimonials with no real quotes refused (never invented)", mapped("proof_testimonials", null) && m.issues.some((i) => /no real buyer quotes/.test(i.message)))
  check("unsupported: a page the store draws itself (products) left out", mapped("products", null) && !m.site.pages.some((p) => p.key === "products"))
  check("a product id where an address is wanted is mapped to the address, recorded", mapped("p-strength", "/products/eight-week-strength") && m.site.pages[0].sections.some((s) => s.type === "hero_product" && s.settings.button_url === "/products/eight-week-strength"))

  const tenant = clone(SCENARIOS[5].answer) as ReturnType<typeof site>
  tenant.pages[0].sections[5].settings = kv({ form_url: "00000000-0000-4000-8000-0000000000ff", button_text: "Book" })
  const tv = validateNativeSite(tenant, ctxFor(SCENARIOS[5].caps))
  check("bindings: a form that is not this creator's is refused", tv.issues.some((i) => /form_url .*not one of the creator's forms/.test(`${i.path} ${i.message}`)))
  const cl = clone(SCENARIOS[1].answer) as ReturnType<typeof site>
  cl.pages[0].sections[1].settings = kv({ heading: "This run", source: "chosen", chosen: "p-tee,p-elsewhere" })
  cl.pages[0].sections[2].settings = kv({ heading: "Kinds", source: "chosen", chosen: "basics" })
  const cv = validateNativeSite(cl, ctxFor(SCENARIOS[1].caps))
  check("bindings: a product list with another store's id is refused", cv.issues.some((i) => /p-elsewhere (is|are) not this store's published products/.test(i.message)))
  check("bindings: a collection list takes ids only", cv.issues.some((i) => /basics not this store's collections/.test(i.message)))
  const img = clone(fit.answer) as ReturnType<typeof site>
  img.pages[0].sections[0].settings.push({ id: "image", value: "https://somewhere.example/photo.jpg" })
  const iv = validateNativeSite(img, ctxFor(fit.caps, fit.prompt, { images: [{ url: "https://storelib.com/media/own.jpg", alt: "Coach" }] }))
  check("images: only the creator's own pictures; anything else is briefed for the photo step", iv.issues.some((i) => /not one of the creator's pictures/.test(i.message)))
  img.pages[0].sections[0].settings = img.pages[0].sections[0].settings.map((x) => (x.id === "image" ? { id: "image", value: "https://storelib.com/media/own.jpg" } : x))
  check("  the creator's own picture is taken", validateNativeSite(img, ctxFor(fit.caps, fit.prompt, { images: [{ url: "https://storelib.com/media/own.jpg", alt: "Coach" }] })).site.pages[0].sections[0].settings.image === "https://storelib.com/media/own.jpg")
  const empty = validateNativeSite({ pages: [{ key: "home", sections: [sec("faq_accordion", "light", { heading: "Q" }, [["qa", { question: "One?", answer: "Yes." }]])] }] }, ctxFor(fit.caps))
  check("a section designed around items needs at least two; a home page at least six sections", empty.issues.some((i) => /needs at least 2 blocks/.test(i.message)) && empty.issues.some((i) => /needs at least 6/.test(i.message)))
  const garbage = validateNativeSite("not json", ctxFor(fit.caps))
  check("garbage is an issue, never a throw", garbage.issues.length > 0 && garbage.site.pages.length === 0)

  /* ── 4 ─────────────────────────────────────────────────────────────── */
  section("4. Generation, validation, repair")
  const broken = clone(fit.answer) as ReturnType<typeof site>
  broken.pages[0].sections[0].settings = kv({ heading: "Get strong <script>x</script>", button_text: "Book", button_url: "/book", height: "70" })
  broken.pages[0].sections.push(sec("pricing", "light", { heading: "Prices" }))
  const log = { native: [] as ProviderRequest[], other: [] as CallLog[] }
  const brain = designBrainFor(briefFrom(fit.prompt, null, null))
  const r = await generateNativeSite({ request: fit.prompt, ctx: ctxFor(fit.caps, fit.prompt), brain, direction: "ART DIRECTION: performance sport", designMd: "---\nname: Iron North\n---\n## Colors\nVolt on ink." }, { model: { provider: scripted([broken, fit.answer], log), model: PLAN_MODEL } })
  check("the first answer had issues; one repair turn; the repaired answer kept", r.attempts === 2 && r.issues.length === 0 && log.native.length === 2)
  const repairText = String((log.native[1].turns[0] as { content: string }).content)
  check("  the repair turn quotes the exact issues with their paths", /pages\[0\]\.sections\[0\]\.settings\.heading: contains markup or a script/.test(repairText) && /height: "70" is not one of 80, 100, 60/.test(repairText) && /YOUR PREVIOUS ANSWER/.test(repairText), repairText.slice(-1500))
  const first = log.native[0]
  check("  the call carries the tool (strict-ready), the library, the design rules, the brain, the direction and DESIGN.md", first.tools.length === 1 && first.tools[0].name === NATIVE_TOOL && /THE LIBRARY/.test(first.system) && /hero_split: /.test(first.system) && /DESIGN BRAIN \(r1\./.test(String((first.turns[0] as { content: string }).content)) && /ART DIRECTION/.test(String((first.turns[0] as { content: string }).content)) && /Volt on ink/.test(String((first.turns[0] as { content: string }).content)))
  check("  the brain's hints are read defensively (any shape)", readBrainHints(brain.hints)!.sectionStrategy.length > 2 && !!readBrainHints(brain.hints)!.tokens && readBrainHints({ sectionStrategy: "x", tokens: { a: { b: 1 } } })?.sectionStrategy.length === 0 && readBrainHints({ sectionStrategy: "x", tokens: { a: { b: 1 } } })?.tokens === null && readBrainHints(null) === null)
  const userText = String((first.turns[0] as { content: string }).content)
  const plan0 = strategyPlan(readBrainHints(brain.hints), offeredTypes(ctxFor(fit.caps, fit.prompt)))
  /* Changed on purpose (r56): the brain's strategy is offered as SECTION IDEAS (ingredients), not a plan in order to follow. */
  check("  the brain's section strategy is offered as SECTION IDEAS, each with real offered types", plan0.length >= 3 && /SECTION IDEAS/.test(userText) && !/STARTING SECTION PLAN/.test(userText) && plan0.every((st) => st.types.every((t) => !!reg.sections[t] && t !== "proof_testimonials") && userText.includes(st.types.join(" or "))), plan0)
  check("  the brain's tokens are in the prompt, said to be applied", /TOKENS \(applied to Theme settings/.test(userText) && userText.includes(brain.hints.tokens.colors.background))
  /* Changed on purpose (r56): NATIVE_PROMPT_VERSION native-r56. */
  check("  versions recorded", r.promptVersion === "native-r56" && r.site.version.startsWith("native-r56/") && r.brainVersion === brain.version)
  check("  the spend of both calls is counted", r.spend.calls === 2 && r.spend.usd > 0)
  const always = { native: [] as ProviderRequest[], other: [] as CallLog[] }
  const r2 = await generateNativeSite({ request: fit.prompt, ctx: ctxFor(fit.caps, fit.prompt) }, { model: { provider: scripted([broken], always), model: PLAN_MODEL } })
  check("bounded: at most two repairs, then the best answer with the invalid values taken out", r2.attempts === 3 && always.native.length === 3 && r2.issues.length > 0 && !JSON.stringify(r2.site).includes("<script") && r2.site.pages[0].sections.length >= 6)
  let threw = ""
  try {
    await generateNativeSite({ request: "x", ctx: ctxFor(fit.caps) }, { model: { provider: scripted([{ pages: [] }], { native: [], other: [] }), model: PLAN_MODEL } })
  } catch (e) {
    threw = e instanceof NativeGenerationError ? e.message : "other"
  }
  check("nothing placeable after every try: NativeGenerationError (the job falls back)", /no usable answer/.test(threw), threw)
  const hang: AgentProvider = { id: "hang", complete: (req) => new Promise((_, reject) => req.signal?.addEventListener("abort", () => reject(new Error("aborted by timeout")))) }
  const t0 = Date.now()
  let timedOut = ""
  try {
    await generateNativeSite({ request: "x", ctx: ctxFor(fit.caps) }, { model: { provider: hang, model: PLAN_MODEL }, timeoutMs: 150, maxRepairs: 1 })
  } catch (e) {
    timedOut = e instanceof Error ? e.message : ""
  }
  check("a call that hangs is cut at its timeout, and said", /aborted by timeout/.test(timedOut) && Date.now() - t0 < 5_000, timedOut)
  const late = { native: [] as ProviderRequest[], other: [] as CallLog[] }
  const r3 = await generateNativeSite({ request: fit.prompt, ctx: ctxFor(fit.caps, fit.prompt) }, { model: { provider: scripted([broken, fit.answer], late), model: PLAN_MODEL }, deadline: Date.now() + 10_000 })
  check("no repair starts with less than a minute left before the job hands over", r3.attempts === 1 && late.native.length === 1)

  /* ── 5 ─────────────────────────────────────────────────────────────── */
  section("5. The classic job with the native engine")
  const jobLog = { native: [] as ProviderRequest[], other: [] as CallLog[] }
  const memory = memorySite(startingSite())
  const searches: string[] = []
  const saved: string[] = []
  const deps: JobDeps = {
    models: modelsOf(scripted([fit.answer], jobLog)),
    site: memory,
    capabilities: async () => fit.caps,
    images: { search: fakeOpenverse(searches), copy: async (url) => ({ ok: true as const, url: `https://storelib.com/media/${encodeURIComponent(url).slice(-40)}` }) },
    schemas: SECTION_SCHEMAS,
    addable,
    native: { images: async () => [], forms: async () => FORMS },
    save: async (j) => void saved.push(j.step),
  }
  const job = await runUntil(newJob({ id: "a1b2c3d4-0000-4000-8000-000000000001", creatorId: "c1", ownerUserId: "u1", installId: "a1b2c3d4-1111", prompt: fit.prompt }), deps)
  const st = memory.state()
  const homeBody = (st.pages.home ?? []).filter((s) => s.type !== "header" && s.type !== "footer")
  const planned = fit.answer.pages[0].sections.map((s) => s.type)
  check("the job completes", job.status === "complete" || job.status === "partial", { status: job.status, error: job.error, findings: job.state.findings })
  check("  one native call, no classic plan call", jobLog.native.length === 1 && !jobLog.other.some((c) => c.kind === "plan"))
  check("  the plan carries the native site; the record has versions and counts", isNativePlan(job.plan) && job.state.native?.promptVersion === "native-r56" && job.state.native.sections === 8 && !job.state.native.fallback)
  check("  home holds exactly the generated sections, in order, between header and footer", homeBody.map((s) => s.type).join() === planned.join() && st.pages.home[0].type === "header" && st.pages.home[st.pages.home.length - 1].type === "footer", homeBody.map((s) => s.type))
  const heroS = homeBody[0]
  check("  the generated words are on the sections (not the preset's demo copy)", heroS.settings.heading === "Get strong without guessing" && homeBody.find((s) => s.type === "faq_accordion")?.blocks?.map((b) => b.settings.question).join("|") === "Do I need any experience?|What should I bring?|Can I pause a block?")
  check("  blocks replaced with stable ids from the placed section", homeBody.find((s) => s.type === "features_cards")!.blocks!.every((b, i) => b.id === `card-${homeBody.find((s) => s.type === "features_cards")!.id}-n${i}`))
  check("  a responsive value placed as the editor stores it", JSON.stringify(homeBody.find((s) => s.type === "features_cards")!.settings.columns) === JSON.stringify({ desktop: 3, mobile: 1 }))
  check("  the product binding is the store's product", homeBody.find((s) => s.type === "hero_product")?.settings.button_url === "/products/eight-week-strength")
  check("  the theme tokens: preset, palette into the schemes, fonts, settings", st.settings.font_heading === "Oswald" && st.settings.font_body === "Inter" && st.settings.button_shape === "square" && JSON.stringify(st.settings.color_schemes ?? {}).includes("#0e1116"))
  check("  the design brain's tokens applied through tokensToThemeSettings (motion tier, section rhythm, custom tokens), the site's own choices over them", typeof st.settings.motion_tier === "string" && typeof st.settings.ai_section_y === "number" && typeof st.settings.custom_tokens === "object" && st.settings.font_heading === "Oswald" && st.settings.button_shape === "square" && st.settings.background_color === "#0e1116", { tier: st.settings.motion_tier, y: st.settings.ai_section_y, bg: st.settings.background_color })
  check("  the recipe is recorded on the job (read back as avoidRecipes next time)", typeof job.state.native?.recipeId === "string" && job.state.native.recipeId.length > 0)
  const seen: { avoid?: string[] }[] = []
  await runUntil(newJob({ id: "a1b2c3d4-0000-4000-8000-000000000009", creatorId: "c1", ownerUserId: "u1", installId: "a1b2c3d4-9999", prompt: fit.prompt }), { ...deps, site: memorySite(startingSite()), models: modelsOf(scripted([fit.answer], { native: [], other: [] })), native: { ...deps.native, recentRecipes: async () => [job.state.native!.recipeId!], brain: (b, o) => { seen.push({ avoid: o.avoidRecipes }); return designBrainFor(b, o) } } })
  check("  the creator's recent recipes are passed to the brain as avoidRecipes", seen.length === 2 && seen.every((x) => x.avoid?.[0] === job.state.native!.recipeId), seen)
  check("  the other page was made with the frame", (st.pages.book ?? []).map((s) => s.type).join() === "header,contact,footer")
  check("  the write step wrote nothing the native site already wrote (no writer calls)", jobLog.other.filter((c) => c.kind === "write").length === 0, jobLog.other.map((c) => c.kind))
  check("  the photo step filled the briefed slots with the brief's words", searches.includes("coach spotting barbell squat") && typeof heroS.settings.image === "string" && (heroS.settings.image as string).startsWith("https://storelib.com/media/"))
  check("  every operation logged for the editor's replay, in order", job.state.ops.length > 20 && job.state.ops.every((o, i) => o.seq === i + 1) && job.state.ops.some((o) => o.op.kind === "add_block" && o.op.blockId.includes("-n0")))
  check("  saved after each step, as today", saved.includes("build") && saved.includes("done"))

  const classicLog = { native: [] as ProviderRequest[], other: [] as CallLog[] }
  const classicSite = memorySite(startingSite())
  const classic = await runUntil(newJob({ id: "a1b2c3d4-0000-4000-8000-000000000002", creatorId: "c1", ownerUserId: "u1", installId: "a1b2c3d4-2222", prompt: "Pottery studio in Porto" }), { ...deps, native: undefined, site: classicSite, models: modelsOf(scripted([fit.answer], classicLog)), capabilities: async () => fit.caps })
  check("without the native deps (AI_NATIVE_ENGINE off): the classic planner, unchanged", classicLog.native.length === 0 && classicLog.other.some((c) => c.kind === "plan") && !isNativePlan(classic.plan) && classic.state.native === undefined)
  const fbLog = { native: [] as ProviderRequest[], other: [] as CallLog[] }
  const fbSite = memorySite(startingSite())
  const fb = await runUntil(newJob({ id: "a1b2c3d4-0000-4000-8000-000000000003", creatorId: "c1", ownerUserId: "u1", installId: "a1b2c3d4-3333", prompt: "Pottery studio in Porto" }), { ...deps, site: fbSite, models: modelsOf(scripted([new Error("overloaded")], fbLog, { plan: ceramicsPlan() })) })
  check("the native call failing: the classic planner plans, and the job says why", fbLog.native.length === 3 && fbLog.other.some((c) => c.kind === "plan") && !isNativePlan(fb.plan) && /overloaded/.test(fb.state.native?.fallback ?? "") && (fb.status === "complete" || fb.status === "partial"), { native: fbLog.native.length, fallback: fb.state.native })

  /* ── 6 ─────────────────────────────────────────────────────────────── */
  section("6. Six businesses: different strategies and tokens")
  const results: { id: string; types: string; tokens: string; scheme: string }[] = []
  for (const [i, s] of SCENARIOS.entries()) {
    const sl = { native: [] as ProviderRequest[], other: [] as CallLog[] }
    const ms = memorySite(startingSite())
    const done6 = await runUntil(newJob({ id: `a1b2c3d4-0000-4000-8000-00000000010${i}`, creatorId: "c1", ownerUserId: "u1", installId: `a1b2c3d4-6${i}`, prompt: s.prompt }), { ...deps, site: ms, models: modelsOf(scripted([s.answer], sl)), capabilities: async () => s.caps })
    const body = ms.state().pages.home.filter((x) => x.type !== "header" && x.type !== "footer")
    const set = ms.state().settings
    results.push({ id: s.id, types: body.map((x) => x.type).join(), tokens: [set.font_heading, set.font_body, set.button_shape, JSON.stringify(set.color_schemes ?? {}).slice(0, 400)].join("|"), scheme: String(set.default_color_scheme ?? "") })
    const brainOf = designBrainFor(briefFrom(s.prompt, null, null))
    check(`${s.id}: placed (${body.length} home sections), every section native and filled; brain ${brainOf.hints.recipeId}`, (done6.status === "complete" || done6.status === "partial") && body.length >= 6 && done6.state.filled.length >= body.length && sl.other.filter((c) => c.kind === "write").length === 0, { status: done6.status, error: done6.error, types: body.map((x) => x.type), writes: sl.other.filter((c) => c.kind === "write").length })
  }
  const distinct = (k: "types" | "tokens") => new Set(results.map((x) => x[k])).size === results.length
  check("six different home section strategies", distinct("types"), results.map((x) => x.types))
  check("six different token sets", distinct("tokens"), results.map((x) => x.tokens.slice(0, 80)))
  const strategies = SCENARIOS.map((s) => designBrainFor(briefFrom(s.prompt, null, null)).hints.sectionStrategy.home.map((x) => x.patternId).join(">"))
  check("  the brain gives the scenarios their own section strategies", new Set(strategies).size >= 4, strategies)

  /* ── 7 ─────────────────────────────────────────────────────────────── */
  section("7. Through the real routes: saved, edited, rendered, tenant-safe")
  const { aiWorld, seller, installPages, installSettings } = await import("./ai-builder-e2e-kit")
  const w = await aiWorld()
  const coach = await seller(w, "ironnorth")
  const stranger = await seller(w, "othergym", { title: "Not theirs", priceCents: 5_000 })
  const made = await w.j.call("POST /api/website-builder/themes/create", { as: coach.person, body: { mode: "ai", prompt: fit.prompt, key: "2b7c1e2a-0000-4000-8000-000000000201", options: { generation: "theme", category: "fitness_coach" } } })
  const installId = String(made.json?.install?.id)
  const jobId = String(made.json?.job?.id)
  check("Create (AI_BUILDER_AGENT=0): a website and a classic job", made.status === 200 && !!made.json?.install?.id && !!made.json?.job?.id && w.j.rows("ai_site_jobs").find((r) => r.id === jobId)?.engine !== "agent", made.json)
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const admin = createAdminClient() as never
  const { loadJob, saveJob, siteIO } = await import("@/lib/website-builder/ai-site/server")
  const { readCapabilities } = await import("@/lib/website-builder/ai-site/capabilities")
  const { readStoreFacts } = await import("@/lib/website-builder/agent/store-facts-server")
  const caps = await readCapabilities(admin, { creatorId: coach.creatorId, ownerUserId: coach.person.id }, readStoreFacts)
  const realProduct = (caps.facts?.products ?? []).find((p) => p.published && p.url)
  /* The answer, with the real product's address from STORE FACTS (as a model reads it), and one of the stranger's. */
  const journeyAnswer = (req: ProviderRequest) => {
    const a = clone(fit.answer) as ReturnType<typeof site>
    const text = String((req.turns[0] as { content: string }).content)
    const url = realProduct?.url && text.includes(realProduct.url) ? realProduct.url : "/products/none"
    a.pages[0].sections = a.pages[0].sections.map((s) => (s.type === "hero_product" ? { ...s, settings: s.settings.map((x) => (x.id === "button_url" ? { id: "button_url", value: url } : x)) } : s))
    return a
  }
  const jl = { native: [] as ProviderRequest[], other: [] as CallLog[] }
  const loaded = await loadJob(admin, jobId)
  const ran = await runUntil(loaded!, {
    models: modelsOf(scripted([journeyAnswer], jl)),
    site: siteIO(admin, installId, coach.creatorId),
    capabilities: async () => caps,
    images: { search: fakeOpenverse([]), copy: async (u) => ({ ok: true as const, url: `https://storelib.com/media/${encodeURIComponent(u).slice(-30)}` }) },
    schemas: SECTION_SCHEMAS,
    addable,
    native: { images: async () => [], forms: async () => [] },
    save: (j) => saveJob(admin, j),
  })
  const row = w.j.rows("ai_site_jobs").find((r) => r.id === jobId)
  check("the job ran on the real store and saved its row", (ran.status === "complete" || ran.status === "partial") && row?.step === "done" && !!row?.plan?.native && row?.state?.native?.promptVersion === "native-r2.1", { status: ran.status, error: ran.error, step: row?.step })
  const pages = installPages(w, installId)
  const draftHome = (pages.home?.draft ?? []) as { id: string; type: string; settings: Record<string, unknown>; blocks?: { settings: Record<string, unknown> }[] }[]
  check("  drafts only: the live sections are untouched", draftHome.some((s) => s.type === "hero_media") && !(pages.home?.sections ?? []).some((s: { type: string }) => s.type === "hero_media"))
  check("  draft theme settings carry the tokens", installSettings(w, installId).draft?.font_heading === "Oswald")
  check("  the product binding is this creator's real product", !!realProduct && draftHome.find((s) => s.type === "hero_product")?.settings.button_url === realProduct.url, { real: realProduct?.url, set: draftHome.find((s) => s.type === "hero_product")?.settings.button_url })
  const got = await w.j.call(`GET /api/website-builder/themes/${installId}/sections?page=home`, { as: coach.person })
  const sections = (got.json?.sections ?? []) as typeof draftHome
  check("the editor's sections route reads the generated page", got.status === 200 && sections.map((s) => s.type).join() === draftHome.map((s) => s.type).join(), got.status)
  const edited = sections.map((s) => (s.type === "hero_media" ? { ...s, settings: { ...s.settings, heading: "Strong for the long run" } } : s))
  const put = await w.j.call(`PUT /api/website-builder/themes/${installId}/sections`, { as: coach.person, body: { page_key: "home", sections: edited, mode: "draft" } })
  const reread = await w.j.call(`GET /api/website-builder/themes/${installId}/sections?page=home`, { as: coach.person })
  const heroAfter = (reread.json?.sections ?? []).find((s: { type: string }) => s.type === "hero_media")
  check("  edited through the editor's save route and read back", put.status === 200 && heroAfter?.settings?.heading === "Strong for the long run" && (reread.json?.sections ?? []).length === sections.length, { put: put.status, heading: heroAfter?.settings?.heading })
  const theirs = await w.j.call(`GET /api/website-builder/themes/${installId}/sections?page=home`, { as: stranger.person })
  const theirPut = await w.j.call(`PUT /api/website-builder/themes/${installId}/sections`, { as: stranger.person, body: { page_key: "home", sections: [], mode: "draft" } })
  check("  another creator can neither read nor save this website's sections", theirs.status >= 400 && theirPut.status >= 400 && (installPages(w, installId).home?.draft ?? []).length === edited.length, { get: theirs.status, put: theirPut.status })
  const { coverPage } = await import("@/app/(site)/w/[username]/render-site")
  const { renderToStaticMarkup } = await import("react-dom/server")
  let html = ""
  try {
    html = renderToStaticMarkup(await coverPage(installId))
  } catch (e) {
    html = `render failed: ${e instanceof Error ? e.stack : String(e)}`
  }
  check("the native renderer draws the saved draft: the edited heading and the generated words", html.includes("Strong for the long run") && html.includes("Do I need any experience?") && html.includes("Three sessions, one plan") && !html.startsWith("render failed"), html.slice(0, 800))
  check("  no script from the model reaches the page", !/<script[^>]*>\s*alert/i.test(html))

  done()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
