/* ==========================================================================
   relatorios.js — Relatórios por período: totais,
   produtos mais vendidos, lucro e estoque parado. Exporta CSV.
   ========================================================================== */
App.aoIniciar(async () => {
  const inputInicio = document.getElementById('inicio');
  const inputFim = document.getElementById('fim');
  let relatorio = null;

  /* ---------- Atalhos de período ---------- */
  function aplicarPeriodo(chave) {
    const hoje = new Date();
    inputFim.value = App.dataInput(hoje);
    if (chave === 'hoje') inputInicio.value = App.dataInput(hoje);
    else if (chave === 'mes') inputInicio.value = App.dataInput(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    else inputInicio.value = App.diasAtras(Number(chave) - 1);
    marcarAtalho(chave);
    carregar();
  }
  function marcarAtalho(chave) {
    document.querySelectorAll('[data-periodo]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.periodo === chave)));
  }
  document.querySelectorAll('[data-periodo]').forEach((b) => b.addEventListener('click', () => aplicarPeriodo(b.dataset.periodo)));
  [inputInicio, inputFim].forEach((i) => i.addEventListener('change', () => { marcarAtalho(null); carregar(); }));

  /* ---------- Carregar ---------- */
  async function carregar() {
    if (inputInicio.value > inputFim.value) return App.toast('A data inicial deve ser anterior à final.', 'erro');
    relatorio = await Data.obterRelatorio({ dataInicio: inputInicio.value, dataFim: inputFim.value });
    document.getElementById('periodo-texto').textContent = `De ${App.formatarData(inputInicio.value)} até ${App.formatarData(inputFim.value)}`;
    desenharTotais();
    desenharTabelas();
    App.icones();
  }

  function desenharTotais() {
    const t = relatorio.totais;
    document.getElementById('r-faturamento').textContent = App.formatarMoeda(t.faturamento);
    document.getElementById('r-faturamento-det').textContent = `${App.formatarMoeda(t.descontos)} em descontos`;
    document.getElementById('r-lucro').textContent = App.formatarMoeda(t.lucro);
    document.getElementById('r-lucro-det').textContent = `Margem de ${App.formatarPercentual(t.margem)} · custo ${App.formatarMoeda(t.custo)}`;
    document.getElementById('r-vendas').textContent = App.formatarNumero(t.vendas);
    document.getElementById('r-vendas-det').textContent = `Ticket médio ${App.formatarMoeda(t.ticketMedio)}`;
    document.getElementById('r-pecas').textContent = App.formatarNumero(t.pecas);
    document.getElementById('r-pecas-det').textContent = t.vendas ? `${(t.pecas / t.vendas).toFixed(1).replace('.', ',')} peças por venda` : '—';
  }

  /* ---------- Tabelas ---------- */
  function desenharTabelas() {
    // Formas de pagamento
    const pag = relatorio.porPagamento || [];
    const totalPag = pag.reduce((t, p) => t + p.total, 0);
    document.getElementById('t-pagamento').innerHTML = pag.length ? pag.map((p) => `
      <tr>
        <td class="cel-principal">${App.escapeHtml(App.FORMAS_PAGAMENTO[p.forma] || p.forma)}</td>
        <td data-label="Valor" class="num negrito">${App.formatarMoeda(p.total)}</td>
        <td data-label="%" class="num">${App.formatarPercentual(totalPag ? (p.total / totalPag) * 100 : 0)}</td>
      </tr>`).join('')
      : `<tr><td colspan="3">${App.estadoVazio({ icone: 'wallet', titulo: 'Sem vendas no período' })}</td></tr>`;

    // Comissão por vendedor
    const vend = relatorio.porVendedor || [];
    const totalComissao = vend.reduce((s, v) => s + v.comissao, 0);
    document.getElementById('total-comissao').textContent = `${App.formatarMoeda(totalComissao)} em comissões`;
    document.getElementById('t-comissao').innerHTML = vend.length ? vend.map((v) => `
      <tr>
        <td class="cel-principal"><div class="produto-cel"><span class="avatar" style="width:30px;height:30px;font-size:12px">${App.escapeHtml(App.iniciais(v.nome))}</span><div><div class="titulo">${App.escapeHtml(v.nome)}</div><div class="sub">${v.perfil === 'dono' ? 'Dono(a)' : 'Vendedor(a)'}</div></div></div></td>
        <td data-label="Vendas" class="num">${v.vendas}</td>
        <td data-label="Faturamento" class="num">${App.formatarMoeda(v.faturamento)}</td>
        <td data-label="Ticket médio" class="num">${App.formatarMoeda(v.vendas ? v.faturamento / v.vendas : 0)}</td>
        <td data-label="Comissão (%)" class="num">${v.percentual ? String(v.percentual).replace('.', ',') + '%' : '—'}</td>
        <td data-label="Comissão (R$)" class="num negrito">${App.formatarMoeda(v.comissao)}</td>
      </tr>`).join('')
      : `<tr><td colspan="6">${App.estadoVazio({ icone: 'users', titulo: 'Sem vendas no período' })}</td></tr>`;

    const mais = relatorio.maisVendidos.slice(0, 8);
    document.getElementById('t-mais-vendidos').innerHTML = mais.length
      ? mais.map((p, i) => `
        <tr>
          <td class="cel-principal">
            <div class="produto-cel">
              <span class="avatar" style="width:28px;height:28px;font-size:12px">${i + 1}</span>
              <div><div class="titulo">${App.escapeHtml(p.nome)}</div><div class="sub">${App.escapeHtml(p.categoria)}</div></div>
            </div>
          </td>
          <td data-label="Qtd." class="num">${p.quantidade}</td>
          <td data-label="Faturamento" class="num negrito">${App.formatarMoeda(p.total)}</td>
          <td data-label="Lucro" class="num valor-positivo">${App.formatarMoeda(p.lucro)}</td>
        </tr>`).join('')
      : `<tr><td colspan="4">${App.estadoVazio({ icone: 'trending-up', titulo: 'Sem vendas no período', texto: 'Escolha um período maior.' })}</td></tr>`;

    const parado = relatorio.estoqueParado;
    const valorParado = parado.reduce((s, p) => s + p.valorParado, 0);
    document.getElementById('valor-parado').textContent = `${App.formatarMoeda(valorParado)} parados`;
    document.getElementById('valor-parado').classList.toggle('oculto', !parado.length);
    document.getElementById('t-parado').innerHTML = parado.length
      ? parado.map((p) => `
        <tr>
          <td class="cel-principal negrito">${App.escapeHtml(p.nome)}</td>
          <td data-label="Categoria"><span class="tag">${App.escapeHtml(p.categoria)}</span></td>
          <td data-label="Estoque" class="num">${p.estoque} un.</td>
          <td data-label="Valor parado" class="num negrito">${App.formatarMoeda(p.valorParado)}</td>
          <td data-label="Última venda">${p.ultimaVenda ? App.formatarData(p.ultimaVenda) : '<span class="texto-3">Nunca vendido</span>'}</td>
        </tr>`).join('')
      : `<tr><td colspan="5">${App.estadoVazio({ icone: 'package-check', titulo: 'Nenhum estoque parado', texto: 'Todos os produtos com estoque tiveram venda no período.' })}</td></tr>`;
  }

  /* ---------- Exportar CSV (abre no Excel em pt-BR) ---------- */
  document.getElementById('btn-csv').addEventListener('click', () => {
    if (!relatorio) return;
    const num = (v) => (Number(v) || 0).toFixed(2).replace('.', ',');
    const linhas = [
      ['Relatório de vendas', `${App.formatarData(inputInicio.value)} a ${App.formatarData(inputFim.value)}`],
      [],
      ['Faturamento', num(relatorio.totais.faturamento)],
      ['Custo', num(relatorio.totais.custo)],
      ['Lucro bruto', num(relatorio.totais.lucro)],
      ['Vendas', relatorio.totais.vendas],
      ['Ticket médio', num(relatorio.totais.ticketMedio)],
      [],
      ['Data', 'Faturamento', 'Lucro', 'Vendas'],
      ...relatorio.porDia.map((d) => [App.formatarData(d.data), num(d.total), num(d.lucro), d.quantidade]),
      [],
      ['Produto', 'Categoria', 'Quantidade', 'Faturamento', 'Lucro'],
      ...relatorio.maisVendidos.map((p) => [p.nome, p.categoria, p.quantidade, num(p.total), num(p.lucro)])
    ];
    const csv = '﻿' + linhas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `relatorio_${inputInicio.value}_${inputFim.value}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    App.toast('Relatório exportado.');
  });

  /* ==================================================================
     EXPORTAR PDF — usa o módulo compartilhado js/pdf.js
     ================================================================== */
  Pdf.ligarBotao(document.getElementById('btn-pdf'), async () => {
    if (!relatorio) return;
    const t = relatorio.totais;
    const moeda = Pdf.moeda;
    const pdf = await Pdf.criar({ titulo: 'Relatório de vendas', periodo: Pdf.descreverPeriodo(inputInicio.value, inputFim.value) });

    pdf.indicadores([
      ['Faturamento', moeda(t.faturamento), `${moeda(t.descontos)} em descontos`],
      ['Lucro bruto', moeda(t.lucro), `Margem ${App.formatarPercentual(t.margem)}`],
      ['Vendas', App.formatarNumero(t.vendas), `Ticket médio ${moeda(t.ticketMedio)}`],
      ['Peças vendidas', App.formatarNumero(t.pecas), `Custo ${moeda(t.custo)}`]
    ]);

    const pagPdf = relatorio.porPagamento || [];
    const totalPagPdf = pagPdf.reduce((s2, p) => s2 + p.total, 0);
    pdf.tabela({
      titulo: 'Formas de pagamento',
      cabecalho: ['Forma', 'Valor', '%'],
      linhas: pagPdf.map((p) => [App.FORMAS_PAGAMENTO[p.forma] || p.forma, moeda(p.total), App.formatarPercentual(totalPagPdf ? (p.total / totalPagPdf) * 100 : 0)]),
      direita: [1, 2],
      vazio: 'Sem vendas no período.',
      rodape: ['Total', moeda(totalPagPdf), pagPdf.length ? '100%' : '']
    });

    /* ---------- NCM (atual do cadastro: ncmEfetivo/ncmOrigem vêm de data.js) ---------- */
    const produtos = await Data.listarProdutos();
    const produtoPorId = Object.fromEntries(produtos.map((p) => [p.id, p]));
    const infoNcm = (id) => {
      const p = produtoPorId[id];
      return p ? { ncm: p.ncmEfetivo, origem: p.ncmOrigem } : { ncm: '', origem: 'sem' };
    };
    // "6109.10.00" próprio · "6109.10.00*" da categoria · "Sem NCM"
    const textoNcm = (id) => {
      const { ncm, origem } = infoNcm(id);
      return origem === 'proprio' ? ncm : origem === 'categoria' ? `${ncm}*` : 'Sem NCM';
    };
    const legendaNcm = 'NCM atual do cadastro; com * = padrão da categoria (Configurações > Dados fiscais).';

    // Faturamento por NCM (a partir dos produtos vendidos, já com desconto rateado)
    const porNcm = {};
    relatorio.maisVendidos.forEach((p) => {
      const chave = infoNcm(p.produtoId).ncm || 'Sem NCM';
      const g = porNcm[chave] || (porNcm[chave] = { categorias: new Set(), pecas: 0, total: 0, lucro: 0 });
      g.categorias.add(p.categoria);
      g.pecas += p.quantidade;
      g.total += p.total;
      g.lucro += p.lucro;
    });
    const resumoNcm = Object.entries(porNcm).sort((a, b) => (a[0] === 'Sem NCM') - (b[0] === 'Sem NCM') || b[1].total - a[1].total);
    const vendidosSemNcm = relatorio.maisVendidos.filter((p) => !infoNcm(p.produtoId).ncm).length;

    pdf.tabela({
      titulo: 'Faturamento por NCM',
      nota: `NCM atual do cadastro de cada produto; valores com o desconto rateado entre os itens.${vendidosSemNcm ? ` ${vendidosSemNcm} produto(s) vendido(s) sem NCM: corrija antes de emitir a nota.` : ''}`,
      cabecalho: ['NCM', 'Categorias', 'Peças', 'Faturamento', 'Lucro', '% do faturamento'],
      linhas: resumoNcm.map(([ncm, g]) => [ncm, [...g.categorias].join(', '), g.pecas, moeda(g.total), moeda(g.lucro), App.formatarPercentual(t.faturamento ? (g.total / t.faturamento) * 100 : 0)]),
      direita: [3, 4, 5],
      centro: [2],
      larguras: { 0: 26 },
      corCelula: (linha, coluna) => (coluna === 0 && resumoNcm[linha][0] === 'Sem NCM' ? 'zerado' : null),
      vazio: 'Sem vendas no período.',
      rodape: ['Total', '', t.pecas, moeda(t.faturamento), moeda(t.lucro), '100%']
    });

    pdf.tabela({
      titulo: 'Produtos mais vendidos',
      nota: legendaNcm,
      cabecalho: ['#', 'Produto', 'Categoria', 'NCM', 'Qtd.', 'Faturamento', 'Lucro'],
      linhas: relatorio.maisVendidos.map((p, i) => [i + 1, p.nome, p.categoria, textoNcm(p.produtoId), p.quantidade, moeda(p.total), moeda(p.lucro)]),
      direita: [4, 5, 6],
      larguras: { 0: 8, 3: 24 },
      corCelula: (linha, coluna) => (coluna === 3 && !infoNcm(relatorio.maisVendidos[linha].produtoId).ncm ? 'zerado' : null)
    });
    const vend = relatorio.porVendedor || [];
    pdf.tabela({
      titulo: 'Comissão por vendedor',
      nota: 'Sobre o faturamento líquido do período (sem trocas, devoluções e cancelamentos).',
      cabecalho: ['Vendedor(a)', 'Vendas', 'Faturamento', 'Comissão (%)', 'Comissão (R$)'],
      linhas: vend.map((v) => [v.nome, v.vendas, moeda(v.faturamento), v.percentual ? `${String(v.percentual).replace('.', ',')}%` : '-', moeda(v.comissao)]),
      direita: [1, 2, 3, 4],
      vazio: 'Sem vendas no período.',
      rodape: ['Total', vend.reduce((s, v) => s + v.vendas, 0), moeda(vend.reduce((s, v) => s + v.faturamento, 0)), '', moeda(vend.reduce((s, v) => s + v.comissao, 0))]
    });

    pdf.tabela({
      titulo: 'Estoque parado (sem vendas no período)',
      nota: relatorio.estoqueParado.length ? legendaNcm : '',
      cabecalho: ['Produto', 'Categoria', 'NCM', 'Estoque', 'Valor parado (custo)', 'Última venda'],
      linhas: relatorio.estoqueParado.map((p) => [p.nome, p.categoria, textoNcm(p.produtoId), `${p.estoque} un.`, moeda(p.valorParado), p.ultimaVenda ? App.formatarData(p.ultimaVenda) : 'Nunca vendido']),
      direita: [3, 4],
      larguras: { 2: 24 },
      corCelula: (linha, coluna) => (coluna === 2 && !infoNcm(relatorio.estoqueParado[linha].produtoId).ncm ? 'zerado' : null),
      vazio: 'Nenhum estoque parado no período.'
    });
    pdf.tabela({
      titulo: 'Vendas por dia',
      cabecalho: ['Data', 'Vendas', 'Faturamento', 'Lucro'],
      linhas: relatorio.porDia.filter((d) => d.quantidade > 0).map((d) => [App.formatarData(d.data), d.quantidade, moeda(d.total), moeda(d.lucro)]),
      direita: [1, 2, 3]
    });

    pdf.salvar(`relatorio_${inputInicio.value}_${inputFim.value}.pdf`);
  });

  aplicarPeriodo('30');
});
