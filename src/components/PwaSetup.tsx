'use client';

import { useEffect } from 'react';

function base64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from(Array.from(raw).map((c) => c.charCodeAt(0)));
}

/** Enregistre le service worker et l'abonnement push (silencieux si non supporté/refusé). */
export default function PwaSetup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');

        if (!('PushManager' in window) || !('Notification' in window)) return;
        const { publicKey } = await fetch('/api/push/key').then((r) => r.json());
        if (!publicKey) return; // VAPID non configuré

        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        if (Notification.permission !== 'granted') return;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64ToUint8Array(publicKey)
          });
        }
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub)
        });
      } catch {
        // best effort — le portail fonctionne sans push
      }
    })();
  }, []);

  return null;
}
