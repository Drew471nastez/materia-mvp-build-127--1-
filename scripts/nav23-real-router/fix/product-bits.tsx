"use client"
import { useRouter } from "next/navigation"
import { openEditor, returnToProducts, useListOrigin, listShown } from "@/app/app/products/list-return"
import { useEffect } from "react"
import { Mounts } from "./mounts"
export function OpenProduct() {
  const router = useRouter()
  useEffect(() => listShown(), [])
  return <button type="button" data-go="open-product" className="mt-4 rounded-full bg-[#1a1a2e] px-4 py-2 text-white text-[14px]" onClick={() => openEditor(router, "/app/products/p1")}>Open product</button>
}
export function ProductEditor({ id }: { id: string }) {
  const router = useRouter()
  useListOrigin()
  return (
    <div className="page-scroll px-4 py-6" data-harness-page="Product">
      <Mounts name="page:Product" />
      <button type="button" data-go="cancel-product" className="rounded-full border px-4 py-2 text-[14px]" onClick={() => returnToProducts(router, id)}>Cancel</button>
      <h1 className="mt-4 text-[24px] font-bold text-[#1a1a2e]">Product {id}</h1>
      {Array.from({ length: 10 }, (_, i) => <div key={i} className="mt-3 bg-white rounded-2xl border border-[#e5e7eb]/60 p-4 text-[14px] text-[#6b7280]">Field {i + 1}</div>)}
    </div>
  )
}
