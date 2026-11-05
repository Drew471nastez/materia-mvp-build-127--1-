/**
 * ===========================================================================
 *  THE ACCOUNT, ROUND 11
 * ===========================================================================
 * What the owner asked of /account and its Settings this round, read from
 * the source (the browser measures are scripts/check-account-round11.mjs
 * and scripts/check-follow-button.mjs):
 *
 *   PHOTO     no crop sheet: a chosen photo goes straight up
 *   BACK      Settings' back is the shared BackControl, and /account is
 *             read ahead when Settings opens
 *   SIZES     the cover about six percent taller, the photo about six
 *             percent bigger
 *   SAVE      Save changes is a bar of its own at the foot of the screen,
 *             above the phone tab bar, the page padded for it
 *   WARM      the Settings pill and Edit profile are read ahead from the
 *             profile, and on a press
 *
 * Run with:  npm run test:push
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { PROFILE_COVER_HEIGHTS } from "../lib/profile/cover"
import { PHOTO_SIDE, centreSquare } from "../lib/profile/photo-square"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

console.log("\n1. A chosen photo goes straight up")
{
  const photo = code("components/account/account-photo.tsx")
  check("the crop sheet is gone, and nothing imports it", !existsSync(join(process.cwd(), "components/account/photo-crop.tsx")) && !/photo-crop|PhotoCropSheet|setPlacing/.test(photo))
  check("chosen: the file in the circle at once, the ring at its start, then the square cut and uploaded", /showPreview\(URL\.createObjectURL\(file\)\)\s*setBusy\("upload"\)\s*setProgress\(0\)/.test(photo) && /blob = await squareJpeg\(file\)/.test(photo) && /uploadWithProgress\("avatars", path, blob/.test(photo))
  check("the middle square, at no more than 512px", PHOTO_SIDE === 512 && JSON.stringify(centreSquare(1200, 800)) === '{"sx":200,"sy":0,"side":800}' && JSON.stringify(centreSquare(500, 500)) === '{"sx":0,"sy":0,"side":500}')
  check("a picture that cannot be read takes the preview back and says so", /showPreview\(null\)[\s\S]{0,120}That picture could not be read/.test(photo))
}

console.log("\n2. Settings' back")
{
  const s = code("components/account/account-settings.tsx")
  check("it is the shared BackControl, back to the profile", /<BackControl fallback=\{BACK_TO\}/.test(s) && /const BACK_TO = "\/account"/.test(s))
  check("the way back is read ahead once Settings is idle, as the device allows", /useEffect\(\(\) => prefetchOnIdle\(router, \[BACK_TO\]\), \[router\]\)/.test(s))
  check("  and read at once when a finger lands with nothing of ours behind", /onPointerDownCapture=\{\(\) => \{\s*if \(!canReturnInApp\(\)\) prefetchHref\(router, BACK_TO, "press"\)/.test(s))
  check("the back control's own files are not this page's to change", /data-back-control=""/.test(read("components/navigation/back-control.tsx")))
}

console.log("\n3. The cover and the photo, a little bigger")
{
  const hero = read("components/profile/profile-hero.tsx")
  check("the cover 157 / 233 / 264 (148 / 220 / 294 plus about six percent)", PROFILE_COVER_HEIGHTS.phone === 157 && PROFILE_COVER_HEIGHTS.sm === 233 && PROFILE_COVER_HEIGHTS.lg === 264 && /h-\[157px\] sm:h-\[233px\] lg:h-\[264px\]/.test(hero))
  check("the photo 125 / 142 (118 / 134 plus about six percent), half over the band's edge", /PROFILE_AVATAR_PX = \{ phone: 125, wide: 142 \}/.test(hero) && /h-\[125px\] w-\[125px\]/.test(hero) && /sm:h-\[142px\] sm:w-\[142px\]/.test(hero) && /-mt-\[62\.5px\]/.test(hero) && /sm:-mt-\[71px\]/.test(hero))
  /* Round 12: /@handle is the creator page's template, so its loading is the creator page's (the page's colour) plus its top bar; the hero sizes are /account's. */
  check("the profile's loading shape is the creator page's: the ground and the top bar, nothing guessed", /PERSON_CHROME\.pageBackground/.test(read("app/(storelib)/(marketing)/member/[username]/loading.tsx")) && /<div className="h-14" \/>/.test(read("app/(storelib)/(marketing)/member/[username]/loading.tsx")))
}

console.log("\n5. Save changes, a bar of its own")
{
  const bar = code("components/account/save-bar.tsx")
  const s = code("components/account/account-settings.tsx")
  check("the profile's card has no Save button of its own; the bar is shown while there is something to save", !/className=\{INK\} data-account-save=""/.test(s) && /<SaveBar\s+shown=\{changed \|\| busy\}/.test(s) && /onDiscard=\{discard\}/.test(s))
  check("Discard puts every field back", /const discard = \(\) => \{\s*setName\(savedName\)\s*setBio\(savedBio\)\s*setHandle\(savedHandle\)/.test(s))
  check("the join bar's surface: fixed to the foot on the settings page, or docked in the edit-profile sheet", /fixed inset-x-0 bottom-0 z-40 border-t border-\[#e5e7eb\] bg-white/.test(bar) && /createPortal\(/.test(bar) && /data-sheet-save-dock/.test(bar) && /document\.body/.test(bar))
  check("its white runs on under the phone's tab bar; wider up it ends above the home indicator", /pb-\[calc\(12px\+var\(--buyer-tabs-room\)\)\] md:pb-\[calc\(12px\+env\(safe-area-inset-bottom,0px\)\)\]/.test(bar))
  check("it rises and falls on translate alone, on the tab bar's curve, and follows the tab bar down while it is away", /const EASE = "cubic-bezier\(0\.32, 0\.72, 0, 1\)"/.test(bar) && /`translate \$\{SAVE_BAR_MS\}ms \$\{EASE\}/.test(bar) && /phone && !tabs \? "0 var\(--buyer-tabs-bar\)" : "0 0"/.test(bar) && /attributeFilter: \["data-buyer-tabs"\]/.test(bar))
  check("away, it is inert and hidden from a screen reader", /inert=\{!shown\}/.test(bar) && /aria-hidden=\{!shown \|\| undefined\}/.test(bar))
  check("the full settings page is padded by what the bar covers above the tab bar's own room; the sheet does not pad", /target\.style\.paddingBottom = `\$\{Math\.max\(0, el\.offsetHeight - under\)\}px`/.test(bar) && /\[data-buyer-tabs-room\]/.test(bar) && /settingsSheetOpen\(\)/.test(bar))
  check("rising over the field being typed in, the page moves that field into the clear", /field\.getBoundingClientRect\(\)\.bottom \+ 12 - top/.test(bar) && /scrollBy\(\{ top: over/.test(bar))
  check("reduced motion: no slide", /motion-reduce:transition-none!/.test(bar))
}

console.log("\n6. Profile to Settings, warm")
{
  const pills = code("components/profile/profile-owner-pills.tsx")
  check("from the profile, Settings (the pill and Edit profile's address) is read ahead once the page is idle", /prefetchOnIdle\(router, ahead\.split\(" "\)\)/.test(pills) && /p\.key === "settings" && p\.key !== fromPath/.test(pills) && /EDIT_PROFILE_HREF/.test(pills))
  /* Round 15: each pill is its own component that decides on the lift (first tap); the read ahead moved to its press handler, still on the finger landing. */
  check("  and a finger on a pill reads its page at once", /onDown=\{\(\) => \{\s*if \(p\.key !== fromPath\) prefetchHref\(router, p\.href, "press"\)/.test(pills) && /onPointerDown=\{\(e\) => \{\s*(if \(e\.button === 0 && !on( && e\.pointerType === "mouse")?\) pressPill\(e\.currentTarget\)\s*)?tap\.onPointerDown\(e\)\s*onDown\(\)/.test(pills))
  check("Settings and /account still have no loading screen of their own (no skeleton flash, the sign in redirect decided first)", !existsSync(join(process.cwd(), "app/(storelib)/account/settings/loading.tsx")) && !existsSync(join(process.cwd(), "app/(storelib)/account/loading.tsx")))
}

console.log("\nThe copy")
{
  const files = ["components/account/save-bar.tsx", "components/account/account-photo.tsx", "components/account/account-settings.tsx", "components/profile/follow-button.tsx", "components/profile/profile-owner-pills.tsx", "components/profile/profile-hero.tsx", "lib/profile/photo-square.ts", "lib/profile/cover.ts"]
  const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|transform/i
  for (const f of files) check(`${f}: no em dashes, none of the banned words`, !banned.test(read(f)), (read(f).match(banned) || [])[0])
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
