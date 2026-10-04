(() => {
  "use strict";

  const COVER_ID = "chatgpt-privacy-lock";
  const PIN_HASH_KEY = "pinHash";
  const PIN_SALT_KEY = "pinSalt";
  const POLL_INTERVAL = 200;

  let cover = null;
  let unlocked = false;
  let currentUrl = location.href;
  let lockGeneration = 0;

  const bytesToHex = (bytes) =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  const createSalt = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  };

  const hashPin = async (pin, salt) => {
    const data = new TextEncoder().encode(`${salt}:${pin}`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return bytesToHex(new Uint8Array(digest));
  };

  const storageGet = (keys) =>
    new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      });
    });

  const storageSet = (values) =>
    new Promise((resolve, reject) => {
      chrome.storage.local.set(values, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });

  const savePin = async (pin) => {
    const salt = createSalt();
    const hash = await hashPin(pin, salt);
    await storageSet({
      [PIN_HASH_KEY]: hash,
      [PIN_SALT_KEY]: salt
    });
  };

  const el = (selector) => cover.querySelector(selector);

  const setMessage = (message, type = "") => {
    const node = el("[data-lock-message]");
    node.textContent = message;
    node.className = `lock-message${type ? ` ${type}` : ""}`;
  };

  const setMode = (setup) => {
    el("[data-lock-title]").textContent =
      setup ? "Initialize secure session" : "Unlock workspace";

    el("[data-lock-description]").textContent =
      setup
        ? "Create a PIN. It never leaves this browser."
        : "Enter the PIN to open this ChatGPT document.";

    el("[data-lock-submit]").textContent = setup ? "Save PIN" : "Unlock";

    el("[data-lock-input]").autocomplete =
      setup ? "new-password" : "current-password";
  };

  const focusInput = () => {
    const input = el("[data-lock-input]");
    input.value = "";
    window.setTimeout(() => input.focus(), 0);
  };

  const showCover = () => {
    cover.hidden = false;
    cover.setAttribute("aria-hidden", "false");
    cover.classList.remove("lock-cover-hidden");
    document.documentElement.classList.add("chatgpt-lock-active");
  };

  const hideCover = () => {
    cover.classList.add("lock-cover-hidden");
    cover.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("chatgpt-lock-active");

    window.setTimeout(() => {
      if (unlocked) cover.hidden = true;
    }, 180);
  };

  const loadPinMode = async (generation) => {
    try {
      const stored = await storageGet([PIN_HASH_KEY, PIN_SALT_KEY]);

      if (generation !== lockGeneration || unlocked) return;

      const hasPin =
        typeof stored[PIN_HASH_KEY] === "string" &&
        typeof stored[PIN_SALT_KEY] === "string";

      setMode(!hasPin);
      setMessage("");
      focusInput();
    } catch {
      setMessage("PIN storage is unavailable.", "error");
    }
  };

  const lock = () => {
    lockGeneration += 1;
    unlocked = false;

    showCover();
    setMessage("");
    loadPinMode(lockGeneration);
  };

  const unlock = () => {
    unlocked = true;
    hideCover();
  };

  const submitPin = async (event) => {
    event.preventDefault();

    const generation = lockGeneration;
    const input = el("[data-lock-input]");
    const pin = input.value;

    if (!pin) {
      setMessage("Enter a PIN to continue.", "error");
      input.focus();
      return;
    }

    try {
      const stored = await storageGet([PIN_HASH_KEY, PIN_SALT_KEY]);

      if (generation !== lockGeneration || unlocked) return;

      const hasPin =
        typeof stored[PIN_HASH_KEY] === "string" &&
        typeof stored[PIN_SALT_KEY] === "string";

      if (!hasPin) {
        if (pin.length < 4) {
          input.value = "";
          setMessage("PIN must contain at least 4 characters.", "error");
          input.focus();
          return;
        }

        await savePin(pin);

        if (generation === lockGeneration) unlock();
        return;
      }

      const candidate = await hashPin(pin, stored[PIN_SALT_KEY]);

      if (candidate === stored[PIN_HASH_KEY]) {
        unlock();
      } else {
        input.value = "";
        setMessage("Incorrect PIN. Try again.", "error");
        input.focus();
      }
    } catch {
      setMessage("Unable to access PIN storage.", "error");
    }
  };

  const createCover = () => {
    if (cover) return;

    cover = document.createElement("aside");
    cover.id = COVER_ID;
    cover.setAttribute("role", "dialog");
    cover.setAttribute("aria-modal", "true");
    cover.setAttribute("aria-label", "ChatGPT privacy lock");

    cover.innerHTML = `
      <div class="lock-window">
        <header class="lock-titlebar">
          <div class="lock-window-controls" aria-hidden="true">
            <i></i><i></i><i></i>
          </div>
          <span>ChatGPT</span>
        </header>

        <div class="lock-editor" aria-hidden="true">
          <div class="lock-gutter">
            <span>01</span><span>02</span><span>03</span>
            <span>04</span><span>05</span><span>06</span>
          </div>

          <div class="lock-code">
            <div><b class="syntax-blue">{</b></div>
            <div>
              &nbsp;&nbsp;<span class="syntax-blue">"access"</span>:
              <span class="syntax-green">"nah"</span>,
            </div>
            <div>
              &nbsp;&nbsp;<span class="syntax-blue">"status"</span>:
              <span class="syntax-green">"active"</span>,
            </div>
            <div>
              &nbsp;&nbsp;<span class="syntax-blue">"origin"</span>:
              <span class="syntax-orange">chatgpt.com</span>,
            </div>
            <div>
              &nbsp;&nbsp;<span class="syntax-blue">"session"</span>:
              <span class="syntax-purple">what_session?</span>
            </div>
            <div><b class="syntax-blue">}</b></div>
          </div>
        </div>

        <main class="lock-content">
          <div class="lock-breadcrumb">
            <span>EXPLORER</span>
            <strong>CHATGPT</strong>
            <span>/</span>
            <strong>SECURE SESSION</strong>
          </div>

          <div class="lock-icon" aria-hidden="true">🔒</div>
          <p class="lock-kicker">ACCESS CONTROL</p>

          <h1 data-lock-title>Unlock workspace</h1>

          <p class="lock-description" data-lock-description>
            Enter the PIN to open this ChatGPT document.
          </p>

          <form class="lock-form">
            <label for="chatgpt-lock-pin">PIN</label>
            <input
              id="chatgpt-lock-pin"
              data-lock-input
              type="password"
              inputmode="numeric"
              autocomplete="current-password"
              spellcheck="false"
              minlength="4"
              required
            >

            <button data-lock-submit type="submit">Unlock</button>

            <p
              class="lock-message"
              data-lock-message
              role="alert"
              aria-live="polite"
            ></p>
          </form>

          <p class="lock-footer">
            <span class="lock-dot"></span>
            SP1CE
            <span class="lock-footer-divider">|</span>
            Network access null
          </p>
        </main>

        <footer class="lock-statusbar">
          <span>Ln 1, Col 1</span>
          <span>UTF-8</span>
          <span>SHA-256</span>
          <span>7a3*****</span>
        </footer>
      </div>
    `;

    document.documentElement.appendChild(cover);
    el(".lock-form").addEventListener("submit", submitPin);
  };

  const handleUrlChange = () => {
    if (location.href === currentUrl) return;

    currentUrl = location.href;
    lock();
  };

  const patchHistory = (methodName) => {
    const original = history[methodName];

    history[methodName] = function (...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event("chatgpt-lock-url-change"));
      return result;
    };
  };

  const start = () => {
    // Defense in depth. The manifest already restricts this script
    // to https://chatgpt.com/*.
    if (
      location.protocol !== "https:" ||
      location.hostname !== "chatgpt.com"
    ) {
      return;
    }

    createCover();
    lock();

    patchHistory("pushState");
    patchHistory("replaceState");

    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("chatgpt-lock-url-change", handleUrlChange);

    window.setInterval(handleUrlChange, POLL_INTERVAL);
  };

  if (document.documentElement) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
})();