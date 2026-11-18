/* ==========================================================================
   vendas.js — Histórico de vendas: período rápido, indicadores, formas de
   pagamento, abas de situação, lista agrupada por dia, detalhes em modal e
   troca/devolução/cancelamento
   ========================================================================== */
App.aoIniciar(async () => {
  const POR_PAGINA = 15;
  let pagina = 1;
  let base = [];    // vendas do período/busca (sem filtro de situação e forma)
  let vendas = [];  // o que aparece na lista (e vai para o PDF)

  const form = document.getElementById('filtros');
  const elLista = document.getElementById('lista-vendas');
  const FORMAS = [
    ['pix', 'Pix', 'qr-code', '#0EA5A4'], ['dinheiro', 'Dinheiro', 'banknote', '#16A34A'],
    ['debito', 'Débito', 'credit-card', '#2563EB'], ['credito', 'Crédito', 'credit-card', '#7C3AED'],
    ['vale', 'Vale-troca', 'ticket', '#D97706'], ['crediario', 'Crediário', 'calendar-clock', '#DB2777']
  ];
  const STATUS = [['', 'Todas'], ['concluida', 'Concluídas'], ['trocada', 'Trocadas'], ['devolvida', 'Devolvidas'], ['cancelada', 'Canceladas']];

  /* ---------- Período rápido ---------- */
  function definirPeriodo(p) {
    const hoje = App.dataInput();
    const dias = { hoje: [hoje, hoje], ontem: [App.diasAtras(1), App.diasAtras(1)], 7: [App.diasAtras(6), hoje], 30: [App.diasAtras(29), hoje], mes: [hoje.slice(0, 8) + '01', hoje] }[p];
    if (dias) [form.dataInicio.value, form.dataFim.value] = dias;
    document.getElementById('periodo-datas').classList.toggle('oculto', p !== 'personalizado');
    document.querySelectorAll('[data-periodo]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.periodo === p)));
  }

  /* ---------- Carregar ---------- */
  async function carregar() {
    base = await Data.listarVendas({ busca: form.busca.value, dataInicio: form.dataInicio.value, dataFim: form.dataFim.value });
    pagina = 1;
    desenhar();
  }

  /** Quanto de cada venda entrou em cada forma (proporcional ao valor líquido) */
  function valoresPorForma(v) {
    const soma = v.pagamentos.reduce((s, p) => s + p.valor, 0) || 1;
    const fator = v.valorLiquido / soma;
    return v.pagamentos.map((p) => [p.forma, p.valor * fator]);
  }

  function desenharIndicadores() {
    const validas = base.filter((v) => v.status !== 'cancelada');
    const fat = validas.reduce((s, v) => s + v.valorLiquido, 0);
    const pecas = validas.reduce((s, v) => s + v.qtdItens, 0);
    const outras = base.filter((v) => v.status !== 'concluida').length;
    const card = (rotulo, icone, valor, detalhe) => `
      <article class="card stat">
        <div class="stat-topo"><span class="stat-rotulo">${rotulo}</span><span class="stat-icone"><i data-lucide="${icone}"></i></span></div>
        <div class="stat-valor">${valor}</div>
        <div class="stat-detalhe">${detalhe}</div>
      </article>`;
    document.getElementById('indicadores').innerHTML =
      card('Faturamento', 'wallet', App.formatarMoeda(fat), 'já descontando trocas e devoluções')
      + card('Vendas', 'shopping-bag', App.formatarNumero(validas.length), outras ? `${outras} com troca, devolução ou cancelamento` : 'todas concluídas')
      + card('Ticket médio', 'receipt', App.formatarMoeda(validas.length ? fat / validas.length : 0), 'por venda')
      + card('Peças vendidas', 'shirt', App.formatarNumero(pecas), validas.length ? `${(pecas / validas.length).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por venda` : '—');
  }

  function desenharFormas() {
    const somas = Object.fromEntries(FORMAS.map(([f]) => [f, 0]));
    const qtd = Object.fromEntries(FORMAS.map(([f]) => [f, 0]));
    base.filter((v) => v.status !== 'cancelada').forEach((v) => {
      valoresPorForma(v).forEach(([f, val]) => { somas[f] = (somas[f] || 0) + val; });
      new Set(v.pagamentos.map((p) => p.forma)).forEach((f) => { qtd[f] = (qtd[f] || 0) + 1; });
    });
    const total = Object.values(somas).reduce((s, x) => s + x, 0);
    const usadas = FORMAS.filter(([f]) => somas[f] > 0);
    const ativa = form.forma.value;
    document.getElementById('barra-formas').innerHTML = total
      ? usadas.map(([f, , , cor]) => `<span style="width:${(somas[f] / total) * 100}%;background:${cor};${ativa && ativa !== f ? 'opacity:.25' : ''}"></span>`).join('')
      : '<span style="width:100%;background:var(--cor-superficie-2)"></span>';
    document.getElementById('legenda-formas').innerHTML = usadas.length ? usadas.map(([f, nome, icone, cor]) => `
      <button type="button" class="forma-legenda ${ativa === f ? 'ativa' : ''} ${ativa && ativa !== f ? 'apagada' : ''}" data-forma-filtro="${f}" aria-pressed="${ativa === f}">
        <span class="forma-cor" style="background:${cor}"></span>
        <span class="forma-info"><span>${nome}</span><strong>${App.formatarMoeda(somas[f])}</strong></span>
        <span class="forma-pct">${Math.round((somas[f] / total) * 100)}% · ${qtd[f]} venda${qtd[f] === 1 ? '' : 's'}</span>
      </button>`).join('') : '<p class="texto-sm texto-3">Nenhuma venda no período.</p>';
    document.querySelectorAll('[data-forma-filtro]').forEach((b) => b.addEventListener('click', () => {
      form.forma.value = form.forma.value === b.dataset.formaFiltro ? '' : b.dataset.formaFiltro;
      pagina = 1;
      desenhar();
    }));
  }

  function desenharAbas() {
    const el = document.getElementById('abas-status');
    el.innerHTML = STATUS.map(([s, nome]) => `
      <button type="button" class="aba" role="tab" data-status="${s}" aria-selected="${form.status.value === s}">
        ${nome} <span class="aba-contagem">${base.filter((v) => !s || v.status === s).length}</span>
      </button>`).join('');
    el.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => {
      form.status.value = b.dataset.status;
      pagina = 1;
      desenhar();
    }));
  }

  function desenharFiltrosAtivos() {
    const el = document.getElementById('filtros-ativos');
    const f = FORMAS.find(([x]) => x === form.forma.value);
    el.innerHTML = f ? `<button type="button" class="filtro-ativo" id="limpar-forma">Pagamento: ${f[1]}<i data-lucide="x"></i></button>` : '';
    document.getElementById('limpar-forma')?.addEventListener('click', () => { form.forma.value = ''; desenhar(); });
  }

  const iconeForma = (f) => (FORMAS.find(([x]) => x === f) || [])[2] || 'credit-card';
  function rotuloDia(dia) {
    const hoje = App.dataInput();
    if (dia === hoje) return 'Hoje';
    if (dia === App.diasAtras(1)) return 'Ontem';
    const d = new Date(dia + 'T12:00:00');
    const semana = d.toLocaleDateString('pt-BR', { weekday: 'long' });
    return semana.charAt(0).toUpperCase() + semana.slice(1);
  }
  const diaDa = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  function desenhar() {
    vendas = base.filter((v) => (!form.status.value || v.status === form.status.value)
      && (!form.forma.value || v.pagamentos.some((p) => p.forma === form.forma.value)));
    // Faturamento líquido: desconta trocas/devoluções (vendas canceladas não contam)
    const total = vendas.reduce((s, v) => s + v.valorLiquido, 0);
    document.getElementById('resumo').textContent = `${vendas.length} ${vendas.length === 1 ? 'venda' : 'vendas'} · ${App.formatarMoeda(total)} faturados · ${Pdf.descreverPeriodo(form.dataInicio.value, form.dataFim.value)}`;
    desenharIndicadores();
    desenharFormas();
    desenharAbas();
    desenharFiltrosAtivos();

    const elPag = document.getElementById('paginacao');
    if (!vendas.length) {
      elLista.innerHTML = App.estadoVazio({ icone: 'shopping-bag', titulo: 'Nenhuma venda encontrada', texto: 'Mude o período, a situação ou a busca.' });
      elPag.classList.add('oculto');
      elPag.innerHTML = '';
      App.icones();
      return;
    }

    const pag = App.paginar(vendas, pagina, POR_PAGINA);
    pagina = pag.pagina;
    // Agrupa a página por dia
    const grupos = new Map();
    pag.itens.forEach((v) => { const d = diaDa(v.data); if (!grupos.has(d)) grupos.set(d, []); grupos.get(d).push(v); });
    elLista.innerHTML = [...grupos].map(([dia, lista]) => {
      const doDia = vendas.filter((v) => diaDa(v.data) === dia);
      const totalDia = doDia.reduce((s, v) => s + v.valorLiquido, 0);
      return `
      <div class="vendas-dia">
        <header class="vendas-dia-cabecalho">
          <strong>${rotuloDia(dia)}</strong><span class="texto-3">${App.formatarData(dia)}</span>
          <span class="vendas-dia-total">${doDia.length} venda${doDia.length === 1 ? '' : 's'} · <strong>${App.formatarMoeda(totalDia)}</strong></span>
        </header>
        ${lista.map((v) => `
        <button type="button" class="venda-linha ${v.status === 'cancelada' ? 'cancelada' : ''}" data-ver="${v.id}" aria-label="Detalhes da venda ${v.numero}">
          <span class="venda-hora">${new Date(v.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          <span class="venda-principal">
            <span class="venda-titulo"><strong>#${v.numero}</strong> · ${App.escapeHtml(v.clienteNome)}</span>
            <span class="venda-itens">${v.itens.map((i) => `${i.qtd}× ${App.escapeHtml(i.nome)} (${App.escapeHtml(i.tamanho)})`).join(', ')}</span>
          </span>
          <span class="venda-pagamento">${[...new Set(v.pagamentos.map((p) => p.forma))].map((f) => `<span class="pag-icone" title="${App.FORMAS_CURTAS[f] || f}"><i data-lucide="${iconeForma(f)}"></i></span>`).join('')}<span class="texto-xs texto-2">${App.nomePagamento(v)}</span></span>
          <span class="venda-status">${App.badgeStatus(v.status)}</span>
          <span class="venda-total">${App.formatarMoeda(v.total)}${v.valorLiquido !== v.total && v.status !== 'cancelada' ? `<small>líquido ${App.formatarMoeda(v.valorLiquido)}</small>` : ''}</span>
          <i data-lucide="chevron-right" class="venda-seta"></i>
        </button>`).join('')}
      </div>`;
    }).join('');

    elLista.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => abrirDetalhes(b.dataset.ver)));
    elPag.classList.toggle('oculto', vendas.length <= POR_PAGINA);
    App.renderPaginacao(elPag, {
      total: vendas.length, pagina, porPagina: POR_PAGINA,
      aoMudar: (n) => { pagina = n; desenhar(); elLista.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    App.icones();
  }

  /* ==================================================================
     DETALHES DA VENDA
     ================================================================== */
  async function abrirDetalhes(id) {
    let venda;
    try { venda = await Data.obterVenda(id); } catch (e) { return App.toast(e.message, 'erro'); }
    const nota = venda.notaId ? await Data.obterNota(venda.notaId).catch(() => null) : null;
    const podeDevolver = venda.status === 'concluida';
    const podeCancelar = venda.status === 'concluida' && App.pode('cancelar-venda');

    const acoes = [
      { texto: 'Recibo', icone: 'printer', aoClicar: async () => App.imprimir(await App.gerarCupom({ venda })) }
    ];
    if (podeDevolver) acoes.unshift({ texto: 'Troca / devolução', icone: 'rotate-ccw', aoClicar: (fechar) => { fechar(); setTimeout(() => abrirDevolucao(venda), 200); } });
    if (podeCancelar) acoes.unshift({ texto: 'Cancelar venda', classe: 'btn-perigo', icone: 'ban', aoClicar: (fechar) => { fechar(); setTimeout(() => abrirCancelamento(venda, nota), 200); } });
    if (venda.credito) acoes.unshift({ texto: 'Imprimir vale', icone: 'ticket', aoClicar: async () => App.imprimir(await App.gerarVale({ credito: venda.credito, venda })) });
    if (nota) acoes.push({ texto: 'Ver nota', classe: 'btn-primario', icone: 'file-text', aoClicar: () => { location.href = `notas.html?nota=${nota.id}`; } });
    else if (venda.status !== 'cancelada' && App.emiteNota) acoes.push({ texto: 'Emitir nota', classe: 'btn-primario', icone: 'file-text', aoClicar: async (fechar, botao) => {
      botao.disabled = true;
      try {
        const n = await Data.emitirNota(venda.id);
        App.toast(`NFC-e nº ${n.numero} autorizada${n.ambiente === 'homologacao' ? ' em homologação' : ''} (simulação).`);
        fechar();
        await carregar();
      } catch (erro) {
        // Ex.: dados fiscais incompletos → orienta para Configurações
        App.toast(erro.message, 'erro', 6000);
        botao.disabled = false;
      }
    } });

    App.abrirModal({
      titulo: `Venda #${venda.numero}`,
      tamanho: 'lg',
      corpo: `
        <dl class="detalhes">
          <div><dt>Data</dt><dd>${App.formatarDataHora(venda.data)}</dd></div>
          <div><dt>Status</dt><dd>${App.badgeStatus(venda.status)}</dd></div>
          <div><dt>Cliente</dt><dd>${App.escapeHtml(venda.clienteNome)}</dd></div>
          <div><dt>Vendedor(a)</dt><dd>${App.escapeHtml(venda.vendedorNome)}</dd></div>
          <div><dt>Pagamento</dt><dd>${App.nomePagamento(venda)}</dd></div>
          <div class="so-nota"><dt>Nota fiscal</dt><dd>${nota ? `NFC-e nº ${nota.numero} ${App.badgeStatus(nota.status)}` : 'Não emitida'}</dd></div>
        </dl>

        <h4 class="mt-6 mb-4">Itens</h4>
        <div class="card">
          <table class="tabela tabela-responsiva">
            <thead><tr><th>Produto</th><th>Variação</th><th class="num">Qtd.</th><th class="num">Unitário</th><th class="num">Total</th></tr></thead>
            <tbody>
              ${venda.itens.map((i) => `
                <tr>
                  <td class="cel-principal"><div class="negrito">${App.escapeHtml(i.nome)}</div><div class="texto-xs texto-3 mono">${App.escapeHtml(i.sku)}</div></td>
                  <td data-label="Variação"><span class="flex items-center gap-2" style="justify-content:inherit">${App.bolinhaCor(i.cor)}${App.escapeHtml(i.tamanho)} · ${App.escapeHtml(i.cor)}</span></td>
                  <td data-label="Qtd." class="num">${i.qtd}</td>
                  <td data-label="Unitário" class="num">${App.formatarMoeda(i.preco)}</td>
                  <td data-label="Total" class="num negrito">${App.formatarMoeda(i.preco * i.qtd)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="mt-4" style="max-width:320px;margin-left:auto">
          <div class="resumo-linha"><span>Subtotal</span><strong>${App.formatarMoeda(venda.subtotal)}</strong></div>
          ${(venda.promocoes || []).map((p) => `<div class="resumo-linha" style="color:var(--cor-sucesso)"><span>${App.escapeHtml(p.nome)}</span><strong style="color:inherit">— ${App.formatarMoeda(p.valor)}</strong></div>`).join('')}
          <div class="resumo-linha"><span>Desconto${venda.descontoAutorizadoPorNome ? ` <span class="tag" title="Desconto acima do limite do vendedor">autorizado por ${App.escapeHtml(venda.descontoAutorizadoPorNome)}</span>` : ''}</span><strong>— ${App.formatarMoeda(venda.desconto)}</strong></div>
          <div class="resumo-total"><span>Total</span><strong>${App.formatarMoeda(venda.total)}</strong></div>
        </div>

        <h4 class="mt-6 mb-4">Pagamento</h4>
        <ul class="lista card">
          ${venda.pagamentos.map((p) => `
            <li class="lista-item">
              <div class="info"><div class="titulo">${App.nomePagamento(p)}${p.codigoVale ? ` · <span class="mono">${App.escapeHtml(p.codigoVale)}</span>` : ''}</div></div>
              <span class="valor">${App.formatarMoeda(p.valor)}</span>
            </li>`).join('')}
          ${venda.pagamento.troco ? `<li class="lista-item"><div class="info"><div class="sub">Recebido em dinheiro ${App.formatarMoeda(venda.pagamentos.filter((p) => p.forma === 'dinheiro').reduce((s, p) => s + p.valor, 0) + venda.pagamento.troco)} · troco</div></div><span class="valor">${App.formatarMoeda(venda.pagamento.troco)}</span></li>` : ''}
        </ul>

        ${venda.parcelasCrediario && venda.parcelasCrediario.length ? `
          <h4 class="mt-6 mb-4">Parcelas do crediário</h4>
          <ul class="lista card">${venda.parcelasCrediario.map((p) => `
            <li class="lista-item">
              <div class="info"><div class="titulo">Parcela ${p.parcela}/${p.totalParcelas} · vence ${App.formatarData(p.vencimento)}</div>${p.valorPago ? `<div class="sub">Pago ${App.formatarMoeda(p.valorPago)}</div>` : ''}</div>
              ${App.badgeStatus(p.status === 'aberto' ? 'avencer' : p.status === 'cancelada' ? 'cancelada' : p.status)}
              <span class="valor">${App.formatarMoeda(p.valor)}</span>
            </li>`).join('')}</ul>` : ''}
        ${venda.devolucao ? `
          <div class="alerta mt-6"><i data-lucide="rotate-ccw"></i>
            <span><strong>${venda.devolucao.tipo === 'troca' ? 'Troca' : 'Devolução'}</strong> em ${App.formatarData(venda.devolucao.data)} —
            ${venda.devolucao.itens.reduce((s, i) => s + i.qtd, 0)} peça(s), ${App.formatarMoeda(venda.valorDevolvido)}${venda.devolucao.tipo === 'troca' ? ' em vale-troca' : ' devolvidos ao cliente'}.
            ${venda.devolucao.motivo ? `Motivo: ${App.escapeHtml(venda.devolucao.motivo)}.` : ''}
            ${venda.credito ? `<br>Vale <strong class="mono">${App.escapeHtml(venda.credito.codigo)}</strong> · saldo ${App.formatarMoeda(venda.credito.saldo)}${venda.credito.saldo < venda.credito.valor ? ` (de ${App.formatarMoeda(venda.credito.valor)})` : ''}.` : ''}
            ${venda.valorLiquido > 0 ? `<br>Valor que continua faturado: ${App.formatarMoeda(venda.valorLiquido)}.` : ''}</span>
          </div>` : ''}
        ${venda.cancelamento ? `
          <div class="alerta mt-6" style="background:var(--cor-perigo-suave);color:var(--cor-perigo)"><i data-lucide="ban"></i>
            <span><strong>Cancelada</strong> em ${App.formatarDataHora(venda.cancelamento.data)} por ${App.escapeHtml(venda.cancelamento.usuarioNome)}.
            Motivo: ${App.escapeHtml(venda.cancelamento.motivo)}.${venda.cancelamento.notaCancelada ? ' A NFC-e também foi cancelada.' : ''}</span>
          </div>` : ''}
      `,
      acoes
    });
  }

  /* ==================================================================
     CANCELAR VENDA (só o dono)
     ================================================================== */
  function abrirCancelamento(venda, nota) {
    const temDinheiro = venda.pagamentos.some((p) => p.forma === 'dinheiro');
    const temVale = venda.pagamentos.some((p) => p.forma === 'vale');
    const temCartao = venda.pagamentos.some((p) => p.forma === 'credito' || p.forma === 'debito' || p.forma === 'pix');
    const { el, fechar } = App.abrirModal({
      titulo: `Cancelar venda #${venda.numero}`,
      corpo: `
        <p class="texto-sm">Use para vendas lançadas por engano ou desfeitas na hora. Para cliente que volta depois com a peça, use <strong>Troca / devolução</strong>.</p>
        <div class="campo mt-4">
          <label for="motivo-cancel">Motivo <span class="obrigatorio" aria-hidden="true">*</span></label>
          <select class="select" id="motivo-cancel">
            <option value="">Selecione…</option>
            <option>Venda lançada errado</option>
            <option>Cliente desistiu da compra</option>
            <option>Pagamento não aprovado</option>
            <option>Valor ou desconto incorreto</option>
            <option>Outro</option>
          </select>
        </div>
        <div class="alerta mt-4"><i data-lucide="triangle-alert"></i>
          <span>O que vai acontecer:<br>
          • ${venda.qtdItens} peça(s) voltam ao estoque.<br>
          ${temDinheiro ? `• Devolva ${App.formatarMoeda(venda.pagamentos.filter((p) => p.forma === 'dinheiro').reduce((s, p) => s + p.valor, 0))} em dinheiro ao cliente (sai do caixa).<br>` : ''}
          ${temCartao ? '• Estorne o Pix/cartão na maquininha ou no banco.<br>' : ''}
          ${temVale ? '• O saldo do vale-troca usado volta para o vale.<br>' : ''}
          ${nota && nota.status !== 'cancelada' ? `• A NFC-e nº ${nota.numero} também será cancelada (na SEFAZ, só até 30 min após a emissão).` : ''}</span>
        </div>`,
      acoes: [
        { texto: 'Voltar' },
        { texto: 'Cancelar venda', classe: 'btn-perigo', icone: 'ban', aoClicar: async (_, botao) => {
          const motivo = el.querySelector('#motivo-cancel').value;
          if (!motivo) { el.querySelector('#motivo-cancel').focus(); return App.toast('Escolha o motivo do cancelamento.', 'erro'); }
          botao.disabled = true;
          try {
            await Data.cancelarVenda(venda.id, motivo);
            fechar();
            App.toast(`Venda #${venda.numero} cancelada. Peças devolvidas ao estoque.`);
            await carregar();
          } catch (erro) {
            App.toast(erro.message, 'erro', 6000);
            botao.disabled = false;
          }
        } }
      ]
    });
  }

  // Troca/devolução e vale-troca ficam no app.js (usados também na tela Trocas)
  const mostrarVale = (venda) => App.mostrarVale(venda);
  const abrirDevolucao = (venda) => App.abrirTroca(venda, { aoConcluir: carregar });

  /* ==================================================================
     EXPORTAR PDF — todas as vendas do filtro atual (não só a página)
     ================================================================== */
  Pdf.ligarBotao(document.getElementById('btn-pdf'), async () => {
    const moeda = Pdf.moeda;
    // Faturadas = vendas com valor líquido (total − trocas/devoluções) maior que zero
    const validas = vendas.filter((v) => v.valorLiquido > 0);
    const faturamento = validas.reduce((s, v) => s + v.valorLiquido, 0);
    const descontos = validas.reduce((s, v) => s + v.desconto, 0);
    const devolvidas = vendas.filter((v) => v.status === 'devolvida');
    const trocadas = vendas.filter((v) => v.status === 'trocada');
    const canceladas = vendas.filter((v) => v.status === 'cancelada');
    // Peças que ficaram com o cliente (sem as que voltaram)
    const pecasLiquidas = (v) => v.itens.reduce((s, i) => s + i.qtd - ((v.devolucao && (v.devolucao.itens.find((d) => d.sku === i.sku) || {}).qtd) || 0), 0);

    const pdf = await Pdf.criar({
      titulo: 'Histórico de vendas',
      periodo: Pdf.descreverPeriodo(form.dataInicio.value, form.dataFim.value),
      filtros: [Pdf.descreverFiltros(form),
        form.status.value ? (STATUS.find(([x]) => x === form.status.value) || [])[1] : '',
        form.forma.value ? 'Pagamento: ' + ((FORMAS.find(([x]) => x === form.forma.value) || [])[1] || '') : ''].filter(Boolean).join(' · ')
    });

    pdf.indicadores([
      ['Vendas', App.formatarNumero(vendas.length), `${validas.length} faturada${validas.length === 1 ? '' : 's'} · ${canceladas.length} cancelada${canceladas.length === 1 ? '' : 's'}`],
      ['Faturamento', moeda(faturamento), `${moeda(descontos)} em descontos`],
      ['Ticket médio', moeda(validas.length ? faturamento / validas.length : 0), `${validas.reduce((s, v) => s + pecasLiquidas(v), 0)} peças vendidas`],
      ['Trocas e devoluções', App.formatarNumero(trocadas.length + devolvidas.length), `${moeda(vendas.reduce((s, v) => s + (v.valorDevolvido || 0), 0))} devolvidos`]
    ]);

    pdf.tabela({
      titulo: 'Vendas',
      nota: 'Faturado = total da venda menos o que voltou em troca ou devolução. Venda cancelada não fatura.',
      cabecalho: ['Nº', 'Data', 'Cliente', 'Peças', 'Pagamento', 'Status', 'Total', 'Faturado'],
      linhas: vendas.map((v) => Pdf.linhaComStatus([
        `#${v.numero}`, Pdf.dataHora(v.data), v.clienteNome, v.qtdItens,
        App.nomePagamento(v), Pdf.rotuloStatus(v.status), moeda(v.total), moeda(v.valorLiquido)
      ], v.status)),
      direita: [6, 7],
      centro: [3],
      colunaStatus: 5,
      larguras: { 0: 13, 1: 27, 6: 22, 7: 22 },
      vazio: 'Nenhuma venda com os filtros escolhidos.',
      rodape: [
        { content: 'Total faturado', colSpan: 3, styles: { halign: 'left' } },
        validas.reduce((s, v) => s + pecasLiquidas(v), 0), '', '', '', moeda(faturamento)
      ]
    });

    // Resumo por forma de pagamento (divide o faturado entre as formas da venda)
    const porForma = {};
    validas.forEach((v) => {
      const proporcao = v.total ? v.valorLiquido / v.total : 0;
      v.pagamentos.forEach((p) => {
        const f = porForma[p.forma] || (porForma[p.forma] = { qtd: 0, total: 0 });
        f.qtd++;
        f.total += p.valor * proporcao;
      });
    });
    pdf.tabela({
      titulo: 'Por forma de pagamento',
      cabecalho: ['Forma de pagamento', 'Vendas', 'Total', '% do faturamento'],
      linhas: Object.entries(porForma).sort((a, b) => b[1].total - a[1].total).map(([forma, f]) => [
        App.FORMAS_PAGAMENTO[forma] || forma, f.qtd, moeda(f.total), App.formatarPercentual(faturamento ? (f.total / faturamento) * 100 : 0)
      ]),
      direita: [1, 2, 3],
      vazio: 'Nenhuma venda faturada no período.'
    });

    /* ---------- NCM dos itens vendidos (só vendas faturadas) ----------
       Venda com nota: usa o NCM que foi na nota (itensFiscais).
       Sem nota: usa o NCM atual do produto (próprio ou da categoria). */
    const [produtos, notas] = await Promise.all([Data.listarProdutos(), Data.listarNotas()]);
    const produtoPorId = Object.fromEntries(produtos.map((p) => [p.id, p]));
    const notaPorId = Object.fromEntries(notas.map((n) => [n.id, n]));

    const itensVendidos = [];
    validas.forEach((v) => {
      const fator = v.subtotal ? v.total / v.subtotal : 1; // rateia o desconto entre os itens
      const nota = v.notaId ? notaPorId[v.notaId] : null;
      v.itens.forEach((it) => {
        // Só as peças que ficaram com o cliente (sem trocas/devoluções)
        const qtd = it.qtd - ((v.devolucao && (v.devolucao.itens.find((d) => d.sku === it.sku) || {}).qtd) || 0);
        if (qtd <= 0) return;
        const daNota = nota && nota.itensFiscais ? nota.itensFiscais.find((f) => f.sku === it.sku) : null;
        const produto = produtoPorId[it.produtoId];
        itensVendidos.push({
          venda: v,
          item: it,
          qtd,
          ncm: daNota ? daNota.ncm : produto ? produto.ncmEfetivo : '',
          categoria: produto ? produto.categoria : '-',
          valor: it.preco * qtd * fator
        });
      });
    });

    // Resumo por NCM (quem não tem NCM fica agrupado em "Sem NCM")
    const porNcm = {};
    itensVendidos.forEach((i) => {
      const chave = i.ncm || 'Sem NCM';
      const g = porNcm[chave] || (porNcm[chave] = { categorias: new Set(), pecas: 0, valor: 0 });
      g.categorias.add(i.categoria);
      g.pecas += i.qtd;
      g.valor += i.valor;
    });
    const resumoNcm = Object.entries(porNcm).sort((a, b) => (a[0] === 'Sem NCM') - (b[0] === 'Sem NCM') || b[1].valor - a[1].valor);
    const itensSemNcm = itensVendidos.filter((i) => !i.ncm).length;

    pdf.tabela({
      titulo: 'Resumo por NCM',
      nota: itensSemNcm
        ? `Vendas faturadas (sem as peças que voltaram em troca/devolução). ${itensSemNcm} item(ns) sem NCM: corrija no cadastro do produto ou em Configurações > Dados fiscais antes de emitir a nota.`
        : 'Vendas faturadas (sem as peças que voltaram em troca/devolução). Valores já com o desconto rateado entre os itens.',
      cabecalho: ['NCM', 'Categorias', 'Peças', 'Valor', '% do faturamento'],
      linhas: resumoNcm.map(([ncm, g]) => [ncm, [...g.categorias].join(', '), g.pecas, moeda(g.valor), App.formatarPercentual(faturamento ? (g.valor / faturamento) * 100 : 0)]),
      direita: [3, 4],
      centro: [2],
      larguras: { 0: 28 },
      corCelula: (linha, coluna) => (coluna === 0 && resumoNcm[linha][0] === 'Sem NCM' ? 'zerado' : null),
      vazio: 'Nenhuma venda faturada no período.',
      rodape: ['Total', '', itensVendidos.reduce((s, i) => s + i.qtd, 0), moeda(faturamento), '100%']
    });

    pdf.tabela({
      titulo: 'Itens vendidos',
      nota: 'NCM da nota fiscal quando ela já foi emitida; senão, o NCM atual do produto.',
      cabecalho: ['Venda', 'Data', 'Produto', 'Variação', 'NCM', 'Qtd.', 'Valor'],
      linhas: itensVendidos.map((i) => [
        `#${i.venda.numero}`, App.formatarData(i.venda.data), i.item.nome, `${i.item.tamanho} / ${i.item.cor}`,
        i.ncm || 'Sem NCM', i.qtd, moeda(i.valor)
      ]),
      direita: [6],
      centro: [5],
      larguras: { 0: 14, 1: 22, 4: 24, 5: 12, 6: 24 },
      corCelula: (linha, coluna) => (coluna === 4 && !itensVendidos[linha].ncm ? 'zerado' : null),
      vazio: 'Nenhuma venda faturada no período.'
    });

    // Trocas e devoluções com motivo
    const comDevolucao = vendas.filter((v) => v.devolucao);
    if (comDevolucao.length) {
      pdf.tabela({
        titulo: 'Trocas e devoluções',
        cabecalho: ['Venda', 'Data', 'Tipo', 'Peças', 'Motivo', 'Valor'],
        linhas: comDevolucao.map((v) => [
          `#${v.numero}`, App.formatarData(v.devolucao.data), v.devolucao.tipo === 'troca' ? 'Troca' : 'Devolução',
          v.devolucao.itens.reduce((s, i) => s + i.qtd, 0), v.devolucao.motivo || '-', moeda(v.devolucao.valor)
        ]),
        direita: [5],
        centro: [3]
      });
    }

    pdf.salvar(`vendas_${form.dataInicio.value || 'inicio'}_${form.dataFim.value || 'hoje'}.pdf`);
  });

  /* ---------- Inicialização ---------- */
  definirPeriodo('30');
  form.addEventListener('submit', (e) => e.preventDefault());
  form.busca.addEventListener('input', App.debounce(carregar, 250));
  form.querySelectorAll('input[type=date]').forEach((c) => c.addEventListener('change', carregar));
  document.querySelectorAll('[data-periodo]').forEach((b) => b.addEventListener('click', () => {
    definirPeriodo(b.dataset.periodo);
    if (b.dataset.periodo === 'personalizado') form.dataInicio.focus();
    else carregar();
  }));

  await carregar();

  // Abre direto o detalhe quando vem do dashboard (?venda=id)
  const idUrl = App.parametroUrl('venda');
  if (idUrl) abrirDetalhes(idUrl);
});
