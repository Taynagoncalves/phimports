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
    const lista = listaEtiquetas();
    const previa = $('previa');
    if (!lista.length) { previa.innerHTML = '<p class="texto-sm texto-3 texto-centro">A prévia aparece aqui.</p>'; $('info-previa').textContent = ''; return; }
    if (op.modelo === 'termica') {
      previa.innerHTML = montar(lista.slice(0, 6), op);
      $('info-previa').textContent = lista.length > 6 ? `mostrando 6 de ${lista.length}` : '';
    } else {
      // Só a primeira folha, reduzida para caber na lateral
      const folhas = folhasA4(lista.slice(0, POR_FOLHA), op);
      previa.innerHTML = `<div style="width:${210 * 0.32}mm;height:${297 * 0.32}mm;overflow:hidden"><div style="transform:scale(.32);transform-origin:top left">${folhas[0]}</div></div>`;
      $('info-previa').textContent = `${Math.ceil((lista.length + op.inicio - 1) / POR_FOLHA)} folha(s) A4`;
    }
  }

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
    const pagina = op.modelo === 'termica' ? '@page { size: 40mm 25mm; margin: 0; }' : '@page { size: A4; margin: 0; }';
    App.imprimir(montar(lista, op), pagina);
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
