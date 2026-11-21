/* ==========================================================================
   sw.js — Faz o sistema ser instalável e abrir mesmo sem internet.
   Estratégia "rede primeiro": com internet, sempre pega a versão nova do site
   (nada de tela velha depois de uma atualização). Sem internet, usa a última
   cópia guardada. Os DADOS não passam por aqui: o Firebase cuida deles
   (vendas feitas sem internet sobem sozinhas quando a conexão volta).
   Fica em /pages/ porque o Render só publica index.html, css, js, img e pages.
   ========================================================================== */
const CACHE = 'gestaoloja-v1';
// Bibliotecas de fora que as telas usam (ícones, Firebase, fontes, PDF)
const CDNS = ['unpkg.com', 'www.gstatic.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const doSite = url.origin === self.location.origin;
  const daCdn = CDNS.includes(url.hostname) && !url.pathname.includes('/firestore/');
  if (!doSite && !daCdn) return;            // Firebase/Firestore, Cloudinary etc.: direto, sem mexer
  if (doSite && url.pathname.endsWith('/sw.js')) return;
  e.respondWith(
    fetch(req).then((resp) => {
      if (resp && (resp.ok || resp.type === 'opaque')) {
        const copia = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
      }
      return resp;
    }).catch(async () => {
      const guardado = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (guardado) return guardado;
      if (req.mode === 'navigate') return (await caches.match(new URL('dashboard.html', self.registration.scope).href)) || Response.error();
      return Response.error();
    })
  );
});
