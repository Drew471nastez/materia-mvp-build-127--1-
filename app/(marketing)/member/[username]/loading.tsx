/**
 * /@handle while the profile is on its way: the shape of the page that is
 * coming (components/profile/profile-hero.tsx), so nothing moves when it
 * arrives. The band edge to edge at the creator page's heights, the photo
 * across its lower edge, two lines for the name and the handle, and the
 * tabs' rule. `skeleton-deferred` (globals.css): invisible for the first
 * 200ms, so a quick page never shows grey at all. Server safe: no hooks.
 *
 * THE BAR WITH THE WAY BACK IS PART OF THE SHAPE. A profile opened in the
 * app (from a community, Explore, search, your account) has the slim top bar
 * with the chevron (components/profile/profile-top-bar.tsx), 56px plus its
 * hairline. Without it here the whole page landed 57px lower than the shape
 * that held its place: the jump on opening a profile. A profile opened cold
 * has no bar, and a cold load is drawn on the server, not by this.
 */
export default function MemberProfileSkeleton() {
  return (
    <main className="explore-ground min-h-screen bg-[#f8f9fa]" aria-busy="true" aria-label="Loading profile">
      <div className="skeleton-deferred">
        <div className="h-[57px] w-full border-b border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]" data-profile-skeleton-bar="" />
        <div className="h-[157px] w-full bg-[#eceef1] sm:h-[233px] lg:h-[312px]" />
        <div className="mx-auto flex w-full max-w-[960px] flex-col items-center px-4 sm:px-6 lg:px-0">
          <span className="-mt-[62.5px] block h-[125px] w-[125px] rounded-full bg-[#e3e5e9] ring-2 ring-[#f8f9fa] sm:-mt-[71px] sm:h-[142px] sm:w-[142px]" />
          <span className="mt-4 block h-6 w-44 rounded-md bg-[#e8eaee]" />
          <span className="mt-2.5 block h-3.5 w-28 rounded bg-[#eceef1]" />
          <div className="mt-10 flex w-full items-end gap-6 border-b border-[#e5e7eb] pb-3 sm:mt-12">
            <span className="block h-3.5 w-16 rounded bg-[#e8eaee]" />
            <span className="block h-3.5 w-24 rounded bg-[#eceef1]" />
          </div>
        </div>
      </div>
    </main>
  )
}
