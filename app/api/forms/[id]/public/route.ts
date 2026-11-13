import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { UUID } from "@/lib/forms/actions"
import { validateDefinition, publicDefinition } from "@/lib/forms/definition"
import { PUBLIC_HEADERS, formError, formsKnownMissing, logFormsError, noteFormsTables } from "@/lib/forms/server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { productPriceCurrency } from "@/lib/money/product-currency"
import { formatStoreMoney } from "@/lib/store/currency"
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
  /* No forms tables on this store: the form is simply not available, never a "try again" a visitor can not fix. */
  if (formsKnownMissing())
    return NextResponse.json({ error: "This form is not available.", code: "forms_missing" }, { status: 404, headers: PUBLIC_HEADERS })
  const { data, error } = await createAdminClient()
    .from("native_forms")
    .select("id,owner_id,published,revision")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle()
  if (noteFormsTables(error))
    return NextResponse.json({ error: "This form is not available.", code: "forms_missing" }, { status: 404, headers: PUBLIC_HEADERS })
  if (error) logFormsError("public read", error)
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
    const definition = validateDefinition(data.published)
    return NextResponse.json(
      {
        form: {
          id: data.id,
          revision: data.revision,
          definition: publicDefinition(definition),
          price: definition.booking?.payment_product_id ? await bookingPrice(definition.booking.payment_product_id, data.owner_id).catch(() => null) : null,
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

/**
 * A paid booking's price, as its product's checkout charges it: the product's own currency (lib/money/product-currency).
 * Only for a product of the store that owns the form. The form's definition only checks that the id is an id, so a form
 * could name anybody's product, a draft included, and this public answer gave out its price.
 */
async function bookingPrice(productId: string, formOwnerId: string | null): Promise<string | null> {
  if (!formOwnerId) return null
  const db = createAdminClient()
  const { data } = await db.from("products").select("creator_id,type,price_cents").eq("id", productId).maybeSingle()
  if (!data || typeof data.price_cents !== "number" || data.price_cents <= 0) return null
  const { data: own } = await db.from("creators").select("id").eq("id", data.creator_id).eq("user_id", formOwnerId).maybeSingle()
  if (!own) return null
  const store = await readStoreCurrency(db, data.creator_id)
  return formatStoreMoney(data.price_cents, productPriceCurrency(data, store.currency))
}
