import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { UUID } from "@/lib/forms/actions"
import { validateDefinition } from "@/lib/forms/definition"
import { PUBLIC_HEADERS, formError } from "@/lib/forms/server"
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: PUBLIC_HEADERS })
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!UUID.test(id))
    return formError(new Error("Form not found."), 404, PUBLIC_HEADERS)
  const { data, error } = await createAdminClient()
    .from("native_forms")
    .select("id,published,revision")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle()
  if (error)
    return formError(
      new Error("This form could not be loaded. Try again."),
      503,
      PUBLIC_HEADERS,
    )
  if (!data?.published)
    return formError(
      new Error("This form is not available."),
      404,
      PUBLIC_HEADERS,
    )
  try {
    return NextResponse.json(
      {
        form: {
          id: data.id,
          revision: data.revision,
          definition: validateDefinition(data.published),
        },
      },
      { headers: PUBLIC_HEADERS },
    )
  } catch {
    return formError(
      new Error("This form is not available."),
      404,
      PUBLIC_HEADERS,
    )
  }
}
