export const TOKEN_STORAGE_KEY = 'tiesverseAuthTokens';

export function readStoredTokens() {
  try {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    return null;
  }
}

export function storeTokens(tokens) {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

export function clearStoredTokens() {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;

  const [, payload] = token.split('.');
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function isExpired(user) {
  if (!user?.exp) return false;
  return Date.now() >= user.exp * 1000;
}

export function hasPermission(user, codename) {
  if (user?.is_superuser) return true;
  return (user?.permissions || []).includes(codename);
}

export function getDisplayName(user) {
  return user?.name || user?.full_name || user?.username || user?.email || 'TiesVerse user';
}
