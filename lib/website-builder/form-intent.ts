/**
 * ===========================================================================
 *  WHAT A <form> IN A SECTION MEANS
 * ===========================================================================
 * A section written in the Storelib Builder Framework cannot run script yet:
 * its `<script>` is validated and stored, and the sandbox that runs it is not
 * built (docs/theme/09). So a form in a section cannot submit itself anywhere.
 * The page hosting it can, and this is the rule the host follows.
 *
 *   data-storelib-form="subscribe"      the creator's Subscribers. Say so
 *                                       explicitly and this always wins.
 *   data-storelib-form="contact"        a message to the creator: kept for
 *                                       them, emailed to them with Reply
 *                                       going to the sender, and the sender
 *                                       recorded as a contact who wrote.
 *                                       Only a ticked name="consent" box
 *                                       makes them a subscriber. Never the
 *                                       default: a form has to say it is one.
 *   data-storelib-form="native"         leave it to the browser, action and
 *                                       all, e.g. a search box or a form
 *                                       posting to another mailing service.
 *   no attribute, no action, has an     the creator's Subscribers. This is the
 *   <input type="email">                default the builder promises: an email
 *                                       box on a Storelib site collects emails
 *                                       for that site's creator, even when the
 *                                       section's author did not think to say.
 *   no attribute, has a real action     native.
 *   anything else                       inert: a form with nowhere to go. The
 *                                       host stops it rather than letting the
 *                                       browser reload the page with the
 *                                       fields in the address bar.
 *
 * The Developer Hub documents this at /developers/javascript#forms, and the
 * builder's AI is taught it from the same text. It is a pure function of the
 * form's attributes so it can be tested without a browser.
 */

export type FormIntent = "subscribe" | "contact" | "native" | "inert"

/** The parts of a form element this reads. An HTMLFormElement satisfies it. */
export interface FormLike {
  getAttribute(name: string): string | null
  querySelector(selector: string): unknown
}

/** `""` and `"#"` are what the `url` filter leaves when there was no address. */
function hasRealAction(form: FormLike): boolean {
  const action = (form.getAttribute("action") ?? "").trim()
  return action !== "" && action !== "#"
}

export function formIntent(form: FormLike): FormIntent {
  const declared = (form.getAttribute("data-storelib-form") ?? "").trim().toLowerCase()
  if (declared === "subscribe") return "subscribe"
  if (declared === "contact") return "contact"
  if (declared === "native") return "native"

  if (hasRealAction(form)) return "native"
  if (form.querySelector('input[type="email"]')) return "subscribe"
  return "inert"
}
