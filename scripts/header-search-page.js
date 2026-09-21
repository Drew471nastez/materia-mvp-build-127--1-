/**
 * The page half of scripts/check-header-search.mjs: opens the search in each
 * header, measures where the field, the magnifier and the close button
 * actually are, and then tries the three presses a person makes.
 *
 * ONE HEADER AT A TIME for the presses. Every open panel listens on the
 * document, so a press aimed at one of them closes all the others too —
 * which is correct, and which made the first version of this report that
 * pressing the field closed the search. It was closing the two panels the
 * press was not aimed at.
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

  /**
   * The header's own toggle: not the panel's submit button, which carries
   * the same label, and not the one in the mobile drawer, which is drawn at
   * every width and hidden by a media query. A hidden button still answers
   * `.click()`, and the drawer's opens the search on a timer after its own
   * close animation — so picking the first match meant pressing something
   * no visitor can see and measuring the panel before it had opened.
   *
   * The one with a box on the screen is the one a person presses.
   */
  function toggleIn(host) {
    var buttons = host.querySelectorAll("[aria-label='Search']")
    for (var b = 0; b < buttons.length; b++) {
      var el = buttons[b]
      if (el.getAttribute("type") === "submit") continue
      var r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) return el
    }
    return null
  }

  function panelIn(host) {
    var field = host.querySelector(".hdr-search-field")
    return field ? field.closest("[data-self-nav]") : null
  }

  function panelState(host) {
    var panel = panelIn(host)
    if (!panel) return null
    var cs = getComputedStyle(panel)
    return {
      pad: Number(host.dataset.pad),
      opacity: Number(cs.opacity),
      pointerEvents: cs.pointerEvents,
      /*
        THE TRANSITION IS READ FROM THE ELEMENT, NOT FROM COMPUTED STYLE.

        Transitions are turned off below before anything is measured, so
        computed style would report none of them. This is the string React
        put on the element — the one the browser would run — and for a
        closed panel it is the closing one. An instant disappearance and a
        fade look identical in a still, so it is the only way to tell them
        apart here.
      */
      transition: panel.style.transition,
    }
  }

  function press(el) {
    if (!el) return
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }))
  }

  /**
   * A VIRTUAL CLOCK DOES NOT RUN A CSS TRANSITION.
   *
   * The browser here is driven with `--virtual-time-budget`, which races
   * timers forward but leaves transitions where they were. The panel starts
   * at opacity 0 and eases to 1, so every reading of an OPEN panel was 0 —
   * and the first version of this probe read that as "closed" and reported
   * that pressing the field dismissed the search. It had dismissed nothing;
   * the fade had simply never run.
   *
   * With them off, opacity is whatever the state says it is, on the frame it
   * says it. What the transition WOULD have been is read from the element in
   * panelState above.
   */
  function stopTheFades() {
    var kill = document.createElement("style")
    kill.textContent = "*, *::before, *::after { transition: none !important; animation: none !important }"
    document.head.append(kill)
  }

  function openAll(next) {
    stopTheFades()
    hosts.forEach(function (host) {
      var t = toggleIn(host)
      if (t) t.click()
    })
    setTimeout(function () {
      report.afterOpening = hosts.map(panelState)
      next()
    }, 200)
  }

  function measure(i) {
    if (i >= hosts.length) return setTimeout(function () { presses(0) }, 60)
    var host = hosts[i]
    var field = host.querySelector(".hdr-search-field")
    var form = host.querySelector("form[role='search']")
    var submit = form ? form.querySelector("button[type='submit']") : null
    var close = host.querySelector("[aria-label='Close search']")
    /* The panel is `absolute inset-0` of the header, so its box IS the
       header's box: what the field has to sit inside. */
    var panel = panelIn(host)

    report.headers.push({
      pad: Number(host.dataset.pad),
      open: !!(field && field.offsetParent !== null),
      header: box(panel),
      field: box(field),
      submit: box(submit),
      close: box(close),
      /* Whether the magnifier is drawn inside the field or beside it. */
      submitInsideField: !!(field && submit &&
        submit.getBoundingClientRect().right <= field.getBoundingClientRect().right + 1 &&
        submit.getBoundingClientRect().left >= field.getBoundingClientRect().left - 1),
    })
    setTimeout(function () { measure(i + 1) }, 30)
  }

  report.afterPressingTheField = []
  report.afterPressingTheHeader = []
  report.afterPressingAway = []

  /**
   * For one header: press its field, which must change nothing; press the
   * empty part of its own header beside the field, which must close it; and
   * press the page below, which must close it. It is reopened between each,
   * and only its own panel is read.
   */
  function presses(i) {
    if (i >= hosts.length) return done()
    var host = hosts[i]

    /* The toggle TOGGLES, so it is only pressed when the panel is shut.
       Clicking it on an open one closes it, which is how the first version
       of this managed to measure a panel it had just closed itself. */
    function reopen(next) {
      var st = panelState(host)
      if (!st || st.opacity < 0.5) {
        var t = toggleIn(host)
        if (t) t.click()
      }
      setTimeout(next, 120)
    }

    reopen(function () {
      press(host.querySelector(".hdr-search-field"))
      setTimeout(function () {
        report.afterPressingTheField.push(panelState(host))

        /* Not reopened: pressing the field is not supposed to have closed
           it, and reopening here would hide a failure. */
        var panel = panelIn(host)
        var r = panel.getBoundingClientRect()
        /* Ten pixels in from the panel's left edge, which on every one of
           these headers is empty space beside the field. This is the press
           that did nothing: the panel is the whole header, so the dark band
           around the field counted as "inside the panel". */
        var el = document.elementFromPoint(Math.round(r.left + 10), Math.round(r.top + r.height / 2))
        press(el && panel.contains(el) ? el : panel)

        setTimeout(function () {
          report.afterPressingTheHeader.push(panelState(host))
          reopen(function () {
            /*
              JUST UNDER THE HEADER, FOUND BY HIT TESTING.

              This used to dispatch the press straight at a div further down
              the page, which skips the question that matters: what is
              actually AT that point. The suggestions are drawn even when
              empty, and their wrapper is a full-width band hanging directly
              under the header — so the strip of page immediately below it
              was covered by something invisible, and every press there was
              treated as a press on the suggestions. Asking the document
              what is at the point is the only way to see that.
            */
            var panel = panelIn(host)
            var r = panel.getBoundingClientRect()
            var at = document.elementFromPoint(
              Math.round(r.left + r.width / 2),
              Math.round(r.bottom + 12),
            )
            report.underTheHeader = report.underTheHeader || []
            report.underTheHeader.push(at ? at.tagName + "." + String(at.className || "").slice(0, 30) : "nothing")
            press(at)
            setTimeout(function () {
              report.afterPressingAway.push(panelState(host))
              presses(i + 1)
            }, 120)
          })
        }, 120)
      }, 120)
    })
  }

  setTimeout(function () { openAll(function () { measure(0) }) }, 900)
})()
