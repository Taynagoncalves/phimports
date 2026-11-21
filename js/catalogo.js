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
  const ICONE_WHATS = '<svg viewBox="0 0 24 24" class="cheio"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.3Z"/></svg>';
  const ICONE_INSTA = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" class="cheio"/></svg>';

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
    $('anuncio').textContent = cat.mensagem || (cat.entrega === false ? 'Pedidos pelo WhatsApp' : 'Enviamos para todo o Brasil');
    $('anuncio').hidden = false;
    if (cat.entrega === false) $('beneficio-entrega').innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 10 12 4l8 6v10H4z"/><path d="M10 20v-6h4v6"/></svg><strong>Retire na loja</strong><span>Separamos para você</span>';
    if (cat.whatsapp) { $('whats-flutuante').href = linkWhats(`Olá! Vim pelo catálogo da ${cat.nome} e tenho uma dúvida.`); }
    const links = [];
    if (cat.whatsapp) links.push(`<a href="${linkWhats(`Olá! Vim pelo catálogo da ${cat.nome}.`)}" target="_blank" rel="noopener">${ICONE_WHATS}WhatsApp</a>`);
    if (cat.instagram) links.push(`<a href="https://instagram.com/${encodeURIComponent(cat.instagram)}" target="_blank" rel="noopener">${ICONE_INSTA}@${esc(cat.instagram)}</a>`);
    $('rodape').innerHTML = `
      <div class="rodape-dentro">
        <div class="rodape-marca">
          <img src="${esc(cat.logo || '../img/logo-phimports.png')}" alt="${esc(cat.nome)}">
          <p class="rodape-frase">Sua presença fala, <em>seu estilo confirma</em>.</p>
        </div>
        <div class="rodape-col">
          <h3>Como comprar</h3>
          <p>1. Escolha as peças e o tamanho</p>
          <p>2. Finalize a sacola pelo WhatsApp</p>
          <p>3. A loja confirma e combina pagamento e ${cat.entrega === false ? 'retirada' : 'envio'}</p>
          ${cat.entrega === false ? '' : '<p class="rodape-destaque">Enviamos para todo o Brasil</p>'}
        </div>
        <div class="rodape-col">
          <h3>Fale com a gente</h3>
          ${cat.endereco ? `<p>${esc(cat.endereco)}</p>` : ''}
          <div class="rodape-links">${links.join('')}</div>
        </div>
      </div>
      <small>© ${new Date().getFullYear()} ${esc(cat.nome)} · peças atualizadas em ${new Date(cat.atualizadoEm).toLocaleDateString('pt-BR')}</small>`;
  }

  /* ---------- Cards ---------- */
  function precoHtml(p) {
    if (precoDe(p) === null) return '<span class="consulte">Consulte o preço</span>';
    return temPromo(p) ? `<s>${moeda(p.preco)}</s><strong class="em-promo">${moeda(p.promo)}</strong>` : `<strong>${moeda(p.preco)}</strong>`;
  }
  function cardHtml(p) {
    const cores = coresDe(p).filter(([, h]) => h).slice(0, 5);
    return `
      <button type="button" class="card" data-peca="${esc(p.id)}" aria-label="${esc(p.nome)}">
        <div class="card-foto">
          ${p.foto ? `<img src="${esc(foto(p.foto, 600))}" alt="" loading="lazy">` : ICONE_CABIDE}
          ${temPromo(p) ? `<span class="selo promo">−${Math.round((1 - p.promo / p.preco) * 100)}%</span>` : p.novo ? '<span class="selo">Novo</span>' : p.variacoes.reduce((s, v) => s + (v.q || 0), 0) <= 2 ? '<span class="selo">Últimas peças</span>' : ''}
          <span class="card-mais" aria-hidden="true">${ICONE_MAIS}</span>
        </div>
        <div class="card-nome">${esc(p.nome)}</div>
        ${cores.length > 1 ? `<div class="card-cores">${cores.map(([, h]) => `<span style="background:${esc(h)}"></span>`).join('')}</div>` : ''}
        <div class="preco">${precoHtml(p)}</div>
      </button>`;
  }
  const ligarCards = (raiz) => raiz.querySelectorAll('[data-peca]').forEach((b) => b.addEventListener('click', () => abrirPeca(b.dataset.peca)));

  function desenharVitrines() {
    const novos = cat.produtos.filter((p) => p.novo).slice(0, 12);
    const promo = cat.produtos.filter(temPromo).slice(0, 12);
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
    if (ordem !== 'novos') lista = [...lista].sort((a, b) => ((precoDe(a) ?? 0) - (precoDe(b) ?? 0)) * (ordem === 'menor' ? 1 : -1));
    $('contagem').textContent = `${categoria || 'Todas as peças'} · ${lista.length} peça${lista.length === 1 ? '' : 's'}`;
    $('grade').innerHTML = lista.map(cardHtml).join('');
    ligarCards($('grade'));
    $('estado').hidden = !!lista.length;
    $('estado').textContent = cat.produtos.length ? 'Nenhuma peça encontrada.' : 'Novidades chegando em breve.';
  }

  /* ---------- Peça (escolher cor, tamanho e quantidade) ---------- */
  function abrirPeca(id) {
    aberta = acharPeca(id);
    if (!aberta) return;
    const p = aberta;
    const cores = coresDe(p);
    const tams = tamanhosDe(p);
    escolha = { c: cores.length === 1 ? cores[0][0] : '', t: tams.length === 1 ? tams[0] : '', qtd: 1 };
    $('p-foto').classList.toggle('vazia', !p.foto);
    $('p-foto').innerHTML = p.foto ? `<img src="${esc(foto(p.foto, 1100))}" alt="${esc(p.nome)}">` : ICONE_CABIDE;
    $('p-cat').textContent = [p.categoria, p.marca].filter(Boolean).join(' · ');
    $('p-nome').textContent = p.nome;
    $('p-preco').innerHTML = precoHtml(p);
    $('p-desc').hidden = !p.descricao;
    $('p-desc').textContent = p.descricao || '';
    $('p-cores-bloco').hidden = !cores.length;
    $('p-aviso').textContent = '';
    desenharEscolha();
    abrirCamada('camada-peca');
    history.pushState({ camada: 'peca' }, '');
  }
  function maxDisponivel() {
    const p = aberta;
    const v = variacao(p, escolha.c, escolha.t);
    if (!v) return 10;
    const naSacola = sacola.filter((i) => i.id === p.id && i.c === v.c && i.t === v.t).reduce((s, i) => s + i.qtd, 0);
    return Math.max(0, (v.q || 10) - naSacola);
  }
  function desenharEscolha() {
    const p = aberta;
    const cores = coresDe(p);
    const existe = (c, t) => p.variacoes.some((v) => (!c || v.c === c) && (!t || v.t === t));
    $('p-cor-escolhida').textContent = escolha.c || '';
    $('p-cores').innerHTML = cores.map(([c, h]) => h
      ? `<button type="button" data-cor="${esc(c)}" aria-pressed="${escolha.c === c}" title="${esc(c)}" aria-label="${esc(c)}" ${existe(c, escolha.t) ? '' : 'disabled'}><span style="background:${esc(h)}"></span></button>`
      : `<button type="button" class="texto" data-cor="${esc(c)}" aria-pressed="${escolha.c === c}" ${existe(c, escolha.t) ? '' : 'disabled'}>${esc(c)}</button>`).join('');
    $('p-tamanhos').innerHTML = tamanhosDe(p).map((t) => `<button type="button" data-tam="${esc(t)}" aria-pressed="${escolha.t === t}" ${existe(escolha.c, t) ? '' : 'disabled'}>${esc(t)}</button>`).join('');
    $('p-cores').querySelectorAll('[data-cor]').forEach((b) => b.addEventListener('click', () => {
      escolha.c = b.dataset.cor; if (!existe(escolha.c, escolha.t)) escolha.t = ''; escolha.qtd = 1; $('p-aviso').textContent = ''; desenharEscolha();
    }));
    $('p-tamanhos').querySelectorAll('[data-tam]').forEach((b) => b.addEventListener('click', () => {
      escolha.t = b.dataset.tam; if (!existe(escolha.c, escolha.t)) escolha.c = ''; escolha.qtd = 1; $('p-aviso').textContent = ''; desenharEscolha();
    }));
    escolha.qtd = Math.max(1, Math.min(escolha.qtd, maxDisponivel() || 1));
    $('p-qtd').textContent = escolha.qtd;
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
    if (!variacao(p, escolha.c, escolha.t)) { $('p-aviso').textContent = 'Essa combinação não está disponível.'; return; }
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
    sacola = sacola.filter((i) => { const p = acharPeca(i.id); const v = p && variacao(p, i.c, i.t); if (v) i.qtd = Math.min(i.qtd, v.q || 10); return !!v && i.qtd > 0; });
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
    $('whats-flutuante').hidden = !cat || !cat.whatsapp || !!n || !$('camada-sacola').hidden || !$('camada-peca').hidden;
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
      if (i.qtd + 1 > (v.q || 10)) return aviso('Essa é a quantidade disponível.');
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
