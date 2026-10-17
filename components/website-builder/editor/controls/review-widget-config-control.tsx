"use client"

/**
 * The Reviews widget section's "Saved look" (`review_config`, a text setting
 * by its schema, drawn here by its id): which of the store's saved widget
 * looks this section draws with (Storelib Reviews › Widgets,
 * lib/reviews/widgets). Only looks of the section's own widget are offered.
 * A look that is gone says so and the section draws the widget's defaults.
 * "Edit looks" opens the gallery in a new tab, so the page being edited
 * stays where it is; the canvas picks up a changed look the next time the
 * page's reviews are read.
 */
import { useEffect, useState } from "react"
import { ChevronsUpDown, PencilLine } from "lucide-react"

import { cn } from "@/lib/utils"
import { WIDGET_INFO, isWidgetType, type WidgetConfig } from "@/lib/reviews/widgets/config"
import { useSiblingSettings } from "./context"
import { NOTE } from "./styles"
import { tt } from "@/lib/i18n/text"

/** The setting this draws, by its id: the Reviews widget sections of both kinds of theme. */
export const REVIEW_CONFIG_FIELD = "review_config"

let shared: Promise<WidgetConfig[]> | null = null
function loadConfigs(): Promise<WidgetConfig[]> {
  if (!shared) {
    shared = fetch("/api/reviews/widgets", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { configs: [] }))
      .then((j: { configs?: WidgetConfig[] }) => (Array.isArray(j.configs) ? j.configs : []))
      .catch(() => [])
    /* Read again on the next panel opened a while later: a look saved in the gallery meanwhile shows up. */
    setTimeout(() => { shared = null }, 15_000)
  }
  return shared
}

export function ReviewWidgetConfigControl({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const siblings = useSiblingSettings()
  const asked = siblings?.widget
  const widget = isWidgetType(asked) ? asked : "product_reviews"
  const [configs, setConfigs] = useState<WidgetConfig[] | null>(null)
  useEffect(() => {
    let live = true
    loadConfigs().then((c) => { if (live) setConfigs(c) })
    return () => { live = false }
  }, [])
  const mine = (configs ?? []).filter((c) => c.type === widget)
  const current = typeof value === "string" ? value : ""
  const chosen = mine.find((c) => c.id === current)
  const missing = !!current && configs !== null && !chosen
  const href = `/app/reviews/widgets?widget=${widget}${chosen ? `&config=${chosen.id}` : ""}`

  return (
    <div className="space-y-1" data-review-config-picker="">
      <div className="overflow-hidden rounded-lg border border-border bg-white dark:bg-white/[0.04]">
        <div className="relative flex min-h-[52px] items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/40 focus-within:bg-muted/40">
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-[13px] font-medium max-sm:text-[15px]", chosen ? "text-foreground" : "text-muted-foreground")}>
              {chosen ? chosen.name : missing ? tt("Saved look deleted") : tt("{name}, as it comes", { name: WIDGET_INFO[widget].name })}
            </span>
            <span className="mt-0.5 block truncate text-[12px] text-muted-foreground max-sm:text-[13px]">
              {configs === null ? tt("Loading your saved looks") : mine.length ? tt("{count} saved for this widget", { count: mine.length }) : tt("None saved for this widget yet")}
            </span>
          </span>
          <ChevronsUpDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <select
            aria-label={label ? `${label}: choose a saved look` : tt("Choose a saved look")}
            data-review-config-select=""
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
            value={chosen || missing ? current : ""}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">{tt("{name}, as it comes", { name: WIDGET_INFO[widget].name })}</option>
            {mine.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {missing && <option value={current}>{tt("Saved look deleted")}</option>}
          </select>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener"
          data-review-config-edit=""
          className="flex h-9 w-full items-center gap-1.5 border-t border-border px-3 text-left text-[12.5px] font-medium text-foreground/80 transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:bg-muted/40 focus-visible:outline-none max-sm:h-11 max-sm:text-[14px]"
        >
          <PencilLine aria-hidden className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
          {chosen ? tt("Edit this look") : tt("Make a look in Storelib Reviews")}
        </a>
      </div>
      {missing && <p className={NOTE}>{tt("This look was deleted, so the widget draws with its own defaults and the changes below.")}</p>}
    </div>
  )
}
