/**
 * The page half of scripts/check-header-search.mjs: opens the search in each
 * header and measures where the field, the magnifier and the close button
 * actually are.
 */
;(function () {
  var report = { headers: [], viewport: window.innerWidth }

  function done() {
    var pre = document.createElement("pre")
    pre.id = "result"
    pre.textContent = JSON.stringify(report)
    document.body.append(pre)
  }

  function box(el) {
    if (!el) return null
    var r = el.getBoundingClientRect()
    return {
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      left: Math.round(r.left), right: Math.round(r.right),
      w: Math.round(r.width), h: Math.round(r.height),
      midY: Math.round(r.top + r.height / 2),
      midX: Math.round(r.left + r.width / 2),
    }
  }

  var hosts = Array.prototype.slice.call(document.querySelectorAll("[data-mount]"))

  function open(i) {
    if (i >= hosts.length) return measure(0)
    var host = hosts[i]
    /* The header's own toggle, not the panel's submit button, which carries
       the same label. */
    var buttons = host.querySelectorAll("[aria-label='Search']")
    var toggle = null
    for (var b = 0; b < buttons.length; b++) {
      if (buttons[b].getAttribute("type") !== "submit") { toggle = buttons[b]; break }
    }
    if (toggle) toggle.click()
    setTimeout(function () { open(i + 1) }, 120)
  }

  function measure(i) {
    if (i >= hosts.length) return done()
    var host = hosts[i]
    var field = host.querySelector(".hdr-search-field")
    var form = host.querySelector("form[role='search']")
    var submit = form ? form.querySelector("button[type='submit']") : null
    var close = host.querySelector("[aria-label='Close search']")
    /* The panel is `absolute inset-0` of the header, so its box IS the
       header's box: what the field has to sit inside. */
    var panel = field ? field.closest("[data-self-nav]") : null

    report.headers.push({
      pad: Number(host.dataset.pad),
      open: !!(field && field.offsetParent !== null),
      header: box(panel),
      field: box(field),
      submit: box(submit),
      close: box(close),
      /* Whether the magnifier is drawn inside the field or beside it. */
      row: box(panel ? panel.firstElementChild : null),
      inner: box(form ? form.parentElement : null),
      form: box(form),
      cs: field ? (function(){ var c=getComputedStyle(field); return { alignSelf:c.alignSelf, height:c.height, maxHeight:c.maxHeight, minHeight:c.minHeight, boxSizing:c.boxSizing } })() : null,
      submitInsideField: !!(field && submit &&
        submit.getBoundingClientRect().right <= field.getBoundingClientRect().right + 1 &&
        submit.getBoundingClientRect().left >= field.getBoundingClientRect().left - 1),
    })
    setTimeout(function () { measure(i + 1) }, 30)
  }

  setTimeout(function () { open(0) }, 900)
})()
