import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

/** The products are the library's first tab. */
export default function LibraryProductsRedirectPage() {
  redirect("/library")
}
