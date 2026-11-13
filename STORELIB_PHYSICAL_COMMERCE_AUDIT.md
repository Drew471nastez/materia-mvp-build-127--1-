# Storelib physical commerce and shipping audit, round AW (13 November 2026)

Shipping, labels, fulfilment, tracking, returns and stock. The rest of
commerce is in `STORELIB_ECOMMERCE_FINAL_AUDIT.md`.

## Providers, as they really are

| Provider | Listed as | Key checked on connect | What works | Not done |
|---|---|---|---|---|
| Shippo | Available | Yes, `GET /carrier_accounts/` | Address check, live rates, 4x6 PDF label, void and refund, test keys, carrier calculated rates at checkout, customs declaration, commercial invoice, fresh label link on every print | Return labels, insurance, batch labels, Shippo's own tracking webhooks (tracking goes through Courier tracking) |
| EasyPost | Available | Yes, `GET /v2/addresses` | Same as Shippo | Same |
| ShipStation | Available | Yes, `GET /stores` | Orders out on payment, cancels and address changes, shipments read back with the seller's key, timer backstop | See open item 4 |
| AfterShip, 17TRACK | Courier tracking | Yes | Parcels registered, signed webhooks, ten minute sweep, buyer emails | A revoked own-account key is not shown on the card |
| Printful, Printify, Gelato, CJ | Available | Yes | Orders forwarded, tracking back, cancel | A partner's second parcel (open item 2) |
| ShippyPro | Coming soon | Cannot connect | Nothing reachable. The adapter exists and is tested against ShippyPro's OpenAPI document, and is held back until someone runs it with a real key. | |
| Shipfine | Not in the repository | | No file, test, doc, translation, logo or commit mentions it. If a card with that name shows, it comes from production's `integration_catalog` table, where a custom row is always Coming soon. | |

Every store connects its own Shippo or EasyPost key. Keys are sealed with
AES-256-GCM and only the last four characters go back to the browser. No
store's label, rate or shipment is ever made with another store's key: the
audit read every query in the label path for its store filter.

Storelib does not use Shippo's platform accounts. The standard API with each
merchant's own key is the right model here, since the merchant's own carrier
billing pays for each label.

## Shipping modes

| Mode | State |
|---|---|
| Manual | Complete. Flat, free, free over a threshold, by price, by weight, by item weight, by quantity, zones by country and state, pickup, local delivery, manual tracking, any carrier. A store ships without connecting anything. |
| Assisted | Complete. Buy a label: package, weight, live rates, address checked, the buyer's chosen service picked first, the seller confirms. |
| Automatic | Orders go to ShipStation or a print partner by themselves when one is connected. **Labels are never bought automatically.** Nothing in the code buys a paid label without a press, and this round did not add that. |

## Fixed in this round

### A label purchase with no answer (P1)

When Shippo or EasyPost timed out, dropped the connection or answered "still
making it", the purchase was treated as failed and its claim thrown away. The
label could be bought and charged with nothing on the order, and the next
press bought a second one.

Now the provider is asked what became of the shipment before anything is
decided (`findLabel`):

- a label that exists comes onto the order, once, and the items ship with it;
- a purchase still in flight keeps its claim, so nothing else is bought;
- only a shipment the provider says has no label, after two minutes, is
  released to be bought again;
- getting rates again, or buying a different quoted shipment for the same
  order, settles the unfinished purchase first.

The purchase call has its own 30 second deadline (it was 12) and the route
its own 60 second limit.

### Customs for another country (P1)

A product's Shipping section has always asked for country of origin and HS
code "for customs forms". Nothing read them. An international label was
quoted with no declaration.

Now a parcel that crosses a customs border carries one, made from the order:
value paid for each line, its weight as sold, the product's origin and HS
code. Inside one country and inside the EU there is none.

**Nothing is filled in for a form.** A product with no origin, no weight or
no price stops the label with a sentence naming it and where to add it. A US
parcel over $2,500 is refused with the reason (it needs an export filing only
the exporter can make). Duties are declared as the recipient's (DDU), never
billed to the seller's carrier account.

The commercial invoice prints from the order when the provider made one.

### Print label after the link expired (P1)

Shippo's label address expires; its reference says to read the transaction
again for a fresh one. Storelib kept the address from the purchase. Print
label now goes through the order's own route, which reads the label from the
provider each time. During an outage the kept address is used.

### Carrier prices in the wrong unit (P3)

The shipping code kept its own list of currencies with no decimals. It read a
Taiwan dollar 100 times too small, a CFP franc 100 times too large and a
dinar 10 times too small. It now asks the same function the checkout uses.

### From the fulfilment audit

Listed in the other file: one stock hold per option and place, cancelled
orders not sent to partners, "keep it" returns, packing slips, ShipStation's
numbered hosts, ShipStation shipments naming only shipped items, corrected
tracking numbers, the carrier price cache key, the Courier tracking card.

## The test matrix you asked for

| Test | State | Where |
|---|---|---|
| A. Manual shipping | Passing, existed | `e2e-manual-fulfillment`, `physical-shipping-r3` |
| B. Shippo: connect, rates, label, tracking | Passing against Shippo's documented answers. **Not run against a real Shippo test account**: there is no key here. | `shippingapps24`, `labels-fulfil-y4`, `labels-safe-aw` |
| C. Free shipping threshold | Passing, existed. Boundaries checked by the audit. | `physical-shipping-r3` |
| D. Several products, partial, slips | Passing; slip fixes this round | `e2e-bulk-fulfillment`, `order-documents`, `commerce-aw` |
| E. Stock under concurrent buyers | The audit ran the hold on Postgres 16: twelve buyers for one unit, one held, eleven refused. Not a suite in the repository. | |
| F. Return, label, refund, restock | Return, refund and restock pass. **Return labels are not built.** | `physical-commerce` |
| G. International order | New this round | `labels-safe-aw` |
| H. Mixed cart | Passing, existed | `site-checkout-physical` |
| I. Provider timeout, no double label | New this round | `labels-safe-aw` |
| J. Two merchants isolated | Passing: another store's label, order and product are not found | `shippingapps24`, `labels-safe-aw` |
| K. Same product on every surface | Not a suite. The audit's table of where each surface reads price and stock is summarised under open items. | |
| L. Duplicate and late tracking events | Passing, existed | `tracking24` |

## Still open

1. **Return labels.** Not built. Shippo and EasyPost both support them. A
   return carries a carrier and tracking number typed by hand today.
2. **A partner's second parcel is dropped.** The first tracking number from
   Printify, Gelato or Printful ships every open item.
3. **A line refunded before it ships keeps its stock reserved.**
4. **ShipStation's timer backstop stops after three days** when webhooks are
   on; its comment says three weeks.
5. **An own AfterShip or 17TRACK key that is revoked** still reads Installed.
6. **A carrier calculated rate is priced per shipping profile** for the whole
   cart's weight, so two profiles double it.
7. **Label format.** Fixed at 4x6 PDF. There is no A4 or Letter choice.
8. **Insurance and batch label purchase.** Not built.
9. **Shop page stock adds up every location**, while checkout takes one
   location per line. A product with 3 in one place and 2 in another shows 5
   and refuses 4.

## Cost

No polling was added. Print label makes one provider read per press, limited
to 60 a minute per store. A failed label purchase makes one extra read. A
refund email holds its function for about 21 seconds after the response so
that one press sends one email; the ten minute cron is the fallback.

## Verification

Filled in from the final run. See the summary in the session's last message
for the exact figures, which are also below once the run finished.
