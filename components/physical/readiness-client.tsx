"use client"

/**
 * The browser's side of physical readiness (lib/physical/readiness.ts): one
 * read of /api/physical/readiness shared by every banner on the page, kept
 * for this tab only (it describes the store, so never in storage), and the
 * link every "Fix" uses.
 */
import * as React from "react"
import { AppLink } from "@/components/app/app-link"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import type { PhysicalReadiness } from "@/lib/physical/readiness"

const KEEP_MS = 30_000
let last: { at: number; data: PhysicalReadiness } | null = null
let inflight: Promise<PhysicalReadiness | null> | null = null
const listeners = new Set<(r: PhysicalReadiness) => void>()

function load(fresh: boolean): Promise<PhysicalReadiness | null> {
  if (!fresh && inflight) return inflight
  const p = fetch(`/api/physical/readiness${fresh ? "?fresh=1" : ""}`, { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { readiness?: PhysicalReadiness } | null) => {
      const r = d?.readiness ?? null
      if (r) {
        last = { at: Date.now(), data: r }
        for (const l of listeners) l(r)
      }
      return r
    })
    .catch(() => null)
    .finally(() => {
      if (inflight === p) inflight = null
    })
  inflight = p
  return p
}

/**
 * The store's readiness, or null until it comes (and while physical commerce
 * is off, when nothing is asked). `version` changing reads it again, fresh:
 * Settings passes what it just saved.
 */
export function useReadiness(version?: string | number | null, opts: { freshOnOpen?: boolean } = {}): PhysicalReadiness | null {
  const physical = usePhysicalCommerceEnabled()
  const [r, setR] = React.useState<PhysicalReadiness | null>(() => (last && Date.now() - last.at < KEEP_MS ? last.data : null))
  const first = React.useRef(true)
  React.useEffect(() => {
    if (!physical) return
    let live = true
    const on = (x: PhysicalReadiness) => live && setR(x)
    listeners.add(on)
    const fresh = first.current ? !!opts.freshOnOpen : version !== undefined
    first.current = false
    if (fresh || !last || Date.now() - last.at >= KEEP_MS) void load(fresh)
    else setR(last.data)
    return () => {
      live = false
      listeners.delete(on)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [physical, version])
  return physical ? r : null
}

/** The editor's question: this product, as if it were published. Not shared: it is about one draft. */
export function useReadinessFor(productId: string | null | undefined, version?: string | number | null): PhysicalReadiness | null {
  const physical = usePhysicalCommerceEnabled()
  const [r, setR] = React.useState<PhysicalReadiness | null>(null)
  React.useEffect(() => {
    if (!physical) return
    let live = true
    const q = productId ? `?product=${encodeURIComponent(productId)}` : ""
    fetch(`/api/physical/readiness${q}`, { cache: "no-store", credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d: { readiness?: PhysicalReadiness } | null) => {
        if (live && d?.readiness) setR(d.readiness)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [physical, productId, version])
  return physical ? r : null
}

/**
 * A "Fix" link. Inside Settings a link to another section switches the
 * section in place (components/app/settings-form-new.tsx listens for
 * storelib:settings-tab), since Settings reads its address only when it
 * opens; anywhere else it is an ordinary /app link.
 */
export function ReadinessLink({ href, className, children, plain }: { href: string; className?: string; children: React.ReactNode; plain?: boolean }) {
  const onClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return
    const m = /^\/app\/settings\?tab=([a-z_]+)$/.exec(href)
    if (m && typeof window !== "undefined" && window.location.pathname.startsWith("/app/settings")) {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent("storelib:settings-tab", { detail: m[1] }))
    }
  }
  if (plain) {
    return (
      <a href={href} className={className} onClick={onClick}>
        {children}
      </a>
    )
  }
  return (
    <AppLink href={href} className={className} onClick={onClick}>
      {children}
    </AppLink>
  )
}
