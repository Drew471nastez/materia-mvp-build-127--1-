# JavaScript and forms

## Status: scripts run, in a sandbox

A section's `<script>` block is compiled and checked when the file is saved, and **run on the page, and in the builder, inside a sandbox**. It works for sliders that advance, counters, tabs with custom behaviour, and anything else built from listeners, classes, styles and text.

**Prefer HTML and CSS where they do the job alone.** They work before any script has loaded, they are faster, and they come with keyboard support. The patterns in the next part cover accordions, tabs, carousels, pop-ups and motion with no script at all. Reach for a script for what they cannot do: autoplay, a counter, a slider's dots.

### How the sandbox works

A section's script does not run in the page it is on. That page may have a visitor who is signed in, has a cart, or is halfway through a checkout, and a section's code is written by whoever wrote the section. So it runs in one hidden `<iframe sandbox="allow-scripts">` per page, whose origin is opaque: it cannot read the visitor's cookies, storage or session, and it cannot see the page.

Inside, `root` is **a copy of your section's own markup**, in a real document. `querySelector`, `classList`, `addEventListener`, `style` and `textContent` all work the ordinary way. Every change you make to the copy is sent to the page, checked, and applied to the real section. Every click, key and input on the real section is sent to the copy, so your listeners run.

| Crosses to the page | Does not |
| --- | --- |
| Classes, `hidden`, `open`, `aria-*`, `data-*`, and the other attributes that describe rather than load | `src`, `href`, `action`, `on*` and anything else that loads or runs something |
| Style properties, one at a time | A style value with `url(`, `expression(`, `javascript:` or a backslash |
| Text of an element that holds only text | Markup. Text arrives as text, never as HTML |
| Scrolling, through `storelib.scrollTo` | Adding or removing elements |
| | Measurements. The copy is not laid out, so `getBoundingClientRect` and `offsetWidth` return 0 |

**Show and hide what the template drew.** A script cannot add an element, because the page's copy belongs to the renderer and would be put back. Draw every slide, message or panel in the template, and switch between them with `hidden` or a class.

**Scroll with `storelib.scrollTo`.** Setting `scrollLeft` changes the copy, which is not what the visitor sees:

```js
storelib.scrollTo(track, { left: slideWidth * index, behavior: "smooth" })
```

**Know where you are.** `storelib.inEditor` is `true` in the builder's canvas, so an autoplaying slider can hold still while somebody is designing it.

A script that throws stops on its own, and the section keeps whatever it had drawn. A script that changes the page thousands of times a second is stopped.

## Interaction without script

### Accordion

`<details>` and `<summary>` are an accordion with no script, keyboard support included. Give several the same `name` and opening one closes the others. Build the name from `section.id` so two FAQ sections on one page stay independent.

```storelib
{% for block in blocks %}
  <details class="faq__item" name="{{ section.id }}-faq" data-block-id="{{ block.id }}">
    <summary class="faq__q">{{ block.settings.question }}</summary>
    <div class="faq__a">{{ block.settings.answer | raw }}</div>
  </details>
{% endfor %}
```

```css
.faq__q { cursor: pointer; list-style: none; padding: 18px 0; font-weight: 600; }
.faq__q::-webkit-details-marker { display: none; }
.faq__q::after { content: "+"; float: right; transition: transform 200ms ease; }
.faq__item[open] .faq__q::after { transform: rotate(45deg); }
```

### Tabs

Radio inputs sharing a name, each followed by its label and panel. `order` puts the labels in a row and the panels beneath them; `:checked` shows the chosen one.

```storelib
<div class="tabs">
  {% for block in blocks %}
    <input class="tabs__radio" type="radio" name="{{ section.id }}-tab" id="{{ section.id }}-{{ block.id }}"{% if forloop.first %} checked{% endif %}>
    <label class="tabs__label" for="{{ section.id }}-{{ block.id }}" data-block-id="{{ block.id }}">{{ block.settings.title }}</label>
    <div class="tabs__panel">{{ block.settings.content | raw }}</div>
  {% endfor %}
</div>
```

```css
.tabs { display: flex; flex-wrap: wrap; }
.tabs__radio { position: absolute; opacity: 0; pointer-events: none; }
.tabs__label { order: 0; padding: 10px 16px; cursor: pointer; border-bottom: 2px solid transparent; color: var(--scheme-text); }
.tabs__panel { order: 1; width: 100%; display: none; padding-top: 20px; }
.tabs__radio:checked + .tabs__label { border-color: var(--scheme-accent); color: var(--scheme-heading); }
.tabs__radio:checked + .tabs__label + .tabs__panel { display: block; }
.tabs__radio:focus-visible + .tabs__label { outline: 2px solid var(--scheme-accent); outline-offset: 2px; }
```

### Carousel

A row that scrolls sideways and snaps to each slide. It swipes on a phone, scrolls with a trackpad and a keyboard, and needs no script.

```css
.slides {
  display: flex; gap: 16px;
  overflow-x: auto; overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory; scrollbar-width: none;
}
.slides::-webkit-scrollbar { display: none; }
.slide { flex: 0 0 85%; scroll-snap-align: start; }
@container (min-width: 768px) { .slide { flex-basis: calc((100% - 32px) / 3); } }
```

### Pop-up

The `popover` attribute gives a panel the browser opens, closes and dismisses, with Escape and a tap outside, and no script. In the builder it opens inside the canvas, with the same Escape and tap outside; style its open state with `:popover-open`.

```storelib
<button class="more" popovertarget="{{ section.id }}-details">Size guide</button>
<div class="sheet" popover id="{{ section.id }}-details">
  {{ settings.size_guide | raw }}
  <button popovertarget="{{ section.id }}-details" popovertargetaction="hide">Close</button>
</div>
```

### Motion

Motion is the section's own CSS: transitions and `@keyframes` however the design needs them. `@media (prefers-reduced-motion: reduce)` is a courtesy, not a rule that refuses a file. See [Styling](/developers/styling#responsive).

## Forms

**An email box on a Storelib site collects emails for that site's creator.** A form in a section is submitted by the page that hosts it, not by a script, and every address lands in the creator's Subscribers, where their welcome email and automations pick it up. The section's author wires nothing, and the creator sets nothing up.

```storelib
<form class="signup" data-storelib-form="subscribe">
  <label class="signup__label" for="{{ section.id }}-email">Email</label>
  <input id="{{ section.id }}-email" type="email" name="email" required autocomplete="email" placeholder="you@example.com">
  <button type="submit">{{ settings.button_text }}</button>
  <p class="signup__done" data-storelib-success hidden>{{ settings.success_message }}</p>
</form>
```

### How the page decides what a form means

| The form has | It is |
| --- | --- |
| `data-storelib-form="subscribe"` | Sent to the creator's Subscribers. Saying so explicitly always wins. |
| `data-storelib-form="contact"` | A message to the creator. See [Contact forms](#contact-forms). Never the default: a form has to say it is one. |
| `data-storelib-form="native"` | Left to the browser, action and all. |
| No attribute, no `action`, and an `<input type="email">` | Sent to the creator's Subscribers. This is the default, so a sign-up box works even when its author did not say. |
| No attribute and a real `action` | Left to the browser, such as a search box posting to `/search`. |
| Anything else | Stopped, so a form with nowhere to go does not reload the page. |

The email is read from the form's `<input type="email">`, and an optional name from `name="name"`.

### States

While it sends, the form carries `data-state="sending"` and its buttons are disabled. It then carries `data-state="done"` or `data-state="error"`, so your CSS can style each:

```css
.signup[data-state="sending"] button { opacity: 0.6; }
.signup[data-state="error"] input { border-color: #b91c1c; }
```

On success, an element inside the form marked `data-storelib-success` is shown and the rest of the form is hidden. Without one, a plain "Thanks, you're on the list." is shown instead. On error, the reason is shown under the form, which stays filled in so nobody has to type their address again.

### In the builder

Nothing is sent from the builder's canvas. A sign-up form there shows its success state with the line "Sign-ups go to Subscribers on your live site", because designing a page is not signing up to it.

### Sending to another mailing service

To post to Mailchimp, Kit, Buttondown or anything else instead, give the form that service's `action` and mark it native. A setting lets the creator choose:

```storelib
<form method="post"
  action="{% if settings.list_url %}{{ settings.list_url | url }}{% endif %}"
  data-storelib-form="{% if settings.list_url %}native{% else %}subscribe{% endif %}">
```

### Consent

A sign-up form is a request to be emailed, and the platform records where on the page it was given. A **contact** form is not: somebody asking a question has not agreed to a mailing list. Never make a contact form add its sender to Subscribers. Offer an unticked "Keep me updated" checkbox instead, and add the sender only when it was ticked.

Sign-ups are rate limited per visitor and per address, so a script cannot fill a creator's list.

### Contact forms

A form marked `data-storelib-form="contact"` sends a message to the creator. It is emailed to them, with Reply going to the sender, and kept on the sender's page in Emails. The page reads the fields by name:

| Field | |
| --- | --- |
| `email` | Required. |
| `message` | Required, up to 5,000 characters. |
| `name`, `subject` | Optional. |
| `consent` | An unticked checkbox. Only a ticked one adds the sender to Subscribers; otherwise they are kept as a contact who wrote, and never sent news. |
| `company` | Leave it empty and hidden from people. A value in it is a script, which is told the message went and nothing is sent. |

```storelib
<form class="cf" data-storelib-form="contact">
  <label>Name <input name="name" autocomplete="name"></label>
  <label>Email <input name="email" type="email" autocomplete="email" required></label>
  <label>Message <textarea name="message" required></textarea></label>
  <div class="cf__trap" aria-hidden="true"><input name="company" tabindex="-1" autocomplete="off"></div>
  <label><input type="checkbox" name="consent" value="yes"> Email me news from {{ shop.name }}</label>
  <button type="submit">Send</button>
  <p data-storelib-success hidden>Thanks, your message has been sent.</p>
</form>
```

A form sent within a couple of seconds of the page appearing is treated as a script too, and messages are rate limited per visitor, per address and per store.

## Saving products

A button with `data-storelib-wishlist="<product id>"` saves that product to the visitor's Wishlist, and takes it out again. The page sets `aria-pressed` to `"true"` or `"false"` on every such button to say whether the product is saved, so your CSS draws both states. Put it inside the card, above the card's link:

```storelib
{% for block in products %}
  <article class="card">
    <button type="button" class="heart" data-storelib-wishlist="{{ block.id }}" aria-pressed="false" aria-label="Save {{ block.settings.title }}">♡</button>
    <a class="card__link" href="{{ block.settings.url | url }}">{{ block.settings.title }}</a>
  </article>
{% endfor %}
```

```css
.heart { position: relative; z-index: 2; }
.heart[aria-pressed="true"] { color: var(--scheme-accent); }
```

Only `products` carry an id that can be saved. A visitor who is not signed in keeps the list in their browser; signing in moves it to their account. On the Wishlist page, a card marked `data-storelib-wishlist-card="<product id>"` is hidden when its product is taken out, and an element marked `data-storelib-wishlist-empty` is shown once none are left.

## The cart, search and menu

The same way, a button marked `data-storelib-cart` opens the site's cart drawer, `data-storelib-search` its search window and `data-storelib-menu` its menu drawer, and an element marked `data-storelib-cart-count` shows the cart's count. The page does it, not a script. They are for a header of your own: see [The site's drawers](/developers/header-and-footer#the-sites-drawers).

## Embeds

An `<iframe>` hands part of the page to somebody else's code, so a section does not get one by asking. It declares the `embed` capability, and every frame takes its address from the `embed` filter:

```json
"capabilities": ["embed"]
```

```storelib
{% if settings.video_url != "" %}
  <iframe class="player" src="{{ settings.video_url | embed }}" title="{{ settings.video_title }}"
    loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
{% endif %}
```

```css
.player { display: block; width: 100%; aspect-ratio: 16 / 9; border: 0; border-radius: {{ theme.radius.medium }}px; }
```

The filter turns what people actually paste, a `youtu.be` link, a `watch?v=` link, a Vimeo page, into the player's address, and returns an empty string for everything else. A setting therefore cannot point a frame at an arbitrary site, whatever somebody types into it. It answers for:

@[embed-hosts]

YouTube links are served from `youtube-nocookie.com`. An `<iframe>` without the capability, or whose `src` comes from anywhere but the filter, is refused when the file is saved.

## The scripting API

The script is wrapped as a function and handed six things:

```js
"use strict";
(function (root, settings, blocks, theme, page, storelib) {
  // your <script> block
})
```

| Name | What it is |
| --- | --- |
| `root` | A copy of this instance's markup, in the sandbox. Query inside it; it is the whole of the page the script can see. |
| `settings`, `blocks` | The values **stored** on this instance, as plain objects: what its preset set and what the creator changed. Schema defaults are not filled in, and a responsive value is as stored. |
| `theme` | The theme settings as saved, not the tokens a template reads. |
| `page` | `{ template }`. |
| `storelib` | The platform API: `scrollTo`, `inEditor`, `capabilities`, and whatever the section's declared capabilities add. |

So a setting the creator never touched is `undefined` in a script, even though the template drew its default. For a value the template has worked out, write it into the markup and read it back from there:

```storelib
<div class="slider" data-autoplay="{{ settings.autoplay }}" data-interval="{{ settings.interval }}">
```

A slider that advances on its own and on a click. Every slide is in the template; the script only chooses which one shows. It declares `"capabilities": ["timers"]` for `setInterval`:

```js
const box = root.querySelector(".slider")
const autoplay = box.dataset.autoplay === "true"
const seconds = Number(box.dataset.interval) || 5
const slides = root.querySelectorAll(".slide")
const dots = root.querySelectorAll(".dot")
let current = 0
function show(i) {
  current = (i + slides.length) % slides.length
  slides.forEach((el, j) => el.toggleAttribute("hidden", j !== current))
  dots.forEach((el, j) => el.classList.toggle("is-on", j === current))
}
root.querySelector("[data-next]")?.addEventListener("click", () => show(current + 1))
root.querySelector("[data-prev]")?.addEventListener("click", () => show(current - 1))
dots.forEach((el, j) => el.addEventListener("click", () => show(j)))
show(0)
if (!storelib.inEditor && autoplay) setInterval(() => show(current + 1), seconds * 1000)
```

### What a script cannot name

These are refused by name when the file is saved. The check skips strings, comments and property access, so `"window"` in a string and `obj.window` are fine; only the bare name is refused.

@[forbidden]

Querying inside `root`, never the document, is also what makes a section safe to place twice on one page.

### Capabilities

A section declares what it needs in its schema, under `capabilities`. The builder does not show a creator what a section declares yet, so declare only what the section uses. Everything a capability exposes goes to Storelib's own endpoints for that site; a section never gets an arbitrary host.

@[capabilities]

In a section with a script, an unknown capability is refused, listing the ones that exist. A script is limited in size:

@[limits]
