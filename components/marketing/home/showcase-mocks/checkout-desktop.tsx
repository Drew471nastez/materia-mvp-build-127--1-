import { u } from "./frame"

/*
  STORELIB'S CHECKOUT ON A COMPUTER, AS IT IS DRAWN.
  A website's checkout (app/(storelib)/checkout/site/site-checkout.tsx, laid
  out exactly as the Explore checkout, checkout-client.tsx) at a desktop
  width: the shop's bar across the top (parts/shop-bar.tsx: Back, the shop,
  Continue shopping), the order on the left on #f8f9fa ("Pay <shop>", the big
  total, each line with its picture, the - / + and Remove, Subtotal, "Add
  promotion code", Shipping, Tax, Total due), and paying on the right, white,
  over the grey on a soft shadow (parts/stripe-pay.tsx: Apple Pay and Google
  Pay as black express buttons, OR, Contact information, the news box, the
  name, Delivery, Shipping method, Payment method with the card, the Terms
  box, Pay, Powered by Stripe). Paid, the white "Payment complete" screen
  (parts/success.tsx PaidOverlay). Same labels, sizes and colours; the shop,
  the buyer and the prices are examples.

  Drawn at a design width of 880 in `u` (showcase-mocks/frame.tsx): crisp at
  any size, nothing measured. The motion lives in the section's stylesheet,
  transform and opacity only.
*/

const IMG = "/home/commerce"

type Line = { id: string; img: string; title: string; option?: string; price: string; physical: boolean }

const CART: Line[] = [
  { id: "tee", img: `${IMG}/product-tee.webp`, title: "Studio tee", option: "Black / M", price: "$32.00", physical: true },
  { id: "cap", img: `${IMG}/float-cap.webp`, title: "Washed cap", option: "Grey", price: "$26.00", physical: true },
  { id: "presets", img: `${IMG}/golden-cover.webp`, title: "Golden Hour presets", price: "$19.00", physical: false },
]
/* $32.00 + $26.00 + $19.00 = $77.00; + $6.00 shipping + $5.36 tax = $88.36. */
const ONE: Line[] = [CART[2]]

export function AppleMark() {
  return (
    <svg viewBox="0 0 17 20" width="0.95em" height="1.12em" fill="currentColor">
      <path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.8 1.3 10.3.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.2zM11.6 3c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z" />
    </svg>
  )
}

export function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="1.1em" height="1.1em">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1C3.3 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  )
}

export function Cursor({ className }: { className: string }) {
  return (
    <span className={`cmv-cursor ${className}`}>
      <svg viewBox="0 0 20 24" width="1.25em" height="1.5em">
        <path d="M2 1.5v18.2l4.7-4.4 3 6.9 3.2-1.4-3-6.8h6.5L2 1.5Z" fill="#111" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

/** A field as the checkout draws one: the label above, the box, the placeholder until it is filled. */
function Field({ label, value, ph, k, select = false }: { label?: string; value: string; ph?: string; k: string; select?: boolean }) {
  return (
    <div className="cdx-f">
      {label ? <span className="cdx-lbl">{label}</span> : null}
      <span className="cdx-in" data-select={select || undefined}>
        {ph ? <span className={`cdx-ph cdx-ph-${k}`}>{ph}</span> : null}
        <span className={`cdx-v cdx-v-${k}`}>{value}</span>
        {select ? (
          <svg className="cdx-chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 4.5 3 3 3-3" />
          </svg>
        ) : null}
      </span>
    </div>
  )
}

function Check({ k }: { k: string }) {
  return (
    <span className={`cdx-box cdx-box-${k}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  )
}

/**
 * card    a cart with things to ship: the buyer fills the form, the page
 *         scrolls to the card, Pay, paid.
 * wallet  one download: Google Pay pressed at the top, paid.
 */
export function CheckoutDesktop({ mode }: { mode: "card" | "wallet" }) {
  const lines = mode === "card" ? CART : ONE
  const ships = mode === "card"
  const total = ships ? "$88.36" : "$19.00"
  return (
    <div className="cdx" data-mode={mode}>
      <div className="cdx-win">
        <div className="cdx-bar">
          <span className="cdx-lights">
            <i />
            <i />
            <i />
          </span>
          <span className="cdx-url">
            <svg viewBox="0 0 12 14" fill="currentColor">
              <path d="M3 6V4.2a3 3 0 0 1 6 0V6h.6c.8 0 1.4.6 1.4 1.4v4.8c0 .8-.6 1.4-1.4 1.4H2.4c-.8 0-1.4-.6-1.4-1.4V7.4C1 6.6 1.6 6 2.4 6H3Zm1.5 0h3V4.2a1.5 1.5 0 0 0-3 0V6Z" />
            </svg>
            mayaellis.storelib.com/checkout
          </span>
        </div>
        <div className="cdx-view">
          <span className="cdx-white" />
          <div className="cdx-scroll">
            <div className="cdx-head">
              <span className="cdx-back">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </span>
              <img className="cdx-av" src={`${IMG}/creator-maya.webp`} alt="" loading="lazy" decoding="async" width={56} height={56} />
              <span className="cdx-shop">Maya Ellis Studio</span>
              <span className="cdx-cont">Continue shopping</span>
            </div>
            <div className="cdx-grid">
              <div className="cdx-sum">
                <div className="cdx-sum-in">
                  <div className="cdx-payto">Pay Maya Ellis Studio</div>
                  <div className="cdx-big">
                    {ships ? <span className="cdx-t0">$77.00</span> : null}
                    <span className="cdx-t1">{total}</span>
                  </div>
                  <ul className="cdx-lines">
                    {lines.map((l) => (
                      <li key={l.id}>
                        <span className="cdx-thumb" data-cut={l.id === "cap" || undefined}>
                          <img src={l.img} alt="" loading="lazy" decoding="async" width={96} height={96} />
                        </span>
                        <span className="cdx-li">
                          <b>{l.title}</b>
                          {l.option ? <small>{l.option}</small> : null}
                          <span className="cdx-ctl">
                            {l.physical ? (
                              <span className="cdx-step">
                                <i>−</i>
                                <em>1</em>
                                <i>+</i>
                              </span>
                            ) : null}
                            <u>Remove</u>
                          </span>
                        </span>
                        <span className="cdx-lp">{l.price}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="cdx-tot">
                    <div className="cdx-row cdx-strong">
                      <span>Subtotal</span>
                      <span>{ships ? "$77.00" : "$19.00"}</span>
                    </div>
                    <span className="cdx-promo">Add promotion code</span>
                    {ships ? (
                      <>
                        <div className="cdx-row">
                          <span>Shipping</span>
                          <span className="cdx-swap">
                            <span className="cdx-s0">Enter your address</span>
                            <span className="cdx-s1">$6.00</span>
                          </span>
                        </div>
                        <div className="cdx-row cdx-tax">
                          <span>Tax</span>
                          <span>$5.36</span>
                        </div>
                      </>
                    ) : null}
                    <div className="cdx-row cdx-due">
                      <span>Total due</span>
                      <span className="cdx-swap">
                        {ships ? <span className="cdx-t0">$77.00</span> : null}
                        <span className="cdx-t1">{total}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="cdx-form">
                <div className="cdx-express">
                  <span className="cdx-xp">
                    <AppleMark />
                    Pay
                  </span>
                  <span className="cdx-xp cdx-gp">
                    <GoogleMark />
                    Pay
                    {mode === "wallet" ? <Cursor className="cdx-cur" /> : null}
                  </span>
                </div>
                <div className="cdx-or">
                  <i />
                  OR
                  <i />
                </div>
                <div className="cdx-h">Contact information</div>
                <Field value="sam.rivera@mail.com" ph="you@example.com" k="email" />
                <div className="cdx-check">
                  <Check k="news" />
                  Email me with news and offers
                </div>
                <div className="cdx-2">
                  <Field label="First name" value="Sam" ph="Jane" k="first" />
                  <Field label="Last name" value="Rivera" ph="Smith" k="last" />
                </div>
                {ships ? (
                  <>
                    <div className="cdx-h cdx-gap">Delivery</div>
                    <Field label="Country/region" value="United States" k="country" select />
                    <Field label="Address" value="214 Mercer Street" ph="" k="addr" />
                    <div className="cdx-3">
                      <Field label="City" value="New York" k="city" />
                      <Field label="State" value="New York" k="state" select />
                      <Field label="ZIP code" value="10012" k="zip" />
                    </div>
                    <div className="cdx-h cdx-gap">Shipping method</div>
                    <div className="cdx-ship">
                      <div className="cdx-opt" data-sel="">
                        <span className="cdx-radio">
                          <i />
                        </span>
                        <span className="cdx-opt-t">
                          <b>Standard shipping</b>
                          <small>3 to 5 business days</small>
                        </span>
                        <b>$6.00</b>
                      </div>
                      <div className="cdx-opt">
                        <span className="cdx-radio" />
                        <span className="cdx-opt-t">
                          <b>Express</b>
                          <small>1 to 2 business days</small>
                        </span>
                        <b>$14.00</b>
                      </div>
                    </div>
                  </>
                ) : null}
                <div className="cdx-h cdx-gap">Payment method</div>
                <div className="cdx-acc">
                  <div className="cdx-acc-h">
                    <span className="cdx-radio">
                      <i />
                    </span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <rect x="2.75" y="5.25" width="18.5" height="13.5" rx="2.25" />
                      <path d="M2.75 9.5h18.5M6.5 15h3" strokeLinecap="round" />
                    </svg>
                    Card
                  </div>
                  <Field label="Card number" value="4242 4242 4242 4242" ph="1234 1234 1234 1234" k="card" />
                  <div className="cdx-2">
                    <Field label="Expiration date" value="08 / 29" ph="MM / YY" k="exp" />
                    <Field label="Security code" value="314" ph="CVC" k="cvc" />
                  </div>
                </div>
                <div className="cdx-check cdx-terms">
                  <Check k="terms" />
                  <span>
                    I agree to the <u>Terms and Conditions</u> and the <u>Refund policy</u>
                  </span>
                </div>
                <span className="cdx-pay">
                  Pay {total}
                  {mode === "card" ? <Cursor className="cdx-cur" /> : null}
                </span>
                <div className="cdx-pow">Powered by Stripe · Terms · Privacy</div>
              </div>
            </div>
          </div>
          <div className="cdx-paid">
            <span className="cdx-ring">
              <svg viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="29" fill="none" stroke="#1a1a2e" strokeWidth="3" />
                <path d="M20 33.5l8 8 16-17" fill="none" stroke="#1a1a2e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <b>Payment complete</b>
            <small>{total} paid. Taking you back to mayaellis.storelib.com</small>
            <small>Your receipt is in your email.</small>
          </div>
        </div>
      </div>
    </div>
  )
}

/*
  The picture, at rest: the form filled, the shipping chosen, the top of the
  page in view. This is what reduced motion and a panel not yet shown draw.
*/
const BASE = u(`
.cdx{position:absolute;left:3.5%;right:3.5%;top:5%;container-type:inline-size;--pt:200}
.cdx-win{--u:calc(100cqw / 880);position:relative;height:1100u;border-radius:12u 12u 0 0;overflow:hidden;background:#fff;color:#1a1a2e;font-size:14u;line-height:1.4;letter-spacing:0;box-shadow:0 0 0 1px rgba(255,255,255,.14),0 24u 60u rgba(0,0,0,.5)}
.cdx-bar{position:relative;display:flex;align-items:center;justify-content:center;height:38u;background:#ececef;border-bottom:1px solid #dcdce0}
.cdx-lights{position:absolute;left:16u;top:50%;display:flex;gap:8u;transform:translateY(-50%)}
.cdx-lights i{display:block;width:12u;height:12u;border-radius:50%;background:#ff5f57}
.cdx-lights i+i{background:#febc2e}
.cdx-lights i+i+i{background:#28c840}
.cdx-url{display:flex;align-items:center;justify-content:center;gap:7u;width:400u;height:26u;border-radius:8u;background:#fff;font-size:12.5u;color:#4b5563}
.cdx-url svg{width:10u;height:12u;color:#6b7280}
.cdx-view{position:relative;height:calc(100% - 38u);overflow:hidden;background:#f8f9fa}
.cdx-white{position:absolute;top:0;bottom:0;right:0;width:50%;background:#fff;box-shadow:-8u 0 24u -14u rgba(17,24,39,.11)}
.cdx-scroll{position:relative}
.cdx-head{position:relative;z-index:1;display:flex;align-items:center;gap:8u;height:62u;padding:0 40u 0 36u;background:#fff;box-shadow:0 1px 0 rgba(17,17,19,.055),0 4u 12u -10u rgba(17,17,19,.09)}
.cdx-back{display:grid;place-items:center;width:34u;height:34u;margin-right:4u;border-radius:10u;border:1px solid rgba(0,0,0,.06);box-shadow:0 1px 1px rgba(17,17,19,.04),0 1px 3px -1px rgba(17,17,19,.06)}
.cdx-back svg{width:17u;height:17u}
.cdx-av{width:28u;height:28u;border-radius:50%;object-fit:cover;box-shadow:0 0 0 1px rgba(17,17,19,.06)}
.cdx-shop{font-size:14u;font-weight:500}
.cdx-cont{margin-left:auto;display:inline-flex;align-items:center;height:34u;padding:0 13u;border-radius:9u;border:1px solid #e1e3e7;font-size:13u;font-weight:500;box-shadow:0 1px 1px rgba(17,17,19,.04)}
.cdx-grid{display:grid;grid-template-columns:1fr 1fr}
.cdx-sum{padding:44u 44u 0}
.cdx-form{position:relative;padding:44u 44u 60u}
.cdx-payto{font-size:15u;font-weight:500;color:#6b7280}
.cdx-big{display:grid;margin-top:4u;font-size:34u;font-weight:600;line-height:1.2;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.cdx-big>*,.cdx-swap>*{grid-area:1/1}
.cdx-swap{display:inline-grid;justify-items:end}
.cdx-t0,.cdx-s0{opacity:0}
.cdx-lines{display:grid;gap:18u;margin:36u 0 0;padding:0;list-style:none}
.cdx-lines li{display:flex;align-items:flex-start;gap:14u}
.cdx-thumb{position:relative;flex:none;width:48u;height:48u;overflow:hidden;border-radius:8u;border:1px solid rgba(0,0,0,.06);background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.cdx-thumb img{width:100%;height:100%;object-fit:cover}
.cdx-thumb[data-cut] img{object-fit:contain;padding:4u}
.cdx-li{flex:1;min-width:0;display:flex;flex-direction:column}
.cdx-li b{font-size:14u;font-weight:500;line-height:1.35}
.cdx-li small{margin-top:2u;font-size:13u;color:#6b7280}
.cdx-ctl{display:flex;align-items:center;gap:12u;margin-top:8u;font-size:13u;color:#6b7280}
.cdx-ctl u{text-decoration-color:#d9dce1;text-underline-offset:2u}
.cdx-step{display:inline-flex;align-items:center;height:28u;border-radius:8u;border:1px solid #e1e3e7;box-shadow:0 1px 1px rgba(0,0,0,.03)}
.cdx-step i{width:26u;text-align:center;font-style:normal;color:#4b5563}
.cdx-step em{min-width:20u;text-align:center;font-style:normal;font-weight:500;color:#1a1a2e;font-size:13u}
.cdx-lp{font-weight:500;font-variant-numeric:tabular-nums}
.cdx-tot{margin-top:24u;padding-top:20u;border-top:1px solid rgba(0,0,0,.07)}
.cdx-row{display:flex;justify-content:space-between;gap:16u;margin-top:12u;color:#6b7280;font-variant-numeric:tabular-nums}
.cdx-strong{margin-top:0;font-weight:500;color:#1a1a2e}
.cdx-promo{display:inline-flex;align-items:center;height:30u;margin:12u 0 2u;padding:0 12u;border-radius:6u;background:#e9ebee;font-size:13u;font-weight:500;color:#1a1a2e}
.cdx-due{margin-top:18u;padding-top:16u;border-top:1px solid rgba(0,0,0,.07);font-size:15u;font-weight:600;color:#1a1a2e}
.cdx-express{display:grid;grid-template-columns:1fr 1fr;gap:10u}
.cdx-xp{position:relative;display:flex;align-items:center;justify-content:center;gap:3u;height:44u;border-radius:8u;background:#000;color:#fff;font-size:18u;font-weight:500;letter-spacing:-.01em}
.cdx-xp svg{font-size:17u}
.cdx-or{display:flex;align-items:center;gap:12u;margin:22u 0;font-size:13u;color:#6b7280}
.cdx-or i{flex:1;height:1px;background:#e5e7eb}
.cdx-h{margin-bottom:12u;font-size:16u;font-weight:600}
.cdx-gap{margin-top:30u}
.cdx-f{display:flex;flex-direction:column;min-width:0}
.cdx-f+.cdx-f,.cdx-f+div,div+.cdx-f{margin-top:12u}
.cdx-2>.cdx-f,.cdx-3>.cdx-f{margin-top:0}
.cdx-lbl{margin-bottom:6u;font-size:13u;font-weight:500;color:#4b5563}
.cdx-in{position:relative;display:grid;align-items:center;height:42u;padding:0 14u;border-radius:8u;border:1px solid #e1e3e7;background:#fff;font-size:15u;box-shadow:0 1px 1px rgba(0,0,0,.03),0 3u 6u rgba(0,0,0,.02);white-space:nowrap;overflow:hidden}
.cdx-in>span{grid-area:1/1}
.cdx-ph{color:#a2a7b0;opacity:0}
.cdx-in[data-select]{padding-right:30u}
.cdx-in>span{overflow:hidden;text-overflow:ellipsis}
.cdx-chev{position:absolute;right:12u;top:50%;width:13u;height:13u;margin-top:-6.5u;color:#6b7280}
.cdx-check{display:flex;align-items:flex-start;gap:10u;margin:14u 0;font-size:14u;color:#4b5563}
.cdx-box{position:relative;flex:none;display:grid;place-items:center;width:18u;height:18u;margin-top:1u;border-radius:5u;border:1px solid #c9ccd2;background:#fff}
.cdx-box svg{width:12u;height:12u;color:#fff;opacity:0}
.cdx-box::after{content:"";position:absolute;inset:-1px;border-radius:5u;background:#1a1a2e;opacity:0}
.cdx-box svg{position:relative;z-index:1}
.cdx-box-terms::after,.cdx-box-terms svg{opacity:1}
.cdx-2{display:grid;grid-template-columns:1fr 1fr;gap:12u}
.cdx-3{display:grid;grid-template-columns:1.1fr 1.1fr .8fr;gap:12u;margin-top:12u}
.cdx-ship{overflow:hidden;border-radius:8u;border:1px solid #e1e3e7;box-shadow:0 1px 1px rgba(0,0,0,.03),0 3u 6u rgba(0,0,0,.02)}
.cdx-opt{display:flex;align-items:center;gap:12u;padding:12u 14u;font-variant-numeric:tabular-nums}
.cdx-opt+.cdx-opt{border-top:1px solid #e1e3e7}
.cdx-opt[data-sel]{background:#f8f9fa}
.cdx-opt-t{flex:1;display:flex;flex-direction:column}
.cdx-opt b{font-weight:500}
.cdx-opt small{font-size:13u;color:#6b7280}
.cdx-radio{position:relative;flex:none;display:grid;place-items:center;width:16u;height:16u;border-radius:50%;border:1px solid #c9ccd2;background:#fff}
.cdx-radio i{width:8u;height:8u;border-radius:50%;background:#1a1a2e}
.cdx-opt[data-sel] .cdx-radio,.cdx-acc-h .cdx-radio{border-color:#1a1a2e}
.cdx-acc{padding:14u 16u 16u;border-radius:8u;border:1px solid #e1e3e7;box-shadow:0 1px 1px rgba(0,0,0,.03),0 3u 6u rgba(0,0,0,.02)}
.cdx-acc-h{display:flex;align-items:center;gap:10u;margin-bottom:14u;font-weight:500}
.cdx-acc-h svg{width:20u;height:20u;color:#6b7280}
.cdx-terms{margin:22u 0 0}
.cdx-terms u{color:#1a1a2e;font-weight:500;text-decoration-color:#c9ccd2;text-underline-offset:2u}
.cdx-pay{position:relative;display:flex;align-items:center;justify-content:center;height:48u;margin-top:20u;border-radius:8u;background:#1a1a2e;color:#fff;font-size:16u;font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 1px 1px rgba(0,0,0,.12),0 3u 8u -2u rgba(26,26,46,.35)}
.cdx-pow{margin-top:14u;text-align:center;font-size:12.5u;color:#8b919a}
.cdx-paid{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:calc(var(--pt) * 1u);text-align:center;background:rgba(255,255,255,.94);opacity:0;pointer-events:none}
.cdx-ring{display:block;width:64u;height:64u}
.cdx-ring svg{display:block;width:100%;height:100%}
.cdx-paid b{margin-top:20u;font-size:20u;font-weight:600;letter-spacing:-.01em}
.cdx-paid small{margin-top:4u;font-size:14u;color:#6b7280}
.cdx-paid small+small{font-size:13u}
.cdx .cmv-cursor{left:62%;top:58%;font-size:22u}
@container (max-width:560px){
  .cdx{left:auto;right:4%;width:150%;--pt:70}
  .cdx-paid{padding-left:31%}
}
`)

/*
  The motion, once each time the panel is shown, ending paid. Every frame is
  transform or opacity. --s1 and --s2 are how far the page scrolls (design
  pixels): to the delivery, then down to Pay; the summary on the left is
  sticky on the real page, so it gives back all but the bar's 62.
*/
const MOTION = u(`
.cdx[data-mode=card]{--s1:300;--s2:680}
@container (max-width:560px){.cdx[data-mode=card]{--s1:330;--s2:935}}
@media (prefers-reduced-motion:no-preference){
  [data-on] .cdx-ph{animation:cdx-ph .06s linear both}
  [data-on] .cdx-v{animation:cdx-type .35s cubic-bezier(.2,.8,.2,1) both}
  [data-on] .cdx[data-mode=wallet] .cdx-ph{animation:none;opacity:1}
  [data-on] .cdx[data-mode=wallet] .cdx-v{animation:none;opacity:0}
  [data-on] .cdx-ph-email,[data-on] .cdx-v-email{animation-delay:.35s}
  [data-on] .cdx-ph-first,[data-on] .cdx-v-first{animation-delay:.7s}
  [data-on] .cdx-ph-last,[data-on] .cdx-v-last{animation-delay:.9s}
  [data-on] .cdx-v-country{animation:none}
  [data-on] .cdx-v-addr{animation-delay:1.5s}
  [data-on] .cdx-v-city{animation-delay:1.75s}
  [data-on] .cdx-v-state{animation-delay:1.9s}
  [data-on] .cdx-v-zip{animation-delay:2.05s}
  [data-on] .cdx-ph-card,[data-on] .cdx-v-card{animation-delay:3.05s}
  [data-on] .cdx-ph-exp,[data-on] .cdx-v-exp{animation-delay:3.3s}
  [data-on] .cdx-ph-cvc,[data-on] .cdx-v-cvc{animation-delay:3.45s}
  [data-on] .cdx[data-mode=card] .cdx-scroll{animation:cdx-scroll 3.1s both}
  [data-on] .cdx[data-mode=card] .cdx-sum-in{animation:cdx-stick 3.1s both}
  [data-on] .cdx[data-mode=card] .cdx-opt[data-sel] .cdx-radio i{animation:cdx-pop .3s cubic-bezier(.3,1.5,.5,1) both 2.3s}
  [data-on] .cdx-s0{animation:cdx-out .3s ease both 2.3s}
  [data-on] .cdx-s1,[data-on] .cdx-tax{animation:cdx-tick .4s cubic-bezier(.2,.8,.2,1) both 2.35s}
  [data-on] .cdx-t0{animation:cdx-tick-out .3s ease both 2.4s}
  [data-on] .cdx[data-mode=card] .cdx-t1{animation:cdx-tick .45s cubic-bezier(.2,.8,.2,1) both 2.45s}
  [data-on] .cdx-box-terms::after,[data-on] .cdx-box-terms svg{animation:cdx-pop .3s cubic-bezier(.3,1.5,.5,1) both 3.7s}
  [data-on] .cdx[data-mode=card] .cmv-cursor{animation:cdx-cur 1s cubic-bezier(.3,.7,.2,1) both 3.75s}
  [data-on] .cdx[data-mode=card] .cdx-pay{animation:cmv-press .3s ease both 4.55s}
  [data-on] .cdx[data-mode=card] .cdx-paid{animation:cdx-in .35s ease both 4.9s}
  [data-on] .cdx[data-mode=card] .cdx-ring{animation:cdx-pop .45s cubic-bezier(.3,1.5,.5,1) both 5.05s}
  [data-on] .cdx[data-mode=card] .cdx-paid b,[data-on] .cdx[data-mode=card] .cdx-paid small{animation:cdx-tick .4s cubic-bezier(.2,.8,.2,1) both 5.2s}
  [data-on] .cdx[data-mode=wallet] .cmv-cursor{animation:cdx-cur 1s cubic-bezier(.3,.7,.2,1) both .35s}
  [data-on] .cdx[data-mode=wallet] .cdx-gp{animation:cmv-press .3s ease both 1.15s}
  [data-on] .cdx[data-mode=wallet] .cdx-paid{animation:cdx-in .35s ease both 1.6s}
  [data-on] .cdx[data-mode=wallet] .cdx-ring{animation:cdx-pop .45s cubic-bezier(.3,1.5,.5,1) both 1.75s}
  [data-on] .cdx[data-mode=wallet] .cdx-paid b,[data-on] .cdx[data-mode=wallet] .cdx-paid small{animation:cdx-tick .4s cubic-bezier(.2,.8,.2,1) both 1.9s}
}
@keyframes cdx-ph{from{opacity:1}to{opacity:0}}
@keyframes cdx-type{from{opacity:0;transform:translate3d(-6u,0,0)}to{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cdx-scroll{0%,33%{transform:translate3d(0,0,0);animation-timing-function:cubic-bezier(.45,0,.2,1)}52%,74%{transform:translate3d(0,calc(var(--s1) * -1u),0);animation-timing-function:cubic-bezier(.45,0,.2,1)}100%{transform:translate3d(0,calc(var(--s2) * -1u),0)}}
@keyframes cdx-stick{0%,33%{transform:translate3d(0,0,0);animation-timing-function:cubic-bezier(.45,0,.2,1)}52%,74%{transform:translate3d(0,calc((var(--s1) - 62) * 1u),0);animation-timing-function:cubic-bezier(.45,0,.2,1)}100%{transform:translate3d(0,calc((var(--s2) - 62) * 1u),0)}}
@keyframes cdx-pop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:scale(1)}}
@keyframes cdx-out{from{opacity:1}to{opacity:0}}
@keyframes cdx-in{from{opacity:0}to{opacity:1}}
@keyframes cdx-tick{from{opacity:0;transform:translate3d(0,8u,0)}to{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cdx-tick-out{from{opacity:1;transform:translate3d(0,0,0)}to{opacity:0;transform:translate3d(0,-8u,0)}}
@keyframes cdx-cur{0%{opacity:0;transform:translate3d(90u,70u,0)}20%{opacity:1}72%{transform:translate3d(0,0,0) scale(1)}84%{transform:translate3d(0,0,0) scale(.85)}100%{opacity:1;transform:translate3d(0,0,0) scale(1)}}
`)

export const CHECKOUT_DESKTOP_CSS = BASE + MOTION
