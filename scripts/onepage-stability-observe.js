/*
  Loaded before the probe bundle, so the very first mount is observed.

  React settles its initial render in a microtask, which runs before the next
  <script> tag executes. An observer created alongside the measurements would
  therefore start life already too late, and would report that no slide was
  ever born at any width — which is how a version of this quietly passed a
  carousel that laid every slide out at 100% first.
*/
window.__probe = { imgAdded: 0, imgRemoved: 0, widthValues: [], bornWidths: [] }
;(function () {
  var p = window.__probe
  var root = document.getElementById("root")

  function countImgs(nodes, key) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      if (n.nodeType !== 1) continue
      if (n.tagName === "IMG") p[key]++
      else if (n.querySelectorAll) {
        var inner = n.querySelectorAll("img")
        for (var j = 0; j < inner.length; j++) p[key]++
      }
    }
  }

  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i]
      if (r.type === "childList") {
        countImgs(r.addedNodes, "imgAdded")
        countImgs(r.removedNodes, "imgRemoved")
        /*
          THE WIDTH A SLIDE IS BORN WITH.

          That is what the visitor sees on its first painted frame, and it is
          the whole point: a slide laid out at 100% and only later given a
          pixel width has moved on screen once for nothing. React sets the
          style attribute before it appends, so reading it here reads the
          value the element entered the document with. The observer reports
          the outermost added node, so its descendants are walked too.
        */
        for (var n = 0; n < r.addedNodes.length; n++) {
          var an = r.addedNodes[n]
          if (an.nodeType !== 1) continue
          var withStyle = an.hasAttribute("style") ? [an] : []
          var more = an.querySelectorAll ? an.querySelectorAll("[style]") : []
          for (var m = 0; m < more.length; m++) withStyle.push(more[m])
          for (var q = 0; q < withStyle.length; q++) {
            var bw = withStyle[q].style.width
            if (bw && p.bornWidths.indexOf(bw) === -1) p.bornWidths.push(bw)
          }
        }
      } else if (r.type === "attributes" && r.attributeName === "style") {
        var w = r.target.style && r.target.style.width
        if (w) {
          var last = p.widthValues[p.widthValues.length - 1]
          if (!last || last.w !== w) p.widthValues.push({ t: Math.round(performance.now()), w: w })
        }
      }
    }
  }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] })
})()
