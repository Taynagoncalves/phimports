/* ==========================================================================
   catalogo.js — Loja online da PH Imports (sem login).
   Lê UM documento (catalogos/{lojaId}) com a cópia pública das peças.
   A cliente monta a sacola e finaliza o pedido pelo WhatsApp da loja.
   ========================================================================== */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Fotos do Cloudinary no tamanho certo (mais leve no celular)
  const foto = (url, largura) => (url && url.includes('/image/upload/') ? url.replace(/\/image\/upload\/(f_auto,q_auto\/)?/, `/image/upload/f_auto,q_auto,c_limit,w_${largura}/`) : url);
  const ICONE_CABIDE = '<svg viewBox="0 0 24 24" class="sem-foto"><path d="M12 7a2 2 0 1 1 2-2c0 1.1-2 1.5-2 3v1M12 9 3 15.5a1.4 1.4 0 0 0 .8 2.5h16.4a1.4 1.4 0 0 0 .8-2.5L12 9Z"/></svg>';
  const ICONE_MAIS = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
  const ICONE_WHATS = '<svg viewBox="0 0 24 24" class="cheio" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';
  const ICONE_INSTA = '<svg viewBox="0 0 24 24" class="cheio" aria-hidden="true"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/></svg>';

  const params = new URLSearchParams(location.search);
  const lojaId = params.get('l') || window.CATALOGO_PRINCIPAL || '';
  const CHAVE_SACOLA = `catalogo:sacola:${lojaId || 'local'}`;
  const CHAVE_CLIENTE = 'catalogo:cliente';

  let cat = null;           // catálogo publicado
  let categoria = '';
  let aberta = null;        // peça aberta
  let escolha = { c: '', t: '', qtd: 1 };
  let sacola = [];          // [{ id, c, t, qtd }]

  /* ---------- Dados ---------- */
  async function carregar() {
    const cfg = window.FIREBASE_CONFIG;
    if (cfg && cfg.apiKey && lojaId && window.firebase) {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      const doc = await firebase.firestore().collection('catalogos').doc(lojaId).get();
      return doc.exists ? doc.data() : null;
    }
    // Sem Firebase (teste no computador): usa a cópia local
    try { return JSON.parse(localStorage.getItem('gestaoloja:catalogo') || 'null'); } catch (e) { return null; }
  }
  const acharPeca = (id) => cat.produtos.find((p) => p.id === id);
  const precoDe = (p) => (p.preco === null || p.preco === undefined ? null : (p.promo && p.promo < p.preco ? p.promo : p.preco));
  const temPromo = (p) => p.preco && p.promo && p.promo < p.preco;
  const coresDe = (p) => { const m = new Map(); p.variacoes.forEach((v) => { if (v.c && !m.has(v.c)) m.set(v.c, v.h || ''); }); return [...m.entries()]; };
  const tamanhosDe = (p) => [...new Set(p.variacoes.map((v) => v.t).filter(Boolean))];
  const variacao = (p, c, t) => p.variacoes.find((v) => (v.c || '') === (c || '') && (v.t || '') === (t || ''));
  const qtdDe = (v) => (v && v.q !== undefined && v.q !== null ? Number(v.q) : 10);   // catálogo antigo sem quantidade = disponível
  const estoqueDe = (p) => (p.estoque !== undefined ? Number(p.estoque) : p.variacoes.reduce((s, v) => s + qtdDe(v), 0));
  const esgotada = (p) => estoqueDe(p) <= 0;
  const tamanhosDisponiveis = (p) => [...new Set(p.variacoes.filter((v) => qtdDe(v) > 0).map((v) => v.t).filter(Boolean))];
  function textoEstoque(n) {
    if (n <= 0) return 'Esgotado';
    if (n === 1) return 'Última peça';
    if (n <= 3) return `Últimas ${n} peças`;
    return `${n} em estoque`;
  }
  const linkWhats = (texto) => `https://wa.me/${cat.whatsapp}?text=${encodeURIComponent(texto)}`;

  function aviso(texto) {
    const el = $('toast');
    el.textContent = texto; el.hidden = false;
    clearTimeout(aviso.t); aviso.t = setTimeout(() => { el.hidden = true; }, 2200);
  }

  /* ---------- Topo, abertura e rodapé ---------- */
  function desenharMarca() {
    document.title = `${cat.nome} — Catálogo`;
    if (cat.logo) $('logo-topo').src = cat.logo;
    $('logo-topo').alt = cat.nome;
    $('hero-sobre').textContent = cat.nome;
    // Faixa do topo: o recado da loja (separe por "·") + avisos fixos
    const avisos = [
      ...String(cat.mensagem || '').split(/\s*[·|]\s*/).filter(Boolean),
      cat.entrega === false ? 'Retire na loja' : 'Enviamos para todo o Brasil',
      'Pedido rápido pelo WhatsApp',
      'Atendimento personalizado'
    ].filter((a, i, l) => l.findIndex((b) => normalizar(b) === normalizar(a)) === i);
    const volta = avisos.map((a) => `<span>${esc(a)}</span><i aria-hidden="true">✦</i>`).join('');
    $('anuncio-trilho').innerHTML = `<div>${volta}</div><div aria-hidden="true">${volta}</div>`;
    if (cat.whatsapp) { $('topo-whats').href = linkWhats(`Olá! Vim pelo catálogo da ${cat.nome} e tenho uma dúvida.`); $('topo-whats').hidden = false; }
    if (cat.instagram) { $('topo-insta').href = `https://instagram.com/${encodeURIComponent(cat.instagram)}`; $('topo-insta').hidden = false; }
    const links = [];
    if (cat.whatsapp) links.push(`<a href="${linkWhats(`Olá! Vim pelo catálogo da ${cat.nome}.`)}" target="_blank" rel="noopener">${ICONE_WHATS}WhatsApp</a>`);
    if (cat.instagram) links.push(`<a href="https://instagram.com/${encodeURIComponent(cat.instagram)}" target="_blank" rel="noopener">${ICONE_INSTA}@${esc(cat.instagram)}</a>`);
    $('rodape').innerHTML = `
      <div class="rodape-dentro">
        <img class="rodape-logo" src="${esc(cat.logo || '../img/logo-phimports.png')}" alt="${esc(cat.nome)}">
        <p class="rodape-frase">Sua presença fala, <em>seu estilo confirma</em>.</p>
        <div class="rodape-icones">
          ${cat.instagram ? `<a href="https://instagram.com/${encodeURIComponent(cat.instagram)}" target="_blank" rel="noopener" aria-label="Instagram">${ICONE_INSTA}</a>` : ''}
          ${cat.whatsapp ? `<a href="${linkWhats(`Olá! Vim pelo catálogo da ${cat.nome}.`)}" target="_blank" rel="noopener" aria-label="WhatsApp">${ICONE_WHATS}</a>` : ''}
        </div>
        <ol class="rodape-passos">
          <li><strong>01</strong>Escolha as peças</li>
          <li><strong>02</strong>Finalize pelo WhatsApp</li>
          <li><strong>03</strong>${cat.entrega === false ? 'Retire na loja' : 'Receba em todo o Brasil'}</li>
        </ol>
        ${cat.endereco ? `<p class="rodape-endereco">${esc(cat.endereco)}</p>` : ''}
      </div>
      <small>© ${new Date().getFullYear()} ${esc(cat.nome)}${cat.instagram ? ` · @${esc(cat.instagram)}` : ''}</small>`;
  }

  /* ---------- Cards ---------- */
  function precoHtml(p) {
    if (precoDe(p) === null) return '<span class="consulte">Consulte o preço</span>';
    return temPromo(p) ? `<s>${moeda(p.preco)}</s><strong class="em-promo">${moeda(p.promo)}</strong>` : `<strong>${moeda(p.preco)}</strong>`;
  }
  function cardHtml(p) {
    const cores = coresDe(p).filter(([, h]) => h).slice(0, 5);
    const n = estoqueDe(p);
    const tams = tamanhosDisponiveis(p);
    const selo = n <= 0 ? '<span class="selo esgotado">Esgotado</span>'
      : temPromo(p) ? `<span class="selo promo">−${Math.round((1 - p.promo / p.preco) * 100)}%</span>`
      : p.novo ? '<span class="selo">Novo</span>' : '';
    return `
      <button type="button" class="card${n <= 0 ? ' esgotado' : ''}" data-peca="${esc(p.id)}" aria-label="${esc(p.nome)} — ${esc(textoEstoque(n))}">
        <div class="card-foto">
          ${p.foto ? `<img src="${esc(foto(p.foto, 600))}" alt="" loading="lazy">` : ICONE_CABIDE}
          ${selo}
          <span class="card-ver" aria-hidden="true">${n <= 0 ? 'Avise-me quando chegar' : tams.length ? tams.map(esc).join('  ·  ') : 'Ver peça'}</span>
        </div>
        <div class="card-nome">${esc(p.nome)}</div>
        <div class="preco">${precoHtml(p)}</div>
        <div class="card-pe">
          ${cores.length > 1 ? `<div class="card-cores">${cores.map(([, h]) => `<span style="background:${esc(h)}"></span>`).join('')}</div>` : '<span></span>'}
          <span class="card-estoque${n > 0 && n <= 3 ? ' poucas' : ''}">${esc(textoEstoque(n))}</span>
        </div>
      </button>`;
  }
  // Peças aparecem suavemente ao rolar a página
  const revelar = 'IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? new IntersectionObserver((itens) => itens.forEach((it) => { if (it.isIntersecting) { it.target.classList.add('visivel'); revelar.unobserve(it.target); } }), { rootMargin: '0px 0px -40px 0px' })
    : null;
  const ligarCards = (raiz) => raiz.querySelectorAll('[data-peca]').forEach((b, i) => {
    b.addEventListener('click', () => abrirPeca(b.dataset.peca));
    if (revelar) { b.classList.add('revelar'); b.style.transitionDelay = `${(i % 4) * 60}ms`; revelar.observe(b); }
  });

  function desenharVitrines() {
    const novos = cat.produtos.filter((p) => p.novo && !esgotada(p)).slice(0, 12);
    const promo = cat.produtos.filter((p) => temPromo(p) && !esgotada(p)).slice(0, 12);
    $('vitrine-novidades').hidden = novos.length < 2;
    $('vitrine-promo').hidden = promo.length < 1;
    $('trilho-novidades').innerHTML = novos.map(cardHtml).join('');
    $('trilho-promo').innerHTML = promo.map(cardHtml).join('');
    ligarCards($('trilho-novidades'));
    ligarCards($('trilho-promo'));
  }

  function desenharCategorias() {
    const cats = [...new Set(cat.produtos.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    $('categorias').innerHTML = cats.length > 1
      ? ['', ...cats].map((c) => `<button type="button" data-cat="${esc(c)}" aria-pressed="${c === categoria}">${c ? esc(c) : 'Tudo'}</button>`).join('') : '';
    $('categorias').querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { categoria = b.dataset.cat; desenharCategorias(); desenharGrade(); }));
    $('topo-nav').innerHTML = cats.length > 1 ? ['', ...cats].map((c) => `<button type="button" data-nav="${esc(c)}" aria-current="${c === categoria}">${c ? esc(c) : 'Tudo'}</button>`).join('') : '';
    $('topo-nav').querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
      categoria = b.dataset.nav; desenharCategorias(); desenharGrade();
      $('colecao').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  function desenharGrade() {
    const q = normalizar($('q').value);
    let lista = cat.produtos.filter((p) => (!categoria || p.categoria === categoria)
      && (!q || normalizar(`${p.nome} ${p.categoria} ${p.marca} ${p.variacoes.map((v) => v.c).join(' ')}`).includes(q)));
    const ordem = $('ordem').value;
    if (ordem !== 'novos') lista = [...lista].sort((a, b) => esgotada(a) - esgotada(b) || ((precoDe(a) ?? 0) - (precoDe(b) ?? 0)) * (ordem === 'menor' ? 1 : -1));
    $('contagem').textContent = `${categoria || 'Todas as peças'} · ${lista.length} peça${lista.length === 1 ? '' : 's'}`;
    $('grade').innerHTML = lista.map(cardHtml).join('');
    ligarCards($('grade'));
    $('estado').hidden = !!lista.length;
    $('estado').textContent = cat.produtos.length ? 'Nenhuma peça encontrada.' : 'Novidades chegando em breve.';
  }

  /* ---------- Trocar a cor da roupa na foto (sem foto de cada cor) ----------
     Acha a peça a partir do centro da foto (cor parecida e encostada), troca o tom
     mantendo dobras e sombras, e suaviza a borda. Tudo no navegador da cliente. */
  const Recolor = (() => {
    const preparadas = new Map();   // url → Promise<{ w, h, dados, lab, alfa, origem }>
    const prontas = new Map();      // url|hex → dataURL
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const gam = (c) => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fi = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
    function rgbParaLab(r, g, b) {
      const R = lin(r), G = lin(g), B = lin(b);
      const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
      const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
      const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
      return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
    }
    function labParaRgb(L, a, b) {
      const y = (L + 16) / 116, x = a / 500 + y, z = y - b / 200;
      const X = fi(x) * 0.95047, Y = fi(y), Z = fi(z) * 1.08883;
      return [gam(X * 3.2406 - Y * 1.5372 - Z * 0.4986), gam(-X * 0.9689 + Y * 1.8758 + Z * 0.0415), gam(X * 0.0557 - Y * 0.2040 + Z * 1.0570)];
    }
    const hexParaLab = (hex) => { const h = String(hex).replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); return rgbParaLab((n >> 16) & 255, (n >> 8) & 255, n & 255); };
    const distancia = (p, q) => Math.sqrt(((p[0] - q[0]) * 0.55) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2);

    function carregar(url) {
      return new Promise((ok, erro) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => ok(img);
        img.onerror = erro;
        img.src = url;
      });
    }

    async function preparar(url) {
      if (preparadas.has(url)) return preparadas.get(url);
      const tarefa = (async () => {
        const img = await carregar(url);
        const escala = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * escala), h = Math.round(img.naturalHeight * escala);
        const tela = document.createElement('canvas'); tela.width = w; tela.height = h;
        const ctx = tela.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const dados = ctx.getImageData(0, 0, w, h);   // falha se a foto não permitir (CORS): aí não troca a cor
        const px = dados.data;
        const lab = new Float32Array(w * h * 3);
        for (let i = 0, j = 0; i < px.length; i += 4, j += 3) { const c = rgbParaLab(px[i], px[i + 1], px[i + 2]); lab[j] = c[0]; lab[j + 1] = c[1]; lab[j + 2] = c[2]; }
        // Cor da peça = mediana do miolo da foto
        const amostra = [];
        for (let y = Math.floor(h * 0.32); y < h * 0.62; y += 3) for (let x = Math.floor(w * 0.38); x < w * 0.62; x += 3) { const j = (y * w + x) * 3; amostra.push([lab[j], lab[j + 1], lab[j + 2]]); }
        const mediana = (k) => amostra.map((c) => c[k]).sort((a, b) => a - b)[Math.floor(amostra.length / 2)];
        const origem = [mediana(0), mediana(1), mediana(2)];
        // Peça = área encostada no miolo com cor parecida (não pinta pele nem fundo)
        const limite = 22;
        const marca = new Uint8Array(w * h);
        const fila = new Int32Array(w * h);
        let ini = 0, fim = 0;
        for (let y = Math.floor(h * 0.38); y < h * 0.58; y += 4) for (let x = Math.floor(w * 0.42); x < w * 0.58; x += 4) {
          const k = y * w + x;
          if (distancia([lab[k * 3], lab[k * 3 + 1], lab[k * 3 + 2]], origem) < limite && !marca[k]) { marca[k] = 1; fila[fim++] = k; }
        }
        while (ini < fim) {
          const k = fila[ini++]; const x = k % w, y = (k / w) | 0;
          const viz = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1];
          for (const n of viz) {
            if (n < 0 || marca[n]) continue;
            if (distancia([lab[n * 3], lab[n * 3 + 1], lab[n * 3 + 2]], origem) < limite) { marca[n] = 1; fila[fim++] = n; }
          }
        }
        if (fim < w * h * 0.03) throw new Error('peça não encontrada');
        // Borda suave (duas passadas de desfoque)
        let alfa = Float32Array.from(marca);
        for (let passo = 0; passo < 2; passo++) {
          const novo = new Float32Array(w * h);
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let s = 0, n = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += alfa[yy * w + xx]; n++; } }
            novo[y * w + x] = s / n;
          }
          alfa = novo;
        }
        return { w, h, dados, lab, alfa, origem };
      })();
      preparadas.set(url, tarefa);
      tarefa.catch(() => preparadas.delete(url));
      return tarefa;
    }

    /** Foto com a peça na cor pedida (dataURL) */
    async function pintar(url, hex) {
      const chave = url + '|' + hex;
      if (prontas.has(chave)) return prontas.get(chave);
      const { w, h, dados, lab, alfa, origem } = await preparar(url);
      const alvo = hexParaLab(hex);
      const saida = new ImageData(new Uint8ClampedArray(dados.data), w, h);
      const px = saida.data;
      // Peça escura → cor clara: realça um pouco as dobras para não "chapar"
      const contraste = alvo[0] > 60 && origem[0] < 45 ? 1.25 : 1;
      for (let k = 0; k < w * h; k++) {
        const m = alfa[k];
        if (m <= 0.01) continue;
        const L = Math.max(0, Math.min(100, alvo[0] + (lab[k * 3] - origem[0]) * contraste));
        const a = alvo[1] + (lab[k * 3 + 1] - origem[1]) * 0.35;
        const b = alvo[2] + (lab[k * 3 + 2] - origem[2]) * 0.35;
        const [r, g, bl] = labParaRgb(L, a, b);
        const i = k * 4;
        px[i] = px[i] * (1 - m) + r * m;
        px[i + 1] = px[i + 1] * (1 - m) + g * m;
        px[i + 2] = px[i + 2] * (1 - m) + bl * m;
      }
      const tela = document.createElement('canvas'); tela.width = w; tela.height = h;
      tela.getContext('2d').putImageData(saida, 0, 0);
      const resultado = tela.toDataURL('image/jpeg', 0.9);
      prontas.set(chave, resultado);
      return resultado;
    }

    /** Qual das cores da peça é a da foto original */
    async function corDaFoto(url, cores) {
      const { origem } = await preparar(url);
      let melhor = null, menor = Infinity;
      cores.forEach(([nome, hex]) => { if (!hex) return; const d = distancia(hexParaLab(hex), origem); if (d < menor) { menor = d; melhor = nome; } });
      return melhor;
    }
    return { pintar, corDaFoto, preparar };
  })();

  /** Mostra a foto da peça na cor escolhida (ou a original) */
  let pedidoFoto = 0;
  async function mostrarCorNaFoto() {
    const p = aberta;
    if (!p || !p.foto) return;
    const img = $('p-foto').querySelector('img');
    const selo = $('p-cor-ilustrativa');
    if (!img) return;
    const url = foto(p.foto, 900);
    const cores = coresDe(p).filter(([, h]) => h);
    const meu = ++pedidoFoto;
    try {
      const original = await Recolor.corDaFoto(url, cores);
      if (meu !== pedidoFoto) return;
      const hex = (cores.find(([c]) => c === escolha.c) || [])[1];
      if (!escolha.c || !hex || escolha.c === original) {
        img.src = foto(p.foto, 1100); selo.hidden = true; return;
      }
      $('p-foto').classList.add('pintando');
      const nova = await Recolor.pintar(url, hex);
      if (meu !== pedidoFoto) return;
      img.src = nova;
      selo.hidden = false;
    } catch (e) {
      selo.hidden = true;   // foto sem permissão ou sem peça clara no centro: fica a original
    } finally {
      if (meu === pedidoFoto) $('p-foto').classList.remove('pintando');
    }
  }

  /* ---------- Peça (escolher cor, tamanho e quantidade) ---------- */
  function abrirPeca(id) {
    aberta = acharPeca(id);
    if (!aberta) return;
    const p = aberta;
    const cores = coresDe(p);
    const tams = tamanhosDe(p);
    escolha = { c: cores.length === 1 ? cores[0][0] : '', t: tams.length === 1 ? tams[0] : '', qtd: 1 };
    // Esgotada: mostra o aviso e o "avise-me" no lugar do botão da sacola
    const fora = esgotada(p);
    $('p-adicionar').hidden = fora;
    $('p-avise').hidden = !fora || !cat.whatsapp;
    if (fora && cat.whatsapp) $('p-avise').href = linkWhats(`Olá! Vi no catálogo a peça *${p.nome}*, que está esgotada. Vai chegar de novo? Pode me avisar? 😊`);
    $('p-foto').classList.toggle('vazia', !p.foto);
    $('p-foto').innerHTML = p.foto ? `<img src="${esc(foto(p.foto, 1100))}" alt="${esc(p.nome)}"><span class="cor-ilustrativa" id="p-cor-ilustrativa" hidden>Cor ilustrativa</span>` : ICONE_CABIDE;
    pedidoFoto++;
    if (p.foto && coresDe(p).filter(([, h]) => h).length > 1) Recolor.preparar(foto(p.foto, 900)).catch(() => {});
    $('p-cat').textContent = [p.categoria, p.marca].filter(Boolean).join(' · ');
    $('p-nome').textContent = p.nome;
    $('p-preco').innerHTML = precoHtml(p);
    $('p-desc').hidden = !p.descricao;
    $('p-desc').textContent = p.descricao || '';
    $('p-cores-bloco').hidden = !cores.length;
    $('p-aviso').textContent = '';
    desenharEscolha();
    mostrarCorNaFoto();
    abrirCamada('camada-peca');
    history.pushState({ camada: 'peca' }, '');
  }
  function maxDisponivel() {
    const p = aberta;
    const v = variacao(p, escolha.c, escolha.t);
    if (!v) return 10;
    const naSacola = sacola.filter((i) => i.id === p.id && i.c === v.c && i.t === v.t).reduce((s, i) => s + i.qtd, 0);
    return Math.max(0, qtdDe(v) - naSacola);
  }
  function desenharEscolha() {
    const p = aberta;
    const cores = coresDe(p);
    const existe = (c, t) => p.variacoes.some((v) => qtdDe(v) > 0 && (!c || v.c === c) && (!t || v.t === t));
    $('p-cor-escolhida').textContent = escolha.c || '';
    $('p-cores').innerHTML = cores.map(([c, h]) => h
      ? `<button type="button" data-cor="${esc(c)}" aria-pressed="${escolha.c === c}" title="${esc(c)}" aria-label="${esc(c)}" ${existe(c, escolha.t) ? '' : 'disabled'}><span style="background:${esc(h)}"></span></button>`
      : `<button type="button" class="texto" data-cor="${esc(c)}" aria-pressed="${escolha.c === c}" ${existe(c, escolha.t) ? '' : 'disabled'}>${esc(c)}</button>`).join('');
    $('p-tamanhos').innerHTML = tamanhosDe(p).map((t) => `<button type="button" data-tam="${esc(t)}" aria-pressed="${escolha.t === t}" ${existe(escolha.c, t) ? '' : 'disabled'}>${esc(t)}</button>`).join('');
    $('p-cores').querySelectorAll('[data-cor]').forEach((b) => b.addEventListener('click', () => {
      escolha.c = b.dataset.cor; if (!existe(escolha.c, escolha.t)) escolha.t = ''; escolha.qtd = 1; $('p-aviso').textContent = ''; desenharEscolha(); mostrarCorNaFoto();
    }));
    $('p-tamanhos').querySelectorAll('[data-tam]').forEach((b) => b.addEventListener('click', () => {
      escolha.t = b.dataset.tam; if (!existe(escolha.c, escolha.t)) escolha.c = ''; escolha.qtd = 1; $('p-aviso').textContent = ''; desenharEscolha();
    }));
    escolha.qtd = Math.max(1, Math.min(escolha.qtd, maxDisponivel() || 1));
    $('p-qtd').textContent = escolha.qtd;
    // Quantas peças tem (da cor/tamanho escolhidos, ou da peça toda)
    const v = variacao(p, escolha.c, escolha.t);
    const precisaEscolher = (coresDe(p).length && !escolha.c) || (tamanhosDe(p).length && !escolha.t);
    const n = v && !precisaEscolher ? qtdDe(v) : estoqueDe(p);
    const el = $('p-estoque');
    el.className = 'estoque-info' + (n <= 0 ? ' fora' : n <= 3 ? ' poucas' : '');
    el.textContent = n <= 0 ? (v && !precisaEscolher ? 'Esgotado nesta cor/tamanho' : 'Peça esgotada no momento')
      : v && !precisaEscolher ? (n === 1 ? 'Última peça neste tamanho' : `${n} disponíveis neste tamanho`)
      : `${n} ${n === 1 ? 'peça' : 'peças'} em estoque`;
  }
  $('p-menos').addEventListener('click', () => { escolha.qtd = Math.max(1, escolha.qtd - 1); $('p-qtd').textContent = escolha.qtd; });
  $('p-mais').addEventListener('click', () => {
    if (escolha.qtd + 1 > maxDisponivel()) { $('p-aviso').textContent = 'Essa é a quantidade disponível.'; return; }
    escolha.qtd++; $('p-qtd').textContent = escolha.qtd;
  });
  $('p-adicionar').addEventListener('click', () => {
    const p = aberta;
    const cores = coresDe(p);
    if (cores.length && !escolha.c) { $('p-aviso').textContent = 'Escolha a cor.'; return; }
    if (tamanhosDe(p).length && !escolha.t) { $('p-aviso').textContent = 'Escolha o tamanho.'; return; }
    if (!variacao(p, escolha.c, escolha.t) || qtdDe(variacao(p, escolha.c, escolha.t)) <= 0) { $('p-aviso').textContent = 'Essa combinação está esgotada.'; return; }
    if (maxDisponivel() < escolha.qtd) { $('p-aviso').textContent = 'Você já colocou na sacola tudo o que temos dessa peça.'; return; }
    const ja = sacola.find((i) => i.id === p.id && i.c === escolha.c && i.t === escolha.t);
    if (ja) ja.qtd += escolha.qtd; else sacola.push({ id: p.id, c: escolha.c, t: escolha.t, qtd: escolha.qtd });
    salvarSacola();
    fecharCamadas(true);
    const cont = $('contador'); cont.classList.remove('pulo'); void cont.offsetWidth; cont.classList.add('pulo');
    aviso('Adicionado à sacola ✓');
  });

  /* ---------- Sacola ---------- */
  function lerSacola() {
    try { sacola = JSON.parse(localStorage.getItem(CHAVE_SACOLA) || '[]'); } catch (e) { sacola = []; }
    // Tira o que saiu do catálogo (esgotou) e ajusta ao disponível
    sacola = sacola.filter((i) => { const p = acharPeca(i.id); const v = p && variacao(p, i.c, i.t); if (v) i.qtd = Math.min(i.qtd, qtdDe(v)); return !!v && i.qtd > 0; });
  }
  function salvarSacola() {
    try { localStorage.setItem(CHAVE_SACOLA, JSON.stringify(sacola)); } catch (e) { /* ignora */ }
    atualizarContadores();
    if (!$('camada-sacola').hidden) desenharSacola();
  }
  const totalSacola = () => sacola.reduce((s, i) => s + (precoDe(acharPeca(i.id)) || 0) * i.qtd, 0);
  const pecasSacola = () => sacola.reduce((s, i) => s + i.qtd, 0);
  function atualizarContadores() {
    const n = pecasSacola();
    $('contador').hidden = !n; $('contador').textContent = n;
    $('barra-sacola').hidden = !n || !$('camada-sacola').hidden || !$('camada-peca').hidden;
    $('barra-qtd').textContent = `${n} peça${n === 1 ? '' : 's'}`;
    $('barra-total').textContent = moeda(totalSacola());
  }
  function desenharSacola() {
    const el = $('s-itens');
    $('s-fim').hidden = !sacola.length;
    if (!sacola.length) {
      el.innerHTML = '<div class="sacola-vazia"><p>Sua sacola está vazia</p>Escolha uma peça e toque em “Adicionar à sacola”.</div>';
      return;
    }
    el.innerHTML = sacola.map((i, idx) => {
      const p = acharPeca(i.id);
      const preco = precoDe(p);
      return `<div class="item">
        <div class="item-foto">${p.foto ? `<img src="${esc(foto(p.foto, 200))}" alt="">` : ICONE_CABIDE}</div>
        <div>
          <div class="item-nome">${esc(p.nome)}</div>
          <div class="item-var">${[i.c, i.t && `Tam. ${i.t}`].filter(Boolean).map(esc).join(' · ')}</div>
          <div class="qtd"><button type="button" data-menos="${idx}" aria-label="Menos">−</button><span>${i.qtd}</span><button type="button" data-mais="${idx}" aria-label="Mais">+</button></div>
        </div>
        <div class="item-dir"><strong>${preco === null ? '—' : moeda(preco * i.qtd)}</strong><button type="button" class="remover" data-remover="${idx}">Remover</button></div>
      </div>`;
    }).join('');
    $('s-total').textContent = sacola.some((i) => precoDe(acharPeca(i.id)) === null) ? `${moeda(totalSacola())} + a consultar` : moeda(totalSacola());
    el.querySelectorAll('[data-menos]').forEach((b) => b.addEventListener('click', () => { const i = sacola[b.dataset.menos]; i.qtd--; if (i.qtd <= 0) sacola.splice(b.dataset.menos, 1); salvarSacola(); }));
    el.querySelectorAll('[data-mais]').forEach((b) => b.addEventListener('click', () => {
      const i = sacola[b.dataset.mais]; const v = variacao(acharPeca(i.id), i.c, i.t);
      if (i.qtd + 1 > qtdDe(v)) return aviso('Essa é a quantidade disponível.');
      i.qtd++; salvarSacola();
    }));
    el.querySelectorAll('[data-remover]').forEach((b) => b.addEventListener('click', () => { sacola.splice(b.dataset.remover, 1); salvarSacola(); }));
  }
  function abrirSacola() {
    desenharSacola();
    abrirCamada('camada-sacola');
    history.pushState({ camada: 'sacola' }, '');
  }

  /* ---------- Finalizar pelo WhatsApp ---------- */
  document.querySelectorAll('input[name=entrega]').forEach((r) => r.addEventListener('change', () => {
    $('f-endereco-bloco').hidden = document.querySelector('input[name=entrega]:checked').value !== 'entregar';
  }));
  $('form-pedido').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!sacola.length) return;
    if (!cat.whatsapp) return aviso('A loja ainda não informou o WhatsApp.');
    const nome = $('f-nome').value.trim();
    const entrega = cat.entrega === false ? 'retirar' : document.querySelector('input[name=entrega]:checked').value;
    const endereco = $('f-endereco').value.trim();
    if (entrega === 'entregar' && !endereco) { $('f-endereco').focus(); return aviso('Informe o endereço com CEP.'); }
    try { localStorage.setItem(CHAVE_CLIENTE, JSON.stringify({ nome, endereco })); } catch (e) { /* ignora */ }
    const linhas = sacola.map((i, n) => {
      const p = acharPeca(i.id); const preco = precoDe(p);
      const det = [i.c, i.t && `Tam. ${i.t}`].filter(Boolean).join(' · ');
      return `${n + 1}. *${p.nome}*${det ? ` (${det})` : ''}\n    ${i.qtd} × ${preco === null ? 'a consultar' : moeda(preco)}${preco === null ? '' : ` = ${moeda(preco * i.qtd)}`}`;
    });
    const texto = [
      `Olá! Quero fazer um pedido pelo catálogo 🛍️`,
      '',
      ...linhas,
      '',
      `*Total: ${moeda(totalSacola())}*${sacola.some((i) => precoDe(acharPeca(i.id)) === null) ? ' + itens a consultar' : ''}`,
      nome ? `Nome: ${nome}` : '',
      entrega === 'entregar' ? `Enviar para: ${endereco}` : 'Vou retirar na loja',
      $('f-obs').value.trim() ? `Obs.: ${$('f-obs').value.trim()}` : '',
      '',
      'Pode confirmar a disponibilidade? 😊'
    ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');
    window.open(linkWhats(texto), '_blank', 'noopener');
  });

  /* ---------- Camadas (abrir/fechar, botão voltar do celular) ---------- */
  function abrirCamada(id) {
    $(id).hidden = false;
    document.body.classList.add('travado');
    atualizarContadores();
  }
  function fecharCamadas(voltar = true) {
    const abertas = ['camada-peca', 'camada-sacola'].filter((id) => !$(id).hidden);
    if (!abertas.length) return;
    abertas.forEach((id) => { $(id).hidden = true; });
    document.body.classList.remove('travado');
    atualizarContadores();
    if (voltar && history.state && history.state.camada) history.back();
  }
  document.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', () => fecharCamadas()));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharCamadas(); });
  window.addEventListener('popstate', () => fecharCamadas(false));
  $('btn-sacola').addEventListener('click', abrirSacola);
  $('barra-sacola').addEventListener('click', abrirSacola);
  $('btn-busca').addEventListener('click', () => { const b = $('topo-busca'); b.hidden = !b.hidden; if (!b.hidden) $('q').focus(); });
  $('q').addEventListener('input', () => { desenharGrade(); if ($('q').value) $('colecao').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('ordem').addEventListener('change', desenharGrade);
  $('link-inicio').addEventListener('click', (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  window.addEventListener('scroll', () => $('topo').classList.toggle('rolou', window.scrollY > 10), { passive: true });

  /* ---------- Início ---------- */
  carregar().then((dados) => {
    if (!dados || !dados.publicado) { $('estado').textContent = 'Este catálogo não está disponível no momento.'; return; }
    cat = { ...dados, produtos: dados.produtos || [] };
    if (cat.entrega === false) $('f-entrega-bloco').hidden = true;
    try { const c = JSON.parse(localStorage.getItem(CHAVE_CLIENTE) || '{}'); $('f-nome').value = c.nome || ''; $('f-endereco').value = c.endereco || ''; } catch (e) { /* ignora */ }
    desenharMarca();
    desenharVitrines();
    desenharCategorias();
    desenharGrade();
    lerSacola();
    atualizarContadores();
  }).catch((e) => {
    console.error(e);
    $('estado').textContent = 'Não foi possível abrir o catálogo. Confira a internet e tente de novo.';
  });
})();
