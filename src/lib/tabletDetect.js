/** True when the primary input is touch without a precise pointer (tablet / phone). */

import { GAME_SETTING_KEYS } from '../game/GameSettings.js';

export function isTabletLikeDevice() {
  if (typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tablet') === '1') return true;
    if (params.get('tablet') === '0') return false;
  } catch {
    /* ignore */
  }

  const touch = navigator.maxTouchPoints > 0;
  if (!touch) return false;

  // iPadOS can expose a desktop-class pointer when a keyboard or trackpad is
  // attached. It is still a tablet for the purposes of the optional setting.
  if (
    /iPad/i.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  ) {
    return true;
  }
  // Android tablets likewise may advertise a fine pointer once accessories
  // are attached; exclude phones by requiring the non-Mobile form.
  if (/Android/i.test(navigator.userAgent || '') && !/Mobile/i.test(navigator.userAgent || '')) {
    return true;
  }

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;

  if (coarse && noHover) return true;
  if (noHover && !fine && window.innerWidth >= 480) return true;

  return false;
}

/** True for iPadOS, including its desktop-class Safari user agent. */
export function isIPadLikeDevice() {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || '';
  return (
    /iPad/i.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * Tablet touch controls can be disabled when a keyboard/mouse is connected.
 * The raw device check remains separate so the preference is only meaningful
 * (and only shown) on tablet-class devices.
 */
export function isTabletModeEnabled() {
  if (!isTabletLikeDevice()) return false;
  try {
    return (globalThis.localStorage?.getItem(GAME_SETTING_KEYS.tabletMode) ?? '1') === '1';
  } catch {
    return true;
  }
}

/** True for phone-sized mobile browsers; tablets and desktop browsers remain supported. */
export function isPhoneLikeDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent || '';
  const isIPad = isIPadLikeDevice();

  // iPadOS can advertise itself as a Mac and older iPad Safari UAs include
  // "Mobile", so exclude both forms before checking for phone UAs.
  if (isIPad) return false;

  if (navigator.userAgentData?.mobile === true) return true;
  if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent);
  if (/iPhone|iPod|Windows Phone|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
    return true;
  }
  if (/\bMobile\b/i.test(userAgent)) return true;

  // Keep a fallback for browsers that omit a useful UA but expose a phone-like
  // touch viewport. The short edge keeps normal tablet layouts supported.
  const touch = navigator.maxTouchPoints > 0;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const noHover = window.matchMedia?.('(hover: none)').matches ?? false;
  const shortEdge = Math.min(window.innerWidth, window.innerHeight);
  return touch && coarse && noHover && shortEdge < 480;
}
