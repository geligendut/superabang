'use client';

import { useEffect, useState } from 'react';

export function NetworkStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return <div className={`network-status ${online ? 'online' : 'offline'}`} role="status" aria-live="polite">
    {online ? 'Online' : 'Offline — workout logging remains local'}
  </div>;
}
