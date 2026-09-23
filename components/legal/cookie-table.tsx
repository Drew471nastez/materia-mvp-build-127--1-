"use client"

/**
 * Every cookie and stored item, from the same list the preferences panel
 * shows (lib/consent/consent.ts), with a button that opens that panel. A
 * policy that listed cookies by hand would describe a site that had moved on.
 */
import { CATEGORY_TEXT, STORED, type ConsentCategory } from "@/lib/consent/consent"
import { openCookiePreferences } from "@/lib/consent/client"

const ORDER: ConsentCategory[] = ["necessary", "preferences", "analytics", "marketing"]

export function CookieTable() {
  return (
    <div className="space-y-5">
      {ORDER.map((category) => {
        const items = STORED.filter((s) => s.category === category)
        return (
          <div key={category}>
            <p className="font-semibold text-gray-900">{CATEGORY_TEXT[category].title}</p>
            <p className="mt-1">{CATEGORY_TEXT[category].body}</p>
            {items.length > 0 && (
              <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">What it does</th>
                      <th className="px-3 py-2 font-medium">Kept for</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.name} className="border-t border-gray-100 align-top">
                        <td className="px-3 py-2 font-mono text-[12px] text-gray-900">{it.name}</td>
                        <td className="px-3 py-2">{it.purpose}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-500">{it.lasts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => openCookiePreferences()}
        className="inline-flex h-9 items-center rounded-lg bg-gray-900 px-4 text-[13px] font-medium text-white hover:bg-gray-800"
      >
        Change your cookie choices
      </button>
    </div>
  )
}
