"use client"

import * as React from "react"
import { CountryPicker } from "@/components/app/settings/country-picker"
import { countryOf } from "@/lib/account/country"
import { payoutCountry } from "@/lib/payments/stripe/payout-countries"
import { cn } from "@/lib/utils"

const FIELD = "h-10 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-[14px] text-[#111827] outline-none transition-colors focus:border-[#111827]"
const LABEL = "mb-1.5 block text-[13px] font-medium text-[#374151]"

export function StorelibPayoutSetupForm({
  busy,
  onSubmit,
}: {
  busy: boolean
  onSubmit: (body: Record<string, string | boolean>) => Promise<void>
}) {
  const [kind, setKind] = React.useState<"individual" | "business">("individual")
  const [countryName, setCountryName] = React.useState("")
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [businessName, setBusinessName] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [city, setCity] = React.useState("")
  const [postalCode, setPostalCode] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [dob, setDob] = React.useState("")
  const [accountHolder, setAccountHolder] = React.useState("")
  const [iban, setIban] = React.useState("")
  const [ibanConfirm, setIbanConfirm] = React.useState("")
  const [routing, setRouting] = React.useState("")
  const [accountNumber, setAccountNumber] = React.useState("")
  const [accountNumberConfirm, setAccountNumberConfirm] = React.useState("")
  const [institution, setInstitution] = React.useState("")
  const [transit, setTransit] = React.useState("")
  const [agree, setAgree] = React.useState(false)

  const country = countryOf(countryName) ?? ""
  const rule = country ? payoutCountry(country) : null
  const maxDob = React.useMemo(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 18)
    return d.toISOString().slice(0, 10)
  }, [])

  return (
    <form
      className="space-y-4 border-t border-[#f3f4f6] px-4 py-5 sm:px-5"
      onSubmit={(e) => {
        e.preventDefault()
        void onSubmit({
          kind,
          country: country || countryName,
          firstName,
          lastName,
          businessName,
          address,
          city,
          postalCode,
          phone,
          dob,
          accountHolder,
          iban,
          ibanConfirm,
          routing,
          accountNumber,
          accountNumberConfirm,
          institution,
          transit,
          agree,
        })
      }}
    >
      <div>
        <h4 className="text-[15px] font-semibold text-[#111827]">Bank account</h4>
        <p className="mt-1 text-[13px] leading-5 text-[#6b7280]">
          Free plan: 6% plus a fixed fee on standard prices, or 12.25% on small prices. Pro: 3% plus a fixed fee, or 9.25% on small prices. Card processing depends on the buyer&apos;s country and is not added by Storelib.
        </p>
      </div>

      <fieldset>
        <legend className={LABEL}>Account type</legend>
        <div role="radiogroup" className="inline-flex rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-0.5">
          {(["individual", "business"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "h-8 rounded-[10px] px-3.5 text-[13px] font-medium",
                kind === k ? "bg-white text-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280]",
              )}
            >
              {k === "individual" ? "Individual" : "Business"}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-[#6b7280]">{kind === "individual" ? "When you are selling as yourself." : "When you are selling as a business."}</p>
      </fieldset>

      {kind === "business" ? (
        <label className="block">
          <span className={LABEL}>Business name</span>
          <input className={FIELD} value={businessName} onChange={(e) => setBusinessName(e.target.value)} autoComplete="organization" />
        </label>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>First name</span>
          <input className={FIELD} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
          <span className="mt-1 block text-[12px] text-[#9ca3af]">Include your middle name if it is on your ID.</span>
        </label>
        <label className="block">
          <span className={LABEL}>Last name</span>
          <input className={FIELD} value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
        </label>
      </div>

      <label className="block">
        <span className={LABEL}>Address</span>
        <input className={FIELD} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="address-line1" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>City</span>
          <input className={FIELD} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
        </label>
        <label className="block">
          <span className={LABEL}>Postal code</span>
          <input className={FIELD} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} autoComplete="postal-code" />
        </label>
      </div>
      <label className="block">
        <span className={LABEL}>Country</span>
        <CountryPicker id="payout-country" value={countryName} onChange={setCountryName} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>Phone number</span>
          <input className={FIELD} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" />
        </label>
        <label className="block">
          <span className={LABEL}>Date of birth</span>
          <input className={FIELD} type="date" value={dob} max={maxDob} onChange={(e) => setDob(e.target.value)} autoComplete="bday" />
        </label>
      </div>

      {rule && rule.format !== "stripe" ? (
        <div className="space-y-3 rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-3.5">
          <label className="block">
            <span className={LABEL}>Pay to the order of</span>
            <input className={FIELD} value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} autoComplete="name" />
            <span className="mt-1 block text-[12px] text-[#9ca3af]">Must match the name on the bank account.</span>
          </label>
          {rule.format === "iban" ? (
            <>
              <label className="block">
                <span className={LABEL}>IBAN</span>
                <input className={FIELD} value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} autoComplete="off" spellCheck={false} />
              </label>
              <label className="block">
                <span className={LABEL}>Confirm IBAN</span>
                <input className={FIELD} value={ibanConfirm} onChange={(e) => setIbanConfirm(e.target.value.toUpperCase())} autoComplete="off" spellCheck={false} />
              </label>
            </>
          ) : null}
          {rule.format === "us" ? (
            <>
              <label className="block">
                <span className={LABEL}>Routing number</span>
                <input className={FIELD} value={routing} onChange={(e) => setRouting(e.target.value)} inputMode="numeric" autoComplete="off" />
              </label>
              <label className="block">
                <span className={LABEL}>Account number</span>
                <input className={FIELD} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} inputMode="numeric" autoComplete="off" />
              </label>
              <label className="block">
                <span className={LABEL}>Confirm account number</span>
                <input className={FIELD} value={accountNumberConfirm} onChange={(e) => setAccountNumberConfirm(e.target.value)} inputMode="numeric" autoComplete="off" />
              </label>
            </>
          ) : null}
          {rule.format === "ca" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>Institution</span>
                  <input className={FIELD} value={institution} onChange={(e) => setInstitution(e.target.value)} inputMode="numeric" autoComplete="off" />
                </label>
                <label className="block">
                  <span className={LABEL}>Transit</span>
                  <input className={FIELD} value={transit} onChange={(e) => setTransit(e.target.value)} inputMode="numeric" autoComplete="off" />
                </label>
              </div>
              <label className="block">
                <span className={LABEL}>Account number</span>
                <input className={FIELD} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} inputMode="numeric" autoComplete="off" />
              </label>
              <label className="block">
                <span className={LABEL}>Confirm account number</span>
                <input className={FIELD} value={accountNumberConfirm} onChange={(e) => setAccountNumberConfirm(e.target.value)} inputMode="numeric" autoComplete="off" />
              </label>
            </>
          ) : null}
          {rule.format === "au" ? (
            <>
              <label className="block">
                <span className={LABEL}>BSB</span>
                <input className={FIELD} value={routing} onChange={(e) => setRouting(e.target.value)} inputMode="numeric" autoComplete="off" />
              </label>
              <label className="block">
                <span className={LABEL}>Account number</span>
                <input className={FIELD} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} inputMode="numeric" autoComplete="off" />
              </label>
              <label className="block">
                <span className={LABEL}>Confirm account number</span>
                <input className={FIELD} value={accountNumberConfirm} onChange={(e) => setAccountNumberConfirm(e.target.value)} inputMode="numeric" autoComplete="off" />
              </label>
            </>
          ) : null}
          <p className="text-[13px] text-[#374151]">Payouts will be made in {rule.currency.toUpperCase()}.</p>
        </div>
      ) : (
        <p className="text-[13px] leading-5 text-[#6b7280]">
          Bank details for this country are collected in the secure verification step after you continue. Storelib does not store the account number.
        </p>
      )}

      <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-5 text-[#4b5563]">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#111827]" />
        <span>I agree to Storelib Payments and to identity checks required to pay me. The bank number is sent to Stripe and is not kept by Storelib.</span>
      </label>

      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-10 items-center justify-center rounded-xl bg-[#111827] px-5 text-[14px] font-semibold text-white hover:bg-[#1f2937] disabled:opacity-60"
      >
        {busy ? "Saving" : "Continue"}
      </button>
    </form>
  )
}
