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
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"

interface Domain {
  domain?: string | null
  status?: string | null
  is_active?: boolean | null
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

  const path = `/u/${encodeURIComponent(handle)}`
  const display = `storelib.com/u/${handle}`
  const absolute = typeof window === "undefined" ? display : `${window.location.origin}${path}`

  /* Asked for only when the card is opened: nobody needs this on page load. */
  useEffect(() => {
    if (!open || domainsChecked) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/domains")
        if (!res.ok) return
        const data = await res.json()
        const live = (data.domains as Domain[] | undefined)?.find((d) => d.is_active) ?? null
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
                    : `${domain.domain} — waiting on DNS`
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
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#8B56FA] text-[15px] font-medium text-white no-underline transition-colors hover:bg-[#7b46ec]"
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
        The sheet paints itself `bg-background`, which on /app is white. This
        card is the builder's near-black, so it brings its own surface and
        fills the sheet edge to edge rather than sitting as a dark rectangle
        on a white one.
      */
      <MobileEditorSheet
        open={open}
        onOpenChange={(o) => { if (!o) onClose() }}
        fit
        className="bg-[#1f1f1f]"
        /*
          NOT THE BUILDER'S BASE SHEET. The default peeks 72px above the
          bottom edge when closed, because the builder's tab row lives in it.
          This card is not that: left at the default it sat as a permanent
          dark strip across the bottom of the page — "your page is live is
          always at the bottom". No peek, and raised above anything else.
        */
        peekHeight={0}
        layer="raised"
      >
        {body}
      </MobileEditorSheet>
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
      surfaceClassName="border border-white/10 bg-[#1f1f1f] shadow-[0_24px_80px_-16px_rgba(0,0,0,0.7)]"
    >
      {body}
    </InlinePanel>
  )
}
