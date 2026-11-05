"use client"

/**
 * THE COLLECTIONS A PRODUCT IS IN, CHOSEN WHERE IT IS MADE (round 24, the
 * owner: "when I'm adding a product or edit a product, I can select in which
 * collection to add it"). The store's collections as pills: a manual one is
 * pressed on or off, a smart one shows whether its rules hold this product
 * and is not pressed (its rules decide). Saved after the product, as Sales
 * channels is (product-editor, the save's tail), through
 * /api/collections/product.
 */
import * as React from "react"
import Link from "next/link"
import { Check, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { hapticTap } from "@/lib/native-bridge"
import { tt } from "@/lib/i18n/text"

export interface CollectionsHandle {
  /** Puts the product in the collections pressed; an error's words, or null. */
  save: (productId: string) => Promise<string | null>
}

type Row = { id: string; title: string; kind: "manual" | "smart"; member: boolean }

export const CollectionsCard = React.forwardRef<CollectionsHandle, { productId: string | null; cardClass: string; titleClass: string; onValue?: (on: string[] | undefined, saved: boolean) => void }>(function CollectionsCard({ productId, cardClass, titleClass, onValue }, ref) {
  const [rows, setRows] = React.useState<Row[] | null>(null)
  const [on, setOn] = React.useState<Set<string>>(new Set())
  const dirty = React.useRef(false)
  /* Told to the editor after each draw, so Save lights while the pills differ from what was loaded (product-editor reportCard). */
  const told = React.useRef(onValue)
  told.current = onValue
  const asLoaded = React.useRef(false)
  React.useEffect(() => {
    if (!rows) return
    told.current?.([...on].sort(), asLoaded.current)
    asLoaded.current = false
  }, [on, rows])
  React.useEffect(() => () => told.current?.(undefined, true), [])

  React.useEffect(() => {
    let live = true
    const q = productId ? `?productId=${encodeURIComponent(productId)}` : ""
    fetch(`/api/collections/product${q}`, { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { collections?: Row[] } | null) => {
        if (!live || !d || !Array.isArray(d.collections)) return
        asLoaded.current = true
        setRows(d.collections)
        setOn(new Set(d.collections.filter((c) => c.kind === "manual" && c.member).map((c) => c.id)))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [productId])

  React.useImperativeHandle(
    ref,
    () => ({
      save: async (id: string) => {
        if (!rows || !dirty.current) return null
        try {
          const r = await fetch("/api/collections/product", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ productId: id, collectionIds: [...on] }) })
          if (!r.ok) return ((await r.json().catch(() => ({}))) as { error?: string }).error ?? tt("The collections were not saved.")
          dirty.current = false
          return null
        } catch {
          return tt("The collections were not saved.")
        }
      },
    }),
    [rows, on],
  )

  if (!rows || rows.length === 0) return null
  const toggle = (id: string) => {
    dirty.current = true
    hapticTap("soft")
    setOn((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className={cardClass} data-product-collections="">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={titleClass}>{tt("Collections")}</h2>
        <Link href="/app/products/collections" prefetch={false} className="shrink-0 text-[13px] font-medium text-[#4b5563] underline-offset-2 hover:text-[#1a1a2e] hover:underline">
          {tt("Manage")}
        </Link>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={tt("Collections")}>
        {rows.map((c) => {
          const smart = c.kind === "smart"
          const pressed = smart ? c.member : on.has(c.id)
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={pressed}
              disabled={smart}
              title={smart ? tt("Automatic: its rules decide") : undefined}
              onClick={() => toggle(c.id)}
              data-collection={c.id}
              className={cn(
                "inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition-[background-color,border-color,color] duration-150 ease-out [-webkit-tap-highlight-color:transparent] disabled:cursor-default",
                pressed ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e3e4e8] bg-white text-[#1a1a2e]",
                smart && !pressed && "text-[#9ca3af]",
              )}
            >
              {smart ? <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden /> : pressed ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.75} aria-hidden /> : null}
              <span className="truncate">{c.title}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
})
