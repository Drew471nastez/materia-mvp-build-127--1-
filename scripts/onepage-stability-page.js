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
        itemPixels: itemPixels,
        containerBox: containerBox,
        error: window.__err || null,
      })
    }, 400)
  }, 1200)
})()
