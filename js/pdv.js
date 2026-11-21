/* ==========================================================================
   pdv.js — Frente de caixa (estilo caixa de loja)
   Leitura por código de barras com multiplicador de quantidade, visor do
   último item, lista de itens estilo cupom, visor do total, teclas de
   atalho (F2 consultar, F3 quantidade, F4 cliente, F8 desconto, Del remover,
   F9 finalizar), pagamento dividido, exige caixa aberto, nota e comprovante.
   ========================================================================== */
App.aoIniciar(async () => {
  const PARCELAS_MAX = 6;
  const PARCELA_MINIMA = 30; // R$

  /* ---------- Estado ---------- */
  let produtos = [];
  let carrinho = [];            // [{produtoId, sku, nome, tamanho, cor, preco, qtd, max, foto}]
  let tipoDesconto = 'valor';   // 'valor' | 'percentual'
  let formaPagamento = '';      // forma que está sendo lançada agora
  let pagamentos = [];          // já lançados: [{forma, valor, parcelas, codigoVale}]
  let valorEditado = false;     // operador digitou o valor? (senão acompanha o restante)
  let dividindo = false;        // modo "dividir pagamento" (ex.: parte em dinheiro, resto no cartão)
  let valeConsultado = null;    // {codigo, saldo, clienteNome}
  let caixa = null;             // caixa aberto (ou null)
  let calc = null;              // preços do carrinho com promoções (Data.calcularCarrinho)
  let calcSeq = 0;              // evita usar um cálculo antigo se o carrinho mudar rápido
  let regras = { limiteDescontoVendedor: 10 };
  let crediarioInfo = null;     // limite/aberto do cliente escolhido
  let ultimoItem = null;        // {nome, tamanho, cor, sku, qtd, preco, foto} — visor
  let linhaSel = -1;            // linha selecionada na lista (Del remove)
  let destacarSku = null;       // item que acabou de entrar (pisca na lista)

  /* ---------- Elementos ---------- */
  const $ = (id) => document.getElementById(id);
  const inputBusca = $('pdv-busca');
  const inputQtd = $('qtd-mult');
  const elCarrinho = $('carrinho');
  const corpoCarrinho = $('carrinho-corpo');
  const btnToggle = $('toggle-carrinho');
  const btnFinalizar = $('btn-finalizar');
  const inputDesconto = $('desconto');
  const inputValor = $('valor-pagamento');
  const selParcelas = $('parcelas');
  const inputVale = $('codigo-vale');

  /** Quantidade da próxima leitura (campo "1 ×"), volta para 1 depois de usar */
  function qtdMultiplicador() {
    const q = Math.max(1, Math.min(999, parseInt(inputQtd.value, 10) || 1));
    return q;
  }
  function resetarMultiplicador() { inputQtd.value = '1'; inputQtd.closest('.pdv-qtd').classList.remove('ativo'); }
  inputQtd.addEventListener('input', () => {
    inputQtd.value = inputQtd.value.replace(/\D/g, '');
    inputQtd.closest('.pdv-qtd').classList.toggle('ativo', qtdMultiplicador() > 1);
  });
  inputQtd.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inputBusca.focus(); } });
  inputQtd.addEventListener('focus', () => inputQtd.select());

  /* ==================================================================
     CONSULTA DE PRODUTOS (F2) — catálogo em janela
     ================================================================== */
  async function carregarProdutos() {
    produtos = await Data.listarProdutos();
  }

  const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function filtrarProdutos(termo, categoria) {
    const alvo = normalizar(termo.trim());
    return produtos.filter((p) => {
      if (categoria && p.categoria !== categoria) return false;
      if (!alvo) return true;
      return normalizar(`${p.nome} ${p.marca} ${p.variacoes.map((v) => v.sku + ' ' + v.codigoBarras).join(' ')}`).includes(alvo);
    });
  }

  function htmlProdutos(lista) {
    if (!lista.length) return `<div style="grid-column:1/-1">${App.estadoVazio({ icone: 'search-x', titulo: 'Nenhum produto encontrado', texto: 'Tente outro nome, SKU ou código de barras.' })}</div>`;
    return lista.map((p) => {
      const esgotado = p.estoqueTotal === 0;
      return `
      <button type="button" class="produto-card" data-id="${p.id}" ${esgotado ? 'disabled style="opacity:.55;cursor:not-allowed"' : ''} aria-label="${App.escapeHtml(p.nome)}, ${App.formatarMoeda(p.preco)}${esgotado ? ', esgotado' : ''}">
        <div class="imagem">${p.foto ? `<img src="${p.foto}" alt="">` : '<i data-lucide="shirt"></i>'}</div>
        <div class="info">
          <span class="nome">${App.escapeHtml(p.nome)}</span>
          <span class="marca">${App.escapeHtml(p.marca)} · ${esgotado ? 'Esgotado' : p.estoqueTotal + ' em estoque'}</span>
          ${p.precoPromocional ? `<span class="preco"><s class="texto-3" style="font-weight:400;font-size:var(--fs-xs)">${App.formatarMoeda(p.preco)}</s> <span style="color:var(--cor-sucesso)">${App.formatarMoeda(p.precoPromocional)}</span></span>` : `<span class="preco">${App.formatarMoeda(p.preco)}</span>`}
          ${p.promocao ? `<span class="tag" style="background:var(--cor-sucesso-suave);color:var(--cor-sucesso);margin-top:4px;align-self:flex-start">${App.escapeHtml(p.promocao.leve ? `Leve ${p.promocao.leve} pague ${p.promocao.pague}` : p.promocao.nome)}</span>` : ''}
        </div>
      </button>`;
    }).join('');
  }

  async function abrirConsulta(termoInicial = '') {
    const categorias = await Data.listarCategorias();
    let categoria = '';
    const { el, fechar } = App.abrirModal({
      titulo: 'Consultar produto',
      tamanho: 'lg',
      corpo: `
        <div class="pdv-busca consulta-busca" data-consulta>
          <i data-lucide="search"></i>
          <label for="consulta-termo" class="sr-only">Buscar produto</label>
          <input class="input" id="consulta-termo" type="search" placeholder="Nome, marca, SKU ou código…" autocomplete="off">
        </div>
        <div class="chips chips-rolagem mt-4" id="consulta-cats" role="group" aria-label="Filtrar por categoria">
          ${['', ...categorias].map((c) => `<button type="button" class="chip" data-cat="${App.escapeHtml(c)}" aria-pressed="${c === ''}">${c || 'Todas'}</button>`).join('')}
        </div>
        <div class="pdv-produtos consulta-grid" id="consulta-grid"></div>`
    });
    const termo = el.querySelector('#consulta-termo');
    const grid = el.querySelector('#consulta-grid');
    function desenhar() {
      grid.innerHTML = htmlProdutos(filtrarProdutos(termo.value, categoria));
      App.icones();
    }
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.produto-card:not([disabled])');
      if (!b) return;
      fechar();
      abrirSeletor(produtos.find((p) => p.id === b.dataset.id));
    });
    el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
      categoria = b.dataset.cat;
      el.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      desenhar();
    }));
    termo.addEventListener('input', App.debounce(desenhar, 120));
    termo.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const lista = filtrarProdutos(termo.value, categoria).filter((p) => p.estoqueTotal > 0);
      if (lista.length === 1) { fechar(); abrirSeletor(lista[0]); }
    });
    termo.value = termoInicial;
    desenhar();
    setTimeout(() => termo.focus(), 40);
  }

  /* ==================================================================
     SELETOR DE VARIAÇÃO (modal tamanho × cor)
     ================================================================== */
  function abrirSeletor(produto) {
    const tamanhos = [...new Set(produto.variacoes.map((v) => v.tamanho))];
    const cores = [...new Set(produto.variacoes.map((v) => v.cor))];
    let tamanho = null, cor = null, qtd = qtdMultiplicador();

    // Se só existe uma opção, já vem selecionada
    if (tamanhos.length === 1) tamanho = tamanhos[0];
    if (cores.length === 1) cor = cores[0];

    const estoqueDe = (t, c) => produto.variacoes.filter((v) => (!t || v.tamanho === t) && (!c || v.cor === c)).reduce((s, v) => s + v.estoque, 0);
    const noCarrinho = (sku) => (carrinho.find((i) => i.sku === sku) || {}).qtd || 0;

    const { el, fechar } = App.abrirModal({
      titulo: 'Escolha tamanho e cor',
      corpo: `
        <div class="produto-cel mb-4">
          ${App.thumb(produto)}
          <div>
            <div class="titulo">${App.escapeHtml(produto.nome)}</div>
            <div class="sub">${App.escapeHtml(produto.marca)} · ${produto.precoPromocional ? `<s>${App.formatarMoeda(produto.preco)}</s> <strong style="color:var(--cor-sucesso)">${App.formatarMoeda(produto.precoPromocional)}</strong>` : `<strong style="color:var(--cor-texto)">${App.formatarMoeda(produto.preco)}</strong>`}${produto.promocao ? ` · ${App.escapeHtml(produto.promocao.nome)}` : ''}</div>
          </div>
        </div>
        <div class="campo"><span class="rotulo" id="rot-tam">Tamanho</span><div class="chips" role="radiogroup" aria-labelledby="rot-tam" id="sel-tamanhos"></div></div>
        <div class="campo mt-4"><span class="rotulo" id="rot-cor">Cor</span><div class="chips" role="radiogroup" aria-labelledby="rot-cor" id="sel-cores"></div></div>
        <div class="flex items-center justify-between mt-6 gap-3" style="flex-wrap:wrap">
          <div class="qtd" aria-label="Quantidade">
            <button type="button" id="qtd-menos" aria-label="Diminuir quantidade"><i data-lucide="minus"></i></button>
            <span id="qtd-valor" aria-live="polite">1</span>
            <button type="button" id="qtd-mais" aria-label="Aumentar quantidade"><i data-lucide="plus"></i></button>
          </div>
          <span class="texto-sm texto-3" id="disponivel">Selecione tamanho e cor</span>
        </div>`,
      acoes: [
        { texto: 'Cancelar' },
        { texto: 'Adicionar à venda', classe: 'btn-primario', icone: 'plus', id: 'btn-adicionar', aoClicar: confirmar }
      ]
    });

    function variacaoAtual() {
      return produto.variacoes.find((v) => v.tamanho === tamanho && v.cor === cor);
    }

    function desenhar() {
      el.querySelector('#sel-tamanhos').innerHTML = tamanhos.map((t) => {
        const sem = estoqueDe(t, cor) === 0;
        return `<button type="button" class="chip" role="radio" data-t="${App.escapeHtml(t)}" aria-checked="${t === tamanho}" ${sem ? 'disabled title="Sem estoque"' : ''}>${App.escapeHtml(t)}</button>`;
      }).join('');
      el.querySelector('#sel-cores').innerHTML = cores.map((c) => {
        const sem = estoqueDe(tamanho, c) === 0;
        return `<button type="button" class="chip" role="radio" data-c="${App.escapeHtml(c)}" aria-checked="${c === cor}" ${sem ? 'disabled title="Sem estoque"' : ''}>${App.bolinhaCor(c)}${App.escapeHtml(c)}</button>`;
      }).join('');

      el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { tamanho = b.dataset.t; if (cor && estoqueDe(tamanho, cor) === 0) cor = null; qtd = 1; desenhar(); }));
      el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { cor = b.dataset.c; qtd = 1; desenhar(); }));

      const v = variacaoAtual();
      const livre = v ? v.estoque - noCarrinho(v.sku) : 0;
      if (v) qtd = Math.min(qtd, Math.max(1, livre));
      el.querySelector('#qtd-valor').textContent = qtd;
      el.querySelector('#disponivel').textContent = v
        ? (livre > 0 ? `${livre} disponíve${livre === 1 ? 'l' : 'is'} · SKU ${v.sku}` : 'Todo o estoque já está na venda')
        : 'Selecione tamanho e cor';
      el.querySelector('#btn-adicionar').disabled = !v || livre <= 0;
      App.icones();
    }

    el.querySelector('#qtd-menos').addEventListener('click', () => { qtd = Math.max(1, qtd - 1); desenhar(); });
    el.querySelector('#qtd-mais').addEventListener('click', () => {
      const v = variacaoAtual();
      const limite = v ? v.estoque - noCarrinho(v.sku) : 1;
      qtd = Math.min(Math.max(1, limite), qtd + 1);
      desenhar();
    });

    function confirmar() {
      const v = variacaoAtual();
      if (!v) return App.toast('Selecione tamanho e cor.', 'erro');
      if (adicionarItem(produto, v, qtd)) resetarMultiplicador();
      fechar();
      setTimeout(() => inputBusca.focus(), 30);
    }

    desenhar();
  }

  /* ==================================================================
     ITENS DA VENDA
     ================================================================== */
  function adicionarItem(produto, variacao, qtd = 1) {
    const existente = carrinho.find((i) => i.sku === variacao.sku);
    const atual = existente ? existente.qtd : 0;
    if (atual + qtd > variacao.estoque) {
      App.toast(`Estoque insuficiente: só há ${variacao.estoque} peça(s) de ${variacao.tamanho}/${variacao.cor}.`, 'aviso');
      somErro();
      return false;
    }
    if (existente) existente.qtd += qtd;
    else carrinho.push({ produtoId: produto.id, sku: variacao.sku, nome: produto.nome, tamanho: variacao.tamanho, cor: variacao.cor, preco: produto.preco, qtd, max: variacao.estoque, foto: produto.foto });
    ultimoItem = { sku: variacao.sku, nome: produto.nome, tamanho: variacao.tamanho, cor: variacao.cor, qtd, foto: produto.foto, produto };
    somItem();
    destacarSku = variacao.sku;
    linhaSel = carrinho.findIndex((i) => i.sku === variacao.sku);
    desenharCarrinho();
    return true;
  }

  function removerItem(idx) {
    if (idx < 0 || idx >= carrinho.length) return;
    const [r] = carrinho.splice(idx, 1);
    if (ultimoItem && ultimoItem.sku === r.sku) ultimoItem = null;
    linhaSel = Math.min(idx, carrinho.length - 1);
    App.toast(`${r.nome} (${r.tamanho}/${r.cor}) removido da venda.`);
    desenharCarrinho();
  }

  /**
   * Totais da venda. Os preços com promoção vêm de Data.calcularCarrinho
   * (a venda é recalculada de novo na hora de gravar).
   */
  function calcularTotais() {
    const subtotal = calc ? calc.subtotal : carrinho.reduce((s, i) => s + i.preco * i.qtd, 0);
    const descontoPromocao = calc ? calc.descontoPromocao : 0;
    const base = Math.round((subtotal - descontoPromocao) * 100) / 100;
    const bruto = App.lerNumero(inputDesconto.value);
    let desconto = tipoDesconto === 'percentual' ? base * Math.min(bruto, 100) / 100 : bruto;
    desconto = Math.min(Math.max(0, desconto), base);
    desconto = Math.round(desconto * 100) / 100;
    const total = Math.round((base - desconto) * 100) / 100;
    const percentualDesconto = base ? (desconto / base) * 100 : 0;
    return { subtotal, descontoPromocao, base, desconto, percentualDesconto, total, itens: carrinho.reduce((s, i) => s + i.qtd, 0) };
  }

  /** O desconto manual passa do limite do vendedor? (dono não tem limite) */
  function descontoAcimaDoLimite(t = calcularTotais()) {
    return App.usuario && App.usuario.perfil !== 'dono' && t.desconto > 0 && t.percentualDesconto > Number(regras.limiteDescontoVendedor) + 0.001;
  }

  /** Visor grande com o último item lido */
  function desenharUltimo(precoDe) {
    const el = $('ultimo-item');
    const naVenda = ultimoItem && carrinho.find((i) => i.sku === ultimoItem.sku);
    if (!naVenda) {
      el.innerHTML = `
        <div class="ultimo-vazio">
          <span class="ultimo-icone"><i data-lucide="scan-barcode"></i></span>
          <div>
            <strong>${carrinho.length ? 'Pronto para o próximo item' : (caixa ? 'Caixa livre' : 'Caixa fechado')}</strong>
            <span>${caixa ? 'Leia o código de barras da peça ou pressione F2 para consultar.' : 'Abra o caixa para começar a vender.'}</span>
          </div>
        </div>`;
      return;
    }
    const p = precoDe(naVenda.sku) || { preco: naVenda.preco, precoOriginal: naVenda.preco };
    el.innerHTML = `
      <div class="ultimo-lido">
        ${App.thumb(ultimoItem.produto)}
        <div class="ultimo-info">
          <span class="ultimo-rotulo">Último item</span>
          <strong>${App.escapeHtml(naVenda.nome)}</strong>
          <span class="ultimo-variacao">${App.bolinhaCor(naVenda.cor)} ${App.escapeHtml(naVenda.tamanho)} · ${App.escapeHtml(naVenda.cor)} · <span class="mono">${App.escapeHtml(naVenda.sku)}</span></span>
        </div>
        <div class="ultimo-valores">
          <span>${ultimoItem.qtd} × ${App.formatarMoeda(p.preco)}</span>
          <strong>${App.formatarMoeda(p.preco * ultimoItem.qtd)}</strong>
        </div>
      </div>`;
  }

  async function desenharCarrinho() {
    // Recalcula promoções da venda
    const seq = ++calcSeq;
    const resultado = carrinho.length ? await Data.calcularCarrinho(carrinho.map((i) => ({ sku: i.sku, qtd: i.qtd }))) : null;
    if (seq !== calcSeq) return; // venda mudou durante o cálculo
    calc = resultado;
    const precoDe = (sku) => (calc ? calc.itens.find((x) => x.sku === sku) : null);

    const pecas = carrinho.reduce((s, i) => s + i.qtd, 0);
    $('contagem-itens').textContent = `${carrinho.length} ${carrinho.length === 1 ? 'item' : 'itens'} · ${pecas} ${pecas === 1 ? 'peça' : 'peças'}`;

    const lista = $('itens-carrinho');
    if (!carrinho.length) {
      lista.innerHTML = `<tr class="linha-vazia"><td colspan="6">${App.estadoVazio({ icone: 'receipt', titulo: 'Nenhum item na venda', texto: 'Os produtos lidos aparecem aqui, como no cupom.' })}</td></tr>`;
    } else {
      if (linhaSel >= carrinho.length) linhaSel = carrinho.length - 1;
      lista.innerHTML = carrinho.map((i, idx) => {
        const p = precoDe(i.sku) || { preco: i.preco, precoOriginal: i.preco };
        const emPromo = p.preco < p.precoOriginal;
        return `
        <tr class="${idx === linhaSel ? 'selecionada' : ''}${i.sku === destacarSku ? ' recem' : ''}" data-idx="${idx}" aria-selected="${idx === linhaSel}">
          <td class="item-num">${String(idx + 1).padStart(3, '0')}</td>
          <td>
            <div class="item-nome">${App.escapeHtml(i.nome)}</div>
            <div class="item-sub">${App.bolinhaCor(i.cor)} ${App.escapeHtml(i.tamanho)} · ${App.escapeHtml(i.cor)} · <span class="mono">${App.escapeHtml(i.sku)}</span></div>
            ${p.promocao ? `<div class="item-promo"><i data-lucide="badge-percent"></i>${App.escapeHtml(p.promocao.nome)}</div>` : ''}
            ${p.gratis ? `<div class="item-promo">${p.gratis} grátis — ${App.escapeHtml(p.promocaoLeve.nome)}</div>` : ''}
          </td>
          <td class="texto-centro">
            <div class="qtd">
              <button type="button" data-menos="${idx}" aria-label="Diminuir ${App.escapeHtml(i.nome)}"><i data-lucide="minus"></i></button>
              <span aria-label="Quantidade">${i.qtd}</span>
              <button type="button" data-mais="${idx}" aria-label="Aumentar ${App.escapeHtml(i.nome)}" ${i.qtd >= i.max ? 'disabled' : ''}><i data-lucide="plus"></i></button>
            </div>
          </td>
          <td class="num">${emPromo ? `<s class="texto-3">${App.formatarMoeda(p.precoOriginal)}</s><br><span style="color:var(--cor-sucesso)">${App.formatarMoeda(p.preco)}</span>` : App.formatarMoeda(p.preco)}</td>
          <td class="num item-total">${App.formatarMoeda(p.preco * i.qtd)}</td>
          <td class="col-acoes"><button type="button" class="btn-icone perigo" data-remover="${idx}" aria-label="Remover ${App.escapeHtml(i.nome)}"><i data-lucide="x"></i></button></td>
        </tr>`;
      }).join('');

      lista.querySelectorAll('[data-menos]').forEach((b) => b.addEventListener('click', () => {
        const idx = Number(b.dataset.menos);
        const i = carrinho[idx];
        if (i.qtd > 1) { i.qtd--; linhaSel = idx; desenharCarrinho(); } else removerItem(idx);
      }));
      lista.querySelectorAll('[data-mais]').forEach((b) => b.addEventListener('click', () => {
        const idx = Number(b.dataset.mais);
        const i = carrinho[idx];
        if (i.qtd < i.max) { i.qtd++; somItem(); } else { somErro(); App.toast('Não há mais peças desse tamanho/cor em estoque.', 'aviso'); }
        linhaSel = idx;
        desenharCarrinho();
      }));
      lista.querySelectorAll('[data-remover]').forEach((b) => b.addEventListener('click', () => removerItem(Number(b.dataset.remover))));
      lista.querySelectorAll('tr[data-idx]').forEach((tr) => tr.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        linhaSel = Number(tr.dataset.idx);
        lista.querySelectorAll('tr[data-idx]').forEach((x) => { x.classList.toggle('selecionada', x === tr); x.setAttribute('aria-selected', String(x === tr)); });
      }));
      const alvo = lista.querySelector('.recem') || lista.querySelector('.selecionada');
      if (alvo) alvo.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    desenharUltimo(precoDe);
    destacarSku = null;
    atualizarTotais();
    App.icones();
  }

  function atualizarTotais() {
    const t = calcularTotais();
    $('subtotal').textContent = App.formatarMoeda(t.subtotal);
    $('valor-desconto').textContent = '— ' + App.formatarMoeda(t.desconto);
    const novoTotal = App.formatarMoeda(t.total);
    if ($('total').textContent !== novoTotal) {
      $('total').textContent = novoTotal;
      const visor = document.querySelector('.visor-total');
      visor.classList.remove('pulsar'); void visor.offsetWidth; visor.classList.add('pulsar');
    }
    $('total-mobile').textContent = App.formatarMoeda(t.total);
    $('qtd-mobile').textContent = `${t.itens} ${t.itens === 1 ? 'item' : 'itens'}`;

    // "Leve X pague Y" aparece como linha de desconto
    $('linhas-promocao').innerHTML = (calc ? calc.descontosPromocao : []).map((d) => `
      <div class="visor-promo"><span>${App.escapeHtml(d.nome)}</span><span>— ${App.formatarMoeda(d.valor)}</span></div>`).join('');

    // Limite de desconto do vendedor
    const aviso = $('aviso-desconto');
    if (descontoAcimaDoLimite(t)) {
      aviso.innerHTML = `Desconto de ${App.formatarPercentual(t.percentualDesconto)} passa do seu limite (${regras.limiteDescontoVendedor}%). Ao finalizar, o dono precisará autorizar.`;
      aviso.style.color = 'var(--cor-alerta)';
    } else if (t.desconto > 0) {
      aviso.textContent = `${App.formatarPercentual(t.percentualDesconto)} de desconto`;
      aviso.style.color = '';
    } else {
      aviso.textContent = App.usuario && App.usuario.perfil !== 'dono' ? `Seu limite de desconto: ${regras.limiteDescontoVendedor}%` : '';
      aviso.style.color = '';
    }

    atualizarPagamento();
  }

  /* ==================================================================
     PAGAMENTO (pode ser dividido entre várias formas)
     ================================================================== */
  const r2 = (n) => Math.round(n * 100) / 100;
  const pagoAte = () => r2(pagamentos.reduce((s, p) => s + p.valor, 0));
  const restante = () => Math.max(0, r2(calcularTotais().total - pagoAte()));

  /** Pagamento que está sendo digitado agora (ainda não adicionado) */
  function pagamentoAtual() {
    if (!formaPagamento) return null;
    const valor = r2(App.lerNumero(inputValor.value));
    if (valor <= 0) return null;
    const p = { forma: formaPagamento, valor, parcelas: formaPagamento === 'credito' ? Number(selParcelas.value) || 1 : 1 };
    if (formaPagamento === 'vale') p.codigoVale = inputVale.value.trim().toUpperCase();
    if (formaPagamento === 'crediario') {
      p.parcelas = Number($('parcelas-crediario').value) || 1;
      p.primeiroVencimento = $('vencimento-crediario').value;
    }
    return p;
  }

  /* ---------- Crediário: limite do cliente escolhido ---------- */
  async function carregarCrediario() {
    const clienteId = $('cliente').value;
    crediarioInfo = clienteId ? await Data.resumoCrediarioCliente(clienteId) : null;
    atualizarPagamento();
  }

  /** Saldo do vale consultado, descontando o que já foi lançado dele nesta venda */
  function saldoValeLivre() {
    if (!valeConsultado) return 0;
    const usado = pagamentos.filter((p) => p.forma === 'vale' && p.codigoVale === valeConsultado.codigo).reduce((s, p) => s + p.valor, 0);
    return Math.max(0, r2(valeConsultado.saldo - usado));
  }

  /** Valida um pagamento antes de lançar. Retorna mensagem de erro ou null. */
  function validarPagamento(p, falta) {
    if (!p) return 'Informe o valor.';
    if (p.forma !== 'dinheiro' && p.valor > falta + 0.001) return `${App.FORMAS_CURTAS[p.forma]} não pode passar do que falta (${App.formatarMoeda(falta)}). Só dinheiro gera troco.`;
    if (p.forma === 'vale') {
      if (!valeConsultado || valeConsultado.codigo !== p.codigoVale) return 'Consulte o código do vale-troca.';
      if (p.valor > saldoValeLivre() + 0.001) return `O vale tem só ${App.formatarMoeda(saldoValeLivre())} de saldo.`;
    }
    if (p.forma === 'crediario') {
      if (pagamentos.some((x) => x.forma === 'crediario')) return 'Já há um lançamento de crediário nesta venda.';
      if (!$('cliente').value) return 'Escolha o cliente para vender no crediário.';
      if (!crediarioInfo) return 'Carregando o limite do cliente…';
      if (crediarioInfo.limite <= 0) return 'Este cliente não tem limite de crédito (defina em Clientes).';
      if (crediarioInfo.vencido > 0) return `Cliente com ${App.formatarMoeda(crediarioInfo.vencido)} vencido. Receba no Caixa antes.`;
      if (p.valor > crediarioInfo.disponivel + 0.001) return `Limite disponível: ${App.formatarMoeda(crediarioInfo.disponivel)}.`;
      if (!p.primeiroVencimento) return 'Informe o 1º vencimento.';
    }
    return null;
  }

  function atualizarPagamento() {
    const t = calcularTotais();
    const falta = restante();

    // Valor sugerido acompanha o que falta (até o operador digitar)
    // Dividindo: a 1ª parte começa vazia (o operador digita quanto paga nela);
    // as próximas já vêm com o que falta.
    const primeiraParte = dividindo && !pagamentos.length;
    if (formaPagamento && !valorEditado) {
      const sugerido = formaPagamento === 'vale' ? Math.min(falta, saldoValeLivre()) : falta;
      inputValor.value = !primeiraParte && sugerido > 0 ? App.formatarValorInput(sugerido) : '';
    }
    inputValor.placeholder = primeiraParte ? 'Quanto vai pagar nesta forma?' : '0,00';

    // Parcelas do crédito (sem juros, parcela mínima) sobre o valor no cartão
    const baseCredito = App.lerNumero(inputValor.value) || falta;
    const maxParcelas = Math.max(1, Math.min(PARCELAS_MAX, Math.floor(baseCredito / PARCELA_MINIMA)));
    const atual = Number(selParcelas.value) || 1;
    App.preencherSelect(selParcelas, Array.from({ length: maxParcelas }, (_, k) => ({
      valor: k + 1, texto: `${k + 1}x de ${App.formatarMoeda(baseCredito / (k + 1))} sem juros`
    })), { valor: Math.min(atual, maxParcelas) });

    // Atalhos de dinheiro (sobre o que falta)
    const atalhos = $('atalhos-dinheiro');
    atalhos.classList.toggle('oculto', formaPagamento !== 'dinheiro' || falta <= 0 || primeiraParte);
    // Atalhos ao dividir: metade / tudo o que falta
    const atDiv = $('atalhos-dividir');
    atDiv.classList.toggle('oculto', !dividindo || !formaPagamento || falta <= 0);
    const metade = r2(falta / 2);
    atDiv.innerHTML = `<button type="button" class="chip" data-parte="${metade}">Metade · ${App.formatarMoeda(metade)}</button>
      <button type="button" class="chip" data-parte="${falta}">Tudo que falta · ${App.formatarMoeda(falta)}</button>`;
    atDiv.querySelectorAll('[data-parte]').forEach((b) => b.addEventListener('click', () => {
      inputValor.value = App.formatarValorInput(b.dataset.parte);
      valorEditado = true;
      atualizarPagamento();
      inputValor.focus();
    }));
    const sugestoes = [...new Set([falta, Math.ceil(falta / 10) * 10, Math.ceil(falta / 50) * 50, Math.ceil(falta / 100) * 100])].filter((v) => v > 0).slice(0, 4);
    atalhos.innerHTML = sugestoes.map((v, i) => `<button type="button" class="chip" data-valor="${v}">${i === 0 ? 'Exato' : App.formatarMoeda(v)}</button>`).join('');
    atalhos.querySelectorAll('[data-valor]').forEach((b) => b.addEventListener('click', () => {
      inputValor.value = App.formatarValorInput(b.dataset.valor);
      valorEditado = true;
      atualizarPagamento();
    }));

    // Partes já lançadas (com barra de progresso pago × total)
    const pago = pagoAte();
    $('partes-pagamento').classList.toggle('oculto', !pagamentos.length);
    $('partes-resumo').textContent = `${App.formatarMoeda(pago)} de ${App.formatarMoeda(t.total)}`;
    $('partes-progresso').style.width = `${t.total ? Math.min(100, (pago / t.total) * 100) : 0}%`;
    const btnDiv = $('btn-dividir');
    btnDiv.setAttribute('aria-pressed', String(dividindo || pagamentos.length > 0));
    btnDiv.disabled = pagamentos.length > 0 || !carrinho.length;
    btnDiv.title = pagamentos.length ? 'Remova as partes lançadas para voltar a pagar de uma vez' : 'Pagar parte em uma forma e o resto em outra';
    $('lista-pagamentos').innerHTML = pagamentos.map((p, i) => `
      <li class="lista-item" style="padding:8px 0">
        <span class="stat-icone" style="width:30px;height:30px"><i data-lucide="${{ pix: 'qr-code', dinheiro: 'banknote', vale: 'ticket' }[p.forma] || 'credit-card'}"></i></span>
        <div class="info"><div class="titulo">${App.nomePagamento(p)}${p.codigoVale ? ` · <span class="mono">${App.escapeHtml(p.codigoVale)}</span>` : ''}</div></div>
        <span class="valor">${App.formatarMoeda(p.valor)}</span>
        <button type="button" class="btn-icone perigo" data-remover-pag="${i}" aria-label="Remover pagamento ${App.nomePagamento(p)}"><i data-lucide="x"></i></button>
      </li>`).join('');
    $('lista-pagamentos').querySelectorAll('[data-remover-pag]').forEach((b) => b.addEventListener('click', () => {
      pagamentos.splice(Number(b.dataset.removerPag), 1);
      valorEditado = false;
      atualizarPagamento();
    }));

    // Resumo: falta pagar / troco (contando o que está sendo digitado)
    const atualP = pagamentoAtual();
    const totalComAtual = r2(pagoAte() + (atualP ? atualP.valor : 0));
    const troco = r2(totalComAtual - t.total);
    const faltaFinal = Math.max(0, r2(t.total - totalComAtual));
    $('restante').textContent = App.formatarMoeda(faltaFinal);
    $('restante').style.color = faltaFinal > 0 && pagamentos.length ? 'var(--cor-alerta)' : '';
    $('linha-restante').classList.toggle('oculto', !pagamentos.length && !formaPagamento);
    $('linha-troco').classList.toggle('oculto', troco <= 0);
    $('troco').textContent = App.formatarMoeda(troco);
    // No visor: troco (dinheiro) ou quanto falta quando o pagamento está dividido
    const destaque = $('visor-destaque');
    if (troco > 0) { destaque.className = 'visor-destaque troco'; destaque.innerHTML = `<span>Troco</span><strong>${App.formatarMoeda(troco)}</strong>`; }
    else if (carrinho.length && pagoAte() > 0 && faltaFinal > 0) { destaque.className = 'visor-destaque falta'; destaque.innerHTML = `<span>Falta pagar</span><strong>${App.formatarMoeda(faltaFinal)}</strong>`; }
    else { destaque.className = 'visor-destaque oculto'; destaque.innerHTML = ''; }

    // Ajuda do campo valor
    // Crediário: parcelas sobre o valor e situação do cliente
    if (formaPagamento === 'crediario') {
      const base = App.lerNumero(inputValor.value) || falta;
      const atualCred = Number($('parcelas-crediario').value) || 1;
      App.preencherSelect($('parcelas-crediario'), Array.from({ length: PARCELAS_MAX }, (_, k) => ({
        valor: k + 1, texto: `${k + 1}x de ${App.formatarMoeda(base / (k + 1))}`
      })), { valor: atualCred });
      const info = $('info-crediario');
      if (!$('cliente').value) { info.textContent = 'Escolha o cliente acima para vender no crediário.'; info.style.color = 'var(--cor-alerta)'; }
      else if (crediarioInfo) {
        const c = crediarioInfo;
        info.textContent = c.limite <= 0 ? 'Cliente sem limite de crédito (defina em Clientes).'
          : c.vencido > 0 ? `Cliente com ${App.formatarMoeda(c.vencido)} em parcelas vencidas — receba no Caixa antes.`
          : `Limite ${App.formatarMoeda(c.limite)} · em aberto ${App.formatarMoeda(c.emAberto)} · disponível ${App.formatarMoeda(c.disponivel)}`;
        info.style.color = c.limite <= 0 || c.vencido > 0 ? 'var(--cor-perigo)' : 'var(--cor-sucesso)';
      }
    }

    const rotulos = { dinheiro: 'Valor recebido em dinheiro', vale: 'Valor a usar do vale', credito: 'Valor no crédito', debito: 'Valor no débito', pix: 'Valor no Pix', crediario: 'Valor no crediário' };
    $('rot-valor').textContent = rotulos[formaPagamento] || 'Valor';
    $('ajuda-valor').textContent = pagamentos.length || (atualP && atualP.valor < t.total)
      ? `Falta ${App.formatarMoeda(falta)} — pode dividir em mais de uma forma.` : '';

    // Pode finalizar?
    let motivo = '';
    if (!caixa) motivo = 'Abra o caixa para vender.';
    else if (!carrinho.length) motivo = 'Adicione produtos ao carrinho.';
    else if (pagoAte() > t.total + 0.001) motivo = 'Os pagamentos lançados passam do total. Remova algum.';
    else if (!pagamentos.length && !formaPagamento) motivo = 'Escolha a forma de pagamento.';
    else if (faltaFinal > 0) motivo = `Falta pagar ${App.formatarMoeda(faltaFinal)}.`;
    else if (atualP) {
      const erro = validarPagamento(atualP, falta);
      if (erro) motivo = erro;
    }
    btnFinalizar.disabled = !!motivo;
    $('motivo-bloqueio').textContent = carrinho.length ? motivo : '';
    // Botão "Lançar esta parte": só aparece quando há divisão em andamento
    const parcial = !!atualP && atualP.valor < falta - 0.001;
    const btnAdd = $('btn-add-pagamento');
    btnAdd.classList.toggle('oculto', !(dividindo || pagamentos.length || parcial));
    btnAdd.disabled = !parcial;
    $('texto-add-pagamento').textContent = parcial
      ? `Lançar ${App.formatarMoeda(atualP.valor)} no ${App.FORMAS_CURTAS[atualP.forma] || 'pagamento'} e pagar o resto com outra forma`
      : atualP ? 'Este valor completa o pagamento — é só finalizar (F9)'
      : (formaPagamento ? 'Digite o valor desta parte' : 'Escolha a forma desta parte');
    App.icones();
  }

  function selecionarForma(forma) {
    formaPagamento = forma;
    valorEditado = false;
    document.querySelectorAll('[data-forma]').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.forma === forma)));
    $('pag-detalhe').classList.toggle('oculto', !forma);
    $('campo-parcelas').classList.toggle('oculto', forma !== 'credito');
    $('campo-vale').classList.toggle('oculto', forma !== 'vale');
    $('campo-crediario').classList.toggle('oculto', forma !== 'crediario');
    if (forma === 'vale') carregarValesCliente();
    if (forma === 'crediario') {
      if (!$('vencimento-crediario').value) {
        const d = new Date(); d.setDate(d.getDate() + 30);
        $('vencimento-crediario').value = App.dataInput(d);
      }
      carregarCrediario();
    }
    atualizarPagamento();
    if (forma === 'vale') setTimeout(() => inputVale.focus(), 30);
    else if (forma === 'dinheiro' || (forma && dividindo)) setTimeout(() => { inputValor.focus(); inputValor.select(); }, 30);
  }

  /* ---------- Desconto (R$ ou %) ---------- */
  document.querySelectorAll('[data-desc]').forEach((b) => b.addEventListener('click', () => {
    tipoDesconto = b.dataset.desc;
    document.querySelectorAll('[data-desc]').forEach((x) => {
      x.setAttribute('aria-checked', String(x === b));
      x.setAttribute('aria-pressed', String(x === b));
    });
    inputDesconto.placeholder = tipoDesconto === 'percentual' ? '0' : '0,00';
    atualizarTotais();
  }));
  inputDesconto.addEventListener('input', atualizarTotais);

  /* ---------- Forma de pagamento ---------- */
  document.querySelectorAll('[data-forma]').forEach((b) => b.addEventListener('click', () => selecionarForma(b.dataset.forma)));
  inputValor.addEventListener('input', () => { valorEditado = true; atualizarPagamento(); });
  selParcelas.addEventListener('change', atualizarPagamento);

  // "Adicionar e pagar o resto com outra forma"
  $('btn-add-pagamento').addEventListener('click', () => {
    const p = pagamentoAtual();
    const erro = validarPagamento(p, restante());
    if (erro) return App.toast(erro, 'erro');
    pagamentos.push(p);
    App.toast(`${App.nomePagamento(p)}: ${App.formatarMoeda(p.valor)} lançado. Falta ${App.formatarMoeda(restante())} — escolha a próxima forma.`, 'sucesso');
    selecionarForma('');
  });
  // Enter no valor: lança a parte (quando é só uma parte do total) ou finaliza
  inputValor.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const btnAdd = $('btn-add-pagamento');
    if (!btnAdd.disabled && !btnAdd.classList.contains('oculto')) btnAdd.click();
    else if (!btnFinalizar.disabled) finalizar();
  });
  // Liga/desliga o modo "dividir pagamento"
  $('btn-dividir').addEventListener('click', () => {
    if (pagamentos.length) return;
    dividindo = !dividindo;
    valorEditado = false;
    if (dividindo) {
      App.toast('Escolha a 1ª forma e digite quanto vai pagar nela. O resto vai para a próxima forma.');
      if (formaPagamento) setTimeout(() => inputValor.focus(), 30);
    }
    atualizarPagamento();
  });

  /* ---------- Vale-troca ---------- */
  async function consultarVale(codigo) {
    const info = $('info-vale');
    valeConsultado = null;
    if (!codigo) { info.textContent = ''; return atualizarPagamento(); }
    try {
      const v = await Data.obterCreditoPorCodigo(codigo);
      if (v.saldo <= 0) {
        info.textContent = `Vale ${v.codigo} sem saldo (já usado).`;
        info.style.color = 'var(--cor-perigo)';
      } else {
        valeConsultado = { codigo: v.codigo, saldo: v.saldo, clienteNome: v.clienteNome };
        inputVale.value = v.codigo;
        info.textContent = `Saldo de ${App.formatarMoeda(v.saldo)} · ${v.clienteNome}`;
        info.style.color = 'var(--cor-sucesso)';
      }
    } catch (e) {
      info.textContent = e.message;
      info.style.color = 'var(--cor-perigo)';
    }
    valorEditado = false;
    atualizarPagamento();
  }
  $('btn-consultar-vale').addEventListener('click', () => consultarVale(inputVale.value.trim()));
  inputVale.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); consultarVale(inputVale.value.trim()); } });

  // Vales do cliente selecionado aparecem como atalho
  async function carregarValesCliente() {
    const el = $('vales-cliente');
    const clienteId = $('cliente').value;
    if (!clienteId) { el.innerHTML = ''; return; }
    const vales = await Data.listarCreditos({ clienteId, comSaldo: true });
    el.innerHTML = vales.length
      ? vales.map((v) => `<button type="button" class="chip" data-vale="${App.escapeHtml(v.codigo)}"><i data-lucide="ticket"></i>${App.escapeHtml(v.codigo)} · ${App.formatarMoeda(v.saldo)}</button>`).join('')
      : '<span class="texto-xs texto-3">Este cliente não tem vale-troca com saldo.</span>';
    el.querySelectorAll('[data-vale]').forEach((b) => b.addEventListener('click', () => consultarVale(b.dataset.vale)));
    App.icones();
  }

  /* ---------- Cliente ---------- */
  const clientes = await Data.listarClientes();
  App.preencherSelect($('cliente'), clientes.map((c) => ({ valor: c.id, texto: `${c.nome} — ${c.documento}` })), { vazio: 'Consumidor final (não identificado)' });
  // Nome do cliente sem cadastro: só aparece com "Consumidor final" escolhido
  function atualizarClienteAvulso() {
    const comCadastro = !!$('cliente').value;
    $('cliente-avulso').classList.toggle('oculto', comCadastro);
    $('cliente-salvar-rotulo').classList.toggle('oculto', comCadastro || !$('cliente-nome').value.trim());
  }
  $('cliente-nome').addEventListener('input', atualizarClienteAvulso);
  $('cliente').addEventListener('change', () => {
    atualizarClienteAvulso();
    if (formaPagamento === 'vale') carregarValesCliente();
    crediarioInfo = null;
    carregarCrediario();
  });
  $('parcelas-crediario').addEventListener('change', atualizarPagamento);
  $('vencimento-crediario').addEventListener('change', atualizarPagamento);

  /* ---------- Caixa: só vende com caixa aberto ---------- */
  let proximoNumero = '—';
  async function verificarCaixa() {
    const controlaCaixa = !!(App.loja && App.loja.controlarCaixa);
    caixa = await Data.obterCaixaAberto();
    // Sem controle de caixa: vende direto, sem abrir/fechar
    if (!controlaCaixa) caixa = { livre: true };
    const vendas = await Data.listarVendas();
    proximoNumero = vendas.reduce((m, v) => Math.max(m, Number(v.numero) || 0), 0) + 1;
    const aviso = $('aviso-caixa');
    const operador = App.usuario ? App.usuario.nome : '';
    if (!caixa) {
      aviso.innerHTML = `<div class="caixa-status fechado">
        <span class="caixa-luz" aria-hidden="true"></span>
        <div class="caixa-status-info"><strong>Caixa fechado</strong><span>Abra o caixa com o troco inicial para começar a vender.</span></div>
        <button type="button" class="btn btn-primario" id="btn-abrir-caixa"><i data-lucide="lock-open"></i>Abrir caixa</button></div>`;
      $('btn-abrir-caixa').addEventListener('click', abrirCaixaRapido);
    } else {
      aviso.innerHTML = `<div class="caixa-status">
        <span class="caixa-luz" aria-hidden="true"></span>
        ${caixa.livre
          ? `<div class="caixa-status-info"><strong>Frente de caixa</strong><span>${App.escapeHtml((App.loja && App.loja.nome) || '')}</span></div>`
          : `<div class="caixa-status-info"><strong>Caixa aberto</strong><span>desde ${App.formatarDataHora(caixa.abertoEm)} · <a href="caixa.html">ver caixa</a></span></div>`}
        <div class="caixa-status-item"><span>Operador(a)</span><strong>${App.escapeHtml(operador)}</strong></div>
        <div class="caixa-status-item"><span>Data</span><strong id="relogio-data"></strong></div>
        <div class="caixa-status-item"><span>Hora</span><strong id="relogio-hora" class="num"></strong></div>
        <div class="caixa-status-item"><span>Venda nº</span><strong class="num">${proximoNumero}</strong></div>
        <button type="button" class="btn-icone btn-som" id="btn-som" aria-label="Som do caixa"></button></div>`;
      atualizarRelogio();
      $('btn-som').addEventListener('click', alternarSom);
      desenharBotaoSom();
    }
    desenharCarrinho();
    App.icones();
  }

  function atualizarRelogio() {
    const agora = new Date();
    const d = $('relogio-data'), h = $('relogio-hora');
    if (d) d.textContent = agora.toLocaleDateString('pt-BR');
    if (h) h.textContent = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  setInterval(atualizarRelogio, 15000);

  function abrirCaixaRapido() {
    const { el, fechar } = App.abrirModal({
      titulo: 'Abrir caixa',
      tamanho: 'sm',
      corpo: `<div class="campo">
          <label for="troco-inicial">Troco inicial na gaveta</label>
          <div class="input-grupo"><span class="prefixo">R$</span><input class="input" id="troco-inicial" inputmode="decimal" data-mascara="moeda" value="200,00"></div>
          <span class="ajuda">Conte o dinheiro que já está na gaveta antes da primeira venda.</span>
        </div>`,
      acoes: [
        { texto: 'Cancelar' },
        { texto: 'Abrir caixa', classe: 'btn-primario', icone: 'lock-open', aoClicar: async (_, botao) => {
          botao.disabled = true;
          try {
            await Data.abrirCaixa({ valorInicial: App.lerNumero(el.querySelector('#troco-inicial').value) });
            fechar();
            App.toast('Caixa aberto. Boas vendas!');
            verificarCaixa();
          } catch (e) { App.toast(e.message, 'erro'); botao.disabled = false; }
        } }
      ]
    });
  }

  /* ---------- Limpar ---------- */
  $('btn-limpar').addEventListener('click', async () => {
    if (!carrinho.length) return;
    if (await App.confirmar({ titulo: 'Limpar carrinho?', mensagem: 'Todos os itens serão removidos.', textoConfirmar: 'Limpar', perigo: true })) {
      resetarVenda();
    }
  });

  function resetarVenda() {
    carrinho = [];
    pagamentos = [];
    valeConsultado = null;
    crediarioInfo = null;
    $('vencimento-crediario').value = '';
    inputDesconto.value = '';
    inputVale.value = '';
    $('info-vale').textContent = '';
    $('cliente').value = '';
    $('cliente-nome').value = '';
    $('cliente-salvar').checked = false;
    atualizarClienteAvulso();
    dividindo = false;
    ultimoItem = null;
    linhaSel = -1;
    resetarMultiplicador();
    selecionarForma('');
    desenharCarrinho();
    alternarCarrinho(false);
  }

  /* ==================================================================
     CARRINHO COMO PAINEL INFERIOR (celular/tablet)
     ================================================================== */
  const telaPequena = window.matchMedia('(max-width: 1199px)');
  function alternarCarrinho(abrir) {
    elCarrinho.classList.toggle('expandido', abrir);
    btnToggle.setAttribute('aria-expanded', String(abrir));
    atualizarInert();
  }
  // Conteúdo recolhido fica fora do foco do teclado
  function atualizarInert() {
    corpoCarrinho.inert = telaPequena.matches && !elCarrinho.classList.contains('expandido');
  }
  btnToggle.addEventListener('click', () => alternarCarrinho(!elCarrinho.classList.contains('expandido')));
  telaPequena.addEventListener('change', atualizarInert);
  atualizarInert();

  /* ==================================================================
     BUSCA E CÓDIGO DE BARRAS
     ================================================================== */
  // Enter no campo: código de barras/SKU entra direto; texto abre a consulta
  $('form-busca').addEventListener('submit', async (e) => {
    e.preventDefault();
    const termo = inputBusca.value.trim();
    if (!termo) return;
    const achado = await Data.buscarPorCodigo(termo);
    inputBusca.value = '';
    if (achado) { lerCodigo(achado); return; }
    const lista = filtrarProdutos(termo, '').filter((p) => p.estoqueTotal > 0);
    if (lista.length === 1) abrirSeletor(lista[0]);
    else if (!lista.length) { App.toast(`Nenhum produto encontrado para "${termo}".`, 'aviso'); sinalizarLeitura(false, 'Não encontrado'); }
    else abrirConsulta(termo);
  });
  $('btn-consultar').addEventListener('click', () => abrirConsulta(inputBusca.value.trim()));

  /* ==================================================================
     LEITOR DE CÓDIGO DE BARRAS EM QUALQUER LUGAR DA TELA
     O leitor USB "digita" muito rápido e termina com Enter. Se isso
     acontecer com o cursor em outro campo (desconto, valor, cliente…),
     o código é desviado para o carrinho e o campo volta ao que era.
     ================================================================== */
  const LEITOR_MIN_CARACTERES = 6;
  const LEITOR_MS_POR_TECLA = 35;   // pessoas digitam bem mais devagar
  const LEITOR_PAUSA_MS = 100;      // pausa maior que isso = começou outra digitação
  const leitor = { buf: '', inicio: 0, ultimo: 0, alvo: null, valorAntes: null };

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const agora = performance.now();

    if (e.key === 'Enter') {
      const pareceLeitor = leitor.buf.length >= LEITOR_MIN_CARACTERES
        && agora - leitor.ultimo < LEITOR_PAUSA_MS
        && (leitor.ultimo - leitor.inicio) / (leitor.buf.length - 1) < LEITOR_MS_POR_TECLA;
      const codigo = leitor.buf;
      const alvo = leitor.alvo;
      const valorAntes = leitor.valorAntes;
      leitor.buf = '';
      // Na busca o próprio formulário trata; no campo de vale o código é do vale
      if (!pareceLeitor || e.target === inputBusca || e.target === inputVale) return;

      e.preventDefault();
      e.stopPropagation();
      // Desfaz o que o leitor "digitou" no campo em que estava o cursor
      if (alvo && valorAntes !== null && 'value' in alvo && alvo.value !== valorAntes) {
        alvo.value = valorAntes;
        alvo.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (document.querySelector('.modal-overlay')) {
        App.toast('Feche a janela aberta para ler o código.', 'aviso');
        sinalizarLeitura(false, 'Feche a janela aberta');
        return;
      }
      lerCodigoGlobal(codigo);
      return;
    }

    if (e.key.length !== 1) return; // Shift, Tab, setas…
    if (agora - leitor.ultimo > LEITOR_PAUSA_MS) {
      leitor.buf = '';
      leitor.inicio = agora;
      leitor.alvo = e.target;
      leitor.valorAntes = 'value' in e.target ? e.target.value : null;
    }
    leitor.buf += e.key;
    leitor.ultimo = agora;
  }, true);

  async function lerCodigoGlobal(codigo) {
    const achado = await Data.buscarPorCodigo(codigo.trim());
    if (!achado) {
      App.toast(`Código ${codigo} não encontrado.`, 'aviso');
      sinalizarLeitura(false, 'Código não encontrado');
      return;
    }
    lerCodigo(achado);
  }

  /** Coloca a peça lida no carrinho, com bipe e destaque */
  function lerCodigo({ produto, variacao }) {
    if (!caixa) {
      App.toast('Abra o caixa para começar a vender.', 'aviso');
      sinalizarLeitura(false, 'Caixa fechado');
      return;
    }
    const qtd = qtdMultiplicador();
    const ok = adicionarItem(produto, variacao, qtd);
    if (ok) resetarMultiplicador();
    sinalizarLeitura(ok, ok ? `${qtd > 1 ? qtd + '× ' : ''}${produto.nome} · ${variacao.tamanho}/${variacao.cor}` : 'Sem estoque');
  }

  /* ---------- Bipe e indicador do leitor ---------- */
  let audio = null;
  /* Som do caixa (pode ser desligado; a escolha fica neste computador) */
  let somLigado = true;
  try { somLigado = localStorage.getItem('gestaoloja:som') !== 'off'; } catch (e) { /* ignora */ }
  function contextoAudio() {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }
  /** "Bip" de leitor de mercado: tom agudo e curto, com ataque seco */
  function somItem() {
    if (!somLigado) return;
    try {
      const ctx = contextoAudio();
      const t0 = ctx.currentTime + 0.005;
      const filtro = ctx.createBiquadFilter();
      filtro.type = 'lowpass';
      filtro.frequency.value = 5200;
      const vol = ctx.createGain();
      vol.gain.setValueAtTime(0.0001, t0);
      vol.gain.linearRampToValueAtTime(0.16, t0 + 0.004);
      vol.gain.setValueAtTime(0.16, t0 + 0.095);
      vol.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
      filtro.connect(vol).connect(ctx.destination);
      [[2730, 'square', 1], [5460, 'sine', 0.25]].forEach(([freq, tipo, nivel]) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = tipo;
        osc.frequency.value = freq;
        g.gain.value = nivel;
        osc.connect(g).connect(filtro);
        osc.start(t0);
        osc.stop(t0 + 0.14);
      });
    } catch (_) { /* navegador sem áudio: segue sem som */ }
  }
  /** Som de erro: dois tons graves ("ã-ã") */
  function somErro() {
    if (!somLigado) return;
    try {
      const ctx = contextoAudio();
      [[0, 0.13], [0.17, 0.18]].forEach(([atraso, dur]) => {
        const t0 = ctx.currentTime + atraso;
        const osc = ctx.createOscillator();
        const vol = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 196;
        vol.gain.setValueAtTime(0.0001, t0);
        vol.gain.linearRampToValueAtTime(0.07, t0 + 0.01);
        vol.gain.setValueAtTime(0.07, t0 + dur - 0.03);
        vol.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(vol).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      });
    } catch (_) { /* segue sem som */ }
  }
  function alternarSom() {
    somLigado = !somLigado;
    try { localStorage.setItem('gestaoloja:som', somLigado ? 'on' : 'off'); } catch (e) { /* ignora */ }
    desenharBotaoSom();
    if (somLigado) somItem();
    App.toast(somLigado ? 'Som do caixa ligado.' : 'Som do caixa desligado.');
  }
  function desenharBotaoSom() {
    const b = $('btn-som');
    if (!b) return;
    b.innerHTML = `<i data-lucide="${somLigado ? 'volume-2' : 'volume-x'}"></i>`;
    b.setAttribute('aria-pressed', String(somLigado));
    b.title = somLigado ? 'Som ligado (clique para desligar)' : 'Som desligado (clique para ligar)';
    App.icones();
  }

  const elLeitor = $('leitor-status');
  let timerLeitor = null;
  function sinalizarLeitura(ok, texto) {
    if (!ok) somErro(); // o "bip" de sucesso já toca quando o item entra na venda
    if (!elLeitor) return;
    elLeitor.classList.remove('ok', 'erro');
    void elLeitor.offsetWidth; // reinicia a animação
    elLeitor.classList.add(ok ? 'ok' : 'erro');
    elLeitor.querySelector('span:last-child').textContent = texto;
    clearTimeout(timerLeitor);
    timerLeitor = setTimeout(() => {
      elLeitor.classList.remove('ok', 'erro');
      elLeitor.querySelector('span:last-child').textContent = 'Leitor pronto';
    }, 2200);
  }

  /* ---------- Teclas de atalho do caixa ---------- */
  // Abre o painel de pagamento (no celular/tablet ele fica recolhido embaixo)
  function focarNoPainel(el) {
    if (telaPequena.matches) alternarCarrinho(true);
    setTimeout(() => { el.focus(); if (el.select) el.select(); }, telaPequena.matches ? 320 : 0);
  }
  function executarTecla(tecla) {
    switch (tecla) {
      case 'F2': abrirConsulta(inputBusca.value.trim()); return true;
      case 'F3': inputQtd.focus(); inputQtd.select(); return true;
      case 'F4': focarNoPainel($('cliente')); return true;
      case 'F8': focarNoPainel(inputDesconto); return true;
      case 'Delete':
        if (!carrinho.length) return true;
        removerItem(linhaSel >= 0 ? linhaSel : carrinho.length - 1);
        inputBusca.focus();
        return true;
      case 'F9':
        if (!btnFinalizar.disabled) finalizar();
        else {
          const motivo = $('motivo-bloqueio').textContent || 'Escolha a forma de pagamento.';
          App.toast(motivo, 'aviso');
          if (carrinho.length && !formaPagamento && !pagamentos.length) focarNoPainel(document.querySelector('[data-forma]'));
        }
        return true;
    }
    return false;
  }
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.modal-overlay')) return; // janela aberta cuida das próprias teclas
    const alvo = e.target instanceof Element ? e.target : null;
    const emCampo = !!alvo && alvo.matches('input, select, textarea') && alvo !== inputBusca;
    if (e.key === 'Delete' && (emCampo || (e.target === inputBusca && inputBusca.value))) return; // Del apaga texto no campo
    if (['F2', 'F3', 'F4', 'F8', 'F9', 'Delete'].includes(e.key) && executarTecla(e.key)) e.preventDefault();
  });
  document.querySelectorAll('[data-tecla]').forEach((b) => b.addEventListener('click', () => executarTecla(b.dataset.tecla)));

  /* ==================================================================
     FINALIZAR VENDA
     ================================================================== */
  btnFinalizar.addEventListener('click', finalizar);

  async function finalizar() {
    const t = calcularTotais();
    // Pagamentos lançados + o que está sendo digitado agora
    const atual = pagamentoAtual();
    if (atual) {
      const erro = validarPagamento(atual, restante());
      if (erro) return App.toast(erro, 'erro');
    }
    const todos = atual ? [...pagamentos, atual] : pagamentos;

    // Desconto acima do limite do vendedor: o dono autoriza com e-mail e senha
    let autorizacao = null;
    if (descontoAcimaDoLimite(t)) {
      autorizacao = await pedirAutorizacaoDono(t);
      if (!autorizacao) return;
    }

    btnFinalizar.disabled = true;
    try {
      let clienteIdFinal = $('cliente').value || null;
      const nomeAvulso = $('cliente-nome').value.trim();
      if (!clienteIdFinal && nomeAvulso && $('cliente-salvar').checked) {
        const novo = await Data.salvarCliente({ nome: nomeAvulso });
        clienteIdFinal = novo.id;
        App.toast(`${nomeAvulso} foi salvo(a) nos clientes.`);
      }
      const venda = await Data.registrarVenda({
        clienteId: clienteIdFinal,
        clienteNomeAvulso: clienteIdFinal ? '' : $('cliente-nome').value.trim(),
        itens: carrinho.map((i) => ({ produtoId: i.produtoId, sku: i.sku, qtd: i.qtd })),
        desconto: t.desconto,
        pagamentos: todos,
        autorizacao
      });
      resetarVenda();
      await carregarProdutos();
      verificarCaixa(); // atualiza o nº da próxima venda
      mostrarSucesso(venda);
    } catch (erro) {
      App.toast(erro.message, 'erro');
      atualizarTotais();
    }
  }

  /** Modal para o dono liberar o desconto. Resolve com a autorização ou null. */
  function pedirAutorizacaoDono(t) {
    return new Promise((resolve) => {
      let concluido = false;
      const { el, fechar } = App.abrirModal({
        titulo: 'Autorização do dono',
        tamanho: 'sm',
        corpo: `
          <div class="alerta mb-4"><i data-lucide="key-round"></i>
            <span>Desconto de <strong>${App.formatarMoeda(t.desconto)}</strong> (${App.formatarPercentual(t.percentualDesconto)}) passa do limite do vendedor (${regras.limiteDescontoVendedor}%). O dono precisa autorizar.</span></div>
          <form id="form-aut" class="flex-col gap-3" novalidate>
            <div class="campo">
              <label for="aut-email">E-mail do dono</label>
              <input class="input" id="aut-email" type="email" autocomplete="off" required>
            </div>
            <div class="campo">
              <label for="aut-senha">Senha</label>
              <input class="input" id="aut-senha" type="password" autocomplete="off" required>
            </div>
          </form>`,
        acoes: [
          { texto: 'Cancelar' },
          { texto: 'Autorizar', classe: 'btn-primario', icone: 'key-round', aoClicar: autorizar }
        ],
        aoFechar: () => { if (!concluido) resolve(null); }
      });
      el.querySelector('#form-aut').addEventListener('submit', (e) => { e.preventDefault(); autorizar(null, el.querySelector('.modal-rodape .btn-primario')); });
      async function autorizar(_, botao) {
        const email = el.querySelector('#aut-email').value.trim();
        const senha = el.querySelector('#aut-senha').value;
        if (!email || !senha) return App.toast('Informe e-mail e senha do dono.', 'erro');
        botao.disabled = true;
        try {
          const aut = await Data.autorizarDono(email, senha);
          concluido = true;
          fechar();
          App.toast(`Desconto autorizado por ${aut.nome}.`);
          resolve(aut);
        } catch (e) {
          App.toast(e.message, 'erro');
          botao.disabled = false;
          el.querySelector('#aut-senha').value = '';
        }
      }
    });
  }

  /** Texto do recibo para mandar no WhatsApp */
  function textoRecibo(venda, loja) {
    const m = App.formatarMoeda;
    const linhas = [
      `*${loja.nome}*`,
      `Recibo da compra #${venda.numero} — ${App.formatarDataHora(venda.data)}`,
      '',
      ...venda.itens.map((i) => `• ${i.qtd}× ${i.nome} (${i.tamanho}/${i.cor}) — ${m(i.preco * i.qtd)}`),
      '',
      venda.desconto ? `Desconto: -${m(venda.desconto)}` : '',
      `*Total: ${m(venda.total)}*`,
      `Pagamento: ${App.nomePagamento(venda)}`,
      venda.pagamento.troco > 0 ? `Troco: ${m(venda.pagamento.troco)}` : '',
      '',
      'Trocas em até 30 dias com este recibo.',
      'Obrigado pela preferência! 💜'
    ];
    return linhas.filter((l, i, arr) => l !== '' || (arr[i - 1] !== '' && i > 0)).join('\n');
  }

  /** Venda finalizada: recibo sempre pronto (imprimir ou WhatsApp) */
  async function mostrarSucesso(venda) {
    const [recibo, loja, clientes] = await Promise.all([App.gerarCupom({ venda }), Data.obterLoja(), Data.listarClientes()]);
    const cliente = venda.clienteId ? clientes.find((c) => c.id === venda.clienteId) : null;
    const telefone = cliente && cliente.telefone ? cliente.telefone.replace(/\D/g, '') : '';
    const acoes = [];
    if (App.emiteNota) {
      acoes.push({ texto: 'Emitir nota', icone: 'file-text', aoClicar: async (_, botao) => {
        botao.disabled = true;
        try {
          const nota = await Data.emitirNota(venda.id);
          App.toast(`NFC-e nº ${nota.numero} autorizada${nota.ambiente === 'homologacao' ? ' em homologação' : ''} (simulação).`);
          abrirCupomNota(venda, nota);
        } catch (erro) {
          App.toast(erro.message, 'erro', 6000);
          botao.disabled = false;
        }
      } });
    }
    acoes.push(
      { texto: telefone ? 'Enviar no WhatsApp' : 'WhatsApp', icone: 'message-circle', aoClicar: () => {
        const url = `https://wa.me/${telefone ? '55' + telefone : ''}?text=${encodeURIComponent(textoRecibo(venda, loja))}`;
        window.open(url, '_blank', 'noopener');
      } },
      { texto: 'Imprimir recibo', icone: 'printer', aoClicar: () => App.imprimir(recibo) },
      { texto: 'Nova venda', classe: 'btn-primario', icone: 'plus', aoClicar: (fechar) => { fechar(); inputBusca.focus(); } }
    );
    App.abrirModal({
      titulo: `Venda #${venda.numero} finalizada`,
      tamanho: 'lg',
      corpo: `
        <div class="venda-ok">
          <div class="venda-ok-resumo">
            <div class="sucesso-icone"><i data-lucide="check"></i></div>
            <h3>Venda registrada!</h3>
            <p class="texto-sm">${App.escapeHtml(venda.clienteNome)} · ${App.nomePagamento(venda)}</p>
            <div class="venda-ok-total">${App.formatarMoeda(venda.total)}</div>
            ${venda.pagamento.troco > 0 ? `<div class="visor-destaque troco"><span>Troco</span><strong>${App.formatarMoeda(venda.pagamento.troco)}</strong></div>` : ''}
            <p class="texto-xs texto-3 mt-4">${telefone ? `O recibo pode ir direto para o WhatsApp de ${App.escapeHtml(cliente.nome.split(' ')[0])}.` : 'Imprima o recibo ou envie pelo WhatsApp.'}</p>
          </div>
          <div class="venda-ok-recibo" aria-label="Recibo da compra">${recibo}</div>
        </div>`,
      acoes
    });
    // Impressão automática do recibo (Configurações → Sistema)
    if (loja.imprimirReciboAuto) setTimeout(() => App.imprimir(recibo), 350);
  }

  async function abrirCupomNota(venda, nota) {
    const html = await App.gerarCupom({ venda, nota });
    App.abrirModal({
      titulo: `NFC-e nº ${nota.numero}`,
      corpo: `<div style="background:var(--cor-superficie-2);padding:24px 8px;border-radius:12px">${html}</div>`,
      acoes: [
        { texto: 'Fechar' },
        { texto: 'Imprimir', classe: 'btn-primario', icone: 'printer', aoClicar: () => App.imprimir(html) }
      ]
    });
  }

  /* ---------- Início ---------- */
  await carregarProdutos();
  regras = await Data.obterRegrasVenda();
  await verificarCaixa();
  atualizarTotais();
});
