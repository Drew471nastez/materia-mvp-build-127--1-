"use client"

import * as React from "react"

/**
 * The address's public picture, for a card that has none of its own: kept on
 * the block under `field`, asked for once per address. Nothing is written when
 * the creator set the field, or when the preview has no picture.
 */
export function useCoverFromPreview(url: string | null | undefined, current: string | null | undefined, field: string, wanted: boolean, update: (patch: Record<string, unknown>) => void) {
  const asked = React.useRef<string | null>(null)
  const updateRef = React.useRef(update)
  updateRef.current = update
  React.useEffect(() => {
    const address = (url || "").trim()
    if (!wanted || !address || current || asked.current === address || !/^https:\/\//i.test(address)) return
    asked.current = address
    const ctrl = new AbortController()
    const t = window.setTimeout(() => {
      fetch(`/api/onepage/link-preview?url=${encodeURIComponent(address)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((meta: { image?: string | null } | null) => {
          if (meta?.image && /^https:\/\//.test(meta.image)) updateRef.current({ [field]: meta.image })
        })
        .catch(() => {})
    }, 600)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
  }, [url, current, field, wanted])
}
