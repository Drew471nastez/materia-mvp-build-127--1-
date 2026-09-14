import { BuilderLoader } from "@/components/website-builder/builder-loader"

/**
 * ARRIVING, ON THE GROUND THE EDITOR ACTUALLY USES.
 *
 * The route is force-dynamic and reads four tables before it can render, so
 * without this there is a blank gap between pressing Creator Page and the
 * editor appearing. Next renders this while the server component resolves.
 *
 * #f1f1f3 because that is the workspace's own ground. It was #131316 for one
 * round, when the chrome was dark, and a loading screen that is not the
 * colour of what follows it is a flash rather than a transition.
 */
export default function CreatorPageLoading() {
  return (
    <div className="flex h-svh w-full items-center justify-center bg-[#f1f1f3]">
      <BuilderLoader tone="light" lines={["Loading the editor", "Fetching your page"]} />
    </div>
  )
}
