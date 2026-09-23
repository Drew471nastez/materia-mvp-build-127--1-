# JavaScript and forms

## Status: scripts are checked, not run

A section's `<script>` block is **compiled and checked when the file is saved, and stored, but not executed on the page yet**. The sandbox that will run section scripts has not shipped. Until it does, anything built in a script, a slider that advances, a tab that switches, a menu that opens, does nothing for a visitor.

So build every interaction with HTML and CSS. The browser already does almost everything a section needs, it works today, it keeps working when scripts do run, and it is faster and more accessible than the script it replaces. The patterns below cover what sections actually ask for.

This page is marked here, rather than in small print, because an agent that believes the script runs will write one, and a creator will publish a section that looks finished and does nothing.

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

The `popover` attribute gives a panel the browser opens, closes and dismisses, with Escape and a tap outside, and no script.

```storelib
<button class="more" popovertarget="{{ section.id }}-details">Size guide</button>
<div class="sheet" popover id="{{ section.id }}-details">
  {{ settings.size_guide | raw }}
  <button popovertarget="{{ section.id }}-details" popovertargetaction="hide">Close</button>
</div>
```

### Motion

CSS transitions and `@keyframes`, on `opacity` and `transform`, which are cheap to animate. Height from `0` to `auto` does not transition; animate `grid-template-rows` from `0fr` to `1fr` instead. Every animation stops for a visitor who has asked for reduced motion; see [Styling](/developers/styling#responsive).

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

What follows is the contract section scripts will run under. It is enforced now, when a file is saved, so a script written against it today compiles today and runs unchanged when the runtime ships.

The script is wrapped as a function and handed six things:

```js
"use strict";
(function (root, settings, blocks, theme, page, storelib) {
  // your <script> block
})
```

| Name | What it is |
| --- | --- |
| `root` | This instance's root element. Query inside it; it is the whole of the page the script can see. |
| `settings`, `blocks`, `theme`, `page` | The same resolved data the template rendered from, as plain objects. |
| `storelib` | The platform API. What is on it depends on the capabilities the section declares. |

```js
const slides = root.querySelectorAll(".slide")
let current = 0
function show(i) {
  current = (i + slides.length) % slides.length
  slides.forEach((el, j) => el.toggleAttribute("hidden", j !== current))
}
root.querySelector("[data-next]")?.addEventListener("click", () => show(current + 1))
root.querySelector("[data-prev]")?.addEventListener("click", () => show(current - 1))
show(0)
```

### What a script cannot name

These are refused by name when the file is saved. The check skips strings, comments and property access, so `"window"` in a string and `obj.window` are fine; only the bare name is refused.

@[forbidden]

Querying inside `root`, never the document, is also what makes a section safe to place twice on one page.

### Capabilities

A section declares what it needs in its schema, and the builder shows the creator what each section has been granted. Everything a capability exposes goes to Storelib's own endpoints for that site; a section never gets an arbitrary host.

@[capabilities]

An unknown capability is refused, listing the ones that exist. A script is limited in size:

@[limits]
