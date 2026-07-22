---
name: OAuth callback loop + bot builder "Not available" fixes
description: Root causes and fixes for the two known post-login bugs in the new OAuth PKCE auth flow.
---

## OAuth callback redirects back to login instead of the dashboard

**Root cause:** `handleNewCallback()` in `src/auth/NewDerivAuth.js` called
`window.history.replaceState({}, '', '/callback')` early in the async flow —
before the token exchange finished. React Router v6 intercepts `replaceState`
and immediately re-renders `CallbackPage`. The re-rendered page sees no `?code=`
param, falls through to the legacy `<Callback>` component (from
`@deriv-com/auth-client`), which redirects to Deriv login, racing against the
in-progress exchange.

**Fix:** Removed the `window.history.replaceState` call. The URL cleans up when
`window.location.href = '/'` fires on success.

**Why:** `replaceState` must not be called mid-async inside a React Router route
component — it causes an immediate re-render with the cleaned URL.

## Bot builder trade parameters show "Not available"

**Root cause:** The `_setupNewSystemApiProxy` in `api-base.ts` routes
`contracts_for` and `trading_times` through the **unauthenticated legacy WS**.
Without auth, `contracts_for('R_100')` returns `OfferingsInvalidSymbol` and
`trading_times` returns `OutputValidationFailed`. The bot builder falls back to
"Not available" when `contracts_for` fails.

**Fix:** Added `contracts_for` and `trading_times` to the `TRADE_MSG_TYPES` set
in `_setupNewSystemApiProxy`. When the OTP WS is connected (authenticated), both
go through it. `active_symbols` and ticks stay on the legacy WS (they work
without auth).

**Why:** The OTP WebSocket is pre-authenticated via OTP; the legacy WS is
deliberately kept unauthenticated for new-auth users (no legacy token available).
Market-data calls that need auth must therefore go through the OTP WS.

## active-symbols.js simplification

Removed null-guard fallback (`if (!api_base.active_symbols_promise) ...`) from
`retrieveActiveSymbols`. It is safe because `api_base.init()` always sets
`active_symbols_promise` before the bot builder UI is mounted.
