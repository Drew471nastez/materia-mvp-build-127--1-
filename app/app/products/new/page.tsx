import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { loadProductEditor } from "../load-editor"
import { ProductEditor } from "./product-editor"
import { NewProductKindPage } from "./kind-chooser"
import { kindFromParam } from "./product-kinds"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"

interface NewProductPageProps {
  searchParams: Promise<{ edit?: string; type?: string }>
}

export async function generateMetadata({ searchParams }: NewProductPageProps): Promise<Metadata> {
  const kind = kindFromParam((await searchParams).type)
  if (kind === "physical") return { title: "New physical product" }
  return { title: kind === "course" ? "New course" : "New product" }
}

/**
 * A new product. With no kind yet (`?type=`), the question comes first: a
 * digital product, a video course or a membership (./kind-chooser.tsx,
 * ./product-kinds.ts). With one, the form, drawn on the server with the
 * creator already read, so it is complete on its first frame, and a course
 * is a course on that frame rather than a moment after it. The old
 * `?edit=<id>` address still works: it goes to the product's own address,
 * /app/products/<id>.
 */
export default async function NewProductPage({ searchParams }: NewProductPageProps) {
  const { edit, type } = await searchParams
  if (edit) redirect(`/app/products/${encodeURIComponent(edit)}`)
  const kind = kindFromParam(type)
  /* A membership is made from the question (its screen needs a draft to open), never by a GET. */
  if (!kind || kind === "membership") return <NewProductKindPage />
  /* A physical product only while the switch in /admin is on; otherwise the question again. */
  if (kind === "physical" && !(await isPhysicalCommerceEnabled())) return <NewProductKindPage />

  const load = await loadProductEditor(null)
  /* No session yet: the app shell's gate (NativeAuthGate) holds the screen
     while it restores one (the native apps keep it outside cookies) and asks
     again, so nothing drawn here is seen. Nothing, then, not an outline. */
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") redirect("/onboarding")
  if (load.state !== "ready") redirect("/app/products")
  return <ProductEditor key={kind} creator={load.creator} loaded={null} startAs={kind} />
}
