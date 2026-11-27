// Thin wrapper around auth0-spa-js (Authorization Code + PKCE, refresh tokens). Loaded only when sign-in is enabled,
// and always through a dynamic import so that a failure here can never break the guide itself.
// The SDK is vendored (assets/vendor) so it is part of the offline cache and no CDN is involved.
export const SDK_URL = new URL('../../assets/vendor/auth0-spa-js.production.esm.js', import.meta.url).href;
const SCOPE = 'openid profile email offline_access read:current_user update:current_user_metadata';

/** Custom claim (an Action in Auth0 copies the user's roles into the ID token). Auth0 needs a URL-shaped name; it does not have to resolve. */
export const ROLES_CLAIM = 'https://japan-trip-2026/roles';
export const ADMIN_ROLE = 'administrador';

/** Does the signed-in user carry the administrator role? UI only: anyone can edit this code in their own browser, so a real admin action must be checked on a server that verifies the token. */
export function isAdmin(user) {
  const roles = user?.[ROLES_CLAIM];
  return Array.isArray(roles) && roles.includes(ADMIN_ROLE);
}

export const isConfigured = (config) => Boolean(config?.enabled && config.domain && config.clientId);
export const managementAudience = (domain) => `https://${domain}/api/v2/`;

/** Does this URL look like Auth0 coming back (success or error)? */
export function isRedirectCallback(search) {
  const params = new URLSearchParams(search);
  return params.has('state') && (params.has('code') || params.has('error'));
}

/** Where to go after the callback: only paths inside the app (no open redirect). */
export function safeReturnTo(value, base) {
  try {
    const target = new URL(value, base);
    const root = new URL(base);
    return target.origin === root.origin && target.pathname.startsWith(root.pathname) ? `${target.pathname}${target.search}${target.hash}` : root.pathname;
  } catch { return new URL(base).pathname; }
}

export async function createAuth(config, { loadSdk = () => import(SDK_URL), win = window } = {}) {
  if (!isConfigured(config)) return null;
  const { Auth0Client } = await loadSdk();
  const root = new URL(win.document.baseURI);
  const redirectUri = `${root.origin}${root.pathname.replace(/[^/]*$/, '')}`;
  const audience = managementAudience(config.domain);
  const client = new Auth0Client({
    domain: config.domain,
    clientId: config.clientId,
    cacheLocation: 'localstorage',
    useRefreshTokens: true,
    useRefreshTokensFallback: false,
    authorizationParams: { redirect_uri: redirectUri, audience, scope: SCOPE }
  });
  let user = null;
  let callbackError = null;

  async function init() {
    if (isRedirectCallback(win.location.search)) {
      try {
        const result = await client.handleRedirectCallback();
        win.history.replaceState({}, '', safeReturnTo(result?.appState?.returnTo, redirectUri));
      } catch (error) {
        callbackError = error;
        win.history.replaceState({}, '', new URL(redirectUri).pathname);
      }
    }
    try { user = (await client.isAuthenticated()) ? await client.getUser() ?? null : null; } catch { user = null; }
    return user;
  }

  return {
    init,
    get user() { return user; },
    get callbackError() { return callbackError; },
    isAuthenticated: () => Boolean(user),
    login: (returnTo = `${win.location.pathname}${win.location.search}`) => client.loginWithRedirect({ authorizationParams: { connection: 'google-oauth2' }, appState: { returnTo } }),
    /** Without `connection`: Auth0's own login page shows every connection enabled for this client (user and password, Google...). */
    loginWithPrompt: (returnTo = `${win.location.pathname}${win.location.search}`) => client.loginWithRedirect({ appState: { returnTo } }),
    logout: () => client.logout({ logoutParams: { returnTo: redirectUri } }),
    /** A Management API access token for the signed-in user. Rejects when offline or when the session is gone. */
    getToken: () => client.getTokenSilently({ authorizationParams: { audience, scope: SCOPE } }),
    audience
  };
}
