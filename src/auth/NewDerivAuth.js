import Cookies from 'js-cookie';

/**
 * Registry of message handlers for the new system (OTP) WebSocket.
 * Handlers survive reconnection: when a new WS is created, all registered
 * handlers are automatically attached to the new connection.
 * @type {Set<(event: MessageEvent) => void>}
 */
const _newSystemHandlers = new Set()
let __wsReconnecting = false

// ── Promise-based send (req_id matching) ─────────────────────────────────
/** @type {Map<number, {resolve: Function, reject: Function}>} */
const _pendingRequests = new Map()
let _reqIdCounter = 1

// Register internal handler to resolve pending Promises from OTP WS responses
_newSystemHandlers.add((event) => {
  try {
    const data = JSON.parse(event.data)
    if (data.req_id != null && _pendingRequests.has(data.req_id)) {
      const entry = _pendingRequests.get(data.req_id)
      if (data.error) {
        entry.reject({ error: data.error, echo_req: data.echo_req || data })
      } else {
        entry.resolve(data)
      }
      _pendingRequests.delete(data.req_id)
    }
  } catch (e) {
    console.warn("[NEW WS] handler parse error:", event.data)
  }
})

/**
 * Register a handler for messages from the new system OTP WebSocket.
 * The handler is automatically re-attached if the WS reconnects.
 * @param {(event: MessageEvent) => void} handler
 * @returns {() => void} unsubscribe function
 */
export function onNewSystemMessage(handler) {
  _newSystemHandlers.add(handler)
  return () => _newSystemHandlers.delete(handler)
}

/**
 * Send a JSON message through the new system OTP WebSocket.
 * @param {object} data - The data to send (will be JSON.stringify'd)
 * @returns {boolean} true if the message was sent
 */
export function sendViaNewSystem(data) {
  if (window._newSystemWS?.readyState === WebSocket.OPEN) {
    window._newSystemWS.send(JSON.stringify(convertToNewFormat(data)))
    return true
  }
  return false
}

/**
 * Convert legacy Deriv API message format to new Options API format.
 * Differences:
 *   - `symbol` → `underlying_symbol` in proposal / buy.parameters
 *   - `buy` integer must be string "1"
 */
function convertToNewFormat(data) {
  if (!data || typeof data !== 'object') return data
  const out = Array.isArray(data) ? data.map(convertToNewFormat) : { ...data }

  // proposal: symbol → underlying_symbol
  if (out.proposal === 1 && out.symbol) {
    out.underlying_symbol = out.symbol
    delete out.symbol
  }

  // buy: integer → string "1"
  if ('buy' in out) {
    out.buy = String(out.buy)
  }

  // sell: leave as-is (OTP API expects number)
  // buy.parameters: symbol → underlying_symbol
  if (out.parameters && typeof out.parameters === 'object') {
    out.parameters = { ...out.parameters }
    if ('symbol' in out.parameters) {
      out.parameters.underlying_symbol = out.parameters.symbol
      delete out.parameters.symbol
    }
  }

  return out
}

/**
 * Send a message through the OTP WebSocket and return a Promise that resolves
 * with the matching response (by req_id). Handles format conversion for the
 * new Options API.
 * @param {object} data
 * @returns {Promise<object>}
 */
export function sendViaNewSystemWithPromise(data) {
  return new Promise((resolve, reject) => {
    const reqId = data.req_id || ++_reqIdCounter
    data = { ...data, req_id: reqId }

    const converted = convertToNewFormat(data)

    _pendingRequests.set(reqId, { resolve, reject })

    if (!sendViaNewSystem(converted)) {
      _pendingRequests.delete(reqId)
      reject({
        error: {
          code: 'DisconnectError',
          message: 'New system WebSocket is not connected.',
        },
      })
    }
  })
}

/**
 * Subscribe to balance and POC updates on the OTP WebSocket.
 * This should only be called after the proxy bridge (_setupNewSystemApiProxy)
 * is active, so the proxy handler in _newSystemHandlers can forward messages
 * to api.onMessage() subscribers like handleMessages in CoreStoreProvider.
 */
export function subscribeNewSystemTopics() {
  if (window._newSystemTopicsSubscribed) return true
  const ws = window._newSystemWS
  if (!ws || ws.readyState !== WebSocket.OPEN) return false
  try {
    // Subscribe to live balance updates — subscribe:1 makes the server push
    // a new balance message after every trade settlement automatically.
    ws.send(JSON.stringify({ balance: 1, subscribe: 1 }))
    // Subscribe to all POC updates (matches legacy behavior in over-under-store line 886).
    // If the OTP WS rejects this (requires contract_id), the per-contract subscription
    // in over-under-store's _setupNewSystemTradeHandler serves as fallback.
    ws.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }))
    window._newSystemTopicsSubscribed = true
    console.log("[NEW WS] Subscribed to balance & POC updates")
  } catch(e) {
    console.warn("[NEW WS] Could not subscribe:", e)
    return false
  }
  return true
}

const CONFIG = {
  clientId:    "33ykZitbYuDLkIyluxFHu",
  legacyAppId: "",
  redirectUri: window.location.origin + '/callback',
  authUrl:     "https://auth.deriv.com/oauth2/auth",
  tokenUrl:    "https://auth.deriv.com/oauth2/token",
  restBase:    "https://api.derivws.com/trading/v1",
  scope:       "trade account_manage"
}

const K = {
  token:    "NEW_AUTH_token",
  expiry:   "NEW_AUTH_expiry",
  verifier: "NEW_AUTH_verifier",
  state:    "NEW_AUTH_state",
  active:   "NEW_AUTH_active"
}

export function clearNewAuthStorage() {
  localStorage.removeItem(K.token);
  localStorage.removeItem(K.expiry);
  localStorage.removeItem(K.verifier);
  localStorage.removeItem(K.state);
  localStorage.removeItem(K.active);
  sessionStorage.removeItem(K.token);
  sessionStorage.removeItem(K.expiry);
  sessionStorage.removeItem(K.verifier);
  sessionStorage.removeItem(K.state);
  sessionStorage.removeItem(K.active);
  // Clear legacy artifacts set by createNewWebSocket that trick isUserLoggedIn()
  localStorage.removeItem('accountsList');
  localStorage.removeItem('clientAccounts');
  localStorage.removeItem('active_loginid');
  localStorage.removeItem('authToken');
  localStorage.removeItem('client_account_details');
  localStorage.removeItem('show_as_cr');
  localStorage.removeItem('callback_token');
  localStorage.removeItem('client.accounts');
  localStorage.removeItem('client.country');
  sessionStorage.removeItem('cached_balances');
  try { Cookies.remove('logged_state', { path: '/', domain: window.location.hostname }); } catch {}
}

async function buildCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function generateVerifier() {
  const chars = 
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
    '0123456789-._~'
  const array = new Uint8Array(64)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map(x => chars[x % chars.length])
    .join('')
}

export async function startNewLogin() {
  console.log('[NEW AUTH] Login started...');
  clearNewAuthStorage()
  
  const verifier = generateVerifier()
  const challenge = await buildCodeChallenge(verifier)
  const state = crypto.randomUUID()
  
  localStorage.setItem(K.verifier, verifier)
  localStorage.setItem(K.state, state)
  localStorage.setItem(K.active, "true")

  // Verify values were actually saved
  const savedVerifier = localStorage.getItem(K.verifier)
  const savedActive = localStorage.getItem(K.active)
  
  console.log('[NEW AUTH] Pre-redirect verification:')
  console.log('[NEW AUTH] verifier saved:', !!savedVerifier)
  console.log('[NEW AUTH] active saved:', savedActive)
  
  if (!savedVerifier) {
    throw new Error('Failed to save login data to localStorage. ' +
      'Your browser may be blocking storage. Try disabling ' +
      'private browsing or browser extensions.')
  }
  
  const params = new URLSearchParams({
    response_type:         "code",
    client_id:             CONFIG.clientId,
    redirect_uri:          CONFIG.redirectUri,
    scope:                 CONFIG.scope,
    state:                 state,
    code_challenge:        challenge,
    code_challenge_method: "S256",
    prompt:                "login consent",
    ...(CONFIG.legacyAppId ? { app_id: CONFIG.legacyAppId } : {})
  })
  
  window.location.href = CONFIG.authUrl + "?" + params.toString()
}

export async function startNewSignup() {
  console.log('[NEW AUTH] Signup started...');
  clearNewAuthStorage()

  const verifier = generateVerifier()
  const challenge = await buildCodeChallenge(verifier)
  const state = crypto.randomUUID()

  localStorage.setItem(K.verifier, verifier)
  localStorage.setItem(K.state, state)
  localStorage.setItem(K.active, "true")

  const params = new URLSearchParams({
    response_type:         "code",
    client_id:             CONFIG.clientId,
    redirect_uri:          CONFIG.redirectUri,
    scope:                 CONFIG.scope,
    state:                 state,
    code_challenge:        challenge,
    code_challenge_method: "S256",
    prompt:                "registration",
    ...(CONFIG.legacyAppId ? { app_id: CONFIG.legacyAppId } : {})
  })

  window.location.href = CONFIG.authUrl + "?" + params.toString()
}

let _callbackHandled = false

export async function handleNewCallback() {
  if (_callbackHandled) {
    console.log("[NEW AUTH] Callback already handled, skipping")
    return null
  }
  _callbackHandled = true
  
  console.log("[NEW AUTH] Starting callback handler")
  console.log("[NEW AUTH] Full URL search:", window.location.search)
  console.log("[NEW AUTH] Full URL hash:", window.location.hash)

  // Read ALL params BEFORE wiping the URL from the address bar
  const urlParams = new URLSearchParams(window.location.search)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))

  const code         = urlParams.get("code")         || hashParams.get("code")
  const returnedState = urlParams.get("state")        || hashParams.get("state")
  const derivError   = urlParams.get("error")         || hashParams.get("error")
  const derivErrDesc = urlParams.get("error_description") || hashParams.get("error_description")

  // Check for legacy Deriv token-in-URL flow (acct1/token1 params)
  const legacyAcct  = urlParams.get("acct1")
  const legacyToken = urlParams.get("token1")

  console.log("[NEW AUTH] Params — code:", !!code, "state:", !!returnedState,
    "error:", derivError, "legacy:", !!legacyAcct)

  // Safe to wipe the URL now — we've captured everything
  window.history.replaceState({}, '', '/callback')

  // 1. Deriv sent an explicit error
  if (derivError) {
    throw new Error(
      `Deriv auth error: ${derivError}` +
      (derivErrDesc ? ` — ${derivErrDesc}` : '') +
      `\n\nThis usually means the Client ID or redirect URI isn't registered correctly in the Deriv developer portal.`
    )
  }

  // 2. Legacy token flow fallback (acct1/token1 in URL params)
  if (!code && legacyAcct && legacyToken) {
    console.log("[NEW AUTH] Detected legacy Deriv token flow — seeding localStorage directly")
    localStorage.setItem('authToken', legacyToken)
    localStorage.setItem('active_loginid', legacyAcct)
    const accountsList = { [legacyAcct]: legacyToken }
    const clientAccounts = {
      [legacyAcct]: {
        loginid: legacyAcct,
        token: legacyToken,
        currency: urlParams.get("cur1") || '',
        account_type: legacyAcct.startsWith('VR') ? 'demo' : 'real',
        balance: '0',
      }
    }
    localStorage.setItem('accountsList', JSON.stringify(accountsList))
    localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts))
    try {
      const Cookies = (await import('js-cookie')).default
      Cookies.set('logged_state', 'true', {
        domain: window.location.hostname, expires: 30, path: '/',
        secure: window.location.protocol === 'https:',
      })
    } catch (_) {}
    return legacyToken
  }

  // 3. Normal PKCE code flow
  if (!code) {
    throw new Error(
      "Missing authorization code from Deriv.\n\n" +
      "This can happen if:\n" +
      "• The Client ID isn't registered for PKCE/code flow in the Deriv developer portal\n" +
      "• The redirect URI doesn't exactly match the registered one\n" +
      "• You navigated to /callback directly without logging in"
    )
  }
  
  if (!returnedState) {
    throw new Error("Missing state parameter from Deriv")
  }
  
  // Read from localStorage with our keys (startNewLogin/startNewSignup save there)
  const savedState = localStorage.getItem(K.state)
  
  if (!savedState) {
    throw new Error(
      "Session expired during login. " +
      "Please go back and try again. " +
      "Do not refresh the page during login."
    )
  }
  
  if (savedState !== returnedState) {
    throw new Error(
      "Security check failed. " +
      "State mismatch detected. " +
      "Please go back and try again."
    )
  }
  
  const verifier = localStorage.getItem(K.verifier)
  
  if (!verifier) {
    throw new Error(
      "Login data missing. " +
      "This happens when login is opened in a new tab. " +
      "Please go back and try again in the same tab."
    )
  }
  
  console.log("[NEW AUTH] Exchanging code for token...")
  
  let response
  try {
    response = await fetch(CONFIG.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type:    "authorization_code",
        code:          code,
        redirect_uri:  CONFIG.redirectUri,
        client_id:     CONFIG.clientId,
        code_verifier: verifier
      }).toString()
    })
  } catch (networkErr) {
    throw new Error(
      "Network error during login. " +
      "Please check your internet connection and try again."
    )
  }
  
  const data = await response.json()
  console.log("[NEW AUTH] Token response status:", response.status)
  
  if (!response.ok) {
    const errMsg = data.error_description || data.error || 
      "Unknown error"
    console.error("[NEW AUTH] Token error:", errMsg)
    localStorage.removeItem(K.verifier)
    localStorage.removeItem(K.state)
    throw new Error("Login failed: " + errMsg)
  }
  
  console.log("[NEW AUTH] Token received successfully")
  
  localStorage.setItem(K.token, data.access_token)
  localStorage.setItem(
    K.expiry,
    String(Date.now() + (data.expires_in * 1000))
  )
  localStorage.removeItem(K.verifier)
  localStorage.removeItem(K.state)
  
  // Set legacy cookie so app recognizes logged-in state
  const cookieDomain = window.location.hostname
  document.cookie = "logged_state=true; path=/; domain=" + cookieDomain +
    "; max-age=" + (30 * 24 * 60 * 60) +
    "; secure=" + (window.location.protocol === 'https:')
  
  console.log("[NEW AUTH] Token saved. Login complete.")
  
  return data.access_token
}

export function getNewToken() {
  let token = localStorage.getItem(K.token)
  let expiry = localStorage.getItem(K.expiry)
  // Fallback to sessionStorage for sessions started before this change
  if (!token || !expiry) {
    token = sessionStorage.getItem(K.token)
    expiry = sessionStorage.getItem(K.expiry)
  }
  if (!token || !expiry) return null
  if (Date.now() > Number(expiry)) {
    localStorage.removeItem(K.token)
    localStorage.removeItem(K.expiry)
    sessionStorage.removeItem(K.token)
    sessionStorage.removeItem(K.expiry)
    return null
  }
  return token
}

export function isNewLoggedIn() {
  return getNewToken() !== null
}

export function getNewAuthHeaders() {
  return {
    "Authorization":  "Bearer " + getNewToken(),
    "Deriv-App-ID":   CONFIG.clientId,
    "Content-Type":   "application/json"
  }
}

export function logoutNewSystem() {
  clearNewAuthStorage()
  window.location.href =
    "https://auth.deriv.com/oauth2/sessions/logout" +
    "?redirect_uri=" +
    encodeURIComponent(window.location.origin)
}

export async function createNewWebSocket() {
  const token = getNewToken()
  if (!token) {
    console.error("[NEW WS] No token available")
    return null
  }
  
  console.log("[NEW WS] Getting accounts...")
  
  let accountsRes
  try {
    accountsRes = await fetch(
      CONFIG.restBase + "/options/accounts",
      { headers: getNewAuthHeaders() }
    )
  } catch(e) {
    console.error("[NEW WS] Network error getting accounts:", e)
    return null
  }
  
  const accountsText = await accountsRes.text()
  console.log("[NEW WS] Accounts response:", accountsText)
  
  if (!accountsRes.ok) {
    console.error("[NEW WS] Accounts error:", accountsText)
    return null
  }
  
  let accountsData
  try {
    accountsData = JSON.parse(accountsText)
  } catch(e) {
    console.error("[NEW WS] Could not parse accounts response")
    return null
  }
  
  const accounts = accountsData.data || accountsData
  const accountsArray = Array.isArray(accounts) ? accounts : (accounts ? [accounts] : [])
  // Respect the user's previously selected account (stored by the account switcher)
  const savedLoginId = localStorage.getItem('active_loginid')
  const account = savedLoginId
    ? accountsArray.find(acc => (acc.id || acc.account_id) === savedLoginId) || accountsArray[0]
    : accountsArray[0]
  const accountId = account?.id || account?.account_id
  
  // Save legacy accountsList/clientAccounts/client_account_details so the app
  // recognizes login state and the dashboard can render without crashing.
  const legacyAccountsList = {}
  const legacyClientAccounts = {}
  const legacyClientDetails = []
  accountsArray.forEach(acc => {
    const lid = acc.account_id || acc.id
    legacyAccountsList[lid] = lid
    legacyClientAccounts[lid] = { loginid: lid, token: lid, currency: acc.currency || 'USD' }
    legacyClientDetails.push({
      loginid: lid,
      currency: acc.currency || 'USD',
      token: lid,
      created_at: 0,
      is_virtual: acc.account_type === 'demo' ? 1 : 0,
      is_disabled: 0,
      landing_company_name: 'virtual',
      account_type: 'trading',
      account_category: 'trading',
      broker: '',
      currency_type: 'crypto',
      linked_to: [],
    })
  })
  localStorage.setItem('accountsList', JSON.stringify(legacyAccountsList))
  localStorage.setItem('clientAccounts', JSON.stringify(legacyClientAccounts))
  localStorage.setItem('client_account_details', JSON.stringify(legacyClientDetails))
  
  if (!accountId) {
    console.error("[NEW WS] No account ID found:", accountsData)
    return null
  }
  
  console.log("[NEW WS] Using account:", accountId)
  console.log("[NEW WS] Getting OTP...")
  
  let otpRes
  try {
    otpRes = await fetch(
      CONFIG.restBase + "/options/accounts/" + accountId + "/otp",
      { method: "POST", headers: getNewAuthHeaders() }
    )
  } catch(e) {
    console.error("[NEW WS] Network error getting OTP:", e)
    return null
  }
  
  const otpText = await otpRes.text()
  console.log("[NEW WS] OTP response:", otpText)
  
  if (!otpRes.ok) {
    console.error("[NEW WS] OTP error:", otpText)
    return null
  }
  
  let otpData
  try {
    otpData = JSON.parse(otpText)
  } catch(e) {
    console.error("[NEW WS] Could not parse OTP response")
    return null
  }
  
  const wsUrl = 
    otpData?.data?.url ||
    otpData?.data?.websocket_url ||
    otpData?.url ||
    otpData?.websocket_url
  
  if (!wsUrl) {
    console.error("[NEW WS] No WebSocket URL in:", otpData)
    return null
  }
  
  console.log("[NEW WS] Connecting to:", wsUrl)
  
  const ws = new WebSocket(wsUrl)
  
  ws.onopen = async () => {
    console.log("[NEW WS] Connected and authenticated via OTP")
    window._newSystemWS = ws
    window._newSystemWSReady = true
    
    // Wire up legacy auth state so the app recognizes this login
    localStorage.setItem('active_loginid', accountId)
    localStorage.setItem('authToken', accountId)
    
    // Save cached balances from REST API so CoreStoreProvider can display them
    // without needing the legacy WebSocket balance subscription
    try {
      const cachedBalances = {}
      accountsArray.forEach(acc => {
        const lid = acc.account_id || acc.id
        if (lid) {
          const decimals = (acc.currency === 'BTC' || acc.currency === 'ETH') ? 8 : 2
          cachedBalances[lid] = {
            balance:   parseFloat(acc.balance || '0').toFixed(decimals),
            currency:  acc.currency || 'USD',
            timestamp: Date.now()
          }
        }
      })
      if (Object.keys(cachedBalances).length > 0) {
        sessionStorage.setItem('cached_balances', JSON.stringify(cachedBalances))
        console.log("[NEW WS] Cached balances saved:", cachedBalances)
      }
    } catch(e) {
      console.warn("[NEW WS] Could not cache balances:", e)
    }
    
    // Notify the legacy auth observables so useApiBase / useActiveAccount pick it up
    try {
      const { 
        setAuthData, setAccountList, 
        setConnectionStatus, CONNECTION_STATUS,
        setIsAuthorized, setIsAuthorizing 
      } = await import(
        /* webpackChunkName: "connection-status-stream" */
        '@/external/bot-skeleton/services/api/observables/connection-status-stream'
      )
      const accountList = accountsArray.map(acc => ({
        loginid:   acc.account_id || acc.id,
        currency:  acc.currency || 'USD',
        is_virtual: acc.account_type === 'demo' ? 1 : 0,
        account_type: 'trading',
        is_disabled: 0,
        created_at: 0,
        landing_company_name: 'virtual',
        account_category: 'trading',
        broker: '',
        currency_type: 'crypto',
        linked_to: [],
      }))
      setAccountList(accountList)
      setAuthData({
        loginid:    accountId,
        currency:   account.currency || 'USD',
        balance:    parseFloat(account.balance || '0'),
        email:      '',
        fullname:   '',
        is_virtual: account.account_type === 'demo' ? 1 : 0,
        landing_company_fullname: '',
        landing_company_name:     'virtual',
        linked_to:      [],
        local_currencies: {},
        preferred_language: 'EN',
        scopes:            ['read', 'trade', 'admin'],
        upgradeable_landing_companies: [],
        user_id:  0,
        token:    accountId,
        country:  '',
        account_list: accountList,
      })
      setConnectionStatus(CONNECTION_STATUS.OPENED)
      setIsAuthorized(true)
      setIsAuthorizing(false)
    } catch(e) {
      console.warn("[NEW WS] Could not wire legacy auth state:", e)
    }

    // Subscription to balance/POC is handled by CoreStoreProvider.tsx after it
    // registers handleMessages in the proxy bridge's otpCallbacks.
    // _setupNewSystemApiProxy() also calls subscribeNewSystemTopics() as a safety
    // net; the function is idempotent (window._newSystemTopicsSubscribed flag).
  }
  
  ws.addEventListener('message', (event) => {
    let data

    try {
      data = JSON.parse(event.data)
    } catch (e) {
      console.warn("[NEW WS] Invalid JSON:", event.data)
      return
    }

    // 1. Forward to registered handlers
    _newSystemHandlers.forEach(handler => {
      try {
        handler(event)
      } catch (e) {
        console.warn("[NEW WS] Handler error:", e)
      }
    })

    // 2. Handle balance updates safely
    if (data?.msg_type === 'balance' && data.balance) {
      let balanceData = data.balance

      if (!balanceData.accounts && typeof balanceData.balance === 'number') {
        const lid =
          balanceData.loginid ||
          localStorage.getItem('active_loginid') ||
          'unknown'

        balanceData = {
          accounts: {
            [lid]: {
              balance: balanceData.balance,
              currency: balanceData.currency || 'USD',
              loginid: lid,
            }
          }
        }
      }

      window.dispatchEvent(
        new CustomEvent('new-system-balance', {
          detail: balanceData
        })
      )
    }

    // 3. Optional debug logs
    if (data?.error) {
      console.warn("[NEW WS] Error:", data.error?.message || data.error)
    } else if (data?.msg_type) {
      console.log("[NEW WS]", data.msg_type)
    }
  })
  
  ws.onerror = (e) => {
    console.error("[NEW WS] Error:", e)
    window._newSystemWSReady = false
  }
  
  ws.onclose = () => {
    console.log("[NEW WS] Closed. Reconnecting in 3s...")

    window._newSystemWSReady = false
    window._newSystemTopicsSubscribed = false

    const err = {
      error: {
        code: 'DisconnectError',
        message: 'New system WS disconnected'
      }
    }

    _pendingRequests.forEach(r => r.reject(err))
    _pendingRequests.clear()

    if (!isNewLoggedIn()) return
    if (__wsReconnecting) return

    __wsReconnecting = true

    const reconnect = (delay = 3000) => {
      setTimeout(async () => {
        try {
          const ws = await createNewWebSocket()

          if (!ws && isNewLoggedIn()) {
            reconnect(Math.min(delay * 1.5, 30000))
          } else {
            __wsReconnecting = false
          }
        } catch (e) {
          if (isNewLoggedIn()) {
            reconnect(Math.min(delay * 1.5, 30000))
          } else {
            __wsReconnecting = false
          }
        }
      }, delay)
    }

    reconnect(3000)
  }
  
  return ws
}
