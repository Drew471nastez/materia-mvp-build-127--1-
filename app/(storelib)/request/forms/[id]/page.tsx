import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { UUID } from "@/lib/forms/actions"
import { validateDefinition } from "@/lib/forms/definition"
import { PublicFormRenderer } from "@/components/forms/public-form"
export const dynamic = "force-dynamic"
export const metadata = {
  title: "Form | Storelib",
  robots: { index: false, follow: false },
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const { data, error } = await createAdminClient()
    .from("native_forms")
    .select("id,revision,published")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle()
  if (error) throw new Error("The form could not be read")
  if (!data?.published) notFound()
  let definition
  try {
    definition = validateDefinition(data.published)
  } catch {
    notFound()
  }
  return (
    <main className="min-h-svh bg-[#f8f9fa] px-4 py-6 text-[#1a1a2e] sm:py-10">
      <div className="mx-auto max-w-lg rounded-2xl border border-[#e5e7eb] bg-white p-5 sm:p-7">
        <PublicFormRenderer
          formId={id}
          initial={{ id, revision: data.revision, definition }}
        />
        <a href="/" className="mt-6 block text-center text-xs text-[#6b7280]">
          Made with Storelib
        </a>
      </div>
    </main>
  )
}
