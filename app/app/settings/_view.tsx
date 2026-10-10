import { SettingsFormNew } from "@/components/app/settings-form-new"
import { loadSettingsData } from "./_server"

/**
 * Settings, drawn as the sheet. Two ways in, one drawing:
 *
 *   OVER A PAGE   a press anywhere in /app (the sidebar, the account menu, a
 *                 link in a card) is caught by app/app/@sheet/(.)settings, so
 *                 the page the person was on stays mounted under the sheet
 *                 and closing is a Back to it: nothing behind ever goes blank
 *                 and nothing reloads in view.
 *   ON ITS OWN    a reload, an email link or a Stripe return opens
 *                 app/app/settings itself; the sheet stands over the shell
 *                 and closing goes to the dashboard.
 */
/**
 * What is in the sheet. Over a page the sheet itself is app/app/@sheet/
 * (.)settings/layout.tsx, so it rises the moment it is pressed and this
 * fills it as soon as the server has answered, fading in rather than
 * popping (settings-content-in, app/globals.css).
 */
export async function SettingsForm() {
  const data = await loadSettingsData()
  if (!data) return null
  return (
    <div className="settings-content-in">
      <SettingsFormNew
        profile={data.profile}
        creator={data.creator}
        accountTimeZone={data.timeZone}
        websitePublished={data.websitePublished}
        onePageLive={data.onePageLive}
        sharePlatforms={data.sharePlatforms}
        website={data.website}
        newsletter={data.newsletter}
        otherStores={data.otherStores}
        paymentsProvider={data.paymentsProvider}
        initialTab="general"
      />
    </div>
  )
}
