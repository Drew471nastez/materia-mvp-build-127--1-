/**
 * The shape of a project, without reading it.
 *
 * ---------------------------------------------------------------------------
 *  WHAT THE AGENT USED TO GET, AND WHY IT READ TOO MUCH
 * ---------------------------------------------------------------------------
 * A list of paths and a list of component names. Which is enough to know that
 * `src/components/Hero.tsx` exists, and nothing at all about what it exports,
 * what it renders, or who renders it — so the only way to find out was to read
 * the file. Asked to change something that spans a few components, the model's
 * cheapest correct strategy was to read most of the project, and the cost of
 * that compounds: every file read is resent on every turn that follows it.
 *
 * A map answers the questions that reads were being spent on. `Hero` is a
 * default export in `src/components/Hero.tsx`, it is used by `src/App.tsx`,
 * and it renders `Button` — three facts that cost about a line each and used
 * to cost three file reads.
 *
 * ---------------------------------------------------------------------------
 *  LINE-ANCHORED PATTERNS, NOT A PARSER
 * ---------------------------------------------------------------------------
 * The obvious implementation is TypeScript's parser, and it was the first one
 * tried. It cannot be: `typescript` is not guaranteed to be installed in a
 * production install, and a map that silently empties in production is worse
 * than one that is occasionally imprecise.
 *
 * The next obvious one is to strip comments and strings and then scan. That is
 * WRONG HERE for a specific reason worth writing down: these are website
 * files, and website files are full of prose. `<p>don't</p>` is JSX text, the
 * apostrophe is not a quote, and a stripper would treat it as one and swallow
 * everything up to the next apostrophe — losing whatever declarations were in
 * between. The failure is silent and looks exactly like a file with no
 * exports.
 *
 * So every pattern here is anchored to the START OF A LINE. A declaration, an
 * import and an export all begin their line in every style anybody writes, and
 * a pattern that must match at column zero cannot be dragged out of alignment
 * by an unbalanced quote three lines earlier. It is a smaller claim than a
 * parse, and it is one that holds.
 */

import { entryPoint, isBareSpecifier, resolveSpecifier } from "../module-graph"
import type { ProjectFiles } from "../types"

export type SymbolKind = "component" | "hook" | "function" | "class" | "const" | "type"

export interface ExportedSymbol {
  name: string
  kind: SymbolKind
  /** `export default`, which is how a component is almost always exported. */
  isDefault: boolean
  line: number
}

export interface FileEntry {
  path: string
  lines: number
  exports: ExportedSymbol[]
  /** Project files this one imports, resolved to real paths. */
  dependsOn: string[]
  /** Packages, which for a generated site is react and nothing else. */
  external: string[]
  /** Capitalised JSX tags rendered here — the component graph, as used. */
  renders: string[]
}

export interface RepoMap {
  entry: string | null
  files: FileEntry[]
  /** path → the paths that import it. */
  importedBy: Record<string, string[]>
  /**
   * Files nothing imports and that are not the entry.
   *
   * Worth naming: a component nobody renders is usually either the thing the
   * creator is asking about ("why isn't my testimonials section showing") or
   * dead weight from an earlier run.
   */
  orphans: string[]
}

const SOURCE = /\.(tsx|ts|jsx|js|mjs)$/

/**
 * Build config is not the site.
 *
 * `vite.config.ts` imports packages the project does not ship and exports a
 * config object; putting it in the map invites the model to reason about it as
 * though it were part of the app. The same judgement `reachableFiles` makes,
 * for the same reason.
 */
const NOT_THE_SITE = /^(vite\.config|tailwind\.config|postcss\.config|eslint)/

export function buildRepoMap(files: ProjectFiles): RepoMap {
  const entry = entryPoint(files)
  const paths = Object.keys(files)
    .filter((p) => SOURCE.test(p) && !NOT_THE_SITE.test(p))
    .sort()

  const entries: FileEntry[] = paths.map((path) => {
    const source = files[path]
    const lines = source.split("\n")

    const dependsOn: string[] = []
    const external: string[] = []
    for (const specifier of importsIn(lines)) {
      if (isBareSpecifier(specifier)) {
        if (!external.includes(specifier)) external.push(specifier)
        continue
      }
      const resolved = resolveSpecifier(specifier, path, files)
      if (resolved && !dependsOn.includes(resolved)) dependsOn.push(resolved)
    }

    return {
      path,
      lines: lines.length,
      exports: exportsIn(lines),
      dependsOn,
      external,
      renders: rendersIn(source),
    }
  })

  const importedBy: Record<string, string[]> = {}
  for (const file of entries) {
    for (const target of file.dependsOn) {
      ;(importedBy[target] ??= []).push(file.path)
    }
  }

  const orphans = entries
    .filter((f) => f.path !== entry && (importedBy[f.path] ?? []).length === 0)
    .map((f) => f.path)

  return { entry, files: entries, importedBy, orphans }
}

/**
 * Import specifiers, from lines that begin with an import.
 *
 * `export … from` counts: a barrel file re-exporting a component is a real
 * dependency and leaving it out breaks the "used by" graph exactly where a
 * project is organised well enough to have one.
 */
function importsIn(lines: string[]): string[] {
  const found: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line.startsWith("import") && !line.startsWith("export")) continue
    const match = line.match(/\bfrom\s*["']([^"']+)["']/) ?? line.match(/^import\s*["']([^"']+)["']/)
    if (match) found.push(match[1])
  }
  return found
}

/**
 * A capitalised name is a component; a `useSomething` is a hook. Both are
 * conventions rather than rules, and both are the conventions React actually
 * enforces — a lowercase tag is a DOM element and a hook outside a `use` name
 * fails the lint every project runs.
 *
 * ALL CAPS IS NOT A COMPONENT, which the first version of this got wrong:
 * `export const SIZES = ["sm", "lg"]` starts with a capital, so it was listed
 * as a component in the map — an invitation to render a string array.
 */
function kindOf(name: string, declared: string): SymbolKind {
  if (declared === "type" || declared === "interface") return "type"
  if (declared === "class") return "class"
  if (/^use[A-Z]/.test(name)) return "hook"
  if (/^[A-Z][A-Z0-9_]*$/.test(name)) return "const"
  if (/^[A-Z]/.test(name)) return "component"
  return declared === "function" ? "function" : "const"
}

function exportsIn(lines: string[]): ExportedSymbol[] {
  const found: ExportedSymbol[] = []
  const seen = new Set<string>()

  const add = (name: string, kind: SymbolKind, isDefault: boolean, line: number) => {
    if (!name || seen.has(name)) return
    seen.add(name)
    found.push({ name, kind, isDefault, line })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Anchored at column zero. A top-level declaration is never indented, and
    // requiring that is what makes this immune to a stray quote further up.
    if (!line.startsWith("export")) continue
    const at = i + 1

    // export default function Hero() {}   /   export default class …
    const declaredDefault = line.match(
      /^export\s+default\s+(?:async\s+)?(function|class)\s+([A-Za-z_$][\w$]*)/,
    )
    if (declaredDefault) {
      add(declaredDefault[2], kindOf(declaredDefault[2], declaredDefault[1]), true, at)
      continue
    }

    // export default function () {}  /  export default () => …  /  export default Hero
    if (/^export\s+default\b/.test(line)) {
      const named = line.match(/^export\s+default\s+([A-Za-z_$][\w$]*)\s*$/)
      add(named ? named[1] : "default", named ? kindOf(named[1], "const") : "component", true, at)
      continue
    }

    // export function Hero() {}  /  export const x = …  /  export type T = …
    const declared = line.match(
      /^export\s+(?:async\s+)?(function|class|const|let|var|type|interface)\s+([A-Za-z_$][\w$]*)/,
    )
    if (declared) {
      add(declared[2], kindOf(declared[2], declared[1]), false, at)
      continue
    }

    // export { Hero, Footer as Foot }
    const listed = line.match(/^export\s*\{([^}]*)\}/)
    if (listed) {
      for (const part of listed[1].split(",")) {
        // `as` renames it, and the name that matters is the one importers use.
        const name = part.trim().split(/\s+as\s+/).pop()?.trim() ?? ""
        if (name && name !== "default") add(name, kindOf(name, "const"), false, at)
      }
    }
  }

  return found
}

/**
 * Capitalised JSX tags — which components this file actually renders.
 *
 * Not line-anchored, because a tag is wherever the markup puts it. The cost of
 * over-matching is a name in a list that is not really rendered, which is a
 * far cheaper mistake than the alternative: this is the only signal that says
 * where a component is USED rather than merely imported, and an import that is
 * never rendered is exactly the bug somebody is asking about when a section
 * does not appear.
 */
function rendersIn(source: string): string[] {
  const found = new Set<string>()
  for (const match of source.matchAll(/<([A-Z][\w$]*)[\s/>]/g)) {
    found.add(match[1])
    if (found.size >= 30) break
  }
  // React's own wrappers are noise — every project has them and no request is
  // ever about them.
  for (const builtin of ["StrictMode", "Fragment", "Suspense"]) found.delete(builtin)
  return [...found].sort()
}

/** Files past this and the map is longer than the code it describes. */
const MAX_DETAILED = 45

/**
 * The map, as the model reads it.
 *
 * Written as facts with no instructions attached. The instruction that matters
 * — reuse what is here — belongs in the preservation rules, where it applies to
 * everything, rather than being repeated beside every list.
 */
export function describeRepoMap(map: RepoMap): string {
  if (map.files.length === 0) return ""

  const header = `PROJECT MAP — ${map.files.length} source file${
    map.files.length === 1 ? "" : "s"
  }${map.entry ? `, entry ${map.entry}` : ""}. This is the whole structure: what each file exports, what it imports, and who uses it. Read a file when you need its contents — you should not need to read one to find out what is in it.`

  if (map.files.length > MAX_DETAILED) {
    /**
     * A project this size cannot have a paragraph each without the map
     * becoming the thing that fills the context. One line per file keeps the
     * part that makes reads unnecessary — the names — and drops the graph.
     */
    return `${header}\n\n${map.files
      .map((file) => `  ${file.path} — ${summariseExports(file) || "no exports"}`)
      .join("\n")}`
  }

  const blocks = map.files.map((file) => {
    const lines = [`  ${file.path} (${file.lines} lines)`]

    const exported = summariseExports(file)
    if (exported) lines.push(`    exports  ${exported}`)

    if (file.dependsOn.length) lines.push(`    imports  ${file.dependsOn.join(", ")}`)

    const users = map.importedBy[file.path] ?? []
    if (users.length) lines.push(`    used by  ${users.join(", ")}`)

    if (file.renders.length) lines.push(`    renders  ${file.renders.join(", ")}`)

    return lines.join("\n")
  })

  const sections = [header, blocks.join("\n\n")]

  if (map.orphans.length) {
    sections.push(
      `Nothing imports these, so nothing on the site renders them:\n  ${map.orphans.join(", ")}`,
    )
  }

  return sections.join("\n\n")
}

function summariseExports(file: FileEntry): string {
  return file.exports
    .map((symbol) => `${symbol.name} (${symbol.isDefault ? "default " : ""}${symbol.kind})`)
    .join(", ")
}

/**
 * Everywhere a name is defined, imported or rendered.
 *
 * The question `search_code` answers badly: searching for "Hero" returns the
 * import, the tag, the CSS class, the comment and the word in a heading, and
 * the model has to sort out which is which. This separates the three answers
 * that matter.
 */
export function findUsages(
  map: RepoMap,
  name: string,
): { definedIn: string[]; importedBy: string[]; renderedIn: string[] } {
  const wanted = name.trim()
  const definedIn = map.files
    .filter((file) => file.exports.some((symbol) => symbol.name === wanted))
    .map((file) => file.path)

  const importedBy = definedIn.flatMap((path) => map.importedBy[path] ?? [])

  const renderedIn = map.files.filter((file) => file.renders.includes(wanted)).map((file) => file.path)

  return {
    definedIn,
    importedBy: [...new Set(importedBy)].sort(),
    renderedIn,
  }
}
