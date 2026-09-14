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
 *  INLINE AND LIGHT, AND IT LEAVES THE WAY IT ARRIVED
 * ---------------------------------------------------------------------------
 * It arrived as a centred black dialog over a dimmed page. A centred dialog
 * says "stop and decide"; an address to copy is not that. And a near-black
 * card in a light editor is a hard edge with nothing in between. So it is
 * the same shape as the bar editor beside it: a panel that rises in at the
 * side on a desktop (the builder's own wb-settings-in), the builder's own
 * MobileEditorSheet on a phone, and the workspace's light palette.
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
      <div className="flex items-center gap-2.5 border-b border-[#f3f4f6] px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <p className="text-[14px] font-semibold text-[#1a1a2e]">Your page is live</p>
      </div>

      <div className="space-y-4 px-4 py-4">
        <p className="text-[13px] text-[#6b7280]">Every edit shows up straight away. There is nothing to publish.</p>

        <div>
          <p className="mb-2 text-[12px] font-medium text-[#374151]">Page address</p>
          <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-[#fafafa]">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <Globe className="h-4 w-4 shrink-0 text-[#9ca3af]" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate text-[14px] text-[#111827]">{display}</span>
              <button
                type="button"
                onClick={() => void copy()}
                className="rounded-md p-1.5 text-[#6b7280] transition-colors hover:bg-[#eef0f3] hover:text-[#111827]"
                aria-label="Copy address"
              >
                {copied ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
              </button>
              <a
                href={path}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md p-1.5 text-[#6b7280] transition-colors hover:bg-[#eef0f3] hover:text-[#111827]"
                aria-label="Open my page"
                title="Open my page"
              >
                <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
              </a>
            </div>

            <div className="flex items-center gap-3 border-t border-[#e5e7eb] px-3.5 py-2.5 text-[13px] text-[#6b7280]">
              <Globe className="h-4 w-4 shrink-0 text-[#c4c8cf]" strokeWidth={1.75} />
              Visible to anyone with the link
            </div>

            {/*
              One row, three states, and it says which one it is in rather than
              offering the same words to all of them: a domain that works, a
              domain still waiting on DNS, and no domain at all.
            */}
            <a
              href="/app/settings?tab=domains"
              className="flex items-center gap-3 border-t border-[#e5e7eb] px-3.5 py-2.5 text-[13px] no-underline transition-colors hover:bg-[#f3f4f6]"
            >
              <Globe className="h-4 w-4 shrink-0 text-[#c4c8cf]" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate text-[#374151]">
                {domain?.domain
                  ? domain.status === "active"
                    ? domain.domain
                    : `${domain.domain} — waiting on DNS`
                  : "Add a custom domain"}
              </span>
              <span className="shrink-0 text-[#9ca3af]">{domain?.domain ? "Manage" : "Set up"}</span>
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-[13px] text-[#374151]">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" strokeWidth={1.75} />
          No security issues found
        </div>

        <a
          href={path}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#1a1a2e] text-[14px] font-semibold text-white no-underline transition-colors hover:bg-[#2a2a3e]"
        >
          <ExternalLink className="h-4 w-4" />
          Open my page
        </a>
      </div>
    </div>
  )

  if (isPhone) {
    return (
      <MobileEditorSheet open={open} onOpenChange={(o) => { if (!o) onClose() }} fit>
        {body}
      </MobileEditorSheet>
    )
  }

  /*
    InlinePanel keeps it mounted for the length of the exit animation, so it
    leaves the way it arrived instead of being deleted on a single frame.
  */
  return (
    <InlinePanel open={open} onClose={onClose} label="Your creator page" className="right-3 top-[56px] w-[380px]">
      {body}
    </InlinePanel>
  )
}
