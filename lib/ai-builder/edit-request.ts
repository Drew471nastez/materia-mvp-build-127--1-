/**
 * ===========================================================================
 *  "EDIT WITH AI" ON ONE COMPONENT
 * ===========================================================================
 * The section menu's Edit with AI asks for a change to ONE component: its
 * file, the placed section the person had open, and what they want. Two
 * ways it can go, the same request either way (ComponentEditRequest in
 * ./types):
 *
 *   1. The agent's edit mode (L2's route, componentEditEndpoint): a job on
 *      that file only, with its progress in the editor. Tried only where
 *      NEXT_PUBLIC_AI_BUILDER_AGENT_EDIT is "1", and an answer of 404 or 501
 *      falls through to 2.
 *   2. Ask Storelib with the section selected, which already reads the
 *      section's file and changes it with exact find and replace edits
 *      (lib/website-builder/agent/selected-section.ts, edit_section_code),
 *      saved as a draft with a version row and undone with the run.
 *
 * Either way the visual edits made since are not overwritten: the agent
 * writes with expectedVersion, and the editor shows the file's newer
 * version as a change it can keep or undo.
 */
import { componentEditEndpoint, type ComponentEditRequest } from "./types"

/** The message Ask Storelib is sent: scoped to the file and the section, in the person's words. */
export function componentEditPrompt(opts: { path: string; name: string; ask: string }): string {
  const ask = opts.ask.trim().slice(0, 4000)
  return `Change only this section, "${opts.name}" (its code is ${opts.path}): ${ask}\nKeep its settings working in the sidebar, keep what it already shows unless I asked otherwise, and do not add another section.`
}

/** sha256 of a text in the browser, the same as fileVersion on the server. */
export async function browserFileVersion(text: string): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(text)
    const digest = await crypto.subtle.digest("SHA-256", bytes)
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
  } catch {
    return null
  }
}

export type AgentEditAnswer = { kind: "job"; jobId: string } | { kind: "unavailable" } | { kind: "error"; message: string }

/** The agent's edit mode, when it is switched on and answers. `unavailable` means use Ask Storelib. */
export async function requestAgentEdit(installId: string, req: ComponentEditRequest, fetcher: typeof fetch = fetch): Promise<AgentEditAnswer> {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_AI_BUILDER_AGENT_EDIT !== "1") return { kind: "unavailable" }
  try {
    const res = await fetcher(componentEditEndpoint(installId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) })
    if (res.status === 404 || res.status === 405 || res.status === 501) return { kind: "unavailable" }
    const body = (await res.json().catch(() => ({}))) as { job?: { id?: string }; jobId?: string; error?: string }
    const jobId = body.job?.id ?? body.jobId
    if (res.ok && typeof jobId === "string") return { kind: "job", jobId }
    return { kind: "error", message: body.error || "That change could not be started. Try again." }
  } catch {
    return { kind: "unavailable" }
  }
}
