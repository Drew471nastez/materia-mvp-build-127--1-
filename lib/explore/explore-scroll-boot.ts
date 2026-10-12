/**
 * Runs in <head> before first paint on /explore so back from a product does not
 * flash the top of the listing. Client navigations are primed in use-explore-scroll.
 *
 * A PAGE BROUGHT BACK FROM THE BROWSER'S CACHE IS ALREADY WHERE IT WAS. The
 * pageshow handler used to run the hold again for one (Explore left for a page
 * that needs a document load, then Back): it put the hold class on, and with
 * no React mount to take it off again the page stayed hidden under
 * `overflow: hidden`. Now a cached page only has any hold taken off.
 *
 * AND THE HOLD ITSELF HAS RULES, EACH ONE A WAY EXPLORE WAS LEFT BLANK.
 *
 *   Only a return holds: a reload or a Back/Forward that loaded the page
 *   (PerformanceNavigationTiming), with a place left on purpose (the pending
 *   marker) for this very page. A typed address or a link starts at the top
 *   and hides nothing.
 *
 *   The place is the one kept for this history entry, or for this address
 *   with its query (lib/explore/use-explore-scroll explorePlaceKeys): the
 *   same keys, in the same order.
 *
 *   Every hold has an end of its own (EXPLORE_BOOT_HOLD_MAX_MS), so a page
 *   whose script is slow to arrive, or a page under /explore that never runs
 *   the restore at all (/explore/search), cannot stay hidden; and the search
 *   screen is never held in the first place.
 */
/*
 * AND IT HEARS EVERY BACK FIRST (round 25). A popstate listener added here,
 * in <head>, is the first one on the window, so it runs before the router's
 * (Next's app-router.js adds its own when the app starts). That matters:
 * the router starts its update inside the popstate event and React 19
 * renders and commits it there and then, so Explore is drawn, and decides
 * whether this is a return, before any listener added after the router's
 * has run (Chromium runs a window's popstate listeners in the order they
 * were added, capture or not: measured). It writes where the Back went,
 * numbered, on window.__explorePop; lib/explore/use-explore-scroll reads it.
 */
/* Written into the script below as a number (the script is read and parsed on its own), so the two must agree: tests/explore-polish. */
export const EXPLORE_BOOT_HOLD_MAX_MS = 1500

export const EXPLORE_SCROLL_BOOT_SCRIPT = `(function(){try{var K="explore-scroll-restore-pending",S="explore-scroll-position",H="explore-scroll-restoring",d=document.documentElement;function ex(){var p=location.pathname;return p==="/explore"||(p.indexOf("/explore/")===0&&p!=="/explore/search")}function back(){try{var n=performance.getEntriesByType("navigation")[0];return !!n&&(n.type==="reload"||n.type==="back_forward")}catch(e){return false}}if(ex()&&back()){try{if(sessionStorage.getItem(K)==="1"){var m=JSON.parse(sessionStorage.getItem(S)||"{}")||{},k=null;try{k=window.navigation&&window.navigation.currentEntry&&window.navigation.currentEntry.key}catch(x){}var y=(k&&m["#"+k])||m[location.pathname+(location.search||"")];if(y>0){d.classList.add(H);window.scrollTo(0,y);setTimeout(function(){d.classList.remove(H)},1500)}}}catch(e){}}var P=window.__explorePop={seq:0,to:null};window.addEventListener("popstate",function(){P.seq++;P.to=location.pathname+(location.search||"")});window.addEventListener("pageshow",function(e){if(!e.persisted)return;document.documentElement.classList.remove(H);try{sessionStorage.removeItem(K)}catch(x){}})}catch(e){}})();`
