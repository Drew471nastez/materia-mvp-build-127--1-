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
check("Website Settings shows and hides the banner with the switch it names", /onChange=\{\(on\) => ctx\.onSettingChange\("cookie_banner_show", on\)\} label="Show the cookie banner"/.test(settings) && /const showBanner = ctx\.settings\.cookie_banner_show !== false/.test(settings))
check("and its words are there to edit from the start", /: SITE_COOKIE_TEXT\}/.test(settings) && /: COOKIE_ACCEPT_TEXT\}/.test(settings) && /: COOKIE_DECLINE_TEXT\}/.test(settings))
const cookies = THEME_SETTINGS_GROUPS.find((g) => g.id === "cookies")
const ids = (cookies?.fields ?? []).map((f) => f.id)
check("the builder's theme settings hold the same settings, the switch first", ids[0] === "cookie_banner_show" && ["cookie_banner_text", "cookie_accept_text", "cookie_decline_text", "cookie_banner_enabled"].every((id) => ids.includes(id)), ids.join(", "))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
