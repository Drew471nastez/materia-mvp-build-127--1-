"use client"

import { useState } from "react"
import { AgentConnectionsPanel } from "@/components/website-builder/agent-connections-panel"
import { GitHubSyncPanel } from "@/components/website-builder/github-sync-panel"
import { cn } from "@/lib/utils"
import { Card, Lead, PageTitle, Row, buttonClass } from "./parts"
import type { SettingsContext } from "./types"

type Tool = "claude" | "codex" | "chatgpt"

const TOOLS: { id: Tool; label: string }[] = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "chatgpt", label: "ChatGPT" },
]

/**
 * ===========================================================================
 *  CONNECT AN AI CODING TOOL
 * ===========================================================================
 * "I cannot see how to connect Claude Code" was the report. The two ways in
 * were both here, one under the other, each explaining itself in general
 * terms, and a creator had to work out which one applied to the tool they
 * had. So the first question is the tool, and each answer shows only the
 * path that works for it:
 *
 *   Claude Code, Codex  a token and one command, straight from the computer
 *                       (the MCP endpoint takes a bearer token);
 *   ChatGPT             through GitHub. ChatGPT's Codex works on a GitHub
 *                       repository, and cannot send a token header, so a
 *                       linked repository is the route that works.
 *
 * GitHub is offered under the first two as well, for anybody who would
 * rather review a change as a commit. Whatever arrives either way is a
 * draft of this one website until it is published.
 */
export function AdvancedSettings({ ctx }: { ctx: SettingsContext }) {
  const [tool, setTool] = useState<Tool>("claude")

  return (
    <>
      <PageTitle>Advanced</PageTitle>

      <section className="mt-6">
        <h2 className="text-[17px] font-medium">Connect Claude Code, Codex or ChatGPT</h2>
        <Lead>
          Let an AI coding tool write this website&apos;s sections. It reaches this website and nothing else, and what it
          writes is a draft until you publish.
        </Lead>

        <div role="tablist" aria-label="Which tool" className="mt-5 inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tool === t.id}
              onClick={() => setTool(t.id)}
              className={cn(
                "h-9 rounded-lg px-4 text-[14px] font-medium transition-colors duration-150",
                tool === t.id ? "bg-white text-[#0f0f0f]" : "text-white/65 hover:text-white",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6" role="tabpanel">
          {tool === "chatgpt" ? (
            <>
              <p className="max-w-[600px] text-[14px] leading-relaxed text-white/60">
                In ChatGPT, Codex works on a GitHub repository. Link one here, ask Codex for a change, and merge it: the
                change appears in the builder within seconds.
              </p>
              <div className="mt-6">
                <GitHubSyncPanel installId={ctx.installId} returned={ctx.githubReturned} />
              </div>
            </>
          ) : (
            <>
              <AgentConnectionsPanel installId={ctx.installId} tool={tool} />
              <div className="mt-12 border-t border-white/10 pt-10">
                <h2 className="text-[17px] font-medium">Or through GitHub</h2>
                <p className="mt-1 max-w-[600px] text-[14px] leading-relaxed text-white/60">
                  For changes you want to review as commits first.
                </p>
                <div className="mt-5">
                  <GitHubSyncPanel installId={ctx.installId} returned={ctx.githubReturned} />
                </div>
              </div>
            </>
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
