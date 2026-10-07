/**
 * ===========================================================================
 *  ONE RULE FOR EVERY FACE STORELIB DRAWS
 * ===========================================================================
 * The owner, about a review whose author had signed out:
 *
 *   "he doesn't have an account image at all, an avatar thing, but it still
 *    needs to display something as initials or something ... Also sometimes
 *    the avatar is empty, fully fix it so it's not, if the user is unknown."
 *
 * So, everywhere a person is drawn:
 *
 *   A PHOTO when there is one, through components/app/app-avatar so any host
 *   loads and a broken one falls back on its own.
 *   THE INITIALS of their name when there is no photo.
 *   A PLAIN PERSON when there is no name either. Never a "?", which is a
 *   thing drawn AT somebody, and never an empty circle.
 *
 * This suite is the guard on that. The first part is a scan of every page and
 * component in the repository, because the "?" came back twice by being
 * written somewhere nobody was looking. The rest names the surfaces that were
 * found carrying it, so a revert is loud.
 *
 * What it looks like on three themes and two widths is measured, not asserted
 * here: scripts/check-avatars.mjs.
 */
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { readCode, readSource } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? ` — ${detail}` : ""))
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

function tsxUnder(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) tsxUnder(full, out)
    else if (name.endsWith(".tsx")) out.push(full)
  }
  return out
}

console.log("\nNo face is a question mark")

/*
  ───────────────────────────────────────────────────────────────────────────
   THE WHOLE TREE
  ───────────────────────────────────────────────────────────────────────────
  `|| "?"` and `?? "?"` say one thing and one thing only: "I have nothing to
  draw, so here is a question mark." There were fourteen of them across the
  storefront, the explore pages, the nav, the library, the admin console and
  the OnePage editor. Read with comments stripped (tests/_source), so the
  notes explaining the old bug cannot satisfy the check.
*/
{
  const offenders: string[] = []
  for (const file of tsxUnder("app").concat(tsxUnder("components"))) {
    const src = readCode(file)
    for (const line of src.split("\n")) {
      if (/(\|\||\?\?)\s*"\?"/.test(line)) offenders.push(`${file}: ${line.trim().slice(0, 90)}`)
    }
  }
  check("nothing in app/ or components/ falls back to a question mark", offenders.length === 0, offenders.join("\n          "))
}

/*
  ───────────────────────────────────────────────────────────────────────────
   AND NO NAME MEANS A PERSON, NOT NOTHING
  ───────────────────────────────────────────────────────────────────────────
*/
{
  const avatar = readCode("components/app/app-avatar.tsx")
  check(
    /* Round 10: "Without a photo, never bare initials: a clean default avatar". A person is the default face; a mark (a community) keeps its letters. */
    "the shared avatar draws the default face for a person, and letters only for a mark",
    /if \(!words\.length\) return ""/.test(avatar) && /export function AvatarMark/.test(avatar) && /export function DefaultAvatarGlyph/.test(avatar) && /viewBox="0 0 64 64"/.test(avatar) && /const initials = kind === "mark" \? initialsOf\(name\) : ""/.test(avatar),
  )
  check(
    "it never waits more than BLANK_LIMIT_MS with the circle blank",
    /const BLANK_LIMIT_MS = 600/.test(avatar)
      && /setTimeout\(\(\) => setWaited\(true\), BLANK_LIMIT_MS\)/.test(avatar)
      && /\{!photo \|\| \(!loaded && \(markWhileLoading \|\| waited \|\| who === "person"\)\) \? \(\s*who === "person" \|\| !initialsOf\(name\) \? <DefaultAvatarGlyph fill \/> : <AvatarMark/.test(avatar),
    "a host that never answers left a hole where a face goes",
  )
  check(
    "a page in somebody else's colours gets a circle mixed from its own text",
    /theme: "bg-foreground\/\[0\.10\] text-foreground"/.test(avatar),
  )
}

/*
  ───────────────────────────────────────────────────────────────────────────
   EVERY SURFACE THAT WAS CARRYING A "?" OR AN EMPTY CIRCLE
  ───────────────────────────────────────────────────────────────────────────
  Named one by one, because a list is what makes the next sweep a diff rather
  than another search.
*/
{
  /** Moved onto <AppAvatar> outright: no behaviour of their own to keep. */
  const moved: Array<[string, number]> = [
    ["components/explore/creator-card.tsx", 1],
    ["components/marketing/user-nav.tsx", 1],
    ["components/marketing/user-nav-client.tsx", 1],
    /* 4: the computer's photo became a link to /account, so the menu that drew it a second time is gone.
       5 (round 12, 69.webp): the menu a community's "..." opens shows the real picture beside the name again, as the phone's sheet does. */
    ["components/platform/platform-header-client.tsx", 5],
    ["components/store-builder/sticky-desktop-creator-bar.tsx", 1],
    ["app/(marketing)/p/[slug]/page.tsx", 2],
    ["app/(marketing)/u/[username]/page.tsx", 1],
    /* The library no longer draws the buyer's own face (that is /account).
       A product row draws the seller once. The library home draws them once
       too, in the one list both sizes use, not again as pills and a strip. */
    ["components/library/product-row.tsx", 1],
    ["components/library/library-home.tsx", 1],
    ["components/library/library-product.tsx", 2],
    /* The phone's search screen drew a creator found by name here. Round 9
       made it the header's search (products and communities, drawn by
       components/platform/header-search-results), so it draws no faces. */
    ["app/admin/blog/seo/_seo-client.tsx", 1],
  ]
  for (const [file, n] of moved) {
    const src = readCode(file)
    const count = (src.match(/<AppAvatar\b/g) ?? []).length
    check(
      `${file}: ${n === 1 ? "its avatar is" : `all ${n} avatars are`} the shared one`,
      count === n && !/<AvatarFallback/.test(src) && !/<AvatarImage/.test(src),
      `${count} found`,
    )
  }

  /*
    KEPT ON RADIX, and on purpose. These four carry machinery the rest do not:
    the picture is swapped only once the replacement has decoded, and the
    fallback is held back for 600ms so a cached photo never flashes initials
    first (components/ui/avatar, tests/page-performance, tests/back-no-replay).
    What changed is what the fallback HOLDS, and that it no longer waits when
    there is no picture on the way at all.
  */
  const radix: Array<[string, number]> = [
    ["components/store-builder/subscribe-bar.tsx", 5],
    ["components/store-builder/product-creator-bar.tsx", 4],
    ["components/store-builder/unified-section-renderer.tsx", 1],
    ["components/onepage/public-onepage.tsx", 1],
  ]
  for (const [file, n] of radix) {
    const src = readCode(file)
    const fallbacks = (src.match(/<AvatarFallback\b/g) ?? []).length
    const delayed = (src.match(/delayMs=\{[^}]*\? undefined : 0\}/g) ?? []).length
    check(
      `${file}: its ${n === 1 ? "fallback holds the shared mark and does not wait" : `${n} fallbacks hold the shared mark and do not wait`} with no picture`,
      fallbacks === n && delayed === n,
      `${fallbacks} fallbacks, ${delayed} with the wait skipped`,
    )
  }

  /* The creator page's header: its ground followed a hardcoded grey whatever colour the page was. */
  const header = readCode("components/store-builder/unified-section-renderer.tsx")
  check(
    "the creator page's header circle takes the colour the header is written in",
    /backgroundColor: `\$\{headingColor\}1f`, color: headingColor/.test(header) && !/bg-gray-300 text-gray-700/.test(header),
  )

  /* The OnePage editor's previews drew the page's first letter, or a "?" for an untitled page. */
  for (const file of [
    "components/onepage/profile-section.tsx",
    "components/onepage/sections/profile-section.tsx",
    "components/onepage/onepage-editor.tsx",
    "components/onepage/tabs/design-tab.tsx",
    "components/onepage/tabs/links-tab.tsx",
    "components/onepage/onboarding-modal.tsx",
    "components/app/creator-onboarding-modal.tsx",
  ]) {
    const src = readCode(file)
    check(`${file}: an untitled page is a person, not a letterless box`, /<AvatarMark /.test(src))
  }
}

/*
  ───────────────────────────────────────────────────────────────────────────
   THE /APP SHELL KEEPS ITS OWN RULE
  ───────────────────────────────────────────────────────────────────────────
  "When the user profile avatar loads, it first shows the initials and then
  the image loads abruptly. That way is cheap." The shell's avatars are the
  viewer's own, cached, and they must not draw the letters from the first
  frame. BLANK_LIMIT_MS still covers them for a host that hangs.
*/
{
  const shell =
    readCode("components/app/sidebar.tsx") +
    readCode("components/app/mobile-account-menu.tsx") +
    readCode("components/app/business-switcher.tsx") +
    readCode("components/app/shell-header-still.tsx")
  check("no avatar in the /app shell draws its mark from the first frame", !/markWhileLoading/.test(shell))
  {
    const mark = readCode("components/community/member/community-mark.tsx")
    const nav = readCode("components/nav/place-navigator.tsx")
    check("a community's mark and the navigator's rows never show initials first, and their pictures are decoded once the list is here", !/markWhileLoading/.test(mark) && !/markWhileLoading/.test(nav) && /preloadAvatar\(r\.item\.imageUrl, 40\)/.test(nav))
  }
}

/*
  ───────────────────────────────────────────────────────────────────────────
   AND THE GUEST FORM DOES NOT PROMISE A NAME IT MAY NOT HAVE
  ───────────────────────────────────────────────────────────────────────────
  "Shown with your first name as a verified purchase" sat under a form whose
  review would go out as "Verified buyer" whenever the order carried no name.
*/
{
  const form = readSource("components/reviews/review-form.tsx")
  check(
    "the guest review form says which of the two it will be",
    /\(reviewerName \?\? ""\)\.trim\(\)\s*\n?\s*\? "Shown with your first name as a verified purchase\."\s*\n?\s*: "Shown as a verified purchase\."/.test(form),
  )
}

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`  failing:\n    ${failures.join("\n    ")}`)
  process.exit(1)
}
