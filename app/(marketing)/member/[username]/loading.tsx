import { PERSON_CHROME } from "@/components/storefront/storefront-template"

/**
 * /@handle while the profile is on its way: what the creator page's own
 * loading shows (app/(marketing)/u/[username]/loading.tsx), the page's
 * colour and nothing pretending to be its furniture, since round 12 made a
 * person's page that same page (components/profile/member-profile-page.tsx).
 * Plus its top bar, which a person's page always has (the photo and the
 * name, 56px and its hairline), so the page lands where this held it. The
 * bar's contents are not guessed at: an empty white bar, then the real one.
 * Server safe: no hooks.
 */
export default function MemberProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading profile" className="min-h-screen" style={{ backgroundColor: PERSON_CHROME.pageBackground }}>
      <div className="skeleton-deferred native-top-surface w-full border-b border-black/[0.06] bg-white" data-profile-skeleton-bar="">
        <div className="h-14" />
      </div>
    </div>
  )
}
