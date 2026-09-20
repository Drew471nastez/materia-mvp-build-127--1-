/**
 * The page half of scripts/check-sheet-rest.mjs: it drives the sheet and
 * leaves what it measured in a preformatted element the checker reads back.
 *
 * A STEP AT A TIME, with a beat between each. React commits a click's state
 * change on its own schedule and the sheet coalesces its transform writes
 * into a requestAnimationFrame, so reading the DOM on the line after the
 * event that changed it reads what was there before. The first version of
 * this measured the sheet unmoved in the middle of a drag that had plainly
 * moved it, which is a probe reporting on itself.
 */
;(function () {
  var report = {}

  function done() {
    var pre = document.createElement("pre")
    pre.id = "result"
    pre.textContent = JSON.stringify(report)
    document.body.append(pre)
  }

  var sheet, overlay, handle, y

  function top() {
    return Math.round(sheet.getBoundingClientRect().top)
  }

  function touch(type, target, x, yy) {
    var t = new Touch({ identifier: 1, target: target, clientX: x, clientY: yy, pageX: x, pageY: yy })
    var list = type === "touchend" || type === "touchcancel" ? [] : [t]
    target.dispatchEvent(new TouchEvent(type, {
      touches: list, targetTouches: list, changedTouches: [t], bubbles: true, cancelable: true,
    }))
  }

  function bump() {
    document.getElementById("rerender").click()
  }

  var steps = [
    function () {
      sheet = document.querySelector("[data-mobile-bottom-sheet]")
      overlay = document.querySelector("[data-wb-sheet-overlay]")
      if (!sheet || !overlay) throw new Error("the sheet never rendered")

      /* The motion, from live computed style, BEFORE it is turned off. */
      var oc = getComputedStyle(overlay)
      report.fade = { duration: oc.transitionDuration, easing: oc.transitionTimingFunction }
      var anim = {}
      ;["in", "back", "none"].forEach(function (d) {
        var cs = getComputedStyle(document.getElementById("panel-" + d))
        anim[d] = { name: cs.animationName, duration: cs.animationDuration }
      })
      report.panel = anim

      /* A virtual clock does not advance a transition, so where things END
         UP is measured with them off. */
      var kill = document.createElement("style")
      kill.textContent = "*, *::before, *::after { transition: none !important; animation: none !important }"
      document.head.append(kill)

      report.viewport = { w: window.innerWidth, h: window.innerHeight }
      report.atRest = top()
    },

    // ── 1. a drag to the top, with a render landing in the middle of it ──
    function () {
      handle = sheet.firstElementChild
      y = report.atRest + 10
      touch("touchstart", handle, 195, y)
      for (var i = 1; i <= 4; i++) touch("touchmove", handle, 195, y - i * 40)
    },
    /**
     * A render HAS to land while the finger is down, because that is the
     * case being tested: iOS fires visualViewport.scroll during a drag, the
     * content-fit measurement resolves whenever it resolves, the chrome gap
     * is re-probed on resize. That render is what teaches React the sheet is
     * somewhere other than its resting place — and the next render is where
     * it used to decide to put it back.
     */
    bump,
    function () {
      report.midDrag = top()
      report.rendered = document.getElementById("rerender").textContent
    },
    function () {
      for (var k = 5; k <= 8; k++) touch("touchmove", handle, 195, y - k * 40)
      touch("touchend", handle, 195, y - 320)
    },
    function () { report.dragged = top() },
    bump,
    function () { report.afterRender = top() },
    bump,
    function () { report.afterRender2 = top() },

    // ── 2. a slider dragged sideways ────────────────────────────────────
    function () {
      var thumb = document.querySelector("[data-slot='slider-thumb']")
      if (!thumb) throw new Error("no slider thumb")
      report.sliderOptsOut = !!thumb.closest("[data-sheet-no-drag]")
      var tr = thumb.getBoundingClientRect()
      var sx = Math.round(tr.left + tr.width / 2)
      var sy = Math.round(tr.top + tr.height / 2)
      touch("touchstart", thumb, sx, sy)
      /* Ten right, nine down: what a thumb actually does, and not sideways
         enough for the sheet to hand the gesture back. */
      for (var j = 1; j <= 6; j++) touch("touchmove", thumb, sx + j * 10, sy + j * 9)
      report.slider = { x: sx, y: sy }
    },
    /**
     * And a render, because dragging a slider IS a render: the value changes,
     * the editor re-renders, and the sheet re-renders with it. That render is
     * what draws the sheet wherever the drag believes it is — the glitch.
     */
    bump,
    /* Mid-gesture, which is where the glitch is: the sheet following a finger
       that is dragging a slider. A snap can hide it by landing back on the
       stop it started from. */
    function () { report.midSlider = top() },
    function () {
      touch("touchend", document.querySelector("[data-slot='slider-thumb']"), report.slider.x + 60, report.slider.y + 54)
    },
    function () { report.afterSlider = top() },

    // ── 3. a field taking focus ─────────────────────────────────────────
    function () { document.getElementById("text-field").focus() },
    bump,
    function () { report.afterFocus = top() },
  ]

  function run(i) {
    if (i >= steps.length) return done()
    try {
      steps[i]()
    } catch (e) {
      report.error = String((e && e.message) || e)
      return done()
    }
    setTimeout(function () { run(i + 1) }, 80)
  }

  setTimeout(function () { run(0) }, 900)
})()
