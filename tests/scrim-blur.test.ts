/**
 * ===========================================================================
 *  A SCRIM THAT CLEARS TOWARDS THE TOP
 * ===========================================================================
 * Asked for after the sheets started opening in the right place: softer than
 * it is, and deepening towards the bottom of the page rather than sitting at
 * one strength everywhere.
 *
 * It was `bg-black/40 backdrop-blur-[2px]` — the same blur over the whole
 * screen, including the part furthest from the sheet, which is the part you
 * are most likely to still be reading.
 *
 * Measured in scripts/check-scrim-blur.mjs, which photographs 6px stripes
 * through the scrim and reads the standard deviation of luminance in six
 * bands. A big number is sharp, a small one is blurred:
 *
 *     old, flat blur(2px)      9.0   8.4   8.3   8.3   8.4   9.3
 *     first pass, 2.5px       76.5  74.0  58.1  40.9  23.2   6.6
 *     softened, 1.6px         76.5  76.5  71.8  59.4  47.0  30.4
 *     softened again, 1.1px   76.5  76.5  73.2  65.2  55.8  43.5
 *     and again, 0.8px        76.5  76.5  73.9  67.8  60.7  52.0
 *     down 40%, 0.48px        76.5  76.5  75.0  71.5  67.8  63.4
 *     as low as it goes, 0.28  76.5  76.5  75.3  72.8  70.1  66.8
 *
 * Asked down five times after the first pass, and 0.28px is the end of the
 * road rather than a preference. Swept at 3x, the graduated scrim has only
 * three distinct states left below half a pixel:
 *
 *     0.48px   63.4 at the bottom
 *     0.36px   66.8  }  the same step
 *     0.28px   66.8  }
 *     0.20px   76.3  }  the same as no blur whatsoever (76.5)
 *     0.12px   76.3  }
 *
 * Under about a quarter of a CSS pixel the radius stops resolving to a whole
 * device pixel even at 3x and the effect does not soften, it VANISHES. If a
 * softer scrim is wanted from here, the lever is the dim — bg-black/40 on
 * the parent — and not this.
 *
 * Asked down five times after the first pass. The top of the page is the
 * clarity of no scrim at all, and the bottom — behind the sheet — keeps a
 * real blur while staying far clearer than the flat one it replaced.
 *
 * ── THE NUMBERS ABOVE ARE AT 3x, AND THAT MATTERS ─────────────────────────
 * A blur radius is written in CSS pixels and applied in DEVICE pixels, and
 * Chromium quantises the result. This probe first ran at scale 1, where a
 * sweep of radii showed 0px and 0.5px producing identical output — 0.5 did
 * nothing whatever — and 0.8px and 1.1px likewise identical. On that basis a
 * requested reduction was reported as having changed nothing, and 1.1px was
 * described as "close to the floor of doing anything at all". Both were
 * wrong. At scale 3, which is what the phone in the report is, every radius
 * separates cleanly:
 *
 *     radius        0    0.5    0.8    1.1    1.6    2.5
 *     contrast   76.5  61.71   47.8  36.96  18.23   1.01
 *
 * There is a real floor, but it is nearer 0.4px than 1.1px.
 *
 * ONE LAYER, NOT A STACK. `backdrop-filter` cannot take a gradient, and the
 * usual answer is four or five stacked layers each with its own mask and
 * radius. A mask on a SINGLE blurred layer fades between the blurred backdrop
 * and the untouched one underneath, and a partial blend of the two reads as a
 * partial blur — one element, one filter, composited once on the phone.
 *
 * The dim is deliberately left alone and even. A scrim that also brightened
 * towards the top would stop reading as a scrim.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel, out)
    else if (name.endsWith(".tsx")) out.push(rel)
  }
  return out
}

function main() {
  const css = read("app/globals.css")
  const probe = read("scripts/check-scrim-blur.mjs")

  console.log("\nThe blur is graduated, and written down once")

  const rule = css.match(/\.scrim-graduated::after\s*\{[\s\S]*?\n  \}/)
  check("there is a .scrim-graduated::after rule", !!rule)
  const body = rule?.[0] ?? ""
  const radii = [...body.matchAll(/blur\(var\(--scrim-blur, ([\d.]+)px\)\)/g)].map((m) => Number(m[1]))
  check("it blurs the backdrop through one variable", radii.length === 2, `${radii.length} declarations`)
  check(
    "and both properties carry the same radius",
    radii.length === 2 && radii[0] === radii[1],
    "the radius should not be retyped per property",
    )
  check("with the webkit prefix iOS still wants", /-webkit-backdrop-filter: blur\(/.test(body))
  check(
    "the radius stays in scrim territory",
    radii[0] > 0 && radii[0] <= 3,
    `${radii[0]}px — a scrim heavier than 3px is the thing that was complained about twice`,
  )

  const stops = body.match(/\n\s*mask-image: linear-gradient\(to bottom, transparent 0%, transparent ([\d.]+)%/)
  check(
    "it is masked from the top down",
    !!stops && /-webkit-mask-image: linear-gradient\(to bottom/.test(body),
    "to bottom is what makes it clear at the top and deep at the sheet",
  )
  check(
    "with a top that is genuinely untouched",
    !!stops && Number(stops[1]) >= 20,
    stops ? `clear through ${stops[1]}%` : undefined,
    )
  check(
    "it cannot take the pointer from the scrim it sits on",
    /pointer-events: none/.test(body),
  )

  console.log("\nAnd the probe measures that rule, not a copy of it")

  check(
    "it reads the rule out of globals.css",
    /const rule = css\.match\(\/\\\.scrim-graduated::after/.test(probe),
    "a probe with its own copy of the CSS passes for the wrong reason",
  )
  check(
    "it finds the scrim's extent rather than assuming it",
    /def scrim_bottom/.test(probe),
    "a 900px window gives an 813px viewport, and the first run blamed the blur for the difference",
  )
  check(
    "and it uses a pattern neither blur saturates",
    /6px stripes, not 2px/.test(probe),
    "at 2px the old scrim measured 0.0 everywhere, which says only that it went past what the pattern could resolve",
  )

  console.log("\nNo scrim in the one-page editor is flat any more")

  for (const file of walk("components/onepage")) {
    const src = read(file)
    const flat = (src.match(/backdrop-blur-\[2px\]/g) ?? []).length
    check(
      `${file.split("/").slice(-1)[0]}: no flat 2px scrim blur`,
      flat === 0,
      flat ? `${flat} left` : undefined,
    )
  }

  console.log("\nEvery sheet scrim uses it")

  /*
    The Links and Products tabs' sheets were hand built, each with its own
    graduated scrim. They are the shared sheet on a phone now, through
    components/ui/sheet-dialog.tsx, and so have its scrim: the plain dim that
    Quick access and the account sheet have, faded on the compositor. None
    of them keeps a scrim of its own.
  */
  /* Links went from 5 to 13 and the Design tab from 0 to 11 when their last centred dialogs (the name and bio, the avatar and video steps, the crops, the image library, the layout questions) became the shared sheet on a phone too. Links 14 in round 11: Choose icon is a sheet of its own on a phone (components/onepage/icon-library), on purpose. */
  for (const [file, count] of [
    ["components/onepage/tabs/links-tab.tsx", 14],
    /* 10 since round 11: the wallpaper's one-button "Upload Video" sheet is gone; Upload and Replace open the device's picker directly. */
    ["components/onepage/tabs/design-tab.tsx", 10],
    ["components/onepage/tabs/products-tab.tsx", 1],
  ] as const) {
    const src = read(file)
    const shared = (src.match(/<SheetDialog\b/g) ?? []).length
    check(`${file.split("/").slice(-1)[0]}: ${count} shared sheet${count > 1 ? "s" : ""}, with its scrim`, shared === count && !/scrim-graduated/.test(src), `${shared} of ${count}`)
  }
  check("sheet-dialog.tsx: a phone gets the shared sheet", /<BottomSheet\b/.test(read("components/ui/sheet-dialog.tsx")))
  /* The colour picker's phone sheet is the shared BottomSheet now (components/onepage/color-picker), which brings its own scrim; mobile-color-picker.tsx only wraps it. */
  check("color-picker.tsx: its phone sheet is the shared sheet, with its scrim", /<BottomSheet\n\s*isOpen=\{open\}/.test(read("components/onepage/color-picker.tsx")) && /<ColorField variant="swatch"/.test(read("components/onepage/mobile-color-picker.tsx")))
  /* The OnePage editor's two questions are the shared BottomSheet on a phone now, which brings its own scrim. */
  check("onepage-editor.tsx: its questions are the shared sheet, with its scrim", /<BottomSheet isOpen=\{open\}/.test(read("components/onepage/onepage-editor.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
