/**
 * /alternatives, grouped by what a seller needs, then every platform side by
 * side. Drawn on the server: a crawler and a reader without scripts get the
 * whole thing.
 *
 * THE MATRIX READS THE PAGES' OWN TABLES. A competitor's cell is the cell
 * its comparison page shows for that row, with the same sources and status;
 * a row its page does not compare says so ("Not compared") rather than
 * guessing. Storelib's column is lib/alternatives/storelib-features, the
 * same cells every page uses.
 */
import Link from "next/link"
import type { CategoryId, CellValue, Competitor, StorelibCell } from "@/lib/alternatives/types"
import type { Flags } from "@/lib/alternatives/seo"
import { alternativePath } from "@/lib/alternatives"
import { SL } from "@/lib/alternatives/storelib-features"
import { useCasePath, useCaseOn, USE_CASES, type UseCaseSlug } from "@/lib/marketing/use-cases"
import { storelibCellFor } from "./parts"

export const NEEDS: readonly { id: CategoryId; title: string; text: string; useCase: UseCaseSlug }[] = [
  { id: "digital-products", title: "Selling downloads and courses", text: "Files, templates and courses sold from a link, a profile or a store page.", useCase: "digital-products" },
  { id: "link-in-bio", title: "Link in bio", text: "One page in your bio that lists your links, and can sell.", useCase: "digital-products" },
  { id: "communities", title: "Paid communities", text: "Paid access to a group, with posts, chat and plans.", useCase: "communities" },
  { id: "online-store", title: "A full store", text: "A website with a cart and your own domain, and physical products.", useCase: "creator-website" },
]

const MATRIX_ROWS: readonly { id: string; label: string; storelib: StorelibCell }[] = [
  { id: "monthly", label: "Monthly fee", storelib: SL.monthlyFee },
  { id: "per-sale", label: "Fee per sale", storelib: SL.perSaleFee },
  { id: "digital", label: "Digital products", storelib: SL.digitalProducts },
  { id: "courses", label: "Courses", storelib: SL.courses },
  { id: "community", label: "Community", storelib: SL.communities },
  { id: "memberships", label: "Memberships", storelib: SL.memberships },
  { id: "bio", label: "Link in bio page", storelib: SL.linkInBio },
  { id: "website", label: "Website builder", storelib: SL.website },
  { id: "domain", label: "Your own domain", storelib: SL.customDomain },
  { id: "email", label: "Email to buyers", storelib: SL.email },
  { id: "affiliates", label: "Affiliates", storelib: SL.affiliates },
  { id: "tax", label: "Sales tax and VAT", storelib: SL.tax },
]

const WORD: Record<CellValue, string> = { yes: "Yes", no: "No", partial: "Partly", unknown: "Not confirmed" }

export function HubGroups({ list, flags }: { list: readonly Competitor[]; flags: Flags }) {
  return (
    <div className="grid gap-x-10 gap-y-12 md:grid-cols-2">
      {NEEDS.map((n) => {
        const in_ = list.filter((c) => c.categories.includes(n.id))
        if (in_.length === 0) return null
        const uc = USE_CASES.find((u) => u.slug === n.useCase)
        return (
          <section key={n.id} aria-labelledby={`need-${n.id}`} data-need={n.id}>
            <h2 id={`need-${n.id}`} className="text-[20px] font-bold text-[#1a1a2e]">{n.title}</h2>
            <p className="mt-1.5 text-[15px] leading-[1.6] text-[#4b5563]">{n.text}</p>
            <ul className="mt-4 divide-y divide-[#f1f2f4] rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              {in_.map((c) => (
                <li key={c.slug}>
                  <Link href={alternativePath(c.slug)} className="group block px-4 py-4 sm:px-5">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-[16px] font-semibold text-[#1a1a2e] group-hover:underline">Storelib vs {c.name}</span>
                      <span aria-hidden className="text-[#9ca3af] group-hover:text-[#1a1a2e]">→</span>
                    </span>
                    <span className="mt-1 block text-[14px] leading-[1.5] text-[#4b5563]">{c.summary}</span>
                    <span className="mt-1 block text-[13px] text-[#6b7280]">{c.pricingShort}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {uc && useCaseOn(uc, flags) ? (
              <p className="mt-3 text-[14px]">
                <Link href={useCasePath(uc.slug)} className="font-medium text-[#1a1a2e] underline decoration-[#c7cbd1] underline-offset-2 hover:decoration-[#1a1a2e]">
                  {uc.nav} on Storelib
                </Link>
              </p>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

export function HubMatrix({ list, flags }: { list: readonly Competitor[]; flags: Flags }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-hub-matrix tabIndex={0} aria-label="Comparison table, scrolls sideways on small screens">
      <table className="w-full border-collapse text-left" style={{ minWidth: 150 + 120 * (list.length + 1) }}>
        <caption className="sr-only">Storelib and {list.map((c) => c.name).join(", ")}, feature by feature</caption>
        <thead>
          <tr className="border-b border-[#eef0f2] bg-[#f8f9fa] text-[13px]">
            <th scope="col" className="sticky left-0 z-10 w-[150px] bg-[#f8f9fa] px-4 py-3 font-medium text-[#6b7280]">Feature</th>
            <th scope="col" className="px-3 py-3 font-semibold text-[#1a1a2e]">Storelib</th>
            {list.map((c) => (
              <th key={c.slug} scope="col" className="px-3 py-3 font-semibold text-[#1a1a2e]">
                <Link href={alternativePath(c.slug)} className="hover:underline">{c.name}</Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MATRIX_ROWS.map((r) => {
            const sl = storelibCellFor(r.storelib, flags)
            return (
              <tr key={r.id} className="border-b border-[#f1f2f4] align-top last:border-0">
                <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-3 text-[13.5px] font-medium leading-[1.4] text-[#1a1a2e]">{r.label}</th>
                <td className="px-3 py-3 text-[13px] leading-[1.45]">
                  {sl.wordless && sl.value === "yes" && sl.text ? null : <span className="block font-semibold text-[#1a1a2e]">{WORD[sl.value]}</span>}
                  {sl.text ? <span className="text-[#4b5563]">{sl.text}</span> : null}
                </td>
                {list.map((c) => {
                  const row = c.features.find((f) => f.id === r.id)
                  if (!row) return <td key={c.slug} className="px-3 py-3 text-[13px] text-[#9ca3af]">Not compared</td>
                  const cell = row.competitor
                  return (
                    <td key={c.slug} className="px-3 py-3 text-[13px] leading-[1.45]">
                      {/* A row that is all detail ("$29 a month"), as the comparison pages draw it: no bare Yes before it. */}
                      {cell.value === "yes" && cell.text && (r.id === "monthly" || r.id === "per-sale") ? null : <span className="block font-semibold text-[#1a1a2e]">{WORD[cell.value]}</span>}
                      {cell.text ? <span className="text-[#4b5563]">{cell.text}</span> : null}
                      {cell.status === "conflicting" ? <span className="mt-0.5 block text-[12px] text-[#8a5a00]">Sources disagree</span> : null}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
