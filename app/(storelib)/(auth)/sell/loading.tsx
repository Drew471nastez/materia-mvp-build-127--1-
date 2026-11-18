/* The same dark ground and spinner the page opens on (./sell-onboarding.tsx), so a link pressed inside the site shows one screen, not two, and nothing flashes white before the film. */
export default function Loading() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-[#0b0b0f]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/15 border-t-white" />
    </div>
  )
}
