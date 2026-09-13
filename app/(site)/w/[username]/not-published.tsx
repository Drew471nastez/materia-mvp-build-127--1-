import { getMainDomain } from "@/lib/url-helpers"

/**
 * ===========================================================================
 *  TWO ADDRESSES, TWO THINGS
 * ===========================================================================
 * `<name>.storelib.com` is the website somebody built. `storelib.com/<name>`
 * is their creator page on Storelib. They are not the same thing and one is
 * not a way of reaching the other.
 *
 * A subdomain with nothing published used to redirect to the creator page,
 * which made the two addresses look like one: you typed the website and got
 * the profile, with the address bar rewritten to prove it. This says what is
 * actually true instead, and offers the other address as a link rather than
 * taking you there.
 */
export function SiteNotPublished({ username, displayName }: { username: string; displayName?: string }) {
  const name = (displayName ?? username).trim() || username
  const lower = username.toLowerCase()
  const creator = `https://${getMainDomain()}/${lower}`

  return (
    <main
      style={{
        minHeight: "100svh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#f8f9fa",
        color: "#1a1a2e",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8b5cf6" }}>
          {lower}.{getMainDomain()}
        </p>
        <h1 style={{ margin: "12px 0 0", fontSize: 26, lineHeight: 1.2, fontWeight: 700, letterSpacing: "-0.01em" }}>
          This website is not published yet
        </h1>
        <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.55, color: "#6b7280" }}>
          {name} has this address reserved. When the site is published it will be here.
        </p>
        <a
          href={creator}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 24,
            height: 44,
            padding: "0 20px",
            borderRadius: 12,
            background: "#1a1a2e",
            color: "#ffffff",
            fontSize: 15,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          See {name} on Storelib
        </a>
      </div>
    </main>
  )
}
