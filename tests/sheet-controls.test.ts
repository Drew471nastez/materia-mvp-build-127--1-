/**
 * ===========================================================================
 *  A CONTROL INSIDE A SHEET, AND THE SHEET ITSELF, WANT THE SAME FINGER
 * ===========================================================================
 * The bottom sheet arbitrates every touch between two things: scroll the form
 * or pull the sheet down. Those were the only two things a finger could mean,
 * and they are not. The reorder list is dragged by a grip on each row and the
 * cover is placed by dragging the picture, and both live inside the scroller
 * — so a downward drag with the scroller at its top read as "close me", and
 * reordering a product or positioning a banner dismissed the editor.
 *
 * Neither a threshold nor a direction can separate those, because they ARE
 * the same gesture. Only what the finger landed on separates them, and that
 * is known at touchdown.
 *
 * Checked as structure rather than behaviour on purpose: the failure is a
 * missing opt-out on a specific element, and the thing that makes it correct
 * is that the check happens BEFORE the sheet arms itself. A test that drove
 * synthetic touches through jsdom would be measuring jsdom's idea of
 * `Element.closest` and pointer capture, neither of which is what ships.
 *
 * The rest of this file is the same class of claim about the other controls
 * in the same sheets: a button that changes size or fades when it is pressed.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
/**
 * For every check that asserts something is ABSENT. A search for "this file
 * does not say Adding..." is otherwise satisfied by the comment explaining why
 * it does not — which is exactly what happened on the first run of this file,
 * and, per the note in _source, to four suites before it.
 */
const code = (p: string) => stripComments(read(p))

/**
 * EVERY one of these is comment-stripped, not only the absence checks.
 *
 * A control experiment removed `data-sheet-no-drag` from the reorder grip and
 * the check for it still passed, because the comment ABOVE the attribute
 * explains what it is for and says the words. A presence check satisfied by
 * prose is as useless as an absence check satisfied by prose, and this file
 * writes long comments on purpose.
 */
const sheet = code("components/website-builder/mobile-editor-sheet.tsx")
const arrange = code("components/storefront/arrange-products-button.tsx")
const upload = code("components/app/image-upload.tsx")
const editor = code("components/storefront/editor-sheet.tsx")
const profile = code("components/storefront/edit-profile-button.tsx")
const wishlist = code("components/wishlist/wishlist-button.tsx")

console.log("\nThe sheet gives up a finger that belongs to something else\n")

check(
  "the sheet has an opt-out at all",
  /\[data-sheet-no-drag\]/.test(sheet),
  "every drag inside the sheet is still competing with the sheet",
)

/**
 * BEFORE `startDrag`, NOT AFTER. Arming the drag and then ignoring the moves
 * would leave the sheet mid-gesture: the transition off, the overlay deaf,
 * and `drag.current.active` true until a touchend that may never reach it.
 * That is a documented outage in this very file.
 */
{
  const start = sheet.indexOf("const onStart = (e: TouchEvent)")
  const end = sheet.indexOf("const onMove = (e: TouchEvent)")
  const body = sheet.slice(start, end)
  const optOut = body.indexOf("data-sheet-no-drag")
  const arms = body.indexOf("startDrag(")
  check(
    "and it is consulted before the sheet arms itself",
    start > 0 && optOut > 0 && arms > optOut,
    `opt-out at ${optOut}, startDrag at ${arms} within the handler`,
  )
}

check(
  "the reorder grip claims its own finger",
  /data-sheet-no-drag/.test(arrange),
  "dragging a product to reorder it would pull the sheet down instead",
)
check(
  "so does the cover's frame",
  /data-sheet-no-drag/.test(upload),
  "placing a cover would pull the sheet down instead",
)
/** touch-none is the BROWSER's scroll; it says nothing to the sheet. */
check(
  "both still stop the browser scrolling too",
  /touch-none/.test(arrange) && /touch-none/.test(upload),
  "the two are different problems and need both fixes",
)

console.log("\nA drag you can feel\n")

check(
  "it goes through the one helper that works on iOS",
  /import \{ hapticTap \}/.test(arrange),
  "navigator.vibrate does not exist in WKWebView and fails silently there",
)

/**
 * ---------------------------------------------------------------------------
 *  AND THE HELPER FALLS BACK WHEN THE NATIVE PLUGIN IS NOT THERE
 * ---------------------------------------------------------------------------
 * `@capacitor/haptics` is an npm dependency whose native half has to be built
 * into each app project, and in this repository it is in NEITHER: the iOS
 * Podfile lists Capacitor, Cordova, PushNotifications and Camera, and
 * android/capacitor.settings.gradle lists capacitor-android, app and browser.
 *
 * So inside the app the import resolved, the bridge answered "not
 * implemented", and a bare `catch {}` swallowed it — every haptic in the app,
 * on both platforms, silently doing nothing. `triggerHaptic` reports whether
 * it worked now, and `hapticTap` falls through to the web API, which Android
 * WebView supports.
 *
 * Checked against the native projects themselves, so this stops being a
 * failure the day somebody adds the pod, rather than becoming a stale note.
 */
{
  const bridge = code("lib/native-bridge.ts")
  check(
    "triggerHaptic says whether it actually fired",
    /Promise<boolean>/.test(bridge) && /return true/.test(bridge),
    "a bare catch cannot be distinguished from a haptic that happened",
  )
  check(
    "and hapticTap falls back to the web API when it did not",
    /\.then\(\(ok\) => \{\s*if \(!ok\) web\(\)/.test(bridge),
    "inside the Android app navigator.vibrate works and was never reached",
  )

  /**
   * AND THE PLUGIN IS ACTUALLY IN THE APP PROJECTS.
   *
   * The fallback above makes Android work through the web API, but on iOS
   * there is no web vibration API to fall back to — in Safari or in WKWebView
   * — so the Taptic Engine is reachable only through this plugin. It has to be
   * declared in each native project or the bridge answers "not implemented".
   *
   * Three lines, matching the existing entries exactly. Note the Android path
   * style: the flat `node_modules/@capacitor/...` form, NOT the pnpm-hashed
   * one `cap sync` generates — that encodes a lockfile-specific directory and
   * breaks the build on any other install.
   */
  const podfile = readFileSync(join(root, "ios/App/Podfile"), "utf8")
  const androidSettings = readFileSync(join(root, "android/capacitor.settings.gradle"), "utf8")
  const androidBuild = readFileSync(join(root, "android/app/capacitor.build.gradle"), "utf8")
  check("iOS declares the haptics pod", /pod 'CapacitorHaptics'/.test(podfile))
  check(
    "Android includes the haptics project",
    /include ':capacitor-haptics'/.test(androidSettings) &&
      /implementation project\(':capacitor-haptics'\)/.test(androidBuild),
  )
  check(
    "and no plugin path was rewritten to a pnpm-specific directory",
    !/node_modules\/\.pnpm/.test(androidSettings),
    "cap sync writes those, and they break on any other install",
  )
}
check(
  "picking a row up is a tap",
  /hapticTap\("medium"\)\n\s*lastTick\.current = index\n\s*setDrag\(\{ id, from: index/.test(arrange),
)
check(
  "crossing into another slot is a lighter one",
  /if \(lastTick\.current !== to\) \{\n\s*lastTick\.current = to\n\s*hapticTap\("light"\)/.test(arrange),
  "firing on every pointermove would be a continuous buzz at 120Hz",
)
/**
 * AND IT IS FIRED OUTSIDE THE STATE UPDATER. React may call an updater more
 * than once for a single dispatch — it does in development — so a buzz
 * written next to the comparison inside it is a buzz an unknown number of
 * times. The updater computes; the effect happens against a ref.
 */
check(
  "the tick is not fired from inside a state updater",
  !/setDrag\(\(current\) => \{[\s\S]*?hapticTap/.test(arrange),
  "a state updater has to be pure",
)
check(
  "and a press that moved nothing has nothing to confirm",
  /if \(current\.to !== current\.from\) hapticTap/.test(arrange),
)

/**
 * AND SAVING DOES NOT THROW THE PAGE AWAY.
 *
 * The reorder sheet finished with `window.location.reload()`. The order does
 * live in the page's server data, so it really does have to be read again —
 * but a reload discards the document to do it: the sheet, the page behind it
 * and everything painted on it go white while the request is in flight, right
 * after Save is pressed. `router.refresh()` re-renders the server components
 * and reconciles them into the DOM that is already there.
 *
 * A control experiment put the reload back and every check in this file still
 * passed, which is why this one exists.
 */
check(
  "saving the order refreshes the page rather than reloading the browser",
  !/window\.location\.reload/.test(arrange) && /router\.refresh\(\)/.test(arrange),
  "a reload is a white screen for the length of the round trip",
)
check(
  "and the workspace's frame is told too",
  /notifyEditorSaved\(\)/.test(arrange),
  "inside the builder this page is an iframe and the frame is what reloads it",
)

console.log("\nButtons that do not change shape when they are pressed\n")

/**
 * THIRD GO AT THIS ONE, so the pin says what it now protects.
 *
 * First the label was swapped for a spinner. Then the spinner went beside the
 * label and `disabled:opacity-100` cancelled the variant's fade — which works
 * by winning a class-precedence argument across a cva base, a variant and a
 * merged override. A save in flight is simply not `disabled` any more: the
 * button keeps every pixel, and the double-submit `disabled` was there for is
 * done by a guard in the handler, where it can be read.
 */
{
  /* Scoped to the Save button. Cancel is `disabled={busy}` and should be:
     it is not the control that has to stay legible mid-request. */
  const saveButton = editor.slice(editor.indexOf("aria-busy={busy"), editor.indexOf("{saveLabel}"))
  check(
    "a save in flight does not disable the button",
    /disabled=\{saveDisabled\}/.test(saveButton) && !/\sdisabled=\{busy/.test(saveButton),
    "disabled drags in opacity-50 from the variants and the button looks dead",
  )
}
check(
  "and a second press is stopped where it can be read",
  /if \(busy \|\| saveDisabled\) return/.test(editor),
  "without disabled, nothing else prevents sending the request twice",
)
check(
  "with the state still announced",
  /aria-busy=\{busy \|\| undefined\}/.test(editor) && /aria-disabled=\{busy \|\| saveDisabled \|\| undefined\}/.test(editor),
)
check(
  "and its spinner takes part in no layout",
  /<Loader2\s+className="absolute left-4/.test(editor),
  "a spinner in the flex row shoves the centred label sideways as it appears",
)
check(
  "the wishlist button's label does not change under the press",
  !/Adding\.\.\./.test(wishlist),
  "a shorter word re-centres the row and both the icon and the text slide",
)
check(
  "nor does it fade out",
  !/opacity-70/.test(wishlist),
)
check(
  "and it answers the press immediately",
  /active:scale-\[0\.985\]/.test(wishlist),
  "there was no response at all between the press and the server answering",
)

console.log("\nThe cover is placed when it is added, not for ever after\n")

check(
  "the frame is only a drag surface for a picture chosen in this session",
  /cover && cover !== coverUrl/.test(profile),
  "every visit to the drawer left the banner live under a stray finger",
)

console.log("\nThe picture arrives without a hole in front of it\n")

const avatar = code("components/ui/avatar.tsx")
check(
  "the circle has a ground of its own",
  /"bg-muted",\n\s*"aspect-square"/.test(avatar),
  "the fallback waits 600ms before painting, and the root was transparent until then",
)
check(
  "the bar at the top of a product page asks for a 48px picture",
  /optimizedImageUrl\(avatarUrl, 48\)/.test(code("components/store-builder/product-creator-bar.tsx")),
  "it was pointing at the original upload: megabytes for a 36px circle",
)

/**
 * A preload only helps if its URL is the one that is later requested. Both
 * pages call the same helper for that reason; two expressions would drift and
 * the page would download the avatar twice.
 */
check(
  "the creator page preloads the exact URL its header will ask for",
  /headerAvatar\(headerSettings, profile\.avatar_url\)/.test(code("app/(marketing)/u/[username]/page.tsx")) &&
    /headerAvatar\(settings, profile\?\.avatar_url, isMobile\)/.test(
      code("components/store-builder/unified-section-renderer.tsx"),
    ),
  "one helper, two callers — a second expression would drift and cost a second download",
)
check(
  "and the product page preloads its bar's",
  /optimizedImageUrl\(creatorAvatarUrl, 48\)/.test(code("app/(marketing)/p/[slug]/page.tsx")),
)

console.log("\nThe price, what it cost, and how much is off\n")

/**
 * `items-baseline`, which is #213's answer rather than the one this branch
 * first wrote. The two prices sit on a shared baseline whatever their sizes,
 * and the badge is centred inside its own box because a badge on a text
 * baseline hangs. That version landed on main while this branch was in
 * flight; it is better than the `items-center` row this replaced, so it is
 * the one that ships and the one checked here.
 */
const productPage = code("app/(marketing)/p/[slug]/page.tsx")
check(
  "both cards put the price, the old price and the badge on one row",
  (productPage.match(/flex flex-wrap items-baseline gap-x-3 gap-y-1/g) || []).length === 2,
  "the buy column and the phone card each need one",
)
check(
  "neither leaves the old price on a line of its own",
  !/mt-1 flex items-center gap-2">\s*<span\s+className="text-(lg|base) line-through/.test(productPage),
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
