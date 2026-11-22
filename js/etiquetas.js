/* ==========================================================================
   etiquetas.js — Impressão de etiquetas com código de barras
   - Fila de impressão por produto/variação (quantidade = estoque ou 1 de cada)
   - Modelos: térmica 40×25 mm (rolo) e folha A4 Pimaco A4256 (3×11)
   - Código EAN-13 (ou Code 128 quando o código não é EAN válido)
   - Recebe fila pronta da Entrada de mercadoria (sessionStorage) ou ?produto=id
   ========================================================================== */
App.aoIniciar(async () => {
  const LIMITE = 600;                  // etiquetas por impressão
  const POR_FOLHA = 33;                // Pimaco A4256: 3 × 11
  const CHAVE_FILA = 'gestaoloja:fila-etiquetas';
  const $ = (id) => document.getElementById(id);

  const [produtos, loja] = await Promise.all([Data.listarProdutos(), Data.obterLoja()]);
  const produtoPorId = Object.fromEntries(produtos.map((p) => [p.id, p]));
  let fila = [];          // [{produtoId, sku, qtd}]
  let modoQtd = 'estoque';


  /* ---------- Código de barras ---------- */
  function ean13Valido(c) {
    if (!/^\d{13}$/.test(c)) return false;
    const soma = c.slice(0, 12).split('').reduce((s, n, i) => s + Number(n) * (i % 2 ? 3 : 1), 0);
    return (10 - (soma % 10)) % 10 === Number(c[12]);
  }
  /** SVG do código de barras (string) */
  function svgCodigo(codigo, mostrarNumero) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      JsBarcode(svg, codigo, {
        format: ean13Valido(codigo) ? 'EAN13' : 'CODE128',
        displayValue: mostrarNumero,
        fontSize: 14, textMargin: 0, margin: 0, height: 40, width: 1.6, flat: true
      });
    } catch (e) {
      return `<div class="etq-var">Código inválido: ${App.escapeHtml(codigo)}</div>`;
    }
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return svg.outerHTML;
  }

  /* ---------- Fila ---------- */
  function adicionarProduto(produtoId, modo = modoQtd) {
    const p = produtoPorId[produtoId];
    if (!p) return;
    p.variacoes.forEach((v) => {
      const qtd = modo === 'um' ? 1 : Math.max(0, v.estoque);
      const existente = fila.find((f) => f.sku === v.sku);
      if (existente) existente.qtd = qtd;
      else fila.push({ produtoId: p.id, sku: v.sku, qtd });
    });
  }

  function itensDaFila() {
    return fila.map((f) => {
      const p = produtoPorId[f.produtoId];
      const v = p && p.variacoes.find((x) => x.sku === f.sku);
      return p && v ? { ...f, produto: p, variacao: v } : null;
    }).filter(Boolean);
  }

  /* ---------- Passo 1: lista de produtos (busca, categoria, leitor) ---------- */
  let categoria = '';
  const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const qtdNaFila = (produtoId) => fila.filter((f) => f.produtoId === produtoId).reduce((s, f) => s + f.qtd, 0);

  function desenharProdutos() {
    const termo = normalizar($('etq-termo').value.trim());
    const lista = produtos.filter((p) => (!categoria || p.categoria === categoria)
      && (!termo || normalizar(`${p.nome} ${p.marca} ${p.variacoes.map((v) => v.sku + ' ' + v.codigoBarras).join(' ')}`).includes(termo)));
    const el = $('etq-produtos');
    if (!lista.length) {
      el.innerHTML = `<li>${App.estadoVazio({ icone: 'search-x', titulo: 'Nenhum produto encontrado', texto: 'Tente outro nome, SKU ou código.' })}</li>`;
      App.icones();
      return;
    }
    el.innerHTML = lista.map((p) => {
      const naFila = qtdNaFila(p.id);
      const temNaFila = fila.some((f) => f.produtoId === p.id);
      return `
      <li class="etq-produto ${temNaFila ? 'na-fila' : ''}">
        ${App.thumb(p)}
        <div class="etq-produto-info">
          <strong>${App.escapeHtml(p.nome)}</strong>
          <span>${App.escapeHtml(p.marca)} · ${App.formatarMoeda(p.preco)} · ${p.estoqueTotal} em estoque</span>
        </div>
        ${temNaFila ? `<span class="badge badge-info">${naFila} na fila</span>` : ''}
        <button type="button" class="btn ${temNaFila ? 'btn-fantasma' : 'btn-secundario'}" data-add="${p.id}">
          <i data-lucide="${temNaFila ? 'refresh-cw' : 'plus'}"></i>${temNaFila ? 'Refazer' : 'Adicionar'}
        </button>
      </li>`;
    }).join('');
    App.icones();
  }

  async function desenharCategorias() {
    const cats = await Data.listarCategorias();
    const el = $('etq-categorias');
    el.innerHTML = ['', ...cats].map((c) => `<button type="button" class="chip" data-cat="${App.escapeHtml(c)}" aria-pressed="${c === categoria}">${c || 'Todas'}</button>`).join('');
    el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
      categoria = b.dataset.cat;
      el.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      desenharProdutos();
    }));
  }

  /** Código lido no leitor: +1 etiqueta daquela variação */
  function adicionarPorCodigo(codigo) {
    for (const p of produtos) {
      const v = p.variacoes.find((x) => x.codigoBarras === codigo || x.sku.toLowerCase() === codigo.toLowerCase());
      if (!v) continue;
      const f = fila.find((x) => x.sku === v.sku);
      if (f) f.qtd = Math.min(999, f.qtd + 1);
      else fila.push({ produtoId: p.id, sku: v.sku, qtd: 1 });
      App.toast(`+1 etiqueta: ${p.nome} (${v.tamanho}/${v.cor})`);
      return true;
    }
    return false;
  }

  /* ---------- Passo 2: fila em grade tamanho × cor ---------- */
  function desenharFila() {
    const itens = itensDaFila();
    const total = itens.reduce((s, i) => s + i.qtd, 0);
    $('resumo-fila').textContent = `${total} etiqueta${total === 1 ? '' : 's'}`;
    $('qtd-botao').textContent = total ? `${total} etiqueta${total === 1 ? '' : 's'}` : '';
    $('btn-imprimir').disabled = !total;
    desenharProdutos();

    if (!itens.length) {
      $('fila').innerHTML = App.estadoVazio({ icone: 'tags', titulo: 'Nenhuma etiqueta na fila', texto: 'Adicione produtos no passo 1 ou leia o código de barras de uma peça.' });
      desenharPrevia();
      App.icones();
      return;
    }

    // Agrupa por produto, na ordem em que entraram
    const grupos = new Map();
    itens.forEach((i) => { if (!grupos.has(i.produtoId)) grupos.set(i.produtoId, []); grupos.get(i.produtoId).push(i); });
    $('fila').innerHTML = [...grupos.values()].map((lista) => {
      const p = lista[0].produto;
      const tamanhos = [...new Set(p.variacoes.map((v) => v.tamanho))];
      const cores = [...new Set(p.variacoes.map((v) => v.cor))];
      const totalProduto = lista.reduce((s, i) => s + i.qtd, 0);
      const celula = (t, c) => {
        const v = p.variacoes.find((x) => x.tamanho === t && x.cor === c);
        if (!v) return '<td class="grade-celula inexistente">·</td>';
        const f = fila.find((x) => x.sku === v.sku);
        const id = `q-${v.sku}`;
        return `<td class="etq-celula">
          <label class="sr-only" for="${App.escapeHtml(id)}">Etiquetas de ${App.escapeHtml(t)} ${App.escapeHtml(c)}</label>
          <input class="input" type="number" min="0" max="999" inputmode="numeric" id="${App.escapeHtml(id)}" data-sku="${App.escapeHtml(v.sku)}" data-produto="${p.id}" value="${f ? f.qtd : 0}">
          <span class="etq-estoque">est. ${v.estoque}</span>
        </td>`;
      };
      return `
      <article class="etq-grupo">
        <header class="etq-grupo-cabecalho">
          ${App.thumb(p)}
          <div class="etq-produto-info">
            <strong>${App.escapeHtml(p.nome)}</strong>
            <span>${App.formatarMoeda(p.preco)} · <span data-total-produto="${p.id}">${totalProduto}</span> etiqueta(s)</span>
          </div>
          <div class="flex gap-2" style="flex-wrap:wrap">
            <button type="button" class="btn btn-fantasma" data-todos="${p.id}" data-modo="estoque" title="Uma etiqueta para cada peça em estoque">= estoque</button>
            <button type="button" class="btn btn-fantasma" data-todos="${p.id}" data-modo="um" title="Uma etiqueta de cada tamanho/cor">1 de cada</button>
            <button type="button" class="btn-icone perigo" data-remover="${p.id}" aria-label="Tirar ${App.escapeHtml(p.nome)} da fila" title="Tirar da fila"><i data-lucide="trash-2"></i></button>
          </div>
        </header>
        <div class="tabela-wrap">
          <table class="grade-estoque etq-grade">
            <thead><tr><th scope="col">Cor \\ Tamanho</th>${tamanhos.map((t) => `<th scope="col">${App.escapeHtml(t)}</th>`).join('')}</tr></thead>
            <tbody>${cores.map((c) => `<tr><th scope="row"><span class="flex items-center gap-2">${App.bolinhaCor(c)}${App.escapeHtml(c)}</span></th>${tamanhos.map((t) => celula(t, c)).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </article>`;
    }).join('');

    $('fila').querySelectorAll('[data-sku]').forEach((inp) => {
      inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('input', () => {
        const qtd = Math.max(0, Math.min(999, parseInt(inp.value, 10) || 0));
        let f = fila.find((x) => x.sku === inp.dataset.sku);
        if (!f) { f = { produtoId: inp.dataset.produto, sku: inp.dataset.sku, qtd: 0 }; fila.push(f); }
        f.qtd = qtd;
        inp.closest('td').classList.toggle('zerada', qtd === 0);
        const tot = $('fila').querySelector(`[data-total-produto="${inp.dataset.produto}"]`);
        if (tot) tot.textContent = qtdNaFila(inp.dataset.produto);
        atualizarResumo();
      });
      inp.closest('td').classList.toggle('zerada', !(parseInt(inp.value, 10) > 0));
    });
    $('fila').querySelectorAll('[data-todos]').forEach((b) => b.addEventListener('click', () => { adicionarProduto(b.dataset.todos, b.dataset.modo); desenharFila(); }));
    $('fila').querySelectorAll('[data-remover]').forEach((b) => b.addEventListener('click', () => {
      fila = fila.filter((f) => f.produtoId !== b.dataset.remover);
      desenharFila();
    }));
    desenharPrevia();
    App.icones();
  }

  // Atualiza só os totais e a prévia (sem redesenhar os campos enquanto digita)
  const atualizarResumo = App.debounce(() => {
    const total = itensDaFila().reduce((s, i) => s + i.qtd, 0);
    $('resumo-fila').textContent = `${total} etiqueta${total === 1 ? '' : 's'}`;
    $('qtd-botao').textContent = total ? `${total} etiqueta${total === 1 ? '' : 's'}` : '';
    desenharProdutos();
    $('btn-imprimir').disabled = !total;
    desenharPrevia();
  }, 200);

  /* ---------- Montagem das etiquetas ---------- */
  function opcoes() {
    return {
      modelo: document.querySelector('[name=modelo]:checked').value,
      loja: $('mostrar-loja').checked,
      preco: $('mostrar-preco').checked,
      numero: $('mostrar-numero').checked,
      inicio: Math.max(1, Math.min(POR_FOLHA, parseInt($('posicao-inicial').value, 10) || 1))
    };
  }

  function htmlEtiqueta(item, op) {
    const v = item.variacao, p = item.produto;
    return `<div class="etq etq-${op.modelo}">
      ${op.loja ? `<div class="etq-loja">${App.escapeHtml(loja.nome)}</div>` : ''}
      <div class="etq-nome">${App.escapeHtml(p.nome)}</div>
      <div class="etq-var">Tam. <strong>${App.escapeHtml(v.tamanho)}</strong> · ${App.escapeHtml(v.cor)}</div>
      ${svgCodigo(v.codigoBarras || v.sku, op.numero)}
      ${op.preco ? `<div class="etq-preco">${App.formatarMoeda(p.preco)}</div>` : ''}
    </div>`;
  }

  /** Lista de etiquetas (uma por peça), respeitando o limite */
  function listaEtiquetas() {
    const lista = [];
    itensDaFila().forEach((i) => { for (let k = 0; k < i.qtd && lista.length < LIMITE; k++) lista.push(i); });
    return lista;
  }

  /** Folhas A4 (array de HTML), pulando as posições já usadas da primeira folha */
  function folhasA4(lista, op) {
    const celulas = [...Array(op.inicio - 1).fill(null), ...lista];
    const folhas = [];
    for (let i = 0; i < celulas.length; i += POR_FOLHA) {
      const f = celulas.slice(i, i + POR_FOLHA);
      folhas.push(`<div class="folha-a4">${f.map((it) => (it ? htmlEtiqueta(it, op) : '<div class="etq etq-pimaco etq-vazia"></div>')).join('')}</div>`);
    }
    return folhas;
  }

  /** HTML completo (rolo térmico ou folhas A4) */
  function montar(lista, op) {
    if (op.modelo === 'termica') return `<div class="rolo">${lista.map((i) => htmlEtiqueta(i, op)).join('')}</div>`;
    return folhasA4(lista, op).join('');
  }

  function desenharPrevia() {
    const op = opcoes();
    $('campo-inicio').classList.toggle('oculto', op.modelo !== 'pimaco');
    $('etq-ajustes').classList.toggle('oculto', op.modelo !== 'termica');
    const lista = listaEtiquetas();
    const previa = $('previa');
    if (!lista.length) { previa.innerHTML = '<p class="texto-sm texto-3 texto-centro">A prévia aparece aqui.</p>'; $('info-previa').textContent = ''; return; }
    if (op.modelo === 'termica') {
      previa.innerHTML = '<div class="previa-rolo"></div>';
      lista.slice(0, 4).forEach((item) => {
        const cv = canvasEtiqueta(item, op);
        cv.className = 'etq-canvas';
        cv.style.aspectRatio = `${ajustes.largura} / ${ajustes.altura}`;
        previa.firstChild.appendChild(cv);
      });
      const mm = (n) => String(n).replace('.', ',');
      $('info-previa').textContent = `${mm(ajustes.largura)} × ${mm(ajustes.altura)} mm` + (lista.length > 4 ? ` · 4 de ${lista.length}` : '');
    } else {
      // Só a primeira folha, reduzida para caber na lateral
      const folhas = folhasA4(lista.slice(0, POR_FOLHA), op);
      previa.innerHTML = `<div style="width:${210 * 0.32}mm;height:${297 * 0.32}mm;overflow:hidden"><div style="transform:scale(.32);transform-origin:top left">${folhas[0]}</div></div>`;
      $('info-previa').textContent = `${Math.ceil((lista.length + op.inicio - 1) / POR_FOLHA)} folha(s) A4`;
    }
  }

  /* ---------- Etiqueta térmica: desenho em canvas + ajustes ---------- */
  const CHAVE_AJUSTES = 'gestaoloja:etq-ajustes';
  const AJUSTES_PADRAO = { largura: 40, altura: 25, girar: 0, escala: 100, x: 0, y: 0 };
  const PX_MM = 12;                    // resolução do desenho (~305 dpi)
  const PT = 0.3528;                   // 1 ponto em mm
  let ajustes = { ...AJUSTES_PADRAO };
  try { ajustes = { ...AJUSTES_PADRAO, ...JSON.parse(localStorage.getItem(CHAVE_AJUSTES) || '{}') }; } catch (e) { /* padrão */ }
  function salvarAjustes() { try { localStorage.setItem(CHAVE_AJUSTES, JSON.stringify(ajustes)); } catch (e) { /* ignora */ } }

  /** Código de barras só com as barras (os números são escritos à parte, sem distorcer) */
  function barrasCanvas(codigo) {
    const c = document.createElement('canvas');
    try {
      JsBarcode(c, codigo, { format: ean13Valido(codigo) ? 'EAN13' : 'CODE128', displayValue: false, margin: 0, height: 80, width: 3, flat: true });
      return c;
    } catch (e) { return null; }
  }

  /** Corta o texto com "…" para caber na largura */
  function caber(ctx, texto, largura) {
    if (ctx.measureText(texto).width <= largura) return texto;
    let t = texto;
    while (t.length > 1 && ctx.measureText(t + '…').width > largura) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  }

  /**
   * Desenha uma etiqueta no tamanho do papel (mm × PX_MM).
   * O conteúdo é montado na área "de pé" (40×25) e depois girado, ampliado e deslocado.
   */
  function canvasEtiqueta(item, op, aj = ajustes) {
    const v = item.variacao, p = item.produto;
    const giro = ((Number(aj.girar) || 0) % 360 + 360) % 360;
    const deitado = giro === 90 || giro === 270;
    const W = deitado ? aj.altura : aj.largura;      // área do conteúdo (mm)
    const H = deitado ? aj.largura : aj.altura;
    const cv = document.createElement('canvas');
    cv.width = Math.round(aj.largura * PX_MM); cv.height = Math.round(aj.altura * PX_MM);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.scale(PX_MM, PX_MM);                          // daqui em diante, tudo em mm
    ctx.translate(aj.largura / 2 + (Number(aj.x) || 0), aj.altura / 2 + (Number(aj.y) || 0));
    ctx.rotate(giro * Math.PI / 180);
    const s = (Number(aj.escala) || 100) / 100;
    ctx.scale(s, s);
    ctx.translate(-W / 2, -H / 2);

    // Linhas (altura em mm) — distribuídas de cima a baixo
    const margem = 1, util = W - margem * 2;
    const linhas = [];
    if (op.loja) linhas.push({ tipo: 'texto', txt: String(loja.nome || '').toUpperCase(), fonte: `${6.5 * PT}px Arial, Helvetica, sans-serif`, alt: 6.5 * PT });
    linhas.push({ tipo: 'texto', txt: p.nome, fonte: `bold ${8.5 * PT}px Arial, Helvetica, sans-serif`, alt: 8.5 * PT });
    linhas.push({ tipo: 'var', alt: 8 * PT });
    const barras = barrasCanvas(v.codigoBarras || v.sku);
    linhas.push({ tipo: 'barras', alt: op.numero ? 6.8 : 8.5 });
    if (op.numero) linhas.push({ tipo: 'texto', txt: v.codigoBarras || v.sku, fonte: `${7 * PT}px "Courier New", monospace`, alt: 7 * PT });
    if (op.preco) linhas.push({ tipo: 'texto', txt: App.formatarMoeda(p.preco), fonte: `bold ${14 * PT}px Arial, Helvetica, sans-serif`, alt: 14 * PT });
    const soma = linhas.reduce((t, l) => t + l.alt, 0);
    const folga = Math.max(0, (H - margem * 2 - soma) / Math.max(1, linhas.length - 1));
    let y = margem;
    ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    linhas.forEach((l) => {
      if (l.tipo === 'texto') {
        ctx.font = l.fonte;
        ctx.fillText(caber(ctx, l.txt, util), W / 2, y);
      } else if (l.tipo === 'var') {
        // "Tam. 38 · Preto" com o tamanho em negrito
        const a = 'Tam. ', b = String(v.tamanho), c = ` · ${v.cor}`;
        const normal = `${8 * PT}px Arial, Helvetica, sans-serif`, negrito = `bold ${8 * PT}px Arial, Helvetica, sans-serif`;
        ctx.font = normal; const wa = ctx.measureText(a).width; let cc = c;
        ctx.font = negrito; const wb = ctx.measureText(b).width;
        ctx.font = normal; cc = caber(ctx, c, Math.max(2, util - wa - wb)); const wc = ctx.measureText(cc).width;
        let x0 = W / 2 - (wa + wb + wc) / 2;
        ctx.textAlign = 'left';
        ctx.fillText(a, x0, y); x0 += wa;
        ctx.font = negrito; ctx.fillText(b, x0, y); x0 += wb;
        ctx.font = normal; ctx.fillText(cc, x0, y);
        ctx.textAlign = 'center';
      } else if (l.tipo === 'barras') {
        if (barras) {
          ctx.imageSmoothingEnabled = false;
          const larg = Math.min(util, W - 2);
          ctx.drawImage(barras, (W - larg) / 2, y, larg, l.alt);
        } else {
          ctx.font = `${7 * PT}px Arial, sans-serif`;
          ctx.fillText('Código inválido', W / 2, y + l.alt / 2 - 1);
        }
      }
      y += l.alt + folga;
    });
    return cv;
  }

  /** PDF com uma página do tamanho exato da etiqueta para cada peça */
  async function pdfTermico(lista, op) {
    await App.carregarJsPdf();
    const { jsPDF } = window.jspdf;
    const w = Number(ajustes.largura), h = Number(ajustes.altura);
    const orient = w > h ? 'landscape' : 'portrait';
    const doc = new jsPDF({ unit: 'mm', format: [w, h], orientation: orient, compress: true });
    const cache = new Map();          // mesma peça = mesma imagem
    lista.forEach((item, i) => {
      if (i) doc.addPage([w, h], orient);
      let img = cache.get(item.sku);
      if (!img) { img = canvasEtiqueta(item, op).toDataURL('image/png'); cache.set(item.sku, img); }
      doc.addImage(img, 'PNG', 0, 0, w, h, item.sku, 'FAST');
    });
    doc.setProperties({ title: 'Etiquetas' });
    return doc.output('blob');
  }

  /* ---------- Painel de ajustes ---------- */
  function desenharAjustes() {
    document.querySelectorAll('[data-girar]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.girar) === Number(ajustes.girar))));
    $('aj-escala').value = ajustes.escala; $('aj-escala-valor').textContent = `${ajustes.escala}%`;
    $('aj-x').value = ajustes.x; $('aj-x-valor').textContent = `${Number(ajustes.x).toLocaleString('pt-BR')} mm`;
    $('aj-y').value = ajustes.y; $('aj-y-valor').textContent = `${Number(ajustes.y).toLocaleString('pt-BR')} mm`;
    $('aj-largura').value = ajustes.largura; $('aj-altura').value = ajustes.altura;
  }
  function mudarAjuste(campo, valor) {
    ajustes[campo] = valor;
    salvarAjustes(); desenharAjustes(); desenharPrevia();
  }
  document.querySelectorAll('[data-girar]').forEach((b) => b.addEventListener('click', () => mudarAjuste('girar', Number(b.dataset.girar))));
  [['aj-escala', 'escala'], ['aj-x', 'x'], ['aj-y', 'y']].forEach(([id, campo]) => $(id).addEventListener('input', (e) => mudarAjuste(campo, Number(e.target.value))));
  [['aj-largura', 'largura', 40], ['aj-altura', 'altura', 25]].forEach(([id, campo, padrao]) => $(id).addEventListener('change', (e) => {
    const n = Number(String(e.target.value).replace(',', '.'));
    mudarAjuste(campo, n >= 15 && n <= 150 ? n : padrao);
  }));
  $('aj-restaurar').addEventListener('click', () => { ajustes = { ...AJUSTES_PADRAO }; salvarAjustes(); desenharAjustes(); desenharPrevia(); });
  desenharAjustes();

  /* ---------- Eventos ---------- */
  document.querySelectorAll('[data-qtd-modo]').forEach((b) => b.addEventListener('click', () => {
    modoQtd = b.dataset.qtdModo;
    document.querySelectorAll('[data-qtd-modo]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  }));
  $('etq-produtos').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    adicionarProduto(b.dataset.add);
    desenharFila();
    const p = produtoPorId[b.dataset.add];
    App.toast(`${p.nome}: ${qtdNaFila(p.id)} etiqueta(s) na fila.`);
  });
  $('etq-termo').addEventListener('input', App.debounce(desenharProdutos, 120));
  // Enter (ou leitor de código de barras): código exato = +1 etiqueta; nome com 1 resultado = adiciona o produto
  $('etq-termo').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const termo = $('etq-termo').value.trim();
    if (!termo) return;
    if (adicionarPorCodigo(termo)) { $('etq-termo').value = ''; desenharFila(); return; }
    const visiveis = $('etq-produtos').querySelectorAll('[data-add]');
    if (visiveis.length === 1) { visiveis[0].click(); $('etq-termo').value = ''; desenharProdutos(); }
    else App.toast(visiveis.length ? 'Vários produtos encontrados: clique em Adicionar no que quiser.' : 'Nenhum produto com esse código.', 'aviso');
  });
  document.querySelectorAll('[name=modelo], #mostrar-loja, #mostrar-preco, #mostrar-numero, #posicao-inicial').forEach((c) => c.addEventListener('change', desenharPrevia));
  $('btn-limpar').addEventListener('click', () => { fila = []; desenharFila(); });

  $('btn-imprimir').addEventListener('click', () => {
    const op = opcoes();
    const lista = listaEtiquetas();
    if (!lista.length) return;
    const total = itensDaFila().reduce((s, i) => s + i.qtd, 0);
    if (total > LIMITE) App.toast(`Limite de ${LIMITE} etiquetas por impressão. Imprima o restante em seguida.`, 'aviso', 6000);
    if (op.modelo === 'termica') {
      const botao = $('btn-imprimir');
      botao.disabled = true;
      pdfTermico(lista, op).then(App.imprimirPdf)
        .catch(() => App.toast('Não foi possível gerar as etiquetas. Verifique a internet e tente de novo.', 'erro'))
        .finally(() => { botao.disabled = false; });
      return;
    }
    App.imprimir(montar(lista, op), '@page { size: A4; margin: 0; }');
  });

  /* ---------- Fila inicial: vinda da entrada de mercadoria ou ?produto= ---------- */
  try {
    const salva = JSON.parse(sessionStorage.getItem(CHAVE_FILA) || 'null');
    if (Array.isArray(salva) && salva.length) {
      fila = salva.filter((f) => produtoPorId[f.produtoId]);
      sessionStorage.removeItem(CHAVE_FILA);
      App.toast(`${fila.reduce((s, f) => s + f.qtd, 0)} etiqueta(s) das peças recebidas na fila.`);
    }
  } catch (e) { /* ignora */ }
  const produtoUrl = App.parametroUrl('produto');
  if (produtoUrl && produtoPorId[produtoUrl]) adicionarProduto(produtoUrl, 'estoque');
  await desenharCategorias();
  desenharFila();
});
