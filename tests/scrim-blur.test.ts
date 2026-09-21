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
 *     old, flat blur(2px)     2.8   2.8   2.8   2.8   2.8   2.8
 *     first pass, 2.5px      76.5  74.6  61.0  45.6  28.3  10.9
 *     softened, 1.6px        76.5  76.5  72.2  61.4  48.6  30.8
 *     softened again, 1.1px  76.5  76.5  73.2  65.2  55.6  42.6
 *
 * Asked down twice more after the first pass. The
 * top of the page is back to the clarity of no scrim at all, and the bottom
 * — right behind the sheet — keeps a real blur while staying an order of
 * magnitude clearer than the flat one it replaced.
 *
 * THE NUMBERS BELOW ARE NOT PINNED, on purpose. This got tuned twice in one
 * sitting and will get tuned again; a test that has to be edited for every
 * adjustment is a test people start editing without reading. What is checked
 * is the shape — one radius used by both properties, a mask that runs top to
 * bottom with a genuinely clear zone at the top — and a ceiling on the radius,
 * so it can be tuned freely but cannot quietly go back to being heavy.
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

  for (const [file, count] of [
    ["components/onepage/tabs/links-tab.tsx", 5],
    ["components/onepage/tabs/products-tab.tsx", 1],
    ["components/onepage/onepage-editor.tsx", 2],
    ["components/onepage/mobile-color-picker.tsx", 1],
  ] as const) {
    const used = (read(file).match(/scrim-graduated/g) ?? []).length
    check(`${file.split("/").slice(-1)[0]}: ${count} scrim${count > 1 ? "s" : ""}`, used === count, `${used} of ${count}`)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
