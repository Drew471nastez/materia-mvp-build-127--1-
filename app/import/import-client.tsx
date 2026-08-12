"use client"

import { useCallback, useMemo, useState } from "react"
import Image from "next/image"
import { AlertTriangle, ArrowRight, Check, Loader2, PackageSearch, RotateCcw } from "lucide-react"

import { DEPARTMENTS, categoryLabelFor } from "@/lib/marketplace/listing-taxonomy"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  IMPORT A SHOP FROM ANOTHER MARKETPLACE
 * ===========================================================================
 *
 * TWO STEPS, BECAUSE THE FIRST ONE IS REVERSIBLE AND THE SECOND IS NOT.
 * Scan reads and writes nothing. Import creates listings that go straight to
 * the feed. Collapsing them into one button means finding out what you were
 * about to publish only after it is published — and the failure that matters
 * is not a broken import, it is a CORRECT import of the wrong profile, which
 * is thirty real listings to delete by hand.
 *
 * So the middle of this page is a review table, and nothing is selected by
 * default that the mapper was unsure about.
 */

type Mapped = {
  sourceId: string
  sourceUrl: string
  preview: string | null
  photoCount: number
  title: string
  description: string
  priceCents: number
  sourcePriceAmount: number
  sourcePriceCurrency: string
  category: string | null
  subcategory: string | null
  brand: string | null
  condition: string | null
  size: string | null
  missing: string[]
}

type ScanResponse = {
  profile: { memberId: string; login: string; countryCode: string | null; host: string; profileUrl: string; itemCount: number | null }
  items: Mapped[]
  truncated: boolean
  skipped: number
  maxItems: number
  alreadyImported: string[]
  sourceColumnsReady: boolean
}

type RunResult = { sourceId: string; status: "created" | "updated" | "skipped" | "failed"; slug?: string; reason?: string }

const money = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} lei`

export function ImportClient() {
  const [url, setUrl] = useState("")
  const [department, setDepartment] = useState<string>("")
  const [scanning, setScanning] = useState(false)
  const [scan, setScan] = useState<ScanResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState<RunResult[]>([])
  const [progress, setProgress] = useState<{ at: number; of: number } | null>(null)

  const doScan = useCallback(async () => {
    setScanning(true)
    setError(null)
    setScan(null)
    setDone([])
    try {
      const res = await fetch("/api/import/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, department: department || null }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.message || "Scanarea a eșuat.")
        return
      }
      setScan(json)
      // PRE-SELECTED: everything that mapped cleanly and is not already here.
      // An item the mapper could not categorise is left unticked rather than
      // ticked — the operator opting IN to a guess is a decision; opting out
      // of one they never saw is a trap.
      const fresh = new Set<string>(
        (json.items as Mapped[])
          .filter((i) => !json.alreadyImported.includes(i.sourceId) && i.missing.length === 0)
          .map((i) => i.sourceId),
      )
      setPicked(fresh)
    } catch {
      setError("Nu s-a putut contacta serverul.")
    } finally {
      setScanning(false)
    }
  }, [url, department])

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const doImport = useCallback(async () => {
    if (!scan || !picked.size) return
    setRunning(true)
    setError(null)
    const ids = [...picked]
    const all: RunResult[] = []
    try {
      // BATCHED, because a serverless function has a wall clock and eight
      // photographs per listing is the slow part. Twelve at a time keeps every
      // request well inside its budget and lets the page show real progress
      // rather than a spinner that might be dead.
      const SIZE = 12
      for (let i = 0; i < ids.length; i += SIZE) {
        const slice = ids.slice(i, i + SIZE)
        setProgress({ at: i, of: ids.length })
        const res = await fetch("/api/import/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, department: department || null, sourceIds: slice }),
        })
        const json = await res.json()
        if (!res.ok) {
          setError(json?.message || "Importul a eșuat.")
          break
        }
        all.push(...(json.results as RunResult[]))
        setDone([...all])
      }
      setProgress({ at: ids.length, of: ids.length })
    } catch {
      setError("Importul s-a întrerupt.")
    } finally {
      setRunning(false)
    }
  }, [scan, picked, url, department])

  const summary = useMemo(() => {
    if (!done.length) return null
    return {
      created: done.filter((d) => d.status === "created").length,
      updated: done.filter((d) => d.status === "updated").length,
      failed: done.filter((d) => d.status === "failed").length,
    }
  }, [done])

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      <h1 className="text-[26px] font-bold tracking-[-0.02em] text-neutral-900 sm:text-[32px]">Importă un magazin</h1>
      <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-neutral-600">
        Lipește adresa unui profil Vinted. Citim anunțurile active, le potrivim cu categoriile Storelib și le publicăm
        cu aceleași fotografii, în aceeași ordine.
      </p>

      {/* Said once, plainly, where the person doing it will read it. This is
          not a disclaimer to hide behind — it is the one fact about this tool
          that is not obvious from using it. */}
      <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
        <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-amber-600" />
        <p className="text-[13.5px] leading-relaxed text-amber-900">
          Anunțurile și fotografiile aparțin vânzătorului de pe platforma sursă, iar termenii Vinted interzic extragerea
          automată. Folosește instrumentul pentru propriile anunțuri. Copiile publicate aici sunt găzduite de Storelib.
        </p>
      </div>

      {/* ── The address ─────────────────────────────────────────────────── */}
      <div className="mt-7 rounded-2xl border border-neutral-200 bg-white p-5">
        <label htmlFor="profile-url" className="block text-[13px] font-semibold text-neutral-700">
          Adresa profilului
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="profile-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && url.trim() && !scanning) doScan()
            }}
            placeholder="https://www.vinted.co.uk/member/164822283"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border border-neutral-300 px-3.5 py-2.5 text-[14.5px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900"
          />
          <button
            type="button"
            onClick={doScan}
            disabled={!url.trim() || scanning}
            className="inline-flex h-[46px] items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 text-[14.5px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageSearch className="h-4 w-4" />}
            {scanning ? "Se scanează…" : "Scanează"}
          </button>
        </div>

        <div className="mt-4">
          <span className="block text-[13px] font-semibold text-neutral-700">Departament (opțional)</span>
          <p className="mt-1 text-[12.5px] text-neutral-500">
            Pentru articolele neutre — tricouri, adidași — alege unde să ajungă. Rochiile rămân la femei oricum.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[{ id: "", label: "Automat" }, ...DEPARTMENTS].map((d) => (
              <button
                key={d.id || "auto"}
                type="button"
                onClick={() => setDepartment(d.id)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[13.5px] font-medium transition-colors",
                  department === d.id
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 text-neutral-700 hover:border-neutral-900",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</p>
      )}

      {/* ── What is there ───────────────────────────────────────────────── */}
      {scan && (
        <div className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[18px] font-semibold text-neutral-900">
              {scan.profile.login}{" "}
              <span className="font-normal text-neutral-500">
                · {scan.items.length} anunțuri active{scan.profile.countryCode ? ` · ${scan.profile.countryCode}` : ""}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => setPicked(new Set(scan.items.map((i) => i.sourceId)))}
              className="text-[13.5px] font-semibold text-neutral-700 underline-offset-4 hover:underline"
            >
              Selectează tot
            </button>
          </div>

          {/* Every cap and every omission is stated. A truncation nobody is
              told about reads as "that was everything they had". */}
          {(scan.truncated || scan.skipped > 0 || !scan.sourceColumnsReady) && (
            <ul className="mt-3 space-y-1 text-[13px] text-neutral-600">
              {scan.truncated && <li>• Profilul are mai mult de {scan.maxItems} anunțuri; au fost citite primele {scan.maxItems}.</li>}
              {scan.skipped > 0 && <li>• {scan.skipped} articole ignorate (vândute, ascunse sau rezervate).</li>}
              {!scan.sourceColumnsReady && (
                <li className="text-amber-700">
                  • Rulează <code className="rounded bg-amber-50 px-1">RUN_IMPORT_SOURCE.sql</code> — fără el nu putem
                  ști ce a fost deja importat, iar o a doua rulare va crea duplicate.
                </li>
              )}
            </ul>
          )}

          <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200">
            {scan.items.map((it, i) => {
              const already = scan.alreadyImported.includes(it.sourceId)
              const on = picked.has(it.sourceId)
              const result = done.find((d) => d.sourceId === it.sourceId)
              return (
                <div
                  key={it.sourceId}
                  className={cn(
                    "flex items-center gap-4 px-4 py-3",
                    i > 0 && "border-t border-neutral-150 border-t-neutral-100",
                    on && "bg-neutral-50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(it.sourceId)}
                    disabled={running}
                    aria-label={`Importă ${it.title}`}
                    className="h-[18px] w-[18px] shrink-0 accent-neutral-900"
                  />
                  <div className="relative h-16 w-[52px] shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                    {it.preview && (
                      // Unoptimised: these are the SOURCE's CDN urls shown for
                      // review only, and running them through our optimizer
                      // would cache a competitor's images on our account for
                      // pictures that exist for ten seconds.
                      <Image src={it.preview} alt="" fill sizes="52px" className="object-cover" unoptimized />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-medium text-neutral-900">{it.title || "Fără titlu"}</p>
                    <p className="mt-0.5 truncate text-[12.5px] text-neutral-500">
                      {[
                        it.brand,
                        it.size,
                        categoryLabelFor(it.category, it.subcategory) ?? undefined,
                        `${it.photoCount} foto`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {it.missing.length > 0 && (
                      <p className="mt-0.5 text-[12px] text-amber-700">Lipsește: {it.missing.join(", ")}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[14.5px] font-semibold text-neutral-900">{money(it.priceCents)}</p>
                    {/* The original, always. A converted price with no record
                        of what it was converted from cannot be checked. */}
                    <p className="text-[12px] text-neutral-500">
                      {it.sourcePriceAmount} {it.sourcePriceCurrency}
                    </p>
                  </div>
                  <div className="w-[86px] shrink-0 text-right text-[12.5px]">
                    {result?.status === "created" && <span className="font-semibold text-emerald-700">Publicat</span>}
                    {result?.status === "updated" && <span className="font-semibold text-blue-700">Actualizat</span>}
                    {result?.status === "failed" && <span className="font-semibold text-red-600">Eșuat</span>}
                    {!result && already && <span className="text-neutral-500">Deja importat</span>}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={doImport}
              disabled={!picked.size || running}
              className="inline-flex h-[48px] items-center justify-center gap-2 rounded-xl bg-[#7c3aed] px-6 text-[15px] font-semibold text-white shadow-[0_2px_14px_-2px_rgba(124,58,237,0.55)] transition-opacity disabled:opacity-40"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {running ? "Se importă…" : `Importă ${picked.size} ${picked.size === 1 ? "anunț" : "anunțuri"}`}
            </button>
            {progress && running && (
              <span className="text-[13.5px] text-neutral-600">
                {progress.at} / {progress.of}
              </span>
            )}
            {summary && !running && (
              <span className="inline-flex items-center gap-2 text-[13.5px] text-neutral-700">
                <Check className="h-4 w-4 text-emerald-600" />
                {summary.created} publicate, {summary.updated} actualizate
                {summary.failed > 0 && `, ${summary.failed} eșuate`}
              </span>
            )}
            {summary && !running && (
              <button
                type="button"
                onClick={doScan}
                className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-neutral-700 underline-offset-4 hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Rescanează
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
