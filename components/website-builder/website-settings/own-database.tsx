"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { OWN_DB_KEY, OWN_DB_URL, checkDatabaseUrl, checkPublicKey, ownDatabase } from "@/lib/website-builder/own-database"
import { Card, GOES_LIVE, Row, buttonClass, inputClass, primaryButtonClass } from "./parts"
import type { SettingsContext } from "./types"
import { tt } from "@/lib/i18n/text"

/**
 * ===========================================================================
 *  YOUR OWN SUPABASE, FOR SECTIONS THAT ASK FOR IT
 * ===========================================================================
 * Connect Supabase signs in at Supabase and lists the projects to pick from,
 * the way Lovable does it; nothing is typed (lib/website-builder/
 * supabase-connect.ts). The project's address and public key are saved with
 * the site's settings exactly as before, under the rules in
 * lib/website-builder/own-database.ts.
 *
 * The typed form is kept only for a Storelib that has no Supabase OAuth app
 * set up, so the connection is never out of reach.
 */
interface Listing {
  configured: boolean
  projects: { ref: string; name: string; region: string }[] | null
  error?: string
}

export function OwnDatabaseSettings({ ctx }: { ctx: SettingsContext }) {
  const settings = ctx.settings as Record<string, unknown>
  const connected = ownDatabase(settings)
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(typeof settings[OWN_DB_URL] === "string" ? (settings[OWN_DB_URL] as string) : "")
  const [key, setKey] = useState("")
  const [problem, setProblem] = useState<string | null>(null)
  const [listing, setListing] = useState<Listing | null>(null)
  const [picking, setPicking] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/website-builder/supabase/projects?installId=${encodeURIComponent(ctx.installId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Listing | null) => {
        if (!alive) return
        setListing(d ?? { configured: false, projects: null })
        if (d?.error) setProblem(d.error)
      })
      .catch(() => alive && setListing({ configured: false, projects: null }))
    return () => {
      alive = false
    }
  }, [ctx.installId])

  const signIn = () => ctx.onNavigate(`/api/website-builder/supabase/connect?installId=${encodeURIComponent(ctx.installId)}`)

  const pick = async (ref: string) => {
    setPicking(ref)
    setProblem(null)
    try {
      const res = await fetch("/api/website-builder/supabase/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installId: ctx.installId, ref }),
      })
      const d = (await res.json().catch(() => ({}))) as { url?: string; key?: string; error?: string }
      if (!res.ok || !d.url || !d.key) throw new Error(d.error || tt("That project could not be connected. Try again."))
      ctx.onSettingChange(OWN_DB_URL, d.url)
      ctx.onSettingChange(OWN_DB_KEY, d.key)
      setUrl(d.url)
      setListing((l) => (l ? { ...l, projects: null } : l))
    } catch (e) {
      setProblem(e instanceof Error ? e.message : tt("That project could not be connected. Try again."))
    } finally {
      setPicking(null)
    }
  }

  const save = () => {
    const u = checkDatabaseUrl(url)
    if (!u.ok) return setProblem(u.error)
    const k = checkPublicKey(key || (connected ? connected.key : ""))
    if (!k.ok) return setProblem(k.error)
    setProblem(null)
    ctx.onSettingChange(OWN_DB_URL, u.value)
    ctx.onSettingChange(OWN_DB_KEY, k.value)
    setKey("")
    setOpen(false)
  }
  const disconnect = () => {
    ctx.onSettingChange(OWN_DB_URL, "")
    ctx.onSettingChange(OWN_DB_KEY, "")
    setUrl("")
    setKey("")
    setProblem(null)
    setOpen(false)
  }

  const oauth = listing?.configured === true
  const projects = listing?.projects ?? null

  return (
    <Card title={tt("Your own database")} footer={open || projects ? tt(GOES_LIVE) : undefined}>
      <Row
        label={
          <span className="inline-flex items-center gap-2.5">
            <SupabaseMark className="h-[18px] w-[18px]" />
            Supabase
          </span>
        }
        hint={
          connected
            ? <>{tt("Connected to")} <span className="text-white/70">{new URL(connected.url).hostname}</span>{tt(". Sections that use a database can read and save to it.")}</>
            : <>{tt("For sections you write that read or save your own data, like a waitlist or a guestbook. Your project’s security rules decide what they can reach.")}</>
        }
        inline
      >
        {listing === null ? (
          <Loader2 className="h-4 w-4 animate-spin text-white/45" aria-label={tt("Loading")} />
        ) : oauth ? (
          !projects && (
            <div className="flex gap-2">
              {connected && <button type="button" className={buttonClass} onClick={disconnect}>{tt("Disconnect")}</button>}
              <button type="button" className={connected ? buttonClass : primaryButtonClass} onClick={signIn} data-own-db-signin="">
                {connected ? tt("Change") : tt("Connect Supabase")}
              </button>
            </div>
          )
        ) : (
          !open && (
            <button type="button" className={buttonClass} onClick={() => setOpen(true)} data-own-db-open="">
              {connected ? tt("Change") : tt("Connect")}
            </button>
          )
        )}
      </Row>

      {/* After signing in: the projects that account can see, one press each. */}
      {projects && (
        <div className="px-4 py-4 md:px-6" data-own-db-projects="">
          <p className="mb-2.5 text-[13.5px] text-white/60">
            {projects.length === 0 ? tt("This Supabase account has no projects yet. Make one at supabase.com, then connect again.") : tt("Pick the project this website uses.")}
          </p>
          <ul className="divide-y divide-white/[0.07] overflow-hidden rounded-xl border border-white/10">
            {projects.map((p) => (
              <li key={p.ref}>
                <button
                  type="button"
                  disabled={picking !== null}
                  onClick={() => void pick(p.ref)}
                  className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-60 [-webkit-tap-highlight-color:transparent]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-medium text-white">{p.name || p.ref}</span>
                    <span className="block truncate text-[12.5px] text-white/45">{`${p.ref}.supabase.co`}{p.region ? ` · ${p.region}` : ""}</span>
                  </span>
                  {picking === p.ref ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/60" /> : <span className="shrink-0 text-[13px] text-white/60">{tt("Use")}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!oauth && open && (
        <div className="space-y-3 px-4 py-4 md:px-6" data-own-db-form="">
          <label className="block">
            <span className="mb-1.5 block text-[13px] text-white/60">{tt("Project URL")}</span>
            <input className={inputClass} inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://abcd.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] text-white/60">{tt("Anon or publishable key")}</span>
            <input
              className={inputClass}
              autoComplete="off"
              spellCheck={false}
              placeholder={connected ? tt("Leave empty to keep the current key") : tt("eyJ… or sb_publishable_…")}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className={primaryButtonClass} onClick={save}>{tt("Save")}</button>
            <button type="button" className={buttonClass} onClick={() => { setOpen(false); setProblem(null); setKey("") }}>{tt("Cancel")}</button>
            {connected && <button type="button" className={buttonClass} onClick={disconnect}>{tt("Disconnect")}</button>}
          </div>
        </div>
      )}
      {problem && <p className="px-4 pb-4 text-[13.5px] leading-snug text-[#f5a3a3] md:px-6" role="alert" data-own-db-problem="">{problem}</p>}
    </Card>
  )
}

/** Supabase's mark, in its own two greens. */
function SupabaseMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 109 113" className={className} aria-hidden="true">
      <path d="M63.7 110.3c-2.9 3.6-8.7 1.6-8.7-3l-1-67.2h45.2c8.2 0 12.8 9.5 7.7 15.9L63.7 110.3Z" fill="#249361" />
      <path d="M45.3 2.1c2.9-3.6 8.7-1.6 8.7 3l.5 67.2H9.8C1.6 72.3-2.9 62.8 2.2 56.4L45.3 2.1Z" fill="#3ECF8E" />
    </svg>
  )
}
