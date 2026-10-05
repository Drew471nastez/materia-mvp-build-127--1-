"use client"

import { useState } from "react"

import { OWN_DB_KEY, OWN_DB_URL, checkDatabaseUrl, checkPublicKey, ownDatabase } from "@/lib/website-builder/own-database"
import { Card, GOES_LIVE, Row, buttonClass, inputClass, primaryButtonClass } from "./parts"
import type { SettingsContext } from "./types"

/**
 * ===========================================================================
 *  YOUR OWN SUPABASE, FOR SECTIONS THAT ASK FOR IT
 * ===========================================================================
 * Advanced and quiet on purpose: one row under Code that says whether a
 * project is connected, and opens two fields when asked. The rules live in
 * lib/website-builder/own-database.ts; this only collects the two values and
 * refuses, before anything is saved, a key that must never be on a website.
 */
export function OwnDatabaseSettings({ ctx }: { ctx: SettingsContext }) {
  const settings = ctx.settings as Record<string, unknown>
  const connected = ownDatabase(settings)
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(typeof settings[OWN_DB_URL] === "string" ? (settings[OWN_DB_URL] as string) : "")
  const [key, setKey] = useState("")
  const [problem, setProblem] = useState<string | null>(null)

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

  return (
    <Card title="Your own database" footer={open ? GOES_LIVE : undefined}>
      <Row
        label="Supabase"
        hint={
          connected
            ? <>Connected to <span className="text-white/70">{new URL(connected.url).hostname}</span>. Sections that declare the database capability can use it.</>
            : <>For sections you write that read or save your own data. Only the public key goes here; your project&rsquo;s security rules decide what it can reach.</>
        }
        inline
      >
        {!open && (
          <button type="button" className={buttonClass} onClick={() => setOpen(true)} data-own-db-open="">
            {connected ? "Change" : "Connect"}
          </button>
        )}
      </Row>
      {open && (
        <div className="space-y-3 px-4 py-4 md:px-6" data-own-db-form="">
          <label className="block">
            <span className="mb-1.5 block text-[13px] text-white/60">Project URL</span>
            <input className={inputClass} inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://abcd.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] text-white/60">Anon or publishable key</span>
            <input
              className={inputClass}
              autoComplete="off"
              spellCheck={false}
              placeholder={connected ? "Leave empty to keep the current key" : "eyJ… or sb_publishable_…"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          {problem && <p className="text-[13.5px] leading-snug text-[#f5a3a3]" role="alert" data-own-db-problem="">{problem}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className={primaryButtonClass} onClick={save}>Save</button>
            <button type="button" className={buttonClass} onClick={() => { setOpen(false); setProblem(null); setKey("") }}>Cancel</button>
            {connected && <button type="button" className={buttonClass} onClick={disconnect}>Disconnect</button>}
          </div>
        </div>
      )}
    </Card>
  )
}
