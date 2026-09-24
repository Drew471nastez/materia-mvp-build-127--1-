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
      const r = await writeSection(db, who, path, source, base)
      /* A linked repository gets the same change, after the answer. */
      if (r.ok === true) after(() => mirrorToGitHub(who.installId, { kind: "save", path, content: source }))
      return r
    },
    guide: () => agentGuideText(),
    rules: () => pageText("rules"),
    site: () => siteBrief(db, who),
  }
}
