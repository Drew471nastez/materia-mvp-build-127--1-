/**
 * ===========================================================================
 *  THE COMMUNITY AND THE PROFILE ON A PHONE, ROUND 24
 * ===========================================================================
 * The owner: "the image post goes back smoother, its size computed with the
 * tab bar, no glitch; navigation between the community's pages direct and
 * smooth like a native app, not so much loading; /account with no hitches or
 * errors". What each fix is wired to, held here; what it does on screen is
 * measured in Chromium by scripts/check-community-return.mjs (the post and
 * the picture landing clear of the tab bar, no clip-path, never squashed).
 *
 * Run with:  npm run test:push
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { navFadeKey } from "@/components/account/account-nav-fade"
import { bezier, easeOf } from "@/components/community/member/return-morph"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const MEMBER = "app/(storelib)/(marketing)/community/[slug]/(member)"

console.log("\nGOING BACK: clear of the bars, by translate and scale")
{
  const lb = read("components/community/member/lightbox.tsx")
  const pf = read("components/community/member/post-fullscreen.tsx")
  check("the viewer's way in and way out fly a copy that crops (coverMorph), not a clip-path animation", /coverMorph\(\{ host: rootRef\.current, img: el, thumb: from, laid, way: "in"/.test(lb) && /coverMorph\(\{ host: rootRef\.current, img: el, thumb: target, laid, way: "out"/.test(lb) && !/clipPath: "inset/.test(lb))
  check("before the way out, the thumbnail is brought clear of the bars, only while the black covers the screen", /if \(thumbEl && backFrom >= 0\.98 && drag\.current\.y <= 0\) revealForReturn\(thumbEl\)/.test(lb))
  /* Round 15: the opened post is pushed in from the right and never lands on its card, so nothing is moved to meet it; the feed is put back where it was before the close moves. */
  check("and the opened post puts the feed back where it was before its close moves, never moving it to meet a card", /feedRestore\(noted\.current, window\.scrollY\)/.test(pf) && !/revealForReturn/.test(pf))
  check("the page under a layer keeps where it was moved: scroll restoration is manual while the layer is up", /window\.history\.scrollRestoration = "manual"/.test(lb) && /putBack\(\)/.test(lb))
  const ease = bezier(0.32, 0.72, 0, 1)
  check("the morph's curve starts at 0, ends at 1 and only rises", ease(0) === 0 && ease(1) === 1 && [0.1, 0.3, 0.5, 0.7, 0.9].every((t, i, a) => i === 0 || ease(t) > ease(a[i - 1])))
  check("a CSS curve is read as written", Math.abs(easeOf("cubic-bezier(0, 0, 1, 1)")(0.5) - 0.5) < 1e-3)
}

console.log("\nMOVING BETWEEN PLACES")
{
  const sf = read("components/community/member/shell-frame.tsx")
  /* Round 15: places are data now, read ahead by the place host (place-host.tsx) through the place cache, on the same rules. */
  const host = read("components/community/member/place-host.tsx")
  const cache = read("lib/communities/client/place-cache.ts")
  check("the places are read ahead again on every move, through the app's plan, Leaderboard and Members first", /void readPlacesAhead\(communityId, aheadList, \(\) => stopped\)/.test(host) && /\}, \[communityId, aheadList, shown\.key\]\)/.test(host) && /k === "leaderboard" \? 0 : k === "members" \? 1 : 2/.test(host) && /AHEAD_FRESH_MS = 4 \* 60_000/.test(cache) && /readAheadAllowed\(conn\)/.test(cache))
  check("an arrival by Back does not land like a new page, and one after a loading screen lands once", /if \(how\.history\) return/.test(host) && /if \(child\.matches\("\[data-page-title\]"\)\) continue/.test(host))
  for (const [place, title] of [["leaderboard", "Leaderboard"], ["members", "Members"], ["membership", "Membership"], ["notifications", "Notifications"]] as const) {
    const f = `${MEMBER}/${place}/loading.tsx`
    check(`${place}: its loading screen draws its title at once, never an empty column`, existsSync(join(process.cwd(), f)) && new RegExp(`<PlaceLoading title="${title}"`).test(read(f)))
  }
  check("a post opened from a notification waits at a page's height, not a list's", /<PlaceSpinner label="Loading the post" \/>/.test(read(`${MEMBER}/post/[postId]/loading.tsx`)))
  const rs = read("components/community/member/return-scroll.ts")
  check("Back keeps the post that was at the top of the screen where it was, while the feed settles", /holdAnchor\(anchor, y\)/.test(rs) && /writeAnchor\(pathRef\.current/.test(rs))
}

console.log("\nTHE FEED'S PICTURES")
{
  const card = read("components/community/member/post-card.tsx")
  const media = read("components/community/member/media.tsx")
  const feed = read("components/community/member/feed.tsx")
  const rs = read("components/community/member/return-scroll.ts")
  check("cards are not skipped off screen (the skip was 32px too tall per card and cost more than it saved)", !/\[content-visibility:auto\]/.test(card) && !/containIntrinsicSize/.test(card))
  /* Changed on purpose (the owner: no blur, no fade): there is no blurred copy to take away. */
  check("no blurred copy and no fade under a picture", !/data-soft-blur/.test(media) && /* Changed on purpose (round 33): a video's still at 16px is drawn blurred under it (the owner: never a grey slab); that is the one blur, and a picture (SoftImg) has none. */ (media.match(/blur-\[/g) ?? []).length === 1 && /export function VideoBlur[\s\S]{0,400}blur-\[10px\]/.test(media) && !/blur-\[/.test(media.slice(media.indexOf("export function SoftImg"), media.indexOf("export function fileSize"))) && /el\.decode\(\)\.then\(show, show\)/.test(media) && /* Changed on purpose (round 29): a video's first frame and an opened post's poster fade in (the owner asked for it); a picture (SoftImg) still never fades. */ !/transition-opacity ease-out/.test(media.slice(media.indexOf("export function SoftImg"), media.indexOf("export function fileSize"))))
  check("the first two cards ask for their pictures at once and first", /priority=\{i < 2\}/.test(feed) && /eager=\{priority\}\s*fetchPriority=\{priority \? "high" : undefined\}/.test(media.slice(media.indexOf("function CardPictureImg"))))
  check("the scroll's place is noted when it rests, not written to storage on every frame", /timer = window\.setTimeout\(flush, 150\)/.test(rs) && !/requestAnimationFrame\(\(\) => \{\s*frame = 0\s*write\(/.test(rs))
}

console.log("\n/account")
{
  check("the profile's two pills are one page: a pill press does not rebuild the cover and the avatar", navFadeKey("/account") === navFadeKey("/account/communities") && navFadeKey("/account") !== navFadeKey("/account/settings"))
  const chrome = read("components/account/account-community-chrome.tsx")
  check("a community the member has left lets go of the white bar and ends the context", /r\.status === 404 \|\| r\.status === 403/.test(chrome) && /endCommunityContext\(\)/.test(chrome) && /if \(!readCommunityChrome\(slug\)\) clearPending\(\)/.test(chrome))
  check("the white bar is let go on every route change, never before hydration", /\[active, ctx\.slug, topBar, hydrated, pathname\]/.test(chrome) && /if \(!hydrated\) return/.test(chrome))
  const sub = read("components/account/settings-subpage.tsx")
  check("Settings opened from the profile's copy keeps a creator's flags, and is filled in once the whole read lands", /isSeller: base\?\.isSeller \?\? false/.test(sub) && /complete: false \}/.test(sub) && /key=\{full \? "full" : "seed"\}/.test(sub))
  check("a sheet reopened while the last slides out is not closed by the last one's timer", /setOpen\(\(cur\) => \(cur\?\.id === id \? null : cur\)\)/.test(sub))
  check("/account has its own error boundary, so a throw keeps the header and the tab bar", existsSync(join(process.cwd(), "app/(storelib)/account/error.tsx")))
  const bar = read("components/account/save-bar.tsx")
  check("the docked save bar's padding opens with its row, never in one jump", /data-account-save-track=""/.test(bar) && !/paddingTop: docked \? \(shown \? 8 : 0\)/.test(bar))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
