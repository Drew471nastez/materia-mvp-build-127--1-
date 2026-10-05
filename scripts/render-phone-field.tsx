/**
 * The phone number field from Set up payouts (components/app/settings/phone-field),
 * in the form's own column, with the payouts country switchable beside it, for
 * scripts/check-phone-field.mjs. What the form would keep is printed under it.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { PhoneField } from "@/components/app/settings/phone-field"

function Page() {
  const [country, setCountry] = React.useState("RO")
  const [phone, setPhone] = React.useState("")
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-[560px] px-5 py-8">
        <div className="mb-4 flex gap-2">
          {["RO", "US", "GB", "FR", "DE"].map((c) => (
            <button key={c} type="button" data-country={c} onClick={() => setCountry(c)} className={`h-9 rounded-lg border px-3 text-[13px] ${c === country ? "border-[#1a1a2e] text-[#1a1a2e]" : "border-[#e5e7eb] text-[#6b7280]"}`}>
              {c}
            </button>
          ))}
        </div>
        <label htmlFor="phone" className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">Phone number</label>
        <PhoneField id="phone" country={country} value={phone} onChange={setPhone} />
        <p data-kept="" className="mt-3 text-[12px] text-[#6b7280]">{phone || "(nothing)"}</p>
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
