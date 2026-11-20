/**
 * ===========================================================================
 *  THE ONEPAGE'S DATA, TO EVERY PLACE THE CREATOR EXPECTS IT (audit, pass two)
 * ===========================================================================
 * tests/onepage-integrations.test.ts holds the first pass. This one holds
 * what the second found, each through the code the live page runs:
 *
 *   OPT-IN    a native form's "Send me occasional updates" (lib/forms,
 *             placed on a OnePage as a Form or a booking block) puts the
 *             person on the list, runs the welcome, asks the email
 *             platforms to sync and, on a OnePage, reaches the page's own
 *             tools by the response's id. It used to be kept on the response
 *             and reach none of them.
 *   LEAD      a native form or booking sent tells the pixels a Lead by that
 *             same id; it told them nothing.
 *   FRAMES    Meta, TikTok, Pinterest, Clarity, Tag Manager, Klaviyo and
 *             Omnisend stay quiet in a frame, as Google's tag always has.
 *
 * Run: npm run test:push (registered in scripts/run-push-tests.mjs)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { keepFormOptIn, optInConsentText, subscriberSourceWord, type OptInDeps } from "@/lib/forms/opt-in-server"
import { pageSignup } from "@/lib/onepage/integrations/deliver-server"
import { pixelLead } from "@/lib/analytics/pixels"
import { TOP_WINDOW_ONLY, trackingTags } from "@/lib/store/tracking"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** subscribers, in memory: the one row a creator has for an address, and every write made to it. */
function fakeDb(existing: { id: string; status: string } | null, insertError: { code: string; message?: string } | null = null) {
  const writes: { op: string; row: Record<string, unknown>; where?: Record<string, unknown> }[] = []
  const db = {
    from: (table: string) => {
      if (table !== "subscribers") throw new Error(`unexpected table ${table}`)
      const where: Record<string, unknown> = {}
      const chain = {
        select: () => chain,
        eq: (k: string, v: unknown) => ((where[k] = v), chain),
        maybeSingle: async () => ({ data: existing, error: null }),
        insert: async (row: Record<string, unknown>) => {
          writes.push({ op: "insert", row })
          const e = insertError
          insertError = null
          return { error: e }
        },
        update: (row: Record<string, unknown>) => {
          const w: Record<string, unknown> = {}
          const u = {
            eq: (k: string, v: unknown) => ((w[k] = v), u),
            then: (r: (v: unknown) => unknown) => (writes.push({ op: "update", row, where: w }), Promise.resolve({ error: null }).then(r)),
          }
          return u
        },
      }
      return chain
    },
  }
  return { db, writes }
}

function spyDeps() {
  const calls: { step: string; args: unknown[] }[] = []
  const deps: OptInDeps = {
    recordSource: async (...a) => void calls.push({ step: "source", args: a.slice(1) }),
    welcome: async (...a) => void calls.push({ step: "welcome", args: a.slice(1) }),
    syncPlatforms: async (...a) => void calls.push({ step: "sync", args: a.slice(1) }),
    deliverToPage: async (...a) => void calls.push({ step: "page", args: a.slice(1) }),
  }
  return { deps, calls, steps: () => calls.map((c) => c.step) }
}

/** A window and document just big enough for a tag's own snippet, in the top window or in a frame. */
function fakePage(framed: boolean) {
  const inserted: string[] = []
  const first = { parentNode: { insertBefore: (el: { src: string }) => void inserted.push(el.src) } }
  const document = { cookie: "", createElement: () => ({ src: "", async: false }), getElementsByTagName: () => [first] }
  const win: Record<string, unknown> = { addEventListener: () => {} }
  win.self = win
  win.top = framed ? { other: true } : win
  const run = (code: string) => {
    const intl = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: "America/New_York" }) }) }
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function("window", "document", "Intl", `with (window) { ${code} }`)(win, document, intl)
  }
  return { win, inserted, run }
}

const TOKEN = "3f2b8c1e-5d4a-4e7b-9c0d-1a2b3c4d5e6f"
const base = { ownerId: "c1", formId: "f1", formTitle: "Get the free guide", email: "Ana@Example.com", name: "Ana", surface: "onepage" as const, pageUrl: "https://storelib.me/ana", eventId: TOKEN, source: { surface: "onepage" } }

async function main() {
  section("Opt-in: a native form's ticked box puts the person on the list and reaches the creator's tools")
  {
    const { db, writes } = fakeDb(null)
    const spy = spyDeps()
    const out = await keepFormOptIn(db, base, spy.deps, new Date("2026-11-20T10:00:00Z"))
    const row = writes[0]?.row ?? {}
    check("a new address joins the list, subscribed, from the OnePage", out === "joined" && writes.length === 1 && writes[0].op === "insert" && row.status === "subscribed" && row.is_active === true && row.source === "onepage" && row.creator_id === "c1" && row.email === "ana@example.com", writes)
    check("  with what they agreed to, and when", row.consent_text === 'Ticked "Send me occasional updates" on the form Get the free guide' && row.consent_timestamp === "2026-11-20T10:00:00.000Z" && typeof row.unsubscribe_token === "string", row)
    check("  where they joined from, the welcome flow, then the email platforms (Klaviyo, Omnisend... within the minute)", JSON.stringify(spy.steps()) === JSON.stringify(["source", "welcome", "sync", "page"]), spy.steps())
    const page = spy.calls.find((c) => c.step === "page")?.args[1] as Record<string, unknown> | undefined
    check("  the page's own tools get it as form \"form\", by the response's id", page?.form === "form" && page?.email === "ana@example.com" && page?.eventId === TOKEN && page?.detail === "Get the free guide" && page?.pageUrl === "https://storelib.me/ana", page)
    const shaped = pageSignup(page as never)
    check("  that id survives pageSignup, so the server's Lead is the pixels' Lead", shaped.eventId === TOKEN && shaped.form === "form", shaped)

    const again = fakeDb({ id: "s1", status: "subscribed" })
    const s2 = spyDeps()
    check("already on the list: nothing rewritten, no second welcome, the page's tools still told (their own claim keeps one delivery)", (await keepFormOptIn(again.db, base, s2.deps)) === "already" && again.writes.length === 0 && JSON.stringify(s2.steps()) === JSON.stringify(["page"]), s2.steps())

    for (const status of ["unsubscribed", "customer", "wrote"]) {
      const back = fakeDb({ id: "s1", status })
      const s3 = spyDeps()
      const r = await keepFormOptIn(back.db, base, s3.deps)
      const w = back.writes[0]
      check(`a ${status} address that ticks the box is back on the list, the welcome with it`, r === "joined" && w?.op === "update" && w.row.status === "subscribed" && w.row.unsubscribed_at === null && w.where?.id === "s1" && w.where?.status === status && s3.steps().includes("welcome"), back.writes)
    }
    for (const status of ["bounced", "complained", "cleaned"]) {
      const stays = fakeDb({ id: "s1", status })
      const s4 = spyDeps()
      check(`a ${status} address stays as it is, and is sent nowhere`, (await keepFormOptIn(stays.db, base, s4.deps)) === "stays" && stays.writes.length === 0 && s4.calls.length === 0)
    }

    const site = fakeDb(null)
    const s5 = spyDeps()
    await keepFormOptIn(site.db, { ...base, surface: "website" }, s5.deps)
    check("on a website: on the list and synced, never to a OnePage's tools", site.writes[0]?.row.source === "website_builder_newsletter" && !s5.steps().includes("page") && s5.steps().includes("sync"), s5.steps())

    const old = fakeDb(null, { code: "23514", message: 'new row violates check constraint "subscribers_source_check"' })
    await keepFormOptIn(old.db, base, spyDeps().deps)
    check("an old CHECK on source: kept with the word every website sign up uses", old.writes.length === 2 && old.writes[1].row.source === "website_builder_newsletter", old.writes)

    const broken = spyDeps()
    broken.deps.welcome = async () => {
      throw new Error("mail down")
    }
    check("a step that fails does not stop the rest, and nothing throws", (await keepFormOptIn(fakeDb(null).db, base, broken.deps)) === "joined" && broken.steps().includes("sync") && broken.steps().includes("page"))
    check("no address, nothing", (await keepFormOptIn(fakeDb(null).db, { ...base, email: "" }, spyDeps().deps)) === "failed")
    check("words: the consent names the form; the source word per surface", optInConsentText("") === 'Ticked "Send me occasional updates" on a form' && subscriberSourceWord("creator_page") === "creator_page" && subscriberSourceWord("form") === "form")

    const route = read("app/api/forms/[id]/submit/route.ts")
    check("the submit route keeps a ticked box after the reply, from a response that is new, with an address", /const optIn = row\.consent\.marketing && valid\.email/.test(route) && /if \(optIn\) after\(\(\) => keepFormOptIn\(db, optIn\)/.test(route) && route.indexOf("const optIn") > route.indexOf("if (leadId && !duplicate) {"))
    check("  the response's own token as the id, the surface the page named, the page's address", /eventId: token,/.test(route) && /surface: source as FormSurface,/.test(route) && /pageUrl: sourceUrl,/.test(route))
    check("  where they joined from is read from the request before the reply", /source: contactSourceFrom\(\{ request, surface: source === "onepage" \? "onepage"/.test(route))
    check("  only a form that offers the opt-in can tick it (unchanged)", /marketing: definition\.marketing_opt_in && body\.marketing === true/.test(route))
    check("a OnePage's form block and booking block send as the OnePage", /source = "onepage",/.test(read("components/forms/native-form-block.tsx")) && /source = "onepage",/.test(read("components/forms/action-frame.tsx")))
  }

  section("Lead: a native form or booking sent tells the pixels, by the response's id")
  {
    const form = read("components/forms/public-form.tsx")
    const sent = form.indexOf('if (!r.ok) throw new Error(b.error || "Your answers were not saved. Try again.")')
    const told = form.indexOf('pixelLead(window, { form: d.booking ? "booking" : "form", eventId: key.current })')
    check("after the server kept it, never before, never in the editor's preview (which returns earlier)", sent > 0 && told > sent && form.indexOf("if (preview) {") < sent)
    const calls: unknown[][] = []
    const win = { fbq: (...a: unknown[]) => calls.push(["fbq", ...a]), ttq: { track: (...a: unknown[]) => calls.push(["ttq", ...a]) }, gtag: (...a: unknown[]) => calls.push(["gtag", ...a]) } as unknown as Window
    pixelLead(win, { form: "booking", eventId: TOKEN })
    check("a booking: GA4 generate_lead, Meta Lead and TikTok SubmitForm, all by the submission id", JSON.stringify(calls) === JSON.stringify([["gtag", "event", "generate_lead", { lead_source: "booking", event_id: TOKEN }], ["fbq", "track", "Lead", { content_name: "booking" }, { eventID: TOKEN }], ["ttq", "SubmitForm", { content_name: "booking" }, { event_id: TOKEN }]]), calls)
  }

  section("Frames: every tag stays quiet in a frame, as Google's always has")
  {
    const tags = trackingTags(
      { meta_pixel: "1234567890123456", tiktok_pixel: "C4A1B2C3D4E5F6G7H8I9", pinterest_tag: "2612345678901", clarity: "k3x9q2w7ab", gtm: "GTM-ABC1234", klaviyo: "AbC123", omnisend: "5f8a1b2c3d4e5f6a7b8c9d0e" },
      { asks: false, creatorId: "0b6a1c1e-2f3d-4e5a-8b9c-0d1e2f3a4b5c" },
    )
    for (const key of ["meta", "tiktok", "pinterest", "clarity", "gtm", "klaviyo", "omnisend"]) {
      const code = tags.find((t) => t.key === key)?.inline ?? ""
      const framed = fakePage(true)
      framed.run(code)
      const top = fakePage(false)
      top.run(code)
      check(`${key}: nothing loads in a frame, its own script loads in the top window`, code.includes(TOP_WINDOW_ONLY) && framed.inserted.length === 0 && top.inserted.length === 1, { framed: framed.inserted, top: top.inserted })
    }
    const meta = fakePage(true)
    meta.run(tags.find((t) => t.key === "meta")?.inline ?? "")
    check("  Meta in a frame: no fbq, so no PageView", meta.win.fbq === undefined)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
