import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRight, Store } from "lucide-react"

import { SettingsFormNew } from "@/components/app/settings-form-new"
import { SettingsMarketplaceCards } from "@/components/orders/settings-marketplace-cards"
import { SettingsBackButton } from "@/components/profile/settings-back-button"
import { loadSettingsData } from "@/app/app/settings/_server"

// Settings at /settings, not /app/settings.
//
// It sits in the marketing route group so it gets the ordinary site header and
// none of the seller dashboard's shell — no sidebar, no second navigation. The
// form itself is unchanged and still loads through the same server helper; only
// what surrounds it is different. /app/settings still resolves, so nothing that
// links there breaks while the old shell is retired.
//
// This is a subpage now rather than a tab destination: you arrive from the gear
// on /profile, so the screen opens with a back button and its own title.
export const metadata: Metadata = {
  title: "Setări | Storelib",
  robots: { index: false, follow: false },
}

export default async function SettingsPage() {
  // requireCreator: false is the whole fix. The loader used to send anyone
  // without a `creators` row to /onboarding, which meant every buyer who had
  // never listed anything was bounced out of their own settings.
  const data = await loadSettingsData({ requireCreator: false })

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      <div className="mb-5 flex items-center gap-1 px-4 sm:px-6 lg:px-8">
        <SettingsBackButton />
        <h1 className="text-[21px] font-bold tracking-[-0.01em] text-neutral-900">Setări</h1>
      </div>

      {/* The marketplace shelf sits above the account form and only on THIS
          settings surface — /app/settings keeps the seller-dashboard shell and
          gets order history through its own sidebar instead. */}
      <div className="px-4 sm:px-6 lg:px-8">
        <SettingsMarketplaceCards />
      </div>

      {/* SettingsFormNew reads creator.slug, creator.id and creator.avatar_url
          straight off the prop while it initialises state, so it cannot be
          handed a null — it would throw before the first paint. A buyer without
          a creators row therefore gets the account summary below instead: the
          few things that are actually true about their account, plus the door
          to selling. The moment they onboard, the full form appears here. */}
      {data.creator ? (
        <SettingsFormNew
          profile={data.profile}
          creator={data.creator}
          storeBuilderAvatarUrl={data.storeBuilderAvatarUrl}
          onepageAvatarUrl={data.onepageAvatarUrl}
          googleAvatarUrl={data.googleAvatarUrl}
          initialTab="general"
        />
      ) : (
        <BuyerAccountSection
          displayName={data.profile?.display_name || null}
          username={data.profile?.username || null}
          email={data.profile?.email || null}
          avatarUrl={data.googleAvatarUrl || data.profile?.avatar_url || null}
        />
      )}
    </div>
  )
}

/**
 * The creator-less account, in the settings form's own card language (white,
 * rounded-2xl, #e5e7eb border) so it reads as the same page rather than a
 * placeholder standing in for one.
 *
 * Deliberately read-only: editing a display name belongs to the form that knows
 * how to save it, and duplicating that here would mean two writers for one row.
 */
function BuyerAccountSection({
  displayName,
  username,
  email,
  avatarUrl,
}: {
  displayName: string | null
  username: string | null
  email: string | null
  avatarUrl: string | null
}) {
  const name = displayName || username || email?.split("@")[0] || "Contul meu"

  return (
    <div className="space-y-3 px-4 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#7c3aed]/10 text-[17px] font-semibold text-[#7c3aed]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              name.charAt(0).toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-[#111827]">{name}</p>
            {email && <p className="mt-0.5 truncate text-[13px] text-[#6b7280]">{email}</p>}
          </div>
        </div>

        <Link
          href="/profile"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-full border border-[#e5e7eb] bg-white px-6 text-[14px] font-semibold text-[#111827] transition-transform active:scale-[0.97]"
        >
          Vezi profilul meu
        </Link>
      </div>

      <Link
        href="/products/new"
        className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm transition-transform active:scale-[0.98] sm:p-5"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7c3aed]/10 text-[#7c3aed]">
          <Store className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[#111827]">Începe să vinzi</span>
          <span className="mt-0.5 block text-[13px] text-[#6b7280]">
            Listează primul articol și îți deschidem setările de vânzător.
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" />
      </Link>
    </div>
  )
}
