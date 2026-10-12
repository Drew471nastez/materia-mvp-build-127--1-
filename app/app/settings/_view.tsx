import { SettingsFormNew } from "@/components/app/settings-form-new"
import { loadSettingsData } from "./_server"
import { TeamPanel } from "@/components/app/settings/team-panel"
import { getServerTt } from "@/lib/i18n/server"

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
 * fills it as soon as the server has answered. It is fetched ahead of the
 * press (prefetchAppPage, from the rail and the phone's account menu), so it
 * is normally there with the sheet. A short fade (220ms, nothing held back
 * before it) so a slow answer arrives rather than snaps into the sheet.
 */
export async function SettingsForm() {
  const data = await loadSettingsData()
  if (!data) return null
  /* A team member with no store of their own: their Team section, which is all of Settings that is theirs to change here. */
  if (data.memberOnly) {
    const { tt } = await getServerTt()
    return (
      <div className="library-content-enter mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6" data-settings-member-only="">
        <h1 className="mb-1 text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Team")}</h1>
        <p className="mb-5 text-[14px] text-[#6b7280]">{tt("The stores you help run.")}</p>
        <TeamPanel />
      </div>
    )
  }
  return (
    <div className="library-content-enter">
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
        teamActing={data.teamActing}
        initialTab="general"
      />
    </div>
  )
}
