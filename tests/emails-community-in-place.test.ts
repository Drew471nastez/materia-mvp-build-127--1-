/**
 * ===========================================================================
 *  EMAILS: COMMUNITY EMAILS AND AUTOMATIONS IN PLACE, PILLS THAT DO NOT
 *  SLIDE, A PREVIEW THAT IS THERE WHEN THE EDITOR OPENS
 * ===========================================================================
 *   - A community's emails open, are edited, tested and sent from the
 *     Emails page itself; its automated messages are listed in Emails ›
 *     Automations and under the Communities family, and open over the page.
 *   - Customer emails' All / Digital / Physical / Communities change at
 *     once: no sliding pill.
 *   - A customer email's preview is drawn by the server once per version of
 *     its words, read ahead on hover, and shown the moment the editor opens.
 */
import { readFileSync } from "node:fs"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SegmentedPills } from "@/components/app/segmented-pills"
import { automationSwitch } from "@/components/app/emails/community-automations"
import { previewVersion } from "@/lib/emails/preview-version"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

console.log("\n1. A community's emails are edited and sent from Emails\n")
{
  const community = read("components/app/emails/community-emails.tsx")
  check("a row opens its editor sheet on this page, Email your members its composer", /onOpen=\{\(\) => \(broadcast \? setComposing\(true\) : setOpen\(e\)\)\}/.test(community) && /<CommunityEmailSheet/.test(community) && /<BroadcastSheet/.test(community))
  check("nothing in it leaves for the community area", !/router\.push|href=\{?[`"]\/app\/community/.test(community) && !/from "next\/link"/.test(community))
  check("saved, tested and sent through the community's own routes", /\/emails\/templates`, \{ method: "PUT"/.test(community) && /\/emails\/test`, \{ method: "POST"/.test(community) && /\/emails`, \{ method: "POST", body: \{ subject, message \}/.test(community))
  const panel = read("components/app/settings/customer-emails-panel.tsx")
  check("the Communities family draws them in the Emails list", /<CommunityEmails community=\{community\}/.test(panel))
  check("a community's old Member emails link opens Emails at its community", /communityEmailsHref\(ctx\.community\.id\)/.test(read("app/app/community/[id]/settings/page.tsx")))
}

console.log("\n2. Community automations are in Emails › Automations, and open there\n")
{
  const home = read("app/app/emails/emails-home.tsx")
  check("Automations lists each community's automated messages under the store's", /<CommunityAutomations communities=\{communities\} titled=\{communities\.length > 1\} \/>/.test(home) && /data-flow-communities/.test(home))
  check("the communities come from the Customer emails read, or are read once", /function useCommunities\(known: CustomerEmailsData \| null \| undefined\)/.test(home) && /storeApi<CustomerEmailsData>\(CUSTOMER_EMAILS_PATH\)/.test(home))
  const panel = read("components/app/settings/customer-emails-panel.tsx")
  check("and under the Communities family, as each family lists its automations", /<CommunityAutomations communities=\{\[community\]\} bare=\{bare\} titled=\{false\} \/>/.test(panel))
  const rows = read("components/app/emails/community-automations.tsx")
  check("a row opens the community's own manager over this page, never the community area", /<AutomationsPanel head=\{opened\} \/>/.test(rows) && /<SheetDialog/.test(rows) && !/router\.push|href=\{?[`"]\/app\/community/.test(rows))
  check("its switch pauses and resumes through the community's route", /action: on \? "resume" : "pause"/.test(rows) && /\/chat\/automations`/.test(rows))
  check("the manager takes only an id and a name, so Emails can open it", /head: Pick<CommunityHead, "id" \| "name">/.test(read("components/community/creator/automations-panel.tsx")))
  check("a switch on what can still send; none on a one-off that has gone", automationSwitch({ status: "active", trigger: "join" }) === true && automationSwitch({ status: "paused", trigger: "level" }) === false && automationSwitch({ status: "done", trigger: "broadcast" }) === null && automationSwitch({ status: "sending", trigger: "broadcast" }) === null)
}

console.log("\n3. All / Digital / Physical / Communities do not slide\n")
{
  const options = [
    { value: "all", label: "All" },
    { value: "digital", label: "Digital products" },
    { value: "communities", label: "Communities" },
  ]
  const still = renderToStaticMarkup(React.createElement(SegmentedPills, { variant: "chips", value: "digital", slide: false, onChange: () => {}, options, label: "Email families" }))
  check("no moving pill is drawn", !/translate:/.test(still) && !/transition-\[translate,width\]/.test(still), still.slice(0, 300))
  check("the chosen chip draws its own dark pill, nothing animates its colour", /aria-selected="true"[^>]*class="[^"]*bg-\[#1a1a2e\]/.test(still) && !/transition-colors/.test(still))
  const sliding = renderToStaticMarkup(React.createElement(SegmentedPills, { variant: "chips", value: "digital", onChange: () => {}, options, label: "Views" }))
  check("Analytics and the Emails tabs keep their slide", /transition-colors/.test(sliding))
  check("Customer emails asks for no slide", /<SegmentedPills variant="chips" value=\{shown\} slide=\{false\}/.test(read("components/app/settings/customer-emails-panel.tsx")))
}

console.log("\n4. The preview is there when the editor opens\n")
{
  check("a version of the saved words: the same words, the same version, keys in any order", previewVersion({ subject: "Hi", heading: "Yo" }) === previewVersion({ heading: "Yo", subject: "Hi" }) && previewVersion({ subject: "Hi" }) !== previewVersion({ subject: "Hi!" }))
  check("no words saved is the default version", previewVersion(undefined) === "default" && previewVersion({}) === "default")
  const route = read("app/api/store/emails/preview/route.ts")
  check("the server draws it once per store, email, place, language and version, and keeps it", /const key = `\$\{c\.creatorId\}\|\$\{id\}\|\$\{channel\}\|\$\{lang \?\? ""\}\|\$\{version\}`/.test(route) && /kept\.set\(key/.test(route) && /KEEP_MS = 120_000/.test(route))
  check("the browser keeps it only for the version it asked for", /q\.get\("v"\) === version \? `private, max-age=/.test(route))
  const panel = read("components/app/settings/customer-emails-panel.tsx")
  check("a row read ahead as the pointer arrives, or a finger lands", /onIntent=\{\(\) => \{\s*void warmPreviews\(\)\s*prefetchStorePreview\(e\.id, data\)/.test(panel))
  check("the editor shows the kept preview at once while the words are the saved ones; live once a key is typed", /const keptMail = pristine \? keptPreview\(id, saved, where\.channel, where\.lang\) : null/.test(panel) && /const mail: DrawnPreview \| null = keptMail \?\? liveMail \?\?/.test(panel))
  check("a key typed before the templates load keeps the last picture, never the skeleton", /lastMail\.current && lastMail\.current\.id === id/.test(panel))
  check("the time from the click to the drawn preview is measured", /performance\.measure\("customer-email-preview"/.test(panel) && /markPreviewOpen\(e\.id\)/.test(panel) && /onDrawn=\{\(\) => measurePreviewOpen\(id, mailFrom\)\}/.test(panel))
  const parts = read("components/app/emails/email-parts.tsx")
  check("the frame opens at the email's last height, so nothing reflows when it is measured", /heightsKept\.get\(heightKey\)/.test(parts) && /heightKey=\{id\}/.test(panel))
  check("still written into the frame's own document, never a new srcDoc", /doc\.documentElement\.innerHTML = innerOf\(html\)/.test(parts) && !/srcDoc=/.test(parts))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
