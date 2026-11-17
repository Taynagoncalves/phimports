/* ==========================================================================
   relatorios.js — Relatórios por período: totais, gráficos (Chart.js),
   produtos mais vendidos, lucro e estoque parado. Exporta CSV.
   ========================================================================== */
App.aoIniciar(async () => {
  const inputInicio = document.getElementById('inicio');
  const inputFim = document.getElementById('fim');
  const graficos = {};
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
    desenharGraficos();
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

  /* ---------- Gráficos ---------- */
  // Cada gráfico guarda a "fábrica" da sua configuração para poder ser
  // redesenhado em tamanho fixo na exportação para PDF.
  const fabricas = {};
  function recriar(id, fabrica) {
    fabricas[id] = fabrica;
    if (graficos[id]) graficos[id].destroy();
    graficos[id] = new Chart(document.getElementById(id), fabrica());
  }

  /**
   * Desenha o gráfico num canvas fora da tela, com tamanho fixo e sem
   * animação, e devolve a imagem PNG (independe do tamanho da tela).
   */
  function imagemDoGrafico(id, larguraPx, alturaPx) {
    const area = document.createElement('div');
    area.style.cssText = `position:fixed;left:-10000px;top:0;width:${larguraPx}px;height:${alturaPx}px`;
    const canvas = document.createElement('canvas');
    canvas.width = larguraPx;
    canvas.height = alturaPx;
    area.appendChild(canvas);
    document.body.appendChild(area);
    const config = fabricas[id]();
    config.options = { ...config.options, responsive: false, animation: false, devicePixelRatio: 2 };
    const grafico = new Chart(canvas, config);
    const imagem = grafico.toBase64Image('image/png', 1);
    grafico.destroy();
    area.remove();
    return imagem;
  }

  function desenharGraficos() {
    const destaque = App.corCss('--cor-destaque');
    const sucesso = App.corCss('--cor-sucesso');
    const moeda = (v) => App.formatarMoeda(v).replace(',00', '');

    // Linha: faturamento x lucro por dia
    const dias = relatorio.porDia;
    recriar('g-periodo', () => ({
      type: 'line',
      data: {
        labels: dias.map((d) => App.formatarData(d.data).slice(0, 5)),
        datasets: [
          { label: 'Faturamento', data: dias.map((d) => d.total), borderColor: destaque, backgroundColor: App.paletaGrafico(6)[5], fill: true, tension: 0.35, pointRadius: dias.length > 31 ? 0 : 3, borderWidth: 2 },
          { label: 'Lucro', data: dias.map((d) => d.lucro), borderColor: sucesso, backgroundColor: 'transparent', tension: 0.35, pointRadius: dias.length > 31 ? 0 : 3, borderWidth: 2, borderDash: [5, 4] }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', align: 'end' }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${App.formatarMoeda(c.raw)}` } } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
          y: { beginAtZero: true, border: { display: false }, ticks: { callback: moeda } }
        }
      }
    }));

    // Rosca: por categoria
    const cats = relatorio.porCategoria;
    recriar('g-categoria', () => ({
      type: 'doughnut',
      data: {
        labels: cats.length ? cats.map((c) => c.categoria) : ['Sem vendas'],
        datasets: [{ data: cats.length ? cats.map((c) => c.total) : [1], backgroundColor: cats.length ? App.paletaGrafico(cats.length) : [App.corCss('--cor-borda')], borderWidth: 3, borderColor: App.corCss('--cor-superficie') }]
      },
      options: {
        cutout: '64%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { enabled: cats.length > 0, callbacks: { label: (c) => ` ${c.label}: ${App.formatarMoeda(c.raw)}` } }
        }
      }
    }));

    // Barras horizontais: formas de pagamento
    const pag = relatorio.porPagamento;
    recriar('g-pagamento', () => ({
      type: 'bar',
      data: {
        labels: pag.map((p) => App.FORMAS_PAGAMENTO[p.forma] || p.forma),
        datasets: [{ data: pag.map((p) => p.total), backgroundColor: App.paletaGrafico(pag.length), borderRadius: 6, maxBarThickness: 28 }]
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${App.formatarMoeda(c.raw)}` } } },
        scales: { x: { beginAtZero: true, border: { display: false }, ticks: { callback: moeda } }, y: { grid: { display: false } } }
      }
    }));
  }

  /* ---------- Tabelas ---------- */
  function desenharTabelas() {
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

    // Gráficos redesenhados em tamanho fixo (5 px por mm)
    const grafico = (id) => (w, h) => (fabricas[id] ? imagemDoGrafico(id, Math.round(w * 5), Math.round(h * 5)) : null);
    pdf.imagens([{ titulo: 'Vendas por período (faturamento x lucro)', imagem: grafico('g-periodo') }], 62);
    pdf.imagens([
      { titulo: 'Por categoria', imagem: grafico('g-categoria') },
      { titulo: 'Formas de pagamento', imagem: grafico('g-pagamento') }
    ], 58);

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
