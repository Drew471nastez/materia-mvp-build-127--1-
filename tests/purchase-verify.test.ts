/**
 * ===========================================================================
 *  THE BROWSER HOLDS THE RECEIPT, THE SERVER DECIDES WHAT IT IS WORTH
 * ===========================================================================
 * Somebody can buy here without an account, and when they come back the
 * button has to say Download. That worked off localStorage alone — and
 * localStorage was the only thing consulted.
 *
 * Nothing was insecure: /api/download/[assetId] has always verified the
 * receipt token before signing a URL, so a forged entry could never produce
 * a file. What it could do is make the PAGE lie — say Download, then 403.
 *
 * /api/purchases/verify is the answer the page asks for now. This suite
 * guards the two things that make it safe rather than merely useful:
 *
 *   A TOKEN ANSWERS ONE QUESTION. It is proof of one purchase, so it must
 *   never report on a product it was not issued for — otherwise one receipt
 *   becomes a key for sweeping the catalogue.
 *
 *   IT RETURNS NO PERSON. No email, no name, no buyer id, no order id. A
 *   bearer token in a URL somebody forwarded must not hand over who bought.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? ` — ${detail}` : ""))
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const route = read("app/api/purchases/verify/route.ts")
const hook = read("components/checkout/use-purchase-status.tsx")

function main() {
  console.log("\nThe browser holds the receipt, the server decides what it is worth")

  /* ---------------------------------------------------------------------
     A TOKEN ANSWERS ONE QUESTION
     --------------------------------------------------------------------- */
  console.log("\n  a token answers one question")

  check(
    "a token is only honoured for the product it was issued for",
    /if \(!order \|\| order\.product_id !== productId\) \{[\s\S]{0,80}staleTokens\.push\(token\)/.test(route),
  )
  check("the caller has to name the product", /typeof productId !== "string"[\s\S]{0,120}status: 400/.test(route))
  check("and a flood of tokens is capped", /const MAX_TOKENS = 10/.test(route) && /\.slice\(0, MAX_TOKENS\)/.test(route))
  check("with junk filtered before any query", /typeof t === "string" && t\.length > 0 && t\.length <= 128/.test(route))

  /* ---------------------------------------------------------------------
     IT RETURNS NO PERSON
     --------------------------------------------------------------------- */
  console.log("\n  it returns no person")

  /*
    The order row carries buyer_email and buyer_id. A receipt link gets
    forwarded, pasted into chats, left in browser history — whoever holds it
    must learn what it unlocks and nothing about who bought it.
  */
  for (const field of ["buyer_email", "buyer_name", "customer_details"]) {
    check(`${field} is never selected`, !new RegExp(field).test(route))
  }
  const responses = route.match(/NextResponse\.json\(\{[\s\S]*?\}\)/g) || []
  check("no response mentions a buyer", !responses.some((r) => /buyer|email|name/.test(r)))
  check("orders are read by token, and only three columns come back", /\.select\("receipt_token, product_id, variant_id, status"\)/.test(route))

  /* ---------------------------------------------------------------------
     WHAT IT ACTUALLY ANSWERS
     --------------------------------------------------------------------- */
  console.log("\n  what it answers")

  check("a signed-in buyer's entitlements count", /\.from\("entitlements"\)[\s\S]{0,200}\.eq\("buyer_id", user\.id\)/.test(route))
  check("and their completed orders too", /\.from\("orders"\)[\s\S]{0,260}\.eq\("status", "completed"\)/.test(route))
  check("a guest with a valid receipt counts", /validTokens\.push\(token\)\s*\n\s*hasPurchased = true/.test(route))
  check("no session is not an error", /A guest is the case this is for|No session is not an error/.test(route))

  /*
    A product with variants hands over only the files of the variants bought
    — but an EMPTY mapping means the product does not restrict files, not
    that nothing is allowed. Getting that backwards takes downloads away from
    buyers whose products never used the table.
  */
  check("variant files are filtered", /const allowed = new Set\(\(variantFiles \?\? \[\]\)/.test(route))
  check("and an empty mapping means unrestricted, not forbidden", /if \(allowed\.size > 0\) assets = assets\.filter/.test(route))

  /* ---------------------------------------------------------------------
     THE HOOK TREATS STORAGE AS A HINT
     --------------------------------------------------------------------- */
  console.log("\n  the hook treats storage as a hint")

  check("it asks the server", /fetch\("\/api\/purchases\/verify"/.test(hook))
  check("and takes the server's answer for the state", /setHasPurchased\(!!data\.hasPurchased\)/.test(hook))
  check("including which variants, not the stored list", /setPurchasedVariantIds\(Array\.isArray\(data\.variantIds\)/.test(hook))
  /* A token the server does not know is dropped, so the next visit does not
     ask again and the button stops offering what is not there. */
  check("a token the server rejects is deleted", /data\.staleTokens\.includes\(purchases\[productId\]\?\.receiptToken\)/.test(hook))
  /*
    OFFLINE MUST NOT LOG SOMEBODY OUT OF THEIR OWN PURCHASE. The optimistic
    state stands when the request fails; the download route is what
    authorises the file either way.
  */
  check("a failed request leaves the optimistic state alone", /OFFLINE, OR THE ENDPOINT IS DOWN/.test(hook))
  check("and the optimistic read still runs first", hook.indexOf("localStorage path") < hook.indexOf("/api/purchases/verify"))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
