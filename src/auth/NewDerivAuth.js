const CONFIG = {
  clientId:    "337DJLKi2OJ4VsyFSLIt9",
  legacyAppId: "101585",
  redirectUri: "https://makotitraderss.vercel.app/callback",
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

function clearNewAuthStorage() {
  sessionStorage.removeItem(K.token);
  sessionStorage.removeItem(K.expiry);
  localStorage.removeItem(K.verifier);
  localStorage.removeItem(K.state);
  localStorage.removeItem(K.active);
  sessionStorage.removeItem(K.verifier);
  sessionStorage.removeItem(K.state);
  sessionStorage.removeItem(K.active);
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
  const savedVerifier = localStorage.getItem('NEW_AUTH_verifier')
  const savedActive = localStorage.getItem('NEW_AUTH_active')
  
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
    app_id:                CONFIG.legacyAppId
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
  console.log("[NEW AUTH] URL:", window.location.search)
  
  const urlParams = new URLSearchParams(window.location.search)
  const code = urlParams.get("code")
  const returnedState = urlParams.get("state")
  
  window.history.replaceState({}, '', '/callback')
  
  if (!code) {
    throw new Error("Missing authorization code from Deriv")
  }
  
  if (!returnedState) {
    throw new Error("Missing state parameter from Deriv")
  }
  
  const savedState = sessionStorage.getItem('deriv_oauth_state')
  
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
  
  const verifier = sessionStorage.getItem('deriv_code_verifier')
  
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
    sessionStorage.removeItem('deriv_code_verifier')
    sessionStorage.removeItem('deriv_oauth_state')
    throw new Error("Login failed: " + errMsg)
  }
  
  console.log("[NEW AUTH] Token received successfully")
  
  sessionStorage.setItem(K.token, data.access_token)
  sessionStorage.setItem(
    K.expiry,
    String(Date.now() + (data.expires_in * 1000))
  )
  sessionStorage.removeItem('deriv_code_verifier')
  sessionStorage.removeItem('deriv_oauth_state')
  
  console.log("[NEW AUTH] Token saved. Login complete.")
  
  return data.access_token
}

export function getNewToken() {
  const token = sessionStorage.getItem(K.token)
  const expiry = sessionStorage.getItem(K.expiry)
  if (!token || !expiry) return null
  if (Date.now() > Number(expiry)) {
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
    encodeURIComponent("https://makotitraderss.vercel.app")
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
  const account = Array.isArray(accounts) 
    ? accounts[0] 
    : accounts
  const accountId = account?.id || account?.account_id
  
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
  
  ws.onopen = () => {
    console.log("[NEW WS] Connected and authenticated via OTP")
    window._newSystemWS = ws
    window._newSystemWSReady = true
  }
  
  ws.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data)
      console.log("[NEW WS] Message received:", data.msg_type)
    } catch(e) {}
  }
  
  ws.onerror = (e) => {
    console.error("[NEW WS] Error:", e)
    window._newSystemWSReady = false
  }
  
  ws.onclose = () => {
    console.log("[NEW WS] Closed. Reconnecting in 3s...")
    window._newSystemWSReady = false
    if (isNewLoggedIn()) {
      setTimeout(createNewWebSocket, 3000)
    }
  }
  
  return ws
}
