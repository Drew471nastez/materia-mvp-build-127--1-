import { BuilderLoader } from "@/components/website-builder/builder-loader"

/**
 * ARRIVING LOOKS LIKE THE BUILDER ARRIVING.
 *
 * The route is force-dynamic and reads four tables before it can render, so
 * without this there is a blank white gap between pressing Creator Page and
 * the editor appearing — the same gap the website builder fills with
 * "Loading the editor". Next renders this automatically while the server
 * component resolves; the same loader, on the same dark ground the editor
 * itself uses, so the arrival is one surface rather than white then dark.
 */
export default function CreatorPageLoading() {
  return (
    <div className="flex h-svh w-full items-center justify-center bg-[#131316]">
      <BuilderLoader tone="dark" lines={["Loading the editor", "Fetching your page"]} />
    </div>
  )
}
