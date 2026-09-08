'use client';

import { useEffect, useRef, useState } from 'react';
import type { RankedFoodCandidate } from '../../src/domain/food-finder';

declare global {
  interface Window { google?: any; __superabangGoogleMapsPromise?: Promise<void>; }
}

function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('BROWSER_REQUIRED'));
  if (window.google?.maps) return Promise.resolve();
  if (window.__superabangGoogleMapsPromise) return window.__superabangGoogleMapsPromise;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  if (!key) return Promise.reject(new Error('GOOGLE_MAPS_BROWSER_KEY_NOT_CONFIGURED'));

  window.__superabangGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-superabang-google-maps="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('GOOGLE_MAPS_SCRIPT_LOAD_FAILED')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.superabangGoogleMaps = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('GOOGLE_MAPS_SCRIPT_LOAD_FAILED'));
    document.head.appendChild(script);
  });
  return window.__superabangGoogleMapsPromise;
}

export default function FoodFinderMap({ ranked }: { ranked: RankedFoodCandidate[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!hostRef.current || ranked.length === 0) return;

    loadGoogleMaps().then(() => {
      if (cancelled || !hostRef.current || !window.google?.maps) return;
      const google = window.google;
      const map = new google.maps.Map(hostRef.current, {
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        clickableIcons: false,
      });
      const bounds = new google.maps.LatLngBounds();
      const info = new google.maps.InfoWindow();

      ranked.forEach((candidate, index) => {
        const position = { lat: candidate.place.lat, lng: candidate.place.lng };
        bounds.extend(position);
        const marker = new google.maps.Marker({
          map,
          position,
          label: String(index + 1),
          title: `${index + 1}. ${candidate.place.name}`,
        });
        marker.addListener('click', () => {
          const order = candidate.item ? `<br><strong>Order:</strong> ${escapeHtml(candidate.item.itemName)}` : '';
          info.setContent(`<strong>${index + 1}. ${escapeHtml(candidate.place.name)}</strong><br>${candidate.status}${order}`);
          info.open({ map, anchor: marker });
        });
      });
      map.fitBounds(bounds, 44);
      setStatus('');
    }).catch((error) => {
      if (!cancelled) setStatus(error instanceof Error ? error.message : String(error));
    });

    return () => { cancelled = true; };
  }, [ranked]);

  if (ranked.length === 0) return <div className="card">No candidates loaded yet.</div>;

  return <div className="card">
    <p><strong>Same ranked candidate set as List.</strong></p>
    <p className="muted">Pin numbers are the current Food Finder ranking. Changing context or verified menu evidence refreshes both List and Map from the same in-memory candidates; the map does not perform a second restaurant search.</p>
    {status && <p className="muted">Map unavailable: {status}</p>}
    <div ref={hostRef} aria-label="Food Finder ranked restaurant map" style={{ width: '100%', height: '420px', borderRadius: '12px', overflow: 'hidden' }} />
  </div>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char] ?? char));
}
