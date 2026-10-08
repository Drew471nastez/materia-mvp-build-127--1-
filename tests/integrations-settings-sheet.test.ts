/**
 * Settings › Integrations (the commerce providers as cards, keys checked
 * with the provider on save) and Settings drawn as one large sheet with its
 * sections in groups.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PROVIDERS } from "../lib/physical/providers"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nKeys are put to the provider\n")
{
  const verify = read("lib/physical/provider-verify.ts")
  for (const [id, url] of [["shippo", "api.goshippo.com"], ["printful", "api.printful.com"], ["gelato", "product.gelatoapis.com"], ["printify", "api.printify.com"], ["easypost", "api.easypost.com"]] as const) {
    check(`${id} is asked at ${url}`, new RegExp(`case "${id}"[\\s\\S]{0,200}${url.replace(/\./g, "\\.")}`).test(verify))
    check(`  and its card says the key is checked`, PROVIDERS.find((p) => p.id === id)?.verifies === true)
  }
  check("reads only: nothing is posted to a provider", !/method:\s*"POST"/.test(verify))
  const save = read("lib/physical/integrations-server.ts")
  check("a refused key is never stored", /if \(verdict\.state === "rejected"\) return \{ ok: false, error: verdict\.error \}\s*row\.secret_ciphertext = sealSecret\(key\)/.test(save))
  check("an accepted key keeps its account and mode", /row\.account_label = verdict\.account/.test(save) && /verified_at: new Date\(\)\.toISOString\(\)/.test(save))
  check("a provider that is not live is still never saved as connected", /row\.status = info\.availability === "live" \? "connected" : "needs_setup"/.test(save))
}

console.log("\nThe Integrations section\n")
{
  const market = read("components/physical/integrations-marketplace.tsx")
  check("grouped by what the service does, shipping first", /const ORDER: ProviderCategory\[\] = \["shipping", "print_on_demand", "dropshipping", "fulfillment", "supplier"\]/.test(market))
  check("a verified key says so, with Test for a test key", /state\.mode === "test" \? "Key verified · Test" : "Key verified"/.test(market))
  check("and the card never claims orders are sent where they are not", /Storelib does not send orders to \{provider\.name\} yet/.test(market))
  check("the provider's own logo when one is named, else its initial", /provider\.logo \?/.test(market) || /if \(provider\.logo\)/.test(market))
  const settings = read("components/app/settings-form-new.tsx")
  check("Settings has Integrations, behind the physical commerce switch", /\{ id: "integrations", label: "Integrations", icon: Plug, group: "integrations" \}/.test(settings) && /<IntegrationsMarketplace \/>/.test(settings))
  check("Shipping points to it rather than keeping a second copy", /href="\/app\/settings\?tab=integrations"/.test(read("components/physical/shipping-settings.tsx")) && !/function IntegrationRow/.test(read("components/physical/shipping-settings.tsx")))
}

console.log("\nSettings as a sheet, in groups\n")
{
  const settings = read("components/app/settings-form-new.tsx")
  check("four groups: Account, Store, Commerce, Integrations", /const TAB_GROUPS = \[\s*\{ id: "account", label: "Account" \},\s*\{ id: "store", label: "Store" \},\s*\{ id: "commerce", label: "Commerce" \},\s*\{ id: "integrations", label: "Integrations" \},\s*\] as const/.test(settings))
  check("every section kept, its address too", ["general", "security", "privacy", "notifications", "billing", "payments", "domains", "shipping", "integrations"].every((id) => new RegExp(`\\{ id: "${id}",`).test(settings)))
  check("a grouped column from 1024px, the pill row below it", /data-settings-groups="" className="sticky top-2 hidden lg:block"/.test(settings) && /data-settings-tabs="" className="mb-6 sm:mb-8 lg:hidden/.test(settings))
  const sheet = read("components/app/settings-sheet.tsx")
  check("the page is drawn in the sheet", /<SettingsSheet>/.test(read("app/app/settings/page.tsx")))
  check("dragged with a finger or a mouse (pointer events), closing past a quarter or on a flick", /onPointerDown=\{onPointerDown\}/.test(sheet) && /setPointerCapture/.test(sheet) && /d\.dy > h \* 0\.25 \|\| d\.v > FLICK/.test(sheet))
  check("Escape, the close button and the dimmed page close it", /e\.key !== "Escape"/.test(sheet) && /aria-label="Close settings"/.test(sheet) && /data-settings-sheet-scrim="" \/>/.test(sheet.replace(/onClick=\{\(\) => close\(\)\} /, "")))
  check("its own contained scroll, and no transform at rest", /overflow-y-auto overflow-x-clip overscroll-contain/.test(sheet) && /el\.style\.transform = ""/.test(sheet))
  check("reduced motion: no rise, no drop", (sheet.match(/reducedMotion\(\)/g) ?? []).length >= 3)
  check("the tab bar's scroll hold reads the sheet's scroller", /closest\("\[data-settings-sheet-scroll\], \.app-content-scroll"\)/.test(settings))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
