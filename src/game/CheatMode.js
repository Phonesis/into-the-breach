/** Classic cheat code — toggles instant builds and unlimited player supplies. */

export const CHEAT_CODE = 'iddqd';

/** `?cheat=1` enables cheat mode on load (for touch devices); `?cheat=0` forces off. */
export function isCheatModeFromUrl() {
  if (typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('cheat') === '1') return true;
    if (params.get('cheat') === '0') return false;
  } catch {
    /* ignore */
  }

  return false;
}

export function createCheatKeyBuffer(code = CHEAT_CODE) {
  let buffer = '';
  return {
    feed(key) {
      if (key.length !== 1 || !/^[a-z]$/i.test(key)) {
        buffer = '';
        return false;
      }
      buffer = (buffer + key.toLowerCase()).slice(-code.length);
      if (buffer === code) {
        buffer = '';
        return true;
      }
      return false;
    },
    reset() {
      buffer = '';
    },
  };
}

/** Ignore cheat typing while focus is in a text field. */
export function shouldIgnoreCheatKeyEvent(event) {
  const tag = event.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return event.target?.isContentEditable === true;
}