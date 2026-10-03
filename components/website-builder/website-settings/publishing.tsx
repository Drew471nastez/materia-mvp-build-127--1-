"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { relativeTime } from "@/lib/website-builder/relative-time"
import { AddressValue, Badge, Card, ErrorNote, PageTitle, Row, buttonClass, primaryButtonClass } from "./parts"
import type { SettingsContext } from "./types"
import { PasswordCard } from "./password"

function when(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function PublishingSettings({ ctx }: { ctx: SettingsContext }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const takeOffline = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${ctx.installId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unpublish" }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error || "Could not take the website offline")
      setConfirming(false)
      ctx.onUnpublished()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not take the website offline")
    } finally {
      setBusy(false)
    }
  }

  const published = when(ctx.publishedAt)
  const ago = relativeTime(ctx.publishedAt)

  return (
    <>
      <PageTitle aside={<button type="button" onClick={ctx.onPublish} className={primaryButtonClass}>{ctx.live ? "Publish changes" : "Publish"}</button>}>
        Publishing
      </PageTitle>

      <Card>
        <Row label="Status" hint={ctx.live ? "Visitors see the last version you published." : "Nobody can see this website until you publish it."} inline>
          {ctx.live ? <Badge tone="live">Live</Badge> : <Badge tone="neutral">Draft</Badge>}
        </Row>
        <Row label="Published address">
          <AddressValue url={ctx.websiteUrl} display={ctx.websiteUrlDisplay} />
        </Row>
        <Row label="Last published">
          <span className="text-[14px] text-white/70" title={published ?? undefined}>
            {ctx.live ? (ago ? `${published} (${ago})` : published ?? "Published") : "Not yet"}
          </span>
        </Row>
      </Card>

      <PasswordCard ctx={ctx} />

      {ctx.live && (
        <Card title="Take offline">
          <Row label="Unpublish this website" hint="Your address shows a Coming soon page. Nothing is deleted, and you can publish again at any time.">
            {confirming ? (
              <span className="flex items-center gap-2">
                <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-11 rounded-lg px-3 text-[15px] text-white/70 hover:text-white md:h-9 md:text-[14px]">
                  Keep live
                </button>
                <button
                  type="button"
                  onClick={() => void takeOffline()}
                  disabled={busy}
                  className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-amber-500 px-4 text-[15px] font-semibold text-[#1a1200] transition-colors hover:bg-amber-400 disabled:opacity-60 md:h-9 md:rounded-lg md:text-[14px]"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Take offline
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className={buttonClass}>
                Take offline
              </button>
            )}
          </Row>
        </Card>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </>
  )
}
