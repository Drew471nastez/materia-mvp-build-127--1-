"use client"

/**
 * ===========================================================================
 *  SETTING UP DNS, IN THREE STEPS
 * ===========================================================================
 * One component for both Domains screens: Settings on /app (light) and
 * Website Settings in the builder (dark). The records, the registrar
 * spellings and what a check found all come from lib/custom-domain/dns.ts,
 * which is also what the check route reads with, so the table and the
 * check cannot disagree.
 *
 *   1  Add the records. The registrar picker rewrites the Name column the
 *      way that registrar wants it typed (Porkbun leaves @ blank) and links
 *      straight to its DNS page for this domain.
 *   2  Wait.
 *   3  Check. Each record then says found, not found yet, or that something
 *      else is there and what; the fixes are listed only after a check that
 *      did not pass.
 *
 * Shaped like Polaris's data table: a quiet header row, hairlines between
 * rows, values in a monospace face, and one copy button per value. On a
 * phone each record becomes a short stack with the copy buttons at a
 * thumb's size (44px), so nothing scrolls sideways.
 */
import * as React from "react"
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, Loader2 } from "lucide-react"
import { copyText } from "@/lib/platform/copy-text"
import { cn } from "@/lib/utils"
import {
  REGISTRARS,
  hostFor,
  recordsFor,
  registrarById,
  troubleFor,
  type DnsChecks,
  type DnsRecord,
  type RecordCheck,
  type RegistrarId,
} from "@/lib/custom-domain/dns"

export type DomainTone = "light" | "dark"

const TONES = {
  light: {
    text: "text-[#1a1a2e]",
    muted: "text-[#6b7280]",
    faint: "text-[#9ca3af]",
    rule: "border-[#eceef1]",
    head: "bg-[#f9fafb] text-[#6b7280]",
    box: "rounded-xl border border-[#e5e7eb]",
    step: "bg-[#f3f4f6] text-[#374151]",
    select:
      "h-11 sm:h-9 rounded-lg border border-[#d1d5db] bg-white pl-3 pr-8 text-[16px] sm:text-[14px] text-[#1a1a2e] outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/30 focus-visible:border-[#8b5cf6]",
    link: "text-[#1a1a2e] underline underline-offset-4 decoration-[#d1d5db] hover:decoration-[#1a1a2e]",
    copy: "text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#1a1a2e]",
    copied: "text-[#15803d]",
    button:
      "bg-[#8b5cf6] text-white hover:bg-[#7c3aed] active:bg-[#6d28d9] disabled:opacity-50",
    found: "text-[#15803d]",
    missing: "text-[#6b7280]",
    conflict: "text-[#b45309]",
    trouble: "border-[#fcd34d]/70 bg-[#fffbeb] text-[#78350f]",
    note: "text-[#6b7280]",
  },
  dark: {
    text: "text-white",
    muted: "text-white/60",
    faint: "text-white/40",
    rule: "border-white/[0.07]",
    head: "bg-white/[0.03] text-white/50",
    box: "rounded-xl border border-white/10",
    step: "bg-white/[0.08] text-white/80",
    select:
      "h-11 md:h-9 rounded-lg border border-white/12 bg-[#171717] pl-3 pr-8 text-[16px] md:text-[14px] text-white outline-none focus:border-white/35",
    link: "text-white/80 underline underline-offset-4 decoration-white/30 hover:text-white",
    copy: "text-white/55 hover:bg-white/10 hover:text-white",
    copied: "text-emerald-300",
    button:
      "bg-white text-[#0f0f0f] hover:opacity-90 disabled:opacity-50",
    found: "text-emerald-300",
    missing: "text-white/50",
    conflict: "text-amber-200",
    trouble: "border-amber-400/25 bg-amber-400/[0.07] text-amber-100",
    note: "text-white/50",
  },
} as const

const REGISTRAR_KEY = "storelib:domain-registrar"

/** The provider last picked on this device, so a return visit is already in their words. */
function useRegistrar(): [RegistrarId, (id: RegistrarId) => void] {
  const [id, setId] = React.useState<RegistrarId>("godaddy")
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REGISTRAR_KEY)
      if (saved && REGISTRARS.some((r) => r.id === saved)) setId(saved as RegistrarId)
    } catch {
      /* Storage refused: the default stands. */
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
        "inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors sm:h-8 sm:w-8 sm:rounded-md [-webkit-tap-highlight-color:transparent]",
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
      <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", t.found)}>
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Found
      </span>
    )
  }
  if (check.state === "missing") return <span className={cn("text-[13px]", t.missing)}>Not found yet</span>
  return (
    <span className={cn("inline-flex min-w-0 flex-col text-[13px]", t.conflict)}>
      <span className="inline-flex items-center gap-1.5 font-medium">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Conflicting record
      </span>
      {check.seen.length > 0 && <span className="font-mono text-[12px] opacity-90 [overflow-wrap:anywhere]">{check.seen.slice(0, 3).join(", ")}</span>}
    </span>
  )
}

/** The name as typed at the registrar, or a note when it is left blank. */
function NameCell({ record, host, tone }: { record: DnsRecord; host: string; tone: DomainTone }) {
  const t = TONES[tone]
  return host ? (
    <span className={cn("font-mono text-[13px]", t.text)}>{host}</span>
  ) : (
    <span className={cn("text-[13px] italic", t.muted)}>Leave empty</span>
  )
}

export interface DnsSetupProps {
  domain: string
  verificationToken?: string | null
  /** What the last check found, when there has been one since the page opened. */
  checks: DnsChecks | null
  /** The domain's status: records read as found once DNS has already passed. */
  status: string
  checking: boolean
  onCheck: () => void
  /** The last check's one line, and whether it passed. */
  result?: { ok: boolean; message: string } | null
  tone: DomainTone
  /** Heading level context: the /app card draws its own title; the builder uses this one. */
  title?: React.ReactNode
}

export function DnsSetup({ domain, verificationToken, checks, status, checking, onCheck, result, tone, title }: DnsSetupProps) {
  const t = TONES[tone]
  const [registrarId, setRegistrarId] = useRegistrar()
  const registrar = registrarById(registrarId)
  const records = recordsFor(verificationToken)
  const passed = status === "ssl_provisioning" || status === "active"
  const checkOf = (r: DnsRecord): RecordCheck | null => (passed ? { state: "found", seen: [] } : checks ? checks[r.key] : null)
  const trouble = checks && !passed && result && !result.ok ? troubleFor(checks, domain) : []
  const selectId = React.useId()

  return (
    <div data-dns-setup="" className="min-w-0">
      {title}
      <ol className="space-y-6">
        {/* ── 1. Add the records ─────────────────────────────────────── */}
        <li className="min-w-0">
          <StepHead n={1} tone={tone}>
            Add these records where you bought {domain}
          </StepHead>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <label htmlFor={selectId} className={cn("text-[13px]", t.muted)}>
              Domain provider
            </label>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <select
                id={selectId}
                value={registrar.id}
                onChange={(e) => setRegistrarId(e.target.value as RegistrarId)}
                className={cn("min-w-0 max-w-full cursor-pointer appearance-none", t.select)}
                style={{
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 8px center",
                  backgroundSize: "16px 16px",
                  backgroundImage:
                    tone === "light"
                      ? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath d='M5.5 7.5 10 12l4.5-4.5'/%3E%3C/svg%3E\")"
                      : "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%23ffffff99'%3E%3Cpath d='M5.5 7.5 10 12l4.5-4.5'/%3E%3C/svg%3E\")",
                }}
              >
                {REGISTRARS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              {registrar.dnsUrl && (
                <a
                  href={registrar.dnsUrl(domain)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("inline-flex min-h-11 items-center gap-1 text-[13px] font-medium sm:min-h-0", t.link)}
                >
                  Open {registrar.name.replace(/ \(.*\)$/, "")} DNS
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}
            </div>
          </div>

          {/* The table: a grid on a computer, a stack per record on a phone. */}
          <div data-dns-table="" role="table" aria-label={`DNS records for ${domain}`} className={cn("mt-3 overflow-hidden", t.box)}>
            <div
              role="row"
              className={cn(
                "hidden gap-3 border-b px-4 py-2 text-[12px] font-medium sm:grid sm:grid-cols-[56px_minmax(80px,112px)_minmax(0,1fr)_72px_minmax(150px,190px)]",
                t.head,
                t.rule,
              )}
            >
              <span role="columnheader">Type</span>
              <span role="columnheader">Name</span>
              <span role="columnheader">Value</span>
              <span role="columnheader">TTL</span>
              <span role="columnheader">Status</span>
            </div>
            {records.map((r) => {
              const host = hostFor(registrar, r)
              return (
                <div
                  key={r.key}
                  role="row"
                  data-dns-record={r.type}
                  className={cn(
                    "border-b px-4 py-3 last:border-b-0 sm:grid sm:grid-cols-[56px_minmax(80px,112px)_minmax(0,1fr)_72px_minmax(150px,190px)] sm:items-center sm:gap-3 sm:py-2",
                    t.rule,
                  )}
                >
                  {/* Type, and on a phone the status beside it. */}
                  <div className="flex items-center justify-between gap-3 sm:contents">
                    <span role="cell" className={cn("font-mono text-[13px] font-semibold", t.text)}>
                      {r.type}
                    </span>
                    <span className="sm:hidden">
                      <Status check={checkOf(r)} tone={tone} />
                    </span>
                  </div>
                  <div role="cell" className="mt-1 flex min-w-0 items-center justify-between gap-2 sm:mt-0 sm:justify-start sm:gap-1">
                    <span className={cn("w-14 shrink-0 text-[12px] sm:hidden", t.muted)}>Name</span>
                    <span className="min-w-0 flex-1 truncate sm:flex-none">
                      <NameCell record={r} host={host} tone={tone} />
                    </span>
                    {host ? <CopyButton value={host} label={`${r.type} name`} tone={tone} /> : <span className="h-11 w-11 shrink-0 sm:h-8 sm:w-8" aria-hidden />}
                  </div>
                  <div role="cell" className="flex min-w-0 items-center justify-between gap-2 sm:gap-1">
                    <span className={cn("w-14 shrink-0 text-[12px] sm:hidden", t.muted)}>Value</span>
                    <span data-dns-value="" className={cn("min-w-0 flex-1 break-all font-mono text-[13px]", t.text)}>
                      {r.value}
                    </span>
                    <CopyButton value={r.value} label={`${r.type} value`} tone={tone} />
                  </div>
                  <div role="cell" className={cn("mt-1 flex items-center gap-2 text-[12px] sm:mt-0 sm:text-[13px]", t.muted)}>
                    <span className={cn("w-14 shrink-0 sm:hidden", t.muted)}>TTL</span>
                    {registrar.ttl}
                  </div>
                  <div role="cell" className="hidden min-w-0 sm:block">
                    <Status check={checkOf(r)} tone={tone} />
                  </div>
                </div>
              )
            })}
          </div>
          {registrar.note && <p className={cn("mt-2 text-[13px] leading-snug", t.note)}>{registrar.note}</p>}
        </li>

        {/* ── 2. Wait ───────────────────────────────────────────────── */}
        <li>
          <StepHead n={2} tone={tone}>
            Wait for them to show
          </StepHead>
          <p className={cn("mt-1 pl-8 text-[13px] leading-snug", t.muted)}>Usually a few minutes. Sometimes up to 48 hours.</p>
        </li>

        {/* ── 3. Check ──────────────────────────────────────────────── */}
        <li>
          <StepHead n={3} tone={tone}>
            Check
          </StepHead>
          <div className="mt-2 flex flex-wrap items-center gap-3 pl-8">
            <button
              type="button"
              onClick={onCheck}
              disabled={checking}
              className={cn(
                "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-[14px] font-semibold transition-colors disabled:cursor-default sm:h-9",
                t.button,
              )}
            >
              {checking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Check DNS
            </button>
            {result && <span className={cn("text-[13px] leading-snug", result.ok ? t.found : t.muted)}>{result.message}</span>}
          </div>
          {trouble.length > 0 && (
            <div data-dns-trouble="" className={cn("mt-3 ml-8 rounded-lg border px-3.5 py-3", t.trouble)}>
              <p className="text-[13px] font-semibold">What to fix</p>
              <ul className="mt-1.5 space-y-1.5">
                {trouble.map((line) => (
                  <li key={line} className="text-[13px] leading-snug">
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
      <span className={cn("mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold", t.step)}>{n}</span>
      <span className="min-w-0">{children}</span>
    </p>
  )
}
