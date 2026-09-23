/**
 * ===========================================================================
 *  EVERY COLOUR IN THE BUILDER'S SIDEBAR OPENS THE SAME PICKER
 * ===========================================================================
 * The website builder's config sidebar had one control that did not belong
 * to it: a colour was a native `<input type="color">`, a 36px box with the
 * browser's own swatch inside, and clicking it handed the user to the
 * operating system's colour panel over the top of the app. Everything else
 * in that sidebar — links, icons, images, fonts — opens the builder's own
 * picker in the flow of the panel. The report was that the colour
 * customisers looked "old school", with "a white strip".
 *
 * So a colour field renders ColorField, the same picker the storefront
 * dialogs use. Two things have to keep holding, and neither is visible by
 * reading one line of the file:
 *
 *   1. No native colour input survives on that screen. It is one grep, and
 *      it is the whole of the visual complaint.
 *
 *   2. No panel prints the name twice. ColorField's closed row already reads
 *      "Background  #FFFFFF", so a `<label>` above it repeats the word. The
 *      sidebar renders fields from five places; the rule about which
 *      controls name themselves lives in fieldCarriesOwnLabel, and what this
 *      checks is that every one of those places asks it rather than keeping
 *      its own copy of the answer. A rule written out five times is a rule
 *      that will be wrong in one of them after the next edit.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
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

const read = (p: string) => readFileSync(join(root, p), "utf8")
/**
 * Source with its comments taken out. A guard that forbids a line of code
 * will otherwise match the comment explaining why that line was removed —
 * and this file's first check did exactly that, matching the sentence above
 * that names the control it bans.
 */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1")

const EDITOR = "app/website-builder/editor/[installId]/page.tsx"

function main() {
  console.log("\nEvery colour in the builder's sidebar opens the same picker")

  const editor = code(EDITOR)

  // ── 1. The builder's picker, not the browser's ────────────────────────
  {
    check(
      "a colour field renders ColorField",
      /kind === "color"[\s\S]{0,400}<ColorField/.test(editor),
      "FieldEditor's colour branch should return the builder's own picker.",
    )
    check(
      "and ColorField is imported from the one place it lives",
      /import \{ ColorField \} from "@\/components\/storefront\/color-field"/.test(editor),
    )
    /**
     * ColorField itself must not be a native input wearing a new coat. The
     * creator-page suite already asserts this for the storefront's use of
     * it; asserting it here as well is deliberate, because this suite is the
     * one that would be read by somebody changing the builder's sidebar.
     */
    check(
      "the picker it opens is not a native colour input either",
      !code("components/storefront/color-field.tsx").includes('type="color"'),
    )
  }

  // ── 2. One rule about who prints the label ────────────────────────────
  {
    check(
      "the rule about which controls name themselves exists once",
      /function fieldCarriesOwnLabel\(/.test(editor),
    )
    check(
      "and it covers a colour, which now names itself",
      /function fieldCarriesOwnLabel\([\s\S]{0,300}field\.type === "color"/.test(editor),
    )

    /**
     * THE ONE THAT CATCHES THE REGRESSION.
     *
     * A label above a FieldEditor has to be conditional on that rule —
     * but only where a colour can actually arrive. The sidebar renders
     * `{field.label}` in eight places, and four of them sit inside a branch
     * already pinned to one type (`field.type === "image" ? ...`, or the
     * final else after the colour branch has been taken). A colour never
     * reaches those, and guarding them would add a condition that is always
     * true, which is worse than no condition: it implies a case that cannot
     * happen.
     *
     * The first version of this check counted all eight and demanded all
     * eight be guarded. It failed on four labels that were already correct,
     * which would have pushed the next person to write dead guards to quiet
     * it. So it asks the question that matters instead: is this label in a
     * loop that hands FieldEditor an unrestricted field? Those are the four
     * generic loops — section settings, block settings, nav-block settings
     * and the advanced colours list — and every one of them must ask.
     */
    const lines = editor.split("\n")
    const isFieldLabel = (l: string) =>
      /<label className="text-xs font-medium text-muted-foreground mb-1\.5 block">\{field\.label\}<\/label>/.test(l)
    /** A branch above the label that pins the type means a colour cannot reach it. */
    const typePinnedAbove = (i: number) =>
      lines.slice(Math.max(0, i - 6), i).some((l) => /field\.type === "/.test(l))
    const guardedAbove = (i: number) =>
      lines.slice(Math.max(0, i - 3), i).some((l) => /!fieldCarriesOwnLabel\(field\)/.test(l))

    const generic: number[] = []
    const pinned: number[] = []
    lines.forEach((l, i) => {
      if (!isFieldLabel(l)) return
      ;(typePinnedAbove(i) ? pinned : generic).push(i + 1)
    })
    const unguarded = generic.filter((n) => !guardedAbove(n - 1))

    check(
      "the sidebar still has generic field loops for this to be about",
      generic.length >= 4,
      `Found ${generic.length}. If this drops, the check may be passing because it stopped finding anything.`,
    )
    check(
      "every field label a colour can reach is guarded by it",
      unguarded.length === 0,
      unguarded.length
        ? `Unguarded at line${unguarded.length === 1 ? "" : "s"} ${unguarded.join(", ")} of ${EDITOR}. ` +
          `A colour field rendered there prints its name twice: once from this label, once from ColorField's own row.`
        : `${generic.length} generic labels guarded, ${pinned.length} inside a branch a colour cannot reach.`,
    )
  }

  // ── 3. Nothing on this screen opens the OS colour panel ───────────────
  {
    check(
      "no native colour input is left in the builder's editor",
      !/type="color"/.test(editor),
      "A native input hands the user to the operating system's colour panel, which is the control that was reported as old school.",
    )
  }

  console.log(`\n  ${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\n  Failed: ${failures.join(", ")}\n`)
    process.exit(1)
  }
  console.log("")
}

main()
