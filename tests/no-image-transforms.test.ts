/**
 * ===========================================================================
 *  NO SUPABASE IMAGE TRANSFORMATIONS
 * ===========================================================================
 * Supabase meters Storage Image Transformations. This project hit 106/100 on a
 * plan with a spend cap, which means the next transformed image is not served
 * at all — a broken picture, not a bigger invoice.
 *
 * The whole cost came from three files and, in two of them, from a single
 * `String.replace` swapping one path segment:
 *
 *     /storage/v1/object/public/…      free, unmetered, CDN-cached
 *     /storage/v1/render/image/public/… metered, billed, capped
 *
 * That is far too small a thing to defend with a comment. It is one word in a
 * template literal, in a component, in a file nobody would open while
 * wondering where a storage bill came from — and it can come back the next
 * time somebody wants a smaller avatar and remembers that Supabase can do it.
 *
 * So it is a build failure instead. Sizing is CSS (`object-fit: cover` in a
 * fixed-ratio box) and compression happens ONCE at upload in the browser
 * (lib/images/compress.ts). Neither costs anything per view.
 *
 * The escape hatch, if a transform is ever genuinely justified:
 *
 *     // image-transform: allow — <why, and who is paying>
 *
 * Run with:  npm run test:push
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

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
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}

const ROOTS = ["app", "components", "lib", "hooks"]
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "out", ".git"])
const ESCAPE = "image-transform: allow"

function sources(dir: string): string[] {
  let out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    let s
    try {
      s = statSync(p)
    } catch {
      continue
    }
    if (s.isDirectory()) out = out.concat(sources(p))
    else if (/\.(ts|tsx|js|jsx|mjs|css)$/.test(p)) out.push(p)
  }
  return out
}

const FILES = ROOTS.flatMap(sources)

/**
 * Lines, minus the ones that only TALK about the endpoint.
 *
 * lib/storage/image-url.ts has to name `/render/image/` in order to rewrite it,
 * and this file has to name it in order to explain itself. A rule that cannot
 * tell a mention from a use is a rule that forbids documenting itself.
 */
function codeLines(src: string): Array<{ text: string; n: number }> {
  return src
    .split("\n")
    .map((text, i) => ({ text, n: i + 1 }))
    .filter(({ text }) => {
      const t = text.trim()
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return false
      return true
    })
}

function run() {
  section("no code builds a /render/image/ URL")
  {
    const offenders: string[] = []
    for (const file of FILES) {
      // The rewriter is allowed to name the thing it rewrites.
      if (file.endsWith("lib/storage/image-url.ts")) continue
      const src = readFileSync(file, "utf8")
      if (!src.includes("render/image")) continue
      for (const { text, n } of codeLines(src)) {
        if (!text.includes("render/image")) continue
        if (text.includes(ESCAPE)) continue
        offenders.push(`${file}:${n}`)
      }
    }
    check(
      "zero references to /render/image/",
      offenders.length === 0,
      offenders.length
        ? `          This is Supabase's METERED transformation endpoint.\n` +
          `          Use getStorageImageUrl() from lib/storage/image-url.ts and size with CSS.\n` +
          offenders.map((o) => `            ${o}`).join("\n")
        : undefined,
    )
  }

  section("no /object/public/ URL is rewritten into a render URL")
  {
    // The exact shape of the original bug, which no amount of renaming hides:
    // a replace whose target is the render path.
    const offenders: string[] = []
    for (const file of FILES) {
      if (file.endsWith("lib/storage/image-url.ts")) continue
      const src = readFileSync(file, "utf8")
      for (const { text, n } of codeLines(src)) {
        if (text.includes(ESCAPE)) continue
        if (/\.replace\([^)]*object\/public[^)]*render\/image/.test(text)) offenders.push(`${file}:${n}`)
      }
    }
    check("zero object→render rewrites", offenders.length === 0, offenders.map((o) => `            ${o}`).join("\n"))
  }

  section("no transform option is passed to Supabase storage")
  {
    // `transform` is the option name on getPublicUrl and createSignedUrl, and
    // it is the thing that bills. CSS `transform:` is everywhere in this
    // codebase and is unrelated — so this looks for the storage call and the
    // option together, within a few lines of each other, rather than for the
    // word on its own.
    const offenders: string[] = []
    for (const file of FILES) {
      const src = readFileSync(file, "utf8")
      if (!src.includes("getPublicUrl") && !src.includes("createSignedUrl")) continue
      const lines = src.split("\n")
      for (let i = 0; i < lines.length; i++) {
        if (!/getPublicUrl|createSignedUrl/.test(lines[i])) continue
        const window = lines.slice(i, Math.min(i + 8, lines.length)).join("\n")
        if (window.includes(ESCAPE)) continue
        if (/\btransform\s*:/.test(window)) offenders.push(`${file}:${i + 1}`)
      }
    }
    check(
      "no getPublicUrl/createSignedUrl passes transform",
      offenders.length === 0,
      offenders.length
        ? `          A transform option on a storage URL is a billed transformation.\n` +
          offenders.map((o) => `            ${o}`).join("\n")
        : undefined,
    )
  }

  section("no custom next/image loader that could reintroduce it")
  {
    let cfg = ""
    try {
      cfg = readFileSync("next.config.mjs", "utf8")
    } catch {
      try {
        cfg = readFileSync("next.config.js", "utf8")
      } catch {
        /* neither — reported as a pass, there is nothing to configure */
      }
    }
    check("next.config declares no custom image loader", !/loaderFile|loader\s*:/.test(cfg))

    const withLoaderProp = FILES.filter((f) => {
      const src = readFileSync(f, "utf8")
      return /<Image[^>]*\bloader=/.test(src)
    })
    check("no <Image loader={…}> in the app", withLoaderProp.length === 0, withLoaderProp.join("\n            "))
  }

  section("the safe helper is present and stays parameterless")
  {
    let src = ""
    try {
      src = readFileSync("lib/storage/image-url.ts", "utf8")
    } catch {
      /* reported below */
    }
    check("lib/storage/image-url.ts exists", src.length > 0)
    check(
      "getStorageImageUrl takes no width/height/quality",
      src.length > 0 &&
        !/export function getStorageImageUrl\([^)]*\b(width|height|quality|resize|format)\b/.test(src),
      `          The helper must have nowhere to put a size. That is what makes it safe.`,
    )
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nfailing: ${failures.join(", ")}`)
    process.exit(1)
  }
}

run()
