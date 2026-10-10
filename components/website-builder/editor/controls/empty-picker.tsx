"use client"

/**
 * A picker with nothing to pick from yet: a small card that says so and
 * offers the one thing to do, instead of a line of grey text where the
 * control should be. Products and collections both use it.
 */
import * as React from "react"
import { FolderOpen, Package, Plus } from "lucide-react"

export function EmptyPicker({ kind }: { kind: "product" | "collection" }) {
  const product = kind === "product"
  const Icon = product ? Package : FolderOpen
  return (
    <div data-empty-picker={kind} className="flex items-center gap-3 rounded-lg border border-[#eceef1] bg-[#fafafb] px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-[#6b7280] shadow-[0_0_0_1px_rgba(0,0,0,0.05)]">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium text-[#1a1a2e]">{product ? "No products yet" : "No collections yet"}</span>
        <span className="block truncate text-[11.5px] text-[#6b7280]">{product ? "Publish one and pick it here." : "Group products, then pick one here."}</span>
      </span>
      <a
        href={product ? "/app/products/new" : "/app/products/collections"}
        target="_blank"
        rel="noopener"
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-[#1a1a2e] px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-black max-sm:h-10"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
        {product ? "Add" : "Create"}
      </a>
    </div>
  )
}
