try{(function installCoverTrim(doc, win) {
    var w = win;
    if (w.__slCoverTrim)
        return;
    var PADDED = /_processed\.jpe?g/i;
    var shown = {};
    var waiting = {};
    /* ---- findLetterbox (lib/images/letterbox.ts), line for line. ---- */
    var flat = function (px, width, at, column, length) {
        var min = 255;
        var max = 0;
        var chroma = 0;
        var sum = 0;
        for (var i = 0; i < length; i++) {
            var x = column ? at : i;
            var y = column ? i : at;
            var o = (y * width + x) * 4;
            var r = px[o];
            var g = px[o + 1];
            var b = px[o + 2];
            var lum = 0.299 * r + 0.587 * g + 0.114 * b;
            if (lum < min)
                min = lum;
            if (lum > max)
                max = lum;
            var c = Math.max(r, g, b) - Math.min(r, g, b);
            if (c > chroma)
                chroma = c;
            sum += lum;
        }
        var light = sum / Math.max(1, length);
        return [max - min <= 18 && chroma <= 14 && (light >= 196 || light <= 34), light];
    };
    var edge = function (px, width, height, column, fromEnd) {
        var count = column ? width : height;
        var length = column ? height : width;
        var run = 0;
        var light = 0;
        for (var k = 0; k < count; k++) {
            var line = flat(px, width, fromEnd ? count - 1 - k : k, column, length);
            if (!line[0])
                break;
            light = line[1];
            run++;
        }
        return [run, light];
    };
    var sides = function (px, width, height, column) {
        var size = column ? width : height;
        var a = edge(px, width, height, column, false);
        var b = edge(px, width, height, column, true);
        if (!a[0] || !b[0])
            return null;
        if (a[0] + b[0] >= size * 0.9)
            return null;
        if (Math.abs(a[0] - b[0]) > Math.max(2, size * 0.04))
            return null;
        if (a[0] + b[0] < size * 0.06)
            return null;
        if (Math.abs(a[1] - b[1]) > 40)
            return null;
        var start = Math.min(size, a[0] + 1);
        var end = Math.max(start, size - b[0] - 1);
        return [start / size, (end - start) / size];
    };
    var find = function (px, width, height) {
        if (!(width >= 8) || !(height >= 8) || px.length < width * height * 4)
            return null;
        var across = sides(px, width, height, true);
        var down = sides(px, width, height, false);
        if (!across && !down)
            return null;
        /* Round 64: one axis only, the one with the most taken off (letterbox.ts). */
        var onlyAcross = !!across && !!down && 1 - across[1] >= 1 - down[1];
        var onlyDown = !!across && !!down && !onlyAcross;
        var box = { x: across && !onlyDown ? across[0] : 0, y: down && !onlyAcross ? down[0] : 0, w: across && !onlyDown ? across[1] : 1, h: down && !onlyAcross ? down[1] : 1 };
        if (box.w < 0.2 || box.h < 0.2)
            return null;
        return box;
    };
    w.__slCoverBox = find;
    w.__slCoverTrim = true;
    try {
        var style = doc.createElement("style");
        style.setAttribute("data-sl-cover-trim", "");
        /* Held unseen while it is read, never in Explore, never one already framed or left as it is. */
        style.textContent =
            'html.sl-cover-trim img[src*="_processed."]:not([data-cover-trim]):not([data-cover-padded="keep"] img),' +
                'html.sl-cover-trim img[data-cover-trim="busy"],html.sl-cover-trim img[data-cover-trim="done"][src*="_processed."]{opacity:0}';
        (doc.head || doc.documentElement).appendChild(style);
        doc.documentElement.classList.add("sl-cover-trim");
    }
    catch {
        /* No style: the bars may show for a moment before the picture is trimmed. */
    }
    /* The full copy behind an optimizer address, so the picture is cut from 1280x720 and not from a small size. */
    var fullOf = function (src) {
        try {
            var u = new URL(src, doc.baseURI);
            if (u.pathname === "/_next/image") {
                var raw = u.searchParams.get("url");
                if (raw)
                    return new URL(raw, doc.baseURI).href;
            }
            return u.href;
        }
        catch {
            return src;
        }
    };
    var settle = function (key, url) {
        shown[key] = url;
        var list = waiting[key] || [];
        delete waiting[key];
        for (var i = 0; i < list.length; i++) {
            var img = list[i];
            /* Its address changed while this was read (a variant picked): it is looked at again for the new one. */
            if (fullOf(img.currentSrc || img.src || "") === key)
                put(img, key, url);
            else {
                img.removeAttribute("data-cover-trim");
                look(img);
            }
        }
    };
    var put = function (img, key, url) {
        if (!url) {
            img.setAttribute("data-cover-trim", "none");
            img.setAttribute("data-cover-from", key);
            /* Round 65: nothing to cut, so the frame's fit (lib/images/pic-fit.ts) paints it as it is. */
            var fit = w.__slPicFitPaint;
            if (fit)
                fit(img);
            return;
        }
        var parent = img.parentNode;
        if (parent && parent.tagName === "PICTURE") {
            var sources = parent.getElementsByTagName("source");
            for (var i = 0; i < sources.length; i++)
                sources[i].removeAttribute("srcset");
        }
        img.removeAttribute("srcset");
        img.removeAttribute("sizes");
        img.setAttribute("data-cover-trim", "done");
        img.setAttribute("data-cover-from", key);
        img.src = url;
    };
    /* Reads the copy's pixels, finds its bars, and makes the picture inside it. "" when there is nothing to cut or it cannot be read. */
    var cut = function (key, fallback) {
        var fromImage = function (pic) {
            try {
                var nw = pic.naturalWidth;
                var nh = pic.naturalHeight;
                if (!(nw > 0 && nh > 0))
                    return false;
                var sw = Math.min(128, nw);
                var sh = Math.max(1, Math.round((sw * nh) / nw));
                var small = doc.createElement("canvas");
                small.width = sw;
                small.height = sh;
                var sctx = small.getContext("2d", { willReadFrequently: true });
                if (!sctx)
                    return false;
                sctx.drawImage(pic, 0, 0, sw, sh);
                var box = find(sctx.getImageData(0, 0, sw, sh).data, sw, sh);
                if (!box) {
                    settle(key, "");
                    return true;
                }
                var cx = Math.round(box.x * nw);
                var cy = Math.round(box.y * nh);
                var cw = Math.max(1, Math.round(box.w * nw));
                var ch = Math.max(1, Math.round(box.h * nh));
                var big = doc.createElement("canvas");
                big.width = cw;
                big.height = ch;
                var bctx = big.getContext("2d");
                if (!bctx)
                    return false;
                bctx.drawImage(pic, cx, cy, cw, ch, 0, 0, cw, ch);
                if (big.toBlob) {
                    big.toBlob(function (blob) {
                        if (!blob)
                            return settle(key, "");
                        settle(key, URL.createObjectURL(blob));
                    }, "image/jpeg", 0.92);
                }
                else {
                    settle(key, big.toDataURL("image/jpeg", 0.92));
                }
                return true;
            }
            catch {
                /* Another host's picture without CORS: its pixels cannot be read. */
                return false;
            }
        };
        /* A read that never ends (a stalled connection) never keeps a picture unseen: after 4s it is shown as it is. */
        setTimeout(function () {
            if (waiting[key])
                settle(key, "");
        }, 4000);
        var full = new Image();
        full.crossOrigin = "anonymous";
        full.decoding = "async";
        /* Round 64: read through this origin's /_next/image, so a cross origin copy with no CORS header is readable. */
        var readFrom = key;
        try {
            var at = new URL(key, doc.baseURI);
            var here = doc.location ? doc.location.origin : "";
            if (here && at.origin !== here && /^https?:$/.test(at.protocol))
                readFrom = here + "/_next/image?url=" + encodeURIComponent(at.href) + "&w=1920&q=90";
        }
        catch {
            readFrom = key;
        }
        full.onload = function () {
            if (!fromImage(full) && !fromImage(fallback))
                settle(key, "");
        };
        full.onerror = function () {
            if (!fromImage(fallback))
                settle(key, "");
        };
        full.src = readFrom;
    };
    var look = function (img) {
        var src = img.currentSrc || img.src || "";
        if (!src || !PADDED.test(src))
            return;
        var state = img.getAttribute("data-cover-trim");
        if (state === "keep" || state === "framed" || state === "busy")
            return;
        if (img.closest && img.closest('[data-cover-padded="keep"]')) {
            img.setAttribute("data-cover-trim", "keep");
            return;
        }
        var key = fullOf(src);
        if (state === "none" && img.getAttribute("data-cover-from") === key)
            return;
        if (shown[key] !== undefined)
            return put(img, key, shown[key]);
        img.setAttribute("data-cover-trim", "busy");
        if (waiting[key]) {
            waiting[key].push(img);
            return;
        }
        waiting[key] = [img];
        cut(key, img);
    };
    doc.addEventListener("load", function (e) {
        var t = e.target;
        if (t && t.tagName === "IMG")
            look(t);
    }, true);
    doc.addEventListener("error", function (e) {
        var t = e.target;
        if (t && t.tagName === "IMG" && t.getAttribute("data-cover-trim") !== "keep")
            t.setAttribute("data-cover-trim", "none");
    }, true);
    /* Pictures already loaded before this ran (a cached page shown again). */
    var early = function () {
        var imgs = doc.images;
        for (var i = 0; i < imgs.length; i++)
            if (imgs[i].complete && imgs[i].naturalWidth > 0)
                look(imgs[i]);
    };
    if (doc.readyState === "loading")
        doc.addEventListener("DOMContentLoaded", early);
    else
        early();
})(document,window)}catch(e){}try{(function installPicFit(doc, win) {
    var w = win;
    if (w.__slPicFit)
        return;
    w.__slPicFit = true;
    var FRAMES = ".product-item__media--ratio,.media-gallery__image,[data-pic-frame]";
    var PADDED = /_processed\.jpe?g/i;
    var STOPS = 6;
    var edges = {};
    var reading = {};
    try {
        var style = doc.createElement("style");
        style.setAttribute("data-sl-pic-fit", "");
        /* The whole picture in its frame, centred (a focal point means nothing when nothing is cut), on its own edge's colours. */
        style.textContent =
            "html.sl-pic-fit :is(" + FRAMES + ') img:not([data-pic-fit="off"]){object-fit:contain!important;object-position:50% 50%!important}' +
                /* Round 67: a picture near its frame's shape fills it. */
                "html.sl-pic-fit :is(" + FRAMES + ') img[data-pic-fit="fill"]{object-fit:cover!important}' +
                'html.sl-pic-fit img[data-pic-fit="band"]{background:var(--pf-bg)!important}';
        (doc.head || doc.documentElement).appendChild(style);
        doc.documentElement.classList.add("sl-pic-fit");
    }
    catch {
        /* No style: the theme's own fit stays. */
        return;
    }
    /*
     * The colour of a run of pixels, as CSS: each channel's median, so a small mark at the edge (a logo in a corner,
     * a price sticker) does not tint the whole band. Alpha is averaged, so a see-through edge can be told.
     */
    var mean = function (px, width, x0, y0, x1, y1) {
        var rs = [];
        var gs = [];
        var bs = [];
        var a = 0;
        for (var y = y0; y < y1; y++)
            for (var x = x0; x < x1; x++) {
                var o = (y * width + x) * 4;
                rs.push(px[o]);
                gs.push(px[o + 1]);
                bs.push(px[o + 2]);
                a += px[o + 3];
            }
        var mid = function (v) {
            v.sort(function (p, q) {
                return p - q;
            });
            return v.length ? v[v.length >> 1] : 0;
        };
        return ["rgb(" + mid(rs) + "," + mid(gs) + "," + mid(bs) + ")", a / Math.max(1, rs.length)];
    };
    /* The colours along each edge (two pixels deep), STOPS of them per edge, from the picture's pixels at width x height. */
    var edgesOf = function (px, width, height) {
        var out = { l: [], r: [], t: [], b: [], clear: false };
        var alpha = 0;
        var count = 0;
        var deep = Math.max(1, Math.min(2, Math.floor(Math.min(width, height) / 4)));
        for (var i = 0; i < STOPS; i++) {
            var y0 = Math.floor((i * height) / STOPS);
            var y1 = Math.max(y0 + 1, Math.floor(((i + 1) * height) / STOPS));
            var x0 = Math.floor((i * width) / STOPS);
            var x1 = Math.max(x0 + 1, Math.floor(((i + 1) * width) / STOPS));
            var l = mean(px, width, 0, y0, deep, y1);
            var r = mean(px, width, width - deep, y0, width, y1);
            var t = mean(px, width, x0, 0, x1, deep);
            var b = mean(px, width, x0, height - deep, x1, height);
            out.l.push(l[0]);
            out.r.push(r[0]);
            out.t.push(t[0]);
            out.b.push(b[0]);
            alpha += l[1] + r[1] + t[1] + b[1];
            count += 4;
        }
        /* A cut out product on a see-through background: the frame's own colour shows through, as the theme drew it. */
        out.clear = alpha / Math.max(1, count) < 245;
        return out;
    };
    /* The two bands' gradients for a picture narrower than its box (axis x: left and right) or wider (y: top and bottom). */
    var backdrop = function (e, axis) {
        var run = function (list, dir) {
            var stops = [];
            for (var i = 0; i < list.length; i++)
                stops.push(list[i] + " " + ((i + 0.5) * (100 / list.length)).toFixed(1) + "%");
            return "linear-gradient(" + dir + "," + stops.join(",") + ")";
        };
        return axis === "x"
            ? run(e.l, "to bottom") + " left top/50.5% 100% no-repeat," + run(e.r, "to bottom") + " right top/50.5% 100% no-repeat"
            : run(e.t, "to right") + " left top/100% 50.5% no-repeat," + run(e.b, "to right") + " left bottom/100% 50.5% no-repeat";
    };
    /*
     * Which bands a picture of natural ratio nr leaves in a box of ratio br: none when it fills it. Round 67: a picture
     * within NEAR of its frame's shape fills it (object-fit: cover), losing at most 7.4% across one side (under 4% at each edge), the trim every
     * shop's grid makes; only a picture further off than that sits whole on its edge's colours. Before, anything over
     * half a percent off was contained, so a 4:5 photo in a 3:4 card sat inside thin bands.
     */
    var NEAR = 1.08;
    var axisOf = function (nr, br) {
        if (!(nr > 0) || !(br > 0))
            return null;
        var k = nr / br;
        if (k <= NEAR && k >= 1 / NEAR)
            return null;
        return k < 1 ? "x" : "y";
    };
    /*
     * THE FRAME TAKES THE PICTURES' SHAPE (round 67). The owner: a card's picture sat small in a grey box (a 16:9
     * banner in a 3:4 card covered 42% of it, a 4:3 photo 56%). A row of frames whose pictures are mostly another
     * shape than the theme's setting takes theirs: the middle shape of the pictures in that row (a grid, a
     * gallery), snapped to one of SHAPES, so a shop of banners gets banner cards, filled edge to edge. A row whose
     * pictures are near its frame keeps the theme's shape. A frame on its own takes its picture's. Only from shapes
     * already known, before the frame is drawn (SEEN below), so nothing moves. A theme that
     * already gives each frame its own picture's shape (frames of differing shapes) is left as it is.
     */
    var SHAPES = [16 / 9, 3 / 2, 4 / 3, 1, 4 / 5, 3 / 4, 2 / 3];
    var snap = function (r) {
        var best = SHAPES[0];
        var d = Infinity;
        for (var i = 0; i < SHAPES.length; i++) {
            var x = Math.abs(Math.log(r / SHAPES[i]));
            if (x < d) {
                d = x;
                best = SHAPES[i];
            }
        }
        return best;
    };
    /* The row's shape from its pictures' ratios and the frame's own: null to keep the frame's. */
    var shapeOf = function (ratios, frame) {
        var list = ratios.filter(function (r) {
            return r > 0;
        });
        if (!list.length || !(frame > 0))
            return null;
        list.sort(function (a, b) {
            return a - b;
        });
        var mid = list[list.length >> 1];
        var k = mid / frame;
        if (k <= NEAR && k >= 1 / NEAR)
            return null;
        return snap(mid);
    };
    w.__slPicFitParts = { edgesOf: edgesOf, backdrop: backdrop, axisOf: axisOf, shapeOf: shapeOf, snap: snap };
    /* A frame's declared shape: the theme's --aspect-ratio (3/4, 0.75) or its CSS aspect-ratio. */
    var declared = function (frame) {
        var v = (frame.style.getPropertyValue("--aspect-ratio") || "").trim();
        if (!v) {
            try {
                v = (win.getComputedStyle(frame).aspectRatio || "").replace("auto", "").trim();
            }
            catch {
                v = "";
            }
        }
        var m = v.match(/^([\d.]+)\s*(?:\/\s*([\d.]+))?$/);
        if (!m)
            return 0;
        var r = Number(m[1]) / (m[2] ? Number(m[2]) : 1);
        return r > 0 && isFinite(r) ? r : 0;
    };
    /* The frames that are one row with this one: the nearest container holding more than one frame. */
    var rowOf = function (frame) {
        var at = frame.parentElement;
        for (var i = 0; i < 8 && at && at !== doc.body; i++) {
            var list = at.querySelectorAll(FRAMES);
            if (list.length > 1) {
                var out = [];
                for (var j = 0; j < list.length; j++)
                    if (!list[j].closest('[data-cover-padded="keep"]'))
                        out.push(list[j]);
                return out;
            }
            at = at.parentElement;
        }
        return [frame];
    };
    var setShape = function (frame, r) {
        var v = String(Math.round(r * 10000) / 10000);
        if (frame.getAttribute("data-pic-shape") === v)
            return;
        if (!frame.hasAttribute("data-pic-was"))
            frame.setAttribute("data-pic-was", String(declared(frame)));
        frame.setAttribute("data-pic-shape", v);
        if (frame.style.getPropertyValue("--aspect-ratio")) {
            frame.style.setProperty("--aspect-ratio", v);
            if (frame.style.getPropertyValue("--aspect-ratio-mb"))
                frame.style.setProperty("--aspect-ratio-mb", v);
        }
        else
            frame.style.aspectRatio = v;
    };
    /*
     * THE SHAPES SEEN BEFORE, KEPT IN THIS BROWSER (round 67): the shape each picture's row took, by the picture's
     * address (the file behind the optimizer, without the size asked for) and the theme's shape for its frame, so a
     * whole row is given one shape before it is drawn. NOTHING ON SCREEN CHANGES SHAPE: a frame is given its row's shape only as it is put in the page,
     * before it is drawn, and only from shapes this browser already knows. The server holds no picture's size (every
     * product picture is an image object 1600 by 1600 to the theme), so on a first visit each frame keeps the theme's
     * shape (the picture filling it within 8%, else whole on its edge's colours) and the shapes are learned for every
     * page after: the next page, a row drawn later (related, recently viewed), the next visit. Measured round 67: a
     * first visit's frames that changed shape once their pictures arrived moved the page (CLS 0.198 on a phone).
     */
    /* A picture's row shape, by its address and the frame's own shape: what its whole row took when last drawn (0: the frame's own). */
    var SEEN = "sl:pic-row";
    var seen = {};
    try {
        seen = JSON.parse(win.localStorage.getItem(SEEN) || "{}") || {};
    }
    catch {
        seen = {};
    }
    var addressOf = function (src) {
        try {
            var u = new URL(src, doc.baseURI);
            var raw = u.pathname === "/_next/image" ? u.searchParams.get("url") : null;
            var at = raw ? new URL(raw, doc.baseURI) : u;
            return at.host + at.pathname;
        }
        catch {
            return "";
        }
    };
    var keyOf = function (pic, frame) {
        var a = addressOf(pic.currentSrc || pic.src || pic.getAttribute("src") || "");
        return a ? a + "@" + Math.round(frame * 100) : "";
    };
    var save = function () {
        try {
            var keys = Object.keys(seen);
            for (var i = 0; keys.length - i > 500; i++)
                delete seen[keys[i]];
            win.localStorage.setItem(SEEN, JSON.stringify(seen));
        }
        catch {
            /* Kept for this page only. */
        }
    };
    /* A frame's picture: its first that is not a hover picture. */
    var pictureIn = function (frame) {
        var pics = frame.getElementsByTagName("img");
        for (var q = 0; q < pics.length; q++)
            if (!pics[q].closest(".secondary-image,.hover-effect__alt") && !pics[q].classList.contains("secondary-image") && pics[q].getAttribute("data-pic-fit") !== "off")
                return pics[q];
        return null;
    };
    /* A picture's own ratio once its size is known; 0 for a padded copy not yet cut, or one not loaded. */
    var ratioOf = function (pic) {
        var src = pic.currentSrc || pic.src || "";
        if (PADDED.test(src) && pic.getAttribute("data-cover-trim") !== "none")
            return 0;
        return pic.naturalWidth > 0 && pic.naturalHeight > 0 ? pic.naturalWidth / pic.naturalHeight : 0;
    };
    /*
     * LEARN: the row this picture is in, with every size known so far, decides its shape (shapeOf), and that shape is
     * kept for each of its pictures. Nothing on screen is changed here.
     */
    var learn = function (img) {
        var frame = img.closest(FRAMES);
        if (!frame || frame.closest('[data-cover-padded="keep"]'))
            return;
        var row = rowOf(frame);
        var own = [];
        var ratios = [];
        var pics = [];
        for (var i = 0; i < row.length; i++) {
            var was = Number(row[i].getAttribute("data-pic-was")) || declared(row[i]);
            if (was > 0 && own.indexOf(Math.round(was * 100)) < 0)
                own.push(Math.round(was * 100));
            var pic = pictureIn(row[i]);
            pics.push(pic);
            var r = pic ? ratioOf(pic) : 0;
            if (r > 0)
                ratios.push(r);
        }
        /* Frames of differing shapes: the theme gives each its picture's own (Adapt). */
        if (own.length !== 1 || !ratios.length)
            return;
        var shape = shapeOf(ratios, own[0] / 100);
        var v = shape ? Math.round(shape * 10000) / 10000 : 0;
        var changed = false;
        for (var j = 0; j < pics.length; j++) {
            var k = pics[j] ? keyOf(pics[j], own[0] / 100) : "";
            if (k && seen[k] !== v) {
                seen[k] = v;
                changed = true;
            }
        }
        if (changed)
            save();
    };
    /* PLACE: a frame just put in the page, not drawn yet, given the shape its picture's row took before. */
    var place = function (frame) {
        if (frame.hasAttribute("data-pic-shape") || frame.closest('[data-cover-padded="keep"]'))
            return;
        var pic = pictureIn(frame);
        var own = declared(frame);
        if (!pic || !(own > 0))
            return;
        var v = seen[keyOf(pic, own)];
        if (v > 0)
            setShape(frame, v);
    };
    var pixels = function (pic) {
        try {
            var nw = pic.naturalWidth;
            var nh = pic.naturalHeight;
            if (!(nw > 0 && nh > 0))
                return null;
            var sw = Math.max(2, Math.min(48, nw));
            var sh = Math.max(2, Math.min(48, nh));
            var c = doc.createElement("canvas");
            c.width = sw;
            c.height = sh;
            var ctx = c.getContext("2d", { willReadFrequently: true });
            if (!ctx)
                return null;
            ctx.drawImage(pic, 0, 0, sw, sh);
            return edgesOf(ctx.getImageData(0, 0, sw, sh).data, sw, sh);
        }
        catch {
            /* Another host's picture: its pixels cannot be read here. */
            return null;
        }
    };
    var apply = function (img) {
        var key = img.currentSrc || img.src || "";
        var e = edges[key];
        var nw = img.naturalWidth;
        var nh = img.naturalHeight;
        var bw = img.clientWidth;
        var bh = img.clientHeight;
        if (!(bw > 4 && bh > 4 && nw > 0 && nh > 0))
            return;
        var axis = axisOf(nw / nh, bw / bh);
        if (!axis) {
            img.setAttribute("data-pic-fit", "fill");
            return;
        }
        if (!e || e.clear) {
            img.setAttribute("data-pic-fit", e ? "clear" : "open");
            return;
        }
        img.style.setProperty("--pf-bg", backdrop(e, axis));
        img.setAttribute("data-pic-fit", "band");
    };
    var sizes = typeof ResizeObserver === "function"
        ? new ResizeObserver(function (list) {
            for (var i = 0; i < list.length; i++) {
                var t = list[i].target;
                if (t.getAttribute("data-pic-fit") !== "off")
                    apply(t);
            }
        })
        : null;
    var settle = function (key, found) {
        edges[key] = found;
        var list = reading[key] || [];
        delete reading[key];
        for (var i = 0; i < list.length; i++)
            if ((list[i].currentSrc || list[i].src) === key)
                apply(list[i]);
    };
    /* Another host's picture: its colours from this origin's optimizer, 64px wide (same origin, so readable). */
    var viaOptimizer = function (key) {
        var at;
        try {
            at = new URL(key, doc.baseURI);
        }
        catch {
            return settle(key, null);
        }
        var here = doc.location ? doc.location.origin : "";
        if (!here || here === "null" || !/^https?:$/.test(at.protocol) || at.origin === here)
            return settle(key, null);
        var small = new Image();
        small.crossOrigin = "anonymous";
        small.decoding = "async";
        small.onload = function () {
            settle(key, pixels(small));
        };
        small.onerror = function () {
            settle(key, null);
        };
        small.src = here + "/_next/image?url=" + encodeURIComponent(at.href) + "&w=64&q=75";
    };
    var paint = function (img) {
        if (!img || !img.closest || img.getAttribute("data-pic-fit") === "off")
            return;
        if (!img.closest(FRAMES) || img.closest('[data-cover-padded="keep"]'))
            return;
        var key = img.currentSrc || img.src || "";
        if (!key)
            return;
        /* A padded copy is the trim's first: it loads its cut picture (painted then), or says there was nothing to cut. */
        if (PADDED.test(key) && img.getAttribute("data-cover-trim") !== "none")
            return;
        if (sizes && !img.hasAttribute("data-pic-fit"))
            sizes.observe(img);
        try {
            learn(img);
        }
        catch {
            /* Nothing learned. */
        }
        if (key in edges)
            return apply(img);
        if (reading[key]) {
            reading[key].push(img);
            return;
        }
        var found = pixels(img);
        if (found) {
            edges[key] = found;
            return apply(img);
        }
        reading[key] = [img];
        viaOptimizer(key);
    };
    w.__slPicFitPaint = paint;
    doc.addEventListener("load", function (e) {
        var t = e.target;
        if (t && t.tagName === "IMG")
            paint(t);
    }, true);
    /* A frame as it is put in the page (while it is read, or a row a script adds), before it is drawn. */
    if (typeof MutationObserver === "function") {
        var parsing = new MutationObserver(function (list) {
            for (var i = 0; i < list.length; i++) {
                var added = list[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    var n = added[j];
                    if (n.nodeType !== 1)
                        continue;
                    var found = n.matches && n.matches(FRAMES) ? [n] : [];
                    if (n.querySelectorAll)
                        found = found.concat(Array.prototype.slice.call(n.querySelectorAll(FRAMES)));
                    /* The frame itself may come before its picture while the page is read: a picture added later finds its frame. */
                    if (n.tagName === "IMG" && n.closest) {
                        var f = n.closest(FRAMES);
                        if (f)
                            found.push(f);
                    }
                    for (var q = 0; q < found.length; q++) {
                        try {
                            place(found[q]);
                        }
                        catch {
                            /* The theme's shape. */
                        }
                    }
                }
            }
        });
        parsing.observe(doc.documentElement, { childList: true, subtree: true });
    }
    var early = function () {
        var imgs = doc.images;
        for (var i = 0; i < imgs.length; i++)
            if (imgs[i].complete && imgs[i].naturalWidth > 0)
                paint(imgs[i]);
    };
    if (doc.readyState === "loading")
        doc.addEventListener("DOMContentLoaded", early);
    else
        early();
})(document,window)}catch(e){}