/**
 * ===========================================================================
 *  ROUND M, M1: REDESIGN WITH AI ON AN EXISTING WEBSITE, ITS UNDO, AND WHO
 *  GETS THE AGENT
 * ===========================================================================
 * Through the REAL routes (tests/_journey, the in memory PostgREST built from
 * the SQL files) with a SCRIPTED model (tests/ai-builder-e2e-kit.ts):
 *
 *   1. The per account switch. AI_BUILDER_AGENT_ACCOUNTS lists accounts by
 *      username or user id; each entry point (Start with AI's engine, Edit
 *      with AI, Redesign with AI, the editor's GET) answers on for a listed
 *      account and off for another, and AI_BUILDER_AGENT=1 still turns it on
 *      for everyone. Emails are not accepted.
 *   2. Redesign with AI: owner only, a key, a backup FIRST (the Backups
 *      mechanism) recorded on the job, one live job per website, the same
 *      press twice is one job and one backup, driven by L2's runner on the
 *      agent engine, content and bindings kept.
 *   3. Undo this AI job: the website exactly as before, INCLUDING the pages
 *      and ai_ files the AI added (removed), while a page and a file the
 *      person made after the backup stay (and are named in the answer); the
 *      undo is itself undoable from Backups; a second undo changes nothing.
 *   4. Backups' own restore removes what an AI job added after a backup too,
 *      and removes what the person made only when they name it.
 *
 * WHAT IS SCRIPTED: the model. Everything else is the real code.
 */
import "./_journey/env"
process.env.CHROMIUM_PATH = "/nonexistent/chromium"
process.env.AI_JOB_SECRET = "journey-ai-job-secret-for-tests-only"
process.env.AI_BUILDER_AGENT = "0" /* round N: on by default; "0" is the off switch the allowlist works under */
delete process.env.AI_BUILDER_AGENT_ACCOUNTS
import { aiWorld, checker, driveTurns, installFiles, installPages, installSettings, jobRow, scriptModels, seller, type Script } from "./ai-builder-e2e-kit"
import { BANNER, KITCHEN } from "./ai-builder-bench-designs"
import { ABOUT } from "./ai-builder-agent-fixtures"
import { agentAccessFrom, agentAllowed } from "@/lib/website-builder/ai-site/agent-access"
import { parseRedesignRequest, redesignState } from "@/lib/website-builder/ai-site/redesign"
import { redesignOf } from "@/lib/ai-builder/agent-step"

const { check, done, section } = checker()

type Snap = { pages: Record<string, unknown>; settings: unknown; files: Record<string, string> }

async function main() {
  section("The switch, pure (lib/website-builder/ai-site/agent-access.ts)")
  const a1 = agentAccessFrom({ AI_BUILDER_AGENT: "0", AI_BUILDER_AGENT_ACCOUNTS: " Andrew , @Drew471, 0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e, someone@example.com, " })
  check("usernames lower case without @, ids, an email ignored and counted", a1.usernames.has("andrew") && a1.usernames.has("drew471") && a1.ids.has("0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e") && a1.ignored === 1 && !a1.everyone, { usernames: [...a1.usernames], ids: [...a1.ids], ignored: a1.ignored })
  check("a listed username, user id or creator id is allowed; anyone else is not", agentAllowed(a1, { ownerUserId: null, creatorId: "c", names: ["ANDREW"] }) && agentAllowed(a1, { ownerUserId: "0F1E2D3C-4B5A-4968-8778-695A4B3C2D1E", creatorId: "c" }) && agentAllowed(a1, { ownerUserId: "u", creatorId: "0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e" }) && !agentAllowed(a1, { ownerUserId: "u", creatorId: "c", names: ["bob", null] }))
  check("AI_BUILDER_AGENT=1 turns it on for everyone; round N: nothing set is on too, and 0 is off", agentAllowed(agentAccessFrom({ AI_BUILDER_AGENT: "1" }), { ownerUserId: "u", creatorId: "c" }) && agentAllowed(agentAccessFrom({}), { ownerUserId: "u", creatorId: "c" }) && !agentAllowed(agentAccessFrom({ AI_BUILDER_AGENT: "0" }), { ownerUserId: "u", creatorId: "c" }) && !agentAllowed(agentAccessFrom({ AI_BUILDER_AGENT: "off" }), { ownerUserId: "u", creatorId: "c" }))
  check("an email can never match, even when listed", !agentAllowed(agentAccessFrom({ AI_BUILDER_AGENT: "0", AI_BUILDER_AGENT_ACCOUNTS: "a@b.co" }), { ownerUserId: "u", creatorId: "c", names: ["a@b.co"] }))
  const req = parseRedesignRequest({ prompt: "  warmer  ", key: "k", scope: "full" })
  check("a redesign request keeps the words exactly; scope changes by default; empty refused", req.ok && req.request.prompt === "  warmer  " && req.request.scope === "full" && (parseRedesignRequest({ prompt: "x" }) as { request: { scope: string } }).request.scope === "changes" && !parseRedesignRequest({ prompt: "  " }).ok && !parseRedesignRequest({ prompt: "x", scope: "all" }).ok)
  check("the job's redesign options read back; anything else is not a redesign", redesignOf({ redesign: { scope: "full", backupId: "0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e" } })?.backupId === "0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e" && redesignOf({ generation: "theme" }) === null && redesignState({ redesign: { scope: "changes", backupId: "nope" } }, null)?.backupId === null)

  const w = await aiWorld()
  const { j } = w
  const listed = await seller(w, "andrew-m1")
  const other = await seller(w, "bob-m1", { title: "Bob's class", priceCents: 2_000 })
  const andrewUser = listed.person.id

  /** A website made without AI, as the editor makes one. */
  const blankSite = async (who: typeof listed, key: string) => {
    void key
    const made = await j.call("POST /api/website-builder/themes/create", { as: who.person, body: { mode: "blank" } })
    if (made.status !== 200) throw new Error(`blank create ${made.status} ${JSON.stringify(made.json)}`)
    return String(made.json.install.id)
  }
  const startAi = (who: typeof listed, key: string) => j.call("POST /api/website-builder/themes/create", { as: who.person, body: { mode: "ai", prompt: "A site for my classes.", key, options: { generation: "theme" } } })
  const engineOf = (jobId: string) => String(jobRow(w, jobId).engine)
  const entryPoints = async (who: typeof listed, installId: string, tag: string) => {
    const made = await startAi(who, `m1-${tag}-0000-4000-8000-000000000001`)
    const engine = made.json?.job?.id ? engineOf(String(made.json.job.id)) : "none"
    /*
      The new website's own job is ended here (it would hold the creator's one live job slot): an agent job through
      Cancel; a classic job cannot be cancelled part way, so its row is marked failed directly (test set up only).
    */
    if (made.json?.job?.id) {
      if (engine === "agent") await j.call(`POST /api/website-builder/ai-jobs/${made.json.job.id}/cancel`, { as: who.person })
      const row = j.db.rows("ai_site_jobs").find((x) => x.id === made.json.job.id)
      if (row && (row.status === "queued" || row.status === "running")) row.status = "failed"
    }
    w.kicks.length = 0
    const edit = await j.call(`POST /api/website-builder/themes/${installId}/ai-edit`, { as: who.person, body: { mode: "edit", path: "sections/ai_nothing.storelib", prompt: "Calmer", expectedVersion: null } })
    const get = await j.call(`GET /api/website-builder/themes/${installId}/redesign`, { as: who.person })
    const post = await j.call(`POST /api/website-builder/themes/${installId}/redesign`, { as: who.person, body: { prompt: "x", key: `m1-${tag}-probe-0000-4000-8000-0000000002` } })
    return { engine, edit: edit.status, agent: get.json?.agent, post: post.status, postCode: post.json?.code }
  }

  section("1. The agent engine for listed accounts only (AI_BUILDER_AGENT_ACCOUNTS)")
  const aSite = await blankSite(listed, "a")
  const bSite = await blankSite(other, "b")
  {
    const off = await entryPoints(listed, aSite, "off")
    check("nothing set: Start with AI is classic, Edit with AI 501, Redesign 501, the editor is told off", off.engine === "classic" && off.edit === 501 && off.agent === false && off.post === 501, off)
  }
  process.env.AI_BUILDER_AGENT_ACCOUNTS = "andrew-m1"
  {
    const on = await entryPoints(listed, aSite, "on")
    /* Edit with AI gets past the switch to the file check (409 no_file); Redesign gets past it to the request (400: the probe has a key but a one letter prompt is fine, so 202 or a refusal other than 501). */
    check("listed by username: Start with AI runs on the agent, Edit with AI and Redesign are not refused as off, the editor is told on", on.engine === "agent" && on.edit !== 501 && on.agent === true && on.post !== 501, on)
    const probe = j.rows("ai_site_jobs").find((r) => r.idempotency_key === "m1-on-probe-0000-4000-8000-0000000002")
    if (probe) {
      await j.call(`POST /api/website-builder/ai-jobs/${probe.id}/cancel`, { as: listed.person })
      const row = j.db.rows("ai_site_jobs").find((x) => x.id === probe.id)
      if (row && (row.status === "queued" || row.status === "running")) row.status = "cancelled"
      w.kicks.length = 0
    }
    const offOther = await entryPoints(other, bSite, "other")
    check("another account, the same moment: classic, 501, 501, told off", offOther.engine === "classic" && offOther.edit === 501 && offOther.agent === false && offOther.post === 501, offOther)
  }
  process.env.AI_BUILDER_AGENT_ACCOUNTS = `${andrewUser}, someone@example.com`
  {
    const byId = await j.call(`GET /api/website-builder/themes/${aSite}/redesign`, { as: listed.person })
    const otherById = await j.call(`GET /api/website-builder/themes/${bSite}/redesign`, { as: other.person })
    check("listed by user id: on for that account, off for the other; the email entry matches nobody", byId.json?.agent === true && otherById.json?.agent === false)
  }
  process.env.AI_BUILDER_AGENT_ACCOUNTS = ""
  process.env.AI_BUILDER_AGENT = "1"
  {
    const all = await j.call(`GET /api/website-builder/themes/${bSite}/redesign`, { as: other.person })
    check("AI_BUILDER_AGENT=1: on for every account (the global switch still works)", all.json?.agent === true)
  }
  process.env.AI_BUILDER_AGENT = "0" /* round N: on by default; "0" is the off switch the allowlist works under */
  process.env.AI_BUILDER_AGENT_ACCOUNTS = "andrew-m1"
  {
    const notMine = await j.call(`GET /api/website-builder/themes/${bSite}/redesign`, { as: listed.person })
    const postNotMine = await j.call(`POST /api/website-builder/themes/${bSite}/redesign`, { as: listed.person, body: { prompt: "x", key: "m1-cross-0000-4000-8000-000000000003" } })
    check("another store's website: not found, nothing started", notMine.status === 404 && postNotMine.status === 404 && !j.rows("ai_site_jobs").some((r) => r.idempotency_key === "m1-cross-0000-4000-8000-000000000003"))
  }

  section("2. Redesign with AI on an existing website")
  const r = await seller(w, "andrew-m1-site")
  process.env.AI_BUILDER_AGENT_ACCOUNTS = "andrew-m1, andrew-m1-site"
  const site = await blankSite(r, "r")
  /* The person's own work before the AI: a product spotlight bound to their product, a page of their own, and a section file of their own. */
  const home = installPages(w, site).home.sections
  const spotlightId = "product_spotlight-mine"
  const mine = [home[0], { id: spotlightId, type: "product_spotlight", name: "Product spotlight", settings: { heading: "My program", button_url: r.productId }, blocks: [] }, ...home.slice(1)]
  const put = await j.call(`PUT /api/website-builder/themes/${site}/sections`, { as: r.person, body: { page_key: "home", sections: mine, mode: "draft" } })
  const story = ABOUT
  const ownFile = await j.call(`PUT /api/website-builder/themes/${site}/files`, { as: r.person, body: { path: "sections/ai_coach_story.storelib", content: story } })
  check("(set up: the person's spotlight and their own section file saved through the editor's routes)", put.status === 200 && ownFile.status === 200, { put: put.status, file: ownFile.status, json: ownFile.json })
  const snap = (): Snap => ({
    pages: Object.fromEntries(Object.entries(installPages(w, site)).map(([k, p]) => [k, p.draft ?? p.sections])),
    settings: installSettings(w, site).draft ?? installSettings(w, site).settings,
    files: Object.fromEntries(Object.entries(installFiles(w, site)).map(([k, f]) => [k, f.draft ?? f.content ?? ""])),
  })
  const before = snap()
  const backupsBefore = j.rows("store_theme_backups").filter((b) => b.install_id === site).length

  const noKey = await j.call(`POST /api/website-builder/themes/${site}/redesign`, { as: r.person, body: { prompt: "Warmer" } })
  const noWords = await j.call(`POST /api/website-builder/themes/${site}/redesign`, { as: r.person, body: { prompt: " ", key: "m1-redesign-0000-4000-8000-000000000010" } })
  check("a key and words are required; nothing is backed up for a refused press", noKey.status === 400 && noWords.status === 400 && j.rows("store_theme_backups").filter((b) => b.install_id === site).length === backupsBefore)

  const KEY = "m1-redesign-0000-4000-8000-000000000011"
  const prompt = "Add an offer band at the top of the home page and a Pricing page. Keep everything else."
  const started = await j.call(`POST /api/website-builder/themes/${site}/redesign`, { as: r.person, body: { prompt, key: KEY, scope: "changes" } })
  const jobId = String(started.json?.job?.id ?? "")
  const backupId = String(started.json?.backup?.id ?? "")
  const job = jobRow(w, jobId)
  const backup = j.rows("store_theme_backups").find((b) => b.id === backupId)
  check("202 with the job and its backup", started.status === 202 && !!jobId && !!backupId, { status: started.status, json: started.json })
  check("the job: agent engine, step agent, theme mode, the words exactly, its backup id recorded in options.redesign", job.engine === "agent" && job.step === "agent" && job.mode === "theme" && job.prompt === prompt && job.options?.redesign?.backupId === backupId && job.options?.redesign?.scope === "changes", { engine: job.engine, step: job.step, mode: job.mode, options: job.options })
  check("the backup: taken through the Backups mechanism (source ai), before the job row, and it holds the person's work", !!backup && backup.source === "ai" && Date.parse(String(backup.created_at)) <= Date.parse(String(job.created_at)) && JSON.stringify(backup.snapshot?.pages?.find((p: { page_key: string }) => p.page_key === "home")?.sections) === JSON.stringify(before.pages.home) && (backup.snapshot?.files ?? []).some((f: { path: string }) => f.path === "sections/ai_coach_story.storelib"))
  check("the runner was asked to start it (L2's kick)", w.kicks.some((k) => k.jobId === jobId))
  const again = await j.call(`POST /api/website-builder/themes/${site}/redesign`, { as: r.person, body: { prompt, key: KEY, scope: "changes" } })
  check("the same press again: the same job and backup, no second backup", again.status === 200 && again.json?.job?.id === jobId && again.json?.backup?.id === backupId && again.json?.replay === true && j.rows("store_theme_backups").filter((b) => b.install_id === site).length === backupsBefore + 1, again.json)
  const second = await j.call(`POST /api/website-builder/themes/${site}/redesign`, { as: r.person, body: { prompt: "Something else", key: "m1-redesign-0000-4000-8000-000000000012" } })
  check("a second job on the same website while one is live: 409, and no backup for it", second.status === 409 && second.json?.code === "ai_busy_site" && j.rows("store_theme_backups").filter((b) => b.install_id === site).length === backupsBefore + 1, second.json)
  const early = await j.call(`POST /api/website-builder/ai-jobs/${jobId}/undo`, { as: r.person })
  check("Undo while the AI works: refused (cancel it first)", early.status === 409 && early.json?.code === "job_running", early.json)

  const script: Script = [
    { text: "Reading the site first.", calls: [["list_pages", {}], ["read_file", { path: "sections/ai_coach_story.storelib" }]] },
    { calls: [["write_file", { path: "sections/ai_offer_band.storelib", content: BANNER }], ["write_file", { path: "sections/ai_feature_panel.storelib", content: KITCHEN }]] },
    { calls: [["add_page", { key: "pricing", title: "Pricing" }]] },
    { calls: [["set_page_sections", { page: "pricing", sections: [{ type: "ai_feature_panel", settings: { heading: "Plans" } }] }]] },
    () => {
      /* The home page as it is, by id, with the offer band after the header. */
      const now = before.pages.home as { id: string; type: string; group?: string }[]
      const keep = now.map((x) => ({ id: x.id, type: x.type, ...(x.group ? { group: x.group } : {}) }))
      return { calls: [["set_page_sections", { page: "home", sections: [keep[0], { type: "ai_offer_band", settings: { heading: "Autumn intake open" } }, ...keep.slice(1)] }]] }
    },
    { calls: [["finish", { summary: "Added an offer band and a Pricing page; everything else kept." }]] },
  ]
  const s = scriptModels(script, { clock: w.clock })
  w.scripts.set(jobId, s)
  await driveTurns(w, jobId, 20)
  const ran = jobRow(w, jobId)
  const afterAi = snap()
  const aiHome = (afterAi.pages.home ?? []) as { id: string; type: string; settings?: Record<string, unknown> }[]
  check("the job ran on the agent engine through L2's runner to complete", ran.status === "complete", { status: ran.status, error: ran.error, run: ran.state?.agent?.errorCode, asked: s.run.asked })
  check("the brief told the model it is an existing website with changes only, and a backup", JSON.stringify(s.run.requests[0]?.turns ?? []).includes("EXISTING WEBSITE, CHANGES ACROSS THE SITE"))
  check("theme mode kept the content and bindings: the spotlight by id with its product, the person's file byte for byte", aiHome.some((x) => x.id === spotlightId && x.settings?.button_url === r.productId) && afterAi.files["sections/ai_coach_story.storelib"] === before.files["sections/ai_coach_story.storelib"], aiHome.map((x) => [x.type, x.id, x.settings]))
  check("what was asked was made: the offer band on home, a Pricing page with the AI's panel, two ai_ files", aiHome.some((x) => x.type === "ai_offer_band") && ((afterAi.pages.pricing ?? []) as { type: string }[]).some((x) => x.type === "ai_feature_panel") && "sections/ai_offer_band.storelib" in afterAi.files && "sections/ai_feature_panel.storelib" in afterAi.files, { home: aiHome.map((x) => x.type), pricing: afterAi.pages.pricing, files: Object.keys(afterAi.files), answers: s.run.requests.flatMap((q) => q.turns).filter((t) => (t as { role: string }).role === "tool").flatMap((t) => ((t as { results?: { output: string }[] }).results ?? []).map((x) => x.output.slice(0, 300))) })
  const view = await j.call(`GET /api/website-builder/ai-jobs/${jobId}`, { as: r.person })
  check("the progress view says it is a redesign with an Undo", view.json?.redesign?.scope === "changes" && view.json?.redesign?.undo === "available", view.json?.redesign)
  const editorGet = await j.call(`GET /api/website-builder/themes/${site}/redesign`, { as: r.person })
  check("the editor's GET names the newest redesign job and its backup", editorGet.json?.agent === true && editorGet.json?.job?.id === jobId && editorGet.json?.job?.backupId === backupId && editorGet.json?.job?.undone === null, editorGet.json)

  section("3. Undo this AI job")
  /* The person keeps working after the AI: a page of their own and a file of their own, made after the backup. */
  const ownPage = await j.call(`PUT /api/website-builder/themes/${site}/sections`, { as: r.person, body: { page_key: "about-me", sections: [], mode: "draft" } })
  const ownLater = await j.call(`PUT /api/website-builder/themes/${site}/files`, { as: r.person, body: { path: "sections/ai_my_note.storelib", content: ABOUT.replace('"type": "ai_coach_story"', '"type": "ai_my_note"').replace('"name": "Coach story"', '"name": "My note"') } })
  check("(set up: the person's page and file after the AI, through the editor's routes)", ownPage.status === 200 && ownLater.status === 200, { page: ownPage.status, file: ownLater.status, json: ownLater.json })
  const otherUndo = await j.call(`POST /api/website-builder/ai-jobs/${jobId}/undo`, { as: other.person })
  check("another store cannot undo it: not found, nothing changed", otherUndo.status === 404 && "pricing" in installPages(w, site))
  const preview = await j.call(`GET /api/website-builder/themes/${site}/backups/${backupId}`, { as: r.person })
  const removeKeys = (preview.json?.added?.remove ?? []).map((i: { kind: string; key: string }) => `${i.kind}:${i.key}`).sort()
  const keepKeys = (preview.json?.added?.keep ?? []).map((i: { kind: string; key: string; reason: string }) => `${i.kind}:${i.key}:${i.reason}`).sort()
  check("Backups' preview of that backup names what goes (the AI's page and files) and what stays (the person's)", JSON.stringify(removeKeys) === JSON.stringify(["file:sections/ai_feature_panel.storelib", "file:sections/ai_offer_band.storelib", "page:pricing"]) && JSON.stringify(keepKeys) === JSON.stringify(["file:sections/ai_my_note.storelib:person", "page:about-me:unknown"]), { removeKeys, keepKeys })

  const undo = await j.call(`POST /api/website-builder/ai-jobs/${jobId}/undo`, { as: r.person })
  const after = snap()
  const { ["about-me"]: _ownPageNow, ...afterPages } = after.pages
  void _ownPageNow
  const { ["sections/ai_my_note.storelib"]: ownLaterNow, ...afterFiles } = after.files
  check("200, with what was removed and what was kept", undo.status === 200 && undo.json?.ok === true && undo.json?.added?.removed?.length === 3 && undo.json?.added?.kept?.length === 2, undo.json)
  check("every page is exactly as before the AI, and the AI's Pricing page is gone", JSON.stringify(afterPages) === JSON.stringify(before.pages) && !("pricing" in after.pages), { before: Object.keys(before.pages), after: Object.keys(after.pages) })
  check("the Theme settings are exactly as before (the Pricing link in the menu went with them)", JSON.stringify(after.settings) === JSON.stringify(before.settings))
  check("every file is exactly as before, the AI's two files removed", JSON.stringify(afterFiles) === JSON.stringify(before.files) && !("sections/ai_offer_band.storelib" in after.files) && !("sections/ai_feature_panel.storelib" in after.files), { before: Object.keys(before.files), after: Object.keys(after.files) })
  check("the person's page and file made after the backup stay, untouched", "about-me" in after.pages && typeof ownLaterNow === "string" && ownLaterNow.includes("ai_my_note"))
  check("the job is marked undone; the view and the editor's GET say so", jobRow(w, jobId).state?.undo?.backupId === backupId)
  const viewAfter = await j.call(`GET /api/website-builder/ai-jobs/${jobId}`, { as: r.person })
  const getAfter = await j.call(`GET /api/website-builder/themes/${site}/redesign`, { as: r.person })
  check("  (view: undo done; GET: undone)", viewAfter.json?.redesign?.undo === "done" && !!getAfter.json?.job?.undone, { view: viewAfter.json?.redesign, get: getAfter.json?.job })
  const twice = await j.call(`POST /api/website-builder/ai-jobs/${jobId}/undo`, { as: r.person })
  check("a second Undo changes nothing", twice.status === 200 && twice.json?.already === true && JSON.stringify(snap()) === JSON.stringify(after))

  const safety = j.rows("store_theme_backups").filter((b) => b.install_id === site).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
  check("a safety copy was taken before the undo, holding the AI's work", safety?.label === "Before undoing an AI job" && (safety.snapshot?.files ?? []).some((f: { path: string }) => f.path === "sections/ai_offer_band.storelib") && (safety.snapshot?.pages ?? []).some((p: { page_key: string }) => p.page_key === "pricing"))
  const redo = await j.call(`POST /api/website-builder/themes/${site}/backups/${safety.id}/restore`, { as: r.person })
  const redone = snap()
  check("restoring that safety copy brings the AI's page and files back (the undo is undoable)", redo.status === 200 && "pricing" in redone.pages && "sections/ai_offer_band.storelib" in redone.files && "sections/ai_feature_panel.storelib" in redone.files, redo.json)

  section("4. Backups' restore after an AI job removes the AI's additions, and the person's only when named")
  const asked = await j.call(`POST /api/website-builder/themes/${site}/backups/${backupId}/restore`, { as: r.person, body: { removeAdded: ["page:about-me", "file:sections/ai_not_there.storelib"] } })
  const final = snap()
  check("the AI's page and files are removed again; the person's page goes because they named it; their file stays because they did not", asked.status === 200 && !("pricing" in final.pages) && !("sections/ai_offer_band.storelib" in final.files) && !("about-me" in final.pages) && "sections/ai_my_note.storelib" in final.files, { status: asked.status, added: asked.json?.added })
  check("  a name that was not added after the backup removes nothing", (asked.json?.added?.removed ?? []).every((i: { key: string }) => i.key !== "sections/ai_not_there.storelib"))

  section("5. The rest of the job's rules")
  const notOwner = await j.call(`POST /api/website-builder/themes/${site}/redesign`, { as: other.person, body: { prompt: "x", key: "m1-redesign-0000-4000-8000-000000000013" } })
  check("another store's owner: not found (and never their AI)", notOwner.status === 404)
  delete process.env.AI_BUILDER_AGENT_ACCOUNTS
  const offNow = await j.call(`POST /api/website-builder/themes/${site}/redesign`, { as: r.person, body: { prompt: "x", key: "m1-redesign-0000-4000-8000-000000000014" } })
  check("the switch off: 501 and no backup taken", offNow.status === 501 && !j.rows("ai_site_jobs").some((x) => x.idempotency_key === "m1-redesign-0000-4000-8000-000000000014"))

  done()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
