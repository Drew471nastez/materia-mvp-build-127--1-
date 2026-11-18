"use client"

/**
 * THE MAP BLOCK'S PLACE (lib/onepage/map-place): typed, or pasted from
 * Google Maps. The field takes either; under it, one quiet line says what
 * the map will show ("Found Joe's Pizza"), or why it cannot. A short link
 * from Maps' Share button is read once here (app/api/onepage/map-place) and
 * the whole link kept beside it, so the live page never asks.
 */
import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { tt } from "@/lib/i18n/text"
import { cn } from "@/lib/utils"
import { isShortMapsLink, mapPlace, mapPlaceOf } from "@/lib/onepage/map-place"
import type { MapBlockData } from "@/lib/onepage/types"

type Reading = "idle" | "reading" | "failed"

export function MapPlaceField({ data, updateData }: { data: MapBlockData; updateData: (patch: Partial<MapBlockData>) => void }) {
  const typed = (data.address || "").trim()
  const [reading, setReading] = React.useState<Reading>("idle")
  const [problem, setProblem] = React.useState<string | null>(null)
  const latest = React.useRef(updateData)
  latest.current = updateData
  const short = isShortMapsLink(typed)
  const read = !!data.place && data.place.from === typed && !!data.place.url

  React.useEffect(() => {
    setProblem(null)
    if (!short || read) {
      setReading("idle")
      return
    }
    setReading("reading")
    const ask = new AbortController()
    const t = window.setTimeout(() => {
      fetch(`/api/onepage/map-place?url=${encodeURIComponent(typed)}`, { signal: ask.signal, cache: "no-store" })
        .then(async (r) => {
          const body = (await r.json().catch(() => ({}))) as { url?: string; error?: string }
          if (r.ok && body.url) {
            latest.current({ place: { from: typed, url: body.url } })
            setReading("idle")
          } else {
            setProblem(body.error || null)
            setReading("failed")
          }
        })
        .catch(() => {
          if (!ask.signal.aborted) setReading("failed")
        })
    }, 350)
    return () => {
      window.clearTimeout(t)
      ask.abort()
    }
  }, [typed, short, read])

  const place = mapPlaceOf(data)
  const line: { words: string; tone: "quiet" | "problem" } | null = !typed
    ? null
    : reading === "reading"
      ? { words: tt("Reading the Google Maps link"), tone: "quiet" }
      : reading === "failed"
        ? { words: problem || tt("This link did not lead to a place. Paste the address instead."), tone: "problem" }
        : place && place.kind !== "address" && place.label
          ? { words: tt("Found {place}", { place: place.label }), tone: "quiet" }
          : !mapPlace(typed)
            ? { words: tt("Paste a Google Maps link or type the address."), tone: "problem" }
            : null

  return (
    <div className="space-y-1.5" data-map-place-field="">
      <Label className="text-xs">{tt("Address or Google Maps link")}</Label>
      <Input
        value={data.address || ""}
        maxLength={2000}
        inputMode="text"
        autoCapitalize="words"
        autoCorrect="off"
        spellCheck={false}
        placeholder={tt("350 5th Ave, New York, NY 10118")}
        aria-invalid={line?.tone === "problem" || undefined}
        onChange={(e) => updateData({ address: e.target.value })}
      />
      {line ? (
        <p role={line.tone === "problem" ? "alert" : "status"} className={cn("text-[12.5px] leading-[1.4]", line.tone === "problem" ? "text-[#b42318]" : "text-[#6b7280]")} data-map-place-said={line.tone}>
          {line.words}
        </p>
      ) : null}
    </div>
  )
}
