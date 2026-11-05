/**
 * The checkout's phone field (app/(storelib)/checkout/parts/phone-input) under its label,
 * as the website checkout draws it, with the address's country switchable
 * above it, for scripts/check-checkout-phone.mjs. What the order would keep
 * is printed under it.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { CheckoutPhone } from "@/app/(storelib)/checkout/parts/phone-input"
import { Field } from "@/app/(storelib)/checkout/parts/ui"

function Page() {
  const [country, setCountry] = React.useState("RO")
  const [phone, setPhone] = React.useState("")
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-[560px] px-5 py-8">
        <div className="mb-4 flex gap-2">
          {["RO", "US", "GB", "FR"].map((c) => (
            <button key={c} type="button" data-address-country={c} onClick={() => setCountry(c)} className="h-9 rounded-lg border border-[#e5e7eb] px-3 text-[13px]">
              {c}
            </button>
          ))}
        </div>
        <Field id="checkout-phone" label="Phone">
          <CheckoutPhone id="checkout-phone" value={phone} country={country} onChange={setPhone} />
        </Field>
        <p data-kept="" className="mt-3 text-[12px] text-[#6b7280]">{phone || "(nothing)"}</p>
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
