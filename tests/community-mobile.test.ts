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
const MEMBER = "app/(marketing)/community/[slug]/(member)"

console.log("\nGOING BACK: clear of the bars, by translate and scale")
{
  const lb = read("components/community/member/lightbox.tsx")
  const pf = read("components/community/member/post-fullscreen.tsx")
  check("the viewer's way in and way out fly a copy that crops (coverMorph), not a clip-path animation", /coverMorph\(\{ host: rootRef\.current, img: el, thumb: from, laid, way: "in"/.test(lb) && /coverMorph\(\{ host: rootRef\.current, img: el, thumb: target, laid, way: "out"/.test(lb) && !/clipPath: "inset/.test(lb))
  check("before the way out, the thumbnail is brought clear of the bars, only while the black covers the screen", /if \(thumbEl && backFrom >= 0\.98 && drag\.current\.y <= 0\) revealForReturn\(thumbEl\)/.test(lb))
  check("and the opened post does the same for its card, only when not pulled", /if \(dy <= 0\) revealForReturn\(origin\?\.\(\)\)/.test(pf))
  check("the page under a layer keeps where it was moved: scroll restoration is manual while the layer is up", /window\.history\.scrollRestoration = "manual"/.test(lb) && /putBack\(\)/.test(lb))
  const ease = bezier(0.32, 0.72, 0, 1)
  check("the morph's curve starts at 0, ends at 1 and only rises", ease(0) === 0 && ease(1) === 1 && [0.1, 0.3, 0.5, 0.7, 0.9].every((t, i, a) => i === 0 || ease(t) > ease(a[i - 1])))
  check("a CSS curve is read as written", Math.abs(easeOf("cubic-bezier(0, 0, 1, 1)")(0.5) - 0.5) < 1e-3)
}

console.log("\nMOVING BETWEEN PLACES")
{
  const sf = read("components/community/member/shell-frame.tsx")
  check("the places are read ahead again on every move, through the app's plan, Leaderboard and Members first", /prefetchOnIdle\(router, ordered\.filter\(\(h\) => h !== here\)\)/.test(sf) && /\[ordered, router, pathname\]/.test(sf) && /leaderboard\$\/\.test\(h\) \? 0/.test(sf))
  check("an arrival by Back does not land like a new page, and one after a loading screen lands once", /arrivedByBack\(\)/.test(sf) && /n\.style\.animation = "none"/.test(sf) && /child\.matches\("\[data-page-title\]"\)/.test(sf))
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
  check("the blurred copy goes once a picture has faded in", /setState\(\(s\) => \(s === "in" \? "cached" : s\)\), FADE_MS \+ 40\)/.test(media))
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
  check("/account has its own error boundary, so a throw keeps the header and the tab bar", existsSync(join(process.cwd(), "app/account/error.tsx")))
  const bar = read("components/account/save-bar.tsx")
  check("the docked save bar's padding opens with its row, never in one jump", /data-account-save-track=""/.test(bar) && !/paddingTop: docked \? \(shown \? 8 : 0\)/.test(bar))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
