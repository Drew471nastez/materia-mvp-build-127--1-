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
     * A label given to a FieldEditor has to be conditional on that rule,
     * but only where a colour can actually arrive. FieldEditor draws the
     * label row itself now (it is where a setting that takes a dynamic
     * source keeps its Insert shop data button), so the loops hand it
     * `label=` instead of printing a `<label>` above it. Some of those
     * calls sit inside a branch already pinned to one type (the final else
     * after the colour branch has been taken). A colour never reaches
     * those, and guarding them would add a condition that is always true,
     * which is worse than no condition: it implies a case that cannot
     * happen.
     *
     * So it asks the question that matters: is this label in a loop that
     * hands FieldEditor an unrestricted field? Those are the three generic
     * loops (section settings, block settings and the advanced colours
     * list) and every one of them must ask. And nothing prints a
     * `{field.label}` label directly above a FieldEditor any more, which
     * would be the name twice again.
     */
    const lines = editor.split("\n")
    /** A branch above the call that pins the type means a colour cannot reach it. */
    const typePinnedAbove = (i: number) =>
      lines.slice(Math.max(0, i - 6), i).some((l) => /field\.type === "/.test(l))
    /** The `label=` a FieldEditor call on line i passes, on its own line or the next two. */
    const labelOf = (i: number): string | null => {
      for (const [k, l] of lines.slice(i, i + 3).entries()) {
        /* The call closed on the line before: a label further down is another call's. */
        if (k > 0 && /\/>\s*$/.test(lines[i + k - 1])) break
        const m = l.match(/\blabel=\{(.*?)\}(?= |$)/)
        if (m) return m[1]
      }
      return null
    }

    const generic: number[] = []
    const pinned: number[] = []
    const unguarded: number[] = []
    const doubled: number[] = []
    lines.forEach((l, i) => {
      if (!/<FieldEditor\b/.test(l)) return
      if (lines.slice(Math.max(0, i - 3), i).some((a) => /<label[^>]*>\{field\.label\}<\/label>/.test(a))) doubled.push(i + 1)
      const label = labelOf(i)
      if (label === null) return
      if (typePinnedAbove(i)) pinned.push(i + 1)
      else {
        generic.push(i + 1)
        if (label !== "fieldCarriesOwnLabel(field) ? undefined : field.label") unguarded.push(i + 1)
      }
    })

    check(
      "the sidebar still has generic field loops for this to be about",
      generic.length >= 3,
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
    check(
      "no loop prints a label of its own above a FieldEditor",
      doubled.length === 0,
      doubled.length ? `Lines ${doubled.join(", ")} of ${EDITOR}: FieldEditor draws the label row, so this prints the name twice.` : undefined,
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

  // ── 4. Every control the registry defines has an editor ──────────────
  /**
   * THE QUESTION THIS ANSWERS: "are all the config controls updated, in
   * general settings and in the sections tab?"
   *
   * It cannot be answered by reading the panel, because the panel does not
   * list the controls — the REGISTRY does, and the panel draws whatever a
   * schema asks for. So the two sets are compared directly: every type the
   * registry defines must have a branch in FieldEditor, and every branch in
   * FieldEditor must be a type the registry defines.
   *
   * Both directions matter. A registry type with no branch falls through to
   * the last case and a creator gets a bare text box where a picker belongs
   * — which is exactly how an icon field came to be edited by typing a
   * kebab-case lucide name from memory. A branch with no registry type is
   * dead code, or a control someone spelled differently, and the aliases are
   * the registry's job rather than a second spelling here.
   */
  {
    const registry = JSON.parse(read("lib/storelib-theme/controls/storelib-controls.json")) as {
      types: Record<string, unknown>
      legacy_aliases: Record<string, string>
    }
    const defined = Object.keys(registry.types).sort()
    /*
      SCOPED TO FieldEditor, not to the file.

      Scanning the whole editor for `kind === "..."` also caught
      remove_section, update_section and update_theme, which are the agent's
      OPERATION kinds several thousand lines away. The check failed naming
      three controls that were never controls — a guard that reports work
      nobody has to do is a guard that gets muted.
    */
    /* FieldEditor hands the value to FieldControl, which holds the branches;
       the newer types are drawn by the controls folder's one registry
       function (components/website-builder/editor/controls/index.tsx),
       which FieldControl asks first. Both are the panel. */
    const fnStart = editor.indexOf("function FieldEditor(")
    const controlStart = editor.indexOf("function FieldControl(", fnStart)
    const after = editor.indexOf("\nfunction ", (controlStart > 0 ? controlStart : fnStart) + 1)
    const body = editor.slice(fnStart, after > 0 ? after : undefined)
    const registered = read("components/website-builder/editor/controls/index.tsx")
    const registeredBody = registered.slice(registered.indexOf("export function renderRegisteredControl("))
    /* `kind` is what resolveControlType returns, so aliases are resolved
       before they reach these branches and never appear as one. */
    const drawn = [...new Set([
      ...[...body.matchAll(/kind === "([a-z_]+)"/g)].map((m) => m[1]),
      ...(/renderRegisteredControl\(kind,/.test(body) ? [...registeredBody.matchAll(/case "([a-z_]+)":/g)].map((m) => m[1]).filter((k) => k !== "menus" && k !== "css") : []),
    ])].sort()

    const missing = defined.filter((t) => !drawn.includes(t))
    const extra = drawn.filter((t) => !defined.includes(t))

    check(
      `every one of the ${defined.length} controls the registry defines has an editor`,
      missing.length === 0,
      missing.length ? `no branch for: ${missing.join(", ")}` : undefined,
    )
    check(
      "and the panel draws nothing the registry does not define",
      extra.length === 0,
      extra.length ? `drawn but not defined: ${extra.join(", ")}` : undefined,
    )
    check(
      "and every legacy spelling resolves rather than being handled twice",
      Object.keys(registry.legacy_aliases).every((alias) => !drawn.includes(alias)),
      `aliases: ${Object.keys(registry.legacy_aliases).join(", ")}`,
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
