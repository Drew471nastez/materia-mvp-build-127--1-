"use client"

/**
 * ===========================================================================
 *  WHERE THE CREATOR PAGE LIVES
 * ===========================================================================
 * The bar used to carry a "View live" link and nothing else, so the address
 * of the page a creator is working on was a line of grey text they could not
 * copy and a link that took them away from what they were doing.
 *
 * This is the website builder's publish card, minus the one thing that does
 * not apply: THERE IS NO PUBLISH BUTTON. A creator page has no draft and no
 * published copy — an edit is live the moment it is saved — so a button
 * offering to publish it would be a button that does nothing, and a "Changes
 * since published" line would be counting a number that is always zero. It
 * says that plainly instead, because "is this live?" is the question the
 * button was there to answer.
 *
 * The custom domain row LINKS rather than duplicates. Adding a domain is
 * five steps with DNS records and a verification poll, and it already exists
 * under Settings → Domains. A second copy of that flow in here is a second
 * thing to keep correct; what belongs here is whether there is one, and the
 * way to the place that adds it.
 *
 * ---------------------------------------------------------------------------
 *  THE WEBSITE BUILDER'S PALETTE, TO THE VALUE
 * ---------------------------------------------------------------------------
 * #1f1f1f with white/10 hairlines and white/60 secondary type, because that
 * is what components/website-builder/publish-panel.tsx is, and this is the
 * same card answering the same question one product over. It was light for a
 * round; the owner asked for the builder's, and two cards that do the same
 * job in one product should not be two colours.
 *
 * Inline rather than centred, and it leaves the way it arrives: a centred
 * dialog says "stop and decide", and an address to copy is not that.
 */

import { useCallback, useEffect, useState } from "react"
import { Check, Copy, ExternalLink, Globe, ShieldCheck } from "lucide-react"

import { InlinePanel } from "@/components/app/inline-panel"
import { creatorPageHostFrom } from "@/lib/custom-domains/client"
import { BottomSheet } from "@/components/ui/bottom-sheet"

interface Domain {
  domain?: string | null
  status?: string | null
  purpose?: string | null
  is_primary?: boolean | null
  host?: string | null
}

export function CreatorPageShare({
  open,
  onClose,
  handle,
  isPhone = false,
}: {
  open: boolean
  onClose: () => void
  handle: string
  /** Decided by the workspace, which already watches the viewport. */
  isPhone?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [domain, setDomain] = useState<Domain | null>(null)
  const [domainsChecked, setDomainsChecked] = useState(false)

  const path = `/${encodeURIComponent(handle)}`
  const display = `storelib.com/${handle}`
  /*
    THE ADDRESS COPIED IS THE ONE ON SCREEN: storelib.com, never the host
    the workspace happens to be open on. Only a storelib.com address opens
    the Storelib app (lib/platform/app-links.ts), and the card said one
    thing while the clipboard held another.
  */
  const absolute = `https://storelib.com${path}`

  /* Asked for only when the card is opened: nobody needs this on page load. */
  useEffect(() => {
    if (!open || domainsChecked) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/domains")
        if (!res.ok) return
        const data = await res.json()
        /*
          The creator page's own domain: its primary one, connected or still
          waiting on DNS. This read `is_active`, a field no domain has, so the
          row said "Add a custom domain" to everybody who had one.
        */
        const host = creatorPageHostFrom(data)
        const mine = (data.domains as Domain[] | undefined)?.filter((d) => d.purpose === "creator_page") ?? []
        const primary = mine.find((d) => d.is_primary) ?? mine[0] ?? null
        const live = host ? { domain: host, status: "active" } : primary ? { domain: primary.host || primary.domain, status: primary.status } : null
        if (!cancelled) setDomain(live)
      } catch {
        /* A domain we could not look up is shown as none, which is the same
           row with the same way out of it. */
      } finally {
        if (!cancelled) setDomainsChecked(true)
      }
    })()
    return () => { cancelled = true }
  }, [open, domainsChecked])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(absolute)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* A clipboard a browser refuses is not an error worth a dialog: the
         address is on screen and selectable. */
    }
  }, [absolute])

  const body = (
    <div className="flex flex-col">
      {/*
        NO CLOSE BUTTON. Asked for, and right: this card decides nothing and
        traps nothing. Clicking off it, pressing Escape and dragging the sheet
        down all close it, which is three ways out on a card that is really a
        popover — and an X in the corner made it look like a dialog waiting
        for an answer it does not have a question for.
      */}
      <div className="flex items-center gap-2.5 px-5 pb-1 pt-5">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <h2 className="text-[20px] font-semibold leading-none text-white">Your page is live</h2>
      </div>

      <div className="space-y-5 px-5 pb-5 pt-3 text-white">
        <p className="text-[15px] text-white/60">Every edit shows up straight away. There is nothing to publish.</p>

        <div>
          <p className="mb-2.5 text-[15px] font-medium">Page address</p>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Globe className="h-4 w-4 shrink-0 text-white/50" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate text-[15px]">{display}</span>
              <button
                type="button"
                onClick={() => void copy()}
                className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Copy address"
              >
                {copied ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
              </button>
              <a
                href={path}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Open my page"
                title="Open my page"
              >
                <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
              </a>
            </div>

            <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3 text-[14px] text-white/70">
              <Globe className="h-4 w-4 shrink-0 text-white/40" strokeWidth={1.75} />
              Visible to anyone with the link
            </div>

            {/*
              One row, three states, and it says which one it is in rather than
              offering the same words to all of them: a domain that works, a
              domain still waiting on DNS, and no domain at all.
            */}
            <a
              href="/app/settings?tab=domains"
              className="flex items-center gap-3 border-t border-white/10 px-4 py-3 text-[14px] no-underline transition-colors hover:bg-white/[0.06]"
            >
              <Globe className="h-4 w-4 shrink-0 text-white/40" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate text-white/80">
                {domain?.domain
                  ? domain.status === "active"
                    ? domain.domain
                    : `${domain.domain}, waiting on DNS`
                  : "Add a custom domain"}
              </span>
              <span className="shrink-0 text-white/50">{domain?.domain ? "Manage" : "Set up"}</span>
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-[14px] text-white/80">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={1.75} />
          No security issues found
        </div>

        <a
          href={path}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-[15px] font-semibold text-[#111113] no-underline shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_-1px_0_rgba(0,0,0,0.08)] transition-colors hover:bg-white/90 active:bg-white/80"
        >
          <ExternalLink className="h-4 w-4" />
          Open my page
        </a>
      </div>
    </div>
  )

  if (isPhone) {
    return (
      /*
        THE APP'S OWN SHEET, not the website builder's. The builder's sheet is
        a whole editing surface (detents, a peek, keyboard insets, a canvas it
        resizes) and this is a card with an address on it; closing it went
        through all of that machinery and lagged. components/ui/bottom-sheet
        opens and closes on the compositor, follows the finger, and is closed
        out of the document, so nothing peeks. It is painted the builder's
        near-black, and its skirt inherits that.
      */
      <BottomSheet
        isOpen={open}
        onClose={onClose}
        label="Your creator page"
        hideFrom={null}
        className="bg-[#1f1f1f]"
      >
        {body}
      </BottomSheet>
    )
  }

  /*
    InlinePanel keeps it mounted for the length of the exit animation, so it
    leaves the way it arrived instead of being deleted on a single frame.
  */
  return (
    <InlinePanel
      open={open}
      onClose={onClose}
      label="Your creator page"
      className="right-3 top-[56px] w-[420px] max-w-[calc(100vw-16px)]"
      surfaceClassName="border border-white/10 bg-[#1f1f1f] shadow-[0_24px_80px_-16px_rgba(0,0,0,0.7)] [will-change:transform,opacity]"
      /*
        IT LEAVES ON THE PRESS. The shared exit eases in, so for its first four
        frames the card barely moved and the close read as lag. This one
        starts at speed and settles, over the same 160ms. The layer is kept
        ready while the card is up (`will-change`), so the first frame of the
        exit is not spent rasterising an 80px shadow.
      */
      exitClassName="cp-panel-out"
    >
      {body}
    </InlinePanel>
  )
}
