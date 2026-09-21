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
    var track0 = null
    var d0 = root.querySelectorAll("div")
    for (var a = 0; a < d0.length; a++) {
      if ((d0[a].style.transform || "").indexOf("translate3d") === 0 && visible(d0[a])) { track0 = d0[a]; break }
    }
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

    /* The carousel track: the flex row that carries a translate3d. */
    var track = null
    var divs = root.querySelectorAll("div")
    for (var i = 0; i < divs.length; i++) {
      if ((divs[i].style.transform || "").indexOf("translate3d") === 0 && visible(divs[i])) { track = divs[i]; break }
    }
    var itemWidths = []
    var itemPixels = []
    if (track) {
      for (var k = 0; k < track.children.length; k++) {
        itemWidths.push(track.children[k].style.width)
        itemPixels.push(Math.round(track.children[k].getBoundingClientRect().width * 100) / 100)
      }
    }
    var containerBox = track ? Math.round(track.parentElement.getBoundingClientRect().width * 100) / 100 : 0

    var beforeAdded = probe.imgAdded
    var beforeRemoved = probe.imgRemoved

    /* What a phone does constantly: scroll. The page flips buttonsVisible. */
    window.scrollTo(0, 400)
    window.dispatchEvent(new Event("scroll"))

    setTimeout(function () {
      var churnAdded = probe.imgAdded - beforeAdded
      var churnRemoved = probe.imgRemoved - beforeRemoved

      /* And a swipe: is the horizontal touchmove cancellable at all? */
      var container = track ? track.parentElement : null
      var cancelled = null
      var movedTo = null
      /*
         The element's own transform, not the computed one. Headless Chromium
         reports computed transform as "none" here while the inline value is
         plainly set, and the inline value is the one the compositor uses.
      */
      var startedAt = track ? track.style.transform : null
      if (container) {
        var t = function (x, y) {
          return new Touch({ identifier: 1, target: container, clientX: x, clientY: y })
        }
        try {
          container.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [t(300, 300)], changedTouches: [t(300, 300)] }))
          container.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [t(270, 300)], changedTouches: [t(270, 300)] }))
          var ev = new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [t(200, 300)], changedTouches: [t(200, 300)] })
          container.dispatchEvent(ev)
          cancelled = ev.defaultPrevented
          container.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], changedTouches: [t(200, 300)] }))
          /*
            CANCELLABLE IS NOT THE SAME AS WORKING.

            A handler that calls preventDefault and then moves nothing would
            pass the check above, so the track's own transform is read too: a
            swipe of 100px to the left, well past the threshold, has to leave
            it one step further along than it started.
          */
          movedTo = track ? track.style.transform : null
        } catch (e) {
          cancelled = "touch events unavailable: " + e.message
        }
      }

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
        trackCount: (function () { var n = 0; for (var y = 0; y < divs.length; y++) { if ((divs[y].style.transform || "").indexOf("translate3d") === 0) n++ } return n })(),
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
        swipeCancelled: cancelled,
        trackBefore: startedAt,
        trackAfter: movedTo,
        itemPixels: itemPixels,
        containerBox: containerBox,
        error: window.__err || null,
      })
    }, 400)
  }, 1200)
})()
