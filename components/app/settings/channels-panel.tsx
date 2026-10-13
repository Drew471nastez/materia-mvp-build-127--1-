"use client"

/**
 * ===========================================================================
 *  SETTINGS › SALES CHANNELS
 * ===========================================================================
 * Where the store's products are listed (lib/store/channels.ts,
 * /api/store/channels). Storelib's three channels come first and can't be
 * renamed or removed: the Online store, the Creator page and Explore. A
 * store's own channels follow, each a name, a note and an on or off.
 *
 * New products: every channel, or one channel alone. Which products are on
 * which channel is set on each product, in its editor's Sales channels card.
 */
import * as React from "react"
import { Globe, Plus, Compass, UserRound, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Card, Field, Modal, Notice, SelectInput, TextInput, Toggle, api, peekGet } from "@/components/physical/ui"
import { MAX_CHANNELS, channelKey, type Channel } from "@/lib/store/channels"
import { tt } from "@/lib/i18n/text"

type Setup = { channels: Channel[]; defaultKey: string | null; ready: boolean }

const ICON: Record<string, React.ComponentType<{ className?: string }>> = { storefront: Globe, creator_page: UserRound, marketplace: Compass, custom: Tag }

export function ChannelsPanel() {
  const [setup, setSetup] = React.useState<Setup | null>(() => peekGet<Setup>("/api/store/channels"))
  const [error, setError] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<Channel | "new" | null>(null)

  React.useEffect(() => {
    void api<Setup>("/api/store/channels").then((r) => (r.ok ? setSetup(r.data) : setError(r.error)))
  }, [])

  const send = async (method: string, body: Record<string, unknown>): Promise<string | null> => {
    const r = await api<Setup>("/api/store/channels", { method, body })
    if (!r.ok) return r.error
    setSetup(r.data)
    return null
  }

  if (error && !setup) return <Notice>{error}</Notice>
  if (!setup) return <div className="min-h-[320px]" aria-busy="true" />
  const enabled = setup.channels.filter((c) => c.enabled)

  return (
    <div className="space-y-4 sm:space-y-6" data-channels="">
      {!setup.ready ? <Notice tone="amber">{tt("Sales channels need their database update (SQL parts 109 and 111). Until they run, every product is on every channel.")}</Notice> : null}

      <Card
        title={tt("Sales channels")}
        description={tt("Where your products are listed. Take a product off a channel from its own page; its link keeps working.")}
        help="channels"
        action={
          <button type="button" className={cn(BTN_SECONDARY, "gap-1.5")} onClick={() => setEditing("new")} disabled={!setup.ready || setup.channels.length >= MAX_CHANNELS} data-create-channel="">
            <Plus className="h-4 w-4" aria-hidden />
            {tt("Create channel")}
          </button>
        }
      >
        <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]" data-channel-list="">
          {setup.channels.map((c) => {
            const Icon = ICON[c.kind] ?? Tag
            const own = c.kind === "custom"
            const row = (
              <>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f3f4f6] text-[#4b5563]">
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-[#1a1a2e]">{c.name}</span>
                    {!own ? <span className="shrink-0 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11.5px] font-medium text-[#4b5563]">{tt("Built in")}</span> : null}
                    {!c.enabled ? <span className="shrink-0 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11.5px] font-medium text-[#9ca3af]">{tt("Off")}</span> : null}
                  </span>
                  {c.description ? <span className="mt-0.5 block truncate text-[12.5px] text-[#6b7280]">{c.description}</span> : null}
                </span>
                <span className="shrink-0 text-[12.5px] tabular-nums text-[#6b7280]">{c.off ? tt("{off} off", { off: c.off }) : tt("All products")}</span>
              </>
            )
            return (
              <li key={channelKey(c)} data-channel={c.kind}>
                {own ? (
                  <button type="button" onClick={() => setEditing(c)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[#fafafa]">
                    {row}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-3.5 py-3">{row}</div>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      <Card title={tt("New products")} description={tt("The channels a product starts on when you make it. You can change it on the product.")}>
        <Field label={tt("List new products on")} htmlFor="channel-default">
          <SelectInput
            id="channel-default"
            value={setup.defaultKey ?? ""}
            disabled={!setup.ready}
            onChange={(v) => {
              const before = setup.defaultKey
              setSetup((s) => (s ? { ...s, defaultKey: v || null } : s))
              void send("PATCH", { defaultKey: v || null }).then((e) => {
                if (e) {
                  setError(e)
                  setSetup((s) => (s ? { ...s, defaultKey: before } : s))
                } else setError(null)
              })
            }}
          >
            <option value="">{tt("Every channel")}</option>
            {enabled.map((c) => (
              <option key={channelKey(c)} value={channelKey(c)}>
                {tt("{name} only", { name: c.name })}
              </option>
            ))}
          </SelectInput>
        </Field>
        {error ? <Notice className="mt-3">{error}</Notice> : null}
      </Card>

      <ChannelForm channel={editing} onClose={() => setEditing(null)} send={send} />
    </div>
  )
}

function ChannelForm({ channel, onClose, send }: { channel: Channel | "new" | null; onClose: () => void; send: (method: string, body: Record<string, unknown>) => Promise<string | null> }) {
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [enabled, setEnabled] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const isNew = channel === "new"

  React.useEffect(() => {
    if (!channel) return
    setName(channel === "new" ? "" : channel.name)
    setDescription(channel === "new" ? "" : (channel.description ?? ""))
    setEnabled(channel === "new" ? true : channel.enabled)
    setError(null)
    setBusy(false)
  }, [channel])

  const run = async (method: string, body: Record<string, unknown>) => {
    setBusy(true)
    const e = await send(method, body)
    setBusy(false)
    if (e) setError(e)
    else onClose()
  }
  const id = channel && channel !== "new" ? channel.id : null

  return (
    <Modal
      open={!!channel}
      onClose={onClose}
      title={isNew ? tt("Create channel") : tt("Edit channel")}
      footer={
        <div className="flex w-full items-center gap-2">
          {!isNew && id ? (
            <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void run("DELETE", { id })}>
              {tt("Remove")}
            </button>
          ) : null}
          <div className="ml-auto flex gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={busy}>
              {tt("Cancel")}
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={busy || !name.trim()} onClick={() => void run(isNew ? "POST" : "PUT", { id, name: name.trim(), description: description.trim() || null, enabled })}>
              {busy ? tt("Saving") : isNew ? tt("Create channel") : tt("Save")}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3" data-channel-form="">
        <Field label={tt("Name")} htmlFor="channel-name">
          <TextInput id="channel-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={tt("Saturday market")} />
        </Field>
        <Field label={tt("Description")} htmlFor="channel-description" hint={tt("Optional. What it's for, for you and your team.")}>
          <TextInput id="channel-description" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Toggle label={tt("On")} description={tt("Off, it stays on your list and on your products, and isn't offered for new ones.")} checked={enabled} onChange={setEnabled} />
        <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("A channel of your own is for keeping track: Storelib doesn't show anything there.")}</p>
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}
