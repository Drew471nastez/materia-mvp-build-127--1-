/**
 * THE REAL CHAT PANEL, DRIVEN BY A REAL RUN.
 *
 * The agent endpoint is answered locally with a stream of the same
 * newline-delimited events the server sends — a plan, steps that start and
 * settle, a section's source, then the reply. Nothing about the panel is
 * stubbed: it is the component the editor mounts, handling the events the
 * loop actually emits.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ThemeChat } from "@/components/website-builder/theme-chat"
import type { SectionInstance } from "@/lib/website-builder/types"

const sections: SectionInstance[] = [
  { id: "header-1", type: "header", name: "Header", settings: {}, blocks: [] },
  { id: "faq-1", type: "faq_accordion", name: "FAQ", settings: {}, blocks: [] },
]

const SOURCE = `<template>
  <section class="s__pricing" data-section>
    <h2>{{ section.settings.heading }}</h2>
    {% for block in section.blocks %}
      <article class="s__tier">{{ block.settings.name }}</article>
    {% endfor %}
  </section>
</template>
<style>
  .s__pricing { padding: 64px 24px; background: var(--s-bg); }
  .s__tier { border: 1px solid var(--s-border); border-radius: 12px; }
</style>
<schema>
{ "type": "pricing_tiers", "name": "Pricing tiers" }
</schema>`

/**
 * What the server sends, in the order it sends it, with the pause each one
 * really has in front of it. A tool call takes time; the settled event for a
 * step is not 30ms behind its running event, and a probe that assumed it was
 * could never catch a step in flight.
 */
const EVENTS: Array<Record<string, unknown> & { after?: number }> = [
  { type: "plan", text: "I'll read the FAQ, then add a pricing section with three tiers and write its code." },
  { type: "step", id: "c1", label: "Reading the FAQ", state: "running" },
  { type: "step", id: "c1", label: "Reading the FAQ", state: "done", after: 180 },
  { type: "step", id: "c2", label: "Adding the Pricing tiers", state: "running" },
  { type: "op", op: { kind: "add_section", id: "pricing-1", sectionType: "pricing_tiers", index: 2 }, label: "Added Pricing tiers" },
  { type: "step", id: "c2", label: "Adding the Pricing tiers", state: "done", after: 180 },
  { type: "step", id: "c3", label: "Writing the Pricing tiers code", state: "running" },
  { type: "code", path: "sections/pricing_tiers.storelib", source: SOURCE, after: 180 },
  { type: "step", id: "c3", label: "Writing the Pricing tiers code", state: "done" },
  { type: "step", id: "c4", label: "Changing the header", state: "running" },
  { type: "step", id: "c4", label: "Changing the header", state: "failed", after: 150 },
  { type: "message", text: "Added a pricing section with three tiers. The header change needs the lock cleared." },
]

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  if (!url.startsWith("/api/")) return realFetch(input, init)

  if (/\/agent$/.test(url)) {
    const encoder = new TextEncoder()
    /**
     * One event per chunk, with a gap between them, so the panel is seen
     * updating rather than handed a finished list in one go.
     */
    const stream = new ReadableStream({
      async start(controller) {
        for (const event of EVENTS) {
          const { after, ...payload } = event
          await new Promise((resolve) => setTimeout(resolve, after ?? 40))
          controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"))
        }
        controller.close()
      },
    })
    return new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson" } })
  }

  return new Response(JSON.stringify({ messages: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

const host = document.getElementById("app")!
createRoot(host).render(
  <div style={{ width: 400, height: 700, display: "flex", flexDirection: "column" }}>
    <ThemeChat
      installId="probe-install"
      page="home"
      sections={sections}
      settings={{}}
      onRunStart={() => {}}
      onRunEnd={() => {}}
      onOp={() => {}}
      onOpenCodeEditor={() => {}}
    />
  </div>,
)
