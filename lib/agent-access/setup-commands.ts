/**
 * ===========================================================================
 *  THE LINES A CREATOR PASTES, FOR THEIR COMPUTER
 * ===========================================================================
 * What Website settings › Advanced › Connect directly shows: how to open a
 * terminal on this computer, and the exact commands for the tool they picked,
 * spelled for that computer's shell. Pure, so every line can be tested as
 * text; the panel only draws it (components/website-builder/agent-connections-panel.tsx).
 *
 * CLAUDE CODE, AT USER SCOPE. `claude mcp add` without a scope writes the
 * server into the config of the folder it was run in ("local" scope), and
 * `claude` started anywhere else does not see it. That is what happened to
 * the first person to try it: "Added HTTP MCP server storelib ... to local
 * config", then nothing in the next folder. `--scope user` makes it
 * available from every folder, which is what "connect Claude Code" means.
 *
 * CODEX reads ~/.codex/config.toml and takes the bearer token from an
 * environment variable it names, so it is two lines: add the server to the
 * config, and set the variable both for this window and for every new one.
 * PowerShell spells both differently from zsh and bash, so Windows gets its
 * own lines rather than a note saying "adapt this".
 */

export type Os = "mac" | "windows" | "linux"
export type AgentTool = "claude" | "codex" | "other"

export const MCP_URL = "https://mcp.storelib.com"
export const TOKEN_ENV = "STORELIB_TOKEN"

export const OS_LABEL: Record<Os, string> = { mac: "Mac", windows: "Windows", linux: "Linux" }

interface NavigatorLike {
  userAgentData?: { platform?: string } | null
  platform?: string
  userAgent?: string
}

/**
 * The computer this page is open on. The most specific answer the browser
 * gives, in order: Client Hints' platform, the older `navigator.platform`,
 * then the user agent string. A phone or anything unrecognised is a Mac,
 * which is the most common computer a creator sets this up on.
 */
export function detectOs(nav?: NavigatorLike | null): Os {
  const n = nav ?? (typeof navigator !== "undefined" ? (navigator as unknown as NavigatorLike) : null)
  if (!n) return "mac"
  const said = (n.userAgentData?.platform || n.platform || n.userAgent || "").toLowerCase()
  const ua = (n.userAgent || "").toLowerCase()
  if (/android|iphone|ipad|ipod/.test(ua) || /android|iphone|ipad|ipod/.test(said)) return "mac"
  if (/win/.test(said)) return "windows"
  if (/mac|darwin/.test(said)) return "mac"
  if (/linux|x11|cros|chrome os|chromeos|ubuntu|fedora/.test(said)) return "linux"
  return "mac"
}

/** One key on the keyboard, or a word typed, or the arrow between them. */
export type GuidePart = { key: string } | { type: string } | { then: true }

/** How to open a terminal, as keys to press. */
export function openTerminalGuide(os: Os): { parts: GuidePart[]; aside?: string } {
  if (os === "windows") {
    return {
      parts: [{ key: "⊞ Win" }, { then: true }, { type: "Terminal" }, { then: true }, { key: "Enter" }],
      aside: "Or type PowerShell",
    }
  }
  if (os === "linux") return { parts: [{ key: "Ctrl" }, { key: "Alt" }, { key: "T" }] }
  return { parts: [{ key: "⌘" }, { key: "Space" }, { then: true }, { type: "Terminal" }, { then: true }, { key: "Return" }] }
}

export interface SetupCommand {
  /** What the line does, in a few words. */
  label: string
  value: string
}

/** The shell file a Mac or Linux terminal reads for every new window. */
export function profileFile(os: Os): string {
  return os === "linux" ? "~/.bashrc" : "~/.zshrc"
}

/** The lines to paste, in order, for this tool on this computer. */
export function setupCommands(tool: AgentTool, os: Os, token: string): SetupCommand[] {
  if (tool === "claude") {
    return [
      {
        label: "Add Storelib to Claude Code",
        value: `claude mcp add --transport http --scope user storelib ${MCP_URL} --header "Authorization: Bearer ${token}"`,
      },
    ]
  }
  if (tool === "codex") {
    /*
      Written only if it is not there yet. The same table twice is invalid
      TOML and Codex refuses the whole file, and running the line again
      after making a new token is exactly what somebody does.
    */
    if (os === "windows") {
      return [
        {
          label: "Add Storelib to Codex",
          value:
            `if (-not (Select-String -Quiet -Path "$HOME\\.codex\\config.toml" -Pattern "mcp_servers.storelib" -ErrorAction SilentlyContinue)) { ` +
            `New-Item -ItemType Directory -Force "$HOME\\.codex" | Out-Null; ` +
            `Add-Content "$HOME\\.codex\\config.toml" "\`n[mcp_servers.storelib]\`nurl = \`"${MCP_URL}\`"\`nbearer_token_env_var = \`"${TOKEN_ENV}\`"" }`,
        },
        {
          label: "Save your token",
          value: `setx ${TOKEN_ENV} "${token}"; $env:${TOKEN_ENV}="${token}"`,
        },
      ]
    }
    return [
      {
        label: "Add Storelib to Codex",
        value:
          `grep -qs "mcp_servers.storelib" ~/.codex/config.toml || { mkdir -p ~/.codex && printf '\\n[mcp_servers.storelib]\\nurl = "${MCP_URL}"\\nbearer_token_env_var = "${TOKEN_ENV}"\\n' >> ~/.codex/config.toml; }`,
      },
      {
        label: "Save your token",
        value: `echo 'export ${TOKEN_ENV}=${token}' >> ${profileFile(os)} && export ${TOKEN_ENV}=${token}`,
      },
    ]
  }
  return [
    { label: "Server address", value: MCP_URL },
    { label: "Header", value: `Authorization: Bearer ${token}` },
  ]
}

/** What to run once it is added, and how to see that it worked. */
export function afterSetup(tool: AgentTool): { start: string; check: string; checkResult: string } | null {
  if (tool === "claude") return { start: "claude", check: "claude mcp list", checkResult: "shows storelib as connected" }
  if (tool === "codex") return { start: "codex", check: "/mcp", checkResult: "inside Codex lists storelib" }
  return null
}

/** Claude Code keeps a server added earlier at another scope; this clears it first. */
export const CLAUDE_REMOVE_OLD = "claude mcp remove storelib"

export const FIRST_ASK = "Add a pricing section to my Storelib site"
