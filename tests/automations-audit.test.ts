/**
 * What the automations audit fixed, held in the source so it cannot quietly
 * go back. scripts/check-automations.mjs measures the same in a browser.
 *
 *   duplicate   a flow can be copied, from its page and from the list; the
 *               copy is always off, and unsaved edits are saved first
 *   preview     one Preview per email, filled and framed as a send is (the
 *               server draws the same when the page has no look), shown in
 *               the composer's own preview, above the phone's sheet
 *   the list    it hears about every save, switch, copy and delete made on a
 *               flow's page, so Back never shows what was there before
 *   turning off from the list asks first when people are partway through,
 *               as the flow's own page does
 *   phones      the Automations tab is rows, not a table to scroll sideways,
 *               and a step's Move, Remove and Done stay at the sheet's foot
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const duplicate = read("app/api/automations/flows/[id]/duplicate/route.ts")
const preview = read("app/api/automations/flows/[id]/preview/route.ts")
const test = read("app/api/automations/flows/[id]/test/route.ts")
const drawn = read("lib/automations/flow-preview.ts")
const builder = read("app/app/emails/flow/[id]/builder.tsx")
const chooser = read("app/app/emails/flow/new/chooser.tsx")
const client = read("app/app/emails/emails-client.tsx")
const home = read("app/app/emails/emails-home.tsx")
const io = read("lib/automations/flow-io.ts")
const save = read("app/api/automations/flows/[id]/route.ts")
const create = read("app/api/automations/flows/route.ts")
const layer = read("components/email/compose/preview-layer.tsx")

console.log("\nDuplicate")
check("the copy is read through the creator's own session, so only their own flow can be copied", /\.from\("email_flows"\)\s*\.select\("id, name, trigger_type, trigger_config, steps"\)\s*\.eq\("id", id\)\s*\.eq\("creator_id", me\.creatorId\)/.test(duplicate))
check("the copy is always off", /status: "draft"/.test(duplicate) && !/status: flow\.status/.test(duplicate))
check("its steps are rebuilt from known shapes, not copied blind", /serializeSteps\(normalizeSteps\(flow\.steps\)\)/.test(duplicate))
check("named Copy of, within the 80 characters a name has", /`Copy of \$\{base\}`\.slice\(0, 80\)/.test(io))
check("on the flow's page it saves unsaved edits first, then opens the copy", /if \(dirty && !\(await save\(\)\)\) return/.test(builder) && /router\.push\(`\/app\/emails\/flow\/\$\{out\.id\}`\)/.test(builder) && /label: copying \? "Copying" : "Duplicate"/.test(builder))
check("and in the list's menu", /\{ label: "Duplicate", onClick: \(\) => props\.onDuplicateFlow\(f\) \}/.test(home) && /duplicateFlow = async/.test(client))
check("an unnamed flow is Untitled automation everywhere", /export const UNTITLED = "Untitled automation"/.test(io) && /cleanName\(body\.name\) \?\? UNTITLED/.test(save) && /template\?\.name \?\? UNTITLED/.test(create) && !/"Untitled flow"/.test(save))

console.log("\nPreview")
check("the test is drawn by the mailer a real send uses", /prepareEmail\(input\.step/.test(drawn) && /mailer\.compose\(/.test(drawn) && /drawFlowEmail\(/.test(test))
check("the server's preview is the builder's own preview function, so the two cannot differ", /previewFlowEmail\(step, trigger, identity, product\)/.test(preview) && /previewFlowEmail\(step, props\.trigger, props\.look, props\.sampleProduct\)/.test(builder))
check("one Preview in the step's panel, not two", (builder.match(/>\s*\{previewing \? "Opening" : "Preview"\}/g) ?? []).length === 1 && !/Hide preview/.test(builder))
check("the preview reads only the creator's own flow and cleans the step as a save does", /\.eq\("creator_id", me\.creatorId\)/.test(preview) && /cleanSteps\(\[body\.step\]\)/.test(preview))
check("the preview sends nothing", !/\.send\(/.test(preview))
check("the builder opens it in the composer's preview layer, asking the server only without the creator's look", /<PreviewLayer/.test(builder) && /if \(props\.look\) return setPreviewOpen\(true\)/.test(builder) && /\/preview`/.test(builder) && /data-flow-preview/.test(builder))
check("which sits above the shared sheet (z 200)", /fixed inset-0 z-\[210\]/.test(layer))

console.log("\nThe Emails list hears about changes")
check("save, switch and delete on the flow's page mark the list out of date", (builder.match(/refreshMatching\(FLOWS_KEY\)/g) ?? []).length >= 4 && /const FLOWS_KEY = "emails:flows"/.test(builder))
check("a deleted flow leaves the list before the list is seen", /write<Array<\{ id: string \}> \| undefined>\(FLOWS_KEY, \(prev\) => prev\?\.filter\(\(f\) => f\.id !== data\.flow\.id\)\)/.test(builder))
check("a new flow from the chooser does too", /refreshMatching\("emails:flows"\)/.test(chooser))

console.log("\nTurning off from the list")
check("asks first when people are partway through", /if \(!on && !confirmed && \(flow\.totals\?\.in_progress \?\? 0\) > 0\)/.test(client) && /type: "flow-off"/.test(client))

console.log("\nPhones")
check("the Automations tab is rows below 768px and the table from 768px", /className="divide-y divide-\[#f1f2f4\] md:hidden" data-flow-list=""/.test(home) && /<ScrollEdge frameClassName="max-md:hidden">/.test(home))
check("each row's menu is a 44px target", /<RowMenuButton label=\{`Actions for \$\{f\.name\}`\} className="h-11 w-11" \/>/.test(home))
check("a step's actions stick to the foot of the sheet, with Done", /data-panel-foot="" className="sticky bottom-0/.test(builder) && /<PanelDone onClose=\{props\.onClose\} \/>/.test(builder))
check("Only these products with none ticked says what that means", /data-no-products-picked/.test(builder))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
