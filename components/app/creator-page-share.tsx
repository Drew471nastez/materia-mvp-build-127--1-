"use client"

/**
 * ===========================================================================
 *  WHERE THE CREATOR PAGE LIVES
 * ===========================================================================
 * The bar used to carry a "View live" link and nothing else, so the address
 * of the page a creator is working on was a line of grey text they could not
 * copy and a link that took them away from what they were doing.
 *
 * This is the website builder's publish card, in the same dark idiom, minus
 * the one thing that does not apply: THERE IS NO PUBLISH BUTTON. A creator
 * page has no draft and no published copy — an edit is live the moment it is
 * saved — so a button offering to publish it would be a button that does
 * nothing, and a "Changes since published" line would be counting a number
 * that is always zero. It says that plainly instead, because "is this live?"
 * is the question the button was there to answer.
 *
 * The custom domain row LINKS rather than duplicates. Adding a domain is
 * five steps with DNS records and a verification poll, and it already exists
 * under Settings → Domains. A second copy of that flow in here is a second
 * thing to keep correct; what belongs here is whether there is one, and the
 * way to the place that adds it.
 */

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Check, Copy, ExternalLink, Globe, ShieldCheck, X } from "lucide-react"

interface Domain {
  domain?: string | null
  status?: string | null
  is_active?: boolean | null
}

export function CreatorPageShare({
  open,
  onClose,
  handle,
}: {
  open: boolean
  onClose: () => void
  handle: string
}) {
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [domain, setDomain] = useState<Domain | null>(null)
  const [domainsChecked, setDomainsChecked] = useState(false)

  useEffect(() => setMounted(true), [])

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

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your creator page"
        className="relative w-full max-w-[420px] rounded-t-[20px] border border-white/10 bg-[#131316] p-5 text-white shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)] sm:rounded-[20px]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>

        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <h2 className="text-[19px] font-semibold leading-none">Your page is live</h2>
        </div>
        <p className="mt-2 text-[14px] text-white/55">Every edit shows up straight away. There is nothing to publish.</p>

        <p className="mb-2.5 mt-5 text-[15px] font-medium">Page address</p>
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
              aria-label="Open the page"
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
            className="flex items-center gap-3 border-t border-white/10 px-4 py-3 text-[14px] no-underline transition-colors hover:bg-white/[0.04]"
          >
            <Globe className="h-4 w-4 shrink-0 text-white/40" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate text-white/70">
              {domain?.domain
                ? domain.status === "active"
                  ? domain.domain
                  : `${domain.domain} — waiting on DNS`
                : "Add a custom domain"}
            </span>
            <span className="shrink-0 text-white/40">{domain?.domain ? "Manage" : "Set up"}</span>
          </a>
        </div>

        <div className="mt-4 flex items-center gap-2.5 text-[14px] text-white/80">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={1.75} />
          No security issues found
        </div>

        <a
          href={path}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-[15px] font-semibold text-[#131316] no-underline transition-[background-color,transform] duration-150 hover:bg-white/90 active:scale-[0.99]"
        >
          <ExternalLink className="h-4 w-4" strokeWidth={2} />
          Open my page
        </a>
      </div>
    </div>,
    document.body,
  )
}
