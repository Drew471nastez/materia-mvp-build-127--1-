try{(function installPopupRestOpacity(win) {
    const proto = win.Element && win.Element.prototype;
    if (!proto || typeof proto.animate !== "function" || proto.animate.__slRest)
        return;
    const animate = proto.animate;
    const bare = (k, v) => !!k && typeof k === "object" && Object.keys(k).length === 1 && k.opacity === v;
    const patched = function (keyframes, options) {
        try {
            if (Array.isArray(keyframes) && keyframes.length === 2 && this.closest && this.closest("[data-mp-motion]")) {
                const inward = bare(keyframes[0], 0) && bare(keyframes[1], 1);
                const outward = bare(keyframes[0], 1) && bare(keyframes[1], 0);
                if (inward || outward) {
                    const rest = parseFloat(win.getComputedStyle(this).opacity);
                    if (rest > 0.05 && rest < 0.999)
                        keyframes = inward ? [{ opacity: 0 }, { opacity: rest }] : [{ opacity: rest }, { opacity: 0 }];
                }
            }
        }
        catch {
            /* the theme's own call, as it was */
        }
        return animate.call(this, keyframes, options);
    };
    patched.__slRest = true;
    proto.animate = patched;
})(window)}catch(e){}