/**
 * The reader's own light or dark choice for communities
 * (lib/communities/client/appearance-choice.ts), as the key it is kept under
 * and the line the community's layout prints before the frame paints. Not a
 * client module, so the server layout can print it as text.
 *
 * The boot puts a dark choice on <html>, where community-theme.css already
 * reads it, so a reload in dark mode never shows the light page first. A
 * light choice on a dark community is left to the frame, which corrects it
 * as it wakes.
 */
export const APPEARANCE_KEY = "storelib:community-appearance"

export const APPEARANCE_BOOT = `(function(){try{if(localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)})==="dark")document.documentElement.setAttribute("data-community-theme","dark")}catch(e){}})();`
