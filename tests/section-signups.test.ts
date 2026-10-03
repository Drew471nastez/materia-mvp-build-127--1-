/**
 * ===========================================================================
 *  AN EMAIL BOX ON A STORELIB SITE COLLECTS EMAILS FOR THAT SITE'S CREATOR
 * ===========================================================================
 * Four places on a built site ask for an address. Before this, two of them
 * went nowhere:
 *
 *   the footer          `onSubmit={(e) => e.preventDefault()}`. Type an
 *                       address, press Join, nothing happens at all.
 *   .storelib sections  the shipped newsletter drew no form until the creator
 *                       pasted an outside mailing list's URL, and a section
 *                       the AI wrote had no way to submit anything, because
 *                       section scripts do not run yet.
 *
 * And one must NOT simply collect: a contact form is somebody asking a
 * question, not agreeing to a mailing list. It gets an unticked box.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { formIntent, type FormLike } from "@/lib/website-builder/form-intent"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** A form described by its attributes and whether it holds an email box. */
function form(attrs: Record<string, string>, hasEmail: boolean): FormLike {
  return {
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    querySelector: (sel) => (sel === 'input[type="email"]' && hasEmail ? {} : null),
  }
}

function main() {
  console.log("\nWhat a <form> in a section means, driven directly")

  check("an email box with nowhere of its own to go collects for the creator",
    formIntent(form({}, true)) === "subscribe",
    "this is the default the builder promises, even when the section's author said nothing")
  check("and `action=\"#\"`, which is what the url filter leaves for an empty setting, counts as nowhere",
    formIntent(form({ action: "#" }, true)) === "subscribe")
  check("saying so explicitly always wins, even over an action",
    formIntent(form({ "data-storelib-form": "subscribe", action: "https://list.example/join" }, true)) === "subscribe")
  check("a form posting to another mailing list is left to the browser",
    formIntent(form({ action: "https://list.example/join" }, true)) === "native")
  check("and so is one explicitly marked native",
    formIntent(form({ "data-storelib-form": "native" }, true)) === "native")
  check("a search box posting to the site is left alone",
    formIntent(form({ action: "/search" }, false)) === "native",
    "treating every form as a sign-up would break search")
  check("a form with no action and no email box goes nowhere, and is stopped rather than reloading the page",
    formIntent(form({}, false)) === "inert")
  check("the attribute is read case-insensitively",
    formIntent(form({ "data-storelib-form": "Subscribe" }, false)) === "subscribe")

  console.log("\nThe section host follows it on every published page")

  const host = read("components/website-builder/sections/StorelibSection.tsx")
  check("it reads the rule rather than a copy of it", /import \{ formIntent \} from "@\/lib\/website-builder\/form-intent"/.test(host))
  check("it is attached to the section's markup",
    /onSubmitCapture=\{onSubmit\}/.test(host))
  check("the canvas never submits and never leaves the editor",
    /* lib/website-builder/subscribe-client signupMode: in the canvas a form is a preview. */
    /if \(signupMode\(\{ inEditor: inCanvas, creatorId \}\) === "preview"\) \{\s*\n\s*e\.preventDefault\(\)/.test(host),
    "designing a page is not signing up to it")
  check("a native form is let through untouched", /if \(intent === "native"\) return/.test(host))
  check("the result is written as text, never as markup",
    /note\.textContent = message/.test(host) && !/innerHTML/.test(host.slice(host.indexOf("function settle"), host.indexOf("export function StorelibSection"))),
    "a server's error message written as HTML is an injection point")
  check("and the section's CSS can style the state", /form\.dataset\.state = state/.test(host))

  console.log("\nThe shipped newsletter collects with nothing set up")

  const nl = read("themes/default/sections/promo_newsletter.storelib")
  check("its form is drawn whether or not an outside address is set",
    !/\{% if settings\.action %\}\s*\n\s*<form/.test(nl),
    "the box used to stay hidden until a Mailchimp URL was pasted")
  check("and is marked subscribe unless an outside list is chosen",
    /data-storelib-form="\{% if settings\.action %\}native\{% else %\}subscribe\{% endif %\}"/.test(nl))
  check("the setting says what leaving it empty does",
    /Leave this empty and sign-ups go to Subscribers in your dashboard/.test(nl))
  check("and the bundled copy of the theme was regenerated from it",
    /data-storelib-form/.test(read("themes/default/sources.generated.ts")),
    "the editor and the published site read the generated module, not the file")

  console.log("\nThe footer and the contact form")

  const footer = read("components/website-builder/sections/renderers/FooterSection.tsx")
  check("the footer's box posts, instead of swallowing the submit",
    !/onSubmit=\{\(e\) => e\.preventDefault\(\)\}/.test(footer)
      && /subscribeToCreator\(\{ creatorId, email, placement: "footer" \}\)/.test(footer))
  const contact = read("components/website-builder/sections/renderers/ContactFormSection.tsx")
  check("the contact form offers an unticked box",
    /<input type="checkbox" name="subscribe" value="yes"/.test(contact) && !/defaultChecked/.test(contact))
  /* The contact form sends its message to the contact route now
     (lib/site-contact), which subscribes the sender only on this flag. */
  check("and adds the sender only when it was ticked",
    /consent: offerOptIn && data\.get\("subscribe"\) === "yes"/.test(contact) && /sendContactMessage\(/.test(contact),
    "a contact message is not consent to a mailing list")

  console.log("\nOne client, one endpoint, a consent line that says where")

  const route = read("app/api/website-builder/subscribe/route.ts")
  check("every sign up placement goes through the same client",
    [footer, host].every((src) => /subscribeToCreator\(/.test(src)))
  check("and every contact form through the contact client",
    [contact, host].every((src) => /sendContactMessage\(/.test(src)))
  check("the consent line names where on the page they said yes",
    /footer: "Subscribed via the sign-up box in the footer/.test(route)
      && /contact: "Ticked \\"Keep me updated\\" on the contact form/.test(route))
  check("and the source column keeps the one value already proven in production",
    /source: "website_builder_newsletter"/.test(route),
    "a new value into a column an old CHECK constraint may still guard would fail every insert")
  check("the endpoint is rate limited", /bucket: "subscribe"/.test(route))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
