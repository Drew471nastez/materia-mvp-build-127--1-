"use client"

/**
 * ===========================================================================
 *  INVITE A LIST (round 32), Members
 * ===========================================================================
 * Bring people over from a mailing list or another community: paste the
 * addresses (one a line, or with commas), or choose a CSV file, and each
 * gets the email invite the single address form sends. The count of
 * addresses found is shown as they are typed, with the same reading the
 * server sends with (lib/communities/bulk-invites.ts). A tier can be given
 * with the invite (they join on it without paying); without one they join
 * the way anybody does. The answer says how many were sent, and how many
 * were left out because they are members already, were invited this week,
 * or are past the community's 500 a day.
 *
 * A button and its form (the sheet on a phone, the dialog on a computer).
 * Mounted by Members beside its Invite button: <BulkInviteButton head={head} />.
 */
import * as React from "react"
import { Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { BULK_INVITE_MAX, BULK_TEXT_MAX, parseEmailList, type BulkInviteResult } from "@/lib/communities/bulk-invites"
import type { CommunityHead } from "./view-types"
import { FormSheet } from "./form-sheet"
import { Notice, SelectField, buttonSecondary, errorText, field, label, send } from "./parts"

/** Two made up addresses, the shape of what to paste. */
const SAMPLE = "ana@example.com\nbruno@example.com" // i18n-ignore

interface TierOption {
  id: string
  name: string
  archived?: boolean
}

export function BulkInviteButton({ head, className }: { head: CommunityHead; className?: string }) {
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState("")
  const [tierId, setTierId] = React.useState("")
  const [tiers, setTiers] = React.useState<TierOption[] | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<BulkInviteResult | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const list = React.useMemo(() => parseEmailList(text), [text])

  if (!head.can.invite || head.archived) return null

  const start = () => {
    setOpen(true)
    setResult(null)
    setError(null)
    /* The tiers to give, for whoever may read them (the owner and admins); others invite without a tier. */
    if (tiers === null)
      void send<{ tiers: TierOption[] }>(`/api/app/community/${head.id}/tiers`, "GET").then((res) => setTiers(res.ok ? (res.data.tiers ?? []).filter((t) => !t.archived) : []))
  }

  const readFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > BULK_TEXT_MAX * 2) return setError(tt("That file is too big. Split it into lists of {value} addresses.", { value: BULK_INVITE_MAX }))
    setError(null)
    const words = await file.text()
    setText((t) => `${t ? `${t}\n` : ""}${words}`.slice(0, BULK_TEXT_MAX))
  }

  const submit = async () => {
    if (busy) return
    if (!list.emails.length) return setError(tt("No email addresses found. Paste them one per line, or choose a CSV file."))
    setBusy(true)
    setError(null)
    const res = await send<{ found: number; result: BulkInviteResult }>(`/api/app/community/${head.id}/invites/bulk`, "POST", { text, tierId: tierId || null })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    setResult(res.data.result)
    setText("")
  }

  const close = () => {
    setOpen(false)
    if (result) setResult(null)
  }

  const tierOptions = [{ value: "", label: tt("No tier, they join as anyone does") }, ...(tiers ?? []).map((t) => ({ value: t.id, label: tt("{value}, without paying", { value: t.name }) }))]

  return (
    <>
      <button type="button" onClick={start} className={cn(buttonSecondary, className)} data-bulk-invite="">
        {tt("Invite a list")}
      </button>
      <FormSheet
        open={open}
        onClose={close}
        title={tt("Invite a list")}
        name="bulk-invite"
        focus
        cancelLabel={result ? tt("Done") : undefined}
        action={result ? null : { label: list.emails.length ? tt("{n, plural, one {Send # invite} other {Send # invites}}", { n: list.emails.length }) : tt("Send invites"), busyLabel: tt("Sending"), busy, onClick: () => void submit(), data: { "data-bulk-invite-send": "" } }}
      >
        {result ? (
          <div className="space-y-2" data-bulk-invite-result="">
            <p className="text-[15px] font-medium text-[#1a1a2e]">{tt("{n, plural, one {# invite sent} other {# invites sent}}", { n: result.sent })}</p>
            <ul className="space-y-1 text-[13.5px] text-[#4b5563]">
              {result.members ? <li>{tt("{n, plural, one {# is a member already} other {# are members already}}", { n: result.members })}</li> : null}
              {result.recent ? <li>{tt("{n, plural, one {# was invited this week, so not again} other {# were invited this week, so not again}}", { n: result.recent })}</li> : null}
              {result.limited ? <li>{tt("{n, plural, one {# is left for tomorrow: a community sends up to 500 a day} other {# are left for tomorrow: a community sends up to 500 a day}}", { n: result.limited })}</li> : null}
              {result.failed ? <li className="text-[#b42318]">{tt("{n, plural, one {# could not be sent. Try it again.} other {# could not be sent. Try them again.}}", { n: result.failed })}</li> : null}
            </ul>
            <p className="pt-1 text-[12.5px] text-[#6b7280]">{tt("Each invite works once and lasts 30 days. You can see and revoke them under Invites.")}</p>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div>
              <label htmlFor="bulk-invite-text" className={label}>
                {tt("Email addresses")}
              </label>
              <textarea
                id="bulk-invite-text"
                data-autofocus=""
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, BULK_TEXT_MAX))}
                rows={7}
                placeholder={SAMPLE}
                className={cn(field, "resize-y py-2.5 font-mono text-[14px] leading-relaxed sm:text-[13px]")}
              />
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12.5px] tabular-nums text-[#6b7280]" data-bulk-invite-count={list.emails.length}>
                  {list.emails.length ? tt("{n, plural, one {# address} other {# addresses}}", { n: list.emails.length }) : tt("One per line, or separated by commas.")}
                  {list.over ? ` ${tt("{value} more than the {max} a list takes are left out.", { value: list.over, max: BULK_INVITE_MAX })}` : ""}
                </p>
                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1.5 text-[13px] font-medium text-[#4b5563] outline-none hover:text-[#1a1a2e] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.25)]">
                  <Upload aria-hidden className="h-4 w-4" />
                  {tt("Choose a CSV file")}
                </button>
                <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = "" }} />
              </div>
            </div>
            {tiers && tiers.length ? (
              <div>
                <span className={label}>{tt("Tier")}</span>
                <SelectField name="bulk-invite-tier" title={tt("Tier")} value={tierId} options={tierOptions} onChange={setTierId} />
              </div>
            ) : null}
            <p className="text-[12.5px] leading-snug text-[#6b7280]">{tt("Each address gets an email from Storelib with a link that works once, for 30 days. Members and anyone invited this week are skipped.")}</p>
            {error ? <Notice>{error}</Notice> : null}
          </div>
        )}
      </FormSheet>
    </>
  )
}
