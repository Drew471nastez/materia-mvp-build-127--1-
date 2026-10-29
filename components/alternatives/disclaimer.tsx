/**
 * The independence note on every comparison page and the hub. Names the
 * companies the page compares, so it says what it is about.
 */
export function Disclaimer({ names, className = "" }: { names: string[]; className?: string }) {
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]
  return (
    <p className={`max-w-[860px] text-[12.5px] leading-[1.55] text-[#6b7280] ${className}`} data-alternatives-disclaimer>
      An independent comparison written by Storelib. Storelib is not affiliated with, endorsed by or sponsored by {list}. {list} and{" "}
      {names.length > 1 ? "their" : "its"} logos are trademarks of their owners and are named here only to compare products. Facts about {names.length > 1 ? "these platforms" : list} come from {names.length > 1 ? "their" : "its"} public pages on the date shown; if something has changed, write to team@storelib.com and we will correct it.
    </p>
  )
}
