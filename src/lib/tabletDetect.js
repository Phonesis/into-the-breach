/** True when the primary input is touch without a precise pointer (tablet / phone). */

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

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;

  if (coarse && noHover) return true;
  if (noHover && !fine && window.innerWidth >= 480) return true;

  return false;
}