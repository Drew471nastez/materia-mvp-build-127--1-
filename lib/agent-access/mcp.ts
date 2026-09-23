/**
 * ===========================================================================
 *  STORELIB AS AN MCP SERVER
 * ===========================================================================
 * The Model Context Protocol is how Claude Code, Codex, Cursor and others
 * take tools from a server. This answers its JSON-RPC over plain HTTP
 * (the "Streamable HTTP" transport, stateless: every POST is complete in
 * itself, and there is no server-sent stream to hold open on a serverless
 * function).
 *
 * The tools are ./operations.ts and nothing else, so an agent over MCP can do
 * exactly what an agent over the REST API can, and no more.
 *
 * Pure: it is handed the operations already bound to one connection, so it
 * can be tested without a request, a database or a token.
 * See tests/agent-connection.test.ts.
 */
import type { ThemeError } from "@/lib/storelib-theme/types"
import type { FileEntry, OpResult } from "./operations"

/** The protocol versions this server can speak, newest first. */
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const

export interface BoundOps {
  siteName: string
  agentName: string
  list: () => Promise<OpResult<{ framework: { engine: number; schema: number }; docs: string; writable: string; files: FileEntry[] }>>
  read: (path: string) => Promise<OpResult<{ path: string; source: string; origin: string; updated_at: string | null }>>
  compile: (path: string, source: string) => OpResult<{ path: string; warnings: ThemeError[] }>
  write: (path: string, source: string, baseUpdatedAt?: string) => Promise<OpResult<{ path: string; type: string; created: boolean; drafted: boolean; updated_at: string | null }>>
  guide: () => string
}

type Json = Record<string, unknown>
export interface RpcRequest { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json }
export type RpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } }

const PATH = { type: "string", description: 'A theme path, such as "sections/pricing.storelib".' }
const SOURCE = { type: "string", description: "The WHOLE .storelib file: <template>, optional <style> and <script>, and <schema>." }

export const TOOLS = [
  {
    name: "storelib_guide",
    description:
      "The Storelib Builder Framework: the file format, template language, schema, styling and script rules. Read this BEFORE writing any section. The template language is not Vue, React, JSX or Liquid.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "storelib_list_files",
    description:
      "Every file of this site's theme. origin is \"yours\" for files the creator (or an agent) saved and \"theme\" for the shipped ones. Only sections/<type>.storelib files can be written.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "storelib_read_file",
    description: "Read one file: the saved draft where there is one, else the shipped version. Returns updated_at, to send back when writing so a newer save is never overwritten.",
    inputSchema: { type: "object", properties: { path: PATH }, required: ["path"], additionalProperties: false },
  },
  {
    name: "storelib_compile",
    description:
      "Compile a section file WITHOUT saving it. Returns every error as file:line message. Run this until it is clean, then write. Fix the line an error names; do not rewrite the file.",
    inputSchema: { type: "object", properties: { path: PATH, source: SOURCE }, required: ["path", "source"], additionalProperties: false },
  },
  {
    name: "storelib_write_section",
    description:
      "Save a section file as a DRAFT. It is compiled first and refused with its errors if it does not compile. A new section appears on the page the creator has open in the builder; nothing reaches visitors until the creator publishes. Only sections/<type>.storelib, lower case.",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        source: SOURCE,
        base_updated_at: { type: "string", description: "updated_at from storelib_read_file, when changing an existing file." },
      },
      required: ["path", "source"],
      additionalProperties: false,
    },
  },
] as const

function text(value: string, isError = false) {
  return { content: [{ type: "text", text: value }], ...(isError ? { isError: true } : {}) }
}

/** Compiler errors the way an agent fixes them fastest: file:line message. */
export function formatErrors(errors: ThemeError[] | undefined): string {
  return (errors ?? [])
    .slice(0, 40)
    .map((e) => `${e.file ?? ""}${e.line ? `:${e.line}` : ""} ${e.message}`.trim())
    .join("\n")
}

function refusal<T>(r: OpResult<T>): ReturnType<typeof text> | null {
  if (r.ok === true) return null
  const detail = formatErrors(r.errors)
  return text(detail ? `${r.error}\n${detail}` : r.error, true)
}

function str(params: Json | undefined, key: string): string {
  const v = params?.[key]
  return typeof v === "string" ? v : ""
}

/**
 * One JSON-RPC message in, its answer out, or null for a notification
 * (which, by the protocol, gets no answer).
 */
export async function handleMcp(msg: RpcRequest, ops: BoundOps): Promise<RpcResponse | null> {
  const id = msg.id ?? null
  const isNotification = msg.id === undefined
  const ok = (result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result })
  const fail = (code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } })

  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return isNotification ? null : fail(-32600, "Invalid request")
  }
  if (msg.method.startsWith("notifications/")) return null

  switch (msg.method) {
    case "initialize": {
      const asked = str(msg.params, "protocolVersion")
      const version = (PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : PROTOCOL_VERSIONS[0]
      return ok({
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "storelib", title: "Storelib", version: "1.0.0" },
        instructions:
          `Connected to the Storelib site "${ops.siteName}" as "${ops.agentName}". ` +
          "Call storelib_guide before writing a section. Compile with storelib_compile until it is clean, then save with storelib_write_section. " +
          "Every save is a draft; the creator publishes.",
      })
    }
    case "ping":
      return ok({})
    case "tools/list":
      return ok({ tools: TOOLS })
    case "tools/call": {
      const name = str(msg.params, "name")
      const args = (msg.params?.arguments && typeof msg.params.arguments === "object" ? msg.params.arguments : {}) as Json
      switch (name) {
        case "storelib_guide":
          return ok(text(ops.guide()))
        case "storelib_list_files": {
          const r = await ops.list()
          return ok(refusal(r) ?? text(JSON.stringify(r.ok === true ? r.value : null, null, 2)))
        }
        case "storelib_read_file": {
          const r = await ops.read(str(args, "path"))
          if (r.ok === false) return ok(refusal(r))
          return ok(text(`${r.value.path} (${r.value.origin}, updated_at ${r.value.updated_at ?? "never saved"})\n\n${r.value.source}`))
        }
        case "storelib_compile": {
          const r = ops.compile(str(args, "path"), str(args, "source"))
          if (r.ok === false) return ok(refusal(r))
          const warnings = formatErrors(r.value.warnings)
          return ok(text(`${r.value.path} compiles.${warnings ? `\nWarnings:\n${warnings}` : ""}`))
        }
        case "storelib_write_section": {
          const base = str(args, "base_updated_at")
          const r = await ops.write(str(args, "path"), str(args, "source"), base || undefined)
          if (r.ok === false) return ok(refusal(r))
          const v = r.value
          return ok(
            text(
              `${v.path} saved as a draft${v.created ? ", a new section" : ""}. updated_at ${v.updated_at ?? "unknown"}. ` +
                (v.created
                  ? "If the creator has the builder open it is on their page now; otherwise it is in Add Section under Created by you. "
                  : "The builder shows the change. ") +
                "It goes live when they publish.",
            ),
          )
        }
        default:
          return fail(-32602, `Unknown tool: ${name}`)
      }
    }
    default:
      return isNotification ? null : fail(-32601, `Method not found: ${msg.method}`)
  }
}
