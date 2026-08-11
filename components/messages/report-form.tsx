"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Check, ShieldAlert } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE REPORT FORM
 * ===========================================================================
 *
 * One screen: what happened, optionally in your own words, and send.
 *
 * ---------------------------------------------------------------------------
 * WHY THE MESSAGE IS QUOTED AT THE TOP
 * ---------------------------------------------------------------------------
 * The reporter arrived here from a menu on one specific bubble, and by the time
 * the page has loaded that bubble is off screen. Without the quote they are
 * choosing a reason for a message they can no longer see and have to trust the
 * app got the right one — which, when the whole point is that the app is
 * carrying an id it was handed in a URL, is exactly the thing worth showing
 * rather than asserting. It is also the last chance to notice that the wrong
 * message was picked.
 *
 * ---------------------------------------------------------------------------
 * WHY THE REASONS ARE THE SAME FIVE AS THE DETAILS SHEET
 * ---------------------------------------------------------------------------
 * They go into the same column of the same table, and the API validates against
 * a set (REASONS in app/api/messages/[id]/actions/route.ts). A sixth reason
 * offered here would be accepted by the form, rejected by the route, and
 * silently rewritten to "other" — a report filed under a heading nobody chose.
 * So the list is the list.
 */

const REASONS: { id: string; label: string; hint: string }[] = [
  { id: "scam", label: "Încercare de înșelătorie", hint: "Cere plata în afara aplicației, date bancare sau un avans" },
  { id: "harassment", label: "Hărțuire sau limbaj abuziv", hint: "Amenințări, insulte sau mesaje repetate nedorite" },
  { id: "spam", label: "Spam sau reclame", hint: "Mesaje comerciale, linkuri sau conținut fără legătură" },
  { id: "counterfeit", label: "Produs contrafăcut", hint: "Vinde replici sau produse care încalcă un drept de marcă" },
  { id: "other", label: "Altceva", hint: "Descrie mai jos ce s-a întâmplat" },
]

const MAX_DETAIL = 2000

export function ReportForm({
  conversationId,
  offenderName,
  message,
}: {
  conversationId: string
  offenderName: string
  message: { id: string; body: string | null; kind: string; createdAt: string } | null
}) {
  const router = useRouter()
  const [reason, setReason] = useState<string | null>(null)
  const [detail, setDetail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const submit = useCallback(async () => {
    if (!reason || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/messages/${conversationId}/actions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "report",
          reason,
          detail: detail.trim() || undefined,
          messageId: message?.id,
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setSent(true)
    } catch {
      // Said once, in place, with the form still filled in. A report that fails
      // to send and clears itself is a report that does not get filed twice.
      setError("Nu am putut trimite raportarea. Încearcă din nou.")
    } finally {
      setBusy(false)
    }
  }, [busy, conversationId, detail, message, reason])

  if (sent) {
    return (
      <main className="mx-auto flex min-h-[70svh] max-w-[560px] flex-col items-center justify-center px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Check className="h-7 w-7" strokeWidth={2.4} />
        </span>
        <h1 className="mt-4 text-[19px] font-bold text-neutral-900">Raportare trimisă</h1>
        <p className="mt-2 max-w-[380px] text-[14.5px] leading-relaxed text-neutral-500">
          Echipa noastră o analizează. Nu îți spunem ce măsuri luăm, dar fiecare raportare este
          citită.
        </p>
        {/* Blocking is the thing that changes their day, and it lives in the
            conversation's own details sheet — so the way back is the way to it. */}
        <Link
          href={`/messages/${conversationId}`}
          className="mt-6 rounded-full bg-[#7c3aed] px-5 py-2.5 text-[14.5px] font-semibold text-white"
        >
          Înapoi la conversație
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[560px] px-4 pb-28 pt-3 md:pb-16 md:pt-8">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Înapoi"
          onClick={() => router.back()}
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-neutral-700"
        >
          <ArrowLeft className="h-[21px] w-[21px]" />
        </button>
        <h1 className="text-[19px] font-bold tracking-[-0.01em] text-neutral-900">Raportează</h1>
      </div>

      <p className="mt-2 text-[14px] leading-relaxed text-neutral-500">
        Spune-ne ce s-a întâmplat în conversația cu{" "}
        <span className="font-semibold text-neutral-700">{offenderName}</span>.
      </p>

      {message && (
        <figure className="mt-4 rounded-2xl border border-neutral-200/80 bg-neutral-50 px-4 py-3">
          <figcaption className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-neutral-400">
            Mesajul raportat
          </figcaption>
          <blockquote className="mt-1.5 whitespace-pre-wrap break-words text-[14.5px] leading-[1.45] text-neutral-800">
            {message.body ||
              (message.kind === "image"
                ? "📷 Fotografie"
                : message.kind === "offer"
                  ? "Ofertă"
                  : "Mesaj fără text")}
          </blockquote>
          <p className="mt-1.5 text-[12px] text-neutral-400">{stamp(message.createdAt)}</p>
        </figure>
      )}

      <fieldset className="mt-5">
        <legend className="text-[12.5px] font-semibold uppercase tracking-[0.05em] text-neutral-400">
          Ce s-a întâmplat?
        </legend>
        <div className="mt-2 overflow-hidden rounded-2xl border border-neutral-200/80">
          {REASONS.map((r, i) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={reason === r.id}
              onClick={() => setReason(r.id)}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-3.5 text-left",
                i > 0 && "border-t border-neutral-100",
                reason === r.id ? "bg-[#7c3aed]/[0.055]" : "bg-white",
              )}
            >
              {/* A radio drawn rather than an <input type="radio">, for the same
                  reason every picker in this app is: the native control cannot
                  be made to match the app's violet on iOS, and a control that is
                  blue on one platform and violet on another reads as a browser
                  dialog inside the app. */}
              <span
                aria-hidden
                className={cn(
                  "mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  reason === r.id ? "border-[#7c3aed]" : "border-neutral-300",
                )}
              >
                {reason === r.id && <span className="h-[9px] w-[9px] rounded-full bg-[#7c3aed]" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-tight text-neutral-900">
                  {r.label}
                </span>
                <span className="mt-0.5 block text-[13px] leading-[1.4] text-neutral-500">{r.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-5 block">
        <span className="text-[12.5px] font-semibold uppercase tracking-[0.05em] text-neutral-400">
          Detalii (opțional)
        </span>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value.slice(0, MAX_DETAIL))}
          rows={4}
          placeholder="Ce s-a întâmplat, pe scurt."
          // 16px because anything smaller makes iOS Safari zoom the page the
          // moment this takes focus, and that zoom is never undone.
          className="mt-2 block w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[16px] leading-[1.45] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-[#7c3aed]/50 focus:bg-white"
        />
        {detail.length > MAX_DETAIL * 0.9 && (
          <span className="mt-1 block text-right text-[11.5px] tabular-nums text-neutral-400">
            {MAX_DETAIL - detail.length}
          </span>
        )}
      </label>

      <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-[1.45] text-neutral-500">
        <ShieldAlert className="mt-[1px] h-[15px] w-[15px] shrink-0 text-neutral-400" />
        Raportarea este anonimă — persoana raportată nu află cine a trimis-o. Dacă vrei să nu mai
        primești mesaje de la ea, o poți bloca din detaliile conversației.
      </p>

      {error && <p className="mt-3 text-[13.5px] font-medium text-red-600">{error}</p>}

      <button
        type="button"
        disabled={!reason || busy}
        onClick={() => void submit()}
        className="mt-5 w-full rounded-full bg-[#7c3aed] py-3.5 text-[15.5px] font-semibold text-white disabled:bg-neutral-200 disabled:text-neutral-400"
      >
        {busy ? "Se trimite…" : "Trimite raportarea"}
      </button>
    </main>
  )
}

function stamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
