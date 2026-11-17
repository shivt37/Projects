const COOKIE = "projects_session";
const SESSION_TTL = 12 * 60 * 60;
const REMEMBER_TTL = 30 * 24 * 60 * 60;
const WINDOW_MS = 5 * 60 * 1000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function b64urlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacKey(env) {
  const secret = env.SESSION_SECRET || env.ADMIN_PIN || "change-me";
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(env, data) {
  const key = await hmacKey(env);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return b64urlEncode(new Uint8Array(signature));
}

async function fingerprint(env) {
  const value = await sign(env, String(env.ADMIN_PIN || ""));
  return value.slice(0, 16);
}

export function isAuthEnabled(env) {
  return String(env.AUTH_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

export async function pinMatches(env, pin) {
  const expected = String(env.ADMIN_PIN || "");
  const value = String(pin ?? "");
  if (!/^\d{4,12}$/.test(value)) return false;
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(value)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return constantTimeEqual(
    b64urlEncode(new Uint8Array(actualHash)),
    b64urlEncode(new Uint8Array(expectedHash)),
  );
}

function readCookie(request) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=");
  }
  return null;
}

export async function checkSession(request, env) {
  const token = readCookie(request);
  if (!token) return false;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return false;
  let payload;
  try {
    payload = decoder.decode(b64urlDecode(payloadB64));
  } catch {
    return false;
  }
  const expected = await sign(env, payload);
  if (!constantTimeEqual(signature, expected)) return false;
  const [expiry, fp] = payload.split("|");
  if (!expiry || Number.isNaN(Number(expiry)) || Number(expiry) <= Math.floor(Date.now() / 1000)) return false;
  if (fp !== await fingerprint(env)) return false;
  return true;
}

export async function createSession(env, remember = false) {
  const expiry = Math.floor(Date.now() / 1000) + (remember ? REMEMBER_TTL : SESSION_TTL);
  const payload = `${expiry}|${await fingerprint(env)}|${crypto.randomUUID()}`;
  return `${b64urlEncode(encoder.encode(payload))}.${await sign(env, payload)}`;
}

function isLocal(request) {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export function sessionHeaders(request, value, remember = false) {
  const secure = isLocal(request) ? "" : "; Secure";
  const maxAge = remember ? `; Max-Age=${REMEMBER_TTL}` : "";
  return {
    "Set-Cookie": `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}${maxAge}`,
  };
}

export function clearSessionHeaders(request) {
  const secure = isLocal(request) ? "" : "; Secure";
  return { "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0` };
}

export function noStore(headers = {}) {
  return { ...headers, "Cache-Control": "private, no-store" };
}

function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local";
}

export async function checkRateLimit(env, request) {
  if (!env.GATEWAY) return true;
  const window = Math.floor(Date.now() / WINDOW_MS);
  const ipKey = `rl:login:${clientIp(request)}:${window}`;
  const globalKey = `rl:login:global:${window}`;
  try {
    const [ipCount, globalCount] = await Promise.all([
      env.GATEWAY.get(ipKey),
      env.GATEWAY.get(globalKey),
    ]);
    if (Number(ipCount || 0) >= 10 || Number(globalCount || 0) >= 60) return false;
    await Promise.all([
      env.GATEWAY.put(ipKey, String(Number(ipCount || 0) + 1), { expirationTtl: 300 }),
      env.GATEWAY.put(globalKey, String(Number(globalCount || 0) + 1), { expirationTtl: 300 }),
    ]);
  } catch {
    return true;
  }
  return true;
}

const STYLE = `
:root{--bg:#050508;--surface:#0c0c13;--surface2:#13131d;--border:#1b1b26;--border2:#262635;--text:#e8edf4;--dim:#a5aebc;--muted:#8a93a8;--accent:#06b6d4;--accent-dim:rgba(6,182,212,.10);--danger:#ff5f66;--r:9px;--r2:14px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--font:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
*{box-sizing:border-box}html{color-scheme:dark}body{margin:0;min-block-size:100dvh;background:radial-gradient(900px 500px at 50% -10%,var(--accent-dim),transparent 70%),var(--bg);color:var(--text);font-family:var(--font);font-size:13px;line-height:1.5;display:grid;place-items:center;padding:24px}
main{inline-size:min(100%,320px);background:linear-gradient(180deg,var(--surface2),var(--surface));border:1px solid var(--border2);border-radius:var(--r2);padding:24px 22px;box-shadow:0 18px 60px rgba(0,0,0,.45)}
.brand{display:flex;align-items:center;gap:var(--s3);margin-block-end:18px}.mark{inline-size:26px;block-size:26px;display:block;flex-shrink:0}h1{font-size:15px;font-weight:600;letter-spacing:.01em;margin:0 0 3px;line-height:1.2}p.sub{margin:0 0 18px;color:var(--dim);font-size:12px}
.field{display:flex;flex-direction:column;gap:5px;margin-block-end:25px}label{font-size:11px;font-weight:500;color:var(--muted);letter-spacing:.02em}.hint{font-size:11px;color:var(--muted)}
.pin-row{display:flex;gap:var(--s2);align-items:stretch}
input[type=password]{font:inherit;font-size:14px;min-block-size:44px;padding:8px 10px;border-radius:var(--r);border:1px solid var(--border2);background:#0a0a11;color:var(--text);letter-spacing:.18em;font-variant-numeric:tabular-nums;text-align:center;flex:1 1 auto;min-inline-size:0}
input[type=password]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}input:user-invalid{border-color:var(--danger);background:rgba(255,95,102,.06)}
.error-msg{display:none;color:var(--danger);font-size:12px}.pin-row:has(input:user-invalid)+.error-msg{display:block}
.check{display:flex;gap:7px;align-items:center;color:var(--dim);font-size:12px;margin-block-end:14px}.check input{accent-color:var(--accent);inline-size:14px;block-size:14px}
button{font:inherit;cursor:pointer;min-block-size:44px;padding:9px 16px;border:1px solid var(--accent);border-radius:var(--r);background:var(--accent);color:#040507;font-size:13px;font-weight:600;inline-size:100%}button:hover{filter:brightness(1.08)}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#toggle-pin{inline-size:auto;flex:0 0 auto;padding:6px 10px;background:transparent;color:var(--dim);border-color:var(--border2);font-size:11px;font-weight:500}
.alert{padding:8px 10px;border-radius:var(--r);background:var(--accent-dim);border:1px solid var(--border2);color:var(--dim);font-size:12px;margin-block-end:14px}
.alert.error{border-color:rgba(255,95,102,.4);background:rgba(255,95,102,.10);color:#ffd9db}
.visually-hidden{position:absolute!important;clip-path:inset(50%);overflow:hidden;inline-size:1px;block-size:1px;margin:-1px;padding:0;border:0;white-space:nowrap}
`;

export function loginPageHtml(env, error = "") {
  const off = !isAuthEnabled(env || {});
  const message = error === "pin"
    ? "That PIN did not match. Try again."
    : error === "rate"
      ? "Too many attempts. Wait a few minutes and try again."
      : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#050508">
<title>Sign in · Projects</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' fill='none'><path d='M55.64 22.751H35.09C34.5596 22.751 34.0509 22.9617 33.6758 23.3368C33.3007 23.7118 33.09 24.2205 33.09 24.751V55.571C33.0916 56.1009 33.3028 56.6087 33.6775 56.9834C34.0523 57.3582 34.5601 57.5694 35.09 57.571H55.64C56.1699 57.5694 56.6777 57.3582 57.0525 56.9834C57.4272 56.6087 57.6384 56.1009 57.64 55.571V24.751C57.64 24.2205 57.4293 23.7118 57.0542 23.3368C56.6791 22.9617 56.1704 22.751 55.64 22.751Z' fill='%23e8edf4'/><path d='M55.64 5.62695H35.09C34.5596 5.62695 34.0509 5.83767 33.6758 6.21274C33.3007 6.58781 33.09 7.09652 33.09 7.62695V17.8969C33.0916 18.4269 33.3028 18.9347 33.6775 19.3094C34.0523 19.6841 34.5601 19.8954 35.09 19.8969H55.64C56.1699 19.8954 56.6777 19.6841 57.0525 19.3094C57.4272 18.9347 57.6384 18.4269 57.64 17.8969V7.62695C57.64 7.09652 57.4293 6.58781 57.0542 6.21274C56.6791 5.83767 56.1704 5.62695 55.64 5.62695Z' fill='%2306b6d4'/><path d='M28.24 36.451H7.7C6.59543 36.451 5.7 37.3465 5.7 38.451V55.5711C5.7 56.6756 6.59543 57.5711 7.7 57.5711H28.24C29.3446 57.5711 30.24 56.6756 30.24 55.5711V38.451C30.24 37.3465 29.3446 36.451 28.24 36.451Z' fill='%2306b6d4'/><path d='M28.24 5.62697H7.70002C7.43712 5.62604 7.17661 5.67714 6.93355 5.77733C6.69048 5.87751 6.46964 6.02477 6.28373 6.21068C6.09783 6.39658 5.95054 6.61742 5.85035 6.86049C5.75017 7.10355 5.6991 7.36406 5.70002 7.62697V31.557C5.70002 32.0874 5.91074 32.5961 6.28581 32.9712C6.66088 33.3462 7.16959 33.557 7.70002 33.557H28.24C28.7704 33.557 29.2791 33.3462 29.6542 32.9712C30.0293 32.5961 30.24 32.0874 30.24 31.557V7.62697C30.2409 7.36406 30.1898 7.10355 30.0896 6.86049C29.9895 6.61742 29.8422 6.39658 29.6563 6.21068C29.4704 6.02477 29.2495 5.87751 29.0065 5.77733C28.7634 5.67714 28.5029 5.62604 28.24 5.62697Z' fill='%23e8edf4'/></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>${STYLE}</style>
</head>
<body>
<main>
  <div class="brand">
    <svg class="mark" viewBox="0 0 64 64" fill="none" width="26" height="26" aria-hidden="true">
      <path d="M55.64 22.751H35.09C34.5596 22.751 34.0509 22.9617 33.6758 23.3368C33.3007 23.7118 33.09 24.2205 33.09 24.751V55.571C33.0916 56.1009 33.3028 56.6087 33.6775 56.9834C34.0523 57.3582 34.5601 57.5694 35.09 57.571H55.64C56.1699 57.5694 56.6777 57.3582 57.0525 56.9834C57.4272 56.6087 57.6384 56.1009 57.64 55.571V24.751C57.64 24.2205 57.4293 23.7118 57.0542 23.3368C56.6791 22.9617 56.1704 22.751 55.64 22.751Z" fill="var(--text)"/>
      <path d="M55.64 5.62695H35.09C34.5596 5.62695 34.0509 5.83767 33.6758 6.21274C33.3007 6.58781 33.09 7.09652 33.09 7.62695V17.8969C33.0916 18.4269 33.3028 18.9347 33.6775 19.3094C34.0523 19.6841 34.5601 19.8954 35.09 19.8969H55.64C56.1699 19.8954 56.6777 19.6841 57.0525 19.3094C57.4272 18.9347 57.6384 18.4269 57.64 17.8969V7.62695C57.64 7.09652 57.4293 6.58781 57.0542 6.21274C56.6791 5.83767 56.1704 5.62695 55.64 5.62695Z" fill="var(--accent)"/>
      <path d="M28.24 36.451H7.7C6.59543 36.451 5.7 37.3465 5.7 38.451V55.5711C5.7 56.6756 6.59543 57.5711 7.7 57.5711H28.24C29.3446 57.5711 30.24 56.6756 30.24 55.5711V38.451C30.24 37.3465 29.3446 36.451 28.24 36.451Z" fill="var(--accent)"/>
      <path d="M28.24 5.62697H7.70002C7.43712 5.62604 7.17661 5.67714 6.93355 5.77733C6.69048 5.87751 6.46964 6.02477 6.28373 6.21068C6.09783 6.39658 5.95054 6.61742 5.85035 6.86049C5.75017 7.10355 5.6991 7.36406 5.70002 7.62697V31.557C5.70002 32.0874 5.91074 32.5961 6.28581 32.9712C6.66088 33.3462 7.16959 33.557 7.70002 33.557H28.24C28.7704 33.557 29.2791 33.3462 29.6542 32.9712C30.0293 32.5961 30.24 32.0874 30.24 31.557V7.62697C30.2409 7.36406 30.1898 7.10355 30.0896 6.86049C29.9895 6.61742 29.8422 6.39658 29.6563 6.21068C29.4704 6.02477 29.2495 5.87751 29.0065 5.77733C28.7634 5.67714 28.5029 5.62604 28.24 5.62697Z" fill="var(--text)"/>
    </svg>
    <div><h1 id="login-title">Projects Gateway</h1><p class="sub">Enter your PIN to continue</p></div>
  </div>
  ${off ? '<p class="alert">Login is currently disabled. Anyone can open the gateway.</p>' : ""}
  ${message ? `<p class="alert error" role="alert">${message}</p>` : ""}
  <form method="post" action="/login" aria-labelledby="login-title">
    <div class="field">
      <label for="pin">PIN <span aria-hidden="true">*</span></label>
      <span id="pin-hint" class="hint">4–12 digits. Paste is allowed.</span>
      <div class="pin-row">
        <input type="password" id="pin" name="pin" inputmode="numeric" autocomplete="current-password" enterkeyhint="done" spellcheck="false" autocorrect="off" autocapitalize="off" pattern="[0-9]{4,12}" minlength="4" maxlength="12" required aria-invalid="false" aria-describedby="pin-hint" data-error="pin-error">
        <button type="button" id="toggle-pin" aria-pressed="false" aria-describedby="toggle-hint">Show</button>
      </div>
      <span id="toggle-hint" class="visually-hidden">Warning: showing the PIN will display it on screen.</span>
      <div id="pin-error" class="error-msg"><span role="img" aria-label="Error">&#10006;</span> Enter 4 to 12 digits.</div>
    </div>
    <label class="check"><input type="checkbox" id="remember" name="remember"> Keep me signed in for 30 days</label>
    <button type="submit">Sign in</button>
  </form>
  <div id="live" class="visually-hidden" aria-live="polite"></div>
</main>
<script>
(function () {
  const form = document.querySelector('form');
  const input = document.getElementById('pin');
  const announcer = document.getElementById('live');
  const toggle = document.getElementById('toggle-pin');

  const linkError = function (shown) {
    const errorId = input.dataset.error;
    const ids = (input.getAttribute('aria-describedby') || '').split(/\\s+/).filter(function (id) { return id && id !== errorId; });
    if (shown) ids.push(errorId);
    if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
    else input.removeAttribute('aria-describedby');
  };

  const setInvalid = function (invalid, announce) {
    input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    linkError(invalid);
    if (invalid && announce) announcer.textContent = 'Enter 4 to 12 digits.';
  };

  toggle.addEventListener('click', function () {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', show ? 'true' : 'false');
    toggle.textContent = show ? 'Hide' : 'Show';
    input.focus();
  });

  input.addEventListener('blur', function () {
    if (input.value) setInvalid(!input.checkValidity(), true);
  });
  input.addEventListener('input', function () {
    if (input.getAttribute('aria-invalid') === 'true' && input.checkValidity()) setInvalid(false, false);
  });

  form.addEventListener('submit', function (e) {
    if (!input.checkValidity()) {
      setInvalid(true, false);
      input.focus();
      e.preventDefault();
      return;
    }
    form.querySelector('button[type="submit"]').disabled = true;
  });
})();
</script>
</body>
</html>`;
}

function redirect(path, headers = {}) {
  return new Response(null, { status: 303, headers: { Location: path, ...noStore(), ...headers } });
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: noStore({ "content-type": "application/json; charset=utf-8" }),
  });
}

export async function handleLogin(request, env) {
  if (!isAuthEnabled(env)) return redirect("/");
  const type = request.headers.get("content-type") || "";
  let pin;
  let remember = false;
  try {
    if (type.includes("application/json")) {
      const body = await request.json();
      pin = body.pin;
      remember = Boolean(body.remember);
    } else {
      const form = await request.formData();
      pin = form.get("pin");
      remember = form.get("remember") === "on";
    }
  } catch {
    return type.includes("application/json") ? jsonError(400, "Invalid request") : redirect("/login?error=pin");
  }

  if (!(await checkRateLimit(env, request))) {
    return type.includes("application/json") ? jsonError(429, "Too many attempts") : redirect("/login?error=rate");
  }
  if (!(await pinMatches(env, pin))) {
    return type.includes("application/json") ? jsonError(401, "Incorrect PIN") : redirect("/login?error=pin");
  }

  const session = await createSession(env, remember);
  if (type.includes("application/json")) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: noStore({ "content-type": "application/json; charset=utf-8", ...sessionHeaders(request, session, remember) }),
    });
  }
  return redirect("/", sessionHeaders(request, session, remember));
}

export function handleLogout(request) {
  return redirect("/login", clearSessionHeaders(request));
}
