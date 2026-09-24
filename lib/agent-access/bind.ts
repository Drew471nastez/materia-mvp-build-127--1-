/**
 * The operations bound to one authenticated connection, the one shape
 * both the MCP route and anything else that wants them take.
 */
import "server-only"
import { after } from "next/server"
import { mirrorToGitHub } from "@/lib/github-sync/mirror"
import { createAdminClient } from "@/lib/supabase/admin"
import { agentGuideText, pageText } from "@/lib/developers/render-text"
import { compileOnly, listFiles, readFile, writeSection } from "./operations"
import { siteBrief } from "./site-brief"
import { validateSection } from "@/lib/storelib-ai/validate"
import {
  applyPatch,
  createPage,
  createSection,
  describePatch,
  editSection,
  findComponents,
  readPage,
  readProject,
  readSelectedSection,
  runPreview,
  runTests,
  updateStyles,
  type PatchResult,
} from "./project"
import type { OpResult } from "./operations"
import type { BoundOps } from "./mcp"
import type { AgentIdentity } from "./tokens"

export async function bindOps(who: AgentIdentity): Promise<BoundOps> {
  /**
   * THE SERVICE ROLE, SCOPED BY HAND. The token is the credential here, not
   * a browser session, so row-level security has no user to check. Every
   * operation below is handed this connection's install id and uses nothing
   * else; see ./operations.ts for what they may touch.
   */
  const db = createAdminClient()
  /* The name came with the token check (./tokens.ts); read it only if not. */
  let siteName = who.siteName
  if (siteName === undefined) {
    const { data: install } = await db.from("store_theme_installs").select("name").eq("id", who.installId).maybeSingle()
    siteName = install?.name ?? undefined
  }
  return {
    siteName: siteName || "your site",
    agentName: who.name,
    list: () => listFiles(db, who.installId),
    read: (path) => readFile(db, who.installId, path),
    compile: (path, source) => compileOnly(path, source),
    write: async (path, source, base) => {
      /* The same gate as storelib_create_section: a file that fails the checks never reaches the builder. */
      const type = /^sections\/([a-z0-9_-]+)\.storelib$/.exec(path)?.[1]
      const v = validateSection(source, { path, expectType: type })
      if (v.ok === false && v.reason === "quality") return { ok: false, status: 422, error: `${path} was not saved.\n${v.feedback}` }
      const r = await writeSection(db, who, path, source, base)
      /* A linked repository gets the same change, after the answer. */
      if (r.ok === true) after(() => mirrorToGitHub(who.installId, { kind: "save", path, content: source }))
      return r
    },
    guide: () => agentGuideText(),
    rules: () => pageText("rules"),
    site: () => siteBrief(db, who),
    project: {
      readProject: () => readProject(db, who),
      readPage: (a) => readPage(db, who, a.page),
      readSelectedSection: (a) => readSelectedSection(db, who, a),
      searchComponents: (a) => findComponents(db, who, a.query, a.limit),
      createSection: (a) => createSection(db, who, a, mirror),
      editSection: (a) => editSection(db, who, a, mirror),
      updateStyles: async (a) => asText(await updateStyles(db, who, a)),
      createPage: async (a) => asText(await createPage(db, who, a)),
      createSafePatch: async (a) => asText(await applyPatch(db, who, { page: a.page, ops: a.ops, label: a.label })),
      runTests: (a) => runTests(db, who, a),
      runPreview: (a) => runPreview(db, who, a),
    },
  }
  function mirror(path: string, content: string) {
    after(() => mirrorToGitHub(who.installId, { kind: "save", path, content }))
  }
  function asText(r: OpResult<PatchResult>): OpResult<string> {
    return r.ok === true ? { ok: true, value: describePatch(r.value, who) } : r
  }
}
