/**
 * ROUND 40: Storelib's legal pages, and the OnePage's own sheets and settings.
 *
 *   LEGAL      one Terms of service and one Privacy policy, at /terms and /privacy, laid out as the Help Center is
 *              (its ink band with the name and the date, contents beside the text, the spy), the text written once in
 *              components/legal and drawn by the pages and by a OnePage's sheet; /legal/* redirects there from the
 *              server, and every link points at the canonical addresses
 *   ONEPAGE    Privacy, Terms and Cookies open the text in a sheet over the page, loaded only when asked for; Share and
 *              Subscribe are the same dialog (the app's sheet on a phone, a centred card from 640px) in the page's own
 *              light or dark, one surface with nothing behind its corners
 *   SETTINGS   Your own domain has its small icon; the sections' box is the shown section's height (Billing on Pro has
 *              no empty, scrolling field); the preview asks about its products again when the creator comes back
 *   PROFILES   no Follow on a creator page or a person's profile, and no empty row where it was
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readCode } from "./_source"
import { LEGAL_DOCS, legalDate } from "@/components/legal/legal-parts"
import { TERMS_TOC, TermsBody } from "@/components/legal/terms-body"
import { PRIVACY_TOC, PrivacyBody } from "@/components/legal/privacy-body"
import { sheetTokens } from "@/components/onepage/onepage-dialog"
import { ProfileSocial } from "@/components/profile/profile-social"
import { STORELIB_PRIVACY_URL, STORELIB_TERMS_URL } from "@/lib/communities/legal-links"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readCode(p)
const root = process.cwd()

console.log("\nLegal: one text, two documents, the Help Center's layout")
{
  check("two documents, named in sentence case, at the canonical addresses", LEGAL_DOCS.terms.href === "/terms" && LEGAL_DOCS.privacy.href === "/privacy" && LEGAL_DOCS.terms.title === "Terms of service" && LEGAL_DOCS.privacy.title === "Privacy policy")
  check("a real last updated date, not today's", legalDate(LEGAL_DOCS.terms.updated) === "February 28, 2026" && legalDate(LEGAL_DOCS.privacy.updated) === "March 3, 2026")
  const terms = renderToStaticMarkup(createElement(TermsBody))
  const privacy = renderToStaticMarkup(createElement(PrivacyBody))
  check("every contents entry has its heading, terms", TERMS_TOC.length === 28 && TERMS_TOC.every((t) => terms.includes(`<h2 id="${t.id}"`)), TERMS_TOC.filter((t) => !terms.includes(`<h2 id="${t.id}"`)))
  check("every contents entry has its heading, privacy", PRIVACY_TOC.length === 21 && PRIVACY_TOC.every((t) => privacy.includes(`<h2 id="${t.id}"`)))
  check("the legal text kept its substance (spot checks)", /Storelib Inc\./.test(terms) && /Stripe Connect/.test(terms) && /legal@storelib\.com/.test(terms) && /privacy@storelib\.com/.test(privacy) && /id="cookies"/.test(privacy) && /changes every day and cannot be turned back into either/.test(privacy))
  check("no em dash and no accent violet in the text", !/—/.test(terms + privacy) && !/8b5cf6/i.test(code("components/legal/terms-body.tsx") + code("components/legal/privacy-body.tsx")))
  check("colours are --legal-* variables with Storelib's values behind them", /var\(--legal-ink,#1a1a2e\)/.test(terms) && /var\(--legal-body,#374151\)/.test(terms))

  const page = code("components/legal/legal-page.tsx")
  check("the page opens on the Help Center's ink band with the name and the date", /bg-\[#1a1a2e\]/.test(page) && /\{doc\.title\}<\/h1>/.test(page) && /Last updated <time dateTime=\{doc\.updated\}>/.test(page))
  check("contents beside the text on a wide screen and folded on a phone, with the spy", /<OnThisPage items=\{items\} variant="inline" \/>/.test(page) && /<OnThisPage items=\{items\} variant="side" \/>/.test(page) && /<TocSpy \/>/.test(page) && /data-help-body=""/.test(page))
  check("a row moves between the two documents", /aria-label="Legal documents"/.test(page) && /aria-current=\{k === kind \? "page" : undefined\}/.test(page))
  check("/terms and /privacy draw it under Storelib's header", /<LegalPage kind="terms" toc=\{TERMS_TOC\}>/.test(code("app/(storelib)/terms/page.tsx")) && /<LegalPage kind="privacy" toc=\{PRIVACY_TOC\}>/.test(code("app/(storelib)/privacy/page.tsx")) && /ConditionalHeader/.test(code("app/(storelib)/terms/layout.tsx")) && /ConditionalHeader/.test(code("app/(storelib)/privacy/layout.tsx")))
  check("/legal/terms and /legal/privacy redirect from the server", /permanentRedirect\("\/terms"\)/.test(code("app/(storelib)/(marketing)/legal/terms/page.tsx")) && /permanentRedirect\("\/privacy"\)/.test(code("app/(storelib)/(marketing)/legal/privacy/page.tsx")) && !/materia\.io/.test(code("app/(storelib)/(marketing)/legal/terms/page.tsx")))
  check("a community's fallback links are the canonical ones", STORELIB_PRIVACY_URL === "https://storelib.com/privacy" && STORELIB_TERMS_URL === "https://storelib.com/terms")
  const stale = !/storelib\.com\/legal\//.test(code("components/onepage/public-onepage.tsx") + code("lib/communities/legal-links.ts") + code("components/onepage/onepage-legal-links.tsx"))
  check("nothing links to /legal/* any more", stale)
}

console.log("\nOnePage: the legal text in a sheet, Share and Subscribe as one dialog")
{
  const live = code("components/onepage/public-onepage.tsx")
  const links = code("components/onepage/onepage-legal-links.tsx")
  /* Changed on purpose (round AS): Cookies opens the sheet's own Cookies tab (the visitor's choices), not the policy at #cookies. */
  check("the footer's links are the sheet's", /<OnePageLegalLinks dark=\{isDarkBackground\}/.test(live) && /show\("cookies"\)/.test(links) && /show\("privacy"\)/.test(links) && /show\("terms"\)/.test(links))
  /* Changed on purpose (round AS): the cookie choices and the report form come with the reader, in the same idle fetch. */
  /* Changed on purpose (round AR): the reader is fetched once the page is idle, and again on hover and the press, so a tap opens it with its text; no next/dynamic and no grey bars (tests/onepage-ar1.test.ts). */
  check("the text is fetched while idle and warmed on the press, never in the page's first script", /reading \?\?= Promise\.all\(\[import\("@\/components\/legal\/legal-reader"\)/.test(links) && /requestIdleCallback\(run/.test(links) && /onPointerDown=\{warm\}/.test(links))
  /* Changed on purpose (round AS): Report is a short form in a sheet of the page's own, sent to the team with the page's address (tests/onepage-as2.test.ts). */
  check("Report opens its own sheet with the form, not the terms", /setReportOpen\(true\)/.test(links) && /<Panels\.ReportForm /.test(links))
  const reader = code("components/legal/legal-reader.tsx")
  check("links inside the sheet stay inside it", /onKind\(m\[1\] as LegalKind, m\[2\]\)/.test(reader) && /href\.startsWith\("#"\)\) return go/.test(reader) && /window\.open\(a\.href, "_blank", "noopener"\)/.test(reader))

  const dialog = code("components/onepage/onepage-dialog.tsx")
  /* Changed on purpose (round 41): a dialog can ask for the centred card at every width (Share, as it was before round 40); the rest still get the app's sheet on a phone. */
  check("a phone gets the app's sheet, a wider window the centred card, never both", /if \(phone && !centered\) \{\s*return \(\s*<BottomSheet/.test(dialog) && /<CenteredCard /.test(dialog) && /\(max-width: 639px\)/.test(dialog))
  check("the card is one surface: its own background and radius, nothing edge to edge behind it", /overflow-hidden rounded-\[24px\] bg-\[var\(--sheet-bg\)\]/.test(dialog))
  const light = sheetTokens(false) as Record<string, string>
  const dark = sheetTokens(true) as Record<string, string>
  check("the page's light or dark, handed to the legal text too", light["--sheet-bg"] === "#ffffff" && dark["--sheet-bg"] === "#18181c" && dark["--legal-ink"] === dark["--sheet-ink"] && light["--legal-ink"] === "#1a1a2e")

  check("Share opens the new sheet in the page's light; the old card and its coloured band are gone", /<OnePageShareSheet[\s\S]{0,120}dark=\{!onLight\}/.test(live) && !/popupHeaderBackground/.test(live) && !/Share Modal - content/.test(live))
  check("Subscribe opens the new sheet; the 220px panel and its press-away listener are gone", /<OnePageSubscribeSheet[\s\S]{0,80}dark=\{!onLight\}/.test(live) && !/width: isOpen \? 220 : 44/.test(live) && !/document\.addEventListener\("pointerdown", away, true\)/.test(live))
  check("glass on a light page is still ink glass for both buttons", /const s = inkGlass \? GLASS_ON_LIGHT_BELL/.test(live) && /const s = inkGlass \? GLASS_ON_LIGHT_SHARE/.test(live))
  const share = code("components/onepage/share-sheet.tsx")
  /* Changed on purpose (round 41): Share is the card from before round 40 again (the owner asked for it back), with Copy link among the places and the Storelib card (tests/onepage-public-r41). */
  check("Share: the address with Copy, the places to send it, the way to make a page", /data-share-url=""/.test(share) && /copied \? "Copied" : "Copy link"/.test(share) && /name: "WhatsApp"/.test(share) && /<StorelibLogo size=\{40\} \/>/.test(share))
  check("  a share never leaves the editor's preview", (share.match(/isOnePagePreview\(\)/g) ?? []).length >= 2)
  const sub = code("components/onepage/subscribe-sheet.tsx")
  check("Subscribe: the same request as before", /fetch\("\/api\/subscribe"/.test(sub) && /source: "onepage", source_id: onepageId, creator_id: sellerId, origin: pageOrigin\(\)/.test(sub))
  check("  a labelled field, at 16px so a phone does not zoom, that says what went wrong", /htmlFor="onepage-subscribe-email"/.test(sub) && /text-\[16px\]/.test(sub) && /role="alert"/.test(sub))
}

console.log("\nOnePage settings")
{
  const row = code("components/onepage/settings-integrations.tsx")
  check("Your own domain has a small globe on a quiet tile", /data-settings-domain-icon=""/.test(row) && /<Globe className="h-\[17px\] w-\[17px\]" strokeWidth=\{1\.6\} \/>/.test(row))
  const pills = code("components/onepage/pill-tabs.tsx")
  const settings = code("components/onepage/tabs/settings-tab.tsx")
  check("Settings' box is the shown section's height", /<PillPanels dataPanels="settings" value=\{active\} panels=[\s\S]{0,120}fit \/>/.test(settings))
  check("  the others are laid over it and cut to it, so they add no height and no scroll", /fit && !drawn \? \{ position: "absolute", top: 0, left: 0, right: 0, maxHeight: "100%", overflow: "hidden" \}/.test(pills))
  const preview = code("components/onepage/preview-document.tsx")
  check("the preview asks about its products again when the creator comes back to the tab", /document\.addEventListener\("visibilitychange", back\)/.test(preview) && /asked\.current\.clear\(\)/.test(preview) && /\}, \[sellerId, blocks, round\]\)/.test(preview))
}

console.log("\nProfiles: no Follow")
{
  const social = code("components/profile/profile-social.tsx")
  check("the block draws no Follow", !/<FollowButton/.test(social) && !/useFollow/.test(social))
  const counts = renderToStaticMarkup(createElement(ProfileSocial, { followers: 3, following: 1 }))
  check("a person's profile keeps the counts", /data-profile-counts=""/.test(counts) && !/data-profile-actions/.test(counts) && !/<button/.test(counts))
  check("with nothing to say it draws nothing, so no gap is left", renderToStaticMarkup(createElement(ProfileSocial, { showCounts: false })) === "")
  const creator = code("app/(storelib)/(marketing)/u/[username]/page.tsx")
  check("a creator page: where they are from or nothing, and the follow graph is not read", /if \(!location\) return null/.test(creator) && !/viewerFollowsPromise|viewerFollowsCreator/.test(creator))
  check("no profile page hands Follow its props", !/viewerFollowing=\{/.test(code("components/profile/member-profile-page.tsx")) && !/viewerFollowing=\{/.test(code("components/profile/profile-hero.tsx")))
  check("Follow stays inside communities", /<FollowButton/.test(code("components/community/member/member-profile.tsx")) && existsSync(join(root, "components/profile/follow-button.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
