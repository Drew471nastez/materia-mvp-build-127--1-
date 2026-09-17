/**
 * ===========================================================================
 *  A PAGE YOU ARE COMING BACK TO DOES NOT PLAY ITSELF IN AGAIN
 * ===========================================================================
 * "There's still a flash when I go back from the product page" survived three
 * rounds of fixing the navigation, because the navigation was never the
 * problem. Measured on production, going back is free: no document request on
 * the main frame, and the scroll comes back to the pixel it left from.
 *
 * What was left was one animation. Sampling document.getAnimations() twenty
 * times a second for two and a half seconds after a back navigation returned
 * exactly one entrance animation on the whole document:
 *
 *     52ms .. 302ms   running   `enter` — animate-in fade-in, 300ms
 *    352ms .. 2560ms  finished  (animate-in fills both, so it lingers)
 *
 * on the creator's avatar. An entrance animation runs on every MOUNT, and a
 * back navigation mounts the listing again, so the picture already on screen
 * faded itself in from nothing on every single return.
 *
 * The fade is not deleted, because it is right for the case it was written
 * for: a cold load slow enough that Radix has painted the initials, where the
 * swap to the photo is a snap. It is now conditional on exactly that.
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
const avatar = read("components/ui/avatar.tsx")
const renderer = read("components/store-builder/unified-section-renderer.tsx")
const probe = read("scripts/check-back-flash.mjs")

function main() {
  console.log("\nComing back does not replay the page")

  /* ---------------------------------------------------------------------
     THE FADE IS CONDITIONAL, AND ON THE RIGHT CONDITION
     --------------------------------------------------------------------- */
  console.log("\n  the avatar's fade")

  check(
    "the fade exists in exactly one place",
    (avatar.match(/animate-in fade-in duration-300 ease-sheet/g) || []).length === 1,
  )
  check(
    "and it is gated, not unconditional",
    /initialsWereShown && "animate-in fade-in duration-300 ease-sheet"/.test(avatar),
    "an ungated entrance animation replays on every back navigation",
  )
  check(
    "no call site hardcodes it any more",
    !/animate-in fade-in duration-300 ease-sheet/.test(renderer),
  )
  check(
    "the creator page's avatar opts in by name",
    /crossFadeFromFallback\s*\n?\s*\/>/.test(renderer) || /crossFadeFromFallback$/m.test(renderer),
  )
  check("and it is off unless asked for", /crossFadeFromFallback = false/.test(avatar))

  /*
    THE CONDITION IS THE FALLBACK'S OWN DELAY, SHARED RATHER THAN RETYPED.
    A cross-fade is worth playing when there is something to cross-fade out
    of, which is true exactly when the picture arrived later than the moment
    the initials get painted. Two copies of 600 is two chances to disagree.
  */
  check("one number decides both halves", /const FALLBACK_DELAY_MS = 600/.test(avatar))
  check("the fallback reads it", /delayMs = FALLBACK_DELAY_MS/.test(avatar))
  check(
    "and the fade decision reads it too",
    /if \(!loaded\.current\) setInitialsWereShown\(true\)\s*\n\s*\}, FALLBACK_DELAY_MS\)/.test(avatar),
  )
  check("no stray 600 left behind", !/delayMs = 600/.test(avatar))

  /*
    A REF, NOT STATE. Radix reports its loading status from an effect, which
    runs after the render that mounts the <img>. State would put the class on
    one frame late: the photo paints solid, then drops to zero and fades. That
    is a worse flash than the one being removed.
  */
  check("the loaded flag is a ref", /const loaded = React\.useRef\(false\)/.test(avatar))
  check(
    "written the moment Radix reports either outcome",
    /if \(status === "loaded" \|\| status === "error"\) loaded\.current = true/.test(avatar),
  )
  check(
    "and a caller's own handler still runs",
    /onLoadingStatusChange\?\.\(status\)/.test(avatar),
  )

  /* ---------------------------------------------------------------------
     THE PROBE CANNOT REPORT A FLASH IT DID NOT FILM
     --------------------------------------------------------------------- */
  console.log("\n  the probe grades the right journey")

  /*
    One run of it measured 255.0 luminance in every band and that looked like
    the finding. The tap had missed, so `history.back()` went back to the
    about:blank the browser started on: a white page, scroll 0, no document
    request, every number self-consistent and every one about a journey
    nobody takes. It asserts now.
  */
  check(
    "it checks the product page was actually opened",
    /const landedOn = await evaluate\(`location\.pathname`\)/.test(probe) &&
      /if \(landedOn !== target\.href\)/.test(probe),
    "filming a back out of about:blank reads as a perfect white flash",
  )
  check(
    "and it says so instead of filming anyway",
    /fail\(`The tap did not open the product page/.test(probe),
  )
  /* The two answers that decide whether the back was free at all. */
  check("it counts main-frame document requests", /mainFrameDocumentRequests: mainDocs\.length/.test(probe))
  check("it compares the scroll it left with the one it landed on", /restoredExactly: leftAt === landedAt/.test(probe))
  check(
    "it reads the whole frame, not only the header",
    /A flash lower down the page/.test(probe),
  )
  check(
    "and it lists what is moving, not just that something moved",
    /document\.getAnimations\(\)/.test(probe),
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
