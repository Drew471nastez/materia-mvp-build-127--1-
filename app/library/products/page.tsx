import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default function LibraryProductsRedirectPage() {
  redirect("/library/my-downloads")
}
