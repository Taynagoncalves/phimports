/* ==========================================================================
   app.js — Casca da aplicação (menu, topbar), navegação e utilidades
   Componentes JS reutilizáveis: toast, modal, confirmação, paginação,
   estado vazio, badges, máscaras e formatadores pt-BR.

   Cada página registra sua inicialização com App.aoIniciar(async () => {...})
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- App instalável (pages/sw.js + pages/app.webmanifest) ---------- */
  let pedidoInstalacao = null;   // evento do navegador para mostrar "Instalar app"
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    const pastaPages = location.pathname.includes('/pages/') ? '' : 'pages/';
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(pastaPages + 'sw.js', { scope: pastaPages || './' }).catch((e) => console.warn('App offline:', e));
    });
  }
  const appInstalado = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  function atualizarBotaoInstalar() {
    document.querySelectorAll('[data-instalar-app]').forEach((b) => { b.hidden = !pedidoInstalacao; });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();          // mostramos o nosso botão em vez do aviso do navegador
    pedidoInstalacao = e;
    atualizarBotaoInstalar();
  });
  window.addEventListener('appinstalled', () => { pedidoInstalacao = null; atualizarBotaoInstalar(); toast('App instalado! Abra pelo ícone "PH Imports".', 'sucesso'); });
  async function instalarApp() {
    if (!pedidoInstalacao) return false;
    pedidoInstalacao.prompt();
    const { outcome } = await pedidoInstalacao.userChoice;
    pedidoInstalacao = null;
    atualizarBotaoInstalar();
    return outcome === 'accepted';
  }

  /* ---------- Itens do menu (grupo → links) ---------- */
  // Grupo sem título = sem cabeçalho (uso diário no topo, Configurações no fim).
  // Inventário e Reposição abrem pela tela Estoque; Aparência e Impressão pelas abas de Configurações.
  const MENU = [
    { grupo: '', itens: [
      { id: 'pdv', texto: 'Frente de caixa', icone: 'scan-barcode', href: 'pdv.html' },
      { id: 'pedidos', texto: 'Pedidos online', icone: 'shopping-basket', href: 'pedidos.html' },
      { id: 'caixa', texto: 'Caixa', icone: 'wallet', href: 'caixa.html' },
      { id: 'trocas', texto: 'Trocas', icone: 'repeat', href: 'trocas.html' },
      { id: 'notas', texto: 'Notas fiscais', icone: 'file-text', href: 'notas.html' }
    ] },
    { grupo: 'Produtos', itens: [
      { id: 'produtos', texto: 'Produtos', icone: 'shirt', href: 'produtos.html' },
      { id: 'estoque', texto: 'Estoque', icone: 'package', href: 'estoque.html' },
      { id: 'etiquetas', texto: 'Etiquetas', icone: 'tag', href: 'etiquetas.html' }
    ] },
    { grupo: 'Clientes', sempreFechado: true, itens: [
      { id: 'clientes', texto: 'Clientes', icone: 'users', href: 'clientes.html' },
      { id: 'pontos', texto: 'Programa de pontos', icone: 'star', href: 'pontos.html' },
      { id: 'promocoes', texto: 'Promoções', icone: 'badge-percent', href: 'promocoes.html' }
    ] },
    { grupo: '', itens: [
      { id: 'mensalidade', texto: 'Mensalidade', icone: 'badge-dollar-sign', href: 'mensalidade.html' }
    ] },
    { grupo: 'Gestão', itens: [
      { id: 'vendas', texto: 'Vendas', icone: 'shopping-bag', href: 'vendas.html' },
      { id: 'financeiro', texto: 'Financeiro', icone: 'landmark', href: 'financeiro.html' },
      { id: 'relatorios', texto: 'Relatórios', icone: 'trending-up', href: 'relatorios.html' },
      { id: 'fornecedores', texto: 'Fornecedores', icone: 'truck', href: 'fornecedores.html' }
    ] },
    { grupo: '', itens: [
      { id: 'configuracoes', texto: 'Configurações', icone: 'settings', href: 'configuracoes.html' }
    ] }
  ];

  /* ---------- Permissões por perfil ----------
     Dono: tudo. Vendedor: vender, operar o caixa, trocas, clientes e consultas.
     As mesmas regras são conferidas em data.js (e, no Firebase, nas Security Rules). */
  const PAGINAS_VENDEDOR = ['dashboard', 'pdv', 'pedidos', 'caixa', 'vendas', 'trocas', 'notas', 'produtos', 'estoque', 'etiquetas', 'clientes'];
  const ACOES_DONO = [
    'gerenciar-produtos',   // cadastrar, editar, excluir produtos
    'movimentar-estoque',   // entrada, ajuste, saída, entrada de nota em lote
    'ver-custos',           // custo, valor do estoque, lucro
    'cancelar-venda',
    'cancelar-nota',
    'excluir-cliente',
    'relatorios',
    'configuracoes'
  ];
  let usuarioAtualCache = null;

  /** O usuário logado pode fazer esta ação? (ver ACOES_DONO) */
  function pode(acao) {
    if (!usuarioAtualCache) return false;
    return usuarioAtualCache.perfil === 'dono' || !ACOES_DONO.includes(acao);
  }
  /** O usuário logado pode abrir esta página? (id = data-pagina) */
  function podeAcessar(pagina) {
    if (!usuarioAtualCache) return false;
    return usuarioAtualCache.perfil === 'dono' || PAGINAS_VENDEDOR.includes(pagina);
  }

  const inicializadores = [];
  let coresCache = [];

  /* ==================================================================
     FORMATADORES (padrão brasileiro)
     ================================================================== */
  const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtNumero = new Intl.NumberFormat('pt-BR');
  const fmtPercentual = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const formatarMoeda = (v) => fmtMoeda.format(Number(v) || 0);
  const formatarNumero = (v) => fmtNumero.format(Number(v) || 0);
  const formatarPercentual = (v) => fmtPercentual.format(Number(v) || 0) + '%';

  /** dd/mm/aaaa */
  function formatarData(iso) {
    if (!iso) return '—';
    const d = iso.length === 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  /** dd/mm/aaaa às hh:mm */
  function formatarDataHora(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${formatarData(iso)} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  /** AAAA-MM-DD (para inputs type=date) */
  function dataInput(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function diasAtras(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return dataInput(d);
  }

  /** Converte "1.234,56" ou "1234.56" em número */
  function lerNumero(texto) {
    if (typeof texto === 'number') return texto;
    const t = String(texto || '').trim();
    if (!t) return 0;
    const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
    return Number(n.replace(/[^\d.-]/g, '')) || 0;
  }

  /** Evita injeção de HTML ao montar templates */
  function escapeHtml(t) {
    return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function iniciais(nome) {
    return String(nome || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }

  function debounce(fn, ms = 250) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function parametroUrl(nome) {
    return new URLSearchParams(location.search).get(nome);
  }

  /* ==================================================================
     ÍCONES (Lucide)
     ================================================================== */
  function icones() {
    if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons, attrs: { 'aria-hidden': 'true' } });
  }
  const icone = (nome) => `<i data-lucide="${nome}"></i>`;

  /* ==================================================================
     STATUS, PAGAMENTO, CORES
     ================================================================== */
  const STATUS = {
    concluida: ['Concluída', 'sucesso'],
    devolvida: ['Devolvida', 'perigo'],
    trocada: ['Trocada', 'info'],
    cancelada: ['Cancelada', 'perigo'],
    autorizada: ['Autorizada', 'sucesso'],
    pendente: ['Pendente', 'alerta'],
    entrada: ['Entrada', 'sucesso'],
    saida: ['Saída', 'perigo'],
    ajuste: ['Ajuste', 'alerta'],
    ativo: ['Ativo', 'sucesso'],
    inativo: ['Inativo', ''],
    aberto: ['Aberto', 'sucesso'],
    avencer: ['A vencer', 'info'],
    vencido: ['Vencido', 'perigo'],
    pago: ['Pago', 'sucesso'],
    ativa: ['Ativa', 'sucesso'],
    agendada: ['Agendada', 'info'],
    encerrada: ['Encerrada', ''],
    inativa: ['Pausada', 'alerta'],
    fechado: ['Fechado', '']
  };
  function badgeStatus(status) {
    const [texto, tipo] = STATUS[status] || [status, ''];
    return `<span class="badge ${tipo ? 'badge-' + tipo : ''}">${escapeHtml(texto)}</span>`;
  }

  const FORMAS_PAGAMENTO = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Cartão de débito', credito: 'Cartão de crédito', vale: 'Vale-troca', crediario: 'Crediário', pontos: 'Pontos de fidelidade', multiplo: 'Múltiplas formas' };
  const FORMAS_CURTAS = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', vale: 'Vale-troca', crediario: 'Crediário', pontos: 'Pontos' };

  /**
   * Nome do pagamento. Aceita a venda (com pagamentos divididos) ou um pagamento.
   * Ex.: "Pix + Crédito (3x)" · "Cartão de débito"
   */
  function nomePagamento(vendaOuPagamento) {
    if (!vendaOuPagamento) return '—';
    const lista = vendaOuPagamento.pagamentos;
    if (lista && lista.length > 1) {
      return lista.map((p) => `${FORMAS_CURTAS[p.forma] || p.forma}${(p.forma === 'credito' || p.forma === 'crediario') && p.parcelas > 1 ? ` (${p.parcelas}x)` : ''}`).join(' + ');
    }
    const p = lista && lista.length ? lista[0] : (vendaOuPagamento.pagamento || vendaOuPagamento);
    const nome = FORMAS_PAGAMENTO[p.forma] || p.forma;
    return (p.forma === 'credito' || p.forma === 'crediario') && p.parcelas > 1 ? `${nome} (${p.parcelas}x)` : nome;
  }

  /** Hex de uma cor pelo nome (cores cadastradas em data.js) */
  function corHex(nome) {
    const c = coresCache.find((x) => x.nome === nome);
    return c ? c.hex : '#CCCCCC';
  }
  function bolinhaCor(nome) {
    return `<span class="cor-bolinha" style="background:${corHex(nome)}" aria-hidden="true"></span>`;
  }

  /** Miniatura do produto (foto ou ícone) */
  /**
   * Cupom do pedido do catálogo. Vem em pedido.cupom ou, em pedidos feitos
   * antes da regra do banco aceitar o cupom, escrito na observação:
   * "Cupom PH10 (−R$ 11,00) · resto da observação".
   */
  /**
   * O pedido do catálogo é escrito por qualquer pessoa (sem login): antes de usar,
   * garante números nos números e textos curtos nos textos.
   */
  function limparPedido(p) {
    if (!p || typeof p !== 'object') return p;
    const txt = (v, max) => String(v ?? '').slice(0, max);
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const limpo = {
      ...p,
      codigo: txt(p.codigo, 12),
      cliente: { nome: txt(p.cliente && p.cliente.nome, 60), telefone: txt(p.cliente && p.cliente.telefone, 20) },
      endereco: txt(p.endereco, 200), obs: txt(p.obs, 220),
      entrega: p.entrega === 'entregar' ? 'entregar' : 'retirar',
      total: num(p.total),
      itens: (Array.isArray(p.itens) ? p.itens : []).slice(0, 40).map((i) => ({
        produtoId: txt(i && i.produtoId, 60), sku: txt(i && i.sku, 40), nome: txt(i && i.nome, 120),
        cor: txt(i && i.cor, 40), tamanho: txt(i && i.tamanho, 12),
        qtd: Math.max(0, Math.min(999, Math.floor(num(i && i.qtd)))), preco: num(i && i.preco)
      }))
    };
    if (p.subtotal !== undefined) limpo.subtotal = num(p.subtotal);
    if (p.cupom) limpo.cupom = { codigo: txt(p.cupom.codigo, 20).toUpperCase().replace(/[^A-Z0-9_-]/g, ''), desconto: num(p.cupom.desconto) };
    return limpo;
  }

  /**
   * Confere o cupom do pedido com os cupons cadastrados na loja e recalcula
   * o desconto pela regra do cupom sobre o valor informado (nunca confia no
   * número que veio no pedido). Devolve { ok, codigo, desconto, motivo }.
   */
  function conferirCupom(cupom, loja, subtotal) {
    if (!cupom) return null;
    const c = ((loja && loja.catalogo && loja.catalogo.cupons) || []).find((x) => x && x.codigo === cupom.codigo);
    if (!c) return { ok: false, codigo: cupom.codigo, desconto: 0, motivo: 'não existe nos cupons da loja' };
    if (c.minimo && subtotal < Number(c.minimo) - 0.001) return { ok: false, codigo: cupom.codigo, desconto: 0, motivo: `vale só acima de ${formatarMoeda(c.minimo)}` };
    const regra = c.tipo === 'valor' ? Number(c.valor) || 0 : subtotal * Math.min(100, Number(c.valor) || 0) / 100;
    const desconto = Math.round(Math.max(0, Math.min(subtotal, regra, Number(cupom.desconto) || regra)) * 100) / 100;
    return { ok: true, codigo: cupom.codigo, desconto, motivo: '' };
  }

  function cupomDoPedido(p) {
    if (!p) return null;
    if (p.cupom && Number(p.cupom.desconto) > 0) return { codigo: p.cupom.codigo, desconto: Number(p.cupom.desconto), obs: p.obs || '' };
    const m = String(p.obs || '').match(/^Cupom ([A-Z0-9_-]+) \(\s*[−-]\s*R\$\s*([\d.]*\d(?:,\d{1,2})?)\)\s*(?:·\s*)?/);
    if (!m) return null;
    const desconto = Number(m[2].replace(/\./g, '').replace(',', '.'));
    return desconto > 0 ? { codigo: m[1], desconto, obs: String(p.obs).slice(m[0].length) } : null;
  }

  function thumb(produto, classe = 'thumb') {
    return produto && produto.foto
      ? `<div class="${classe}"><img src="${produto.foto}" alt=""></div>`
      : `<div class="${classe}">${icone('shirt')}</div>`;
  }

  /* ==================================================================
     TOASTS
     ================================================================== */
  function toast(mensagem, tipo = 'sucesso', duracao = 3500) {
    let area = document.querySelector('.toasts');
    if (!area) {
      area = document.createElement('div');
      area.className = 'toasts';
      area.setAttribute('role', 'status');
      area.setAttribute('aria-live', 'polite');
      document.body.appendChild(area);
    }
    const iconeTipo = { sucesso: 'circle-check', erro: 'circle-x', aviso: 'triangle-alert' }[tipo] || 'info';
    const el = document.createElement('div');
    el.className = `toast ${tipo}`;
    el.innerHTML = `${icone(iconeTipo)}<span>${escapeHtml(mensagem)}</span>`;
    area.appendChild(el);
    icones();
    setTimeout(() => {
      el.classList.add('saindo');
      setTimeout(() => el.remove(), 220);
    }, duracao);
  }

  /* ==================================================================
     MODAL
     abrirModal({ titulo, corpo (html), acoes: [{texto, classe, icone, aoClicar(fechar)}], tamanho: 'sm'|'lg', aoAbrir(el), aoFechar() })
     Retorna { el, fechar }
     ================================================================== */
  function abrirModal({ titulo, corpo = '', acoes = [], tamanho = '', aoAbrir, aoFechar }) {
    const focoAnterior = document.activeElement;
    const idTitulo = 'modal-titulo-' + Math.random().toString(36).slice(2, 7);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal ${tamanho ? 'modal-' + tamanho : ''}" role="dialog" aria-modal="true" aria-labelledby="${idTitulo}">
        <div class="modal-cabecalho">
          <h2 id="${idTitulo}">${escapeHtml(titulo)}</h2>
          <button type="button" class="btn-icone" data-fechar aria-label="Fechar">${icone('x')}</button>
        </div>
        <div class="modal-corpo">${corpo}</div>
        ${acoes.length ? '<div class="modal-rodape"></div>' : ''}
      </div>`;

    const rodape = overlay.querySelector('.modal-rodape');
    acoes.forEach((acao) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${acao.classe || 'btn-secundario'}`;
      b.innerHTML = `${acao.icone ? icone(acao.icone) : ''}<span>${escapeHtml(acao.texto)}</span>`;
      if (acao.id) b.id = acao.id;
      b.addEventListener('click', () => (acao.aoClicar ? acao.aoClicar(fechar, b) : fechar()));
      rodape.appendChild(b);
    });

    function fechar() {
      overlay.classList.remove('visivel');
      document.removeEventListener('keydown', teclado);
      setTimeout(() => {
        overlay.remove();
        if (!document.querySelector('.modal-overlay')) document.body.style.overflow = '';
      }, 180);
      if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
      if (aoFechar) aoFechar();
    }

    // Esc fecha; Tab fica preso dentro do modal
    function teclado(e) {
      if (overlay !== [...document.querySelectorAll('.modal-overlay')].pop()) return;
      if (e.key === 'Escape') { e.preventDefault(); fechar(); }
      if (e.key === 'Tab') {
        const focaveis = overlay.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!focaveis.length) return;
        const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
      }
    }

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) fechar(); });
    overlay.querySelector('[data-fechar]').addEventListener('click', fechar);
    document.addEventListener('keydown', teclado);

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    icones();
    aplicarMascaras(overlay);
    requestAnimationFrame(() => overlay.classList.add('visivel'));

    // Foca o primeiro campo (ou o botão fechar)
    const alvo = overlay.querySelector('.modal-corpo input:not([type=hidden]):not([type=checkbox]):not([type=radio]), .modal-corpo select, .modal-corpo textarea') || overlay.querySelector('.modal-rodape .btn-primario') || overlay.querySelector('[data-fechar]');
    setTimeout(() => alvo && alvo.focus(), 50);

    if (aoAbrir) aoAbrir(overlay);
    return { el: overlay, fechar };
  }

  /** Confirmação (retorna Promise<boolean>) */
  function confirmar({ titulo = 'Tem certeza?', mensagem = '', textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', perigo = false }) {
    return new Promise((resolve) => {
      let respondeu = false;
      abrirModal({
        titulo,
        tamanho: 'sm',
        corpo: `<p>${escapeHtml(mensagem)}</p>`,
        acoes: [
          { texto: textoCancelar, classe: 'btn-secundario' },
          { texto: textoConfirmar, classe: perigo ? 'btn-perigo' : 'btn-primario', aoClicar: (fechar) => { respondeu = true; fechar(); resolve(true); } }
        ],
        aoFechar: () => { if (!respondeu) resolve(false); }
      });
    });
  }

  /* ==================================================================
     ESTADO VAZIO
     ================================================================== */
  function estadoVazio({ icone: ic = 'inbox', titulo = 'Nada por aqui', texto = '', acao = '' }) {
    return `<div class="vazio">
      <div class="vazio-icone">${icone(ic)}</div>
      <h3>${escapeHtml(titulo)}</h3>
      ${texto ? `<p>${escapeHtml(texto)}</p>` : ''}
      ${acao}
    </div>`;
  }

  /* ==================================================================
     PAGINAÇÃO
     ================================================================== */
  function paginar(lista, pagina, porPagina) {
    const totalPaginas = Math.max(1, Math.ceil(lista.length / porPagina));
    const atual = Math.min(Math.max(1, pagina), totalPaginas);
    return { itens: lista.slice((atual - 1) * porPagina, atual * porPagina), pagina: atual, totalPaginas };
  }

  /** Desenha a paginação num container e chama aoMudar(novaPagina) */
  function renderPaginacao(container, { total, pagina, porPagina, aoMudar }) {
    const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
    if (total <= porPagina) { container.innerHTML = ''; return; }
    const inicio = (pagina - 1) * porPagina + 1;
    const fim = Math.min(pagina * porPagina, total);

    // Páginas visíveis: 1 … (p-1) p (p+1) … N
    const paginas = [];
    for (let i = 1; i <= totalPaginas; i++) {
      if (i === 1 || i === totalPaginas || Math.abs(i - pagina) <= 1) paginas.push(i);
      else if (paginas[paginas.length - 1] !== '…') paginas.push('…');
    }

    container.innerHTML = `<nav class="paginacao" aria-label="Paginação">
      <span>Mostrando ${inicio}–${fim} de ${total}</span>
      <div class="paginacao-botoes">
        <button type="button" data-pg="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''} aria-label="Página anterior">${icone('chevron-left')}</button>
        ${paginas.map((p) => p === '…' ? '<button type="button" disabled aria-hidden="true">…</button>' : `<button type="button" data-pg="${p}" ${p === pagina ? 'aria-current="page"' : ''} aria-label="Página ${p}">${p}</button>`).join('')}
        <button type="button" data-pg="${pagina + 1}" ${pagina === totalPaginas ? 'disabled' : ''} aria-label="Próxima página">${icone('chevron-right')}</button>
      </div>
    </nav>`;
    container.querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => aoMudar(Number(b.dataset.pg))));
    icones();
  }

  /* ==================================================================
     FORMULÁRIOS: selects, máscaras, leitura de dados
     ================================================================== */
  /** Preenche um <select>. opcoes: array de strings ou {valor, texto} */
  function preencherSelect(select, opcoes, { vazio = null, valor = '' } = {}) {
    select.innerHTML = (vazio !== null ? `<option value="">${escapeHtml(vazio)}</option>` : '') +
      opcoes.map((o) => {
        const v = typeof o === 'object' ? o.valor : o;
        const t = typeof o === 'object' ? o.texto : o;
        return `<option value="${escapeHtml(v)}" ${String(v) === String(valor) ? 'selected' : ''}>${escapeHtml(t)}</option>`;
      }).join('');
  }

  /** Lê todos os campos [name] de um form para um objeto */
  function lerFormulario(form) {
    const dados = {};
    new FormData(form).forEach((v, k) => { dados[k] = typeof v === 'string' ? v.trim() : v; });
    return dados;
  }

  /** Valida campos required e marca os inválidos. Retorna true se ok. */
  function validarFormulario(form) {
    let ok = true;
    form.querySelectorAll('[required]').forEach((c) => {
      const valido = String(c.value).trim() !== '';
      c.classList.toggle('invalido', !valido);
      c.setAttribute('aria-invalid', String(!valido));
      if (!valido && ok) { c.focus(); ok = false; }
    });
    if (!ok) toast('Preencha os campos obrigatórios.', 'erro');
    return ok;
  }

  const MASCARAS = {
    documento(v) {
      const d = v.replace(/\D/g, '').slice(0, 14);
      if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
    },
    telefone(v) {
      const d = v.replace(/\D/g, '').slice(0, 11);
      if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
      return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
    },
    cep(v) {
      return v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
    },
    ncm(v) {
      return v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{4})(\d)/, '$1.$2').replace(/^(\d{4})\.(\d{2})(\d)/, '$1.$2.$3');
    },
    moeda(v) {
      const d = v.replace(/\D/g, '');
      if (!d) return '';
      return (Number(d) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  };
  /** Aplica máscara em inputs com data-mascara="documento|telefone|moeda" */
  function aplicarMascaras(raiz = document) {
    raiz.querySelectorAll('[data-mascara]').forEach((input) => {
      if (input.dataset.mascaraOk) return;
      input.dataset.mascaraOk = '1';
      const fn = MASCARAS[input.dataset.mascara];
      if (!fn) return;
      input.addEventListener('input', () => { input.value = fn(input.value); });
    });
  }
  /** Confere os dígitos verificadores de um CNPJ (validação de formulário) */
  function cnpjValido(cnpj) {
    const n = String(cnpj || '').replace(/\D/g, '');
    if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false;
    const dv = (len) => {
      const pesos = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const r = pesos.reduce((s, p, i) => s + Number(n[i]) * p, 0) % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return dv(12) === Number(n[12]) && dv(13) === Number(n[13]);
  }

  const formatarValorInput = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ==================================================================
     CASCA: sidebar + topbar
     ================================================================== */
  /**
   * Aplica o nome/logo da loja em tudo que está na tela agora:
   * menu lateral, título da aba do navegador e elementos marcados com
   * data-nome-loja (texto) ou data-logo-loja (logo/iniciais).
   * Chamado ao montar a página, ao salvar em Configurações e quando
   * outra aba altera os dados.
   */
  /* ---------- Cor primária (escolhida em Configurações → Aparência) ---------- */
  const COR_PADRAO = '#18181B';
  const CHAVE_COR_CSS = 'gestaoloja:corcss';

  function hexParaRgb(hex) {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbParaHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  /** Mistura a cor a com b (t = 0 → só a, t = 1 → só b) */
  function misturar(a, b, t) {
    const A = hexParaRgb(a), B = hexParaRgb(b);
    return rgbParaHex(A.map((v, i) => v + (B[i] - v) * t));
  }
  function luminancia(hex) {
    const [r, g, b] = hexParaRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contraste(a, b) {
    const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  }
  const rgba = (hex, alfa) => `rgba(${hexParaRgb(hex).join(', ')}, ${alfa})`;

  /**
   * A partir de uma cor, gera as variáveis do tema claro e do escuro.
   * Claro: escurece a cor até ter contraste com o branco.
   * Escuro: clareia a cor até ter contraste com o fundo escuro.
   */
  function variaveisCor(hex) {
    const base = /^#?[0-9a-f]{6}$/i.test(hex) ? (hex.startsWith('#') ? hex : '#' + hex).toUpperCase() : COR_PADRAO;
    let claro = base;
    for (let i = 0; i < 20 && contraste(claro, '#FFFFFF') < 3.2; i++) claro = misturar(claro, '#000000', 0.08);
    let escuro = base;
    for (let i = 0; i < 20 && contraste(escuro, '#14161A') < 5; i++) escuro = misturar(escuro, '#FFFFFF', 0.1);
    const textoMarca = contraste(base, '#FFFFFF') >= 2.6 ? '#FFFFFF' : '#101828';
    return {
      claro: {
        '--cor-destaque': claro,
        '--cor-destaque-hover': misturar(claro, '#000000', 0.14),
        '--cor-destaque-suave': misturar(claro, '#FFFFFF', 0.9),
        '--cor-destaque-borda': misturar(claro, '#FFFFFF', 0.65),
        '--cor-destaque-texto': '#FFFFFF',
        '--cor-destaque-forte': misturar(claro, '#000000', 0.32),
        '--cor-marca': base,
        '--cor-marca-texto': textoMarca,
        '--anel-foco': `0 0 0 4px ${rgba(claro, 0.16)}`
      },
      escuro: {
        '--cor-destaque': escuro,
        '--cor-destaque-hover': misturar(escuro, '#FFFFFF', 0.18),
        '--cor-destaque-suave': misturar(escuro, '#14161A', 0.84),
        '--cor-destaque-borda': misturar(escuro, '#14161A', 0.6),
        '--cor-destaque-texto': '#0B0C14',
        '--cor-destaque-forte': misturar(escuro, '#FFFFFF', 0.45),
        '--cor-marca': base,
        '--cor-marca-texto': textoMarca,
        '--anel-foco': `0 0 0 4px ${rgba(escuro, 0.24)}`
      }
    };
  }
  const blocoCss = (vars) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');

  /** Aplica a cor em todo o sistema (e guarda o CSS para a próxima página abrir já colorida) */
  function aplicarCorPrimaria(hex) {
    let css = '';
    if (hex && hex.toUpperCase() !== COR_PADRAO) {
      const v = variaveisCor(hex);
      // Seletores mais fortes que os do style.css; "body [data-tema]" cobre prévias e PDFs
      css = `html:root,html[data-tema="claro"],body [data-tema="claro"]{${blocoCss(v.claro)}}` +
            `html[data-tema="escuro"],body [data-tema="escuro"]{${blocoCss(v.escuro)}}`;
    }
    let el = document.getElementById('cor-marca');
    if (css) {
      if (!el) { el = document.createElement('style'); el.id = 'cor-marca'; document.head.appendChild(el); }
      el.textContent = css;
    } else if (el) el.remove();
    try { css ? localStorage.setItem(CHAVE_COR_CSS, css) : localStorage.removeItem(CHAVE_COR_CSS); } catch (e) { /* ignora */ }
  }

  function aplicarMarcaLoja(loja) {
    aplicarCorPrimaria(loja.corPrimaria || COR_PADRAO);
    const logoHtml = loja.logo ? `<img src="${loja.logo}" alt="">` : escapeHtml(iniciais(loja.nome));
    document.querySelectorAll('.logo-nome, [data-nome-loja]').forEach((el) => { el.textContent = loja.nome; });
    document.querySelectorAll('.sidebar .logo-marca, [data-logo-loja]').forEach((el) => { el.innerHTML = logoHtml; });
    // Título da aba: "Página — Nome da loja"
    const pagina = document.body.dataset.tituloAba || document.body.dataset.titulo || 'Entrar';
    // Tela de entrada: só o nome da loja; demais telas: "Página — Loja"
    document.title = document.getElementById('sidebar') ? `${pagina} — ${loja.nome}` : loja.nome;
  }

  // Outra aba mudou os dados (data.js avisa): atualiza a marca na tela
  window.addEventListener('dados-alterados', async () => {
    aplicarMarcaLoja(await Data.obterLoja());
  });

  /** Janela "Trocar minha senha" (quem está logado; esqueceu → suporte) */
  function abrirTrocaDeSenha() {
    const campo = (id, rotulo, auto) => `<div class="campo"><label for="${id}">${rotulo}</label>
      <input class="input" id="${id}" type="password" required minlength="6" autocomplete="${auto}"></div>`;
    const { el, fechar } = abrirModal({
      titulo: 'Trocar minha senha',
      tamanho: 'sm',
      corpo: `<form id="form-senha" class="flex-col gap-4" novalidate>
          ${campo('ts-atual', 'Senha atual', 'current-password')}
          ${campo('ts-nova', 'Nova senha (mín. 6)', 'new-password')}
          ${campo('ts-confirma', 'Repita a nova senha', 'new-password')}
          <label class="checkbox"><input type="checkbox" id="ts-mostrar"> Mostrar senhas</label>
        </form>`,
      acoes: [
        { texto: 'Cancelar' },
        { texto: 'Trocar senha', classe: 'btn-primario', icone: 'key-round', aoClicar: salvar }
      ]
    });
    const f = el.querySelector('#form-senha');
    setTimeout(() => el.querySelector('#ts-atual').focus(), 50);
    el.querySelector('#ts-mostrar').addEventListener('change', (e) => {
      f.querySelectorAll('input[type=password], input[data-senha]').forEach((i) => { i.dataset.senha = '1'; i.type = e.target.checked ? 'text' : 'password'; });
    });
    f.addEventListener('submit', (e) => { e.preventDefault(); salvar(null, el.querySelector('.modal-rodape .btn-primario')); });
    async function salvar(_, botao) {
      const atual = el.querySelector('#ts-atual').value;
      const nova = el.querySelector('#ts-nova').value;
      if (nova !== el.querySelector('#ts-confirma').value) return toast('A nova senha e a repetição estão diferentes.', 'erro');
      if (nova === atual) return toast('A nova senha precisa ser diferente da atual.', 'erro');
      botao.disabled = true;
      try {
        await Data.trocarSenha(atual, nova);
        fechar();
        toast('Senha trocada! Use a nova senha na próxima vez que entrar.', 'sucesso', 6000);
      } catch (erro) {
        toast(erro.message, 'erro', 6000);
        botao.disabled = false;
      }
    }
  }

  /* ---------- Casca instantânea (menu e topo guardados da última página) ---------- */
  const CHAVE_CASCA = 'gestaoloja:casca';
  function lerCascaGuardada() {
    try { return JSON.parse(localStorage.getItem(CHAVE_CASCA)); } catch (e) { return null; }
  }
  /* ---------- Pedidos online: contador no menu e aviso de pedido novo ---------- */
  let pedidosNovos = null;
  async function atualizarPedidosMenu(avisar = false) {
    if (!Data.resumoPedidos || !podeAcessar('pedidos')) return;
    let r;
    try { r = await Data.resumoPedidos(); } catch (e) { return; }
    const link = document.querySelector('.sidebar .nav-link[data-menu-id="pedidos"]');
    if (link) {
      let b = link.querySelector('.nav-contador');
      if (!b) { b = document.createElement('span'); b.className = 'nav-contador'; link.appendChild(b); }
      b.textContent = r.novos;
      b.hidden = !r.novos;
    }
    if (avisar && pedidosNovos !== null && r.novos > pedidosNovos) {
      toast(`🛍️ Novo pedido online! ${r.novos} aguardando.`, 'sucesso', 8000);
      try { new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=').play().catch(() => {}); } catch (e) { /* ignora */ }
    }
    pedidosNovos = r.novos;
  }

  /* ---------- Grupos do menu que abrem e fecham ---------- */
  const CHAVE_GRUPOS = 'gestaoloja:menu-fechados:v2';
  const gruposFechados = () => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_GRUPOS));
      if (Array.isArray(salvo)) return salvo;
    } catch (e) { /* padrão */ }
    return MENU.filter((g) => g.fechado).map((g) => g.grupo);
  };
  const sempreFechados = MENU.filter((g) => g.sempreFechado).map((g) => g.grupo);
  function aplicarGrupos() {
    const fechados = [...gruposFechados(), ...sempreFechados];
    document.querySelectorAll('.sidebar .nav-grupo').forEach((g) => {
      const temAtivo = !!g.querySelector('.nav-link.ativo');
      const fechado = fechados.includes(g.dataset.grupo) && !temAtivo;
      g.classList.toggle('fechado', fechado);
      const bt = g.querySelector('.nav-grupo-titulo');
      if (bt) bt.setAttribute('aria-expanded', String(!fechado));
    });
  }
  document.addEventListener('click', (e) => {
    const bt = e.target.closest('.sidebar .nav-grupo-titulo');
    if (!bt) return;
    const g = bt.closest('.nav-grupo');
    const fechar = !g.classList.contains('fechado');
    g.classList.toggle('fechado', fechar);
    bt.setAttribute('aria-expanded', String(!fechar));
    if (sempreFechados.includes(g.dataset.grupo)) return;
    const lista = gruposFechados().filter((x) => x !== g.dataset.grupo);
    if (fechar) lista.push(g.dataset.grupo);
    try { localStorage.setItem(CHAVE_GRUPOS, JSON.stringify(lista)); } catch (er) { /* ignora */ }
  });

  /** Marca o item ativo do menu, o título da página e esconde "Nova venda" no próprio PDV */
  function ajustarCascaPagina() {
    const paginaAtual = document.body.dataset.menu || document.body.dataset.pagina;
    document.querySelectorAll('.sidebar .nav-link').forEach((a) => {
      const ativo = a.dataset.menuId === paginaAtual;
      a.classList.toggle('ativo', ativo);
      ativo ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    });
    const tit = document.getElementById('topbar-pagina');
    if (tit) tit.textContent = document.body.dataset.titulo || '';
    const novaVenda = document.getElementById('btn-nova-venda-topo');
    if (novaVenda) novaVenda.hidden = paginaAtual === 'pdv';
    aplicarGrupos();
  }
  /** Roda assim que o app.js carrega: mostra o menu guardado antes de buscar os dados */
  function mostrarCascaGuardada() {
    const sidebar = document.getElementById('sidebar');
    const topbar = document.getElementById('topbar');
    const guardada = lerCascaGuardada();
    if (!sidebar || !topbar || !guardada) return;
    sidebar.innerHTML = guardada.sidebar;
    topbar.innerHTML = guardada.topbar;
    ajustarCascaPagina();
  }

  let lojaCache = null;
  /** Nome para mostrar: o dono com o nome padrão ("Admin") aparece com o nome da loja */
  function nomeDoUsuario(usuario, loja = lojaCache) {
    if (!usuario) return '';
    const generico = !usuario.nome || /^admin$/i.test(String(usuario.nome).trim());
    return generico && usuario.perfil === 'dono' && loja && loja.nome ? loja.nome : (usuario.nome || '');
  }
  async function montarCasca() {
    // data-menu: item do menu a destacar (ex.: Entrada de mercadoria destaca "Estoque")
    const paginaAtual = document.body.dataset.menu || document.body.dataset.pagina;
    const titulo = document.body.dataset.titulo || '';
    const sidebar = document.getElementById('sidebar');
    const topbar = document.getElementById('topbar');
    if (!sidebar || !topbar) {
      // Página sem menu (login): só aplica nome/logo
      aplicarMarcaLoja(await Data.obterLoja());
      return;
    }

    const [loja, usuario] = await Promise.all([Data.obterLoja(), Data.usuarioAtual()]);
    lojaCache = loja;
    // Loja sem nota fiscal: esconde o que é só de NFC-e (classe "so-nota")
    document.body.classList.toggle('sem-nota', !loja.emitirNota);

    // O HTML da casca não depende da página (item ativo e título são ajustados depois).
    // Se for igual ao guardado, o menu mostrado na abertura da página é mantido (sem piscar).
    const sidebarHtml = `
      <div class="sidebar-logo">
        <a href="dashboard.html" class="sidebar-logo-img" title="Dashboard (início)" aria-label="Dashboard (início)">
          <img src="../img/logo-phimports.png" alt="${escapeHtml(loja.nome || 'PH Imports')}">
        </a>
        <button type="button" class="btn-icone btn-recolher" id="btn-recolher" aria-label="Recolher menu" title="Recolher menu">${icone('panel-left-close')}</button>
      </div>
      <nav class="sidebar-nav" aria-label="Menu principal">
        ${MENU.map((g) => ({ ...g, itens: g.itens.filter((it) => podeAcessar(it.id) && (it.id !== 'notas' || loja.emitirNota) && (it.id !== 'caixa' || loja.controlarCaixa) && (it.id !== 'mensalidade' || Data.modo === 'nuvem')) })).filter((g) => g.itens.length).map((g) => `
          <div class="nav-grupo" data-grupo="${g.grupo}">
            ${g.grupo ? `<button type="button" class="nav-grupo-titulo" aria-expanded="true">${g.grupo}${icone('chevron-down')}</button>` : ''}
            <div class="nav-grupo-itens">
            ${g.itens.map((it) => `
              <a href="${it.href}" class="nav-link" data-menu-id="${it.id}" title="${it.texto}">
                ${icone(it.icone)}<span class="nav-texto">${it.texto}</span>
              </a>`).join('')}
            </div>
          </div>`).join('')}
      </nav>
      <div class="sidebar-usuario">
        <div class="avatar" title="${escapeHtml(nomeDoUsuario(usuario, loja))}">${escapeHtml(iniciais(nomeDoUsuario(usuario, loja)))}</div>
        <div class="info">
          <div class="nome">${escapeHtml(nomeDoUsuario(usuario, loja))}</div>
          <div class="perfil">${usuario.perfil === 'dono' ? 'Dono(a)' : 'Vendedor(a)'}</div>
        </div>
        <button type="button" class="btn-icone btn-senha" id="btn-trocar-senha" aria-label="Trocar minha senha" title="Trocar minha senha">${icone('key-round')}</button>
        <button type="button" class="btn-icone btn-sair" id="btn-sair" aria-label="Sair do sistema" title="Sair">${icone('log-out')}</button>
      </div>`;

    const topbarHtml = `
      <button type="button" class="btn-icone btn-menu" id="btn-menu" aria-label="Abrir menu" aria-controls="sidebar" aria-expanded="false">${icone('menu')}</button>
      <div class="topbar-titulo"><span class="texto-3">${escapeHtml(loja.nome)}</span> <span class="texto-3" aria-hidden="true">›</span> <span id="topbar-pagina"></span></div>
      <form class="topbar-busca" role="search" action="produtos.html">
        ${icone('search')}
        <label for="busca-global" class="sr-only">Buscar produtos (atalho Ctrl+K)</label>
        <input id="busca-global" name="busca" class="input" type="search" placeholder="Buscar produto, SKU ou código" autocomplete="off">
        <span class="atalho" aria-hidden="true"><kbd>Ctrl</kbd><kbd>K</kbd></span>
      </form>
      <button type="button" class="btn btn-secundario btn-sm btn-instalar" data-instalar-app hidden title="Instalar o sistema como aplicativo">${icone('download')}<span>Instalar app</span></button>
      <button type="button" class="btn-icone btn-recarregar" id="btn-recarregar" aria-label="Atualizar a página" title="Atualizar (F5)">${icone('rotate-cw')}</button>
      <button type="button" class="btn-icone btn-tema" id="btn-tema" aria-label="Alternar tema claro/escuro" title="Tema claro/escuro">
        <span class="icone-claro">${icone('moon')}</span><span class="icone-escuro">${icone('sun')}</span>
      </button>
      <a href="pdv.html" class="btn btn-primario" id="btn-nova-venda-topo" aria-label="Nova venda">${icone('plus')}<span class="nav-texto-topo">Nova venda</span></a>`;

    const bruto = sidebarHtml + topbarHtml;
    const guardada = lerCascaGuardada();
    if (!guardada || guardada.bruto !== bruto || !sidebar.querySelector('.sidebar-nav')) {
      sidebar.innerHTML = sidebarHtml;
      topbar.innerHTML = topbarHtml;
      icones();
      try { localStorage.setItem(CHAVE_CASCA, JSON.stringify({ bruto, sidebar: sidebar.innerHTML, topbar: topbar.innerHTML })); } catch (e) { /* ignora */ }
    }
    ajustarCascaPagina();

    // Ctrl+K (ou ⌘K) foca a busca
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        const busca = document.getElementById('busca-global');
        if (busca && busca.offsetParent !== null) { e.preventDefault(); busca.focus(); busca.select(); }
      }
    });

    // Botão de atualizar (aparece só no app instalado; no navegador já existe o recarregar)
    document.getElementById('btn-recarregar').addEventListener('click', (e) => {
      e.currentTarget.classList.add('girando');
      location.reload();
    });

    // Barra de título do app na mesma cor do topo do sistema (muda com o tema)
    const corDaBarra = () => {
      const cor = getComputedStyle(document.documentElement).getPropertyValue('--cor-superficie').trim() || '#FFFFFF';
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = cor; });
    };
    corDaBarra();

    // Tema claro/escuro (lembrado no navegador). Gráficos são redesenhados recarregando a página.
    document.getElementById('btn-tema').addEventListener('click', () => {
      const novo = document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro';
      document.documentElement.dataset.tema = novo;
      corDaBarra();
      try { localStorage.setItem('gestaoloja:tema', novo); } catch (e) { /* ignora */ }
      if (document.querySelector('canvas')) location.reload();
    });

    // Recolher/expandir o menu no computador (lembrado no navegador)
    const btnRecolher = document.getElementById('btn-recolher');
    const atualizarRecolher = () => {
      const recolhido = document.documentElement.classList.contains('menu-recolhido');
      btnRecolher.setAttribute('aria-label', recolhido ? 'Expandir menu' : 'Recolher menu');
      btnRecolher.title = recolhido ? 'Expandir menu' : 'Recolher menu';
      btnRecolher.setAttribute('aria-expanded', String(!recolhido));
    };
    btnRecolher.addEventListener('click', () => {
      const recolhido = document.documentElement.classList.toggle('menu-recolhido');
      try { localStorage.setItem('gestaoloja:menu', recolhido ? 'recolhido' : ''); } catch (e) { /* ignora */ }
      atualizarRecolher();
    });
    atualizarRecolher();

    // Menu hambúrguer (celular)
    const overlay = document.getElementById('sidebar-overlay');
    const btnMenu = document.getElementById('btn-menu');
    function alternarMenu(abrir) {
      sidebar.classList.toggle('aberta', abrir);
      overlay.classList.toggle('visivel', abrir);
      btnMenu.setAttribute('aria-expanded', String(abrir));
      if (abrir) sidebar.querySelector('.nav-link')?.focus();
    }
    btnMenu.addEventListener('click', () => alternarMenu(!sidebar.classList.contains('aberta')));
    overlay.addEventListener('click', () => alternarMenu(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sidebar.classList.contains('aberta')) { alternarMenu(false); btnMenu.focus(); } });

    document.getElementById('btn-trocar-senha').addEventListener('click', abrirTrocaDeSenha);
    document.querySelectorAll('[data-instalar-app]').forEach((b) => b.addEventListener('click', instalarApp));
    atualizarBotaoInstalar();
    atualizarPedidosMenu();
    window.addEventListener('dados-alterados', () => atualizarPedidosMenu(true));

    document.getElementById('btn-sair').addEventListener('click', async () => {
      await Data.sair();
      try { localStorage.removeItem(CHAVE_CASCA); } catch (e) { /* ignora */ }
      location.href = '../index.html';
    });

    aplicarMarcaLoja(loja);
  }

  /* ==================================================================
     GRÁFICOS (Chart.js) — usam as cores das variáveis CSS
     ================================================================== */
  function corCss(variavel) {
    return getComputedStyle(document.documentElement).getPropertyValue(variavel).trim();
  }
  function configurarGraficos() {
    if (!window.Chart) return;
    Chart.defaults.font.family = corCss('--fonte') || 'Inter, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = corCss('--cor-texto-3');
    Chart.defaults.borderColor = corCss('--cor-borda');
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.boxHeight = 10;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.tooltip.backgroundColor = corCss('--cor-texto');
    Chart.defaults.plugins.tooltip.titleColor = corCss('--cor-fundo');
    Chart.defaults.plugins.tooltip.bodyColor = corCss('--cor-fundo');
    Chart.defaults.plugins.tooltip.titleFont = { weight: '600' };
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 12;
    Chart.defaults.plugins.tooltip.displayColors = false;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.layout.padding = { left: 4 };
  }
  /** Tons da cor de destaque para gráficos com várias séries */
  function paletaGrafico(qtd) {
    const base = corCss('--cor-destaque') || '#6C5CE7';
    const opacidades = [1, 0.75, 0.55, 0.4, 0.28, 0.18, 0.12, 0.08];
    const r = parseInt(base.slice(1, 3), 16), g = parseInt(base.slice(3, 5), 16), b = parseInt(base.slice(5, 7), 16);
    return Array.from({ length: qtd }, (_, i) => `rgba(${r}, ${g}, ${b}, ${opacidades[i % opacidades.length]})`);
  }

  /* ==================================================================
     IMPRESSÃO E CUPOM (NFC-e simulada / comprovante não fiscal)
     ================================================================== */

  /** Imprime apenas o HTML informado (usa @media print do layout.css) */
  /**
   * @param {string} html  conteúdo a imprimir
   * @param {string} [cssPagina]  CSS extra só para esta impressão (ex.: "@page { size: 40mm 25mm; margin: 0 }")
   */
  /* ---------- PDF para impressão (sem data, título e endereço do navegador) ---------- */
  const scriptsCarregando = {};
  function carregarScript(src) {
    if (!scriptsCarregando[src]) {
      scriptsCarregando[src] = new Promise((ok, erro) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = ok; s.onerror = () => { delete scriptsCarregando[src]; erro(new Error(src)); };
        document.head.appendChild(s);
      });
    }
    return scriptsCarregando[src];
  }
  const carregarJsPdf = () => (window.jspdf ? Promise.resolve() : carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'));

  /** Abre a impressão de um PDF (o leitor de PDF do Chrome não põe cabeçalho nem rodapé) */
  function imprimirPdf(blob) {
    const url = URL.createObjectURL(blob);
    const antigo = document.getElementById('quadro-impressao');
    if (antigo) antigo.remove();
    const quadro = document.createElement('iframe');
    quadro.id = 'quadro-impressao';
    quadro.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    quadro.onload = () => setTimeout(() => {
      try { quadro.contentWindow.focus(); quadro.contentWindow.print(); }
      catch (e) { window.open(url, '_blank'); }
    }, 300);
    quadro.src = url;
    document.body.appendChild(quadro);
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
  }

  /* Ajustes da impressora de recibo (ficam neste computador) */
  const CHAVE_IMPRESSORA = 'gestaoloja:impressora:v3';
  const IMPRESSORA_PADRAO = { area80: 72, area58: 48, mover: 0 };
  function ajustesImpressora() {
    try { return { ...IMPRESSORA_PADRAO, ...JSON.parse(localStorage.getItem(CHAVE_IMPRESSORA) || '{}') }; } catch (e) { return { ...IMPRESSORA_PADRAO }; }
  }
  function salvarAjustesImpressora(aj) {
    try { localStorage.setItem(CHAVE_IMPRESSORA, JSON.stringify({ ...ajustesImpressora(), ...aj })); } catch (e) { /* ignora */ }
  }

  function imprimir(html, cssPagina = '') {
    // Recibos e vales: página sem margem (o navegador não tem onde pôr data, título e endereço)
    // e na largura que a impressora imprime; a própria impressora emenda as páginas no rolo.
    if (!cssPagina && /class="cupom[\s"]/.test(html)) {
      const aj = ajustesImpressora();
      const bobina = /max-width:\s*48mm/.test(html) ? 58 : 80;
      const area = Math.max(30, Math.min(bobina, Number(bobina === 58 ? aj.area58 : aj.area80) || (bobina === 58 ? 48 : 72)));
      const largura = area - 2;
      const esquerda = Math.max(0, 1 + (Number(aj.mover) || 0));
      cssPagina = `@page { margin: 0; }
        .area-impressao .cupom { width: ${largura}mm !important; max-width: ${largura}mm !important; margin: 0 0 0 ${esquerda}mm !important; padding: 2mm 0 8mm !important; }
        .area-impressao .c-logo, .area-impressao .c-qr, .area-impressao .c-linha, .area-impressao .c-economia { break-inside: avoid; page-break-inside: avoid; }`;
    }
    imprimirNavegador(html, cssPagina);
  }

  /**
   * Imprime numa TIRA ÚNICA: a página tem exatamente a altura do conteúdo,
   * então nunca quebra em duas páginas (pedido online / folha de separação).
   */
  async function imprimirTira(html) {
    const aj = ajustesImpressora();
    const bobina = /max-width:\s*48mm/.test(html) ? 58 : 80;
    const area = Math.max(30, Math.min(bobina, Number(bobina === 58 ? aj.area58 : aj.area80) || (bobina === 58 ? 48 : 72)));
    const largura = area - 2;
    const esquerda = Math.max(0, 1 + (Number(aj.mover) || 0));
    // Mede o conteúdo do jeito que vai ser impresso (mesma largura, sem borda)
    const medida = document.createElement('div');
    medida.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden';
    medida.innerHTML = html;
    document.body.appendChild(medida);
    const cupom = medida.querySelector('.cupom');
    if (cupom) Object.assign(cupom.style, { width: largura + 'mm', maxWidth: largura + 'mm', margin: '0', padding: '2mm 1mm 8mm', border: '0', boxShadow: 'none' });
    const imagens = [...medida.querySelectorAll('img')].map((img) => (img.complete ? Promise.resolve() : new Promise((ok) => { img.onload = ok; img.onerror = ok; })));
    await Promise.race([Promise.all(imagens), new Promise((ok) => setTimeout(ok, 2500))]);
    const alturaMm = Math.ceil(((cupom || medida).getBoundingClientRect().height * 25.4) / 96) + 6;
    medida.remove();
    imprimirNavegador(html, `@page { size: ${bobina}mm ${alturaMm}mm; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; }
      .area-impressao .cupom { width: ${largura}mm !important; max-width: ${largura}mm !important; margin: 0 0 0 ${esquerda}mm !important; padding: 2mm 1mm 8mm !important; }`);
  }

  function imprimirNavegador(html, cssPagina = '') {
    const area = document.createElement('div');
    area.className = 'area-impressao';
    area.style.display = 'none';
    area.innerHTML = html;
    document.body.appendChild(area);
    let estilo = null;
    if (cssPagina) {
      estilo = document.createElement('style');
      estilo.textContent = cssPagina;
      document.head.appendChild(estilo);
    }
    document.body.classList.add('imprimindo');
    // Espera as imagens (logo do recibo) carregarem antes de abrir a impressão
    const imagens = [...area.querySelectorAll('img')].map((img) => (img.complete ? Promise.resolve() : new Promise((ok) => { img.onload = ok; img.onerror = ok; })));
    const limite = new Promise((ok) => setTimeout(ok, 2500));
    Promise.race([Promise.all(imagens), limite]).then(() => setTimeout(() => {
      window.print();
      document.body.classList.remove('imprimindo');
      area.remove();
      if (estilo) estilo.remove();
    }, 50));
  }

  /** "QR Code" ilustrativo em SVG (padrão gerado a partir do texto — não é escaneável) */
  function qrIlustrativo(texto, tamanho = 120) {
    const n = 25;
    let semente = [...String(texto)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483647, 7);
    const rnd = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
    const finder = (x, y) => x < 7 && y < 7;
    const ehFinder = (x, y) => finder(x, y) || finder(n - 1 - x, y) || finder(x, n - 1 - y);
    let rects = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let preto;
        if (ehFinder(x, y)) {
          const lx = x < 7 ? x : n - 1 - x, ly = y < 7 ? y : n - 1 - y;
          const bx = Math.min(lx, 6 - lx), by = Math.min(ly, 6 - ly), anel = Math.min(bx, by);
          preto = anel !== 1;
        } else if ((x === 7 || y === 7 || x === n - 8 || y === n - 8) && (x < 8 || y < 8 || x > n - 9 || y > n - 9)) {
          preto = false; // separadores
        } else {
          preto = rnd() > 0.52;
        }
        if (preto) rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
      }
    }
    return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" width="${tamanho}" height="${tamanho}" role="img" aria-label="QR Code de consulta (ilustrativo)" style="margin:8px auto;display:block;background:#fff"><g fill="#111">${rects}</g></svg>`;
  }

  /**
   * HTML do cupom térmico.
   * @param {{loja, fiscal?, venda, nota?}} p — com nota → DANFE NFC-e; sem nota → comprovante não fiscal
   *   fiscal = Data.obterConfigFiscal() (emitente, endereço, NFC-e, tributação)
   */
  /** Logo do recibo: o enviado em Configurações ou, se não houver, o logo padrão do sistema */
  function logoDoRecibo(loja) {
    if (loja.logo) return loja.logo;
    const raiz = location.pathname.includes('/pages/') ? '../' : '';
    return raiz + 'img/logo-phimports.png';
  }

  /* ---------- Opções de impressão (tela "Impressão") ---------- */
  const IMPRESSAO_PADRAO = {
    largura: 80, fonte: 'normal',
    logo: true, endereco: true, telefone: true, instagram: true, site: true,
    codigo: true, cliente: true, vendedor: true, economia: true, pontos: true,
    mensagem: true, qrInstagram: true, textoQr: 'Nos siga no Instagram'
  };
  const opcoesImpressao = (loja) => ({ ...IMPRESSAO_PADRAO, ...((loja && loja.impressao) || {}) });
  const usuarioInstagram = (loja) => String((loja && loja.instagram) || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '');
  // Biblioteca do QR Code (a mesma do Pix): carrega em segundo plano em todas as telas
  if (!window.qrcode && !document.querySelector('script[data-qr]')) {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    sc.async = true; sc.dataset.qr = '1';
    document.head.appendChild(sc);
  }
  function qrCodeSvg(texto) {
    if (!window.qrcode) return '';
    const qr = window.qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
  }
  /** Bloco "Nos siga no Instagram" com o QR Code do perfil */
  function blocoQrInstagram(loja, op) {
    const user = usuarioInstagram(loja);
    if (!op.qrInstagram || !user) return '';
    const svg = qrCodeSvg(`https://instagram.com/${user}`);
    if (!svg) return '';
    return `<div class="c-sep"></div>
      <div class="c-centro c-negrito">${escapeHtml(op.textoQr || 'Nos siga no Instagram')}</div>
      <div class="c-qr">${svg}</div>
      <div class="c-centro">@${escapeHtml(user)}</div>`;
  }
  /** Largura e letra do papel */
  function estiloPapel(op) {
    const largura = Number(op.largura) === 58 ? 48 : 72;          // área impressa de cada bobina (mm)
    const fonte = { pequena: 12, normal: 13.5, grande: 15.5 }[op.fonte] || 13.5;
    return `max-width:${largura}mm;font-size:${fonte}px`;
  }

  /** Pedido online impresso no mesmo estilo do recibo de compra (folha de separação) */
  function htmlPedidoOnline({ loja, pedido: pedidoBruto }) {
    const pedido = limparPedido(pedidoBruto);
    const op = opcoesImpressao(loja);
    const m = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const e = escapeHtml;
    const itens = pedido.itens || [];
    const qtdTotal = itens.reduce((s, i) => s + (Number(i.qtd) || 0), 0);
    const subtotal = itens.reduce((s, i) => s + (Number(i.preco) || 0) * (Number(i.qtd) || 0), 0);
    const cupom = cupomDoPedido(pedido);
    const obs = cupom ? cupom.obs : pedido.obs;
    const retirar = pedido.entrega !== 'entregar';
    const formas = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', outro: 'Outro' };
    const cli = pedido.cliente || {};
    return `<div class="cupom" style="${estiloPapel(op)}">
      ${op.logo ? `<div class="c-logo"><img src="${e(logoDoRecibo(loja))}" alt="${e(loja.nome)}"></div>` : ''}
      <div class="c-centro c-negrito" style="font-size:15px;letter-spacing:.02em">${e(loja.nome || '').toUpperCase()}</div>
      ${loja.endereco && op.endereco ? `<div class="c-centro">${e(loja.endereco)}</div>` : ''}
      ${loja.telefone && op.telefone ? `<div class="c-centro">Tel./WhatsApp: ${e(loja.telefone)}</div>` : ''}
      ${usuarioInstagram(loja) && op.instagram ? `<div class="c-centro">Instagram: @${e(usuarioInstagram(loja))}</div>` : ''}
      <div class="c-sep"></div>
      <div class="c-centro c-negrito" style="font-size:14px">PEDIDO ONLINE #${e(pedido.codigo || '')}</div>
      <div class="c-centro">${formatarDataHora(pedido.criadoEm)}</div>
      <div class="c-sep"></div>
      <div class="c-linha"><span>Cliente</span><span class="c-negrito">${e(cli.nome || '—')}</span></div>
      ${cli.telefone ? `<div class="c-linha"><span>WhatsApp</span><span>${e(cli.telefone)}</span></div>` : ''}
      <div class="c-linha"><span>Entrega</span><span class="c-negrito">${retirar ? 'RETIRADA NA LOJA' : 'ENVIAR'}</span></div>
      ${!retirar && pedido.endereco ? `<div>${e(pedido.endereco)}</div>` : ''}
      ${obs ? `<div class="mt-2">Obs.: ${e(obs)}</div>` : ''}
      <div class="c-sep"></div>
      <div class="c-linha c-negrito"><span>PRODUTOS</span><span>VL TOTAL</span></div>
      ${itens.map((it, i) => `
        <div class="c-item">
          ${op.codigo && it.sku ? `<div>${String(i + 1).padStart(3, '0')} ${e(it.sku)}</div>` : ''}
          <div>[ &nbsp;] ${op.codigo && it.sku ? '' : `${String(i + 1).padStart(2, '0')} `}${e(it.nome)} ${e(it.tamanho || '')}${it.cor ? '/' + e(it.cor) : ''}</div>
          <div class="c-linha"><span>${it.qtd} UN x ${m(it.preco)}</span><span>${m((Number(it.qtd) || 0) * (Number(it.preco) || 0))}</span></div>
        </div>`).join('')}
      <div class="c-sep"></div>
      ${cupom ? `<div class="c-linha"><span>Valor total R$ (${qtdTotal} ${qtdTotal === 1 ? 'peça' : 'peças'})</span><span>${m(subtotal)}</span></div>` : ''}
      ${cupom ? `<div class="c-linha"><span>Cupom ${e(cupom.codigo)}</span><span>-${m(cupom.desconto)}</span></div>` : ''}
      <div class="c-linha c-negrito"><span>Valor a pagar R$</span><span>${m(pedido.total)}</span></div>
      <div class="c-linha c-negrito"><span>PAGAMENTO</span><span>${pedido.pago ? e(formas[pedido.pago.forma] || pedido.pago.forma || 'Pago') : 'A COMBINAR'}</span></div>
      ${pedido.observacaoLoja ? `<div class="c-sep"></div><div>Anotação: ${e(pedido.observacaoLoja)}</div>` : ''}
      <div class="c-sep"></div>
      <div class="c-centro">Pedido do catálogo online · sem valor fiscal</div>
    </div>`;
  }

  function htmlCupom({ loja, fiscal = null, venda, nota = null }) {
    const op = opcoesImpressao(loja);
    const m = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const e = escapeHtml;
    const qtdTotal = venda.itens.reduce((s, i) => s + i.qtd, 0);
    const trib = (fiscal && fiscal.tributacao) || {};
    const aliquota = Number(trib.aliquotaTributos) || 31.45;
    const tributos = venda.total * aliquota / 100; // valor aproximado (Lei 12.741/2012)
    const urlConsulta = (fiscal && fiscal.nfce && fiscal.nfce.urlConsulta) || 'site da SEFAZ do seu estado';
    const homologacao = nota && nota.ambiente === 'homologacao';
    // Endereço estruturado (dados fiscais) ou o texto livre da loja
    const end = (nota || loja.emitirNota) && fiscal && fiscal.endereco && fiscal.endereco.logradouro ? fiscal.endereco : null;
    const enderecoHtml = end
      ? `${e(end.logradouro)}, ${e(end.numero)}${end.complemento ? ' ' + e(end.complemento) : ''} — ${e(end.bairro)}<br>${e(end.municipio)}/${e(end.uf)} — CEP ${e(end.cep)}`
      : e(loja.endereco);
    // Uma linha por forma de pagamento (venda pode ser dividida). Dinheiro mostra o valor entregue (com troco).
    const pagamentos = venda.pagamentos && venda.pagamentos.length
      ? venda.pagamentos
      : [{ forma: venda.pagamento.forma, valor: venda.total, parcelas: venda.pagamento.parcelas }];
    const troco = (venda.pagamento && venda.pagamento.troco) || 0;
    let trocoMostrado = false;
    const linhaPag = pagamentos.map((p) => {
      let valor = p.valor;
      if (p.forma === 'dinheiro' && troco && !trocoMostrado) { valor += troco; trocoMostrado = true; }
      const nome = FORMAS_PAGAMENTO[p.forma] || p.forma;
      const extra = p.forma === 'credito' && p.parcelas > 1 ? ` ${p.parcelas}x` : p.forma === 'vale' && p.codigoVale ? ` ${p.codigoVale}` : '';
      return `<div class="c-linha"><span>${e(nome)}${e(extra)}</span><span>${m(valor)}</span></div>`;
    }).join('');

    return `<div class="cupom" style="${estiloPapel(op)}">
      ${nota && nota.status === 'cancelada' ? '<div class="c-carimbo">CANCELADA</div>' : ''}
      ${op.logo ? `<div class="c-logo"><img src="${e(logoDoRecibo(loja))}" alt="${e(loja.nome)}"></div>` : ''}
      <div class="c-centro c-negrito" style="font-size:15px;letter-spacing:.02em">${e(loja.nome).toUpperCase()}</div>
      ${loja.razaoSocial && (nota || loja.emitirNota) ? `<div class="c-centro">${e(loja.razaoSocial)}</div>` : ''}
      ${loja.cnpj && (nota || loja.emitirNota) ? `<div class="c-centro">CNPJ: ${e(loja.cnpj)} ${loja.inscricaoEstadual ? 'IE: ' + e(loja.inscricaoEstadual) : ''}</div>` : ''}
      ${(nota || loja.emitirNota) && fiscal && fiscal.inscricaoMunicipal ? `<div class="c-centro">IM: ${e(fiscal.inscricaoMunicipal)}</div>` : ''}
      ${enderecoHtml && (op.endereco || nota) ? `<div class="c-centro">${enderecoHtml}</div>` : ""}
      ${loja.telefone && op.telefone ? `<div class="c-centro">Tel./WhatsApp: ${e(loja.telefone)}</div>` : ''}
      ${usuarioInstagram(loja) && op.instagram ? `<div class="c-centro">Instagram: @${e(usuarioInstagram(loja))}</div>` : ''}
      ${loja.site && op.site ? `<div class="c-centro">${e(loja.site)}</div>` : ''}
      <div class="c-sep"></div>
      ${nota
        ? '<div class="c-centro c-negrito">DANFE NFC-e — Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>'
        : '<div class="c-centro c-negrito" style="font-size:14px">RECIBO DE COMPRA</div>'}
      ${nota && nota.status === 'pendente' ? '<div class="c-centro c-negrito">EMITIDA EM CONTINGÊNCIA<br>Pendente de autorização</div>' : ''}
      ${homologacao ? '<div class="c-sep"></div><div class="c-centro c-negrito">EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO<br>SEM VALOR FISCAL</div>' : ''}
      <div class="c-sep"></div>
      <div class="c-linha c-negrito"><span>${nota ? 'DESCRIÇÃO' : 'PRODUTOS'}</span><span>VL TOTAL</span></div>
      ${venda.itens.map((it, i) => `
        <div class="c-item">
          ${op.codigo || nota ? `<div>${String(i + 1).padStart(3, '0')} ${e(it.sku)}</div>` : ''}
          <div>${op.codigo || nota ? '' : `${String(i + 1).padStart(2, '0')} `}${e(it.nome)} ${e(it.tamanho)}/${e(it.cor)}</div>
          <div class="c-linha"><span>${it.qtd} UN x ${m(it.preco)}</span><span>${m(it.qtd * it.preco)}</span></div>
        </div>`).join('')}
      <div class="c-sep"></div>
      <div class="c-linha"><span>Qtd. total de itens</span><span>${qtdTotal}</span></div>
      <div class="c-linha"><span>Valor total R$</span><span>${m(venda.subtotal)}</span></div>
      ${(venda.promocoes || []).map((p) => `<div class="c-linha"><span>${e(p.nome)}</span><span>-${m(p.valor)}</span></div>`).join('')}
      ${venda.desconto ? `<div class="c-linha"><span>Desconto R$</span><span>-${m(venda.desconto)}</span></div>` : ''}
      <div class="c-linha c-negrito"><span>Valor a pagar R$</span><span>${m(venda.total)}</span></div>
      <div class="c-linha c-negrito mt-2"><span>FORMA DE PAGAMENTO</span><span>VALOR PAGO</span></div>
      ${linhaPag}
      ${venda.pagamento.troco ? `<div class="c-linha"><span>Troco R$</span><span>${m(venda.pagamento.troco)}</span></div>` : ''}
      ${!nota && op.economia && venda.subtotal - venda.total > 0.004 ? `<div class="c-economia">Você economizou R$ ${m(venda.subtotal - venda.total)}</div>` : ''}
      ${op.pontos && venda.pontosSaldo !== null && venda.pontosSaldo !== undefined ? `<div class="c-pontos"><div class="c-negrito">★ Programa de pontos</div>${venda.pontosUsados ? `<div>Usou ${venda.pontosUsados} pontos nesta compra</div>` : ''}<div>Ganhou ${venda.pontosGanhos} pontos nesta compra${venda.pontos && venda.pontos.mult > 1 ? ` (${venda.pontos.mult}× pontos!)` : ''}</div><div class="c-negrito">Seu saldo: ${venda.pontosSaldo} pontos (R$ ${m(venda.pontosValorSaldo)})</div></div>` : ''}
      <div class="c-sep"></div>
      ${nota ? `
        <div class="c-centro c-negrito">Consulte pela Chave de Acesso em</div>
        <div class="c-centro">${e(urlConsulta)}</div>
        <div class="c-chave mt-2">${e((nota.chave || '').replace(/(\d{4})(?=\d)/g, '$1 '))}</div>
        <div class="c-sep"></div>
        <div class="c-centro c-negrito">${nota.clienteDocumento ? 'CONSUMIDOR — CPF/CNPJ: ' + e(nota.clienteDocumento) : 'CONSUMIDOR NÃO IDENTIFICADO'}</div>
        ${nota.clienteDocumento ? `<div class="c-centro">${e(nota.clienteNome)}</div>` : ''}
        <div class="c-sep"></div>
        <div class="c-centro c-negrito">NFC-e nº ${String(nota.numero).padStart(9, '0')} Série ${String(nota.serie).padStart(3, '0')}</div>
        <div class="c-centro">${formatarDataHora(nota.data)}</div>
        ${nota.status !== 'pendente' ? `<div class="c-centro">Protocolo de autorização: 1352${String(nota.numero).padStart(11, '0')}</div>` : ''}
        ${qrIlustrativo(nota.chave)}
        <div class="c-centro">Tributos totais incidentes (Lei Federal 12.741/2012): R$ ${m(tributos)} (${aliquota.toLocaleString('pt-BR')}%)</div>
        ${trib.informacoesComplementares ? `<div class="c-sep"></div><div class="c-centro">${e(trib.informacoesComplementares)}</div>` : ''}
      ` : `
        <div class="c-centro">Venda #${venda.numero} · ${formatarDataHora(venda.data)}</div>
        ${op.cliente ? `<div class="c-centro">Cliente: ${e(venda.clienteNome || 'Consumidor final')}</div>
        ${venda.clienteDocumento ? `<div class="c-centro">CPF/CNPJ: ${e(venda.clienteDocumento)}</div>` : ''}
        ${venda.clienteTelefone ? `<div class="c-centro">Telefone: ${e(venda.clienteTelefone)}</div>` : ''}` : ''}
        ${venda.parcelasCrediario && venda.parcelasCrediario.length ? `
          <div class="c-sep"></div>
          <div class="c-centro c-negrito">CREDIÁRIO — PARCELAS</div>
          ${venda.parcelasCrediario.filter((p) => p.status !== 'cancelada').map((p) => `<div class="c-linha"><span>${p.parcela}/${p.totalParcelas} venc. ${formatarData(p.vencimento)}</span><span>${m(p.valor)}</span></div>`).join('')}
          <div class="c-centro" style="margin-top:16px">_______________________________</div>
          <div class="c-centro">Assinatura do cliente</div>` : ''}
        <div class="c-sep"></div>
        ${op.mensagem ? `<div class="c-centro c-mensagem">${e(loja.mensagemRecibo || 'Trocas em até 30 dias com este recibo.')}</div>` : ''}
        <div class="c-centro c-negrito">Obrigado pela preferência!</div>
        ${blocoQrInstagram(loja, op)}
      `}
    </div>`;
  }

  /**
   * Monta o cupom sempre com os dados ATUAIS da loja (nome, logo, dados fiscais).
   * Use esta função em vez de guardar "loja" ao abrir a tela: se o nome mudar
   * em Configurações, o próximo cupom/nota já sai com o nome novo.
   */
  /**
   * Cupom do vale-troca (não fiscal) com código e saldo.
   * @param {{credito, venda?}} p
   */
  async function gerarVale({ credito, venda = null, loja: lojaDada = null }) {
    const loja = lojaDada || await Data.obterLoja();
    const e = escapeHtml;
    const m = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const op = opcoesImpressao(loja);
    return `<div class="cupom" style="${estiloPapel(op)}">
      ${op.logo ? `<div class="c-logo"><img src="${e(logoDoRecibo(loja))}" alt="${e(loja.nome)}"></div>` : ''}
      <div class="c-centro c-negrito" style="font-size:15px">${e(loja.nome).toUpperCase()}</div>
      <div class="c-centro">${e(loja.telefone || '')}</div>
      <div class="c-sep"></div>
      <div class="c-centro c-negrito" style="font-size:16px">VALE-TROCA</div>
      <div class="c-sep"></div>
      <div class="c-centro">Código</div>
      <div class="c-centro c-negrito" style="font-size:20px;letter-spacing:.08em">${e(credito.codigo)}</div>
      <div class="c-centro mt-2">Saldo disponível</div>
      <div class="c-centro c-negrito" style="font-size:18px">R$ ${m(credito.saldo)}</div>
      ${credito.saldo !== credito.valor ? `<div class="c-centro">Valor original: R$ ${m(credito.valor)}</div>` : ''}
      <div class="c-sep"></div>
      <div class="c-linha"><span>Cliente</span><span>${e(credito.clienteNome || 'Não identificado')}</span></div>
      ${venda ? `<div class="c-linha"><span>Troca da venda</span><span>#${venda.numero}</span></div>` : ''}
      <div class="c-linha"><span>Emitido em</span><span>${formatarData(credito.criadoEm)}</span></div>
      <div class="c-sep"></div>
      <div class="c-centro">Apresente este código no caixa para usar o saldo em novas compras.</div>
      ${blocoQrInstagram(loja, op)}
    </div>`;
  }

  async function gerarCupom({ venda, nota = null }) {
    const [loja, fiscal] = await Promise.all([Data.obterLoja(), Data.obterConfigFiscal()]);
    return htmlCupom({ loja, fiscal, venda, nota });
  }

  /**
   * Reduz uma imagem antes de salvar (o Firestore aceita até 1 MB por registro).
   * @param {File} arquivo  @param {number} maximo lado maior em px  @param {boolean} manterPng logo com fundo transparente
   * @returns {Promise<string>} dataURL
   */
  function comprimirImagem(arquivo, maximo = 900, manterPng = false) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Imagem inválida.'));
        img.onload = () => {
          const escala = Math.min(1, maximo / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * escala);
          canvas.height = Math.round(img.height * escala);
          const ctx = canvas.getContext('2d');
          const png = manterPng && arquivo.type === 'image/png';
          if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(png ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  /** O Cloudinary está configurado? */
  function cloudinaryAtivo() {
    const c = window.CLOUDINARY_CONFIG;
    return !!(c && c.cloudName && c.uploadPreset);
  }
  /**
   * Reduz a imagem e envia ao Cloudinary.
   * @returns {Promise<string>} endereço da imagem (ou dataURL se o Cloudinary não estiver configurado)
   */
  async function enviarImagem(arquivo, { maximo = 1200, manterPng = false, subpasta = 'produtos' } = {}) {
    const dataUrl = await comprimirImagem(arquivo, maximo, manterPng);
    if (!cloudinaryAtivo()) return dataUrl;
    const c = window.CLOUDINARY_CONFIG;
    const corpo = new FormData();
    corpo.append('file', dataUrl);
    corpo.append('upload_preset', c.uploadPreset);
    corpo.append('folder', [c.pasta, subpasta].filter(Boolean).join('/'));
    let resp;
    try {
      resp = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(c.cloudName)}/image/upload`, { method: 'POST', body: corpo });
    } catch (e) { throw new Error('Sem internet para enviar a foto. Tente de novo.'); }
    const r = await resp.json().catch(() => ({}));
    if (!resp.ok || !r.secure_url) throw new Error('Não foi possível enviar a foto: ' + ((r.error && r.error.message) || resp.status));
    // Entrega otimizada: formato e qualidade automáticos (WebP/AVIF quando o navegador aceita)
    return r.secure_url.replace('/image/upload/', '/image/upload/f_auto,q_auto/');
  }

  /* ==================================================================
     INICIALIZAÇÃO
     ================================================================== */
  function aoIniciar(fn) { inicializadores.push(fn); }

  /** Troca o conteúdo da página por um aviso de acesso restrito */
  function mostrarAcessoNegado() {
    const conteudo = document.getElementById('conteudo');
    if (!conteudo) return;
    conteudo.innerHTML = `<div class="card" style="max-width:520px;margin:40px auto">
      ${estadoVazio({ icone: 'lock', titulo: 'Acesso restrito ao dono da loja', texto: 'Seu usuário (vendedor) não tem permissão para esta tela. Fale com o dono da loja se precisar deste acesso.', acao: '<a href="dashboard.html" class="btn btn-primario">Voltar ao início</a>' })}
    </div>`;
  }

  // Antes de qualquer espera: menu/topo guardados e ícones já desenhados (troca de tela sem piscar)
  try { mostrarCascaGuardada(); icones(); } catch (e) { /* segue o fluxo normal */ }

  // Erro ao salvar na nuvem (ex.: sem permissão): avisa quem está usando
  window.addEventListener('erro-sincronizacao', (e) => toast(`Não foi possível salvar na nuvem: ${e.detail}`, 'erro', 7000));

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      // Nuvem: espera o login e carrega a loja. Sem login → volta para a tela de entrada.
      const naTelaDeLogin = !document.getElementById('sidebar');
      const logado = await Data.pronto();
      if (Data.modo === 'nuvem' && !logado && !naTelaDeLogin) {
        try { localStorage.removeItem(CHAVE_CASCA); } catch (e) { /* ignora */ }
        location.replace('../index.html');
        return;
      }
      // Suporte (super admin) não usa as telas da loja: vai para o painel
      if (logado && logado.perfil === 'superadmin' && !naTelaDeLogin) {
        location.replace('admin.html');
        return;
      }
      coresCache = await Data.listarCores();
      usuarioAtualCache = await Data.usuarioAtual();
      configurarGraficos();
      await montarCasca();
      icones();
      aplicarMascaras();
      // Página fora do perfil: não carrega a tela (o menu já esconde o link)
      const pagina = document.body.dataset.pagina;
      if (pagina && !podeAcessar(pagina)) {
        mostrarAcessoNegado();
        icones();
        return;
      }
      for (const fn of inicializadores) await fn();
    } catch (erro) {
      console.error(erro);
      toast(erro.message || 'Erro ao carregar a página.', 'erro');
    }
    icones();
  });

  /* ---------- API pública ---------- */
  /** Mostra o vale-troca gerado na troca, com opção de imprimir */
  function mostrarVale(venda) {
    const c = venda.credito;
    App.abrirModal({
      titulo: 'Vale-troca gerado',
      tamanho: 'sm',
      corpo: `
        <div class="texto-centro">
          <div class="sucesso-icone"><i data-lucide="ticket"></i></div>
          <p class="texto-sm">Entregue este código ao cliente. Ele usa o saldo em qualquer compra, no PDV, em "Vale-troca".</p>
          <div class="mono negrito mt-4" style="font-size:28px;letter-spacing:.08em;color:var(--cor-texto)">${App.escapeHtml(c.codigo)}</div>
          <div class="stat-valor mt-2">${App.formatarMoeda(c.saldo)}</div>
          <p class="texto-xs mt-2">${c.clienteId ? `Vinculado a ${App.escapeHtml(venda.clienteNome)} — aparece no PDV ao escolher o cliente.` : 'Venda sem cliente identificado: guarde o código impresso.'}</p>
        </div>`,
      acoes: [
        { texto: 'Fechar' },
        { texto: 'Imprimir vale', classe: 'btn-primario', icone: 'printer', aoClicar: async () => App.imprimir(await App.gerarVale({ credito: c, venda })) }
      ]
    });
  }

  /* ==================================================================
     TROCA / DEVOLUÇÃO
     ================================================================== */
  function abrirTroca(venda, opcoes = {}) {
    let tipo = 'troca';
    const { el, fechar } = App.abrirModal({
      titulo: `Troca ou devolução — venda #${venda.numero}`,
      corpo: `
        <form id="form-dev" novalidate>
          <div class="campo">
            <span class="rotulo" id="rot-tipo-dev">Tipo</span>
            <div class="chips" role="radiogroup" aria-labelledby="rot-tipo-dev">
              <button type="button" class="chip" role="radio" data-tipo="troca" aria-checked="true"><i data-lucide="repeat"></i>Troca (gera vale-troca)</button>
              <button type="button" class="chip" role="radio" data-tipo="devolucao" aria-checked="false"><i data-lucide="undo-2"></i>Devolução (devolve o dinheiro)</button>
            </div>
          </div>

          <fieldset class="mt-4" style="border:none">
            <legend class="rotulo mb-4">Itens que voltam ao estoque</legend>
            ${venda.itens.map((i, idx) => `
              <div class="flex items-center gap-3" style="padding:10px 0;border-bottom:1px solid var(--cor-borda)">
                <input type="checkbox" id="dev-${idx}" data-idx="${idx}" checked>
                <label for="dev-${idx}" style="flex:1;min-width:0">
                  <span class="negrito texto-sm">${App.escapeHtml(i.nome)}</span><br>
                  <span class="texto-xs texto-3">${App.escapeHtml(i.tamanho)} · ${App.escapeHtml(i.cor)} · ${App.formatarMoeda(i.preco)}</span>
                </label>
                <label class="sr-only" for="dev-qtd-${idx}">Quantidade de ${App.escapeHtml(i.nome)}</label>
                <select class="select" id="dev-qtd-${idx}" data-qtd="${idx}" style="width:84px">
                  ${Array.from({ length: i.qtd }, (_, k) => `<option value="${k + 1}" ${k + 1 === i.qtd ? 'selected' : ''}>${k + 1}</option>`).join('')}
                </select>
              </div>`).join('')}
          </fieldset>

          <div class="campo mt-4">
            <label for="dev-motivo">Motivo</label>
            <select class="select" id="dev-motivo">
              <option>Tamanho não serviu</option>
              <option>Não gostou da cor/modelo</option>
              <option>Produto com defeito</option>
              <option>Arrependimento</option>
              <option>Outro</option>
            </select>
          </div>
          <div class="alerta info mt-4"><i data-lucide="info"></i><span id="dev-resumo"></span></div>
        </form>`,
      acoes: [
        { texto: 'Cancelar' },
        { texto: 'Confirmar', classe: 'btn-primario', icone: 'check', aoClicar: confirmar }
      ]
    });

    function selecionados() {
      return [...el.querySelectorAll('[data-idx]')].filter((c) => c.checked).map((c) => {
        const i = venda.itens[c.dataset.idx];
        return { sku: i.sku, qtd: Number(el.querySelector(`[data-qtd="${c.dataset.idx}"]`).value), preco: i.preco };
      });
    }
    function atualizarResumo() {
      const itens = selecionados();
      // Valor com o desconto da venda rateado (é o que o cliente pagou)
      const fator = venda.subtotal ? venda.total / venda.subtotal : 1;
      const valor = itens.reduce((s, i) => s + i.qtd * i.preco, 0) * fator;
      el.querySelector('#dev-resumo').innerHTML = itens.length
        ? `${itens.reduce((s, i) => s + i.qtd, 0)} peça(s) voltam ao estoque. ${tipo === 'troca'
          ? `Gera um <strong>vale-troca de ${App.formatarMoeda(valor)}</strong> para usar em nova compra.`
          : `Devolver <strong>${App.formatarMoeda(valor)}</strong> ao cliente pela mesma forma de pagamento.`}`
        : 'Selecione ao menos um item.';
    }
    el.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => {
      tipo = b.dataset.tipo;
      el.querySelectorAll('[data-tipo]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      atualizarResumo();
    }));
    el.querySelectorAll('[data-idx], [data-qtd]').forEach((c) => c.addEventListener('change', atualizarResumo));
    atualizarResumo();

    async function confirmar(_, botao) {
      const itens = selecionados().map(({ sku, qtd }) => ({ sku, qtd }));
      if (!itens.length) return App.toast('Selecione ao menos um item.', 'erro');
      botao.disabled = true;
      try {
        const atualizada = await Data.registrarDevolucao(venda.id, { tipo, itens, motivo: el.querySelector('#dev-motivo').value });
        fechar();
        App.toast(tipo === 'troca' ? 'Troca registrada. Peças devolvidas ao estoque.' : 'Devolução registrada. Peças devolvidas ao estoque.');
        if (opcoes.aoConcluir) await opcoes.aoConcluir(atualizada);
        if (atualizada.credito) setTimeout(() => mostrarVale(atualizada), 250);
      } catch (erro) {
        App.toast(erro.message, 'erro');
        botao.disabled = false;
      }
    }
  }

  window.App = {
    aoIniciar,
    // formatadores
    formatarMoeda, formatarNumero, formatarPercentual, formatarData, formatarDataHora, dataInput, diasAtras, lerNumero, formatarValorInput,
    escapeHtml, iniciais, debounce, parametroUrl,
    // visuais
    cupomDoPedido, limparPedido, conferirCupom, icones, icone, badgeStatus, nomePagamento, FORMAS_PAGAMENTO, corHex, bolinhaCor, thumb,
    // componentes
    toast, abrirModal, confirmar, estadoVazio, paginar, renderPaginacao,
    // formulários
    preencherSelect, lerFormulario, validarFormulario, aplicarMascaras, cnpjValido,
    // gráficos
    corCss, paletaGrafico,
    // impressão / cupom
    imprimir, imprimirTira, htmlPedidoOnline, imprimirPdf, carregarJsPdf, ajustesImpressora, salvarAjustesImpressora, htmlCupom, gerarCupom, gerarVale, opcoesImpressao, IMPRESSAO_PADRAO,
    // app instalável
    instalarApp, get podeInstalar() { return !!pedidoInstalacao; }, get appInstalado() { return appInstalado(); },
    // troca/devolução (telas Vendas e Trocas)
    abrirTroca, mostrarVale,
    // marca da loja (nome/logo em toda a tela)
    comprimirImagem, enviarImagem, cloudinaryAtivo, nomeDoUsuario,
    aplicarMarcaLoja, aplicarCorPrimaria, variaveisCor, COR_PADRAO,
    // permissões
    pode, podeAcessar, get usuario() { return usuarioAtualCache; },
    // A loja emite nota fiscal (NFC-e)? Desligado = só recibo de compra
    get emiteNota() { return !!(lojaCache && lojaCache.emitirNota); },
    get loja() { return lojaCache; },
    FORMAS_CURTAS
  };
})();
