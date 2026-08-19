/** Resolve a public/ path for GitHub Pages subpath deploys (import.meta.env.BASE_URL). */
export function publicUrl(path) {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  const base = import.meta.env.BASE_URL ?? '/';
  return `${base}${clean}`;
}

const MENU_BG_VARS = {
  '--menu-bg-title': 'menu/menu-title.jpg',
  '--menu-bg-mode': 'menu/menu-mode.jpg',
  '--menu-bg-assault': 'menu/menu-assault.jpg',
  '--menu-bg-faction': 'menu/menu-faction.jpg',
  '--menu-bg-faction-germany': 'menu/menu-faction-germany.jpg',
  '--menu-bg-faction-usa': 'menu/menu-faction-usa.jpg',
  '--menu-bg-faction-uk': 'menu/menu-faction-uk.jpg',
  '--menu-bg-faction-russia': 'menu/menu-faction-russia.jpg',
  '--menu-bg-faction-japan': 'menu/menu-faction-japan.jpg',
  '--menu-bg-map': 'menu/menu-map.jpg',
};

/** Point CSS menu backgrounds at publicUrl() so GitHub Pages subpaths resolve. */
export function applyPublicAssetCssVars(root = document.documentElement) {
  if (!root?.style) return;
  for (const [name, path] of Object.entries(MENU_BG_VARS)) {
    root.style.setProperty(name, `url("${publicUrl(path)}")`);
  }
}