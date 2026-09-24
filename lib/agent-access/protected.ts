/**
 * ===========================================================================
 *  WHAT AN AGENT MAY CHANGE, AND WHAT IS STORELIB'S OWN
 * ===========================================================================
 * Claude Code, Codex, ChatGPT through GitHub, and the builder's own Ask AI
 * all write code into a creator's website. They may add to it. They may not
 * rewrite the parts every Storelib site stands on:
 *
 *   templates, config, layout, snippets, assets
 *                   decide what every page is. Not section files, so not
 *                   theirs: the one kind of file an agent writes is
 *                   `sections/<type>.storelib`.
 *
 *   the built-in sections
 *                   the library every site is built from (hero, header,
 *                   footer, the product page, the FAQ...). One rewritten by
 *                   an agent is a section the creator can no longer reset,
 *                   update or trust, and a header rewritten badly is every
 *                   page broken at once. An agent that wants something
 *                   different writes a NEW section beside it, and the creator
 *                   puts that on the page.
 *
 * A file an agent is refused here stays exactly as it was. The creator can
 * still change anything in the code editor; this is about what an agent,
 * working on its own, is allowed to do.
 *
 * One rule, used by every path that writes for an agent: MCP and the agent
 * API (./operations.ts), GitHub pushes and pulls (lib/github-sync/sync.ts)
 * and the builder's Ask AI (app/api/website-builder/themes/[installId]/agent).
 */
import { safeThemePath } from "@/lib/website-builder/save-theme-file"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { DEFAULT_THEME_SOURCES } from "../../themes/default/sources.generated"

/** The one kind of file an agent may write. */
export const AGENT_WRITABLE = /^sections\/[a-z0-9_-]{1,64}\.storelib$/

/**
 * Every section type Storelib ships: the `.storelib` library and the
 * built-in sections drawn by the product itself. A file named after one of
 * those would replace it on every page that uses it.
 */
export const BUILT_IN_SECTION_TYPES: ReadonlySet<string> = new Set([
  ...Object.keys(DEFAULT_THEME_SOURCES as Record<string, string>)
    .filter((p) => AGENT_WRITABLE.test(p))
    .map((p) => p.slice("sections/".length, -".storelib".length)),
  ...Object.keys(SECTION_SCHEMAS),
])

export function sectionTypeOf(path: string): string | null {
  return AGENT_WRITABLE.test(path) ? path.slice("sections/".length, -".storelib".length) : null
}

export type AgentWriteCheck = { ok: true } | { ok: false; status: 403; error: string }

export function agentMayWrite(path: string): AgentWriteCheck {
  const type = safeThemePath(path) ? sectionTypeOf(path) : null
  if (!type) {
    return {
      ok: false,
      status: 403,
      error:
        "An agent writes section files only: sections/<type>.storelib, in lower case with digits, _ and -. Templates, config, layout, snippets and assets are the theme's core and stay as they are.",
    }
  }
  if (BUILT_IN_SECTION_TYPES.has(type)) {
    return {
      ok: false,
      status: 403,
      error: `${path} is one of Storelib's built-in sections, which every site is built from, and an agent does not change those. Write your version as a new section, such as sections/${type}_custom.storelib, and the creator can put it on the page in place of the built-in one.`,
    }
  }
  return { ok: true }
}
