import path from 'node:path';

/** Restrict the desktop origin to assets within the built game's directory. */
export function assetPath(requestUrl, root) {
  const url = new URL(requestUrl);
  if (url.protocol !== 'cerea:' || url.host !== 'game') return null;
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return file;
}
