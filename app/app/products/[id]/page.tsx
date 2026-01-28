import { redirect } from "next/navigation"

interface ProductEditPageProps {
  params: Promise<{ id: string }>
}

export default async function ProductEditPage({ params }: ProductEditPageProps) {
  const { id } = await params
  // Redirect to the new product page with edit query param
  redirect(`/app/products/new?edit=${id}`)
}
