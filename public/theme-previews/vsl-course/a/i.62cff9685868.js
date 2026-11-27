try{(function installLogoShape(doc) {
    var SEL = "header img,footer img,.footer img,.header img,.store-info-content img,[class*=logo] img,img[class*=logo]";
    var fix = function (i) {
        try {
            if (!i.naturalWidth || !i.naturalHeight || !i.matches(SEL))
                return;
            var w = Number(i.getAttribute("width"));
            var h = Number(i.getAttribute("height"));
            if (!w || !h)
                return;
            if (Math.abs(w / h / (i.naturalWidth / i.naturalHeight) - 1) > 0.02)
                i.style.aspectRatio = i.naturalWidth + " / " + i.naturalHeight;
        }
        catch {
            /* Left as the theme drew it. */
        }
    };
    doc.addEventListener("load", function (e) {
        var t = e.target;
        if (t && t.tagName === "IMG")
            fix(t);
    }, true);
    var all = function () {
        for (var k = 0; k < doc.images.length; k++)
            if (doc.images[k].complete)
                fix(doc.images[k]);
    };
    if (doc.readyState === "loading")
        doc.addEventListener("DOMContentLoaded", all);
    else
        all();
})(document)}catch(e){}