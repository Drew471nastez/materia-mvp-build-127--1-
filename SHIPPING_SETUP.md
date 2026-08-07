# Shipping (eAWB / Europarcel) — what is built, and what you must do

Locker-to-locker parcel delivery in Romania, Vinted-style: the buyer picks an
easybox, the seller prints a label and drops the parcel off, and both sides
watch the same timeline.

Nothing in this document is optional if you want a real parcel to move. The code
is deployed and safe to run **before** any of it is done — shipping simply does
not appear until the database and the credentials are in place.

---

## 1. Run the SQL — REQUIRED

Open the Supabase SQL editor and run:

```
supabase/sql/RUN_SHIPPING.sql
```

It is additive and safe to run more than once: every column is new and nullable,
nothing is renamed or dropped, and orders that predate shipping read exactly as
they did.

**Until this runs**, every shipping read recognises the missing columns and
renders nothing. The orders pages keep working; there is just no shipping
section. That is deliberate — a 500 on someone's order history would be a much
worse answer than a page without a delivery panel.

The last statement is `notify pgrst, 'reload schema'`. Without it PostgREST keeps
answering from its cached schema and reports `Could not find the 'awb_number'
column` for a column that now exists.

---

## 2. Environment variables

Set these in Vercel → Project → Settings → Environment Variables.

### Required — the credential

| Name | Value | Notes |
|---|---|---|
| `EAWB_API_KEY` | your eAWB key | **Server-side secret.** Mark it Sensitive. Never rename it to `NEXT_PUBLIC_*`. |

The key is used only from server code. It is never sent to a browser and never
logged — not in an error message, not in a thrown value.

### Required — who is sending

The platform ships everything from one account for now. These describe the
sender that appears on every label.

| Name | Example | Notes |
|---|---|---|
| `EAWB_BILLING_ADDRESS_ID` | `391214` | Verified present on this account. |
| `EAWB_SENDER_LOCKER_ID` | *(an easybox id)* | The locker the seller drops parcels into. Must accept drop-offs. |
| `EAWB_SENDER_CONTACT` | `Storelib` | |
| `EAWB_SENDER_PHONE` | `07…` | |
| `EAWB_SENDER_EMAIL` | | |
| `EAWB_SENDER_COUNTY` | `Bucuresti` | |
| `EAWB_SENDER_LOCALITY` | `Bucuresti` | |
| `EAWB_SENDER_STREET` | `Str. Sergent Pechiu Ion` | The locker's own street. |
| `EAWB_SENDER_STREET_NO` | `3-7` | |

> **The street fields are not redundant.** `fixed_location_id` *supplements* an
> address, it never replaces one. Sending only the locker id fails validation
> with `The street_name field is required when address ID is not provided`. Put
> the locker's own street in these fields.

To find a locker id, use the search the app already exposes:

```
/api/shipping/lockers?county=Bucuresti&dropOff=1&carrier=6
```

### Optional — behaviour

| Name | Default | Notes |
|---|---|---|
| `SHIPPING_AUTO_AWB` | *(off)* | `1` books the courier automatically the moment a buyer chooses their locker. **Leave off until step 4 has succeeded once.** |
| `EAWB_DEFAULT_CARRIER_ID` | `6` (Sameday) | |
| `EAWB_DEFAULT_SERVICE_ID` | `4` (locker→locker) | `1` is door-to-door if a buyer has no locker nearby. |
| `EAWB_DEFAULT_WEIGHT_KG` | `1` | |
| `STORELIB_ADMIN_KEY` | | Shared secret for the privileged `/api/shipping/create` path. |

---

## 3. Fund the wallet — REQUIRED

The account currently answers `404 Wallet not found for this customer`.

Every AWB spends from a prepaid balance. Until there is one, booking fails with
a provider error — the order stays paid, is marked `shipping_creation_failed`,
and can be retried once the wallet exists. Nothing is charged twice and nothing
needs to be refunded.

---

## 4. Create one AWB by hand, and look at it

**Do this before switching `SHIPPING_AUTO_AWB` on.**

Go to `/admin/shipping-test` (admin session required — the page 404s otherwise).

1. **Testează conexiunea** — reads the account. Costs nothing.
2. **Calculează preț** — runs the *same validations on the same request body* as
   a real booking, and returns a price. Costs nothing, creates nothing.
3. **Creează AWB** — books a real courier and spends real money. Requires typing
   `CREATE REAL SHIPMENT` first, because the provider has no idempotency key and
   two presses are two shipments.

Then press **Etichetă** and **Urmărire** with the AWB it returns, and confirm the
label is a real printable PDF and tracking answers.

The page is prefilled with a combination **verified against the live API**:

```
Sameday locker→locker
  easybox 66725   Bucuresti, Str. Sergent Pechiu Ion 3-7
→ easybox 2210235 Cluj-Napoca, Str. Eugen Ionesco 73
= 19.89 RON, HTTP 200, label_print_required: true
```

so a failure there is information about what you changed, not about the defaults.

Only once you have watched a label come out correctly should you set
`SHIPPING_AUTO_AWB=1`.

---

## How the flow works once it is on

**Buyer** — opens their order from *Achizițiile mele* → searches for an easybox →
confirms name and phone → done. The courier texts them the pickup code.

**Seller** — opens the sale from *Vânzările mele* → presses **Generează eticheta**
(or the label is already there, if auto-AWB is on) → prints it → drops the parcel
at any easybox that accepts drop-offs.

**Both** — see the same five-step timeline: confirmed → AWB generated → handed
over → in transit → delivered.

---

## Things that are deliberately not built yet

Being explicit so these are decisions rather than surprises.

- **Shipping cost is not added to the checkout total.** The buyer chooses their
  locker *after* paying, on the order page. Moving it before payment means
  touching the 2,300-line payment client, and pricing the parcel before the
  destination is known. Today the platform absorbs the ~20 RON.
- **Every parcel ships from one platform locker.** `EAWB_SENDER_*` describes a
  single sender. Per-seller drop-off lockers need a profile field and a picker in
  the seller's settings — the function to change is `senderAddress()` in
  `lib/shipping/create-awb.ts`, and it is the only place that decides.
- **No tracking webhook.** Status refreshes when someone opens the order page, at
  most once every 10 minutes per order, rate-limited in the database. A push
  subscription from the courier would be better and needs their side configured.
- **The tracking payload's shape is unverified.** There has been no shipment to
  track, so `extractLatestStatus` walks the JSON for status-ish keys rather than
  indexing a guessed path — a guessed path fails silently forever and looks
  exactly like a parcel that has not moved. Once a real tracking response exists,
  it is worth reading and tightening.
- **Returns are recognised but not orchestrated.** A `returned` status displays
  correctly; there is no return-label flow.

---

## Security notes

- The eAWB key is server-only and never logged.
- All AWB creation goes through **one** function, `createAwbForOrder` in
  `lib/shipping/create-awb.ts` — asserted by a test, because a second call site
  could book a courier without passing the idempotency guards.
- Idempotency is three layers: a read-first check, a conditional claim that two
  concurrent callers cannot both win, and a partial unique index on `awb_number`
  that application code cannot race.
- The courier's label URL is a bearer link and never reaches a browser. The PDF
  is streamed through `/api/shipping/label/<orderId>`, which re-checks that the
  caller is still the seller on every download.
- The locker search is public; it returns the same list couriers publish on their
  own websites and carries nothing about our account, orders or customers.
- A buyer sends a locker **id**, never an address — the server looks the address
  up from the provider's own list, so a request cannot pair one city's locker
  with another city's street.

Run `npm run test:push` to check all of the above; `tests/shipping-flow.test.ts`
asserts each one.
