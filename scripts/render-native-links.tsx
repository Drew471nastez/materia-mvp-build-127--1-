/**
 * Every kind of link a buyer meets, drawn the way the site draws it, for
 * scripts/check-native-links.mjs to press inside a pretend phone app (a
 * WebView whose user agent says Capacitor). The real SmartLink, the real
 * guard (components/platform/native-link-guard.tsx) and the real
 * openExternal; the router is the probe's stub.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import Link from "next/link"
import { SmartLink } from "@/components/smart-link"
import { NativeLinkGuard } from "@/components/platform/native-link-guard"
import { openExternal } from "@/lib/native-bridge"

function Page() {
  return (
    <main style={{ display: "grid", gap: 12, padding: 16 }}>
      <SmartLink data-case="card" href="https://storelib.com/maria/preset-pack?layout=discover&recommended=1">Explore card</SmartLink>
      <SmartLink data-case="creator-blank" href="/maria" target="_blank" rel="noopener noreferrer">Creator from a product</SmartLink>
      <SmartLink data-case="smart-site" href="https://maria.storelib.com/about">Creator website</SmartLink>
      <SmartLink data-case="smart-external" href="https://instagram.com/maria" target="_blank">Instagram</SmartLink>
      <a data-case="a-blank" href="/terms" target="_blank">Terms, new window</a>
      <a data-case="a-www" href="https://www.storelib.com/maria">www link</a>
      <a data-case="a-me" href="https://storelib.me/maria">OnePage link</a>
      <a data-case="a-plain" href="/explore/design">plain link</a>
      <a data-case="a-external" href="https://instagram.com/maria">external link</a>
      <Link data-case="next-link" href="/account/library">Next link</Link>
      <button data-case="open-internal" onClick={() => window.open("https://storelib.com/explore", "_blank")}>window.open ours</button>
      <button data-case="external-internal" onClick={() => openExternal("https://storelib.com/explore")}>openExternal ours</button>
      <button data-case="external-external" onClick={() => openExternal("https://instagram.com/maria")}>openExternal theirs</button>
      <NativeLinkGuard />
    </main>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
