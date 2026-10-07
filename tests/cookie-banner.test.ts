/**
 * ===========================================================================
 *  A SITE'S COOKIE BANNER: ON OR OFF, IN ITS OWN WORDS
 * ===========================================================================
 * The switch in Website Settings was labelled "Show a cookie banner" and
 * meant "use my own words": turning it off changed the wording and the
 * banner stayed. Held here: the switch shows and hides the banner, off means
 * nothing optional is stored, the words start as the site's own sentence,
 * and the builder's theme settings hold the same settings.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { SITE_COOKIE_TEXT } from "@/lib/consent/copy"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const banner = read("components/cookie-consent-banner.tsx")
const page = read("components/website-builder/theme/ThemePage.tsx")
const settings = read("components/website-builder/website-settings/policies.tsx")

check("a site that switched the banner off is not asked anything", /const quiet = [^\n]*site\?\.hidden === true/.test(banner))
check("and with no answer, nothing optional loads: analytics wait for a yes", /consent\?\.analytics === true && !inSitesEditor && !embedded && <Analytics \/>/.test(banner))
check("the site says so from its own setting, on unless switched off", /const hidden = t\.cookie_banner_show === false/.test(page) && /setSiteConsentTheme\(\{\s*hidden,/.test(page))
check("a creator's site speaks in its own default sentence, not storelib.com's", /\|\| SITE_COOKIE_TEXT/.test(page) && !/creators can see/.test(SITE_COOKIE_TEXT))
check("colours only when the creator asked for their own", /const bg = ownColours \? str\(t\.cookie_bg, ""\) : ""/.test(page))
/*
  Changed on purpose: the owner asked for the banner to be "a theme settings
  thing", so it is set in Theme settings › Cookie banner, and Policies is one
  line that opens it there. Still one place for the controls, not two.
*/
const ids = THEME_SETTINGS_GROUPS.flatMap((g) => g.fields.map((f) => f.id))
const cookies = THEME_SETTINGS_GROUPS.find((g) => g.id === "cookies")
const cookieIds = ["cookie_banner_show", "cookie_banner_text", "cookie_accept_text", "cookie_decline_text", "cookie_banner_enabled", "cookie_bg", "cookie_text_color"]
check("Theme settings has a Cookie banner group with every key the page reads", !!cookies && cookieIds.every((id) => cookies.fields.some((f) => f.id === id)) && cookieIds.every((id) => page.includes(id)))
check("its words start as the site's default sentence and buttons", cookies?.fields.find((f) => f.id === "cookie_banner_text")?.default === SITE_COOKIE_TEXT)
check("the colours ask only once own colours are on", /cookie_banner_enabled/.test(String(cookies?.fields.find((f) => f.id === "cookie_bg")?.visible_if ?? "")))
check("and no cookie key is in two groups", ids.filter((id) => id.startsWith("cookie_")).length === cookieIds.length)
check("Policies does not draw the controls a second time, it opens the group", !/cookie_banner_enabled/.test(settings) && /onOpenThemeGroup\("cookies"\)/.test(settings))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
