"use client"

import * as React from "react"

import { Banner, Button, Facts, Panel } from "./ui"

/**
 * ===========================================================================
 *  BUILD A CREATOR'S WEBSITE FROM STORELIB DEFAULT (round 63)
 * ===========================================================================
 * Shows what their own content is (hero picture and words, products, bio,
 * logo, links) and what was left out as template sample text, then Build
 * website makes it as a new draft in their library through
 * /api/admin/creators/site. Their live website is not touched and nothing
 * is published: they review it in Website and press Publish there.
 */

type Summary = {
  name: string
  heroImage: string | null
  heroHeading: string
  heroSubheading: string
  productsHeading: string
  bio: string
  logo: string | null
  socials: string[]
  products: string[]
  leftOut: string[]
}

type State = { content: Summary; slotsLeft: number; hasLive: boolean }

const none = <span className="text-[#9b9ba6]">None</span>

export function SiteBuildPanel({ creatorId }: { creatorId: string }) {
  const [state, setState] = React.useState<State | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [note, setNote] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null)

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/creators/site?id=${encodeURIComponent(creatorId)}`, { cache: "no-store" })
      if (res.status === 401) return window.location.reload()
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) return setNote({ tone: "bad", text: body?.error || "Their content could not be read." })
      setState(body as State)
    } catch {
      setNote({ tone: "bad", text: "Could not reach the server." })
    }
  }, [creatorId])

  React.useEffect(() => {
    void load()
  }, [load])

  const build = async () => {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch("/api/admin/creators/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creatorId }) })
      if (res.status === 401) return window.location.reload()
      const body = await res.json().catch(() => null)
      if (!res.ok) return setNote({ tone: "bad", text: body?.error || "The website was not made." })
      setNote({ tone: "good", text: body?.recorded === false ? `${body.message} Not written to the audit log.` : body?.message || "Made." })
      await load()
    } catch {
      setNote({ tone: "bad", text: "Could not reach the server." })
    } finally {
      setBusy(false)
    }
  }

  const c = state?.content
  const full = state ? state.slotsLeft === 0 : false

  return (
    <Panel title="Build website" meta="Storelib Default, as a draft" id="creator-site-build">
      <div data-admin-site-build="">
        <Facts
          items={[
            { label: "Hero picture", value: c ? (c.heroImage ? <a href={c.heroImage} target="_blank" rel="noreferrer" className="underline underline-offset-2">Open</a> : none) : "" },
            { label: "Hero words", value: c ? c.heroHeading || none : "" },
            { label: "Line under it", value: c ? c.heroSubheading || none : "" },
            { label: "Products", value: c ? (c.products.length ? `${c.products.length}: ${c.products.join(", ")}` : none) : "" },
            { label: "Products heading", value: c ? c.productsHeading || none : "" },
            { label: "Bio", value: c ? (c.bio ? `${c.bio.slice(0, 60)}${c.bio.length > 60 ? "…" : ""}` : none) : "" },
            { label: "Logo", value: c ? (c.logo ? "Yes" : none) : "" },
            { label: "Social links", value: c ? (c.socials.length ? c.socials.join(", ") : none) : "" },
            { label: "Room in library", value: state ? (full ? "Full" : `${state.slotsLeft} left`) : "" },
          ]}
        />
        {c && c.leftOut.length ? (
          <div className="border-t border-white/[0.06] px-4 py-2.5 text-[12px] text-[#9b9ba6]">
            <p className="mb-1">Left out, because it is the old theme&apos;s sample text:</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {c.leftOut.map((l) => (
                <li key={l} className="break-words">{l}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-4 py-3">
          <p className="min-w-0 text-[12px] text-[#9b9ba6]">
            {full ? "Their library is full. Remove a website from it first." : "A new draft in their library. Their live website stays as it is."}
          </p>
          <Button variant="primary" disabled={busy || !state || full} onClick={() => void build()}>
            {busy ? "Building" : "Build website"}
          </Button>
        </div>
        {note ? (
          <div className="border-t border-white/[0.06] p-3">
            <Banner tone={note.tone} onClose={() => setNote(null)}>
              {note.text}
            </Banner>
          </div>
        ) : null}
      </div>
    </Panel>
  )
}
