/**
 * ===========================================================================
 *  "REACT IS NOT DEFINED", WHICH TOOK THE WHOLE BUILDER DOWN
 * ===========================================================================
 * Two lines in the editor said `React.useRef(...)`. That file imports the
 * hooks it uses by name and never imports React, so `React` is not a binding
 * in it, and the expression threw a ReferenceError the moment the editor
 * rendered. Every creator opening the website builder got a blank page.
 *
 * WHY NOTHING CAUGHT IT, which is the part worth fixing:
 *
 *   - TypeScript ACCEPTS the spelling. @types/react declares `export as
 *     namespace React`, a UMD global, so `React.useRef` resolves for the
 *     type checker even in a module that never imports it.
 *   - The build does not fail on type errors, so nothing downstream objected.
 *   - It is in a type position half the time. `React.CSSProperties` is
 *     erased at compile time and is perfectly safe; `React.useRef` is a
 *     value and is not. The two look identical in a diff.
 *
 * So a reviewer sees a familiar spelling, the compiler agrees, the build
 * passes, and the page is blank. This is the check that disagrees.
 *
 * It scans SOURCE, so it costs nothing and covers files no test imports.
 *
 * Run with:  npm run test:push
 */

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

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

/**
 * React used as a VALUE: something that has to exist at runtime.
 *
 * Deliberately a list of real members rather than `React\.\w+`, because the
 * common safe uses are types — CSSProperties, ReactNode, FC, ComponentProps,
 * MouseEvent — and flagging those would make this check noise that somebody
 * eventually deletes. The lookbehind keeps it off `foo.React.x` and off a
 * name that merely ends in React.
 */
const VALUE_USE =
  /(?<![.\w$])React\s*\.\s*(createElement|cloneElement|Fragment|memo|forwardRef|lazy|Suspense|Children|isValidElement|createContext|createRef|use[A-Z]\w*|StrictMode|Profiler|startTransition|useId)\b/g

/** Any import that actually puts `React` in scope. */
function importsReact(code: string): boolean {
  return (
    /import\s+React\b[^"']*from\s*["']react["']/.test(code) ||
    /import\s+\*\s+as\s+React\s+from\s*["']react["']/.test(code) ||
    /(?:const|let|var)\s+React\s*=\s*require\(\s*["']react["']\s*\)/.test(code)
  )
}

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")

function sourceFiles(): string[] {
  const out: string[] = []
  const skip = new Set(["node_modules", ".next", ".git", "dist", "build", "ios", "android"])
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(tsx|ts|jsx|js)$/.test(name)) out.push(full)
    }
  }
  for (const top of ["app", "components", "lib", "hooks"]) {
    try {
      walk(join(root, top))
    } catch {
      /* a folder this repo does not have is not a failure */
    }
  }
  return out
}

function main() {
  console.log("\nNothing may use React as a value without importing it")

  const files = sourceFiles()
  check("there are source files to scan at all", files.length > 200, `${files.length} files`)

  const offenders: string[] = []
  for (const file of files) {
    const code = strip(readFileSync(file, "utf8"))
    const uses = [...code.matchAll(VALUE_USE)]
    if (!uses.length || importsReact(code)) continue
    const lines = [...new Set(uses.map((m) => code.slice(0, m.index).split("\n").length))]
    offenders.push(`${relative(root, file)} (line ${lines.join(", ")}: ${uses[0][0]})`)
  }

  check(
    "no file calls a React member it never imported",
    offenders.length === 0,
    offenders.length ? offenders.slice(0, 10).join("\n        ") : "",
  )

  /**
   * The check has to be able to fail, or it is decoration. Both directions:
   * it finds the bug that shipped, and it stays quiet about the spelling
   * that is safe.
   */
  const bug = `import { useRef } from "react"\nconst a = React.useRef(false)\n`
  check("it would have caught the line that shipped", VALUE_USE.test(bug) && !importsReact(bug))
  VALUE_USE.lastIndex = 0

  const fine = `import * as React from "react"\nconst a = React.useRef(false)\n`
  check("and it stays quiet when React really is imported", importsReact(fine))

  const typeOnly = `import { useRef } from "react"\nconst s: React.CSSProperties = {}\nconst n: React.ReactNode = null\n`
  VALUE_USE.lastIndex = 0
  check(
    "a type annotation is not flagged, because a type is erased and cannot throw",
    !VALUE_USE.test(typeOnly),
  )
  VALUE_USE.lastIndex = 0

  /**
   * The two lines that caused it are gone entirely: they drove the sidebar's
   * slide, and the sidebar no longer moves. What survives them is the scan
   * above, which is the general rule rather than a note about one file, and
   * this: the editor imports its hooks by name and still never imports React,
   * which is the condition that made `React.useRef` a ReferenceError.
   */
  const editor = readFileSync(join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8")
  check("the editor still imports its hooks by name", /import \{[^}]*useRef[^}]*\} from "react"/.test(editor))
  check("and still does not import React itself", !importsReact(strip(editor)))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
