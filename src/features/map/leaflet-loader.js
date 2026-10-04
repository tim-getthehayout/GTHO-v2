/** @file Load Leaflet from CDN once. Avoids a lockfile bump for v1. */

const CSS_HREF = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const JS_HREF = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let loading = null;

export function loadLeaflet() {
  if (typeof window !== 'undefined' && window.L) return Promise.resolve(window.L);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${CSS_HREF}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CSS_HREF;
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = JS_HREF;
    script.async = true;
    script.onload = () => {
      if (window.L) resolve(window.L);
      else reject(new Error('Leaflet loaded without window.L'));
    };
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });

  return loading;
}
