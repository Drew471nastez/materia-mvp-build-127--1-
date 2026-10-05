/**
 * Runs in <head> before first paint on /explore so back from a product does not
 * flash the top of the listing. Client navigations are primed in use-explore-scroll.
 *
 * A PAGE BROUGHT BACK FROM THE BROWSER'S CACHE IS ALREADY WHERE IT WAS. The
 * pageshow handler used to run the hold again for one (Explore left for a page
 * that needs a document load, then Back): it put the hold class on, and with
 * no React mount to take it off again the page stayed hidden under
 * `overflow: hidden`. Now a cached page only has any hold taken off.
 */
export const EXPLORE_SCROLL_BOOT_SCRIPT = `(function(){try{var K="explore-scroll-restore-pending",S="explore-scroll-position",H="explore-scroll-restoring";function ex(){var p=location.pathname;return p==="/explore"||p.indexOf("/explore/")===0}function go(){if(!ex())return;try{if(sessionStorage.getItem(K)!=="1")return;document.documentElement.classList.add(H);var y=parseInt(sessionStorage.getItem(S)||"",10);if(y>0)window.scrollTo(0,y)}catch(e){}}go();window.addEventListener("pageshow",function(e){if(!e.persisted)return;document.documentElement.classList.remove(H);try{sessionStorage.removeItem(K)}catch(x){}})}catch(e){}})();`
