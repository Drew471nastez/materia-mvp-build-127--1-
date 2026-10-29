/**
 * ===========================================================================
 *  ROUND 27 (J27): THE SETUP PILL AND THE BOTTOM BARS, THE CREATE WIZARD,
 *  A COMMUNITY'S ANALYTICS
 * ===========================================================================
 *   PILL       one rule across /app: every bottom action bar carries
 *              data-app-foot, and while one is up and drawn both setup pills
 *              step aside (lib/ui/foot-bars.ts). The source is read for
 *              every fixed or sticky element at the bottom of an /app page,
 *              so a new bar without the attribute fails here.
 *   WIZARD     name, look, access, review and Create, then the welcome post
 *              in the feed's own composer, pinned; one column, no preview
 *              beside it; a reload after Create comes back to the welcome
 *   ANALYTICS  the sections as tabs on a hairline with one sliding line,
 *              32px under the overview and 20px over their panel
 * The geometry is measured in Chromium by scripts/check-j27.mjs.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { MADE_KEEP_MS, WIZARD_STEPS, checkWizard, checkWizardStep, emptyDraft, firstProblem, readDraft } from "../lib/communities/create-wizard"
import { FOOT_ATTR, footBarUp } from "../lib/ui/foot-bars"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(p, "utf8")
/** Source without comments, so a check reads code and not the notes about it. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"

console.log("The wizard's steps")
{
  check("name, look, access, review, then the welcome post", WIZARD_STEPS.join() === "name,look,access,review,welcome")
  const d = emptyDraft()
  check("a new draft has made nothing", d.made === null && !("spaceName" in d) && !("welcomeTitle" in d))
  check("the welcome step asks nothing of the draft", checkWizardStep("welcome", d).ok)
  check("Create checks the four steps before it, never the welcome", firstProblem({ ...d, name: "Makers" }) === null && firstProblem(d)?.step === 0)
  const now = Date.parse("2026-10-17T12:00:00Z")
  const made = { id: ID, slug: "makers", at: now - 60_000 }
  const back = readDraft(JSON.stringify({ ...d, name: "Makers", step: 1, made }), now)
  check("a reload after Create comes back on the welcome step of that community", back?.made?.id === ID && back?.made?.slug === "makers" && back?.step === WIZARD_STEPS.indexOf("welcome"), back)
  const stale = readDraft(JSON.stringify({ ...d, name: "Makers", step: 4, made: { ...made, at: now - MADE_KEEP_MS - 1 } }), now)
  check("an hour later it is let go: no community, and never the welcome step without one", stale?.made === null && stale?.step === 0, stale)
  const odd = readDraft(JSON.stringify({ ...d, name: "Makers", made: { id: "not-an-id", slug: "x", at: now } }), now)
  check("a made community that is not one is ignored", odd?.made === null)
  check("a step saved before round 27 is read in range", readDraft(JSON.stringify({ ...d, name: "Makers", step: 3 }), now)?.step === 3)
  const sent = checkWizard({ name: "Makers", type: "free" })
  check("the server reads a Create without welcome fields as the plain create", sent.ok && sent.value.welcome === null && sent.value.spaceName === null)
}

console.log("\nThe wizard's page")
{
  const flow = code("components/community/creator/create-flow.tsx")
  check("one column, 680px at most, with no preview card beside the step", /max-w-\[680px\]/.test(flow) && !/340px/.test(flow) && !/<aside/.test(flow))
  check("the cover is as wide as the card at 3 to 1, a press or a drop to change", /data-wizard-cover=""/.test(flow) && /aspect-\[3\/1\] w-full/.test(flow) && /onDrop/.test(flow) && /usePictureUpload\(\{ maxEdge: 2000/.test(flow))
  check("the logo over the cover's edge, its own upload", /data-wizard-logo=""/.test(flow) && /-mt-10/.test(flow) && /usePictureUpload\(\{ maxEdge: 800/.test(flow))
  check("PicturePick's squeezed row is no longer used here", !/PicturePick/.test(flow))
  check("Create sends no welcome post or space name", !/welcomeTitle|welcomeBody|spaceName/.test(flow))
  check("the welcome step is the feed's composer, loaded on that step only", /import\("@\/components\/community\/member\/composer"\)/.test(flow) && !/^import[^\n]*member\/composer"/m.test(flow) && /<Composer communityId=\{made\.id\}/.test(flow))
  check("  opened on the welcome written for them (the composer's `initial`), in Announcements, no kept draft seeded", /initial=\{ready\.initial\}/.test(flow) && /initial: \{ \.\.\.welcomeFor\(name\), spaceId: room\.id \}/.test(flow) && /kind === "announcements"/.test(flow) && !/localStorage\.setItem\(key/.test(flow))
  check("  the community's spaces read from the server", /\/api\/app\/community\/\$\{encodeURIComponent\(made\.id\)\}\/spaces/.test(flow))
  check("  outside the form, so its Enter never presses Next", flow.indexOf("<WelcomeWriter") < flow.indexOf("<form"))
  check("posted, it is pinned and the Overview opens", /action: "pin", targetType: "post", targetId: post\.id/.test(flow) && /* Changed on purpose (round 41): the community takes the wizard's own entry (./list-return). */ /router\.replace\(`\/app\/community\/\$\{made\.slug\}\?created=1`\)/.test(flow))
  check("Skip lets the welcome draft go and opens the Overview", /data-wizard-skip/.test(flow) && /removeItem\(m\.draftKey\(made\.id\)\)/.test(flow))
  check("no going back once it is made", /if \(made\) return/.test(flow))
  check("the foot bar carries the pill rule", /data-create-foot="" data-app-foot="up"/.test(flow))
  const page = code("app/app/community/new/page.tsx")
  check("the page hands the person signed in to the composer", /peopleOf\(admin\(\), \[user\.id\]\)/.test(page) && /me=\{\{ userId: user\.id/.test(page))
}

console.log("\nThe setup pill and the bottom bars")
{
  const el = (rects: number, value = "up") => ({ value, getClientRects: () => ({ length: rects }) })
  const rootOf = (els: ReturnType<typeof el>[]) => ({ querySelectorAll: (sel: string) => els.filter((e) => sel === `[${FOOT_ATTR}="up"]` && e.value === "up") }) as unknown as ParentNode
  check("a bar that is up and drawn: the pills step aside", footBarUp(rootOf([el(1)])))
  check("a bar waiting down: they stay", !footBarUp(rootOf([el(1, "down")])))
  check("a bar this width hides (no box): they stay", !footBarUp(rootOf([el(0)])))
  check("no bar: they stay", !footBarUp(rootOf([])))

  const side = code("components/app/sidebar.tsx")
  check("the store's pill steps aside while a bar is up", /const footUp = useFootBarUp\(\)/.test(side) && /footUp && STEP_ASIDE/.test(side))
  check("and so does a community's", /<CommunitySetupPill[^>]*away=\{footUp\}/.test(side))
  const pill = code("components/community/creator/setup-pill.tsx")
  check("a community's pill fades, takes no presses and closes its list", /away && STEP_ASIDE/.test(pill) && /if \(away\) setOpen\(false\)/.test(pill))

  /*
    EVERY BOTTOM BAR IN /APP CARRIES THE ATTRIBUTE. Each opening tag in these folders with fixed or sticky and a bottom-
    class is a bar unless it says it is something else: a toast (aria-live), a phone's alone (md:hidden, sm:static,
    lg:static, a phone branch), a foot inside a side panel, a whole screen or dialog, or the pills themselves.
  */
  const roots = ["app/app", "components/app", "components/community/creator", "components/memberships", "components/files", "components/email"]
  const files: string[] = []
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith(".tsx")) files.push(p)
    }
  }
  roots.forEach(walk)
  const NOT_BARS = /aria-live|md:hidden|sm:static|lg:static|data-panel-foot|role="dialog"|data-setup-pill|data-community-setup|data-app-slow-page|data-format-bar/
  /* For E27 (components/community/creator/page-editor/**): its bar below 1024px; until it carries data-app-foot, said here. */
  const PENDING = ["components/community/creator/page-editor/page-editor.tsx"]
  const bars: { at: string; ok: boolean }[] = []
  const pending: string[] = []
  for (const f of files) {
    const s = read(f)
    for (const m of s.matchAll(/<(div|footer|nav|section|aside)\b/g)) {
      let i = (m.index ?? 0) + m[0].length
      let depth = 0
      for (; i < s.length; i++) {
        const c = s[i]
        if (c === "{") depth++
        else if (c === "}") depth--
        else if (c === ">" && depth === 0) break
      }
      const tag = s.slice(m.index, i)
      if (!/\b(fixed|sticky)\b/.test(tag) || !/\bbottom-/.test(tag) || NOT_BARS.test(tag)) continue
      const at = `${f}:${s.slice(0, m.index).split("\n").length}`
      if (tag.includes("data-app-foot")) bars.push({ at, ok: true })
      else if (PENDING.includes(f)) pending.push(at)
      else bars.push({ at, ok: false })
    }
  }
  check("the bars found: New community, coupons, products, a flow, Settings, a community's save and bulk bars, Files, Memberships", bars.length >= 9, bars.map((b) => b.at))
  check("every one of them carries data-app-foot", bars.every((b) => b.ok), bars.filter((b) => !b.ok))
  if (pending.length) console.log(`        (for E27: ${pending.join(", ")} has a bottom bar without data-app-foot)`)
  check("a bar that comes and goes says which it is", /data-app-foot=\{up \? "up" : "down"\}/.test(code("components/community/creator/parts.tsx")) && /data-app-foot=\{barUp \? "up" : "down"\}/.test(code("components/app/settings-form-new.tsx")) && /data-app-foot=\{dirty \? "up" : "down"\}/.test(code("app/app/emails/flow/[id]/builder.tsx")))
}

console.log("\nA community's analytics")
{
  const a = code("components/community/creator/analytics-section.tsx")
  /* Changed on purpose (round 37): the owner asked for the chart and its switchers only, so the sections' row of tabs on a hairline is gone. What stands in its place is /app Analytics' figure strip over the one chart, and one details card under it. */
  check("no sections' row any more", !/function SectionTabs|data-analytics-sections/.test(a))
  check("the figure tabs are /app Analytics' MetricTab in the strip that scrolls sideways on a phone", /<MetricTab/.test(a) && /useTabStrip<HTMLDivElement>/.test(a) && /overflow-x-auto scrollbar-hide/.test(a))
  check("each figure an equal share of the row, never under 124px", /const STRIP_TAB = "min-w-\[124px\] flex-1 basis-0 shrink-0"/.test(a))
  check("16px between the period, the chart card and the details", (a.match(/cn\("mt-4", dim\)/g) ?? []).length === 2)
}

console.log("\nCopy")
{
  for (const f of ["components/community/creator/create-flow.tsx", "components/community/creator/analytics-section.tsx", "lib/ui/foot-bars.ts", "lib/communities/create-wizard.ts", "app/app/community/new/page.tsx", "components/community/creator/setup-pill.tsx", "scripts/check-j27.mjs", "scripts/render-j27.tsx"]) {
    const t = read(f)
    check(`${f}: no em dash, no banned word`, !t.includes("—") && !/\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform)\b/i.test(t))
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
