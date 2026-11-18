/* ==========================================================================
   trocas.js — Tela de trocas: achar a venda (leitor, nº ou cliente),
   fazer a troca/devolução, histórico e vales-troca em aberto
   ========================================================================== */
App.aoIniciar(async () => {
  const DIAS_BUSCA = 180;        // vendas que podem ser trocadas (últimos 6 meses)
  const POR_VEZ = 30;
  const $ = (id) => document.getElementById(id);
  const e = App.escapeHtml;
  const r$ = App.formatarMoeda;
  const inputBusca = $('busca-troca');

  let vendas = [];      // vendas dos últimos meses (todas as situações)
  let historico = [];   // vendas com troca/devolução
  let vales = [];       // vales com saldo
  let aba = 'historico';
  let mostrando = POR_VEZ;

  async function carregar() {
    const [todas, creditos] = await Promise.all([
      Data.listarVendas({ dataInicio: App.diasAtras(DIAS_BUSCA) }),
      Data.listarCreditos({ comSaldo: true })
    ]);
    vendas = todas;
    historico = (await Data.listarVendas({})).filter((v) => v.devolucao).sort((a, b) => b.devolucao.data.localeCompare(a.devolucao.data));
    vales = creditos;
    desenharIndicadores();
    desenharLista();
    await buscar();
  }

  /* ---------- Nova troca: achar a venda ---------- */
  async function buscar() {
    const q = inputBusca.value.trim();
    const trocaveis = vendas.filter((v) => v.status === 'concluida');
    let lista, titulo, skuAchado = null;

    if (!q) {
      lista = trocaveis.slice(0, 6);
      titulo = 'Vendas recentes';
    } else {
      // 1) Código da peça (leitor) → vendas que levaram essa peça
      const achado = await Data.buscarPorCodigo(q);
      if (achado) {
        skuAchado = achado.variacao.sku;
        lista = trocaveis.filter((v) => v.itens.some((i) => i.sku === skuAchado));
        titulo = `Vendas com ${achado.produto.nome} · ${achado.variacao.tamanho} · ${achado.variacao.cor}`;
      } else {
        // 2) Nº da venda ou nome do cliente/produto
        const n = q.replace(/^#/, '');
        const alvo = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        lista = trocaveis.filter((v) => String(v.numero) === n
          || `${v.clienteNome} ${v.itens.map((i) => i.nome).join(' ')}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(alvo));
        lista.sort((a, b) => (String(b.numero) === n) - (String(a.numero) === n));
        titulo = 'Vendas encontradas';
      }
    }

    const el = $('resultado-troca');
    if (!lista.length) {
      const jaTrocada = q && vendas.find((v) => String(v.numero) === q.replace(/^#/, '') && v.status !== 'concluida');
      el.innerHTML = `<div class="alerta"><i data-lucide="search-x"></i><span>${jaTrocada
        ? `A venda #${jaTrocada.numero} já está ${App.badgeStatus(jaTrocada.status)} e não pode ser trocada de novo.`
        : q ? `Nenhuma venda dos últimos ${DIAS_BUSCA / 30} meses encontrada. Confira o código ou busque pelo nome do cliente.` : 'Nenhuma venda recente para trocar.'}</span></div>`;
      App.icones();
      return [];
    }
    el.innerHTML = `
      <div class="texto-xs texto-3 mb-2">${e(titulo)} · ${lista.length}</div>
      <div class="troca-vendas">${lista.slice(0, 12).map((v) => `
        <article class="troca-venda">
          <div class="troca-venda-topo">
            <div>
              <div class="negrito">Venda #${v.numero} <span class="texto-xs texto-3" style="font-weight:normal">· ${App.formatarDataHora(v.data)}</span></div>
              <div class="texto-sm texto-3">${e(v.clienteNome)} · ${App.nomePagamento(v)}</div>
            </div>
            <div class="negrito">${r$(v.total)}</div>
          </div>
          <div class="troca-pecas">${v.itens.map((i) => `
            <span class="tag ${i.sku === skuAchado ? 'troca-peca-achada' : ''}">${App.bolinhaCor(i.cor)} ${i.qtd}× ${e(i.nome)} · ${e(i.tamanho)}</span>`).join('')}
          </div>
          <button type="button" class="btn btn-primario btn-sm" data-trocar="${v.id}"><i data-lucide="repeat"></i>Trocar peças</button>
        </article>`).join('')}
      </div>`;
    el.querySelectorAll('[data-trocar]').forEach((b) => b.addEventListener('click', () => trocar(b.dataset.trocar)));
    App.icones();
    return lista;
  }

  function trocar(id) {
    const venda = vendas.find((v) => v.id === id);
    if (!venda) return;
    App.abrirTroca(venda, {
      aoConcluir: async () => { inputBusca.value = ''; await carregar(); inputBusca.focus(); }
    });
  }

  inputBusca.addEventListener('input', App.debounce(buscar, 200));
  // Leitor de código de barras termina com Enter: se só uma venda tem a peça, já abre a troca
  inputBusca.addEventListener('keydown', async (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const lista = await buscar();
    if (lista.length === 1) trocar(lista[0].id);
  });

  /* ---------- Indicadores do mês ---------- */
  function desenharIndicadores() {
    const mes = App.dataInput().slice(0, 7);
    const doMes = historico.filter((v) => v.devolucao.data.slice(0, 7) === mes);
    const trocas = doMes.filter((v) => v.devolucao.tipo === 'troca');
    const devol = doMes.filter((v) => v.devolucao.tipo !== 'troca');
    const pecas = doMes.reduce((s, v) => s + v.devolucao.itens.reduce((t, i) => t + i.qtd, 0), 0);
    const saldo = vales.reduce((s, c) => s + c.saldo, 0);
    const card = (rotulo, icone, valor, detalhe) => `
      <article class="card stat">
        <div class="stat-topo"><span class="stat-rotulo">${rotulo}</span><span class="stat-icone"><i data-lucide="${icone}"></i></span></div>
        <div class="stat-valor">${valor}</div>
        <div class="stat-detalhe">${detalhe}</div>
      </article>`;
    $('indicadores').innerHTML =
      card('Trocas no mês', 'repeat', App.formatarNumero(trocas.length), `${r$(trocas.reduce((s, v) => s + v.valorDevolvido, 0))} em vales`)
      + card('Devoluções no mês', 'undo-2', App.formatarNumero(devol.length), `${r$(devol.reduce((s, v) => s + v.valorDevolvido, 0))} devolvidos`)
      + card('Peças que voltaram', 'shirt', App.formatarNumero(pecas), 'de volta ao estoque este mês')
      + card('Vales em aberto', 'ticket', r$(saldo), `${vales.length} vale(s) ainda com saldo`);
    $('cont-historico').textContent = historico.length;
    $('cont-vales').textContent = vales.length;
  }

  /* ---------- Histórico / vales ---------- */
  function desenharLista() {
    const el = $('lista-trocas');
    if (aba === 'historico') {
      if (!historico.length) { el.innerHTML = App.estadoVazio({ icone: 'repeat', titulo: 'Nenhuma troca ainda', texto: 'As trocas e devoluções feitas aparecem aqui.' }); App.icones(); return; }
      const lista = historico.slice(0, mostrando);
      el.innerHTML = `
        <table class="tabela tabela-responsiva">
          <thead><tr><th>Data</th><th>Venda</th><th>Cliente</th><th>Tipo</th><th>Peças que voltaram</th><th>Motivo</th><th class="num">Valor</th><th>Vale</th></tr></thead>
          <tbody>${lista.map((v) => {
            const d = v.devolucao;
            const pecas = d.itens.map((it) => { const i = v.itens.find((x) => x.sku === it.sku) || { nome: it.sku, tamanho: '' }; return `${it.qtd}× ${e(i.nome)}${i.tamanho ? ' · ' + e(i.tamanho) : ''}`; }).join('<br>');
            return `<tr>
              <td data-label="Data" class="nowrap">${App.formatarData(d.data)}</td>
              <td data-label="Venda" class="cel-principal negrito">#${v.numero}</td>
              <td data-label="Cliente">${e(v.clienteNome)}</td>
              <td data-label="Tipo">${d.tipo === 'troca' ? '<span class="badge badge-info">Troca</span>' : '<span class="badge badge-alerta">Devolução</span>'}</td>
              <td data-label="Peças" class="texto-sm">${pecas}</td>
              <td data-label="Motivo" class="texto-sm texto-3">${e(d.motivo || '—')}</td>
              <td data-label="Valor" class="num negrito">${r$(v.valorDevolvido)}</td>
              <td data-label="Vale">${v.credito ? `<button type="button" class="btn btn-secundario btn-sm" data-vale-venda="${v.id}" title="Ver/imprimir o vale"><i data-lucide="ticket"></i><span class="mono">${e(v.credito.codigo)}</span></button>` : '<span class="texto-3">—</span>'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        ${historico.length > mostrando ? `<div class="card-corpo texto-centro"><button type="button" class="btn btn-secundario" id="mais">Mostrar mais (${historico.length - mostrando})</button></div>` : ''}`;
      el.querySelectorAll('[data-vale-venda]').forEach((b) => b.addEventListener('click', () => App.mostrarVale(historico.find((v) => v.id === b.dataset.valeVenda))));
      el.querySelector('#mais')?.addEventListener('click', () => { mostrando += POR_VEZ; desenharLista(); });
    } else {
      if (!vales.length) { el.innerHTML = App.estadoVazio({ icone: 'ticket', titulo: 'Nenhum vale em aberto', texto: 'Os vales-troca com saldo para usar aparecem aqui.' }); App.icones(); return; }
      el.innerHTML = `
        <table class="tabela tabela-responsiva">
          <thead><tr><th>Código</th><th>Cliente</th><th>Emitido em</th><th>Troca da venda</th><th class="num">Saldo</th><th></th></tr></thead>
          <tbody>${vales.map((c) => `<tr>
            <td data-label="Código" class="cel-principal mono negrito">${e(c.codigo)}</td>
            <td data-label="Cliente">${e(c.clienteNome)}</td>
            <td data-label="Emitido em" class="nowrap">${App.formatarData(c.criadoEm)}</td>
            <td data-label="Venda">${c.numeroVendaOrigem ? '#' + c.numeroVendaOrigem : '—'}</td>
            <td data-label="Saldo" class="num negrito">${r$(c.saldo)}${c.saldo !== c.valor ? `<div class="texto-xs texto-3" style="font-weight:normal">de ${r$(c.valor)}</div>` : ''}</td>
            <td class="num"><button type="button" class="btn btn-secundario btn-sm" data-imprimir="${c.id}"><i data-lucide="printer"></i>Imprimir</button></td>
          </tr>`).join('')}</tbody>
        </table>`;
      el.querySelectorAll('[data-imprimir]').forEach((b) => b.addEventListener('click', async () => {
        const c = vales.find((x) => x.id === b.dataset.imprimir);
        App.imprimir(await App.gerarVale({ credito: c, venda: c.numeroVendaOrigem ? { numero: c.numeroVendaOrigem } : null }));
      }));
    }
    App.icones();
  }

  document.querySelectorAll('#abas-trocas [data-aba]').forEach((b) => b.addEventListener('click', () => {
    aba = b.dataset.aba;
    document.querySelectorAll('#abas-trocas [data-aba]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    desenharLista();
  }));

  await carregar();
});
