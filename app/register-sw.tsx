'use client';

import { useEffect } from 'react';

/**
 * Registers the share-target service worker. Without a registered worker Chrome
 * will not offer "Install app", and without an installed app the share sheet
 * never lists Receipt Tracker — so this is what makes the two-tap flow from
 * Google Photos possible at all.
 */
export default function RegisterSW() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration fails on http:// origins other than localhost. Nothing to
      // do about it here and nothing else depends on the worker.
    });
  }, []);
  return null;
}
