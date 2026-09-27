import "server-only"

/**
 * ===========================================================================
 *  A SELLER DOES NOT REVIEW WHAT A SELLER SELLS
 * ===========================================================================
 * The purchase check on its own does not stop this. A creator can hold an
 * entitlement to their own product — take your own free download and you have
 * one — so "has bought it" was true for the person who wrote it, and the
 * product page carried the seller's own name against five stars.
 *
 * ---------------------------------------------------------------------------
 *  WHAT A SECOND ACCOUNT LOOKS LIKE, AND WHAT IT DOES NOT
 * ---------------------------------------------------------------------------
 * Blocking the signed-in owner is the easy half. The hard half is the same
 * person with a second account, and the honest position is that it cannot be
 * SOLVED, only made expensive. What marketplaces actually do is link accounts
 * by the things that are costly to duplicate — a payout account, a payment
 * instrument, a device, an address — and refuse across the link.
 *
 * Of those, this platform records the ones that cost real money to duplicate:
 *
 *     stripe_account_id      a Stripe Connect account. Identity-verified, one
 *                            per legal entity. Two creator rows sharing one
 *                            are one seller.
 *     paypal_merchant_id     the same argument, for the other processor.
 *     support_email          weaker: self-asserted and changeable. Used only
 *                            against the reviewer's own verified address.
 *
 * WHAT IT DOES NOT RECORD, and what this therefore does not pretend to check:
 * there is no per-account IP or device history. signup_attempts stores a
 * SALTED HASH of an address with no user id beside it, on purpose and for
 * good reasons set out in its own migration, and security_events is scoped to
 * an order. Linking reviewers to sellers by device would mean starting to
 * keep a record of where people connect from, which is a decision about what
 * to store about customers and not one to make inside a bug fix. It is the
 * obvious next signal if the owner wants it.
 *
 * So: a determined person with a separate Stripe account, a separate email
 * and a real card can still leave themselves a review. That is true of every
 * marketplace. What is closed here is every version that costs nothing.
 */

/** Reviews one account may write in an hour, across all products. */
const MAX_REVIEWS_PER_HOUR = 5

export type ReviewBlockCode = "own_product" | "linked_seller" | "too_many"

/**
 * One shape rather than a discriminated union. The union was the tidier type
 * and did not narrow under the test suite's compiler options, which turned
 * every read of `code` into an error at the call site; a flat object with two
 * optional fields costs nothing and reads the same.
 */
export interface ReviewEligibility {
  ok: boolean
  code?: ReviewBlockCode
  message?: string
}

interface Admin {
  from: (table: string) => any
}

interface SellerIdentity {
  userId: string | null
  stripeAccountId: string | null
  paypalMerchantId: string | null
  supportEmail: string | null
}

/**
 * An embedded one-to-one comes back as an object from PostgREST, and as a
 * single-element array from some versions. Reading only one shape means the
 * seller looks like nobody, and every check below then passes. This fails
 * OPEN if it is wrong, which is the wrong direction, so it handles both.
 */
function embedded<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

async function readSeller(admin: Admin, productId: string): Promise<SellerIdentity | null> {
  const { data } = await admin
    .from("products")
    .select("creator:creators!inner(user_id, stripe_account_id, paypal_merchant_id, support_email)")
    .eq("id", productId)
    .maybeSingle()
  const creator = embedded<any>((data as any)?.creator)
  if (!creator) return null
  return {
    userId: creator.user_id ?? null,
    stripeAccountId: creator.stripe_account_id ?? null,
    paypalMerchantId: creator.paypal_merchant_id ?? null,
    supportEmail: creator.support_email ?? null,
  }
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase()

export async function checkReviewEligibility(
  admin: Admin,
  { productId, userId, email }: { productId: string; userId: string; email?: string | null },
): Promise<ReviewEligibility> {
  if (!productId || !userId) {
    return { ok: false, code: "own_product", message: "You cannot review this product" }
  }

  /* The seller, this person's own seller accounts, and how much they have
     written lately. None needs the others, so none waits for them. */
  const [seller, ownCreators, recent] = await Promise.all([
    readSeller(admin, productId),
    admin.from("creators").select("user_id, stripe_account_id, paypal_merchant_id").eq("user_id", userId),
    admin
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("buyer_id", userId)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()),
  ])

  if (!seller) {
    /* No creator row means no product to review. Refusing is the safe way to
       be wrong: the alternative lets an unknown seller through. */
    return { ok: false, code: "own_product", message: "You cannot review this product" }
  }

  if (same(seller.userId, userId)) {
    return { ok: false, code: "own_product", message: "You cannot review your own product" }
  }

  /* Your verified address is the seller's published contact address. */
  if (same(email, seller.supportEmail)) {
    return {
      ok: false,
      code: "linked_seller",
      message: "This account is connected to the seller, so it cannot review their products",
    }
  }

  /*
    A PAYOUT ACCOUNT IS THE EXPENSIVE THING TO DUPLICATE. Stripe Connect
    verifies identity and gives one account per legal entity, so two creator
    rows pointing at one stripe_account_id are one seller with two logins.
    Same reasoning for PayPal's merchant id.
  */
  for (const mine of (ownCreators?.data || []) as any[]) {
    if (same(mine.stripe_account_id, seller.stripeAccountId)) {
      return {
        ok: false,
        code: "linked_seller",
        message: "This account shares a payout account with the seller, so it cannot review their products",
      }
    }
    if (same(mine.paypal_merchant_id, seller.paypalMerchantId)) {
      return {
        ok: false,
        code: "linked_seller",
        message: "This account shares a payout account with the seller, so it cannot review their products",
      }
    }
  }

  /*
    AND A CEILING ON HOW FAST ANYBODY WRITES. A ring of accounts leaving
    reviews for each other is the shape this misses otherwise, and the count
    comes from the reviews table rather than from memory: Vercel runs many
    instances and they share none of it.
  */
  if ((recent?.count ?? 0) >= MAX_REVIEWS_PER_HOUR) {
    return {
      ok: false,
      code: "too_many",
      message: "You have posted several reviews recently. Try again in an hour.",
    }
  }

  return { ok: true }
}

/**
 * A GUEST, FROM THEIR RECEIPT LINK. The receipt token proves the purchase
 * (it is the same credential the downloads take), and there is no account
 * to compare, so this asks the one thing it can: is the address the order
 * was bought with the seller's own published address. Everything else a
 * second account could share is on an account, and a guest has none.
 */
export async function checkGuestReviewEligibility(
  admin: Admin,
  { productId, email }: { productId: string; email?: string | null },
): Promise<ReviewEligibility> {
  if (!productId) return { ok: false, code: "own_product", message: "You cannot review this product" }
  const seller = await readSeller(admin, productId)
  if (!seller) return { ok: false, code: "own_product", message: "You cannot review this product" }
  if (same(email, seller.supportEmail)) {
    return {
      ok: false,
      code: "linked_seller",
      message: "This order was made with the seller's own address, so it cannot review their products",
    }
  }
  return { ok: true }
}
