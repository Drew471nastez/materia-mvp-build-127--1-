"use client"

import * as React from "react"

import type { GalleryEntry, GalleryEmail } from "@/lib/admin/email-gallery"

/**
 * ===========================================================================
 *  EVERY EMAIL, ON THE CONSOLE'S DARK SURFACE
 * ===========================================================================
 * Two sections (Storelib's own emails, and the ones a business sends its
 * customers), each in categories down the left; a row opens its preview on
 * the right: the subject, the inbox preview line, and the email itself in a
 * frame, at a computer's width or a phone's. A search narrows the list.
 */

type Width = "desktop" | "phone"

export function EmailsAdmin({ emails }: { emails: GalleryEntry[] }) {
  const [section, setSection] = React.useState<"platform" | "business">("platform")
  const [q, setQ] = React.useState("")
  const [picked, setPicked] = React.useState<string | null>(null)
  const [mail, setMail] = React.useState<GalleryEmail | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [width, setWidth] = React.useState<Width>("desktop")

  const shown = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    return emails.filter((e) => e.section === section && (!needle || `${e.name} ${e.category} ${e.when} ${e.id}`.toLowerCase().includes(needle)))
  }, [emails, section, q])
  const groups = React.useMemo(() => {
    const m = new Map<string, GalleryEntry[]>()
    for (const e of shown) m.set(e.category, [...(m.get(e.category) ?? []), e])
    return [...m.entries()]
  }, [shown])

  React.useEffect(() => {
    if (!picked && shown[0]) setPicked(shown[0].id)
  }, [picked, shown])

  React.useEffect(() => {
    if (!picked) return
    let live = true
    setError(null)
    void fetch(`/api/admin/emails?id=${encodeURIComponent(picked)}`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!live) return
        if (!r.ok) {
          setMail(null)
          setError(body.error || "Could not draw this email.")
        } else setMail(body as GalleryEmail)
      })
      .catch(() => live && setError("Could not reach the server."))
    return () => {
      live = false
    }
  }, [picked])

  const entry = emails.find((e) => e.id === picked) ?? null
  const counts = { platform: emails.filter((e) => e.section === "platform").length, business: emails.filter((e) => e.section === "business").length }

  return (
    <div className="min-h-dvh bg-[#0b0b0f] text-[#ededf0]" data-admin-emails="">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-white/[0.08] bg-[#0b0b0f]/95 px-4 py-3 backdrop-blur sm:px-6">
        <a href="/admin" className="text-[13px] text-[#9b9ba6] hover:text-[#ededf0]">
          Admin
        </a>
        <span className="text-[#4b4b55]">/</span>
        <h1 className="text-[15px] font-semibold">Every email</h1>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-white/[0.08] p-0.5" role="tablist">
          {(["platform", "business"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={section === s}
              onClick={() => {
                setSection(s)
                setPicked(null)
              }}
              className={`h-8 rounded-md px-3 text-[13px] ${section === s ? "bg-white/[0.08] text-[#ededf0]" : "text-[#9b9ba6] hover:text-[#ededf0]"}`}
              data-email-section={s}
            >
              {s === "platform" ? "Storelib emails" : "Business emails"} <span className="text-[#6b6b76]">{counts[s]}</span>
            </button>
          ))}
        </div>
      </header>
      <div className="grid gap-0 lg:grid-cols-[340px_1fr]">
        <aside className="border-b border-white/[0.08] lg:sticky lg:top-[57px] lg:h-[calc(100dvh-57px)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="p-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search emails" className="h-9 w-full rounded-[7px] border border-white/[0.1] bg-[#17171d] px-3 text-[13px] text-[#ededf0] outline-none placeholder:text-[#6b6b76] focus:border-white/25" />
          </div>
          <nav className="pb-6" data-email-list="">
            {groups.map(([cat, list]) => (
              <section key={cat} className="px-2 pt-2">
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[#6b6b76]">
                  {cat} <span className="text-[#4b4b55]">{list.length}</span>
                </p>
                <ul>
                  {list.map((e) => (
                    <li key={e.id}>
                      <button type="button" onClick={() => setPicked(e.id)} className={`w-full rounded-md px-2 py-1.5 text-left text-[13px] ${picked === e.id ? "bg-white/[0.08] text-[#ededf0]" : "text-[#c4c4cc] hover:bg-white/[0.04]"}`} data-email-row={e.id}>
                        {e.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {groups.length === 0 ? <p className="px-4 py-6 text-[13px] text-[#6b6b76]">No email matches.</p> : null}
          </nav>
        </aside>
        <main className="min-w-0 p-4 sm:p-6">
          {entry ? (
            <div className="mx-auto max-w-[760px]">
              <p className="text-[12px] text-[#6b6b76]">
                {entry.section === "platform" ? "Storelib" : "Business"} · {entry.category}
              </p>
              <h2 className="mt-0.5 text-[18px] font-semibold">{entry.name}</h2>
              <p className="mt-1 text-[13px] text-[#9b9ba6]">{entry.when}</p>
              {error ? <p className="mt-4 rounded-lg border border-[#f47067]/30 bg-[#f47067]/10 px-3 py-2 text-[13px] text-[#f47067]">{error}</p> : null}
              {mail ? (
                <>
                  <div className="mt-4 rounded-lg border border-white/[0.08] bg-[#121217] px-3.5 py-3 text-[13px]" data-email-subject="">
                    <p>
                      <span className="text-[#6b6b76]">Subject </span>
                      {mail.subject}
                    </p>
                    {mail.preview ? (
                      <p className="mt-1 text-[#9b9ba6]">
                        <span className="text-[#6b6b76]">Preview </span>
                        {mail.preview}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1">
                    {(["desktop", "phone"] as const).map((w) => (
                      <button key={w} type="button" onClick={() => setWidth(w)} className={`h-8 rounded-md px-3 text-[12.5px] ${width === w ? "bg-white/[0.08] text-[#ededf0]" : "text-[#9b9ba6] hover:text-[#ededf0]"}`}>
                        {w === "desktop" ? "Computer" : "Phone"}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-center rounded-xl bg-[#e9eaee] p-3 sm:p-5">
                    <iframe title={`Preview of ${entry.name}`} srcDoc={mail.html} sandbox="" className="h-[760px] rounded-md border-0 bg-white transition-[width] duration-200" style={{ width: width === "phone" ? 390 : "100%" }} data-email-frame="" />
                  </div>
                </>
              ) : !error ? (
                <div className="mt-4 h-[760px] animate-pulse rounded-xl bg-white/[0.04]" />
              ) : null}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  )
}
