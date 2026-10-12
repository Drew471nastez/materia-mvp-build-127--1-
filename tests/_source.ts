import { readFileSync } from "node:fs"
import { join } from "node:path"
import { untt } from "./i18n-source"

/**
 * ===========================================================================
 *  READING SOURCE FOR AN ASSERTION, WITH THE PROSE TAKEN OUT
 * ===========================================================================
 *
 * Every suite in this repository that asserts something is ABSENT has to read
 * code and not comments — a check for "this file does not mention
 * window.location" is otherwise satisfied by the sentence explaining why it
 * does not. That has now happened four separate times here, so each suite grew
 * its own two-line stripper:
 *
 *     src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
 *
 * ---------------------------------------------------------------------------
 * AND THAT STRIPPER SILENTLY EATS CODE
 * ---------------------------------------------------------------------------
 * `/*` is not always the start of a comment. In this codebase it appears inside
 * a string on a line every file-picking form has:
 *
 *     accept="image/*"
 *
 * The regex sees an opener there, scans for the next `*` + `/` — which is the
 * end of some JSX comment hundreds of lines later — and deletes EVERYTHING
 * BETWEEN. In components/sell/new-listing-form.tsx that was three and a half
 * kilobytes of live code removed from what the suites were reading.
 *
 * The failure mode is the dangerous direction. A POSITIVE assertion about
 * deleted code fails loudly and gets noticed, which is how this was found. A
 * NEGATIVE one — "the forbidden thing is not here" — passes, because the thing
 * it was looking for was eaten before it looked. Guards can be green for code
 * they never read.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES INSTEAD
 * ---------------------------------------------------------------------------
 * A scan that knows about strings. It is not a JavaScript parser and does not
 * need to be: it tracks single quotes, double quotes and backticks, and only
 * treats `//` and `/*` as comment openers when it is not inside one of them.
 * That is the whole difference, and it is enough for every case this repository
 * actually has.
 *
 * Regex literals are deliberately NOT tracked. Distinguishing `/` as division
 * from `/` as the start of a pattern needs the grammar, and getting it wrong
 * would reintroduce exactly this bug from the other end. A regex containing an
 * unmatched quote is the only thing that would confuse this, and there is none
 * in the files these suites read.
 *
 * ---------------------------------------------------------------------------
 * AND AN APOSTROPHE IN JSX TEXT IS NOT A STRING EITHER
 * ---------------------------------------------------------------------------
 * The same bug, from the other end, and found the same way. In JSX, prose is
 * not quoted:
 *
 *     <p>Don't lose your work</p>
 *
 * That apostrophe was read as opening a string, and nothing closed it, so
 * every `/*` after it in the file was treated as text inside a string and
 * left alone. Demonstrated on a two-line file:
 *
 *     const a = <p>Don't</p>
 *     /* SECRET *\/            <- survived the strip
 *
 * components/onepage/onboarding-modal.tsx is a real one: a negative assertion
 * matched the sentence in a comment explaining the thing it forbids, which is
 * the precise failure this file exists to prevent.
 *
 * A quote with a word character on BOTH sides is an English contraction, not a
 * delimiter. That rule covers `don't`, `it's` and `creator's`, and it cannot
 * touch a real string: the opening quote of `'a'` has a space or a bracket
 * before it, and the closing one has a comma or a bracket after it, so neither
 * has word characters on both sides.
 */

export function stripComments(src: string): string {
  let out = ""
  let i = 0
  /** null when outside a string; otherwise the character that will close it. */
  let quote: string | null = null

  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]

    if (quote) {
      // A backslash escapes whatever follows it, including the closing quote.
      if (c === "\\") {
        out += c + (next ?? "")
        i += 2
        continue
      }
      if (c === quote) quote = null
      out += c
      i++
      continue
    }

    if (c === '"' || c === "'" || c === "`") {
      /* An apostrophe between two letters is a contraction in JSX prose. */
      const isContraction =
        c === "'" && /\w/.test(src[i - 1] ?? "") && /\w/.test(next ?? "")
      if (!isContraction) quote = c
      out += c
      i++
      continue
    }

    if (c === "/" && next === "/") {
      // To the end of the line, and the newline is KEPT so that assertions
      // matching across lines still see the same line structure.
      while (i < src.length && src[i] !== "\n") i++
      continue
    }

    if (c === "/" && next === "*") {
      i += 2
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++
      i += 2
      continue
    }

    out += c
    i++
  }

  return out
}

const root = process.cwd()

/** The file, verbatim. */
export function readSource(path: string): string {
  /* As it read before its words went into tt() (tests/i18n-source.ts). */
  return untt(readFileSync(join(root, path), "utf8"), path)
}

/** The file with its comments removed — see the note above. Use this for every
 *  assertion that something is absent. */
export function readCode(path: string): string {
  return stripComments(readSource(path))
}
