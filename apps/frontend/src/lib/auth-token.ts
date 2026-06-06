const AUTH_TOKEN_KEY = "panorama_auth_token";
const LEGACY_AUTH_TOKEN_KEY = "wealthfolio_auth_token";

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

function getLocalStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storage = globalThis.localStorage;
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function" ||
    typeof storage.removeItem !== "function"
  ) {
    return null;
  }

  return storage;
}

function safeGetAuthToken() {
  try {
    const storage = getLocalStorage();
    return storage?.getItem(AUTH_TOKEN_KEY) ?? storage?.getItem(LEGACY_AUTH_TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

// Initialize from localStorage if available
authToken = safeGetAuthToken();

function persistAuthToken(token: string | null) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    if (token) {
      storage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      storage.removeItem(AUTH_TOKEN_KEY);
      storage.removeItem(LEGACY_AUTH_TOKEN_KEY);
    }
  } catch {
    // Fall back to in-memory auth when storage is unavailable.
  }
}

export const setAuthToken = (token: string | null) => {
  authToken = token;
  persistAuthToken(token);
};

export const getAuthToken = () => authToken;

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};

export const notifyUnauthorized = () => {
  if (unauthorizedHandler) {
    unauthorizedHandler();
  }
};
