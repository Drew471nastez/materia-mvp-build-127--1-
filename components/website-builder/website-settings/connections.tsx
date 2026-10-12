"use client"

import { useState } from "react"
import { AgentConnectionRow, useAgentConnections } from "@/components/website-builder/agent-connections-panel"
import { GitHubSyncPanel } from "@/components/website-builder/github-sync-panel"
import { InlineButton } from "./connection-row"
import { OwnAiSettings } from "./own-ai"
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

  return (
    <>
      <PageTitle>{tt("Connections")}</PageTitle>
      <Lead>{tt("Use your own OpenAI key in Storelib AI, or let Claude Code, Codex or a GitHub repository change this website. What they write is a draft until you publish.")}</Lead>

      {/* First: the one that needs nothing installed, and is what the chat's Connect AI button is usually after. */}
      <OwnAiSettings />

      <h2 className="mt-8 text-[15px] font-semibold text-white md:mt-9 md:text-[14.5px]">{tt("Or code in your own tools")}</h2>
      <p className="mt-1 text-[13.5px] leading-snug text-white/50 md:text-[13px]">
        {tt("Connect GitHub and Claude Code or Codex can work on this website from a repository, with every change in its history.")}
      </p>
      <section
        aria-label={tt("Connections")}
        className="mt-3 divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
      >
        {/*
          GITHUB FIRST, AND SAID SO. One repository is what Claude Code,
          Codex and a person all work in, on a computer or on the web, with
          the history of every change, so it is the line to start with. The
          direct connections follow for whoever already runs one of the two.
        */}
        <GitHubSyncPanel
          installId={ctx.installId}
          returned={ctx.githubReturned}
          open={open === "github"}
          onToggle={() => setOpen(open === "github" ? null : "github")}
          recommended
        />
        <AgentConnectionRow tool="claude" agents={agents} open={open === "claude"} onOpen={onOpen} onGitHub={() => setOpen("github")} />
        <AgentConnectionRow tool="codex" agents={agents} open={open === "codex"} onOpen={onOpen} onGitHub={() => setOpen("github")} />
        {showOther && <AgentConnectionRow tool="other" agents={agents} open={open === "other"} onOpen={onOpen} onGitHub={() => setOpen("github")} />}
      </section>
      {!showOther && (
        <p className="mt-3 text-[13.5px] text-white/45 md:text-[13px]">
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
