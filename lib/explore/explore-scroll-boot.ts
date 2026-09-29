/**
 * Runs in <head> before first paint on /explore so back from a product does not
 * flash the top of the listing. Client navigations are primed in use-explore-scroll.
 */
export const EXPLORE_SCROLL_BOOT_SCRIPT = `(function(){try{var K="explore-scroll-restore-pending",S="explore-scroll-position",H="explore-scroll-restoring";function ex(){var p=location.pathname;return p==="/explore"||p.indexOf("/explore/")===0}function go(){if(!ex())return;try{if(sessionStorage.getItem(K)!=="1")return;document.documentElement.classList.add(H);var y=parseInt(sessionStorage.getItem(S)||"",10);if(y>0)window.scrollTo(0,y)}catch(e){}}go();window.addEventListener("pageshow",function(e){if(ex()&&(e.persisted||sessionStorage.getItem(K)==="1"))go()})}catch(e){}})();`
