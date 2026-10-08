/**
 * Runs in the account layout before paint. Not a client module: the layout
 * is a server component and must not import the community context store.
 * The key matches COMMUNITY_CONTEXT_KEY in lib/nav/community-context.ts.
 */
export const ACCOUNT_COMMUNITY_HEADER_BOOT = `(function(){try{var p=(location.pathname||"/").replace(/\\/+$/,"")||"/";if(p!=="/account"&&p!=="/account/communities"&&p.indexOf("/account/communities/")!==0)return;var s=null;try{s=sessionStorage.getItem("storelib:community-context")}catch(e){}if(!s){try{s=localStorage.getItem("storelib:community-context")}catch(e){}}if(!s||!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(s))return;document.documentElement.setAttribute("data-account-community-pending","")}catch(e){}})();`
