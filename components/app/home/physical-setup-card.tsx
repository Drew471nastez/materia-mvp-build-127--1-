"use client"

/**
 * HOME'S "SELLING PHYSICAL PRODUCTS" CARD: the five steps a store needs to
 * ship anything (lib/home/physical-setup.ts), read off the store each time
 * Home is landed on. Only while physical commerce is on in /admin, and gone
 * once every step is done. What is left comes first; the next step carries
 * the arrow. Each row goes to where the step is done.
 */
import * as React from "react"
import { ArrowRight, Check, Package } from "lucide-react"
import { AppLink } from "@/components/app/app-link"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import type { PhysicalStep } from "@/lib/home/physical-setup"

export function PhysicalSetupCard() {
  const physical = usePhysicalCommerceEnabled()
  const [steps, setSteps] = React.useState<PhysicalStep[] | null>(null)

  React.useEffect(() => {
    if (!physical) return
    let live = true
    fetch("/api/home/physical-setup", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { steps?: PhysicalStep[] } | null) => {
        if (live && d && Array.isArray(d.steps)) setSteps(d.steps)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [physical])

  if (!physical || !steps || steps.every((s) => s.done)) return null
  const done = steps.filter((s) => s.done).length
  const ordered = [...steps.filter((s) => !s.done), ...steps.filter((s) => s.done)]
  const next = ordered[0]

  return (
    <section aria-labelledby="physical-setup-title" className="home-card relative mb-8 flex flex-col rounded-[20px] border border-[#e6e7eb] bg-white" data-physical-setup="">
      <div className="flex items-start gap-3 px-5 pt-5">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f3f4f6] text-[#374151]">
          <Package className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h2 id="physical-setup-title" className="text-[14px] font-semibold text-[#1a1a2e]">
              Selling physical products
            </h2>
            <span className="text-[12px] font-medium tabular-nums text-[#9ca3af]">
              {done} of {steps.length}
            </span>
          </div>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">Five steps and your store can take orders it ships.</p>
        </div>
      </div>
      <div className="mx-5 mt-3 h-[5px] overflow-hidden rounded-full bg-[#eef0f3]" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Physical setup progress">
        <div className="h-full rounded-full bg-[#1a1a2e] transition-[width] duration-500" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="mt-3 px-2 pb-3">
        {ordered.map((s) => (
          <li key={s.id} data-physical-step={s.id} data-done={s.done ? "" : undefined}>
            <AppLink href={s.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[#f8f9fa]">
              <span aria-hidden className={s.done ? "grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#1a1a2e] text-white" : "h-5 w-5 shrink-0 rounded-full border-[1.5px] border-[#d1d5db]"}>
                {s.done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className={s.done ? "block text-[14px] text-[#9ca3af] line-through" : "block text-[14px] font-medium text-[#1a1a2e]"}>{s.label}</span>
                {!s.done ? <span className="block truncate text-[12.5px] text-[#6b7280]">{s.line}</span> : null}
              </span>
              {s === next ? <ArrowRight className="h-4 w-4 shrink-0 text-[#1a1a2e]" aria-hidden /> : null}
            </AppLink>
          </li>
        ))}
      </ul>
    </section>
  )
}
