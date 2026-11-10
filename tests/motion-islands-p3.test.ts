/**
 * Round P (P3): motion islands, Storelib's own interactive effects that a
 * section configures with data attributes and never scripts.
 *
 *   1. The contract (lib/storelib-theme/motion-islands.ts): every island and
 *      param, numbers clamped and stepped, words from a fixed list, text made
 *      plain, palettes only keywords or hex; the mode each island runs in for
 *      reduced motion, low power, no WebGL, phones, touch and the canvas; the
 *      schema settings snippets compile as a real section's schema.
 *   2. The sandbox: a section's script may not set data-storelib-motion or
 *      any data-motion-* param (it can still set its own data-motion switch);
 *      the page's numbering skips the nodes an island adds.
 *   3. The render check knows the islands: an island element is never
 *      "empty", an unknown island is an error, a bad param a warning, too
 *      many showcases or WebGL islands a page warning.
 *   4. three.js stays out of every normal page: the published section's
 *      static import graph never reaches it, and in a real bundle of
 *      StorelibSection (esbuild, code splitting) it is only in a chunk
 *      reached by dynamic import.
 *   5. Nothing from the markup runs: the runtime has no innerHTML, eval or
 *      new Function, takes no URL from an attribute, and in the browser a
 *      hostile label stays text and a script inside a marquee never runs.
 *   6. The knowledge entry, the examples (compiled, drawn, render checked)
 *      and the prompt block.
 *   7. In Chromium (/opt/pw-browsers/chromium): every island mounts on a
 *      fixture page; scroll-scrub changes frames as the page scrolls, the
 *      pinned run moves sideways, the marquee loops and its copies are
 *      hidden and inert, the 3D object and the gradient draw with WebGL and
 *      change over time, a third WebGL island stays still; reduced motion
 *      gives the still page (no canvas, no copies, no running animation);
 *      no WebGL and low power keep the picture; a phone gets the simple
 *      versions with no sideways overflow; stopping puts the markup back
 *      byte for byte; the React entry remounts on an edit without doubling
 *      and pauses while a field on the canvas is being typed into.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/motion-islands-p3.test.ts
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import {
  MOTION_ISLANDS,
  MOTION_ISLAND_KINDS,
  MAX_GL_ISLANDS,
  motionAttributes,
  motionBaseCss,
  motionFindings,
  motionIslandsForPrompt,
  motionIslandsIn,
  motionMode,
  motionSchemaSettings,
  parseMotionKind,
  parseMotionParams,
  parseParam,
  parsePalette,
  type MotionEnvironment,
} from "@/lib/storelib-theme/motion-islands"
import { attrAllowed, acceptPatch } from "@/lib/storelib-theme/sandbox/protocol"
import { renderCheck, esbuildScriptParser } from "@/lib/ai-builder/render-check"
import { validateFile } from "@/lib/ai-builder/agent/validate"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { storefrontData } from "@/lib/website-builder/storefront-data"
import { exampleById, knowledgeById, runSearchKnowledge } from "@/lib/storelib-ai/library"
import { slopIssues } from "@/lib/ai-builder/slop"
import { AGENT_SYSTEM, briefMessage } from "@/lib/ai-builder/agent/prompts"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { fixture } from "./_motion/fixture"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const ENV: MotionEnvironment = { reducedMotion: false, lowPower: false, mobile: false, finePointer: true, webgl: true, inCanvas: false }

/* The examples this round adds (lib/storelib-ai/library/examples). */
const EXAMPLES = ["ai_object_hero", "ai_scrub_story", "ai_pin_gallery", "ai_gradient_marquee", "ai_image_trail"]

async function main() {
  console.log("\n1. the contract")
  {
    check("twelve islands, each with a spec, params and still, phone and low-power behaviour", MOTION_ISLAND_KINDS.length === 12 && MOTION_ISLAND_KINDS.every((k) => MOTION_ISLANDS[k].kind === k && !!MOTION_ISLANDS[k].reducedMotion && !!MOTION_ISLANDS[k].mobile && !!MOTION_ISLANDS[k].lowPower && Object.keys(MOTION_ISLANDS[k].params).length > 0))
    check("the asked-for islands are all there", ["scroll-scrub", "pin-horizontal", "parallax-depth", "3d-object", "3d-tilt", "webgl-gradient", "marquee", "text-scramble", "reveal-stagger", "smooth-scroll", "image-trail", "cursor-follow"].every((k) => (MOTION_ISLAND_KINDS as readonly string[]).includes(k)))
    check("only 3d-object loads three.js; only it and the gradient use WebGL", MOTION_ISLAND_KINDS.filter((k) => MOTION_ISLANDS[k].three).join() === "3d-object" && MOTION_ISLAND_KINDS.filter((k) => MOTION_ISLANDS[k].webgl).sort().join() === "3d-object,webgl-gradient")
    check("an island name is read loosely, an unknown one is null", parseMotionKind(" Marquee ") === "marquee" && parseMotionKind("warp-drive") === null && parseMotionKind(null) === null && parseMotionKind("<script>") === null)
    const speed = MOTION_ISLANDS.marquee.params.speed
    check("a number is clamped into its range", parseParam(speed, "99999") === 400 && parseParam(speed, "-5") === 10)
    check("and stepped, without float dust", parseParam(speed, "87") === 90 && parseParam(MOTION_ISLANDS["scroll-scrub"].params.length, "2.3") === 2.5 && parseParam(MOTION_ISLANDS["smooth-scroll"].params.damping, "0.137") === 0.14)
    check("not a number, empty or missing is the default", parseParam(speed, "fast") === 80 && parseParam(speed, "") === 80 && parseParam(speed, null) === 80 && parseParam(speed, "Infinity") === 80 && parseParam(speed, "1e3") === 400)
    const shape = MOTION_ISLANDS["3d-object"].params.shape
    check("a word must be one of the list", parseParam(shape, "TORUS") === "torus" && parseParam(shape, "teapot") === "card" && parseParam(shape, "card; drop") === "card")
    const glare = MOTION_ISLANDS["3d-tilt"].params.glare
    check("a yes or no", parseParam(glare, "false") === false && parseParam(glare, "off") === false && parseParam(glare, "") === true && parseParam(glare, "maybe") === true)
    const label = MOTION_ISLANDS["cursor-follow"].params.label
    const hostile = parseParam(label, `<img src=x onerror="alert(1)">{{ x }}`) as string
    check("a text param is plain words: no markup characters, braces or quotes, and short", !/[<>"'{}`\\]/.test(hostile) && hostile.length <= 24, hostile)
    check("a palette is a keyword or up to five hex colours, never anything else", parsePalette("ACCENT", "scheme")[0] === "accent" && parsePalette("#fff, #102030", "scheme").join() === "#ffffff,#102030" && parsePalette("url(x)", "scheme")[0] === "scheme" && parsePalette("red", "scheme")[0] === "scheme" && parsePalette("#111,#222,#333,#444,#555,#666", "scheme")[0] === "scheme" && parsePalette("javascript:alert(1)", "scheme")[0] === "scheme")
    const attrs: Record<string, string> = { "data-motion-shape": "knot", "data-motion-intensity": "500", "data-motion-color": "#abc", "data-motion-bogus": "1" }
    const params = parseMotionParams("3d-object", (a) => attrs[a])
    check("all params of an island read at once, defaults for the rest", params.shape === "knot" && params.intensity === 100 && (params.color as string[])[0] === "#aabbcc" && params.rotate === "both" && params.float === true && !("bogus" in params), params)
    check("no param of any island is a URL", MOTION_ISLAND_KINDS.every((k) => Object.entries(MOTION_ISLANDS[k].params).every(([nm, p]) => !/url|src|href/i.test(nm) && p.kind !== ("url" as never))))

    console.log("   modes")
    const m = (k: Parameters<typeof motionMode>[0], env: Partial<MotionEnvironment>, o = {}) => motionMode(k, { ...ENV, ...env }, o)
    check("reduced motion: every island still", MOTION_ISLAND_KINDS.every((k) => m(k, { reducedMotion: true }) === "static"))
    check("the section's own data-motion=\"off\": still", MOTION_ISLAND_KINDS.every((k) => m(k, {}, { off: true }) === "static"))
    check("no WebGL or low power: the WebGL islands still, the others run", m("3d-object", { webgl: false }) === "static" && m("webgl-gradient", { lowPower: true }) === "static" && m("marquee", { webgl: false, lowPower: true }) === "full")
    check("past the page's WebGL budget: still", m("webgl-gradient", {}, { glSlotsLeft: 0 }) === "static" && m("webgl-gradient", {}, { glSlotsLeft: 1 }) === "full" && MAX_GL_ISLANDS === 2)
    check("touch: tilt, image trail and cursor label still (hover only)", ["3d-tilt", "image-trail", "cursor-follow"].every((k) => m(k as never, { finePointer: false }) === "static"))
    check("phones: the pinned run is a native swipe, a scrub set to still is still, the rest simple", m("pin-horizontal", { mobile: true }) === "static" && m("scroll-scrub", { mobile: true }, { params: { mobile: "still" } }) === "static" && m("scroll-scrub", { mobile: true }) === "simple" && m("3d-object", { mobile: true }) === "simple")
    check("smooth-scroll never on the canvas, and anchors only on phones", m("smooth-scroll", { inCanvas: true }) === "static" && m("smooth-scroll", { mobile: true }) === "simple" && m("smooth-scroll", {}) === "full")

    console.log("   the editor's controls")
    for (const k of MOTION_ISLAND_KINDS) {
      const settings = motionSchemaSettings(k)
      const ok = settings.length === Object.keys(MOTION_ISLANDS[k].params).length && settings.every((s) => /^motion_[a-z_]+$/.test(s.id) && !!s.label && (s.type !== "range" || ((s.max! - s.min!) / s.step! <= 101 && Number(s.default) >= s.min! && Number(s.default) <= s.max!)) && (s.type !== "select" || s.options!.some((o) => o.value === s.default)))
      check(`${k}: its params as schema settings (ranges within 101 steps, defaults inside, selects with their default)`, ok, settings)
    }
    /* Every island's snippet in one real section: the compiler and the agent's strict check accept it. */
    for (const k of MOTION_ISLAND_KINDS) {
      const type = `ai_probe_${k.replace(/-/g, "_")}`
      const src = `<template>\n<section class="pr" ${motionAttributes(k)}><h2>{{ settings.heading }}</h2></section>\n</template>\n<style scoped>\n.pr { padding: 24px; }\n</style>\n<schema>\n${JSON.stringify({ schema_version: 1, type, name: "Probe", settings: [{ type: "text", id: "heading", label: "Heading", default: "Probe" }, ...motionSchemaSettings(k)], presets: [{ name: "Probe" }] }, null, 1)}\n</schema>\n`
      const inst = { id: `s-${type}`, type, name: "Probe", settings: {}, blocks: [] } as unknown as SectionInstance
      const errors = validateFile(`sections/${type}.storelib`, src, { instances: [inst], theme: { site_chrome: "home" } as never }).filter((i) => i.severity === "error")
      const drawn = renderStorelibSection(inst, { site_chrome: "home" } as unknown as ThemeSettingsValues, { template: "index" }, { [`sections/${type}.storelib`]: src })
      const uses = drawn.ok ? motionIslandsIn(drawn.html) : []
      check(`${k}: the settings snippet compiles in a section and prints valid params`, errors.length === 0 && drawn.ok && uses.length === 1 && uses[0].kind === k && uses[0].params.every((p) => p.known) && motionFindings(drawn.ok ? drawn.html : "").length === 0, { errors, uses, f: drawn.ok ? motionFindings(drawn.html) : drawn })
    }
  }

  console.log("\n2. the sandbox")
  {
    check("a script may not set data-storelib-motion or a data-motion-* param", !attrAllowed("data-storelib-motion") && !attrAllowed("data-motion-speed") && !attrAllowed("DATA-MOTION-SHAPE") && !attrAllowed("data-storelib-motion-node") && acceptPatch({ k: "attr", i: 1, n: "data-motion-intensity", v: "100" }) === null)
    check("it still may set its own data-motion switch and other data attributes", attrAllowed("data-motion") && attrAllowed("data-open") && attrAllowed("data-state"))
    const sandbox = read("components/website-builder/sections/section-sandbox.tsx")
    check("the page's numbering skips nodes an island added, so indexes match the guest's copy", /filter\(\(el\) => !el\.closest\(`\[\$\{MOTION_NODE_ATTR\}\]`\)\)/.test(sandbox))
    const section = read("components/website-builder/sections/StorelibSection.tsx")
    check("StorelibSection mounts the islands on the live site and the canvas, told which", /<MotionIslands root=\{scriptRoot\} html=\{html\} inCanvas=\{!!\(isEditing \|\| insideEditor \|\| inEditor\)\} \/>/.test(section))
    check("and prints the islands' structural CSS only for a section that has one", /asksMotion \? <style data-storelib-motion-css="" dangerouslySetInnerHTML=\{MOTION_CSS\} \/> : null/.test(section) && /const asksMotion = html\.includes\(MOTION_ATTR\)/.test(section))
    const css = motionBaseCss()
    check("the structural CSS moves nothing without prefers-reduced-motion: no-preference", /@media \(prefers-reduced-motion:no-preference\) and \(update:fast\)\{/.test(css) && !/animation\s*:|transition\s*:/.test(css) && /\[data-motion-pending\]\{opacity:0\}\s*\}/.test(css.replace(/\n/g, "")))
    check("and honours O5's data-motion=\"off\" around an island", /:not\(\[data-motion="off"\]\):not\(\[data-motion="off"\] \*\)/.test(css))
  }

  console.log("\n3. the render check")
  {
    const theme = { site_chrome: "home" } as unknown as ThemeSettingsValues
    const sec = (type: string, template: string) => ({
      instance: { id: `s-${type}`, type, name: type, settings: {}, blocks: [] } as unknown as SectionInstance,
      path: `sections/${type}.storelib`,
      src: `<template>\n${template}\n</template>\n<style scoped>\n.x { padding: 20px; }\n</style>\n<schema>\n{ "schema_version": 1, "type": "${type}", "name": "X", "settings": [] }\n</schema>\n`,
    })
    const run = async (parts: ReturnType<typeof sec>[]) => renderCheck({ page: "home", sections: parts.map((p) => p.instance), sources: Object.fromEntries(parts.map((p) => [p.path, p.src])), theme, template: "index" })
    const bg = sec("ai_bg", `<section class="x" data-storelib-motion="webgl-gradient" data-motion-palette="accent"></section>`)
    const r1 = await run([bg])
    check("a gradient island with nothing else in it is not \"empty\" (the page draws into it)", !r1.issues.some((i) => i.code === "render.empty") && !r1.issues.some((i) => i.code === "render.motion"), r1.issues)
    const bad = sec("ai_bad", `<section class="x" data-storelib-motion="warp-drive"><h2>Hi</h2></section>`)
    const r2 = await run([bad])
    check("an unknown island is an error the agent must fix", r2.issues.some((i) => i.code === "render.motion" && i.severity === "error" && /warp-drive/.test(i.message)), r2.issues)
    const range = sec("ai_range", `<section class="x" data-storelib-motion="marquee" data-motion-speed="9000" data-motion-wobble="1"><ul data-motion-track><li>A</li></ul></section>`)
    const r3 = await run([range])
    check("a param out of range or unknown is a warning, not an error", r3.issues.filter((i) => i.code === "render.motion").length === 2 && r3.issues.filter((i) => i.code === "render.motion").every((i) => i.severity === "warning"), r3.issues)
    const many = [0, 1, 2].map((i) => sec(`ai_obj${i}`, `<section class="x" data-storelib-motion="3d-object"><h2>Object ${i}</h2></section>`))
    const r4 = await run(many)
    check("three showcases and three WebGL islands on one page: page warnings", r4.issues.some((i) => i.code === "render.motion" && /showcase/.test(i.message)) && r4.issues.some((i) => i.code === "render.motion" && /WebGL/.test(i.message)) && !r4.issues.some((i) => i.code === "render.motion" && i.severity === "error"), r4.issues)
    const structural = sec("ai_struct", `<section class="x" data-storelib-motion="scroll-scrub" data-motion-length="2"><div data-motion-stage><img data-motion-frame src="/a.jpg" alt="Frame one"></div></section>`)
    const r5 = await run([structural])
    check("structural marks (data-motion-stage, -frame) are not taken for params", !r5.issues.some((i) => i.code === "render.motion"), r5.issues)
  }

  console.log("\n4. three.js stays out of normal pages")
  {
    /* The static import graph of the published section, by reading the sources. */
    const resolveImport = (from: string, spec: string): string | null => {
      const base = spec.startsWith("@/") ? join(root, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null
      if (!base) return null
      for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) if (existsSync(base + ext) && !base.endsWith("/") && (ext || /\.(ts|tsx)$/.test(base))) return base + ext
      return null
    }
    const seen = new Set<string>()
    const packages = new Set<string>()
    const walk = (file: string) => {
      if (seen.has(file)) return
      seen.add(file)
      const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
      /* Static imports and re-exports only; import("...") is a dynamic import and is the point. */
      for (const mm of src.matchAll(/^\s*(?:import|export)\s+(?:type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/gm)) {
        if (/^\s*(?:import|export)\s+type\b/.test(mm[0])) continue
        const spec = mm[1]
        const target = resolveImport(file, spec)
        if (target) walk(target)
        else if (!spec.startsWith(".") && !spec.startsWith("@/")) packages.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0])
      }
    }
    walk(join(root, "components/website-builder/sections/StorelibSection.tsx"))
    check("the published section's static imports never reach three or the 3D island", !packages.has("three") && ![...seen].some((f) => /object-3d|motion-islands\/(?:runtime|islands|webgl-gradient)\.ts$/.test(f)), [...packages].filter((p) => p === "three"))
    check("and it walked a real graph (sanity)", seen.size > 20 && packages.has("react"), seen.size)
    const importsThree = (f: string) => /from\s+["']three(?:\/|["'])/.test(read(f))
    const mi = "components/website-builder/motion-islands"
    check("only object-3d.ts imports three", importsThree(`${mi}/object-3d.ts`) && readdirSync(join(root, mi)).filter((f) => /\.tsx?$/.test(f) && f !== "object-3d.ts").every((f) => !importsThree(`${mi}/${f}`)))
    check("object-3d is reached only by a dynamic import, and the runtime only by one from the entry", /await import\("\.\/object-3d"\)/.test(read(`${mi}/islands.ts`)) && !/from "\.\/object-3d"/.test(read(`${mi}/islands.ts`) + read(`${mi}/runtime.ts`)) && /import\("\.\/runtime"\)/.test(read(`${mi}/index.tsx`)) && !/from "\.\/runtime"/.test(read(`${mi}/index.tsx`)))
    check("three is a pinned dependency (the same 0.183.1 globe.gl already brought in)", JSON.parse(read("package.json")).dependencies.three === "0.183.1" && /\n {6}three:\n {8}specifier: 0\.183\.1\n {8}version: 0\.183\.1/.test(read("pnpm-lock.yaml")))

    /* And in a real bundle: StorelibSection with code splitting, every other package left out. */
    const out = join(root, ".motion-p3-bundle")
    rmSync(out, { recursive: true, force: true })
    try {
      const { build } = await import("esbuild")
      const result = await build({
        entryPoints: { section: join(root, "components/website-builder/sections/StorelibSection.tsx") },
        bundle: true,
        splitting: true,
        format: "esm",
        outdir: out,
        metafile: true,
        write: true,
        minify: true,
        jsx: "automatic",
        logLevel: "silent",
        loader: { ".css": "empty" },
        alias: { "@": root },
        absWorkingDir: root,
        plugins: [{
          name: "only-three",
          setup(b) {
            b.onResolve({ filter: /^[^./]/ }, (args) => (args.path.startsWith("@/") || args.path === "three" || args.path.startsWith("three/") || args.path.startsWith(root) ? undefined : { path: args.path, external: true }))
          },
        }],
      })
      const outputs = result.metafile!.outputs
      const entry = Object.keys(outputs).find((k) => outputs[k].entryPoint?.endsWith("StorelibSection.tsx"))!
      const closure = new Set<string>()
      const visit = (k: string) => {
        if (closure.has(k)) return
        closure.add(k)
        for (const i of outputs[k].imports) if (i.kind === "import-statement" && outputs[i.path]) visit(i.path)
      }
      visit(entry)
      const withThree = Object.keys(outputs).filter((k) => Object.keys(outputs[k].inputs).some((i) => /node_modules\/(?:\.pnpm\/three@[^/]+\/node_modules\/)?three\//.test(i)))
      const sizeOf = (keys: Iterable<string>) => [...keys].reduce((a, k) => a + outputs[k].bytes, 0)
      check("in a real bundle, three is in a chunk of its own", withThree.length > 0, Object.keys(outputs))
      check("and no chunk the section loads up front has it", [...closure].every((k) => !withThree.includes(k)), { closure: [...closure], withThree })
      const runtimeIn = (k: string) => Object.keys(outputs[k].inputs).some((i) => /motion-islands\/(?:runtime|islands)\.ts$/.test(i))
      check("nor the islands' runtime: it loads only on a page with an island", [...closure].every((k) => !runtimeIn(k)))
      console.log(`        up front ${Math.round(sizeOf(closure) / 1024)} KB (minified, packages external); three's chunk ${Math.round(sizeOf(withThree) / 1024)} KB, loaded only by a 3d-object island`)
    } catch (e) {
      check("the bundle builds", false, String(e))
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }

  console.log("\n5. nothing from the markup runs")
  {
    const mi = "components/website-builder/motion-islands"
    const code = ["runtime.ts", "islands.ts", "webgl-gradient.ts", "object-3d.ts", "index.tsx"].map((f) => read(`${mi}/${f}`).replace(/\/\*[\s\S]*?\*\//g, "")).join("\n")
    check("no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval or new Function in the runtime", !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function/.test(code))
    check("no script element made, no attribute read as an address", !/createElement\(["']script/.test(code) && !/getAttribute\(["'](?:src|href|data-motion-[a-z-]*(?:url|src))/.test(code))
    check("the only address used is a picture's own (the 3D card's texture from its <img>)", (code.match(/\.src\s*=/g) ?? []).length === 1 && /img\.src = src/.test(code) && /picture\.currentSrc \|\| picture\.src/.test(code))
    check("a label is written as text", /textContent = str\(params\.label/.test(code))
  }

  console.log("\n6. what the agent knows")
  {
    const entry = knowledgeById("motion-islands")
    check("a knowledge entry for the islands", !!entry && entry.category === "motion" && MOTION_ISLAND_KINDS.every((k) => entry.body.includes(k)), entry?.id)
    check("search finds it for 3D, scroll scrubbing and WebGL asks", ["3d product rotating on scroll", "scroll scrub video", "webgl gradient background", "pinned horizontal scroll gallery"].every((q) => runSearchKnowledge({ query: q }).entries.slice(0, 5).some((e) => e.id === "motion-islands")), ["3d product rotating on scroll", "scroll scrub video"].map((q) => runSearchKnowledge({ query: q }).entries.slice(0, 5).map((e) => e.id)))
    const lib = knowledgeById("component-interactive-library")
    check("the interactive library lists the new examples", !!lib && EXAMPLES.every((id) => lib.body.includes(id)))
    const parse = await esbuildScriptParser()
    const theme = { site_chrome: "home" } as unknown as ThemeSettingsValues
    const data = storefrontData({ dynamic: { shop: { name: "Arc" }, creator: {} } as never, catalog: [], menus: {} as never })
    const CONCEPT = { name: "Arc", mood: ["technical"], styles: ["tech"], typeSystem: { display: "Space Grotesk", body: "Inter" }, palette: { background: "#0b0b10", text: "#f2f2f5", accent: "#ff5a36" }, layout: "", motion: "expressive", imagery: "", signatureMoves: [] } as never
    for (const id of EXAMPLES) {
      const ex = exampleById(id)
      if (!ex) {
        check(`${id}: exists`, false)
        continue
      }
      const path = `sections/${id}.storelib`
      const schema = JSON.parse(/<schema>([\s\S]*?)<\/schema>/.exec(ex.source)![1]) as { type: string; presets?: { blocks?: { type: string; settings?: Record<string, unknown> }[] }[] }
      const blocks = (schema.presets?.[0]?.blocks ?? []).map((b, i) => ({ id: `b${i}`, type: b.type, settings: b.settings ?? {} }))
      const inst = { id: `s-${id}`, type: id, name: id, settings: {}, blocks } as unknown as SectionInstance
      const errors = validateFile(path, ex.source, { instances: [inst], theme: theme as never }).filter((i) => i.severity === "error")
      check(`${id}: passes the agent's file check`, errors.length === 0, errors)
      const drawn = renderStorelibSection(inst, theme, { template: "index" }, { [path]: ex.source }, undefined, data)
      const uses = drawn.ok ? motionIslandsIn(drawn.html) : []
      check(`${id}: draws with its preset blocks and asks for known islands with valid params`, drawn.ok && uses.length > 0 && uses.every((u) => u.known) && motionFindings(drawn.ok ? drawn.html : "").filter((f) => f.severity === "error" || /outside|not one of|not a param/.test(f.message)).length === 0, drawn.ok ? motionFindings(drawn.html) : drawn)
      const r = await renderCheck({ page: "home", sections: [inst], sources: { [path]: ex.source }, theme, template: "index", data, parseScript: parse ?? undefined, extraRoutes: ["/shop", "/about", "/contact", "/work"] })
      check(`${id}: the render check finds no error`, r.issues.filter((i) => i.severity === "error").length === 0, r.issues.filter((i) => i.severity === "error"))
      const slop = slopIssues({ sources: [{ path, content: ex.source }] }, CONCEPT).filter((i) => i.severity === "error")
      check(`${id}: no anti-slop error, no em dash`, slop.length === 0 && !/—/.test(ex.source), slop)
      check(`${id}: its motion params are schema settings the creator edits`, /data-motion-[a-z-]+="\{\{ settings\.motion_[a-z_]+ \}\}"/.test(ex.source))
      check(`${id}: no script of its own (the island does the work)`, !/<script>/.test(ex.source))
    }
    const block = motionIslandsForPrompt()
    check("the prompt block names every island, its params, the budget and the still state", MOTION_ISLAND_KINDS.every((k) => block.includes(`- ${k}:`)) && /one showcase per page/.test(block) && /still state/.test(block) && /No param is a URL/.test(block) && !/—/.test(block))
    const brief = briefMessage({ job: { jobId: "j", installId: "i", creatorId: "c1", prompt: "A launch site for a mechanical watch", mode: "blank", options: { generation: "blank" } } as never, caps: null, pages: [{ key: "home", sections: [] }], files: [], knowledge: [] })
    check("the agent is told: the system prompt or the new site's brief carries the block", AGENT_SYSTEM.includes("MOTION ISLANDS") || brief.includes("MOTION ISLANDS"))
    const edit = briefMessage({ job: { jobId: "j", installId: "i", creatorId: "c1", prompt: "Make the hero calmer", mode: "blank", edit: true } as never, caps: null, pages: [{ key: "home", sections: [] }], files: [], knowledge: [] })
    check("an edit job is not handed the whole block again unless the system prompt has it", AGENT_SYSTEM.includes("MOTION ISLANDS") || !edit.includes("MOTION ISLANDS"))
  }

  await inBrowser()

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

/* ── the browser ──────────────────────────────────────────────────────── */

const ORIGIN = "https://motion.example"
async function inBrowser() {
  console.log("\n7. in Chromium")
  const chrome = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) {
    check("Chromium is here for the browser checks", false, `no browser at ${chrome}; set CHROMIUM_PATH`)
    return
  }
  const stubs = join(root, ".motion-p3-probe")
  mkdirSync(stubs, { recursive: true })
  try {
    const { build } = await import("esbuild")
    await build({
      entryPoints: [join(root, "tests/_motion/probe.tsx")],
      bundle: true,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": "." },
      outfile: join(stubs, "app.js"),
      logLevel: "error",
      absWorkingDir: root,
      nodePaths: [join(root, "node_modules")],
    })
    const js = readFileSync(join(stubs, "app.js"), "utf8")
    const page = (env: Partial<MotionEnvironment> | null) =>
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${motionBaseCss()}body{margin:0;font:16px sans-serif}</style></head><body><input id="field" aria-label="Field"><div id="fixture-host"></div><div id="react-host"></div><section id="react-section"></section>` +
      `<script>${env ? `window.__storelibMotionEnv=${JSON.stringify(env)};` : ""}document.getElementById("fixture-host").innerHTML=${JSON.stringify(fixture()).replace(/</g, "\\u003c")};</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

    const puppeteer = (await import("puppeteer-core")).default
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] })
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    try {
      const open = async (env: Partial<MotionEnvironment> | null, opts: { width?: number; height?: number; reduced?: boolean } = {}) => {
        const p = await browser.newPage()
        const errors: string[] = []
        p.on("pageerror", (e) => errors.push(String((e as Error).message || e)))
        await p.setViewport({ width: opts.width ?? 1280, height: opts.height ?? 800 })
        if (opts.reduced) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
        const html = page(env)
        await p.setRequestInterception(true)
        p.on("request", (r) => (r.url().startsWith(ORIGIN) ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.respond({ status: 204, body: "" })))
        await p.goto(`${ORIGIN}/`, { waitUntil: "load" })
        return { p, errors }
      }
      /* The markup, with each style attribute as the browser reads it (a style property set and taken away again is the same style). */
      const snapshot = (p: import("puppeteer-core").Page) => p.evaluate(`(function () {
        var c = document.getElementById("fixture").cloneNode(true);
        c.querySelectorAll("[style]").forEach(function (e) { var t = e.style.cssText; if (t) e.setAttribute("style", t); else e.removeAttribute("style"); });
        return c.innerHTML;
      })()`) as Promise<string>
      const scrollTo = async (p: import("puppeteer-core").Page, y: number) => {
        await p.evaluate((yy) => window.scrollTo({ top: yy, behavior: "instant" as ScrollBehavior }), y)
        await sleep(120)
      }
      const top = (p: import("puppeteer-core").Page, id: string) => p.evaluate((i) => document.getElementById(i)!.getBoundingClientRect().top + window.scrollY, id)

      /* ── A: a desktop with everything ── */
      {
        const { p, errors } = await open({ reducedMotion: false, lowPower: false, mobile: false, finePointer: true, webgl: true })
        const before = await snapshot(p)
        await p.evaluate(() => (window as unknown as { __motion: { mount(c?: boolean): void } }).__motion.mount())
        await sleep(1200)
        const modes = await p.evaluate(() => (window as unknown as { __motion: { modes(): Record<string, string> } }).__motion.modes())
        const want = ["gradient", "scramble", "object", "tilt", "trail", "cursor", "marquee", "scrub", "pin", "parallax", "reveal", "smooth"]
        check("desktop: every island mounts in full", want.every((id) => modes[id] === "full"), modes)
        check("a third WebGL island on the page stays still (the budget is two)", modes.shape === "static")
        check("an unknown island is left alone", !("unknown" in modes) && (await p.evaluate(() => !document.getElementById("unknown")!.hasAttribute("data-motion-mode"))))
        const ready = await p.evaluate((ids: string[]) => ids.filter((i) => !document.getElementById(i)!.hasAttribute("data-motion-ready")), want)
        check("and each running island is marked ready for its own CSS", ready.length === 0, ready)

        /* 3D object and the gradient: WebGL canvases that change over time. */
        const gl = await p.evaluate(() => ({
          object: !!document.querySelector("#object > canvas[data-storelib-motion-node]"),
          picture: getComputedStyle(document.querySelector("#object img")!).opacity,
          gradient: !!document.querySelector("#gradient > canvas[data-storelib-motion-node]"),
          shapeCanvas: !!document.querySelector("#shape canvas"),
        }))
        check("3d-object: a WebGL canvas, the picture stepped back (kept for screen readers)", gl.object && gl.picture === "0", gl)
        check("webgl-gradient: its canvas behind the content", gl.gradient && !gl.shapeCanvas, gl)
        await scrollTo(p, 0)
        /* The page as painted, without resizing the viewport for the capture (that would fire media queries). */
        const shot = async (id: string) => {
          const b = (await (await p.$(`#${id}`))!.boundingBox())!
          return String(await p.screenshot({ clip: { x: b.x, y: b.y, width: Math.min(b.width, 1280), height: Math.min(b.height, 800 - b.y) }, encoding: "base64", captureBeyondViewport: false }))
        }
        const g1 = await shot("gradient")
        const o1 = await shot("object")
        await sleep(600)
        const g2 = await shot("gradient")
        const o2 = await shot("object")
        check("the gradient moves", g1 !== g2)
        check("the 3D card turns", o1 !== o2)

        /* text-scramble: it decodes, then the words are back. */
        await scrollTo(p, (await top(p, "scramble")) - 300)
        const scrambled = await p.evaluate(async () => {
          const h = document.getElementById("scramble")!
          const seen = new Set<string>()
          for (let i = 0; i < 10; i++) {
            seen.add(h.textContent ?? "")
            await new Promise((r) => setTimeout(r, 40))
          }
          return [...seen]
        })
        check("text-scramble: the heading decodes through other characters", scrambled.some((t) => t !== "Signal received"), scrambled)
        await sleep(1700)
        check("and ends on its own words", (await p.evaluate(() => document.getElementById("scramble")!.textContent)) === "Signal received")

        await scrollTo(p, (await top(p, "marquee")) - 300)
        /* marquee: loops, copies hidden and inert, its script never ran. */
        const mq = await p.evaluate(async () => {
          const t = document.querySelector<HTMLElement>("#marquee [data-motion-track]")!
          const a = t.style.transform
          await new Promise((r) => setTimeout(r, 300))
          const copies = Array.from(t.querySelectorAll<HTMLElement>(":scope > [data-storelib-motion-node]"))
          return { a, b: t.style.transform, copies: copies.length, hidden: copies.every((c) => c.getAttribute("aria-hidden") === "true" && c.hasAttribute("inert")), ids: copies.some((c) => c.id || c.querySelector("[id]") || c.hasAttribute("data-block-id")), ran: (window as unknown as { __ran?: number }).__ran ?? 0 }
        })
        check("marquee: it runs", mq.a !== mq.b && /translate3d\(-/.test(mq.b), mq)
        check("its copies are hidden from assistive tech, inert, with no ids or block ids", mq.copies >= 3 && mq.hidden && !mq.ids, mq)
        check("a script inside the markup never runs, not even in a copy", mq.ran === 0, mq)

        /* scroll-scrub: frames change as the page scrolls. */
        const scrubTop = await top(p, "scrub")
        const scrubH = await p.evaluate(() => document.getElementById("scrub")!.offsetHeight)
        check("scroll-scrub: three screens tall from the CSS", scrubH >= 800 * 3 - 2, scrubH)
        /* smooth-scroll is on this page: the scrub glides to the scroll, so give it a moment to arrive. */
        const frameAt = async (y: number) => {
          await scrollTo(p, y)
          await sleep(900)
          return p.evaluate(() => {
            const fs = Array.from(document.querySelectorAll("#scrub [data-motion-frame]"))
            const i = fs.findIndex((f) => f.hasAttribute("data-motion-active"))
            return { i, visible: i >= 0 ? getComputedStyle(fs[i]).opacity : "", progress: document.getElementById("scrub")!.style.getPropertyValue("--motion-progress") }
          })
        }
        const run = scrubH - 800
        const f0 = await frameAt(scrubTop)
        const f1 = await frameAt(scrubTop + run * 0.5)
        const f2 = await frameAt(scrubTop + run)
        check("frame 0 at the start, the middle in the middle, the last at the end", f0.i === 0 && f1.i >= 4 && f1.i <= 7 && f2.i === 11, [f0, f1, f2])
        check("the active frame is the one shown, and the progress is on the island", f1.visible === "1" && Number(f1.progress) > 0.4 && Number(f1.progress) < 0.6, f1)

        /* pin-horizontal: pinned and moving sideways. */
        const pinTop = await top(p, "pin")
        const pin = await p.evaluate(() => ({ h: document.getElementById("pin")!.offsetHeight, w: document.querySelector<HTMLElement>("#pin [data-motion-track]")!.scrollWidth }))
        check("pin-horizontal: the island is as tall as the track's run", pin.h > 1500, pin)
        await scrollTo(p, pinTop + (pin.h - 800) / 2)
        const pinMid = await p.evaluate(() => ({ t: document.querySelector<HTMLElement>("#pin [data-motion-track]")!.style.transform, stage: document.querySelector("#pin [data-motion-stage]")!.getBoundingClientRect().top }))
        const x = Number(/translate3d\((-?[\d.]+)px/.exec(pinMid.t)?.[1] ?? 0)
        check("halfway down, the stage is pinned and the track halfway along", Math.abs(pinMid.stage) < 2 && x < -500, pinMid)

        /* parallax-depth: a layer moves with the scroll, a depth 0 layer does not. */
        const parTop = await top(p, "parallax")
        await scrollTo(p, parTop - 600)
        await sleep(300)
        const pa = await p.evaluate(() => document.getElementById("layer")!.style.transform)
        await scrollTo(p, parTop + 200)
        await sleep(400)
        const pb = await p.evaluate(() => ({ t: document.getElementById("layer")!.style.transform, still: document.getElementById("still-layer")!.style.transform }))
        check("parallax-depth: a layer drifts with the scroll, a depth 0 layer stays", pa !== pb.t && pb.still === "", { pa, pb })

        /* reveal-stagger: waited below the fold, shown when reached. */
        const revealTop = await top(p, "reveal")
        await scrollTo(p, revealTop - 400)
        await sleep(900)
        const rv = await p.evaluate(() => Array.from(document.querySelectorAll("#reveal li")).map((li) => [li.hasAttribute("data-motion-pending"), getComputedStyle(li).opacity]))
        check("reveal-stagger: items arrive when reached and end fully visible", rv.every(([pending, op]) => pending === false && op === "1"), rv)

        /* hover islands, with a real mouse. */
        const box = async (id: string) => {
          await scrollTo(p, (await top(p, id)) - 100)
          return (await (await p.$(`#${id}`))!.boundingBox())!
        }
        const tb = await box("tilt")
        await p.mouse.move(tb.x + 10, tb.y + 10)
        await p.mouse.move(tb.x + tb.width - 10, tb.y + 20, { steps: 4 })
        await sleep(300)
        check("3d-tilt: the card leans toward the pointer", await p.evaluate(() => /rotateX\((?!0\.00deg)-?[\d.]+deg\)/.test(document.getElementById("tilt")!.style.transform)))
        const trb = await box("trail")
        await p.mouse.move(trb.x + 10, trb.y + 100)
        await p.mouse.move(trb.x + 400, trb.y + 150, { steps: 12 })
        await sleep(200)
        check("image-trail: pictures appear under the moving pointer", await p.evaluate(() => Array.from(document.querySelectorAll<HTMLImageElement>("#trail img")).filter((i) => Number(getComputedStyle(i).opacity) > 0.3).length >= 2))
        const cb = await box("cursor")
        await p.mouse.move(cb.x + 50, cb.y + 50)
        await p.mouse.move(cb.x + 200, cb.y + 100, { steps: 5 })
        await sleep(400)
        const cur = await p.evaluate(() => {
          const f = document.querySelector<HTMLElement>("#cursor [data-storelib-motion-node]")!
          return { op: getComputedStyle(f).opacity, text: f.textContent ?? "", children: f.children.length, xss: (window as unknown as { __xss?: number }).__xss ?? 0, cursor: getComputedStyle(document.getElementById("cursor")!).cursor }
        })
        check("cursor-follow: the label follows the pointer; the system cursor stays", cur.op === "1" && cur.cursor !== "none", cur)
        check("a hostile label is plain text: no element, nothing ran", cur.children === 0 && !/[<>"]/.test(cur.text) && cur.xss === 0, cur)
        check("smooth-scroll: anchor links travel, the page still scrolls natively", await p.evaluate(() => document.documentElement.style.scrollBehavior === "smooth" && getComputedStyle(document.documentElement).overflowY !== "hidden" && getComputedStyle(document.body).overflowY !== "hidden"))

        /* Stopped: the markup is what was drawn. */
        await p.evaluate(() => (window as unknown as { __motion: { stop(): void } }).__motion.stop())
        await sleep(100)
        const after = await snapshot(p)
        const state = await p.evaluate(() => ({ s: (window as unknown as { __motion: { state(): { running: number; looping: boolean; glInUse: number } } }).__motion.state(), behaviour: document.documentElement.style.scrollBehavior, nodes: document.querySelectorAll("[data-storelib-motion-node]").length }))
        check("stopping puts every island's markup back exactly as drawn", after === before, after === before ? "" : diffAt(before, after))
        check("and leaves nothing running: no loop, no WebGL, no added node, the page's scroll as it was", state.s.running === 0 && !state.s.looping && state.s.glInUse === 0 && state.nodes === 0 && state.behaviour === "", state)
        check("no error on the page", errors.length === 0, errors)
        await p.close()
      }

      /* ── B: reduced motion: the still page ── */
      {
        const { p, errors } = await open({ lowPower: false, mobile: false, finePointer: true, webgl: true }, { reduced: true })
        await p.evaluate(() => (window as unknown as { __motion: { mount(): void } }).__motion.mount())
        await sleep(800)
        const r = await p.evaluate(() => ({
          modes: (window as unknown as { __motion: { modes(): Record<string, string> } }).__motion.modes(),
          canvases: document.querySelectorAll("canvas").length,
          copies: document.querySelectorAll("#marquee [data-storelib-motion-node]").length,
          scrubH: document.getElementById("scrub")!.offsetHeight,
          still: Array.from(document.querySelectorAll("#scrub [data-motion-frame]")).findIndex((f) => f.hasAttribute("data-motion-active")),
          stillShown: getComputedStyle(document.querySelector("#scrub [data-motion-frame]")!).opacity,
          track: getComputedStyle(document.querySelector("#pin [data-motion-track]")!).overflowX,
          gradient: (document.querySelector<HTMLElement>("#gradient > [data-storelib-motion-node]")?.style.background ?? "").includes("gradient"),
          heading: document.getElementById("scramble")!.textContent,
          picture: getComputedStyle(document.querySelector("#object img")!).opacity,
          animations: document.getAnimations().length,
          looping: (window as unknown as { __motion: { state(): { looping: boolean } } }).__motion.state().looping,
          pending: document.querySelectorAll("[data-motion-pending]").length,
        }))
        check("reduced motion: every island still", Object.entries(r.modes).every(([, m]) => m === "static"), r.modes)
        check("no canvas, no marquee copies, no running animation, no loop", r.canvases === 0 && r.copies === 0 && r.animations === 0 && !r.looping, r)
        check("the scrub is its still frame in normal flow; the sideways run a native swipe", r.scrubH < 800 && r.still === 0 && r.stillShown === "1" && r.track === "auto", r)
        check("the gradient is the same colours as still CSS; words, picture and list all visible", r.gradient && r.heading === "Signal received" && r.picture === "1" && r.pending === 0, r)
        check("no error", errors.length === 0, errors)
        await p.close()
      }

      /* ── C and D: no WebGL, and a low-power device ── */
      for (const [label, env] of [["no WebGL", { webgl: false }], ["low power", { webgl: true, lowPower: true }]] as const) {
        const { p, errors } = await open({ reducedMotion: false, lowPower: false, mobile: false, finePointer: true, ...env })
        await p.evaluate(() => (window as unknown as { __motion: { mount(): void } }).__motion.mount())
        await sleep(800)
        const r = await p.evaluate(() => ({
          modes: (window as unknown as { __motion: { modes(): Record<string, string> } }).__motion.modes(),
          canvases: document.querySelectorAll("canvas").length,
          picture: getComputedStyle(document.querySelector("#object img")!).opacity,
          gradient: (document.querySelector<HTMLElement>("#gradient > [data-storelib-motion-node]")?.style.background ?? "").includes("gradient"),
        }))
        check(`${label}: the 3D object is its picture and the gradient still CSS, no canvas`, r.modes.object === "static" && r.modes.gradient === "static" && r.canvases === 0 && r.picture === "1" && r.gradient, r)
        check(`${label}: the other islands still run`, r.modes.marquee === "full" && r.modes.scrub === "full" && r.modes.pin === "full", r.modes)
        check(`${label}: no error`, errors.length === 0, errors)
        await p.close()
      }

      /* ── E: a phone ── */
      {
        const { p, errors } = await open({ reducedMotion: false, lowPower: false, mobile: true, finePointer: false, webgl: true }, { width: 390, height: 844 })
        await p.evaluate(() => (window as unknown as { __motion: { mount(): void } }).__motion.mount())
        await sleep(1000)
        const r = await p.evaluate(() => ({
          modes: (window as unknown as { __motion: { modes(): Record<string, string> } }).__motion.modes(),
          track: getComputedStyle(document.querySelector("#pin [data-motion-track]")!).overflowX,
          sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          follower: document.querySelectorAll("#cursor [data-storelib-motion-node]").length,
        }))
        check("phone: the pinned run is a native swipe; hover islands off; the rest simple", r.modes.pin === "static" && r.track === "auto" && r.modes.tilt === "static" && r.modes.cursor === "static" && r.modes.trail === "static" && r.follower === 0 && r.modes.scrub === "simple" && r.modes.marquee === "simple" && r.modes.object === "simple", r)
        check("phone: nothing scrolls the page sideways", r.sideways <= 0, r.sideways)
        check("phone: no error", errors.length === 0, errors)
        await p.close()
      }

      /* ── F: the React entry on the canvas ── */
      {
        const { p, errors } = await open({ reducedMotion: false, lowPower: false, mobile: false, finePointer: true, webgl: true })
        const marqueeHtml = (word: string) => `<div id="rmq" data-storelib-motion="marquee" data-motion-speed="300"><ul data-motion-track style="display:flex;gap:30px;margin:0;padding:0;list-style:none"><li>${word}</li><li>Two</li></ul></div>`
        const draw = (html: string) => p.evaluate((h) => {
          document.getElementById("react-section")!.innerHTML = h
          ;(window as unknown as { __motion: { react(h: string, c: boolean): void } }).__motion.react(h, true)
        }, html)
        await p.evaluate(() => window.scrollTo(0, 0))
        await p.evaluate(() => { const s = document.getElementById("react-section")!; document.body.prepend(s) })
        await draw(marqueeHtml("One"))
        await sleep(600)
        const count = () => p.evaluate(() => document.querySelectorAll("#rmq [data-storelib-motion-node]").length)
        const first = await count()
        const t = () => p.evaluate(() => document.querySelector<HTMLElement>("#rmq [data-motion-track]")!.style.transform)
        check("React entry: the runtime loads only for a section with an island, and the island runs", first > 0 && (await p.evaluate(() => document.getElementById("rmq")!.hasAttribute("data-motion-ready"))), first)
        await p.focus("#field")
        await sleep(100)
        const a = await t()
        await sleep(300)
        const b = await t()
        const st = await p.evaluate(() => (window as unknown as { __motion: { state(): { editing: boolean; looping: boolean } } }).__motion.state())
        check("canvas: typing into a field pauses every island", a === b && st.editing && !st.looping, { a, b, st })
        await p.evaluate(() => (document.activeElement as HTMLElement).blur())
        await sleep(300)
        check("and it carries on after", (await t()) !== b)
        /* An edit: the section's markup changes; the islands stop, the markup is replaced, they start again once. */
        await p.evaluate((h) => {
          ;(window as unknown as { __motion: { react(h: string, c: boolean): void } }).__motion.react(h, true)
        }, marqueeHtml("Uno"))
        await sleep(600)
        check("an edit remounts without doubling the copies", (await count()) === first, { first, now: await count() })
        await p.evaluate(() => (window as unknown as { __motion: { unreact(): void } }).__motion.unreact())
        await sleep(100)
        check("leaving takes everything away", (await count()) === 0 && !(await p.evaluate(() => document.getElementById("rmq")!.hasAttribute("data-motion-ready"))))
        check("React entry: no error", errors.length === 0, errors)
        await p.close()
      }
    } finally {
      await browser.close()
    }
  } catch (e) {
    check("the browser checks ran", false, String((e as Error)?.stack ?? e))
  } finally {
    rmSync(stubs, { recursive: true, force: true })
  }
}

function diffAt(a: string, b: string): string {
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  return `first difference at ${i}: drawn "${a.slice(Math.max(0, i - 80), i + 80)}" / after "${b.slice(Math.max(0, i - 80), i + 80)}"`
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
