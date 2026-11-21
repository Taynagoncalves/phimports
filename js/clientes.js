/* ==========================================================================
   clientes.js — Configuração da tela de clientes (usa cadastro.js)
   Indicadores, grupos (crediário, vale, sumidos), ordenação e ficha do cliente.
   ========================================================================== */
(function () {
  const DIAS_SUMIDO = 60;
  const r$ = (n) => App.formatarMoeda(n || 0);
  const dados = (c, extra) => extra[c.id] || {};
  const diasDesde = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

  /** "hoje", "ontem", "há 5 dias", "há 2 meses" */
  function haQuanto(iso) {
    const d = diasDesde(iso);
    if (d === null) return '';
    if (d <= 0) return 'hoje';
    if (d === 1) return 'ontem';
    if (d < 30) return `há ${d} dias`;
    const m = Math.floor(d / 30);
    return m < 12 ? `há ${m} ${m === 1 ? 'mês' : 'meses'}` : `há ${Math.floor(m / 12)} ano(s)`;
  }
  const linkWhatsApp = (tel, texto = '') => `https://wa.me/55${String(tel).replace(/\D/g, '')}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;

  /** Ficha do cliente: resumo, crediário, vale e últimas compras */
  async function abrirFicha(c, extra, { editar }) {
    const r = dados(c, extra);
    const vendas = (await Data.listarVendas()).filter((v) => v.clienteId === c.id);
    const ticket = r.compras ? r.total / r.compras : 0;
    const loja = await Data.obterLoja();
    const regrasPontos = await Data.obterRegrasVenda();
    const { fechar } = App.abrirModal({
      titulo: 'Ficha do cliente',
      tamanho: 'lg',
      corpo: `
        <div class="ficha-topo">
          <div class="avatar ficha-avatar">${App.escapeHtml(App.iniciais(c.nome))}</div>
          <div style="min-width:0;flex:1">
            <h3 class="ficha-nome">${App.escapeHtml(c.nome)}</h3>
            <div class="ficha-contatos">
              ${c.documento ? `<span><i data-lucide="id-card"></i><span class="mono">${App.escapeHtml(c.documento)}</span></span>` : ''}
              ${c.telefone ? `<span><i data-lucide="phone"></i>${App.escapeHtml(c.telefone)}</span>` : ''}
              ${c.email ? `<span><i data-lucide="mail"></i>${App.escapeHtml(c.email)}</span>` : ''}
              ${c.endereco ? `<span><i data-lucide="map-pin"></i>${App.escapeHtml(c.endereco)}</span>` : ''}
            </div>
          </div>
        </div>

        ${(c.pontosSaldo || 0) > 0 ? `<div class="alerta info mt-3"><i data-lucide="sparkles"></i><span>Fidelidade: <strong>${App.formatarNumero(c.pontosSaldo)} pontos</strong> · equivalente a ${r$(c.pontosSaldo * Number(regrasPontos.valorPorPonto || 0))} em descontos</span></div>` : ''}

        <div class="ficha-numeros">
          <div><span>Total comprado</span><strong>${r$(r.total)}</strong></div>
          <div><span>Compras</span><strong>${r.compras || 0}</strong></div>
          <div><span>Ticket médio</span><strong>${r$(ticket)}</strong></div>
          <div><span>Última compra</span><strong>${r.ultimaCompra ? haQuanto(r.ultimaCompra) : '—'}</strong></div>
        </div>

        ${(r.limiteCredito || r.crediarioAberto || r.credito) ? `
        <div class="ficha-saldos">
          ${(r.limiteCredito || r.crediarioAberto) ? `
          <div class="ficha-saldo ${r.crediarioVencido > 0 ? 'perigo' : ''}">
            <i data-lucide="calendar-clock"></i>
            <div><span>Crediário</span>
              <strong>${r$(r.crediarioAberto)} em aberto</strong>
              <small>${r.crediarioVencido > 0 ? `${r$(r.crediarioVencido)} vencido · ` : ''}limite ${r$(r.limiteCredito)} · disponível ${r$(Math.max(0, (r.limiteCredito || 0) - (r.crediarioAberto || 0)))}</small>
            </div>
          </div>` : ''}
          ${r.credito > 0 ? `
          <div class="ficha-saldo info">
            <i data-lucide="ticket"></i>
            <div><span>Vale-troca</span><strong>${r$(r.credito)} de saldo</strong><small>Use na Frente de caixa, em "Vale".</small></div>
          </div>` : ''}
        </div>` : ''}

        <h4 class="mt-6 mb-4" style="font-size:var(--fs-sm);color:var(--cor-texto)">Últimas compras</h4>
        ${vendas.length ? `<ul class="lista ficha-compras">${vendas.slice(0, 6).map((v) => `
          <li class="lista-item">
            <div class="info">
              <div class="titulo"><a href="vendas.html?venda=${v.id}">#${v.numero}</a> · ${App.formatarData(v.data)}</div>
              <div class="sub">${v.itens.map((i) => `${i.qtd}× ${App.escapeHtml(i.nome)} (${App.escapeHtml(i.tamanho)})`).join(', ')}</div>
            </div>
            ${v.status !== 'concluida' ? App.badgeStatus(v.status) : ''}
            <span class="valor">${r$(v.total)}</span>
          </li>`).join('')}</ul>${vendas.length > 6 ? `<p class="texto-xs texto-3 mt-2">e mais ${vendas.length - 6} compra(s).</p>` : ''}`
          : '<p class="texto-sm texto-3">Este cliente ainda não comprou na loja.</p>'}`,
      acoes: [
        ...(c.telefone ? [{ texto: 'WhatsApp', icone: 'message-circle', aoClicar: () => window.open(linkWhatsApp(c.telefone, `Olá, ${c.nome.split(' ')[0]}! Aqui é da ${loja.nome}.`), '_blank', 'noopener') }] : []),
        { texto: 'Editar cadastro', icone: 'pencil', aoClicar: () => { fechar(); editar(); } },
        { texto: 'Nova venda', classe: 'btn-primario', icone: 'shopping-bag', aoClicar: () => { location.href = 'pdv.html'; } }
      ]
    });
  }

  Cadastro.iniciar({
    singular: 'Cliente',
    plural: 'Clientes',
    icone: 'users',
    listar: Data.listarClientes,
    salvar: Data.salvarCliente,
    excluir: Data.excluirCliente,
    acaoExcluir: 'excluir-cliente', // só o dono exclui

    // Limite para vender no crediário (0 = não vende a prazo). Só o dono altera.
    camposExtras: [
      { nome: 'limiteCredito', rotulo: 'Limite de crédito no crediário (R$)', tipo: 'number', placeholder: '0 = não compra a prazo', soDono: true }
    ],

    // Total comprado, crediário e vale por cliente (calculado em data.js)
    carregarExtra: Data.resumoClientes,

    indicadores: (todos, extra) => {
      const ativos = todos.filter((c) => { const d = diasDesde(dados(c, extra).ultimaCompra); return d !== null && d <= 30; }).length;
      const aberto = todos.reduce((s, c) => s + (dados(c, extra).crediarioAberto || 0), 0);
      const vencido = todos.reduce((s, c) => s + (dados(c, extra).crediarioVencido || 0), 0);
      const vales = todos.reduce((s, c) => s + (dados(c, extra).credito || 0), 0);
      const card = (rotulo, icone, valor, detalhe, alerta) => `
        <article class="card stat ${alerta ? 'stat-alerta' : ''}">
          <div class="stat-topo"><span class="stat-rotulo">${rotulo}</span><span class="stat-icone"><i data-lucide="${icone}"></i></span></div>
          <div class="stat-valor">${valor}</div>
          <div class="stat-detalhe">${detalhe}</div>
        </article>`;
      return card('Clientes', 'users', App.formatarNumero(todos.length), 'cadastrados na loja')
        + card('Ativos', 'activity', App.formatarNumero(ativos), 'compraram nos últimos 30 dias')
        + card('Crediário em aberto', 'calendar-clock', r$(aberto), vencido > 0 ? `${r$(vencido)} vencido` : 'nada vencido', vencido > 0)
        + card('Vales-troca', 'ticket', r$(vales), 'saldo a usar nas próximas compras');
    },

    segmentos: [
      { id: 'vencido', rotulo: 'Crediário vencido', ponto: 'perigo', filtro: (c, e) => (dados(c, e).crediarioVencido || 0) > 0 },
      { id: 'crediario', rotulo: 'Crediário em aberto', ponto: 'alerta', filtro: (c, e) => (dados(c, e).crediarioAberto || 0) > 0 },
      { id: 'vale', rotulo: 'Com vale-troca', filtro: (c, e) => (dados(c, e).credito || 0) > 0 },
      { id: 'sumidos', rotulo: `Sumidos (${DIAS_SUMIDO}+ dias)`, filtro: (c, e) => { const d = diasDesde(dados(c, e).ultimaCompra); return d !== null && d >= DIAS_SUMIDO; } },
      { id: 'nunca', rotulo: 'Nunca compraram', filtro: (c, e) => !dados(c, e).compras }
    ],

    ordenacoes: [
      { id: 'nome', rotulo: 'Nome (A–Z)', comparar: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR') },
      { id: 'recente', rotulo: 'Compra mais recente', comparar: (a, b, e) => String(dados(b, e).ultimaCompra || '').localeCompare(String(dados(a, e).ultimaCompra || '')) },
      { id: 'total', rotulo: 'Quem mais comprou', comparar: (a, b, e) => (dados(b, e).total || 0) - (dados(a, e).total || 0) },
      { id: 'devendo', rotulo: 'Maior valor em aberto', comparar: (a, b, e) => (dados(b, e).crediarioAberto || 0) - (dados(a, e).crediarioAberto || 0) }
    ],

    subtitulo: (c) => [c.documento ? `<span class="mono">${App.escapeHtml(c.documento)}</span>` : '', App.escapeHtml(c.email || '')].filter(Boolean).join(' · ') || 'Sem documento',

    acoesExtras: (c) => (c.telefone
      ? `<a href="${linkWhatsApp(c.telefone)}" target="_blank" rel="noopener" class="btn-icone" aria-label="WhatsApp de ${App.escapeHtml(c.nome)}" title="Conversar no WhatsApp"><i data-lucide="message-circle"></i></a>`
      : ''),

    aoAbrir: abrirFicha,

    colunas: [
      { titulo: 'Telefone', render: (c) => (c.telefone ? `<span class="nowrap">${App.escapeHtml(c.telefone)}</span>` : '<span class="texto-3">—</span>') },
      { titulo: 'Compras', classe: 'num', render: (c, extra) => {
        const r = dados(c, extra);
        return r.compras
          ? `<div class="negrito">${r$(r.total)}</div><div class="texto-xs texto-3">${r.compras} compra${r.compras > 1 ? 's' : ''} · ticket ${r$(r.total / r.compras)}</div>`
          : '<span class="texto-3">—</span>';
      } },
      { titulo: 'Última compra', render: (c, extra) => {
        const u = dados(c, extra).ultimaCompra;
        if (!u) return '<span class="texto-3">Nunca comprou</span>';
        const sumido = diasDesde(u) >= DIAS_SUMIDO;
        return `<div class="${sumido ? 'texto-perigo' : ''}">${haQuanto(u)}</div><div class="texto-xs texto-3">${App.formatarData(u)}</div>`;
      } },
      // Crediário: quanto deve (vencido em vermelho) e o limite
      { titulo: 'Crediário', classe: 'num', render: (c, extra) => {
        const r = dados(c, extra);
        if (!r.crediarioAberto && !r.limiteCredito) return '<span class="texto-3">—</span>';
        return `${r.crediarioVencido > 0
          ? `<span class="badge badge-perigo" title="Parcelas vencidas">${r$(r.crediarioVencido)} vencido</span>`
          : `<span class="negrito">${r$(r.crediarioAberto)}</span>`}
          <div class="texto-xs texto-3">limite ${r$(r.limiteCredito)}</div>`;
      } },
      // Saldo de vale-troca (crédito de trocas), usado no PDV em "Vale"
      { titulo: 'Vale-troca', classe: 'num', render: (c, extra) => (dados(c, extra).credito > 0
        ? `<span class="badge badge-info" title="Saldo de vale-troca disponível">${r$(dados(c, extra).credito)}</span>`
        : '<span class="texto-3">—</span>') }
    ]
  });
})();
