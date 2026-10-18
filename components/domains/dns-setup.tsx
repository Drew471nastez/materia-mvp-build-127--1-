"use client"

/**
 * ===========================================================================
 *  SETTING UP A DOMAIN'S DNS, IN THREE STEPS
 * ===========================================================================
 * One component for both Domains screens: Settings on /app (light) and
 * Website Settings in the builder (dark).
 *
 *   1  Add the records. They are the ones app/api/domains sent for this domain
 *      (app/api/domains keeps them on the row). The provider picker rewrites
 *      the Name column the way that provider wants it typed (Porkbun leaves
 *      @ empty), names its TTL, and links to its DNS page for the domain.
 *   2  Wait.
 *   3  Check. After a check each record says found, not found yet, or that
 *      something else is there and what (app/api/domains/verify `checks`);
 *      the fixes are listed only when that check did not pass.
 *
 * Shaped like Polaris's data table: a quiet header row, hairlines between
 * rows, values in a monospace face, one copy button per value. It switches
 * on the width it is given (a container query), not the screen's, so the
 * same table fits a Settings card and the builder's narrower column. Below
 * that width each record is a short stack, its copy button 44px square.
 *
 * Pure help lives in lib/custom-domains/dns-help.ts, which the check route
 * reads with too, so the status beside a record and the fix under it come
 * from the same answer.
 */
import * as React from "react"
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, Loader2 } from "lucide-react"
import { copyText } from "@/lib/platform/copy-text"
import { apexOf, type DnsRecord } from "@/lib/custom-domains/hostname"
import { REGISTRARS, hostFor, registrarById, type RecordCheck, type RegistrarId } from "@/lib/custom-domains/dns-help"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RegistrarMark } from "@/components/app/settings/registrar-mark"

export type DomainTone = "light" | "dark"

const TONES = {
  light: {
    text: "text-[#1a1a2e]",
    muted: "text-[#6b7280]",
    faint: "text-[#9ca3af]",
    rule: "border-[#f0f1f3]",
    head: "bg-[#f9fafb] text-[#6b7280]",
    box: "border-[#e5e7eb] bg-white",
    step: "bg-[#f3f4f6] text-[#374151]",
    select:
      "border-[#e5e7eb] bg-white text-[#1a1a2e] focus-visible:border-[#1a1a2e]/40 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/10",
    chevron: "%236b7280",
    link: "text-[#1a1a2e] decoration-[#d1d5db] hover:decoration-[#1a1a2e]",
    copy: "text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20",
    copied: "text-[#15803d]",
    button:
      "bg-[#1a1a2e] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(15,23,42,0.18)] hover:bg-[#2a2a40] active:bg-[#111122]",
    found: "text-[#15803d]",
    conflict: "text-[#b45309]",
    fixes: "border-[#fde68a] bg-[#fffbeb] text-[#78350f]",
    ok: "text-[#15803d]",
    bad: "text-[#b45309]",
  },
  dark: {
    text: "text-white",
    muted: "text-white/55",
    faint: "text-white/40",
    rule: "border-white/[0.07]",
    head: "bg-white/[0.03] text-white/50",
    box: "border-white/10 bg-transparent",
    step: "bg-white/[0.08] text-white/80",
    select: "border-white/12 bg-[#171717] text-white focus-visible:border-white/35",
    chevron: "%23ffffff99",
    link: "text-white/80 decoration-white/30 hover:text-white hover:decoration-white/70",
    copy: "text-white/55 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/25",
    copied: "text-emerald-300",
    button:
      "bg-white text-[#0f0f0f] shadow-[inset_0_-1px_0_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.4)] hover:opacity-90",
    found: "text-emerald-300",
    conflict: "text-amber-200",
    fixes: "border-amber-400/25 bg-amber-400/[0.07] text-amber-100",
    ok: "text-emerald-300",
    bad: "text-amber-200",
  },
} as const

/** The columns, said once for the header and every row. */
const COLUMNS = "@xl:grid-cols-[48px_minmax(56px,96px)_minmax(0,1fr)_72px_minmax(112px,150px)]"

const REGISTRAR_KEY = "storelib:domain-registrar"

/** The provider last picked on this device, so a return visit is already in its words. */
function useRegistrar(): [RegistrarId, (id: RegistrarId) => void] {
  const [id, setId] = React.useState<RegistrarId>("godaddy")
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REGISTRAR_KEY)
      if (saved && REGISTRARS.some((r) => r.id === saved)) setId(saved as RegistrarId)
    } catch {
      /* Storage refused: the first provider stands. */
    }
  }, [])
  const choose = React.useCallback((next: RegistrarId) => {
    setId(next)
    try {
      window.localStorage.setItem(REGISTRAR_KEY, next)
    } catch {
      /* Nothing to keep it in. */
    }
  }, [])
  return [id, choose]
}

function CopyButton({ value, label, tone }: { value: string; label: string; tone: DomainTone }) {
  const [copied, setCopied] = React.useState(false)
  const t = TONES[tone]
  return (
    <button
      type="button"
      data-dns-copy=""
      aria-label={copied ? `${label} copied` : `Copy the ${label}`}
      title={copied ? "Copied" : "Copy"}
      onClick={async () => {
        if (await copyText(value)) {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1400)
        }
      }}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg outline-none transition-colors duration-100 @xl:h-8 @xl:w-8 @xl:rounded-md [-webkit-tap-highlight-color:transparent]",
        t.copy,
      )}
    >
      {copied ? <Check className={cn("h-4 w-4", t.copied)} aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
    </button>
  )
}

function Status({ check, tone }: { check: RecordCheck | null; tone: DomainTone }) {
  const t = TONES[tone]
  if (!check) return <span className={cn("text-[13px]", t.faint)}>Not checked</span>
  if (check.state === "found") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", t.found)} data-dns-state="found">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Found
      </span>
    )
  }
  if (check.state === "missing") {
    return (
      <span className={cn("text-[13px]", t.muted)} data-dns-state="missing">
        Not found yet
      </span>
    )
  }
  return (
    <span className={cn("inline-flex min-w-0 flex-col text-[13px]", t.conflict)} data-dns-state="conflict">
      <span className="inline-flex items-center gap-1.5 font-medium">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Other value
      </span>
      {check.seen.length > 0 && <span className="font-mono text-[12px] opacity-90 [overflow-wrap:anywhere]">{check.seen.slice(0, 3).join(", ")}</span>}
    </span>
  )
}

export interface DnsCheckResult {
  tone: "ok" | "wait" | "bad"
  message: string
}

export interface DnsSetupProps {
  /** The domain as stored: maralind.com, or links.maralind.com. */
  domain: string
  /** The records it needs (app/api/domains). */
  records: DnsRecord[]
  /** One per record, from the last check this page made; null before one. */
  checks: RecordCheck[] | null
  /** The domain's status: every record reads as found once DNS has passed. */
  status: string
  checking: boolean
  onCheck: () => void
  checkLabel?: string
  disabled?: boolean
  /** The last check's line, and how it went. */
  result?: DnsCheckResult | null
  /** Plain fixes from that check; shown only when it did not pass. */
  fixes?: string[]
  /** Beside the Check button: when it was last checked, a hide link. */
  aside?: React.ReactNode
  tone: DomainTone
}

export function DnsSetup({ domain, records, checks, status, checking, onCheck, checkLabel = "Check DNS", disabled, result, fixes = [], aside, tone }: DnsSetupProps) {
  const t = TONES[tone]
  const [registrarId, setRegistrarId] = useRegistrar()
  const registrar = registrarById(registrarId)
  const apex = apexOf(domain)
  const passed = status === "ssl_provisioning" || status === "active"
  const checkOf = (r: DnsRecord): RecordCheck | null =>
    passed ? { type: r.type, name: r.name, state: "found", seen: [] } : (checks?.find((c) => c.type === r.type && c.name === r.name) ?? null)
  const showFixes = Boolean(result && result.tone !== "ok" && fixes.length > 0)
  const selectId = React.useId()
  const stepBody = "@xl:pl-[30px]"

  return (
    <div data-dns-setup="" className="@container min-w-0">
      <ol className="space-y-5">
        {/* ── 1. Add the records ─────────────────────────────────────── */}
        <li className="min-w-0">
          <StepHead n={1} tone={tone}>
            Add these records where you bought {apex}
          </StepHead>

          <div className={cn("mt-3 min-w-0", stepBody)}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <label htmlFor={selectId} className={cn("text-[13px]", t.muted)}>
                Bought at
              </label>
              {/* A real list rather than the system's, so each provider shows its own mark beside its name, as in Settings › Domains. */}
              <Select value={registrar.id} onValueChange={(v) => setRegistrarId(v as RegistrarId)}>
                <SelectTrigger
                  id={selectId}
                  data-dns-registrar=""
                  className={cn(
                    "h-11 min-w-0 max-w-full cursor-pointer gap-2 rounded-lg border pl-3 pr-2.5 text-[16px] outline-none transition-colors data-[size=default]:h-11 @xl:h-9 @xl:text-[14px] @xl:data-[size=default]:h-9 sm:min-w-[190px] [&>svg:last-child]:opacity-70",
                    t.select,
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  className={cn(
                    "max-h-[320px] rounded-xl p-1 shadow-[0_12px_32px_-8px_rgba(17,24,39,0.22),0_2px_6px_rgba(17,24,39,0.06)]",
                    tone === "dark" ? "border-white/10 bg-[#1f1f1f] text-white" : "border-[#e5e7eb] bg-white text-[#1a1a2e]",
                  )}
                >
                  {REGISTRARS.map((r) => (
                    <SelectItem
                      key={r.id}
                      value={r.id}
                      data-registrar-option={r.id}
                      className={cn(
                        "h-10 cursor-pointer gap-2.5 rounded-lg pl-2.5 text-[14px] data-[state=checked]:font-medium sm:h-9 sm:text-[13px]",
                        tone === "dark" ? "text-white/85 focus:bg-white/[0.08] focus:text-white" : "text-[#1a1a2e] focus:bg-[#f3f4f6] focus:text-[#1a1a2e]",
                      )}
                    >
                      {/* A dark mark on a dark list sits on a small light tile, so every logo reads in its own colour. */}
                      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", tone === "dark" ? "bg-white" : "bg-[#f8f9fa] shadow-[inset_0_0_0_1px_rgba(16,24,40,0.06)]")}>
                        <RegistrarMark id={r.id} className="size-3.5" />
                      </span>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {registrar.dnsUrl && (
                <a
                  href={registrar.dnsUrl(apex)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-dns-open=""
                  className={cn("inline-flex min-h-11 items-center gap-1 text-[13px] font-medium underline underline-offset-4 @xl:min-h-0", t.link)}
                >
                  Open {registrar.name} DNS
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}
            </div>

            {/* The table: a grid when there is room, a stack per record when there is not. */}
            <div data-dns-table="" role="table" aria-label={`DNS records for ${domain}`} className={cn("mt-3 overflow-hidden rounded-xl border", t.box)}>
              <div role="row" className={cn("hidden gap-3 border-b px-3.5 py-2 text-[12px] font-medium @xl:grid", COLUMNS, t.head, t.rule)}>
                <span role="columnheader">Type</span>
                <span role="columnheader">Name</span>
                <span role="columnheader">Value</span>
                <span role="columnheader">TTL</span>
                <span role="columnheader">Status</span>
              </div>
              {records.map((r) => {
                const host = hostFor(registrar, r)
                const check = checkOf(r)
                return (
                  <div
                    key={`${r.type}-${r.name}-${r.value}`}
                    role="row"
                    data-dns-record={r.type}
                    className={cn("border-b px-3.5 py-2.5 last:border-b-0 @xl:grid @xl:items-center @xl:gap-3 @xl:py-1.5", COLUMNS, t.rule)}
                  >
                    {/* The type, and below the grid width the status beside it. */}
                    <div className="flex min-h-6 items-center justify-between gap-3 @xl:contents">
                      <span role="cell" className={cn("font-mono text-[13px] font-semibold", t.text)}>
                        {r.type}
                      </span>
                      <span className="@xl:hidden">
                        <Status check={check} tone={tone} />
                      </span>
                    </div>
                    <div role="cell" className="mt-1 flex min-w-0 items-center gap-2 @xl:mt-0">
                      <span className={cn("w-12 shrink-0 text-[12px] @xl:hidden", t.muted)}>Name</span>
                      {host ? (
                        <span data-dns-name="" className={cn("min-w-0 font-mono text-[13px] [overflow-wrap:anywhere]", t.text)}>
                          {host}
                        </span>
                      ) : (
                        <span data-dns-name="" className={cn("text-[13px] italic", t.muted)}>
                          Leave empty
                        </span>
                      )}
                    </div>
                    <div role="cell" className="flex min-w-0 items-center gap-2 @xl:gap-1">
                      <span className={cn("w-12 shrink-0 text-[12px] @xl:hidden", t.muted)}>Value</span>
                      <span data-dns-value="" className={cn("min-w-0 flex-1 break-all font-mono text-[13px]", t.text)}>
                        {r.value}
                      </span>
                      <CopyButton value={r.value} label={`${r.type} value`} tone={tone} />
                    </div>
                    <div role="cell" className={cn("flex items-center gap-2 text-[13px]", t.muted)}>
                      <span className="w-12 shrink-0 text-[12px] @xl:hidden">TTL</span>
                      {registrar.ttl}
                    </div>
                    <div role="cell" className="hidden min-w-0 @xl:block">
                      <Status check={check} tone={tone} />
                    </div>
                  </div>
                )
              })}
            </div>
            {registrar.note && (
              <p data-dns-note="" className={cn("mt-2 text-[13px] leading-snug", t.muted)}>
                {registrar.note}
              </p>
            )}
          </div>
        </li>

        {/* ── 2. Wait ───────────────────────────────────────────────── */}
        <li>
          <StepHead n={2} tone={tone}>
            Wait for them to show
          </StepHead>
          <p className={cn("mt-1 pl-[30px] text-[13px] leading-snug", t.muted)}>Usually a few minutes, sometimes up to 48 hours.</p>
        </li>

        {/* ── 3. Check ──────────────────────────────────────────────── */}
        <li>
          <StepHead n={3} tone={tone}>
            Check
          </StepHead>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[30px]">
            <button
              type="button"
              onClick={onCheck}
              disabled={checking || disabled}
              data-dns-check=""
              className={cn(
                "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 @xl:h-9 @xl:rounded-lg @xl:text-[13px]",
                t.button,
              )}
            >
              {checking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {checkLabel}
            </button>
            {aside}
          </div>
          {result?.message && (
            <p aria-live="polite" data-dns-result={result.tone} className={cn("mt-2 pl-[30px] text-[13px] leading-snug", result.tone === "ok" ? t.ok : result.tone === "bad" ? t.bad : t.muted)}>
              {result.message}
            </p>
          )}
          {showFixes && (
            <div data-dns-fixes="" className={cn("ml-[30px] mt-3 rounded-lg border px-3.5 py-3", t.fixes)}>
              <p className="text-[13px] font-semibold">What to fix</p>
              <ul className="mt-1.5 space-y-1.5">
                {fixes.map((line) => (
                  <li key={line} className="text-[13px] leading-snug [overflow-wrap:anywhere]">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      </ol>
    </div>
  )
}

function StepHead({ n, tone, children }: { n: number; tone: DomainTone; children: React.ReactNode }) {
  const t = TONES[tone]
  return (
    <p className={cn("flex items-start gap-2.5 text-[14px] font-semibold", t.text)}>
      <span className={cn("mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold", t.step)} aria-hidden>
        {n}
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </p>
  )
}
