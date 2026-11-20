"use client"

/**
 * ===========================================================================
 *  SETTINGS › INTEGRATIONS › DISCORD AND TELEGRAM: THE SETUP CARD
 * ===========================================================================
 * Where a store connects its Discord server or Telegram chats, says which
 * product opens which role or chat, and sees each buyer's access as it is
 * (lib/community-roles/setup). Everything is read from
 * /api/community-roles/setup and changed through it; the Discord install
 * goes through /api/community-roles/discord/connect and comes back here with
 * ?discord=connected (or a word on what went wrong).
 *
 * Without Storelib's Discord or Telegram keys the card says Not available
 * yet and offers nothing to press.
 */
import * as React from "react"
import { Copy, RefreshCw } from "lucide-react"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Notice, SelectInput, api, dateTime } from "@/components/physical/ui"
import { copyText } from "@/lib/platform/copy-text"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import type { DiscordSetupView, GrantStatus, MemberAccessRow, PickProduct, TelegramSetupView } from "@/lib/community-roles/view-types"

type Provider = "discord" | "telegram"
const SECTION = "border-t border-[#f1f2f4] pt-5"
const LABEL = "text-[14px] font-semibold text-[#1a1a2e]"
const MUTED = "text-[13px] leading-[19px] text-[#6b7280]"

function statusWords(provider: Provider, s: GrantStatus, want: "in" | "out"): { text: string; tone: "good" | "wait" | "bad" | "quiet" } {
  if (want === "out" && (s === "pending" || s === "failed" || s === "blocked")) return s === "pending" ? { text: tt("Being removed"), tone: "wait" } : { text: tt("Not removed yet"), tone: "bad" }
  switch (s) {
    case "granted":
      return { text: provider === "discord" ? tt("Has the role") : tt("In the chat"), tone: "good" }
    case "needs_link":
      return { text: tt("Not joined yet"), tone: "quiet" }
    case "invited":
      return { text: tt("Invite sent"), tone: "wait" }
    case "pending":
      return { text: tt("Adding"), tone: "wait" }
    case "revoked":
      return { text: tt("Removed"), tone: "quiet" }
    case "blocked":
      return { text: tt("Needs you"), tone: "bad" }
    case "failed":
      return { text: tt("Not done"), tone: "bad" }
  }
}

const TONE = { good: "text-[#067647]", wait: "text-[#92400e]", bad: "text-[#b42318]", quiet: "text-[#6b7280]" }

function productLabel(p: PickProduct): string {
  return p.type === "membership" ? tt("{title} (membership)", { title: p.title }) : p.type === "community" ? tt("{title} (community)", { title: p.title }) : p.title
}

/** What came back from Discord's screen, read once from the address and taken off it. */
function useReturnWord(provider: Provider): { word: string; message: string | null } | null {
  const [got, setGot] = React.useState<{ word: string; message: string | null } | null>(null)
  React.useEffect(() => {
    try {
      const url = new URL(window.location.href)
      const word = url.searchParams.get(provider)
      if (!word) return
      setGot({ word, message: url.searchParams.get(`${provider}_message`) })
      url.searchParams.delete(provider)
      url.searchParams.delete(`${provider}_message`)
      window.history.replaceState(window.history.state, "", url.toString())
    } catch {
      /* nothing to read */
    }
  }, [provider])
  return got
}

export function CommunityAccessPanel({ provider, onChanged }: { provider: Provider; onChanged?: (connected: boolean) => void }) {
  const [discord, setDiscord] = React.useState<DiscordSetupView | null>(null)
  const [telegram, setTelegram] = React.useState<TelegramSetupView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const back = useReturnWord(provider)

  const take = React.useCallback(
    (d: { discord?: DiscordSetupView; telegram?: TelegramSetupView }) => {
      if (d.discord) {
        setDiscord(d.discord)
        onChanged?.(!!d.discord.connection)
      }
      if (d.telegram) {
        setTelegram(d.telegram)
        onChanged?.(d.telegram.chats.length > 0)
      }
    },
    [onChanged],
  )

  const load = React.useCallback(async () => {
    const r = await api<{ discord?: DiscordSetupView; telegram?: TelegramSetupView }>(`/api/community-roles/setup?provider=${provider}`, { method: "GET" })
    if (!r.ok) return setError("error" in r ? r.error : "")
    setError(null)
    take(r.data)
  }, [provider, take])

  React.useEffect(() => {
    void load()
  }, [load])

  const act = async (key: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    setBusy(key)
    setError(null)
    const r = await api<{ discord?: DiscordSetupView; telegram?: TelegramSetupView } & Record<string, unknown>>("/api/community-roles/setup", { method: "POST", body: { provider, ...body } })
    setBusy(null)
    if (!r.ok) {
      setError("error" in r ? r.error : "")
      return null
    }
    take(r.data)
    return r.data
  }

  const view = provider === "discord" ? discord : telegram
  if (!view) return error ? <Notice>{error}</Notice> : <div className="h-24 animate-pulse rounded-xl bg-[#f3f4f6]" aria-label={tt("Loading")} />

  if (!view.available)
    return (
      <div className="flex items-start gap-3" data-community-access={provider} data-state="not-available">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#d1d5db]" />
        <div className="min-w-0">
          <p className={LABEL}>{tt("Not available yet")}</p>
          <p className={cn("mt-0.5", MUTED)}>{provider === "discord" ? tt("Storelib's Discord bot is not switched on yet. This page lets you connect it as soon as it is.") : tt("Storelib's Telegram bot is not switched on yet. This page lets you link a chat as soon as it is.")}</p>
        </div>
      </div>
    )
  if (!view.ready) return <Notice tone="amber">{provider === "discord" ? tt("Discord needs the database update first (SQL part 473 in Admin › SQL updates).") : tt("Telegram needs the database update first (SQL part 474 in Admin › SQL updates).")}</Notice>

  return (
    <div className="space-y-5" data-community-access={provider}>
      {back ? <ReturnNotice provider={provider} word={back.word} message={back.message} /> : null}
      {provider === "discord" ? <DiscordSetup view={view as DiscordSetupView} busy={busy} act={act} /> : <TelegramSetup view={view as TelegramSetupView} busy={busy} act={act} reload={load} />}
      {error ? <Notice>{error}</Notice> : null}
      <MembersList provider={provider} rows={view.members} busy={busy} act={act} />
    </div>
  )
}

function ReturnNotice({ provider, word, message }: { provider: Provider; word: string; message: string | null }) {
  if (provider !== "discord") return null
  if (word === "connected") return <Notice tone="green">{tt("Your Discord server is connected. Choose which product gives which role below.")}</Notice>
  if (word === "declined") return <Notice tone="gray">{tt("Nothing was added. Connect again when you are ready.")}</Notice>
  if (word === "expired") return <Notice tone="amber">{tt("That took too long or started in another window. Press Connect Discord server again.")}</Notice>
  if (word === "not_available") return null
  return <Notice>{message || tt("Discord could not be connected. Try again.")}</Notice>
}

type Act = (key: string, body: Record<string, unknown>) => Promise<Record<string, unknown> | null>

/* ── Discord ─────────────────────────────────────────────────────────────── */

function DiscordSetup({ view, busy, act }: { view: DiscordSetupView; busy: string | null; act: Act }) {
  const [productId, setProductId] = React.useState("")
  const [roleId, setRoleId] = React.useState("")
  const conn = view.connection
  if (!conn)
    return (
      <div className="space-y-3" data-discord-connect="">
        <p className={MUTED}>{tt("Add Storelib's bot to your server. Buyers then press Join the Discord on their receipt or in their library, and get the role you choose. It is taken back when their access ends.")}</p>
        <a href="/api/community-roles/discord/connect" className={cn(BTN_PRIMARY, "inline-flex items-center")}>
          {tt("Connect Discord server")}
        </a>
      </div>
    )
  const usable = (view.roles ?? []).filter((r) => !r.problem)
  return (
    <>
      <div className="flex items-start gap-3" data-discord-connected="">
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", conn.status === "connected" && !conn.lastError ? "bg-[#16a34a]" : "bg-[#f59e0b]")} />
        <div className="min-w-0 flex-1">
          <p className={LABEL}>{tt("Connected to {name}", { name: conn.guildName })}</p>
          {conn.lastError ? <p className="mt-1 text-[13px] leading-[19px] text-[#92400e]" data-discord-problem="">{conn.lastError}</p> : <p className={cn("mt-0.5", MUTED)}>{tt("Storelib's bot gives and takes back roles as buyers pay, cancel or are refunded.")}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/api/community-roles/discord/connect" className={cn(BTN_SECONDARY, "inline-flex items-center")}>
              {tt("Add the bot again")}
            </a>
            <button type="button" className={BTN_DANGER} disabled={!!busy} onClick={() => void act("disconnect", { action: "disconnect" })}>
              {tt("Disconnect")}
            </button>
          </div>
        </div>
      </div>

      <div className={cn(SECTION, "space-y-3")}>
        <p className={LABEL}>{tt("Roles")}</p>
        {view.mappings.length ? (
          <ul className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]" data-discord-mappings="">
            {view.mappings.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] text-[#1a1a2e]">
                    {m.productTitle} <span className="text-[#9ca3af]">→</span> <span className="font-medium">@{m.roleName}</span>
                  </p>
                  {m.problem ? <p className="mt-1 text-[12.5px] leading-[18px] text-[#92400e]">{m.problem}</p> : null}
                </div>
                <button type="button" className="h-9 shrink-0 px-2 text-[13px] font-medium text-[#6b7280] hover:text-[#b42318]" disabled={!!busy} onClick={() => void act(`unmap:${m.id}`, { action: "unmap", id: m.id })}>
                  {tt("Remove")}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={MUTED}>{tt("No product gives a role yet.")}</p>
        )}
        {view.roles === null ? (
          <Notice tone="amber">{tt("Discord did not answer, so your server's roles could not be read. Try again in a moment.")}</Notice>
        ) : (
          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              void act("map", { action: "map", productId, roleId }).then((d) => {
                if (d) {
                  setProductId("")
                  setRoleId("")
                }
              })
            }}
          >
            <SelectInput aria-label={tt("Product")} value={productId} onChange={setProductId}>
              <option value="">{tt("Product, membership or tier")}</option>
              {view.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {productLabel(p)}
                </option>
              ))}
            </SelectInput>
            <SelectInput aria-label={tt("Role")} value={roleId} onChange={setRoleId}>
              <option value="">{tt("Role")}</option>
              {(view.roles ?? []).map((r) => (
                <option key={r.id} value={r.id} disabled={!!r.problem}>
                  {r.problem ? tt("@{name} (above Storelib's role)", { name: r.name }) : `@${r.name}`}
                </option>
              ))}
            </SelectInput>
            <button type="submit" className={BTN_PRIMARY} disabled={!productId || !roleId || !!busy}>
              {busy === "map" ? tt("Checking the role…") : tt("Add")}
            </button>
          </form>
        )}
        {view.roles && view.roles.length > 0 && usable.length < view.roles.length ? (
          <p className={MUTED}>{tt("Roles above Storelib's own role cannot be given by the bot. In Discord, open Server Settings › Roles and drag the Storelib role above the roles you want to give.")}</p>
        ) : null}
      </div>
    </>
  )
}

/* ── Telegram ────────────────────────────────────────────────────────────── */

function TelegramSetup({ view, busy, act, reload }: { view: TelegramSetupView; busy: string | null; act: Act; reload: () => Promise<void> }) {
  const [code, setCode] = React.useState<{ code: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [productId, setProductId] = React.useState("")
  const [chatRef, setChatRef] = React.useState("")
  const bot = view.botUsername ? `@${view.botUsername}` : tt("Storelib's bot")
  const command = code ? `/link ${code.code}` : ""
  return (
    <>
      <div className="space-y-3">
        {view.chats.length ? (
          <ul className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]" data-telegram-chats="">
            {view.chats.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 px-3.5 py-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", c.status === "linked" ? "bg-[#16a34a]" : "bg-[#f59e0b]")} />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-[#1a1a2e]">{c.title}</p>
                    <p className="text-[12.5px] text-[#6b7280]">{c.type === "channel" ? tt("Channel") : tt("Group")}</p>
                    {c.lastError ? <p className="mt-1 text-[12.5px] leading-[18px] text-[#92400e]">{c.lastError}</p> : null}
                  </div>
                </div>
                <button type="button" className="h-9 shrink-0 px-2 text-[13px] font-medium text-[#6b7280] hover:text-[#b42318]" disabled={!!busy} onClick={() => void act(`chat:${c.id}`, { action: "remove_chat", id: c.id })}>
                  {tt("Unlink")}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={MUTED}>{tt("Link a private group or channel. Buyers then press Join the Telegram group and get an invite only they can use. They are removed when their access ends.")}</p>
        )}
        {code ? (
          <ol className="space-y-3 rounded-xl border border-[#eceef1] px-3.5 py-3 text-[13.5px] leading-5 text-[#1a1a2e]" data-telegram-steps="">
            <li>{tt("1. Add {bot} to the group or channel as an admin, with Invite users via link and Ban users.", { bot })}</li>
            <li className="space-y-2">
              <span className="block">{tt("2. Send this message there:")}</span>
              <span className="flex gap-2">
                <input readOnly value={command} aria-label={tt("Link message")} className="h-10 min-w-0 flex-1 rounded-lg border border-[#e5e7eb] bg-[#f8f9fa] px-3 font-mono text-[13px] text-[#1a1a2e]" onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className={cn(BTN_SECONDARY, "shrink-0 px-3")} onClick={async () => setCopied(await copyText(command))}>
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {copied ? tt("Copied") : tt("Copy")}
                </button>
              </span>
              <span className="block text-[12.5px] text-[#6b7280]">{tt("Works once, until {time}.", { time: dateTime(code.expiresAt) })}</span>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <span>{tt("3. Then check here.")}</span>
              <button type="button" className={BTN_SECONDARY} disabled={!!busy} onClick={() => void reload()}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                {tt("Check")}
              </button>
            </li>
          </ol>
        ) : (
          <button
            type="button"
            className={view.chats.length ? BTN_SECONDARY : BTN_PRIMARY}
            disabled={!!busy}
            onClick={() =>
              void act("code", { action: "link_code" }).then((d) => {
                if (d && typeof d.code === "string" && typeof d.expiresAt === "string") setCode({ code: d.code, expiresAt: d.expiresAt })
              })
            }
          >
            {view.chats.length ? tt("Link another chat") : tt("Link a group or channel")}
          </button>
        )}
      </div>

      {view.chats.length ? (
        <div className={cn(SECTION, "space-y-3")}>
          <p className={LABEL}>{tt("Who gets in")}</p>
          {view.mappings.length ? (
            <ul className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]" data-telegram-mappings="">
              {view.mappings.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                  <p className="min-w-0 truncate text-[13.5px] text-[#1a1a2e]">
                    {m.productTitle} <span className="text-[#9ca3af]">→</span> <span className="font-medium">{m.chatTitle}</span>
                  </p>
                  <button type="button" className="h-9 shrink-0 px-2 text-[13px] font-medium text-[#6b7280] hover:text-[#b42318]" disabled={!!busy} onClick={() => void act(`unmap:${m.id}`, { action: "unmap", id: m.id })}>
                    {tt("Remove")}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={MUTED}>{tt("No product opens a chat yet.")}</p>
          )}
          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              void act("map", { action: "map", productId, chatRef }).then((d) => {
                if (d) {
                  setProductId("")
                  setChatRef("")
                }
              })
            }}
          >
            <SelectInput aria-label={tt("Product")} value={productId} onChange={setProductId}>
              <option value="">{tt("Product, membership or tier")}</option>
              {view.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {productLabel(p)}
                </option>
              ))}
            </SelectInput>
            <SelectInput aria-label={tt("Chat")} value={chatRef} onChange={setChatRef}>
              <option value="">{tt("Chat")}</option>
              {view.chats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </SelectInput>
            <button type="submit" className={BTN_PRIMARY} disabled={!productId || !chatRef || !!busy}>
              {tt("Add")}
            </button>
          </form>
        </div>
      ) : null}
    </>
  )
}

/* ── Members ─────────────────────────────────────────────────────────────── */

function MembersList({ provider, rows, busy, act }: { provider: Provider; rows: MemberAccessRow[]; busy: string | null; act: Act }) {
  if (!rows.length) return null
  return (
    <div className={cn(SECTION, "space-y-3")}>
      <p className={LABEL}>{tt("Members")}</p>
      <ul className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]" data-community-members="">
        {rows.map((r) => {
          const s = statusWords(provider, r.status, r.want)
          const retry = r.status === "blocked" || r.status === "failed" || (provider === "discord" && r.status === "pending")
          return (
            <li key={r.grantId} className="px-3.5 py-3" data-grant-status={r.status}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-[#1a1a2e]">
                    {r.buyer}
                    {r.handle ? <span className="font-normal text-[#6b7280]"> · {r.handle}</span> : null}
                  </p>
                  <p className="truncate text-[12.5px] text-[#6b7280]">
                    {r.productTitle} · {provider === "discord" ? `@${r.target}` : r.target}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn("text-[12.5px] font-medium", TONE[s.tone])}>{s.text}</p>
                  <p className="text-[12px] text-[#9ca3af]">{dateTime(r.updatedAt)}</p>
                </div>
              </div>
              {r.lastError ? <p className="mt-1.5 text-[12.5px] leading-[18px] text-[#92400e]">{r.lastError}</p> : null}
              {retry && (r.want === "out" || provider === "discord") ? (
                <button type="button" className={cn(BTN_SECONDARY, "mt-2 h-9")} disabled={!!busy} onClick={() => void act(`retry:${r.grantId}`, { action: "retry", grantId: r.grantId })}>
                  {busy === `retry:${r.grantId}` ? tt("Trying…") : tt("Try again")}
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
