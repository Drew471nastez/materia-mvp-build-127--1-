/**
 * ===========================================================================
 *  A TOGGLE AND THE ICON IT DESCRIBES
 * ===========================================================================
 * Two of the four Header elements toggles did nothing. The panel wrote
 * `show_search` and `show_cart`; the header reads `show_search_icon` and
 * `show_cart_icon`, which is what the section's schema declares. Turning
 * either off changed a setting nothing looks at.
 *
 * All four also DREW the wrong state. `value={s.show_x}` is undefined on a
 * header nobody has touched, which a toggle shows as off, while the icon it
 * describes was on: every one of them opened by contradicting the header
 * beside it.
 *
 * The rule is one function now. These tests execute it, and then check that
 * both sides actually call it, because "both spell the key correctly" is not
 * an arrangement that holds.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { HEADER_ICON_KEYS, headerIconOn } from "../lib/website-builder/header-icons"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  console.log("\n  what the rule answers")

  check("a header nobody has touched shows every icon",
    headerIconOn(undefined, undefined) === true && headerIconOn(undefined) === true)

  check("off is off", headerIconOn(false) === false)
  check("on is on", headerIconOn(true) === true)

  check("a creator who turned it off under the old name keeps it off",
    headerIconOn(undefined, false) === false)

  check("and setting it now wins over that", headerIconOn(true, false) === true)

  check("a value that is not a boolean is not an answer",
    headerIconOn("false") === true && headerIconOn(0) === true && headerIconOn(null, "false") === true)

  console.log("\n  and both sides ask it")

  const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
  const editor = read("app/website-builder/editor/[installId]/page.tsx")

  /* The keys are written out on both sides rather than reached through the
     constant, because the panel-coverage test reads these files for the
     setting names a section honours and an indirection hides them from it.
     What is shared is the RULE, which is where the bug was. */
  for (const [name, entry] of Object.entries(HEADER_ICON_KEYS)) {
    check(`the header reads ${name} through the rule`,
      new RegExp(`headerIconOn\\(s\\.${entry.key}`).test(header))
    check(`and the panel draws ${name} from it`,
      new RegExp(`headerIconOn\\(s\\.${entry.key}`).test(editor))
    check(`and writes the key the header reads for ${name}`,
      new RegExp(`onUpdateSetting\\("${entry.key}"`).test(editor))
  }

  check("no toggle writes a key the header does not read",
    !/onUpdateSetting\("show_search",/.test(editor) && !/onUpdateSetting\("show_cart",/.test(editor))

  check("and none of them reads a bare setting again",
    !/value=\{s\.show_(search|cart|account_icon|wishlist_icon)\}/.test(editor))

  console.log("\n  search opens where it was clicked, or on a page, and the creator picks")

  const schema = read("themes/default/sections/header.json")

  check("the choice is a control, not a guess",
    /"id": "search_behaviour"/.test(schema) && /"default": "header"/.test(schema))
  check("both answers are offered",
    /"value": "header"/.test(schema) && /"value": "page"/.test(schema))
  check("and the panel draws it",
    /onUpdateSetting\("search_behaviour"/.test(editor) && /Open it in the header/.test(editor))

  check("opening in the header is what a header that says nothing does",
    /str\(s\.search_behaviour, "header"\) !== "page"/.test(header))
  check("the icon becomes a button when it opens a field, and stays a link when it does not",
    /searchOpensInHeader \? \(/.test(header) && /href="\/search"/.test(header))
  check("the field is a form that works without any of this running",
    /action="\/search"/.test(header) && /method="get"/.test(header) && /name="q"/.test(header))
  check("and the menu's Search row opens the same field rather than leaving",
    /onOpenSearch/.test(header) && /window\.setTimeout\(onOpenSearch, CLOSE_MS\)/.test(header))
  check("the placeholder is the creator's",
    /"id": "search_placeholder"/.test(schema) && /str\(s\.search_placeholder, "Search"\)/.test(header))

  console.log("\n  what matches, while they are still typing")

  check("the field asks the site's own endpoint, which exists",
    /\/api\/website-builder\/search\?creator=/.test(header) && existsSync("app/api/website-builder/search/route.ts"))
  check("and the endpoint answers the same question the search page does",
    /productMatchesQuery/.test(read("app/api/website-builder/search/route.ts")))
  check("a request is debounced and the previous one is abandoned",
    /window\.setTimeout\(async \(\) =>/.test(header) && /ctrl\.abort\(\)/.test(header))
  check("View all goes to the search page with the words",
    /`\/search\?q=\$\{encodeURIComponent\(q\.trim\(\)\)\}`/.test(header))
  check("the field is not as wide as a full-width header",
    /max-w-\[720px\] items-center gap-2/.test(header))
  check("in the editor there is nobody to ask on behalf of, so it says nothing",
    /if \(!creatorId \|\| !term\)/.test(header))

  console.log("\n  padding is pixels, one number per device")

  const spacing = read("lib/website-builder/header-spacing.ts")
  /* The drawers are still `w-[85vw]`, which is right: a drawer's width IS a
     share of the screen. What must be gone is a SETTING expressed in a
     viewport unit and a template string that writes one into a style. */
  check("no setting is a viewport unit any more",
    !/`\$\{\w+\}vw`/.test(header) && !/"unit": "v[wh]"/.test(schema) && !/\bpaddingVw\b|\blinkSpacingVw\b/.test(header))
  check("the desktop shell and the phone shell each carry their own",
    /className="hidden md:flex w-full" style=\{\{ paddingTop: padDesktop/.test(header) &&
      /className="flex md:hidden w-full" style=\{\{ paddingTop: padMobile/.test(header))
  check("and the editor draws the one for the device it is showing",
    /forceMobile \? padMobile : padDesktop/.test(header))
  check("a vw somebody set is translated, not dropped",
    /headerPad\(s\.vertical_padding, s\.vertical_padding_vw/.test(header) && /PHONE_WIDTH = 390/.test(spacing))
  check("the panel offers desktop and phone separately, in px",
    /label="Vertical padding, desktop"/.test(editor) && /label="Vertical padding, phone"/.test(editor) &&
      (editor.match(/unit="px"/g) ?? []).length >= 3)

  console.log("\n  the link picker on a phone")

  check("the list is in the flow rather than floated",
    /const \[inline, setInline\] = useState\(false\)/.test(editor) && /\{inlineList\}/.test(editor))
  check("and the popover is not measured at all there",
    /if \(!open \|\| inline\) \{ setPos\(null\); return \}/.test(editor))

  console.log("\n  the page behind a drawer")

  const frame = read("components/website-builder/drawer-frame.ts")
  check("the document's scrollbar goes while a drawer is open",
    /root\.overflow = "hidden"/.test(frame))
  check("and its width is given back as padding, so nothing shifts",
    /body\.paddingRight = `\$\{barWidth\}px`/.test(frame))
  check("both drawers move at the one pace",
    (header.match(/drawerSlide\(open\)/g) ?? []).length === 2 && (header.match(/drawerFade\(open\)/g) ?? []).length === 2)
  check("and the lists inside them have the slim bar",
    (header.match(/site-slim-scroll/g) ?? []).length >= 3)

  console.log("\n  the call to action reaches a phone")

  check("the drawer is given one", /cta=\{/.test(header) && /interface DrawerCta/.test(header))
  check("gated by the same toggle the desktop button uses",
    /s\.show_cta_button !== false && str\(s\.cta_text/.test(header))
  check("in the theme's own button colours",
    /background: str\(s\.cta_color\) \|\| theme\.primary_color/.test(header))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
