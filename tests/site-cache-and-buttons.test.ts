/**
 * ===========================================================================
 *  THE TWO IMPROVEMENTS, AND THE RULES THEY MUST NOT BREAK
 * ===========================================================================
 * 1. A button you fill and never name the label of is caught at SAVE, with
 *    the line, like every other mistake in a section file.
 * 2. The preview has an address of its own, so the public routes read no
 *    query string and a published site can be held at the edge.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { readdirSync } from "node:fs"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const withCss = (css: string) =>
  `<template><section class="s"><a class="s__btn" href="#">Go</a></section></template>
<style>${css}</style>
<schema>{"type":"t","name":"T","settings":[]}</schema>`
const compiles = (css: string) => compileSection(withCss(css), { file: "sections/t.storelib", expectType: "t" }).ok === true
const errorsFor = (css: string) => {
  const r = compileSection(withCss(css), { file: "sections/t.storelib", expectType: "t" })
  return r.ok === false ? r.errors : []
}

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("A filled button with no label colour is refused, at the line")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const errs = errorsFor(".s__btn { background: #fff; padding: 8px }")
    check("it is refused", errs.length === 1)
    check("and it says which rule", errs[0]?.message.includes(".s__btn"), errs[0]?.message)
    check("and points at the line", typeof errs[0]?.line === "number", JSON.stringify(errs[0]))
    check("and names the variable to reach for", errs[0]?.message.includes("--s-btn-text"))

    check("naming the colour is enough", compiles(".s__btn { background: #fff; color: #111 }"))
    check("the scheme's own variables are fine", compiles(".s__btn { background: var(--s-btn); color: var(--s-btn-text) }"))
    check("background-color counts as a fill", !compiles(".my-button { background-color: #0a0 }"))
    check("and so does a shorthand with an image in it", !compiles(".btn { background: #fff url(x) }"))
  }

  section("And it keeps quiet about everything that is not that")
  {
    /**
     * A check that shouts about rules people write on purpose is a check
     * people learn to work around, so it is narrow: only a real fill, only
     * on something that says it is a button, never on a state or a part.
     */
    check("transparent is not a fill", compiles(".s__btn { background: transparent; border: 1px solid }"))
    check("nor is none, inherit or unset", compiles(".s__btn { background: none }") && compiles(".s__btn { background: inherit }"))
    check("a hover state changes one thing and inherits the rest", compiles(".s__btn:hover { background: #eee }"))
    check("so does focus", compiles(".s__btn:focus-visible { background: #eee }"))
    check("a part is not the button", compiles(".s__btn::before { background: #fff }"))
    check("and a card is none of its business", compiles(".card { background: #fff }"))
    check("nor is a rule that only sets a border", compiles(".s__btn { border-color: #fff }"))

    /** The 32 that ship are the real regression test. */
    const dir = "themes/default/sections"
    const broke = readdirSync(join(root, dir)).filter((f) => f.endsWith(".storelib")).filter((f) => {
      const t = f.replace(/\.storelib$/, "")
      return compileSection(read(`${dir}/${f}`), { file: `sections/${f}`, expectType: t }).ok === false
    })
    check(`every shipped section still compiles (${readdirSync(join(root, dir)).filter((f) => f.endsWith(".storelib")).length} files)`, broke.length === 0, broke.join(", "))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The preview has an address of its own")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const home = read("app/(marketing)/w/[username]/preview/[token]/page.tsx")
    const sub = read("app/(marketing)/w/[username]/preview/[token]/[page]/page.tsx")
    const api = read("app/api/website-builder/themes/[installId]/preview/route.ts")
    const panel = read("components/website-builder/publish-panel.tsx")
    const site = read("app/(marketing)/w/[username]/render-site.tsx")

    check("the token is a path segment", /params: Promise<\{ username: string; token: string/.test(home))
    check("a segment that is not token-shaped is not a page", /if \(!tokenOf\(token\)\) return \{ title: "Not Found"/.test(home) && /const clean = tokenOf\(token\)\s*\n\s*if \(!clean\) notFound\(\)/.test(home))
    check("it is never indexed", /robots: \{ index: false, follow: false \}/.test(home) && /robots: \{ index: false, follow: false \}/.test(sub))
    check("it is never cached", /export const dynamic = "force-dynamic"/.test(home) && /export const dynamic = "force-dynamic"/.test(sub))
    check("sub-pages have one too", /pageKeyFromSegment\(page\)/.test(sub))
    check("the link that is handed out is the path form", /\$\{origin\.replace\(\/\\\/\$\/, ""\)\}\/preview\/\$\{token\}/.test(api) && /\$\{websiteUrl\.replace\(\/\\\/\$\/, ""\)\}\/preview\/\$\{previewToken\}/.test(panel))
    /**
     * Every link already shared is `?preview=`, and those must keep working
     * or turning this on would break what people had already sent out.
     */
    check("and the old query form still works", /previewToken \?\? previewTokenFrom\(paramsToSearch\(searchParams\)\)/.test(site))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("So a published site can be held at the edge")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const proxy = read("proxy.ts")
    const site = read("app/(marketing)/w/[username]/render-site.tsx")

    check("a site is cached for a minute, with a window to serve stale in", /if \(isWebsite && !pathname\.startsWith\("\/preview\/"\)\) \{[\s\S]{0,120}"public, s-maxage=60, stale-while-revalidate=300"/.test(proxy))
    check("and a preview never is", /if \(pathname\.startsWith\("\/preview\/"\)\) \{[\s\S]{0,120}"private, no-store"/.test(proxy))
    /**
     * `cookies()` makes a route dynamic whatever else it does, and a
     * published site's title and favicon are the same for everybody. Reading
     * them through the viewer's client was the last per-request thing on the
     * path.
     */
    check("nothing on the public path asks who is looking", !/from "@\/lib\/supabase\/server"/.test(site) && /const supabase = createAdminClient\(\)/.test(site))

    /**
     * The CREATOR page is the opposite: an Edit button, owner menus, a
     * follow state. It keeps its private caching, and mixing the two up
     * would serve one visitor's rendering to another.
     */
    check("the creator page is still private", /rewritePath\.startsWith\("\/u\/"\)[\s\S]{0,200}"private, no-cache, must-revalidate"/.test(proxy))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
