import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { loadProductEditor } from "../load-editor"
import { ProductEditor } from "./product-editor"

export const metadata: Metadata = {
  title: "New product",
}

interface NewProductPageProps {
  searchParams: Promise<{ edit?: string }>
}

/**
 * A new product's form, drawn on the server with the creator already read,
 * so it is complete on its first frame. The old `?edit=<id>` address still
 * works: it goes to the product's own address, /app/products/<id>.
 */
export default async function NewProductPage({ searchParams }: NewProductPageProps) {
  const { edit } = await searchParams
  if (edit) redirect(`/app/products/${encodeURIComponent(edit)}`)

  const load = await loadProductEditor(null)
  /* No session yet: the app shell's gate (NativeAuthGate) holds the screen
     while it restores one (the native apps keep it outside cookies) and asks
     again, so nothing drawn here is seen. Nothing, then, not an outline. */
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") redirect("/onboarding")
  if (load.state !== "ready") redirect("/app/products")
  return <ProductEditor creator={load.creator} loaded={null} />
}
