/* ==========================================================================
   dashboard.js — Indicadores, gráfico dos últimos 7 dias, últimas vendas
   e alerta de estoque baixo
   ========================================================================== */
App.aoIniciar(async () => {
  const [usuario, resumo, porDia, vendas, estoqueBaixo] = await Promise.all([
    Data.usuarioAtual(),
    Data.obterResumoDashboard(),
    Data.obterVendasPorDia(7),
    Data.listarVendas(),
    Data.listarEstoqueBaixo()
  ]);

  // Relatórios são só do dono
  if (!App.pode('relatorios')) document.getElementById('btn-ver-relatorios').remove();

  /* ---------- Saudação ---------- */
  const hora = new Date().getHours();
  const periodo = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('saudacao').innerHTML = `${periodo}, <em>${App.escapeHtml(usuario.nome.split(' ')[0])}</em>.`;
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  document.getElementById('data-hoje').textContent = hoje.charAt(0).toUpperCase() + hoje.slice(1);

  /* ---------- Indicadores ---------- */
  document.getElementById('kpi-vendas-dia').textContent = App.formatarMoeda(resumo.totalHoje);
  document.getElementById('kpi-vendas-dia-det').textContent = `${resumo.vendasHoje} ${resumo.vendasHoje === 1 ? 'venda' : 'vendas'} hoje`;
  document.getElementById('kpi-fat-mes').textContent = App.formatarMoeda(resumo.faturamentoMes);
  document.getElementById('kpi-fat-mes-det').textContent = `${resumo.vendasMes} vendas no mês`;
  document.getElementById('kpi-ticket').textContent = App.formatarMoeda(resumo.ticketMedio);
  document.getElementById('kpi-estoque').textContent = App.formatarNumero(resumo.estoqueBaixo);

  /* ---------- Gráfico de vendas (7 dias) ---------- */
  const total7 = porDia.reduce((s, d) => s + d.total, 0);
  document.getElementById('total-7-dias').textContent = `Total: ${App.formatarMoeda(total7)}`;

  const destaque = App.corCss('--cor-destaque');
  new Chart(document.getElementById('grafico-vendas'), {
    type: 'bar',
    data: {
      labels: porDia.map((d) => {
        const dt = new Date(d.data + 'T12:00:00');
        return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }).replace('.', '');
      }),
      datasets: [{
        label: 'Vendas',
        data: porDia.map((d) => d.total),
        backgroundColor: porDia.map((_, i) => (i === porDia.length - 1 ? destaque : App.paletaGrafico(8)[5])),
        hoverBackgroundColor: porDia.map((_, i) => (i === porDia.length - 1 ? destaque : App.paletaGrafico(8)[3])),
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 44
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` ${App.formatarMoeda(ctx.raw)} · ${porDia[ctx.dataIndex].quantidade} venda(s)` } }
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, border: { display: false }, ticks: { callback: (v) => App.formatarMoeda(v).replace(',00', '') } }
      }
    }
  });

  /* ---------- Estoque baixo ---------- */
  const listaEstoque = document.getElementById('lista-estoque-baixo');
  if (!estoqueBaixo.length) {
    listaEstoque.innerHTML = `<li>${App.estadoVazio({ icone: 'package-check', titulo: 'Estoque em dia', texto: 'Nenhum produto abaixo do mínimo.' })}</li>`;
  } else {
    listaEstoque.innerHTML = estoqueBaixo.slice(0, 6).map((p) => `
      <li class="lista-item">
        ${App.thumb(p)}
        <div class="info">
          <div class="titulo">${App.escapeHtml(p.nome)}</div>
          <div class="sub">Mínimo: ${p.estoqueMinimo} un.</div>
        </div>
        <span class="badge ${p.estoqueTotal === 0 ? 'badge-perigo' : 'badge-alerta'}">${p.estoqueTotal} un.</span>
      </li>`).join('');
  }

  /* ---------- Últimas vendas ---------- */
  const corpo = document.getElementById('ultimas-vendas');
  if (!vendas.length) {
    corpo.innerHTML = `<tr><td colspan="6">${App.estadoVazio({ icone: 'shopping-bag', titulo: 'Nenhuma venda ainda', texto: 'As vendas do PDV aparecem aqui.' })}</td></tr>`;
  } else {
    corpo.innerHTML = vendas.slice(0, 6).map((v) => `
      <tr class="clicavel" data-id="${v.id}" tabindex="0" aria-label="Ver detalhes da venda ${v.numero}">
        <td class="cel-principal"><span class="negrito">#${v.numero}</span> <span class="texto-3 texto-xs">· ${v.qtdItens} ${v.qtdItens === 1 ? 'item' : 'itens'}</span></td>
        <td data-label="Data">${App.formatarDataHora(v.data)}</td>
        <td data-label="Cliente">${App.escapeHtml(v.clienteNome)}</td>
        <td data-label="Pagamento">${App.nomePagamento(v)}</td>
        <td data-label="Total" class="num negrito">${App.formatarMoeda(v.total)}</td>
        <td data-label="Status">${App.badgeStatus(v.status)}</td>
      </tr>`).join('');

    // Abre o detalhe na tela de vendas
    corpo.querySelectorAll('tr[data-id]').forEach((tr) => {
      const abrir = () => { location.href = `vendas.html?venda=${tr.dataset.id}`; };
      tr.addEventListener('click', abrir);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
    });
  }

  App.icones();
});
