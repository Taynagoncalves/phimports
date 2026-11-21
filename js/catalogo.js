/* ==========================================================================
   catalogo.js — Catálogo público da loja (sem login).
   Lê UM documento (catalogos/{lojaId}) com a cópia pública dos produtos.
   O cliente escolhe cor e tamanho e pede pelo WhatsApp da loja.
   ========================================================================== */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Fotos do Cloudinary em tamanho de vitrine (mais leve no celular)
  const miniatura = (url, largura) => (url && url.includes('/image/upload/') ? url.replace(/\/image\/upload\/(f_auto,q_auto\/)?/, `/image/upload/f_auto,q_auto,c_limit,w_${largura}/`) : url);

  let catalogo = null;
  let categoria = '';
  let produtoAberto = null;
  let escolha = { c: '', t: '' };

  /* ---------- Carregar ---------- */
  async function carregar() {
    const id = new URLSearchParams(location.search).get('l');
    const cfg = window.FIREBASE_CONFIG;
    if (cfg && cfg.apiKey && id && window.firebase) {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      const doc = await firebase.firestore().collection('catalogos').doc(id).get();
      return doc.exists ? doc.data() : null;
    }
    // Sem Firebase (teste no computador): usa a cópia local
    try { return JSON.parse(localStorage.getItem('gestaoloja:catalogo') || 'null'); } catch (e) { return null; }
  }

  function linkWhats(texto) {
    return `https://wa.me/${catalogo.whatsapp}?text=${encodeURIComponent(texto)}`;
  }

  /* ---------- Cabeçalho ---------- */
  function desenharTopo() {
    document.title = `Catálogo — ${catalogo.nome}`;
    $('cat-nome').textContent = `Catálogo ${catalogo.nome}`;
    if (catalogo.logo) $('cat-logo').src = catalogo.logo;
    $('cat-logo').alt = catalogo.nome;
    if (catalogo.mensagem) { $('cat-mensagem').textContent = catalogo.mensagem; $('cat-mensagem').hidden = false; }
    const botoes = [];
    if (catalogo.whatsapp) botoes.push(`<a class="cat-contato whats" href="${linkWhats(`Olá! Vim pelo catálogo da ${catalogo.nome}.`)}" target="_blank" rel="noopener">${ICONE_WHATS}WhatsApp</a>`);
    if (catalogo.instagram) botoes.push(`<a class="cat-contato" href="https://instagram.com/${encodeURIComponent(catalogo.instagram)}" target="_blank" rel="noopener">${ICONE_INSTA}@${esc(catalogo.instagram)}</a>`);
    $('cat-contatos').innerHTML = botoes.join('');
    $('cat-rodape').textContent = `${catalogo.nome} · peças disponíveis atualizadas em ${new Date(catalogo.atualizadoEm).toLocaleDateString('pt-BR')}`;
  }

  /* ---------- Categorias + grade ---------- */
  function desenharCategorias() {
    const cats = [...new Set(catalogo.produtos.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    $('cat-categorias').innerHTML = cats.length > 1
      ? ['', ...cats].map((c) => `<button type="button" class="cat-chip" data-cat="${esc(c)}" aria-pressed="${c === categoria}">${c ? esc(c) : 'Tudo'}</button>`).join('')
      : '';
    $('cat-categorias').querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { categoria = b.dataset.cat; desenharCategorias(); desenharGrade(); }));
  }

  function precoHtml(p) {
    if (p.preco === null || p.preco === undefined) return '<span class="cat-consulte">Consulte o preço</span>';
    return p.promo && p.promo < p.preco
      ? `<s>${moeda(p.preco)}</s><strong class="cat-promo">${moeda(p.promo)}</strong>`
      : `<strong>${moeda(p.preco)}</strong>`;
  }
  const tamanhosDe = (p) => [...new Set(p.variacoes.map((v) => v.t).filter(Boolean))];

  function desenharGrade() {
    const q = normalizar($('cat-q').value);
    const lista = catalogo.produtos.filter((p) => (!categoria || p.categoria === categoria)
      && (!q || normalizar(`${p.nome} ${p.categoria} ${p.marca} ${p.variacoes.map((v) => v.c).join(' ')}`).includes(q)));
    $('cat-contagem').textContent = `${lista.length} peça${lista.length === 1 ? '' : 's'}`;
    $('cat-estado').hidden = !!lista.length;
    $('cat-estado').textContent = 'Nenhuma peça encontrada.';
    $('cat-grade').innerHTML = lista.map((p) => `
      <button type="button" class="cat-card" data-id="${esc(p.id)}">
        <div class="cat-foto">${p.foto ? `<img src="${esc(miniatura(p.foto, 500))}" alt="" loading="lazy">` : ICONE_CABIDE}
          ${p.promo && p.preco && p.promo < p.preco ? `<span class="cat-selo promo">-${Math.round((1 - p.promo / p.preco) * 100)}%</span>` : p.novo ? '<span class="cat-selo">Novo</span>' : ''}
        </div>
        <div class="cat-card-info">
          <div class="cat-card-nome">${esc(p.nome)}</div>
          <div class="cat-preco">${precoHtml(p)}</div>
          <div class="cat-tams">${tamanhosDe(p).map(esc).join(' · ')}</div>
        </div>
      </button>`).join('');
    $('cat-grade').querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => abrir(b.dataset.id)));
  }

  /* ---------- Detalhe + pedido pelo WhatsApp ---------- */
  function abrir(id) {
    produtoAberto = catalogo.produtos.find((p) => p.id === id);
    if (!produtoAberto) return;
    const p = produtoAberto;
    const cores = [...new Set(p.variacoes.map((v) => v.c).filter(Boolean))];
    escolha = { c: cores.length === 1 ? cores[0] : '', t: '' };
    $('det-foto').classList.toggle('vazia', !p.foto);
    $('det-foto').innerHTML = p.foto ? `<img src="${esc(miniatura(p.foto, 900))}" alt="${esc(p.nome)}">` : ICONE_CABIDE;
    $('det-cat').textContent = [p.categoria, p.marca].filter(Boolean).join(' · ');
    $('det-nome').textContent = p.nome;
    $('det-preco').innerHTML = precoHtml(p);
    $('det-cores-bloco').hidden = !cores.length;
    desenharEscolhas();
    $('cat-modal').hidden = false;
    document.body.classList.add('travado');
    history.pushState({ peca: id }, '');
  }
  function desenharEscolhas() {
    const p = produtoAberto;
    const cores = [...new Set(p.variacoes.map((v) => v.c).filter(Boolean))];
    // Tamanhos que existem na cor escolhida (ou em qualquer cor)
    const tams = tamanhosDe(p);
    const temCombinacao = (c, t) => p.variacoes.some((v) => (!c || v.c === c) && (!t || v.t === t));
    $('det-cores').innerHTML = cores.map((c) => `<button type="button" class="cat-opcao" data-cor="${esc(c)}" aria-pressed="${escolha.c === c}" ${temCombinacao(c, escolha.t) ? '' : 'disabled'}>${esc(c)}</button>`).join('');
    $('det-tamanhos').innerHTML = tams.map((t) => `<button type="button" class="cat-opcao" data-tam="${esc(t)}" aria-pressed="${escolha.t === t}" ${temCombinacao(escolha.c, t) ? '' : 'disabled'}>${esc(t)}</button>`).join('');
    $('det-cores').querySelectorAll('[data-cor]').forEach((b) => b.addEventListener('click', () => { escolha.c = escolha.c === b.dataset.cor ? '' : b.dataset.cor; if (!temCombinacao(escolha.c, escolha.t)) escolha.t = ''; desenharEscolhas(); }));
    $('det-tamanhos').querySelectorAll('[data-tam]').forEach((b) => b.addEventListener('click', () => { escolha.t = escolha.t === b.dataset.tam ? '' : b.dataset.tam; if (!temCombinacao(escolha.c, escolha.t)) escolha.c = ''; desenharEscolhas(); }));

    const btn = $('det-whats');
    btn.hidden = !catalogo.whatsapp;
    const valor = p.preco === null || p.preco === undefined ? '' : ` — ${moeda(p.promo && p.promo < p.preco ? p.promo : p.preco)}`;
    const detalhes = [escolha.c && `cor ${escolha.c}`, escolha.t && `tamanho ${escolha.t}`].filter(Boolean).join(', ');
    $('det-whats-texto').textContent = detalhes ? 'Pedir pelo WhatsApp' : 'Perguntar pelo WhatsApp';
    btn.href = catalogo.whatsapp ? linkWhats(`Olá! Vi no catálogo e tenho interesse em:\n*${p.nome}*${detalhes ? ` (${detalhes})` : ''}${valor}\nAinda tem?`) : '#';
  }
  function fechar(voltar = true) {
    if ($('cat-modal').hidden) return;
    $('cat-modal').hidden = true;
    document.body.classList.remove('travado');
    if (voltar && history.state && history.state.peca) history.back();
  }
  document.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', () => fechar()));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
  window.addEventListener('popstate', () => fechar(false));   // botão "voltar" do celular fecha a peça
  $('cat-q').addEventListener('input', desenharGrade);

  /* ---------- Ícones (SVG próprio, sem bibliotecas) ---------- */
  const ICONE_WHATS = '<svg viewBox="0 0 24 24" aria-hidden="true" class="cheio"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.3Z"/></svg>';
  const ICONE_INSTA = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" class="cheio"/></svg>';
  const ICONE_CABIDE = '<svg viewBox="0 0 24 24" aria-hidden="true" class="cat-sem-foto"><path d="M12 7a2 2 0 1 1 2-2c0 1.1-2 1.5-2 3v1M12 9 3 15.5a1.4 1.4 0 0 0 .8 2.5h16.4a1.4 1.4 0 0 0 .8-2.5L12 9Z"/></svg>';

  carregar().then((dados) => {
    if (!dados || !dados.publicado) {
      $('cat-estado').textContent = 'Este catálogo não está disponível no momento.';
      return;
    }
    catalogo = { ...dados, produtos: dados.produtos || [] };
    desenharTopo();
    desenharCategorias();
    desenharGrade();
    if (!catalogo.produtos.length) { $('cat-estado').hidden = false; $('cat-estado').textContent = 'Novidades chegando em breve!'; }
  }).catch((e) => {
    console.error(e);
    $('cat-estado').textContent = 'Não foi possível abrir o catálogo. Confira a internet e tente de novo.';
  });
})();
