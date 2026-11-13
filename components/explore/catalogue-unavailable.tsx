"use client"

import type { CatalogueRetry } from "./use-catalogue-retry"

/**
 * What the grid says when the products did not load (components/explore/
 * use-catalogue-retry.ts): never "No products found", which is a claim about
 * the catalogue the page could not make. The same dashed box the empty
 * result draws, so nothing moves when the products arrive.
 */
export function CatalogueUnavailable({ retry, className = "" }: { retry: CatalogueRetry; className?: string }) {
  return (
    <div data-catalogue-unavailable="" role="status" className={`min-h-[60svh] flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 p-12 text-center ${className}`}>
      <p className="text-neutral-500">{retry.state === "gave-up" ? "Products did not load." : "Products did not load. Trying again."}</p>
      {retry.state === "gave-up" && (
        <button
          type="button"
          onClick={retry.retry}
          className="mt-3 text-sm text-neutral-600 hover:text-neutral-900 font-medium underline underline-offset-2 cursor-pointer"
        >
          Try again
        </button>
      )}
    </div>
  )
}
