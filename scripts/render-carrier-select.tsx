/**
 * The carrier field as Fulfill items draws it (components/physical/order-panel.tsx TrackingFields), for
 * scripts/check-carrier-select.mjs: the real CarrierPicker for a parcel to Romania, starting on the shop's first
 * guess once its carriers are read, and under it the real CarrierServices with an order behind it (so Show rates
 * asks the stand-in label route).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { CarrierPicker, carrierOfChoice } from "@/components/physical/carrier-picker"
import { CarrierServices, firstCarrier, useCarrierPrefs } from "@/components/physical/carrier-live"
import { Field, TextInput } from "@/components/physical/ui"
import { OTHER_CARRIER, carrierOf } from "@/lib/physical/carriers"

function Demo() {
  const [choice, setChoice] = React.useState("")
  const [other, setOther] = React.useState("")
  const [tracking, setTracking] = React.useState("")
  const { prefs, loaded } = useCarrierPrefs()
  React.useEffect(() => {
    if (!loaded) return
    const first = firstCarrier(prefs, { country: "RO" })
    const known = carrierOf(first)
    setChoice((c) => c || (known ? known.id : first ? OTHER_CARRIER : ""))
    if (!known && first) setOther(first)
  }, [loaded, prefs])
  const name = carrierOfChoice(choice)?.name ?? (choice === OTHER_CARRIER ? other : null)
  return (
    <div className="min-h-screen bg-[#f8f9fa] px-4 py-8">
      <div className="mx-auto max-w-[520px] rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-probe-card="">
        <h2 className="mb-4 text-[16px] font-semibold text-[#1a1a2e]">Fulfill items</h2>
        <div className="grid gap-3.5">
          <Field label="Carrier">
            <CarrierPicker value={choice} onChange={setChoice} country="RO" otherName={other} onOtherName={setOther} />
          </Field>
          <CarrierServices carrier={name} orderId="o1" locationId={null} />
          <Field label="Tracking number">
            <TextInput value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </Field>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Demo />)
