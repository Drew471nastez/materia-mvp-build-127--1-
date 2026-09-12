import Link from "next/link"

/**
 * ===========================================================================
 *  NOT FOUND, ON THE SITE RATHER THAN ON STORELIB
 * ===========================================================================
 * Every `notFound()` under /w lands here: a page key the site has not
 * published, a product that belongs to somebody else, an address nobody made.
 * It used to be Storelib's own 404 — a grey "Page not found" and a button
 * reading "Explore Storelib" — which on a creator's shop reads as the shop
 * being broken and then sends the visitor to a different website.
 *
 * IT IS NOT THE SITE'S HEADER AND FOOTER, and that is a constraint rather
 * than a preference. A not-found boundary is not given its segment's params,
 * so the only way to know whose site this is would be to read the request
 * (the host, or a header the proxy sets) — and the pages under this boundary
 * are held at the edge for a minute, so a request read here throws "Page
 * changed from static to dynamic at runtime" and a missing page becomes a
 * 500. It was tried, and that is exactly what happened on the live site.
 *
 * So this is deliberately hostless: no branding, nothing about Storelib, and
 * one link, to `/`, which on whatever address the visitor is at is the front
 * page of the site they were already on.
 */
export default function SiteNotFound() {
  return (
    <main
      style={{
        minHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "0 24px",
        textAlign: "center",
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
        color: "#1a1a2e",
        background: "#ffffff",
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>That page is not here</h1>
      <p style={{ fontSize: 15, color: "#6b7280", margin: 0, maxWidth: 420, lineHeight: 1.5 }}>
        The link may be old, or the page may have moved.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 6,
          display: "inline-flex",
          height: 44,
          alignItems: "center",
          borderRadius: 12,
          background: "#1a1a2e",
          color: "#ffffff",
          padding: "0 20px",
          fontSize: 15,
          fontWeight: 550,
          textDecoration: "none",
        }}
      >
        Back to the home page
      </Link>
    </main>
  )
}
