"use client"

import { useEffect, useLayoutEffect, useState } from "react"
import { toOriginalImageUrl } from "@/lib/storage/image-url"

/** Unwrap an already optimized image before building another size/srcset. */
export function originalAvatarUrl(value: string): string {
  let url = value.trim()
  for (let i = 0; i < 4; i++) {
    try {
      const parsed = new URL(url, "https://storelib.com")
      if (parsed.pathname !== "/_next/image") break
      const ours = url.startsWith("/_next/image") || parsed.hostname === (process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com") || (typeof window !== "undefined" && parsed.origin === window.location.origin)
      if (!ours) break
      const source = parsed.searchParams.get("url")
      if (!source || source === url) break
      url = source
    } catch { break }
  }
  return toOriginalImageUrl(url)
}

const decoded = new Map<string, string>()
type ImageState = { request: string | undefined; src: string | undefined; loaded: boolean; failed: boolean }

/** Bypass a cached miss only on our public files. Signed and external URLs
 * must keep their exact query. This address is for rendering, never saving. */
export function avatarRetryUrl(url: string, attempt: number, now = Date.now()): string {
  try {
    const parsed = new URL(url, "https://storelib.com")
    const own = parsed.hostname === (process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com") && parsed.pathname.startsWith("/media/")
    const storage = parsed.hostname.endsWith(".supabase.co") && parsed.pathname.startsWith("/storage/v1/object/public/")
    if (!own && !storage) return url
    parsed.searchParams.set("_sl_avatar_retry", `${Math.floor(now / 1000)}-${attempt}`)
    return url.startsWith("/") ? parsed.pathname + parsed.search + parsed.hash : parsed.href
  } catch { return url }
}

/** Keep a decoded photo through replacement. Optimizer failures try the
 * original, then two bounded retries; failures are never cached as absence. */
export function useAvatarImage(request: string | null | undefined, enabled = true) {
  const wanted = request || undefined
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState<ImageState>(() => ({ request: wanted, src: wanted, loaded: false, failed: false }))
  useLayoutEffect(() => {
    if (!wanted) { setState({ request: undefined, src: undefined, loaded: false, failed: false }); return }
    if (!enabled) return
    const cached = decoded.get(wanted)
    if (cached) { setState({ request: wanted, src: cached, loaded: true, failed: false }); return }
    let stopped = false
    let image: HTMLImageElement | null = null
    let timer = 0
    let attempt = 0
    const original = originalAvatarUrl(wanted)
    const retries = [original, avatarRetryUrl(original, 1), avatarRetryUrl(original, 2)]
    const candidates = wanted === original ? retries : [wanted, ...retries]
    setState(prev => ({ request: wanted, src: prev.loaded ? prev.src : wanted, loaded: prev.loaded, failed: false }))
    const run = () => {
      if (stopped) return
      const candidate = candidates[attempt]
      const probe = new Image()
      image = probe
      let settled = false
      const finish = (ok: boolean) => {
        if (stopped || settled) return
        settled = true
        clearTimeout(timer)
        probe.onload = probe.onerror = null
        if (ok) {
          if (decoded.size >= 200) decoded.delete(decoded.keys().next().value!)
          decoded.set(wanted, candidate)
          setState({ request: wanted, src: candidate, loaded: true, failed: false })
        } else if (++attempt < candidates.length) {
          timer = window.setTimeout(run, attempt === 1 && wanted !== original ? 0 : attempt * 300)
        } else setState({ request: wanted, src: undefined, loaded: false, failed: true })
      }
      probe.referrerPolicy = "no-referrer"
      probe.onload = () => {
        if (typeof probe.decode === "function") probe.decode().then(() => finish(true), () => finish(probe.naturalWidth > 0))
        else finish(probe.naturalWidth > 0)
      }
      probe.onerror = () => finish(false)
      timer = window.setTimeout(() => finish(false), 6000)
      probe.src = candidate
      if (probe.complete && probe.naturalWidth > 0) probe.onload(new Event("load"))
    }
    run()
    return () => { stopped = true; clearTimeout(timer); if (image) image.onload = image.onerror = null }
  }, [wanted, retry, enabled])
  useEffect(() => {
    if (!state.failed) return
    const again = () => { if (!document.hidden) setRetry(n => n + 1) }
    window.addEventListener("online", again)
    document.addEventListener("visibilitychange", again)
    return () => { window.removeEventListener("online", again); document.removeEventListener("visibilitychange", again) }
  }, [state.failed])
  const onError = () => {
    if (!wanted || state.request !== wanted || !state.loaded) return
    decoded.delete(wanted)
    setState({ request: wanted, src: wanted, loaded: false, failed: false })
    setRetry(n => n + 1)
  }
  if (!wanted) return { src: undefined, loaded: false, failed: false, onError }
  if (state.request !== wanted && !state.loaded) return { src: wanted, loaded: false, failed: false, onError }
  return { ...state, onError }
}
