import type { Metadata } from "next"
import { SettingsFormNew } from "@/components/app/settings-form-new"
import { SettingsMarketplaceCards } from "@/components/orders/settings-marketplace-cards"
import { loadSettingsData } from "@/app/app/settings/_server"

// Settings at /settings, not /app/settings.
//
// It sits in the marketing route group so it gets the ordinary site header and
// none of the seller dashboard's shell — no sidebar, no second navigation. The
// form itself is unchanged and still loads through the same server helper; only
// what surrounds it is different. /app/settings still resolves, so nothing that
// links there breaks while the old shell is retired.
export const metadata: Metadata = {
  title: "Setări | Storelib",
  robots: { index: false, follow: false },
}

export default async function SettingsPage() {
  const data = await loadSettingsData()

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      {/* The marketplace shelf sits above the account form and only on THIS
          settings surface — /app/settings keeps the seller-dashboard shell and
          gets order history through its own sidebar instead. */}
      <div className="px-4 sm:px-6 lg:px-8">
        <SettingsMarketplaceCards />
      </div>
      <SettingsFormNew
        profile={data.profile}
        creator={data.creator}
        storeBuilderAvatarUrl={data.storeBuilderAvatarUrl}
        onepageAvatarUrl={data.onepageAvatarUrl}
        googleAvatarUrl={data.googleAvatarUrl}
        initialTab="general"
      />
    </div>
  )
}
