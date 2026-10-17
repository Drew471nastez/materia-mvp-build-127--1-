/**
 * ===========================================================================
 *  THE SIDEBAR'S GROUPS OPEN WHERE YOU ARE, AND STAY WHERE YOU PUT THEM
 * ===========================================================================
 * The owner: "Sidebar navigation: auto expand and collapse tied to the active
 * route ... Preserve routes, active states after refresh, keyboard access."
 *
 * The rule itself (lib/ui/nav-groups) and the two things in the sidebar that
 * made the old behaviour wrong: a group that started closed over the page you
 * were reading, and a scrollbar that appeared when a group opened and pushed
 * every label sideways.
 */
import { readFileSync } from "node:fs"
import { afterToggle, openGroups, routeInside, under } from "@/lib/ui/nav-groups"

let passed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readFileSync(p, "utf8")

const NAV = [
  { href: "/app" },
  { href: "/app/products", children: [{ href: "/app/coupons" }, { href: "/app/reviews" }] },
  { href: "/app/analytics" },
  { href: "/app/integrations", children: [{ href: "/app/integrations/storelib-reviews" }] },
]

console.log("\nWhere you are opens its group")
{
  check("a page under a row of the group opens it", [...openGroups(NAV, "/app/coupons")].join() === "/app/products")
  check("and so does a page under that row", [...openGroups(NAV, "/app/coupons/new")].join() === "/app/products")
  check("a page of the group's own parent does not", openGroups(NAV, "/app/products").size === 0, [...openGroups(NAV, "/app/products")])
  check("nor a page that only begins with the same letters", openGroups(NAV, "/app/coupons-archive").size === 0)
  check("somewhere else entirely opens nothing", openGroups(NAV, "/app/orders").size === 0)
  check("an installed integration opens Integrations", [...openGroups(NAV, "/app/integrations/storelib-reviews")].join() === "/app/integrations")
  check("a group with no rows under it is never open", openGroups([{ href: "/app/analytics", children: [] }], "/app/analytics", { "/app/analytics": true }).size === 0)
  check("under() is the whole rule about a path being inside another", under("/a/b", "/a/b") && under("/a/b/c", "/a/b") && !under("/a/bc", "/a/b") && !under("/a", "/a/b"))
  check("routeInside reads the rows, not the group's own address", routeInside(NAV[1], "/app/reviews") && !routeInside(NAV[1], "/app/products"))
}

console.log("\nAnd a press on the chevron wins")
{
  const closed = afterToggle({}, "/app/products", true)
  check("closing a group the route opened is remembered", closed["/app/products"] === false && openGroups(NAV, "/app/coupons", closed).size === 0)
  const opened = afterToggle({}, "/app/integrations", false)
  check("opening one the route did not is remembered too", opened["/app/integrations"] === true && [...openGroups(NAV, "/app/orders", opened)].join() === "/app/integrations")
  check("and it holds when the page moves inside that group", openGroups(NAV, "/app/coupons", closed).size === 0)
  check("pressing it again gives it back", openGroups(NAV, "/app/coupons", afterToggle(closed, "/app/products", false)).has("/app/products"))
  check("one group's answer says nothing about another", Object.keys(afterToggle(closed, "/app/integrations", false)).length === 2)
}

console.log("\nIn the sidebar itself")
{
  const side = code("components/app/sidebar.tsx")
  check("the groups drawn open are that rule, over the route being shown", /const expandedGroups = openGroups\(navItems, pathname, groupChoice\)/.test(side))
  check("the chevron writes this reader's own answer, for this tab", /const next = afterToggle\(prev, href, openNow\.current\.has\(href\)\)/.test(side) && /window\.sessionStorage\.setItem\(GROUP_CHOICE_KEY/.test(side))
  check("and reads it back when it mounts, so a refresh lands where they were", /window\.sessionStorage\.getItem\(GROUP_CHOICE_KEY\)/.test(side))
  check("nothing says the groups always start closed any more", !/Always collapsed on mount/.test(side))
  /*
    The scrollbar: 3px of room, always there. Without the gutter it appeared the moment a group opened,
    took its width out of the rows, and every label moved while the group was still opening. The rule is in
    the app's own stylesheet rather than a style block inside the sidebar, because the phone's menu uses the
    same class and a rule that exists only while one component is on screen is one no probe can measure.
  */
  const css = code("app/globals.css")
  check("the sidebar keeps the scrollbar's room whether or not it is scrolling", /\.sidebar-nav \{[\s\S]*?scrollbar-gutter: stable;[\s\S]*?\}/.test(css))
  check("and the scrollbar itself is slim and quiet until a pointer is over it", /scrollbar-width: thin/.test(css) && /\.sidebar-nav::-webkit-scrollbar \{\s*width: 3px;/.test(css) && /\.sidebar-nav:hover::-webkit-scrollbar-thumb/.test(css))
  check("and the sidebar carries no stylesheet of its own any more", !/<style jsx global>/.test(side))
  const nav = code("components/app/sidebar-desktop-nav.tsx")
  check("a group opens on a grid row, with no height measured in JavaScript", /gridTemplateRows: open \? "1fr" : "0fr"/.test(nav))
  check("a closed group is out of the keyboard's way", /aria-hidden=\{!open\}/.test(nav))
  check("and the chevron says which group it opens, and whether it is open", /aria-label=\{expanded \? tt\("Collapse \{label\}"/.test(nav) && /aria-expanded=\{expanded\}/.test(nav))
}

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
