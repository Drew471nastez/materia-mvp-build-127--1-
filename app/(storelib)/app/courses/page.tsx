import { redirect } from "next/navigation"

/** A course is a product: it is made and listed with the others (app/app/products). */
export default function CoursesPage() {
  redirect("/app/products")
}
