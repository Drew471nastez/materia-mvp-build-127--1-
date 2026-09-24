"use client"

import { useState } from "react"
import { Terminal } from "lucide-react"
import { AgentConnectionsPanel } from "@/components/website-builder/agent-connections-panel"
import { GitHubMark, GitHubSyncPanel } from "@/components/website-builder/github-sync-panel"
import { cn } from "@/lib/utils"
import { Card, Lead, PageTitle, Row, buttonClass } from "./parts"
import type { ConnectVia, SettingsContext } from "./types"

const PATHS: { id: ConnectVia; title: string; tools: string; note?: string }[] = [
  { id: "direct", title: "Connect directly", tools: "Claude Code, Codex CLI", note: "Recommended" },
  { id: "github", title: "Through GitHub", tools: "ChatGPT Codex, Claude Code on the web, any tool that works on a repo" },
]

/**
 * ===========================================================================
 *  CONNECT AN AI CODING TOOL
 * ===========================================================================
 * One question first: how does your tool reach this website?
 *
 *   Connect directly   Claude Code or the Codex CLI on your own computer. A
 *                      token and one line in a terminal; nothing else to set
 *                      up, so it is the one we recommend.
 *   Through GitHub     For anything that works on a repository rather than
 *                      on your computer: ChatGPT's Codex, Claude Code on the
 *                      web. Link a repository, and a push arrives here.
 *
 * Each answer is its own three steps, and the other is not on the screen.
 * The two used to be stacked one under the other, each explaining itself,
 * with a row of tool names above them that decided which order they came in,
 * and a creator had to read all of it to work out which part applied.
 *
 * Whatever arrives either way is a draft of this one website until it is
 * published.
 */
export function ConnectionsSettings({ ctx }: { ctx: SettingsContext }) {
  /* Back from GitHub's install page, or sent by the top bar's GitHub button:
     the GitHub path. Otherwise the recommended one. */
  const [via, setVia] = useState<ConnectVia>(ctx.connectVia ?? (ctx.githubReturned ? "github" : "direct"))

  return (
    <>
      <PageTitle>Connections</PageTitle>

      <section className="mt-6">
        <h2 className="text-[17px] font-medium">Connect Claude Code, Codex or ChatGPT</h2>
        <Lead>They write this website&apos;s sections. They reach this website only, and what they write is a draft until you publish.</Lead>

        <div role="radiogroup" aria-label="How to connect" className="mt-5 grid gap-3 sm:grid-cols-2">
          {PATHS.map((p) => {
            const on = via === p.id
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setVia(p.id)}
                className={cn(
                  "group flex items-start gap-3.5 rounded-2xl border p-4 text-left transition-colors duration-150 md:p-5",
                  on ? "border-white/70 bg-white/[0.07]" : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-150",
                    on ? "bg-white text-[#0f0f0f]" : "bg-white/[0.07] text-white/70",
                  )}
                >
                  {p.id === "github" ? <GitHubMark className="h-[18px] w-[18px]" /> : <Terminal className="h-[18px] w-[18px]" strokeWidth={2} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] font-medium text-white">{p.title}</span>
                    {p.note && <span className="shrink-0 text-[12.5px] text-emerald-300/90">{p.note}</span>}
                  </span>
                  <span className="mt-1 block text-[13.5px] leading-snug text-white/55">{p.tools}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-8">
          {via === "github" ? (
            <GitHubSyncPanel installId={ctx.installId} returned={ctx.githubReturned} />
          ) : (
            <AgentConnectionsPanel installId={ctx.installId} />
          )}
        </div>
      </section>

      <Card title="Code">
        <Row label="Section files" hint="Every section of this website is a .storelib file you can read and change.">
          <button type="button" onClick={ctx.onOpenCode} className={buttonClass}>
            Edit code
          </button>
        </Row>
        <Row label="Developer docs" hint="How sections, settings, checkout and the agent API work.">
          <a href="/developers" target="_blank" rel="noopener noreferrer" className={buttonClass}>
            Open docs
          </a>
        </Row>
      </Card>
    </>
  )
}
