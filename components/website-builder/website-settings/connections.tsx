"use client"

import { useState } from "react"
import { AgentConnectionRow, useAgentConnections } from "@/components/website-builder/agent-connections-panel"
import { GitHubSyncPanel } from "@/components/website-builder/github-sync-panel"
import { InlineButton } from "./connection-row"
import { OwnAiRows } from "./own-ai"
import { AiMemorySettings } from "./ai-memory"
import { OwnDatabaseSettings } from "./own-database"
import { Card, Lead, PageTitle, Row, buttonClass } from "./parts"
import type { SettingsContext } from "./types"
import { tt } from "@/lib/i18n/text"

/** The lines on Connections. "other" is shown once it is asked for, or has a key. */
type ConnectionId = "claude" | "codex" | "github" | "other"

/**
 * ===========================================================================
 *  CONNECTIONS: WHICH TOOLS CAN CHANGE THIS WEBSITE
 * ===========================================================================
 * A list of the tools, each with whether it is connected and one button:
 *
 *   Claude Code   on the creator's own computer, with a key
 *   Codex         the same
 *   GitHub        a repository, for anything that works on one: Codex in
 *                 ChatGPT, Claude Code on the web, a person
 *
 * and, when asked for, another tool that speaks MCP. One line opens at a
 * time, with its steps or its settings under it.
 *
 * It used to open on a question, "Connect directly" or "Through GitHub",
 * each with a paragraph, and only the answer's steps were drawn. Which one
 * applied depended on knowing what MCP and a repository are. Everybody
 * knows which tool they use, so the tools are the list, and the one line
 * that needs the other route says so where it is read: "Using Codex in
 * ChatGPT? Connect GitHub instead."
 *
 * Whatever arrives either way is a draft of this one website until it is
 * published.
 */
export function ConnectionsSettings({ ctx }: { ctx: SettingsContext }) {
  /* Back from GitHub's install page, or sent by the top bar's GitHub button: GitHub, open. */
  const [open, setOpen] = useState<ConnectionId | null>(ctx.connectVia === "github" || ctx.githubReturned ? "github" : null)
  const agents = useAgentConnections(ctx.installId)
  const onOpen = (id: ConnectionId | null) => setOpen(id)
  const showOther = open === "other" || (agents.connections !== null && agents.byTool.other.length > 0)

  /* The rows of Use your own AI (Claude, OpenAI) open in the same one-at-a-time list as GitHub. */
  const [ownOpen, setOwnOpen] = useState<string | null>(null)
  const openGitHub = open === "github"

  return (
    <>
      <PageTitle>{tt("Connections")}</PageTitle>
      <Lead>{tt("Connect GitHub, or your own Claude or OpenAI key. Changes stay as drafts until you publish.")}</Lead>

      {/*
        ONE LIST, EACH TOOL ONCE. GitHub first and marked Recommended: one
        repository is what Claude Code, Codex and a person all work in, with
        the history of every change. Then your own Claude and OpenAI keys for
        Storelib AI. Claude Code and Codex on your own computer fold under
        one line below, so Claude is never listed twice.
      */}
      <section
        aria-label={tt("Connections")}
        data-connections-list=""
        className="mt-5 divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
      >
        <GitHubSyncPanel
          installId={ctx.installId}
          returned={ctx.githubReturned}
          open={openGitHub}
          onToggle={() => {
            setOwnOpen(null)
            setOpen(openGitHub ? null : "github")
          }}
          recommended
        />
        <OwnAiRows
          open={ownOpen}
          onOpen={(id) => {
            if (id) setOpen(null)
            setOwnOpen(id)
          }}
        />
      </section>
      <p className="mt-2.5 text-[13px] leading-relaxed text-white/45 md:text-[12.5px]">
        {tt("Storelib AI is included in your plan. Your own key makes its edits count on your account instead.")}
      </p>

      {/* What Storelib AI and connected agents remember for this website (lib/ai-memory). */}
      <AiMemorySettings installId={ctx.installId} />

      {/* Claude Code and Codex on your own computer, folded: most people never need them. */}
      <details data-local-agents="" className="group/local mt-6 rounded-2xl border border-white/10 bg-white/[0.02] open:bg-white/[0.03]" open={open === "claude" || open === "codex" || open === "other"}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[14px] font-medium text-white/80 transition-colors hover:text-white md:text-[13.5px] [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">{tt("Code from your computer")}</span>
          <span className="text-[12.5px] font-normal text-white/40">{tt("Claude Code, Codex, MCP")}</span>
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 text-white/40 transition-transform duration-200 group-open/local:rotate-180"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </summary>
        <div className="divide-y divide-white/[0.07] border-t border-white/[0.07]">
          <AgentConnectionRow tool="claude" agents={agents} open={open === "claude"} onOpen={onOpen} onGitHub={() => setOpen("github")} />
          <AgentConnectionRow tool="codex" agents={agents} open={open === "codex"} onOpen={onOpen} onGitHub={() => setOpen("github")} />
          {showOther && <AgentConnectionRow tool="other" agents={agents} open={open === "other"} onOpen={onOpen} onGitHub={() => setOpen("github")} />}
        </div>
        {!showOther && (
          <p className="border-t border-white/[0.07] px-4 py-3 text-[13.5px] text-white/45 md:text-[13px]">
            {tt("Another tool that works with MCP?")}{" "}
            <InlineButton
              onClick={() => {
                setOpen("other")
                if (!agents.fresh.other && agents.making !== "other") void agents.make("other")
              }}
            >
              {tt("Connect it")}
            </InlineButton>
          </p>
        )}
      </details>

      <Card title={tt("Code")}>
        <Row label={tt("Section files")} hint={tt("Every section of this website is a .storelib file you can read and change.")}>
          <button type="button" onClick={ctx.onOpenCode} className={buttonClass}>
            {tt("Edit code")}
          </button>
        </Row>
        <Row label={tt("Developer docs")} hint={tt("How sections, settings, checkout and the agent API work.")}>
          <a href="/developers" target="_blank" rel="noopener noreferrer" className={buttonClass}>
            {tt("Open docs")}
          </a>
        </Row>
      </Card>

      {/* Advanced and opt-in: a creator's own Supabase, for sections that declare it. */}
      <OwnDatabaseSettings ctx={ctx} />
    </>
  )
}
