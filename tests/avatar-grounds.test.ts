/**
 * ===========================================================================
 *  AN AVATAR ON A DARK BAR DOES NOT FLASH A WHITE DISC
 * ===========================================================================
 * This is the third bar to report the same thing, in the same words — the
 * circle flashes, sits empty, then the picture pops — so it is written down
 * rather than fixed a fourth time from scratch.
 *
 * Measured on the live subscribe bar, its small avatar reported both faults
 * at once:
 *
 *     ground      rgb(233, 233, 234)      a near-WHITE disc
 *     src         ...1788786737198.webp   the raw upload, not /_next/image
 *     natural     384 x 512               decoded to fill 24 CSS pixels
 *
 * THE GROUND. Avatar's shared default is `bg-muted`, and it is light on
 * purpose: it exists so a circle is never a hole on a white page. On a bar
 * the creator has made near-black it is a bright disc that paints first, and
 * because Radix holds the initials back for 600ms that disc is ALL there is
 * until the photo decodes. That is the flash and the emptiness together.
 *
 * THE PICTURE. A 384x512 original fetched and decoded whole to fill a 24px
 * circle is the pop at the end. Asked for at the size it is shown at it is
 * roughly twenty kilobytes of AVIF, lands inside a frame or two, and the
 * 600ms delay then means the initials never appear at all.
 *
 * The page's big profile avatar was already doing both. Only the bars were
 * not.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

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

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const subscribe = read("components/store-builder/subscribe-bar.tsx")
const productBar = read("components/store-builder/product-creator-bar.tsx")

/** Every <Avatar> opening tag in a file, with its className. */
function avatars(src: string): string[] {
  return src.match(/<Avatar\s+className=(?:"[^"]*"|\{[^}]*\})/g) ?? []
}

function main() {
  console.log("\nAvatars on a bar carry the bar's own ground")

  /* ---------------------------------------------------------------------
     THE SUBSCRIBE BAR
     --------------------------------------------------------------------- */
  console.log("\n  the subscribe bar")

  const subAvatars = avatars(subscribe)
  /*
    FIVE, NOT THREE. An earlier pass fixed the three it had read and this
    assertion found two more in the editor component's stacked layouts — still
    on the light ground, still handed the raw upload. Counting them is the
    point of the check: fixing the ones you happened to look at is how this
    became a third round.
  */
  check("it has the five avatars this file draws", subAvatars.length === 5, `found ${subAvatars.length}`)
  check(
    "and not one of them is left on the shared light ground",
    subAvatars.every((a) => /avatarGround/.test(a)),
    subAvatars.filter((a) => !/avatarGround/.test(a)).join(" | "),
  )
  /*
    THE GROUND FOLLOWS THE BAR. This bar's colour is the creator's to choose,
    so a hardcoded dark ground would be the same bug upside down on a white
    bar. Both components derive it from the colour they are actually painting.
  */
  const grounds = subscribe.match(/const avatarGround = isDarkBackground \? "bg-white\/10" : "bg-black\/\[0\.06\]"/g) ?? []
  check("both components derive it from their own background", grounds.length === 2, `found ${grounds.length}`)
  check(
    "the fallback sits on the same ground as the circle",
    (subscribe.match(/<AvatarFallback [^>]*className=\{cn\([^)]*avatarGround\)\}/g) ?? []).length === 5,
    "an initials chip on a different ground is the flash with letters on it",
  )
  /*
    ═══════════════════════════════════════════════════════════════════════
     AND WITH NO PICTURE THERE IS NOTHING TO WAIT FOR
    ═══════════════════════════════════════════════════════════════════════
    CHANGED ON PURPOSE, and it is the other half of the same report. The
    600ms exists so a cached photo never flashes initials first. When the
    creator has no photo at all there is no photo to beat, so those 600ms
    were 600ms of the bare ground on every single load: "sometimes the
    avatar is empty". The wait is kept exactly as it was whenever a picture
    is coming, and skipped when none is.

    What the fallback holds is the shared mark (components/app/app-avatar),
    so a creator with no display name gets a plain person. It was built from
    `... || "?"`, which drew a question mark at them.
  */
  check(
    "with no picture the initials paint at once instead of 600ms of bare ground",
    (subscribe.match(/delayMs=\{settings\.avatarUrl \? undefined : 0\}/g) ?? []).length === 5,
  )
  check(
    "and what they paint is the shared mark, never a \"?\"",
    (subscribe.match(/<AvatarMark name=\{\(settings\.creatorName \|\| ""\)\.trim\(\)\} size=\{(?:24|32)\} \/>/g) ?? []).length === 5
      && !/\|\| "\?"/.test(subscribe),
  )

  /* THE PICTURE, AT THE SIZE IT IS SHOWN AT. */
  check(
    "no avatar is handed the raw upload",
    !/<AvatarImage src=\{settings\.avatarUrl\}/.test(subscribe),
    "a 384x512 original decoded into a 24px circle is the pop",
  )
  check(
    "all five ask for it at their own size",
    (subscribe.match(/optimizedImageUrl\(settings\.avatarUrl, (?:24|32)\)/g) ?? []).length === 5,
  )
  /* 24px and 32px circles, so the request must match, not be one number
     copied to all three. */
  check("the 24px circles ask for 24", (subscribe.match(/optimizedImageUrl\(settings\.avatarUrl, 24\)/g) ?? []).length === 3)
  check("and the 32px ones ask for 32", (subscribe.match(/optimizedImageUrl\(settings\.avatarUrl, 32\)/g) ?? []).length === 2)

  /* ---------------------------------------------------------------------
     AND THE PRODUCT PAGE'S BAR, WHICH WAS THE ROUND BEFORE
     --------------------------------------------------------------------- */
  console.log("\n  the product page's creator bar keeps its fix")

  check(
    "its avatar has a dark ground",
    /<Avatar className="h-8 w-8 shrink-0 bg-white\/10">/.test(productBar),
  )
  /*
    AND SO DO THE OTHER THREE IN THE FILE, which is the round after this one.
    Measured in a browser (scripts/check-avatars.mjs): the phone bar's 36px
    circle was `bg-muted`, a 242,242,242 disc, and the bar's own white text
    inherited into it. White on near white is 1.12:1, which is to say the
    creator's initials were not there at all. The ground is derived from the
    colour being painted now, the same one line the subscribe bar uses.
  */
  check(
    "and so do the other three, from the same one line",
    /const avatarGround = isDarkBackground \? "bg-white\/10" : "bg-black\/\[0\.06\]"/.test(productBar)
      && (productBar.match(/<Avatar className=\{cn\([^)]*avatarGround\)\}/g) ?? []).length === 3
      && (productBar.match(/<AvatarFallback [^>]*className=\{cn\([^)]*avatarGround\)\}/g) ?? []).length === 3,
  )
  /* The delay attribute comes first now (see the note above); the ground is the check. */
  check("and its fallback matches", /<AvatarFallback [^>]*className="bg-white\/10 text-\[10px\]">/.test(productBar))
  check(
    "its four avatars all hold the shared mark and none waits with no picture",
    (productBar.match(/<AvatarMark name=\{\(creatorName \|\| ""\)\.trim\(\)\}/g) ?? []).length === 4
      && (productBar.match(/delayMs=\{avatarUrl \? undefined : 0\}/g) ?? []).length === 4,
  )
  check(
    "it asks for the picture at the size it draws it, at every one of its four avatars",
    (productBar.match(/optimizedImageUrl\(avatarUrl, 48\)/g) ?? []).length === 4 && !/<AvatarImage src=\{avatarUrl\}/.test(productBar),
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
