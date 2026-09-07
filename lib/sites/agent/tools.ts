import "server-only"

/**
 * What the agent can do, and what happens when it does it.
 *
 * ---------------------------------------------------------------------------
 *  THE TOOLS ARE THE BOUNDARY
 * ---------------------------------------------------------------------------
 * "The AI can edit your website" has to mean something bounded, and this file
 * is the bound — not a sentence in a system prompt asking it to behave. There
 * is no shell, no network, no database handle, and no filesystem: every tool
 * operates on an in-memory `ProjectFiles` map, and the only way anything
 * reaches Postgres is the ONE `saveFiles` call the loop makes at the end,
 * through the same validation and the same RLS a human edit goes through.
 *
 * There is deliberately no `run_sql`, no `install_package`, and no
 * `fetch_url`. "Add properties to my real estate site" becomes a collection
 * row, not DDL; a missing package is an answer, not an install.
 *
 * ---------------------------------------------------------------------------
 *  ERRORS ARE RESULTS
 * ---------------------------------------------------------------------------
 * Every tool returns a string the model reads, including its failures. A tool
 * that throws ends the run; a tool that says "that file does not exist, here
 * are the ones that do" gets the next call right. The only things that throw
 * are conditions the model cannot fix by trying again.
 */

import { filePathError, MAX_FILES_PER_PROJECT } from "../file-path"
import { bundleProject, formatBuildErrors } from "../bundle"
import { sortedPaths } from "../starter"
import type { BuildResult, ProjectFiles } from "../types"
import type { ToolSpec } from "./types"

/** Truncated reads keep one runaway file from eating the whole context. */
const MAX_READ_CHARS = 24_000

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "list_files",
    description:
      "List every file in the project with its size in characters. Call this first — do not guess paths.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "read_file",
    description: "Read one file. Read a file before rewriting it.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Project-relative, e.g. src/App.tsx" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "write_file",
    description:
      "Replace a file's ENTIRE contents. The path must already exist — use create_file for a new one.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string", description: "The complete new file. Not a patch or a fragment." },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "create_file",
    description: "Create a file that does not exist yet.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_file",
    description: "Delete a file. Anything still importing it will fail to build.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "run_build",
    description:
      "Bundle the project and report whether it compiles. Run this after your edits and fix anything it reports before finishing.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "read_build_errors",
    description: "Re-read the problems from the last run_build without rebuilding.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
]

/**
 * The project as the run sees it: an in-memory copy that tools mutate, plus
 * the record of what changed so only those files are written back.
 */
export class ProjectWorkspace {
  readonly files: ProjectFiles
  readonly changed = new Set<string>()
  readonly deleted = new Set<string>()
  private lastBuild: BuildResult | null = null

  constructor(files: ProjectFiles) {
    this.files = { ...files }
  }


  async execute(name: string, argumentsJson: string, esbuild: unknown): Promise<string> {
    let args: Record<string, unknown>
    try {
      args = argumentsJson.trim() ? JSON.parse(argumentsJson) : {}
    } catch {
      // Told, not thrown: the next call is usually well-formed.
      return "Your arguments were not valid JSON. Send the arguments again as a JSON object."
    }

    const path = typeof args.path === "string" ? args.path : ""
    const content = typeof args.content === "string" ? args.content : ""

    switch (name) {
      case "list_files":
        return sortedPaths(this.files)
          .map((p) => `${p} (${this.files[p].length} chars)`)
          .join("\n")

      case "read_file": {
        const invalid = filePathError(path)
        if (invalid) return `Cannot read "${path}": ${invalid}`
        const file = this.files[path]
        if (file === undefined) return this.noSuchFile(path)
        return file.length > MAX_READ_CHARS
          ? `${file.slice(0, MAX_READ_CHARS)}\n\n[truncated at ${MAX_READ_CHARS} characters]`
          : file
      }

      case "write_file": {
        const invalid = filePathError(path)
        if (invalid) return `Cannot write "${path}": ${invalid}`
        if (this.files[path] === undefined) {
          return `"${path}" does not exist. Use create_file to make it, or list_files to see what does.`
        }
        this.files[path] = content
        this.changed.add(path)
        this.deleted.delete(path)
        return `Wrote ${path} (${content.length} chars).`
      }

      case "create_file": {
        const invalid = filePathError(path)
        if (invalid) return `Cannot create "${path}": ${invalid}`
        if (this.files[path] !== undefined) {
          return `"${path}" already exists. Use write_file to replace it.`
        }
        if (Object.keys(this.files).length >= MAX_FILES_PER_PROJECT) {
          return `This site is at its limit of ${MAX_FILES_PER_PROJECT} files.`
        }
        this.files[path] = content
        this.changed.add(path)
        this.deleted.delete(path)
        return `Created ${path} (${content.length} chars).`
      }

      case "delete_file": {
        if (this.files[path] === undefined) return this.noSuchFile(path)
        // index.html and the entry are the project. Deleting either leaves a
        // site that cannot build, and the model has no way to know that is
        // load-bearing rather than tidying.
        if (path === "index.html" || path === "package.json") {
          return `"${path}" is required and cannot be deleted.`
        }
        delete this.files[path]
        this.changed.delete(path)
        this.deleted.add(path)
        return `Deleted ${path}.`
      }

      case "run_build": {
        this.lastBuild = await bundleProject(esbuild as never, this.files)
        return formatBuildErrors(this.lastBuild)
      }

      case "read_build_errors":
        return this.lastBuild
          ? formatBuildErrors(this.lastBuild)
          : "No build has been run yet. Call run_build first."

      default:
        return `There is no tool called "${name}". Available: ${TOOL_SPECS.map((t) => t.name).join(", ")}.`
    }
  }

  /** The last build's verdict, for the loop's own check before it saves. */
  get buildResult(): BuildResult | null {
    return this.lastBuild
  }

  /** Only what changed. A whole-project write would clobber untouched files. */
  changedFiles(): ProjectFiles {
    const out: ProjectFiles = {}
    for (const path of this.changed) out[path] = this.files[path]
    return out
  }

  private noSuchFile(path: string): string {
    const nearby = sortedPaths(this.files).slice(0, 40).join(", ")
    return `"${path}" does not exist. The project holds: ${nearby}`
  }
}
