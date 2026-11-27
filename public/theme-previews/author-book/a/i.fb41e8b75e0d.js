(function installMissingImageGuard(doc, fallback, mark = "data-sl-missing", keep = "data-keep-broken-images") {
    const isImg = (n) => !!n && n.nodeType === 1 && n.tagName === "IMG";
    const kept = (img) => !!(img.closest && img.closest(`[${keep}]`));
    const swap = (img) => {
        if (kept(img) || img.getAttribute("src") === fallback)
            return;
        img.setAttribute(mark, "");
        /* A srcset (or a <picture>'s sources) would be chosen over src: set aside, so the fallback is what draws. */
        const set = img.getAttribute("srcset");
        if (set !== null) {
            img.setAttribute("data-sl-srcset", set);
            img.removeAttribute("srcset");
        }
        const pic = img.parentElement;
        if (pic && pic.tagName === "PICTURE") {
            const sources = pic.querySelectorAll("source[srcset]");
            for (let i = 0; i < sources.length; i++) {
                sources[i].setAttribute("data-sl-srcset", sources[i].getAttribute("srcset") || "");
                sources[i].removeAttribute("srcset");
            }
        }
        img.setAttribute("src", fallback);
    };
    /* No address at all, and none coming from a script. */
    const empty = (img) => {
        const src = img.getAttribute("src");
        if (src !== null && src.trim() !== "")
            return false;
        if (img.getAttribute("srcset") || img.hasAttribute("data-src") || img.hasAttribute("data-srcset") || img.hasAttribute("data-lazy-src"))
            return false;
        return !(img.parentElement && img.parentElement.tagName === "PICTURE" && img.parentElement.querySelector("source[srcset]"));
    };
    /* Failed before the guard was there (a page whose script runs after its pictures): finished, and nothing drawn. */
    const failedAlready = (img) => {
        if (!img.complete || img.naturalWidth > 0)
            return false;
        const at = img.currentSrc || img.getAttribute("src") || "";
        if (!at || at === fallback)
            return false;
        /* A drawing without a size of its own can read 0 wide and still be fine. */
        return !/^data:image\/svg|\.svg(?:[?#]|$)/i.test(at);
    };
    const check = (img) => {
        if (img.hasAttribute(mark) || kept(img))
            return;
        if (empty(img) || failedAlready(img))
            swap(img);
    };
    const scan = (root) => {
        const list = root.querySelectorAll("img");
        for (let i = 0; i < list.length; i++)
            check(list[i]);
    };
    const onError = (e) => {
        if (isImg(e.target))
            swap(e.target);
    };
    /* A new, working address (a variant chosen, a lazy picture filled in): a photo again. */
    const onLoad = (e) => {
        const img = e.target;
        if (isImg(img) && img.hasAttribute(mark) && img.getAttribute("src") !== fallback)
            img.removeAttribute(mark);
    };
    doc.addEventListener("error", onError, true);
    doc.addEventListener("load", onLoad, true);
    let observer = null;
    const start = () => {
        if (doc.body)
            scan(doc.body);
        const MO = doc.defaultView && doc.defaultView.MutationObserver;
        if (!MO || !doc.body)
            return;
        observer = new MO((records) => {
            for (let r = 0; r < records.length; r++) {
                const rec = records[r];
                if (rec.type === "attributes") {
                    if (isImg(rec.target))
                        check(rec.target);
                    continue;
                }
                const added = rec.addedNodes;
                for (let i = 0; i < added.length; i++) {
                    const n = added[i];
                    if (isImg(n))
                        check(n);
                    else if (n.nodeType === 1 && n.querySelector)
                        scan(n);
                }
            }
        });
        observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    };
    if (doc.readyState === "loading")
        doc.addEventListener("DOMContentLoaded", start, { once: true });
    else
        start();
    return () => {
        doc.removeEventListener("error", onError, true);
        doc.removeEventListener("load", onLoad, true);
        doc.removeEventListener("DOMContentLoaded", start);
        if (observer)
            observer.disconnect();
    };
})(document,"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20width%3D%22100%22%20height%3D%22100%22%3E%3Csvg%20x%3D%2234%22%20y%3D%2234%22%20width%3D%2232%22%20height%3D%2232%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%221.6%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M14.5%204h-5L7%207H4a2%202%200%200%200-2%202v9a2%202%200%200%200%202%202h16a2%202%200%200%200%202-2V9a2%202%200%200%200-2-2h-3l-2.5-3z%22%2F%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%2213%22%20r%3D%223%22%2F%3E%3C%2Fsvg%3E%3C%2Fsvg%3E");