/**
 * ===========================================================================
 *  THE WELCOME EMAIL A CREATOR SETS UP, AND WHAT EVERY AUTOMATED EMAIL OWES
 * ===========================================================================
 * A creator writes one welcome email on the Emails page and it is sent to
 * everyone who joins their list. The engine for that existed. Four things
 * about it did not work:
 *
 *   no way out            no unsubscribe link and no List-Unsubscribe
 *                         header on any automated email, which the law
 *                         requires of marketing mail and which Gmail and
 *                         Yahoo require of any bulk sender
 *   unsubscribing lost    a delayed email queued at sign-up was sent days
 *                         later whether or not the person had left
 *   two paths, one email  /api/subscribe wrote the subscriber and never
 *                         fired the welcome, and no resubscribe path did
 *   addresses in logs     every send logged the full recipient address
 *
 * The wiring is pinned by reading the source, because these are route
 * handlers against Supabase with no harness; the pure parts are called.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  APP_URL,
  automationEmail,
  escapeHtml,
  personalize,
  personalizeText,
  standingOf,
  stripHtml,
  unsubscribeUrlFor,
} from "@/lib/email-automation"
import { maskEmail } from "@/lib/privacy/mask-email"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** A Supabase-shaped stub holding one subscribers row, or none. */
function db(row: Record<string, unknown> | null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: row, error: null }),
  }
  return { from: () => builder }
}

async function main() {
  console.log("\nWho may be sent an automated email")

  const live = await standingOf(db({ status: "subscribed", is_active: true, unsubscribe_token: "tok-1" }), "c1", "A@Example.com ")
  check("somebody on the list is sent to, with their token", live.suppressed === false && live.unsubscribeToken === "tok-1")
  for (const status of ["unsubscribed", "bounced", "complained", "cleaned"]) {
    const s = await standingOf(db({ status, is_active: true, unsubscribe_token: "t" }), "c1", "a@e.com")
    check(`"${status}" is never sent to`, s.suppressed === true)
  }
  check("nor is a row switched off some other way",
    (await standingOf(db({ status: "subscribed", is_active: false, unsubscribe_token: "t" }), "c1", "a@e.com")).suppressed === true)
  const stranger = await standingOf(db(null), "c1", "buyer@e.com")
  check("a buyer who never joined the list still gets their purchase email",
    stranger.suppressed === false && stranger.unsubscribeToken === null,
    "and no unsubscribe link, because there is no list to leave")

  console.log("\nEvery automated email carries a way out")

  const mail = automationEmail({ body: "<p>Hello</p>", fromName: "Astrid", unsubscribeToken: "tok-1" })
  const url = unsubscribeUrlFor("tok-1")
  check("the link is the platform's unsubscribe page, with the token", url === `${APP_URL}/unsubscribe?token=tok-1`)
  check("it is in the HTML", mail.html.includes(url) && /Unsubscribe<\/a>/.test(mail.html))
  check("and in the plain text", (mail.text ?? "").includes(`Unsubscribe: ${url}`))
  check("and in the headers every inbox provider reads",
    mail.headers?.["List-Unsubscribe"] === `<${APP_URL}/api/email/unsubscribe?token=tok-1>` && mail.headers?.["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click")
  check("the footer says why they are getting it", /You are getting this because you joined Astrid's list/.test(mail.html))
  const none = automationEmail({ body: "<p>Hi</p>", fromName: "Astrid", unsubscribeToken: null })
  check("with no token there is no link and no header, rather than a broken one",
    !/unsubscribe\?token/.test(none.html) && none.headers === undefined && !/Unsubscribe:/.test(none.text ?? ""))
  check("a creator's name cannot close the tag it sits in",
    !/<script>/.test(automationEmail({ body: "<p>x</p>", fromName: '</td><script>x</script>', unsubscribeToken: null }).html))
  check("the token is escaped into the href",
    automationEmail({ body: "", fromName: "A", unsubscribeToken: '"><script>' }).html.includes("%22%3E%3Cscript%3E"))

  console.log("\nThe creator's own text reaches the reader")

  check("{{name}} and {{first_name}} are filled",
    personalize("Hi {{name}}, ({{first_name}})", { name: "Ada Lovelace" }) === "Hi Ada Lovelace, (Ada)")
  check("and the editor's typed-out placeholders", personalize("Hi Customer Name", { name: "Ada" }) === "Hi Ada")
  check("somebody with no name is not greeted by an empty space",
    personalize("Hi {{name}}", {}) === "Hi there" && personalizeText("Hi {{first_name}}", {}) === "Hi there")
  check("a name cannot inject markup into the body",
    personalize("Hi {{name}}", { name: "<img src=x onerror=1>" }) === "Hi &lt;img src=x onerror=1&gt;")
  check("a subject is text, so it is not escaped into entities",
    personalizeText("Welcome {{name}}", { name: "Ada & Co" }) === "Welcome Ada & Co")
  check("the plain text of a body keeps its line breaks",
    stripHtml("<p>One</p><p>Two</p>") === "One\n\nTwo")
  check("and decodes what the editor stored as entities", stripHtml("<p>Tea &amp; cake</p>") === "Tea & cake")
  check("escapeHtml covers the five", escapeHtml(`<>&"'`) === "&lt;&gt;&amp;&quot;&#39;")

  console.log("\nThe sending paths use it")

  const flows = read("lib/email.tsx")
  const trigger = flows.slice(flows.indexOf("export async function legacyTriggerEmailFlows("), flows.indexOf("// Refund Confirmation Emails"))
  check("an immediate send checks the person first",
    trigger.indexOf("await standingOf(") < trigger.indexOf("await sendEmail(") && /if \(standing\.suppressed\)/.test(trigger))
  check("and builds the email through the one module",
    /automationEmail\(\{ body, fromName, unsubscribeToken: standing\.unsubscribeToken \}\)/.test(trigger)
      && /headers: mail\.headers/.test(trigger))
  check("nothing hand-rolls a second flow email wrapper",
    !/wrapFlowEmailHtml/.test(flows) && !/function personalizeContent/.test(flows))
  check("a recipient is not written to the log",
    !/recipient: recipientEmail|to:\", recipientEmail|\$\{recipientEmail\}/.test(trigger) && /maskEmail\(recipientEmail\)/.test(trigger))

  const cron = read("app/api/cron/process-scheduled-emails/route.ts")
  check("a delayed send checks the person again, not only the flow",
    cron.indexOf("await standingOf(") < cron.indexOf("await sendEmail(") && /standing\.suppressed/.test(cron))
  check("and cancels the queued email rather than sending it",
    /status: "cancelled"[\s\S]{0,400}the address left the list/.test(cron))
  check("it carries the same unsubscribe link and headers",
    /automationEmail\(\{[\s\S]{0,200}unsubscribeToken: standing\.unsubscribeToken/.test(cron) && /headers: mail\.headers/.test(cron))
  check("and no longer holds its own copy of the wrapper",
    !/function wrapFlowEmailHtml/.test(cron))
  check("the cron still refuses without its secret", /requireBearerSecret\(request, "CRON_SECRET"\)/.test(cron))

  console.log("\nEvery way of joining a list sends the welcome")

  const paths: [string, string][] = [
    ["a section, footer or contact form on a built site", "app/api/website-builder/subscribe/route.ts"],
    ["the creator page's subscribe bar", "app/api/subscribers/route.ts"],
    ["the older public subscribe endpoint", "app/api/subscribe/route.ts"],
    ["a OnePage capture block", "app/api/onepage/email-capture/route.ts"],
    ["a OnePage lead magnet", "app/api/onepage/leads/route.ts"],
  ]
  for (const [what, file] of paths) {
    const src = read(file)
    check(what, /triggerEmailFlows\(/.test(src) && /triggerType: "new_subscriber"/.test(src))
  }
  for (const [what, file] of paths) {
    const src = read(file)
    /* Either a second trigger call on the resubscribe branch, or one call
       reached by both branches through a flag. Both are the same behaviour. */
    const twice = (src.match(/triggerType: "new_subscriber"/g) ?? []).length >= 2
    const viaFlag = /let welcome = true[\s\S]*if \(welcome\) \{[\s\S]{0,200}triggerType: "new_subscriber"/.test(src)
    check(`${what}: joining again after leaving welcomes them again`,
      twice || viaFlag || !/unsubscribed/.test(src),
      "a resubscribe that skips the welcome is a person who joined and heard nothing")
  }

  console.log("\nA row that can be emailed can be left")

  for (const file of ["app/api/website-builder/subscribe/route.ts", "app/api/subscribers/route.ts", "app/api/subscribe/route.ts", "app/api/onepage/email-capture/route.ts", "app/api/onepage/leads/route.ts"]) {
    const src = read(file)
    const inserts = /\.from\("subscribers"\)\s*\.insert\(/.test(src) || /from\("subscribers"\)\.insert\(/.test(src)
    check(`${file.replace("app/api/", "")} writes an unsubscribe token`,
      !inserts || /unsubscribe_token:/.test(src),
      "the unsubscribe link IS the token: a row without one cannot be left")
  }
  check("the public creator-page endpoint is rate limited like the others",
    /bucket: "subscribe"/.test(read("app/api/subscribers/route.ts")))
  check("and checks the creator exists before writing a row",
    /\.from\("creators"\)[\s\S]{0,200}\.maybeSingle\(\)/.test(read("app/api/subscribers/route.ts")))

  console.log("\nNobody's address is written to a log")

  check("masking keeps enough to follow a delivery problem",
    maskEmail("jane.doe@gmail.com") === "ja***@gmail.com" && maskEmail("a@b.co") === "a***@b.co")
  check("and holds up against what is not an address",
    maskEmail(undefined) === "(none)" && maskEmail("nonsense") === "(invalid)")
  for (const file of ["lib/mail.ts", "lib/mailgun.ts"]) {
    const src = read(file)
    /* Only what is logged. Handing the real address to the sender is the job. */
    const logged = (src.match(/console\.(log|warn|error)\([\s\S]*?\n\s*\)/g) ?? []).join("\n")
    check(`${file} logs a masked recipient`,
      !/\boptions\.to\b(?!\))/.test(logged.replace(/maskEmail\(options\.to\)/g, "")) && /maskEmail\(options\.to\)/.test(src))
  }
  check("and an error message does not carry the address either",
    !/Invalid email format: \$\{options\.to\}/.test(read("lib/mailgun.ts")))

  console.log("\nSetting one up on the Emails page")

  /* The flow editor left page.tsx for its own pages: the chooser at
     app/app/emails/flow/new and the builder at app/app/emails/flow/[id], both
     writing through app/api/automations. The same promises, pinned there. */
  const page = read("app/app/emails/emails-client.tsx")
  const createRoute = read("app/api/automations/flows/route.ts")
  const chooser = read("app/app/emails/flow/new/chooser.tsx")
  check("choosing an automation you have opens it, rather than making a second that would also send",
    /if \(same\) return NextResponse\.json\(\{ id: same\.id, existing: true \}\)/.test(createRoute)
      && /const mine = existing\[body\.template\][\s\S]{0,120}router\.push\(`\/app\/emails\/flow\/\$\{mine\}`\)/.test(chooser))
  check("and a welcome made before templates had names counts as the welcome",
    /f\.trigger_type === "new_subscriber" \? "welcome"/.test(read("app/app/emails/flow/new/page.tsx")))
  const home = read("app/app/emails/emails-home.tsx")
  check("the list says what starts each automation, in words",
    /Starts when/.test(home) && /TRIGGERS\[f\.trigger_type\]\.sentence/.test(home))
  check("and no preset signs off as \\[Your name\\]",
    !/\[Your name\]/.test(page) && !/\[Your name\]/.test(read("lib/automations/templates.ts")))
  check("new_subscriber is still the trigger the engine listens for",
    /new_subscriber: \{ name:/.test(read("lib/automations/flow-model.ts"))
      && /\.eq\("trigger_type", trigger\)/.test(read("lib/automations/supabase-store.ts"))
      && /trigger_type", triggerType/.test(flows))


  console.log("\nOff until the creator turns it on")

  const patchRoute = read("app/api/automations/flows/[id]/route.ts")
  const patch = patchRoute.slice(patchRoute.indexOf("const patch = {"), patchRoute.indexOf("updated_at: new Date().toISOString(),", patchRoute.indexOf("const patch = {")))
  const builder = read("app/app/emails/flow/[id]/builder.tsx")
  const statusRoute = read("app/api/automations/flows/[id]/status/route.ts")
  check("a new automation starts off", /status: "draft",\s*steps: serializeSteps/.test(createRoute))
  check("saving it does not turn it on or off", patch.length > 100 && !/status/.test(patch))
  check("the builder says plainly whether it is on: Live, Draft or Paused, beside its name", /active: \{ label: "Live", tone: "success" \}/.test(builder) && /draft: \{ label: "Draft"/.test(builder) && /<StatusBadge tone=\{state\.tone\}/.test(builder))
  check("turning it on is refused until it is complete, on the server and on the page",
    /const problems = problemsOf\(flow\.trigger_type, normalizeSteps\(flow\.steps\)\)[\s\S]{0,120}status: 422/.test(statusRoute)
      && /if \(next && problems\.length > 0\)/.test(builder))
  check("and so does every automation in the list, without opening it",
    /onClick=\{\(e\) => e\.stopPropagation\(\)\}>\s*<Switch checked=\{on\} onCheckedChange=\{\(\) => props\.onToggleFlow\(f\)\}/.test(home))
  check("the list's switch goes through the same server check",
    /fetch\(`\/api\/automations\/flows\/\$\{flow\.id\}\/status`/.test(page))
  check("turning it off says sign-ups are still collected", /Sign-ups and orders are still recorded\./.test(page))
  check("and turning it off stops the people partway through, said before it happens",
    /await stopFlowRuns\(id, "The flow was turned off\."\)/.test(statusRoute) && /partway through\. Turning it off stops them where they are/.test(builder))
  check("and only an active automation ever sends",
    /\.eq\("status", "active"\)/.test(flows) && /\.eq\("status", "active"\)/.test(read("lib/automations/supabase-store.ts")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
void main()
