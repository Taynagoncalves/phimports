/* ==========================================================================
   reposicao.js — O que comprar (por tamanho/cor, pela venda recente) e
   peças paradas (sem vender há X dias). Imprime a lista de compras.
   ========================================================================== */
App.aoIniciar(async () => {
  const $ = (id) => document.getElementById(id);
  const e = App.escapeHtml;
  const r$ = App.formatarMoeda;
  let analise = null;
  let aba = 'comprar';
  const ajustes = {};   // sku → quantidade escolhida pela dona (muda o sugerido)

  async function carregar() {
    analise = await Data.analisarEstoque({ diasVenda: $('f-dias-venda').value, diasCobrir: $('f-dias-cobrir').value, diasParado: $('f-dias-parado').value });
    // Fornecedores que aparecem na lista de compras
    const sel = $('f-fornecedor');
    const atual = sel.value;
    const nomes = [...new Map(analise.comprar.map((x) => [x.fornecedorId, x.fornecedor || 'Sem fornecedor'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    sel.innerHTML = '<option value="">Todos</option>' + nomes.map(([id, nome]) => `<option value="${e(id)}">${e(nome)}</option>`).join('');
    sel.value = nomes.some(([id]) => id === atual) ? atual : '';
    desenhar();
  }

  const qtdDe = (x) => (ajustes[x.sku] ?? x.comprar);
  const listaComprar = () => analise.comprar.filter((x) => !$('f-fornecedor').value || x.fornecedorId === $('f-fornecedor').value);

  function desenhar() {
    const t = analise.totais;
    const lista = listaComprar();
    const pecas = lista.reduce((s, x) => s + qtdDe(x), 0);
    const invest = lista.reduce((s, x) => s + qtdDe(x) * x.custo, 0);
    const card = (rotulo, icone, valor, detalhe) => `
      <article class="card stat">
        <div class="stat-topo"><span class="stat-rotulo">${rotulo}</span><span class="stat-icone"><i data-lucide="${icone}"></i></span></div>
        <div class="stat-valor">${valor}</div>
        <div class="stat-detalhe">${detalhe}</div>
      </article>`;
    $('indicadores').innerHTML =
      card('Para comprar', 'shopping-cart', `${App.formatarNumero(pecas)} peça(s)`, `${lista.length} tamanho(s)/cor(es) para repor`)
      + card('Investimento', 'wallet', r$(invest), 'pelo preço de custo')
      + card('Esgotados que vendem', 'circle-alert', App.formatarNumero(t.esgotados), 'venderam e acabaram — prioridade')
      + card('Dinheiro parado', 'hourglass', r$(t.valorParado), `${App.formatarNumero(t.pecasParadas)} peça(s) sem vender há ${analise.diasParado}+ dias`);
    $('cont-comprar').textContent = analise.comprar.length;
    $('cont-parados').textContent = analise.parados.length;
    $('filtros-comprar').classList.toggle('oculto', aba !== 'comprar');
    $('filtros-parados').classList.toggle('oculto', aba !== 'parados');
    $('btn-imprimir').classList.toggle('oculto', aba !== 'comprar');
    if (aba === 'comprar') desenharComprar(lista); else desenharParados();
    App.icones();
  }

  function situacao(x) {
    if (x.urgencia === 'esgotado') return '<span class="badge badge-perigo">Esgotado</span>';
    if (x.urgencia === 'acabando') return `<span class="badge badge-alerta">Acaba em ${x.duraDias <= 1 ? '1 dia' : x.duraDias + ' dias'}</span>`;
    return `<span class="badge badge-info">Dura ${x.duraDias} dias</span>`;
  }

  function desenharComprar(lista) {
    const el = $('lista');
    if (!lista.length) {
      el.innerHTML = App.estadoVazio({ icone: 'package-check', titulo: 'Nada para repor agora', texto: `Tudo o que vendeu nos últimos ${analise.diasVenda} dias tem estoque para ${analise.diasCobrir} dias.` });
      return;
    }
    el.innerHTML = `
      <table class="tabela tabela-responsiva">
        <thead><tr><th>Peça</th><th>Situação</th><th class="num">Vendeu (${analise.diasVenda} dias)</th><th class="num">Tem</th><th class="num">Comprar</th><th class="num">Custo</th></tr></thead>
        <tbody>${lista.map((x) => `
          <tr>
            <td class="cel-principal"><div class="produto-cel">${App.thumb(x)}<div>
              <div class="titulo">${e(x.nome)}</div>
              <div class="sub"><span class="flex items-center gap-2">${App.bolinhaCor(x.cor)}${e(x.tamanho)} · ${e(x.cor)}${x.fornecedor ? ' · ' + e(x.fornecedor) : ''}</span></div>
            </div></div></td>
            <td data-label="Situação">${situacao(x)}</td>
            <td data-label="Vendeu" class="num">${x.vendeu}</td>
            <td data-label="Tem" class="num ${x.estoque <= 0 ? 'valor-negativo' : ''}">${x.estoque}</td>
            <td data-label="Comprar" class="num">
              <label class="sr-only" for="q-${e(x.sku)}">Quantidade a comprar de ${e(x.nome)} ${e(x.tamanho)} ${e(x.cor)}</label>
              <input class="input input-qtd-repor" type="number" min="0" step="1" id="q-${e(x.sku)}" data-sku="${e(x.sku)}" value="${qtdDe(x)}">
            </td>
            <td data-label="Custo" class="num negrito" data-custo="${e(x.sku)}">${r$(qtdDe(x) * x.custo)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="card-corpo texto-xs texto-3">Sugestão = média de venda por dia × ${analise.diasCobrir} dias − o que já tem. Ajuste as quantidades antes de imprimir.</div>`;
    el.querySelectorAll('[data-sku]').forEach((inp) => inp.addEventListener('input', () => {
      const x = analise.comprar.find((i) => i.sku === inp.dataset.sku);
      ajustes[x.sku] = Math.max(0, Math.floor(Number(inp.value) || 0));
      el.querySelector(`[data-custo="${CSS.escape(x.sku)}"]`).textContent = r$(ajustes[x.sku] * x.custo);
      atualizarTotais();
    }));
  }
  // Só os cartões (sem redesenhar a tabela, para não perder o foco do campo)
  function atualizarTotais() {
    const lista = listaComprar();
    const cards = $('indicadores').querySelectorAll('.stat-valor');
    cards[0].textContent = `${App.formatarNumero(lista.reduce((s, x) => s + qtdDe(x), 0))} peça(s)`;
    cards[1].textContent = r$(lista.reduce((s, x) => s + qtdDe(x) * x.custo, 0));
  }

  function desenharParados() {
    const el = $('lista');
    const lista = analise.parados;
    if (!lista.length) {
      el.innerHTML = App.estadoVazio({ icone: 'sparkles', titulo: 'Nenhuma peça parada', texto: `Tudo o que tem no estoque vendeu (ou chegou) nos últimos ${analise.diasParado} dias.` });
      return;
    }
    const dica = (d) => (d >= 120 ? 'Liquidar (40% a 50% off)' : d >= 90 ? 'Promoção forte (30% off)' : 'Destacar na vitrine / 15% off');
    el.innerHTML = `
      <table class="tabela tabela-responsiva">
        <thead><tr><th>Produto</th><th>Parado há</th><th>Tamanhos / cores no estoque</th><th class="num">Peças</th><th class="num">Valor parado</th><th>O que fazer</th></tr></thead>
        <tbody>${lista.map((p) => `
          <tr>
            <td class="cel-principal"><div class="produto-cel">${App.thumb(p)}<div>
              <div class="titulo">${e(p.nome)}</div>
              <div class="sub">${e(p.categoria || '')}${p.ultimaVenda ? ' · última venda ' + App.formatarData(p.ultimaVenda) : ' · nunca vendeu'}</div>
            </div></div></td>
            <td data-label="Parado há"><span class="badge ${p.dias >= 90 ? 'badge-perigo' : 'badge-alerta'}">${p.dias} dias</span></td>
            <td data-label="Tamanhos / cores"><div class="troca-pecas">${p.variacoes.map((v) => `<span class="tag">${App.bolinhaCor(v.cor)} ${e(v.tamanho)} · ${v.estoque}</span>`).join('')}</div></td>
            <td data-label="Peças" class="num">${p.pecas}</td>
            <td data-label="Valor parado" class="num"><div class="negrito">${r$(p.valorCusto)}</div><div class="texto-xs texto-3">vende por ${r$(p.valorVenda)}</div></td>
            <td data-label="O que fazer"><a class="btn btn-secundario btn-sm" href="promocoes.html" title="Criar uma promoção"><i data-lucide="badge-percent"></i>${dica(p.dias)}</a></td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="card-corpo texto-xs texto-3">Conta os dias desde a última venda ou a última chegada da mercadoria (o que for mais recente). Valor parado = peças × preço de custo.</div>`;
  }

  /* ---------- Lista de compras para imprimir (por fornecedor) ---------- */
  $('btn-imprimir').addEventListener('click', async () => {
    const lista = listaComprar().filter((x) => qtdDe(x) > 0);
    if (!lista.length) return App.toast('Nada para comprar.', 'aviso');
    const loja = await Data.obterLoja();
    const grupos = {};
    lista.forEach((x) => { (grupos[x.fornecedor || 'Sem fornecedor'] = grupos[x.fornecedor || 'Sem fornecedor'] || []).push(x); });
    const total = lista.reduce((s, x) => s + qtdDe(x) * x.custo, 0);
    const html = `<div class="lista-compras">
      <h1>Lista de compras — ${e(loja.nome)}</h1>
      <p>${App.formatarData(App.dataInput())} · base: vendas dos últimos ${analise.diasVenda} dias · estoque para ${analise.diasCobrir} dias</p>
      ${Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([forn, itens]) => `
        <h2>${e(forn)}</h2>
        <table><thead><tr><th>Produto</th><th>Tamanho</th><th>Cor</th><th>Qtd.</th><th>Custo</th><th>✓</th></tr></thead>
        <tbody>${itens.map((x) => `<tr><td>${e(x.nome)}</td><td>${e(x.tamanho)}</td><td>${e(x.cor)}</td><td>${qtdDe(x)}</td><td>${r$(qtdDe(x) * x.custo)}</td><td></td></tr>`).join('')}</tbody></table>`).join('')}
      <p class="total">Total: ${App.formatarNumero(lista.reduce((s, x) => s + qtdDe(x), 0))} peças · ${r$(total)}</p>
    </div>`;
    App.imprimir(html, '@page { size: A4; margin: 14mm; }');
  });

  /* ---------- Eventos ---------- */
  document.querySelectorAll('#abas [data-aba]').forEach((b) => b.addEventListener('click', () => {
    aba = b.dataset.aba;
    document.querySelectorAll('#abas [data-aba]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    desenhar();
  }));
  ['f-dias-venda', 'f-dias-cobrir', 'f-dias-parado'].forEach((id) => $(id).addEventListener('change', () => { Object.keys(ajustes).forEach((k) => delete ajustes[k]); carregar(); }));
  $('f-fornecedor').addEventListener('change', desenhar);
  window.addEventListener('dados-alterados', carregar);

  await carregar();
});
