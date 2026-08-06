"use client"

import { useCallback, useRef, useState } from "react"

/**
 * Running the photograph backfill, from a page instead of a terminal.
 *
 * The walk is driven here rather than server-side on purpose. Reprocessing
 * every listing in one request is a request that cannot finish — decoding
 * photographs is the slowest thing this project does and a serverless function
 * has a hard ceiling — so the server does one small batch and hands back a
 * cursor, and this asks again. That also means progress is visible while it
 * happens, and closing the tab stops it cleanly rather than killing something
 * mid-write.
 */

type Result = { id: string; images?: number; trimmed?: number; error?: string; skipped?: string }
type Batch = {
  ok?: boolean
  scanned?: number
  updated?: number
  imagesTrimmed?: number
  nextAfter?: string | null
  done?: boolean
  results?: Result[]
  listings?: number
  withoutVariants?: number
  error?: string
}

async function post(body: Record<string, unknown>): Promise<Batch> {
  const res = await fetch("/api/admin/image-backfill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as Batch
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
  return json
}

export default function ImageBackfillClient() {
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [listings, setListings] = useState<number | null>(null)
  const [done, setDone] = useState(0)
  const [trimmed, setTrimmed] = useState(0)
  const [failed, setFailed] = useState(0)
  /** Set when the user asks to stop; the loop checks it between batches. */
  const cancel = useRef(false)

  const say = useCallback((line: string) => setLog((l) => [line, ...l].slice(0, 200)), [])

  const count = useCallback(async () => {
    setBusy(true)
    try {
      const r = await post({ mode: "count" })
      setListings(r.listings ?? 0)
      say(`${r.listings ?? 0} listings, ${r.withoutVariants ?? 0} with no variants yet. Nothing written.`)
    } catch (e) {
      say(`Failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }, [say])

  const run = useCallback(async () => {
    setBusy(true)
    cancel.current = false
    setDone(0)
    setTrimmed(0)
    setFailed(0)
    let after: string | null = null
    try {
      // No upper bound on batches — the cursor comes back null when the walk is
      // over, and a fixed cap would silently stop half way through a catalogue
      // that had grown.
      for (;;) {
        if (cancel.current) {
          say("Stopped. Re-running continues from the beginning; already-done listings are simply redone.")
          break
        }
        const r: Batch = await post({ mode: "run", limit: 10, ...(after ? { after } : {}) })
        setDone((n) => n + (r.updated ?? 0))
        setTrimmed((n) => n + (r.imagesTrimmed ?? 0))
        const errs = (r.results ?? []).filter((x) => x.error)
        setFailed((n) => n + errs.length)
        for (const e of errs) say(`· ${e.id.slice(0, 8)} — ${e.error}`)
        const withBars = (r.results ?? []).filter((x) => (x.trimmed ?? 0) > 0)
        if (withBars.length) say(`Trimmed bars off ${withBars.length} listing(s) in this batch.`)
        if (r.done || !r.nextAfter) {
          say("Finished.")
          break
        }
        after = r.nextAfter
      }
    } catch (e) {
      say(`Stopped on an error: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }, [say])

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="text-[22px] font-bold text-neutral-900">Reprocesare imagini</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-neutral-600">
        Regenerează varianta mare și miniatura 3:4 pentru fiecare anunț, tăind
        marginile uniforme care sunt <em>desenate în fotografie</em> — dungile
        gri care apar sub imagine pe pagina produsului. Nu șterge și nu
        suprascrie nimic: fișierele noi se scriu alături, iar anunțurile rămân
        vizibile tot timpul. Poate fi rulat de câte ori vrei.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={count}
          disabled={busy}
          className="rounded-full border border-neutral-300 px-4 py-2 text-[14px] font-semibold text-neutral-800 disabled:opacity-40"
        >
          Numără (nu scrie nimic)
        </button>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-full bg-[#7c3aed] px-5 py-2 text-[14px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Se procesează…" : "Rulează"}
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => {
              cancel.current = true
            }}
            className="rounded-full border border-neutral-300 px-4 py-2 text-[14px] font-semibold text-neutral-800"
          >
            Oprește
          </button>
        )}
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
        {[
          ["Anunțuri", listings ?? "—"],
          ["Procesate", done],
          ["Imagini tăiate", trimmed],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-neutral-200 px-3 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</dt>
            <dd className="mt-1 text-[19px] font-bold text-neutral-900 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {failed > 0 && (
        <p className="mt-3 text-[13px] text-amber-700">
          {failed} imagine(i) au eșuat. Anunțurile lor au rămas neatinse — vezi lista de mai jos.
        </p>
      )}

      {log.length > 0 && (
        <pre className="mt-6 max-h-80 overflow-auto rounded-xl bg-neutral-50 p-4 text-[12px] leading-relaxed text-neutral-700">
          {log.join("\n")}
        </pre>
      )}
    </div>
  )
}
