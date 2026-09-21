/*
  Runs in the page once the probe bundle has mounted, and reads back what
  scripts/onepage-stability-observe.js has been recording since before it.
*/
(function () {
  /* Both layouts are in the DOM at once and CSS hides one, so anything read
     without this filter may well be the copy the visitor cannot see. */
  function visible(el) {
    if (!el || !el.offsetParent) return false
    var r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  var root = document.getElementById("root")

  /*
    THE SLIDER IS A SCROLLER NOW, so this is what identifies it: a visible
    element that scrolls sideways and holds more than it can show. It used to
    be found by its inline translate3d, which stopped existing when the
    hand-rolled drag was removed.
  */
  function findScroller() {
    var all = document.getElementById("root").querySelectorAll("div")
    for (var i = 0; i < all.length; i++) {
      if (!visible(all[i])) continue
      var cs = getComputedStyle(all[i])
      if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && all[i].scrollWidth > all[i].clientWidth + 8) return all[i]
    }
    return null
  }
  /*
    The counters are set up in scripts/onepage-stability-observe.js, which is
    loaded BEFORE the bundle. It has to be: React finishes its first mount in
    a microtask, so an observer started in this script — a later <script>, a
    later task — never sees the page being built, and the width a slide was
    born with is exactly the thing that mount decides.
  */
  var probe = window.__probe

  function report(obj) {
    var pre = document.createElement("pre")
    pre.id = "probe-result"
    pre.textContent = JSON.stringify(obj)
    document.body.appendChild(pre)
  }

  setTimeout(function () {
    /* First paint has settled. Snapshot, then disturb. */
    /* The avatar is the first image the page draws that is not a slide. */
    var track0 = findScroller()
    var allImgs = root.querySelectorAll("img")
    var avatar = null
    for (var b = 0; b < allImgs.length; b++) {
      if (String(allImgs[b].getAttribute("src") || "").indexOf("avatarmark") !== -1 && visible(allImgs[b])) { avatar = allImgs[b]; break }
    }
    /* Both layouts are mounted at once, so count how many copies exist. */
    var avatarCopies = 0
    for (var c = 0; c < allImgs.length; c++) {
      if (String(allImgs[c].getAttribute("src") || "").indexOf("avatarmark") !== -1) avatarCopies++
    }
    var avatarCs = avatar ? getComputedStyle(avatar) : null

    /* The carousel: a scroller with more in it than fits. */
    var track = findScroller()
    var divs = root.querySelectorAll("div")
    var itemWidths = []
    var itemPixels = []
    if (track) {
      for (var k = 0; k < track.children.length; k++) {
        itemWidths.push(track.children[k].style.width)
        itemPixels.push(Math.round(track.children[k].getBoundingClientRect().width * 100) / 100)
      }
    }
    var containerBox = track ? Math.round(track.getBoundingClientRect().width * 100) / 100 : 0

    var beforeAdded = probe.imgAdded
    var beforeRemoved = probe.imgRemoved

    /* What a phone does constantly: scroll. The page flips buttonsVisible. */
    window.scrollTo(0, 400)
    window.dispatchEvent(new Event("scroll"))

    setTimeout(function () {
      var churnAdded = probe.imgAdded - beforeAdded
      var churnRemoved = probe.imgRemoved - beforeRemoved

      /*
        WHAT IS READ HERE IS THE SHAPE OF THE SLIDER, NOT ITS BEHAVIOUR.

        An assertion that a synthetic swipe leaves scrollLeft alone was tried
        and removed: break-tested against a listener that did scrollLeft += 20
        on every touchmove, it still reported no movement, so it could not
        catch the thing it claimed to. A dispatched TouchEvent does not drive
        a native scroller, and nothing dispatched can.

        Behaviour under a finger is measured where a finger can be simulated
        properly — scripts/check-onepage-drag.mjs, through the browser's own
        input pipeline, against the deployed page. What belongs here is what
        the markup promises: that the row is a scroller at all, that it snaps,
        and that its slides are snap targets.
      */
      var snap = null
      var slideSnap = null
      if (track) {
        snap = getComputedStyle(track).scrollSnapType
        slideSnap = track.children.length ? getComputedStyle(track.children[0]).scrollSnapAlign : null
      }

      /*
        ═══════════════════════════════════════════════════════════════════
         THE ARROW HAS TO MOVE THE PICTURE, NOT JUST THE DOT
        ═══════════════════════════════════════════════════════════════════
        Reported exactly that way: "it just updates the navigation dots, but
        the images don't move at all, even if I click the arrows". The build
        that did it positioned the row with a transform computed from a
        measured width while the dots came from separate React state, so when
        the measurement was 0 the dots advanced over a gallery that never
        moved. Nothing here could have caught it, because nothing here looked
        at where a picture was.
      */
      /* The carousel's own root. Named apart from the page root above, which
         this shadowed on the first attempt and quietly turned the image count
         into a count of the carousel's images. */
      /*
        SMOOTH SCROLLING DOES NOT ADVANCE UNDER A VIRTUAL CLOCK.

        Same trap as CSS transitions in headless Chromium: the page is driven
        by --virtual-time-budget, and an animated scroll never gets there, so
        the arrow appeared to move nothing. What is under test here is WHERE
        the arrow scrolls to, not how prettily it gets there, so the animation
        is turned off for the measurement and left alone in the product.
      */
      var realScrollTo = Element.prototype.scrollTo
      Element.prototype.scrollTo = function (opts) {
        if (opts && typeof opts === "object") return realScrollTo.call(this, { ...opts, behavior: "auto" })
        return realScrollTo.apply(this, arguments)
      }

      var carouselRoot = track ? (track.closest(".group") || track.parentElement) : null
      var arrow = carouselRoot ? carouselRoot.querySelector('button[aria-label="Next image"]') : null
      var pictureBefore = track ? Math.round(track.children[0].getBoundingClientRect().left) : null
      if (arrow) arrow.click()

      setTimeout(function () {
        var pictureAfter = track ? Math.round(track.children[0].getBoundingClientRect().left) : null

        /*
          AND THE DOT FILLS BY DEGREES.

          Parked exactly halfway between two slides, neither dot is the
          winner: both should be about half grown. Two values — one long pill
          and four short ones — is the snap that was reported as "too direct".
        */
        /*
          MANDATORY SNAP WILL NOT LET IT REST BETWEEN TWO SLIDES.

          Setting scrollLeft to the midpoint and reading it back gave the
          snap point instead: asked 198, got 395. That is correct — x
          mandatory decides where a scroll comes to REST, and this is asking
          about a position it only ever passes through, which is where the
          dot fill has to be half way across. So the snapping is lifted for
          the measurement and put straight back.
        */
        var dotWidths = null
        var halfway = null
        if (track && carouselRoot && track.children.length > 1) {
          var step = track.children[1].offsetLeft - track.children[0].offsetLeft
          var snapWas = track.style.scrollSnapType
          track.style.scrollSnapType = "none"
          track.scrollLeft = step * 0.5
          track.dispatchEvent(new Event("scroll"))
          halfway = { step: Math.round(step), asked: Math.round(step * 0.5), got: Math.round(track.scrollLeft), snapWas: snapWas }
        }

        setTimeout(function () {
          if (carouselRoot) {
            var dots = carouselRoot.querySelectorAll('button[aria-label^="Go to slide"]')
            dotWidths = []
            for (var d = 0; d < dots.length; d++) {
              dotWidths.push(Math.round(dots[d].getBoundingClientRect().width * 10) / 10)
            }
            halfway.current = []
            for (var d2 = 0; d2 < dots.length; d2++) halfway.current.push(dots[d2].getAttribute("aria-current"))
            halfway.inlineWidth = dots[0].style.width || "(none)"
            halfway.scrollNow = Math.round(track.scrollLeft)
            /* Put the snapping back only once the reading is taken: restoring
               it first let the scroller snap away from the position being
               measured before anything was read. */
            track.style.scrollSnapType = halfway.snapWas
          }

          /*
            ═══════════════════════════════════════════════════════════════
             PRESSING AWAY CLOSES THE SUBSCRIBE PANEL
            ═══════════════════════════════════════════════════════════════
            There was only the small x, so anywhere else you pressed left it
            sitting open over the page.

            Read through pointer-events rather than opacity: the panel fades
            over 300ms and a virtual clock does not advance a transition, so
            opacity still says 1 long after the decision to close has been
            made. pointer-events is switched by the class outright, which is
            the decision itself.

            And a step between each reading, because React commits a click's
            state change after the handler returns — reading straight after
            .click() reads the panel as it was before the press, which is how
            the first version of this reported that the bell did not open it.
          */
          var bellSvg = document.querySelector("#root button svg")
          var bellButton = bellSvg ? bellSvg.closest("button") : null
          var panel = bellButton ? bellButton.parentElement.querySelector(":scope > div") : null
          var readPanel = function () { return panel ? getComputedStyle(panel).pointerEvents : null }
          var subscribe = panel ? { beforeOpening: readPanel(), fade: getComputedStyle(panel).transitionDuration,
                                    panelClass: String(panel.className).slice(0, 60) } : null
          if (bellButton) bellButton.click()

          setTimeout(function () {
            if (subscribe) subscribe.whenOpen = readPanel()
            document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }))

            setTimeout(function () {
              if (subscribe) subscribe.afterPressingAway = readPanel()

      report({
        imgCount: root.querySelectorAll("img").length,
        imgList: (function () {
          var l = [], q = root.querySelectorAll("img")
          for (var z = 0; z < q.length && z < 20; z++) {
            l.push({ cls: String(q[z].className).slice(0, 44), src: String(q[z].getAttribute("src") || "").slice(0, 28) })
          }
          return l
        })(),
        scrolled: { y: window.scrollY, height: document.documentElement.scrollHeight, view: window.innerHeight },
        avatar: avatarCs ? {
          filter: avatarCs.filter,
          animationName: avatarCs.animationName,
          className: String(avatar.className).slice(0, 80),
          loading: avatar.getAttribute("loading"),
          decoding: avatar.getAttribute("decoding"),
        } : null,
        trackFound: !!track,
        avatarCopies: avatarCopies,
        avatarList: (function () {
          var l = [], q = root.querySelectorAll("img")
          for (var z = 0; z < q.length; z++) {
            if (String(q[z].getAttribute("src") || "").indexOf("avatarmark") === -1) continue
            var cs = getComputedStyle(q[z])
            l.push({ cls: String(q[z].className).slice(0, 60), vis: visible(q[z]), filter: cs.filter, anim: cs.animationName })
          }
          return l
        })(),
        itemWidths: itemWidths,
        widthValuesSeen: probe.widthValues,
        bornWidths: probe.bornWidths,
        churnOnScroll: { added: churnAdded, removed: churnRemoved },
        snapType: snap,
        slideSnapAlign: slideSnap,
        canScroll: track ? track.scrollWidth > track.clientWidth + 8 : false,
        overflowX: track ? getComputedStyle(track).overflowX : null,
        pictureMovedByArrow: pictureBefore !== null && pictureAfter !== null ? pictureAfter - pictureBefore : null,
        arrowFound: !!arrow,
        dotWidthsAtHalfway: dotWidths,
        subscribe: subscribe,
        halfway: halfway,
        itemPixels: itemPixels,
        containerBox: containerBox,
        error: window.__err || null,
              })
            }, 120)
          }, 120)
        }, 400)
      }, 900)
    }, 400)
  }, 1200)
})()
