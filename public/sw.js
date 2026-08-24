// Service worker whose only job is the Android share target.
//
// When Chrome hands a shared image to a POST share_target it performs a real
// form POST navigation. There is no way to get that file into React from a
// navigation, so we intercept the POST here, park the file in Cache Storage,
// and redirect to a normal GET that the page can read it back from.
//
// Deliberately no offline caching: this app is a live view of a Google Sheet,
// and a stale cached dashboard showing wrong totals would be worse than an
// error message.

const CACHE = 'shared-receipt';
const STASH_URL = '/shared-file';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Header values must be Latin-1; an emoji or Devanagari filename from Google
// Photos would otherwise throw when constructing the Response.
function headerSafe(value, fallback) {
  const s = String(value || '').replace(/[^\x20-\x7E]/g, '');
  return s.trim() || fallback;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return;

  event.respondWith((async () => {
    let ok = false;
    try {
      const form = await event.request.formData();
      const file = form.get('file');
      if (file && typeof file !== 'string') {
        const cache = await caches.open(CACHE);
        await cache.put(STASH_URL, new Response(file, {
          headers: {
            'content-type': file.type || 'image/jpeg',
            'x-file-name': headerSafe(file.name, 'shared-receipt.jpg'),
            'x-file-type': headerSafe(file.type, 'image/jpeg'),
          },
        }));
        ok = true;
      }
    } catch (err) {
      // Fall through to the redirect — the page shows a readable error rather
      // than Chrome showing a blank failed navigation.
    }
    const target = new URL(ok ? '/?shared=1' : '/?shared=failed', self.location.origin);
    return Response.redirect(target.href, 303);
  })());
});
