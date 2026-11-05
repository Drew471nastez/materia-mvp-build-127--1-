import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { loadProductEditor } from "../load-editor"
import { ProductEditorAcrossCurrency } from "../new/product-editor"
import { getServerTt } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Edit product"),
  }
}

interface ProductEditPageProps {
  params: Promise<{ id: string }>
}

/**
 * ===========================================================================
 *  A PRODUCT'S EDITOR, WITH THE PRODUCT IN IT
 * ===========================================================================
 * This address used to redirect to /app/products/new?edit=<id>, a client
 * page that drew an empty form, waited, and then fetched the creator, the
 * product, its files and its variants one after another. Now the product is
 * read here, in one parallel round (../load-editor.ts), and the editor's
 * first frame is the product itself. The Products list prefetches this page
 * in full when a row is hovered or touched, so the press usually finds it
 * already here.
 */
export default async function ProductEditPage({ params }: ProductEditPageProps) {
  const { id } = await params
  const load = await loadProductEditor(id)
  /* No session on this request: the app shell's gate (NativeAuthGate) holds
     the screen while it restores one and reloads, so nothing drawn here is
     seen. Nothing, then, rather than an outline of the editor. */
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") redirect("/onboarding")
  /* Not theirs, or gone: back to the list rather than an empty form. */
  if (load.state === "missing") redirect("/app/products")
  /* A membership has its own screen: its price per month or year, its posts and its members (app/app/memberships). */
  if (load.loaded?.product.type === "membership") redirect(`/app/memberships/${encodeURIComponent(id)}`)
  /* Drawn again in another currency after Settings converts the prices: mounted again on them, unless there is unsaved work (ProductEditorAcrossCurrency). */
  return <ProductEditorAcrossCurrency key={id} id={id} creator={load.creator} loaded={load.loaded} />
}
