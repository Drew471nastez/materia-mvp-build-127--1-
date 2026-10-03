import { getMainDomain } from "@/lib/url-helpers"
import { ComingSoonSignup } from "@/components/website-builder/coming-soon-signup"

/**
 * ===========================================================================
 *  A WEBSITE THAT IS NOT LIVE YET
 * ===========================================================================
 * `<name>.storelib.com` is the website somebody built. `storelib.com/<name>`
 * is their creator page on Storelib. They are not the same thing and one is
 * not a way of reaching the other.
 *
 * A subdomain with nothing published used to redirect to the creator page,
 * which made the two addresses look like one: you typed the website and got
 * the profile, with the address bar rewritten to prove it. Then it said "not
 * published yet", which is true and gives a visitor nothing to do.
 *
 * Now it is what a shop shows before it opens: Coming soon, a box to be told
 * when it does (the creator's Subscribers, like every email box on their
 * sites), and the creator page as a link, not a destination. Nothing of the
 * draft is shown: a website's design is public once it is published, and
 * the builder's preview link is how a creator shows it before then.
 */
export function SiteNotPublished({ username, displayName, creatorId }: { username: string; displayName?: string; creatorId?: string | null }) {
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
        padding: "24px 16px",
        boxSizing: "border-box",
        background: "#f8f9fa",
        color: "#1a1a2e",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>{name}</p>
        <h1 style={{ margin: "12px 0 0", fontSize: 28, lineHeight: 1.2, fontWeight: 700, letterSpacing: "-0.01em" }}>Coming soon</h1>
        <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.55, color: "#6b7280" }}>
          {name} is getting this website ready. Leave your email to hear when it opens.
        </p>
        {creatorId ? <ComingSoonSignup creatorId={creatorId} /> : null}
        <a
          href={creator}
          style={{ display: "inline-flex", alignItems: "center", minHeight: 44, marginTop: 20, fontSize: 14, fontWeight: 500, color: "#6b7280", textDecoration: "underline", textUnderlineOffset: 4 }}
        >
          See {name} on Storelib
        </a>
      </div>
    </main>
  )
}
