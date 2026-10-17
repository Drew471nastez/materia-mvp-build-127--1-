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
import {
  applyPatch,
  createPage,
  createSection,
  describePatch,
  editSection,
  patchSection,
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
import type { MemoryDb } from "@/lib/ai-memory/store"
import { memoryOps } from "./memory-ops"
import type { AgentIdentity } from "./tokens"
import { READ_ONLY_REFUSAL } from "./token-format"

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
  /* A read only key (part 132's scopes) reads and checks, and every write answers why not. */
  const readOnly = who.canWrite === false
  const refuse = async () => ({ ok: false as const, status: 403, error: READ_ONLY_REFUSAL })
  return {
    siteName: siteName || "your site",
    agentName: who.name,
    list: () => listFiles(db, who.installId),
    read: (path) => readFile(db, who.installId, path),
    compile: (path, source) => compileOnly(path, source),
    write: async (path, source, base) => {
      if (readOnly) return refuse()
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
      createSection: (a) => (readOnly ? refuse() : createSection(db, who, a, mirror)),
      editSection: (a) => (readOnly ? refuse() : editSection(db, who, a, mirror)),
      patchSection: (a) => (readOnly ? refuse() : patchSection(db, who, a, mirror)),
      updateStyles: async (a) => (readOnly ? refuse() : asText(await updateStyles(db, who, a))),
      createPage: async (a) => (readOnly ? refuse() : asText(await createPage(db, who, a))),
      createSafePatch: async (a) => (readOnly ? refuse() : asText(await applyPatch(db, who, { page: a.page, ops: a.ops, label: a.label }))),
      runTests: (a) => runTests(db, who, a),
      runPreview: (a) => runPreview(db, who, a),
    },
    memory: memoryOps(db as unknown as MemoryDb, who),
  }
  function mirror(path: string, content: string) {
    after(() => mirrorToGitHub(who.installId, { kind: "save", path, content }))
  }
  function asText(r: OpResult<PatchResult>): OpResult<string> {
    return r.ok === true ? { ok: true, value: describePatch(r.value, who) } : r
  }
}
