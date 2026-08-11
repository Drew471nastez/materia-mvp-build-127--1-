import { readFileSync } from "node:fs"
import { join } from "node:path"

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
      quote = c
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
  return readFileSync(join(root, path), "utf8")
}

/** The file with its comments removed — see the note above. Use this for every
 *  assertion that something is absent. */
export function readCode(path: string): string {
  return stripComments(readSource(path))
}
