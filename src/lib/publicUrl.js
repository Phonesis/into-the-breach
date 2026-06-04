/** Resolve a public/ path for GitHub Pages subpath deploys (import.meta.env.BASE_URL). */
export function publicUrl(path) {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  const base = import.meta.env.BASE_URL ?? '/';
  return `${base}${clean}`;
}