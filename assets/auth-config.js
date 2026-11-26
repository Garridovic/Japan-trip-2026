// Account sign-in (Auth0, Google only). These values are PUBLIC by design (a single-page app has no secrets):
// never put a client secret or any Management API key here.
//   enabled  : false keeps the whole feature dormant (no button, no network, no SDK download).
//   domain   : your Auth0 tenant, e.g. 'japan-trip-xxxx.eu.auth0.com'.
//   clientId : the Client ID of the "Single Page Application" in Auth0.
export const AUTH_CONFIG = Object.freeze({
  enabled: true,
  domain: 'dev-garridovic.eu.auth0.com',
  clientId: 'FnWreTgXGxLlaHtggoJjPt4jzxugh1Wj'
});
