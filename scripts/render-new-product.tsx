/**
 * The question before a new product (app/app/products/new/kind-chooser.tsx)
 * for scripts/check-new-product.mjs, in both its shapes:
 *
 *   #sheet   a Products bar with New product, which asks in place (the
 *            sheet below 768px, the dialog from there)
 *   #page    /app/products/new with no kind: the question as a page
 *
 * The router is the probe's: every push, replace and prefetch is written to
 * window.__nav, so the probe reads where each answer went. /api/app/memberships
 * is answered in the page (window.__membership decides how).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { NewProductKindPage, useNewProductChooser } from "@/app/app/products/new/kind-chooser"

function Bar() {
  const newProduct = useNewProductChooser()
  return (
    <div className="min-h-svh bg-[#f8f9fa]">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Products</h1>
        <a
          href="/app/products/new"
          data-new-product=""
          onClick={(e) => {
            e.preventDefault()
            newProduct.open()
          }}
          onMouseEnter={newProduct.warm}
          className="inline-flex h-9 items-center rounded-lg bg-[#8b5cf6] px-3.5 text-[14px] font-medium text-white"
        >
          New product
        </a>
      </div>
      {newProduct.chooser}
    </div>
  )
}

const mode = location.hash.slice(1) || "sheet"
createRoot(document.getElementById("app")!).render(mode === "page" ? <div className="min-h-svh bg-[#f8f9fa]"><NewProductKindPage /></div> : <Bar />)
