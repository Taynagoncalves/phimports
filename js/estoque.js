/* ==========================================================================
   estoque.js — Histórico de movimentações e modal de entrada/ajuste/saída
   ========================================================================== */
App.aoIniciar(async () => {
  const POR_PAGINA = 10;
  let pagina = 1;
  let movimentacoes = [];
  let produtos = [];

  const form = document.getElementById('filtros');
  const corpo = document.getElementById('lista');

  /* ---------- Indicadores ---------- */
  async function atualizarIndicadores() {
    produtos = await Data.listarProdutos();
    const pecas = produtos.reduce((s, p) => s + p.estoqueTotal, 0);
    const valorCusto = produtos.reduce((s, p) => s + p.estoqueTotal * p.custo, 0);
    const valorVenda = produtos.reduce((s, p) => s + p.estoqueTotal * p.preco, 0);
    const variacoes = produtos.flatMap((p) => p.variacoes);
    document.getElementById('kpi-pecas').textContent = App.formatarNumero(pecas);
    document.getElementById('kpi-pecas-det').textContent = `${produtos.length} produtos · ${variacoes.length} variações`;
    document.getElementById('kpi-valor').textContent = App.formatarMoeda(valorCusto);
    document.getElementById('kpi-valor-det').textContent = `${App.formatarMoeda(valorVenda)} em preço de venda`;
    document.getElementById('kpi-zeradas').textContent = App.formatarNumero(variacoes.filter((v) => v.estoque === 0).length);
    document.getElementById('kpi-baixo').textContent = App.formatarNumero(produtos.filter((p) => p.estoqueBaixo).length);
  }

  /* ---------- Lista ---------- */
  async function carregar() {
    movimentacoes = await Data.listarMovimentacoes(App.lerFormulario(form));
    pagina = 1;
    desenhar();
  }

  function desenhar() {
    document.getElementById('contador').textContent = `${movimentacoes.length} registros`;
    if (!movimentacoes.length) {
      corpo.innerHTML = `<tr><td colspan="6">${App.estadoVazio({ icone: 'arrow-left-right', titulo: 'Nenhuma movimentação encontrada', texto: 'Ajuste os filtros ou registre uma entrada de mercadoria.' })}</td></tr>`;
      document.getElementById('paginacao').innerHTML = '';
      App.icones();
      return;
    }
    const pag = App.paginar(movimentacoes, pagina, POR_PAGINA);
    pagina = pag.pagina;
    corpo.innerHTML = pag.itens.map((m) => {
      const sinal = m.quantidade > 0 && m.tipo !== 'saida' ? '+' : m.tipo === 'saida' ? '−' : '';
      const classe = m.tipo === 'saida' || m.quantidade < 0 ? 'valor-negativo' : 'valor-positivo';
      return `
      <tr>
        <td class="cel-principal">
          <div class="titulo negrito">${App.escapeHtml(m.produtoNome)}</div>
          <div class="texto-xs texto-3 flex items-center gap-2">${m.cor ? App.bolinhaCor(m.cor) : ''}${App.escapeHtml(m.tamanho || '')} ${m.cor ? '· ' + App.escapeHtml(m.cor) : ''} · <span class="mono">${App.escapeHtml(m.sku)}</span></div>
        </td>
        <td data-label="Data" class="nowrap">${App.formatarDataHora(m.data)}</td>
        <td data-label="Tipo">${App.badgeStatus(m.tipo)}</td>
        <td data-label="Qtd." class="num negrito ${classe}">${sinal}${Math.abs(m.quantidade)}</td>
        <td data-label="Motivo">${App.escapeHtml(m.motivo || '—')}</td>
        <td data-label="Usuário">${App.escapeHtml(m.usuarioNome)}</td>
      </tr>`;
    }).join('');
    App.renderPaginacao(document.getElementById('paginacao'), {
      total: movimentacoes.length, pagina, porPagina: POR_PAGINA,
      aoMudar: (n) => { pagina = n; desenhar(); }
    });
    App.icones();
  }

  /* ==================================================================
     ABAS: Posição atual | Movimentações
     ================================================================== */
  const abas = [...document.querySelectorAll('[role=tab]')];
  function ativarAba(aba, focar = false) {
    abas.forEach((a) => {
      const ativa = a === aba;
      a.setAttribute('aria-selected', String(ativa));
      a.tabIndex = ativa ? 0 : -1;
      document.getElementById(a.getAttribute('aria-controls')).hidden = !ativa;
    });
    if (focar) aba.focus();
    history.replaceState(null, '', aba.id === 'aba-posicao' ? location.pathname : '#movimentacoes');
  }
  abas.forEach((a, i) => {
    a.addEventListener('click', () => ativarAba(a));
    a.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') ativarAba(abas[(i + 1) % abas.length], true);
    });
  });

  /* ==================================================================
     POSIÇÃO ATUAL — cada produto com a grade tamanho × cor
     ================================================================== */
  const elPosicao = document.getElementById('posicao');
  const pBusca = document.getElementById('p-busca');
  const pCategoria = document.getElementById('p-categoria');
  const pOrdem = document.getElementById('p-ordem');
  let pSituacao = '';
  const abertos = new Set();   // produtos com a grade aberta
  let todosAbertos = false;

  const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  /** Situação do produto: zerado (sem peças), baixo (abaixo do mínimo) ou ok */
  const situacao = (p) => (p.estoqueTotal === 0 ? 'zerado' : p.estoqueBaixo ? 'baixo' : 'ok');
  /** Algum tamanho/cor do produto sem peças? (cliente pede e não tem) */
  const temFuros = (p) => p.variacoes.some((v) => v.estoque === 0);

  function produtosFiltrados() {
    const termo = normalizar(pBusca.value.trim());
    const lista = produtos.filter((p) => {
      if (pCategoria.value && p.categoria !== pCategoria.value) return false;
      if (pSituacao === 'baixo' && situacao(p) === 'ok') return false;
      if (pSituacao === 'furos' && !temFuros(p)) return false;
      if (pSituacao === 'ok' && (situacao(p) !== 'ok' || temFuros(p))) return false;
      if (!termo) return true;
      return normalizar(`${p.nome} ${p.marca} ${p.variacoes.map((v) => v.sku).join(' ')}`).includes(termo);
    });
    const ordem = { zerado: 0, baixo: 1, ok: 2 };
    const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
    const criterios = {
      situacao: (a, b) => ordem[situacao(a)] - ordem[situacao(b)] || Number(temFuros(b)) - Number(temFuros(a)) || porNome(a, b),
      nome: porNome,
      mais: (a, b) => b.estoqueTotal - a.estoqueTotal || porNome(a, b),
      menos: (a, b) => a.estoqueTotal - b.estoqueTotal || porNome(a, b)
    };
    return lista.sort(criterios[pOrdem.value] || porNome);
  }

  /** Grade: linhas = cores, colunas = tamanhos, células = peças */
  function htmlGrade(p) {
    const tamanhos = [...new Set(p.variacoes.map((v) => v.tamanho))];
    const cores = [...new Set(p.variacoes.map((v) => v.cor))];
    const achar = (t, c) => p.variacoes.find((v) => v.tamanho === t && v.cor === c);
    const totalTam = (t) => p.variacoes.filter((v) => v.tamanho === t).reduce((s, v) => s + v.estoque, 0);
    const celula = (v) => {
      if (!v) return '<td class="grade-celula inexistente" title="Combinação não cadastrada">·</td>';
      const classe = v.estoque === 0 ? 'zero' : v.estoque <= 2 ? 'pouco' : '';
      return `<td class="grade-celula ${classe}" title="${App.escapeHtml(v.tamanho)} / ${App.escapeHtml(v.cor)} · SKU ${App.escapeHtml(v.sku)}">${v.estoque}</td>`;
    };
    return `
      <div class="tabela-wrap">
        <table class="grade-estoque">
          <thead><tr><th scope="col">Cor \\ Tamanho</th>${tamanhos.map((t) => `<th scope="col">${App.escapeHtml(t)}</th>`).join('')}<th scope="col" class="grade-total">Total</th></tr></thead>
          <tbody>
            ${cores.map((c) => `<tr>
              <th scope="row"><span class="flex items-center gap-2">${App.bolinhaCor(c)}${App.escapeHtml(c)}</span></th>
              ${tamanhos.map((t) => celula(achar(t, c))).join('')}
              <td class="grade-total">${p.variacoes.filter((v) => v.cor === c).reduce((s, v) => s + v.estoque, 0)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr><th scope="row">Total</th>${tamanhos.map((t) => `<td>${totalTam(t)}</td>`).join('')}<td class="grade-total">${p.estoqueTotal}</td></tr></tfoot>
        </table>
      </div>`;
  }

  function htmlProduto(p) {
    const sit = situacao(p);
    const furos = p.variacoes.filter((v) => v.estoque === 0).length;
    const minimo = p.estoqueMinimo || 0;
    // Barra: peças em relação a 2× o mínimo (cheia = bem abastecido)
    const ref = Math.max(minimo * 2, 1);
    const nivel = Math.max(4, Math.min(100, Math.round((p.estoqueTotal / ref) * 100)));
    const aberto = todosAbertos || abertos.has(p.id);
    const badge = sit === 'zerado' ? '<span class="badge badge-perigo">Sem estoque</span>'
      : sit === 'baixo' ? '<span class="badge badge-alerta">Estoque baixo</span>'
      : '<span class="badge badge-sucesso">OK</span>';
    return `
      <article class="posicao-item ${aberto ? 'aberto' : ''}" data-id="${p.id}">
        <button type="button" class="posicao-resumo" aria-expanded="${aberto}" aria-controls="grade-${p.id}">
          ${App.thumb(p)}
          <span class="posicao-nome">
            <strong>${App.escapeHtml(p.nome)}</strong>
            <span>${App.escapeHtml(p.marca)} · ${p.variacoes.length} variações${furos ? ` · <span class="texto-perigo">${furos} zerada${furos > 1 ? 's' : ''}</span>` : ''}</span>
          </span>
          <span class="posicao-nivel" title="Mínimo: ${minimo} peças">
            <span class="nivel-barra ${sit}"><span style="width:${nivel}%"></span></span>
            <span class="texto-xs texto-3">mín. ${minimo}</span>
          </span>
          <span class="posicao-pecas"><strong>${App.formatarNumero(p.estoqueTotal)}</strong><span>peças</span></span>
          <span class="posicao-badge">${badge}</span>
          <i data-lucide="chevron-down" class="posicao-seta"></i>
        </button>
        <div class="posicao-detalhe" id="grade-${p.id}" ${aberto ? '' : 'hidden'}>
          ${htmlGrade(p)}
          <div class="posicao-acoes">
            <span class="texto-xs texto-3 flex items-center gap-3" style="flex-wrap:wrap">
              <span class="legenda"><span class="legenda-cor zero"></span>Zerado</span>
              <span class="legenda"><span class="legenda-cor pouco"></span>1 ou 2 peças</span>
            </span>
            <span class="flex gap-2" style="flex-wrap:wrap">
              <button type="button" class="btn btn-fantasma" data-ver-mov="${p.id}"><i data-lucide="history"></i>Movimentações</button>
              ${App.pode('movimentar-estoque') ? `
                <button type="button" class="btn btn-secundario" data-ajustar="${p.id}"><i data-lucide="sliders-horizontal"></i>Ajustar</button>
                <button type="button" class="btn btn-secundario" data-entrada="${p.id}"><i data-lucide="plus"></i>Entrada</button>` : ''}
            </span>
          </div>
        </div>
      </article>`;
  }

  function desenharPosicao() {
    // Contagens nos filtros de situação
    const base = produtos.filter((p) => !pCategoria.value || p.categoria === pCategoria.value);
    document.getElementById('cont-todos').textContent = base.length;
    document.getElementById('cont-baixo').textContent = base.filter((p) => situacao(p) !== 'ok').length;
    document.getElementById('cont-furos').textContent = base.filter(temFuros).length;
    document.getElementById('cont-ok').textContent = base.filter((p) => situacao(p) === 'ok' && !temFuros(p)).length;

    const lista = produtosFiltrados();
    if (!lista.length) {
      elPosicao.innerHTML = `<div class="card">${App.estadoVazio({ icone: 'package-search', titulo: 'Nenhum produto encontrado', texto: 'Tente outra busca, categoria ou situação.' })}</div>`;
      App.icones();
      return;
    }
    // Agrupado por categoria (na ordem escolhida dentro de cada grupo)
    const grupos = new Map();
    lista.forEach((p) => { if (!grupos.has(p.categoria)) grupos.set(p.categoria, []); grupos.get(p.categoria).push(p); });
    elPosicao.innerHTML = [...grupos].map(([cat, itens]) => `
      <section class="posicao-grupo">
        <header class="posicao-grupo-cabecalho">
          <h2>${App.escapeHtml(cat || 'Sem categoria')}</h2>
          <span class="texto-sm texto-3">${itens.length} produto${itens.length > 1 ? 's' : ''} · ${App.formatarNumero(itens.reduce((s, p) => s + p.estoqueTotal, 0))} peças</span>
        </header>
        <div class="card posicao-lista">${itens.map(htmlProduto).join('')}</div>
      </section>`).join('');
    App.icones();
  }

  elPosicao.addEventListener('click', (e) => {
    const resumo = e.target.closest('.posicao-resumo');
    if (resumo) {
      const item = resumo.closest('.posicao-item');
      const abrir = !item.classList.contains('aberto');
      item.classList.toggle('aberto', abrir);
      resumo.setAttribute('aria-expanded', String(abrir));
      item.querySelector('.posicao-detalhe').hidden = !abrir;
      abrir ? abertos.add(item.dataset.id) : abertos.delete(item.dataset.id);
      return;
    }
    const b = e.target.closest('[data-ajustar], [data-entrada], [data-ver-mov]');
    if (!b) return;
    if (b.dataset.ajustar) abrirModalMovimentacao('ajuste', b.dataset.ajustar);
    if (b.dataset.entrada) abrirModalMovimentacao('entrada', b.dataset.entrada);
    if (b.dataset.verMov) {
      form.produtoId.value = b.dataset.verMov;
      carregar();
      ativarAba(document.getElementById('aba-movimentacoes'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.getElementById('btn-expandir').addEventListener('click', (e) => {
    todosAbertos = !todosAbertos;
    if (!todosAbertos) abertos.clear();
    e.currentTarget.querySelector('span').textContent = todosAbertos ? 'Fechar todas as grades' : 'Abrir todas as grades';
    desenharPosicao();
  });
  document.getElementById('filtros-posicao').addEventListener('submit', (e) => e.preventDefault());
  pBusca.addEventListener('input', App.debounce(desenharPosicao, 150));
  pCategoria.addEventListener('change', desenharPosicao);
  pOrdem.addEventListener('change', desenharPosicao);
  document.querySelectorAll('[data-situacao]').forEach((b) => b.addEventListener('click', () => {
    pSituacao = b.dataset.situacao;
    document.querySelectorAll('[data-situacao]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    desenharPosicao();
  }));

  /* ==================================================================
     MODAL: registrar entrada / ajuste / saída
     ================================================================== */
  function abrirModalMovimentacao(tipoInicial = 'entrada', produtoInicial = '') {
    const opcoesProdutos = produtos.map((p) => `<option value="${p.id}">${App.escapeHtml(p.nome)} — ${App.escapeHtml(p.marca)}</option>`).join('');
    const tipos = [
      { v: 'entrada', t: 'Entrada', i: 'arrow-down-to-line' },
      { v: 'ajuste', t: 'Ajuste', i: 'sliders-horizontal' },
      { v: 'saida', t: 'Saída', i: 'arrow-up-from-line' }
    ];

    const { el, fechar } = App.abrirModal({
      titulo: 'Registrar movimentação',
      corpo: `
        <form id="form-mov" class="flex-col gap-4" novalidate>
          <div class="campo">
            <span class="rotulo" id="rot-tipo">Tipo</span>
            <div class="chips" role="radiogroup" aria-labelledby="rot-tipo">
              ${tipos.map((t) => `<button type="button" class="chip" role="radio" data-tipo="${t.v}" aria-checked="${t.v === tipoInicial}" aria-pressed="${t.v === tipoInicial}"><i data-lucide="${t.i}"></i>${t.t}</button>`).join('')}
            </div>
          </div>
          <div class="campo">
            <label for="mov-produto">Produto <span class="obrigatorio" aria-hidden="true">*</span></label>
            <select class="select" id="mov-produto" name="produtoId" required><option value="">Selecione o produto…</option>${opcoesProdutos}</select>
          </div>
          <div class="campo">
            <label for="mov-variacao">Variação (tamanho / cor) <span class="obrigatorio" aria-hidden="true">*</span></label>
            <select class="select" id="mov-variacao" name="sku" required disabled><option value="">Escolha um produto primeiro</option></select>
          </div>
          <div class="campo">
            <label for="mov-qtd" id="rot-qtd">Quantidade a adicionar</label>
            <input class="input" id="mov-qtd" name="quantidade" type="number" min="0" inputmode="numeric" required placeholder="0">
            <span class="ajuda" id="ajuda-qtd"></span>
          </div>
          <div class="campo">
            <label for="mov-motivo">Motivo / observação</label>
            <input class="input" id="mov-motivo" name="motivo" placeholder="Ex.: NF 12345 — fornecedor">
          </div>
          <div class="alerta info oculto" id="previa-estoque"><i data-lucide="info"></i><span></span></div>
        </form>`,
      acoes: [
        { texto: 'Cancelar' },
        { texto: 'Registrar', classe: 'btn-primario', icone: 'check', aoClicar: salvar }
      ]
    });

    const f = el.querySelector('#form-mov');
    let tipo = tipoInicial;
    const selProduto = f.querySelector('#mov-produto');
    const selVariacao = f.querySelector('#mov-variacao');
    const inputQtd = f.querySelector('#mov-qtd');

    const textos = {
      entrada: ['Quantidade a adicionar', 'Peças recebidas que entram no estoque.', 'Ex.: NF 12345 — fornecedor'],
      ajuste: ['Estoque contado (quantidade final)', 'Informe quantas peças existem de fato; a diferença é registrada.', 'Ex.: Inventário mensal'],
      saida: ['Quantidade a retirar', 'Perda, defeito, brinde ou uso interno.', 'Ex.: Peça com defeito']
    };

    function atualizarTipo() {
      f.querySelectorAll('[data-tipo]').forEach((b) => {
        const ativo = b.dataset.tipo === tipo;
        b.setAttribute('aria-checked', String(ativo));
        b.setAttribute('aria-pressed', String(ativo));
      });
      f.querySelector('#rot-qtd').textContent = textos[tipo][0];
      f.querySelector('#ajuda-qtd').textContent = textos[tipo][1];
      f.querySelector('#mov-motivo').placeholder = textos[tipo][2];
      atualizarPrevia();
    }

    function atualizarPrevia() {
      const previa = f.querySelector('#previa-estoque');
      const p = produtos.find((x) => x.id === selProduto.value);
      const v = p && p.variacoes.find((x) => x.sku === selVariacao.value);
      const qtd = parseInt(inputQtd.value, 10);
      if (!v || Number.isNaN(qtd)) { previa.classList.add('oculto'); return; }
      const novo = tipo === 'entrada' ? v.estoque + qtd : tipo === 'saida' ? v.estoque - qtd : qtd;
      previa.classList.remove('oculto');
      previa.classList.toggle('info', novo >= 0);
      previa.querySelector('span').innerHTML = novo < 0
        ? `Estoque insuficiente: há apenas <strong>${v.estoque}</strong> peça(s).`
        : `Estoque atual: <strong>${v.estoque}</strong> → novo estoque: <strong>${novo}</strong>`;
    }

    f.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => { tipo = b.dataset.tipo; atualizarTipo(); }));

    selProduto.addEventListener('change', () => {
      const p = produtos.find((x) => x.id === selProduto.value);
      selVariacao.disabled = !p;
      selVariacao.innerHTML = p
        ? '<option value="">Selecione…</option>' + p.variacoes.map((v) => `<option value="${App.escapeHtml(v.sku)}">${App.escapeHtml(v.tamanho)} / ${App.escapeHtml(v.cor)} — ${v.estoque} em estoque</option>`).join('')
        : '<option value="">Escolha um produto primeiro</option>';
      atualizarPrevia();
    });
    selVariacao.addEventListener('change', atualizarPrevia);
    inputQtd.addEventListener('input', atualizarPrevia);
    atualizarTipo();
    if (produtoInicial) {
      selProduto.value = produtoInicial;
      selProduto.dispatchEvent(new Event('change'));
      setTimeout(() => selVariacao.focus(), 60);
    }

    async function salvar(_, botao) {
      if (!App.validarFormulario(f)) return;
      const dados = App.lerFormulario(f);
      botao.disabled = true;
      try {
        await Data.registrarMovimentacao({ ...dados, tipo, quantidade: parseInt(dados.quantidade, 10) });
        fechar();
        App.toast('Movimentação registrada!');
        await atualizarIndicadores();
        desenharPosicao();
        await carregar();
      } catch (erro) {
        App.toast(erro.message, 'erro');
        botao.disabled = false;
      }
    }
  }

  /* ==================================================================
     EXPORTAR PDF — posição atual do estoque + movimentações filtradas
     ================================================================== */
  Pdf.ligarBotao(document.getElementById('btn-pdf'), async () => {
    const moeda = Pdf.moeda;
    await atualizarIndicadores(); // garante números atualizados

    // Se houver filtro de produto, a posição mostra só ele
    const lista = form.produtoId.value ? produtos.filter((p) => p.id === form.produtoId.value) : produtos;
    const variacoes = lista.flatMap((p) => p.variacoes.map((v) => ({ ...v, produto: p })));
    const pecas = lista.reduce((s, p) => s + p.estoqueTotal, 0);
    const valorCusto = lista.reduce((s, p) => s + p.estoqueTotal * p.custo, 0);
    const valorVenda = lista.reduce((s, p) => s + p.estoqueTotal * p.preco, 0);
    const zeradas = variacoes.filter((v) => v.estoque === 0);
    const situacao = (p) => (p.estoqueTotal === 0 ? 'zerado' : p.estoqueBaixo ? 'baixo' : 'ok');

    const pdf = await Pdf.criar({
      titulo: 'Relatório de estoque',
      periodo: `Posição em ${App.formatarData(App.dataInput())}`,
      filtros: Pdf.descreverFiltros(form)
    });

    pdf.indicadores([
      ['Peças em estoque', App.formatarNumero(pecas), `${lista.length} produtos · ${variacoes.length} variações`],
      ['Valor (custo)', moeda(valorCusto), `${moeda(valorVenda)} em preço de venda`],
      ['Variações zeradas', App.formatarNumero(zeradas.length), 'Tamanho/cor sem peças'],
      ['Estoque baixo', App.formatarNumero(lista.filter((p) => p.estoqueBaixo).length), 'Produtos abaixo do mínimo']
    ]);

    // Posição por produto (mais críticos primeiro)
    const ordem = { zerado: 0, baixo: 1, ok: 2 };
    const posicao = lista.slice()
      .sort((a, b) => ordem[situacao(a)] - ordem[situacao(b)] || a.nome.localeCompare(b.nome, 'pt-BR'));
    // NCM que vai para a nota (ncmEfetivo/ncmOrigem vêm calculados de data.js)
    const textoNcm = (p) => (p.ncmOrigem === 'proprio' ? p.ncmEfetivo : p.ncmOrigem === 'categoria' ? `${p.ncmEfetivo}*` : 'Sem NCM');
    const semNcm = lista.filter((p) => p.ncmOrigem === 'sem').length;
    pdf.tabela({
      titulo: 'Posição atual por produto',
      nota: semNcm
        ? `NCM com * = padrão da categoria (Configurações > Dados fiscais). ${semNcm} produto(s) sem NCM: não é possível emitir NFC-e deles.`
        : 'NCM com * = padrão da categoria (Configurações > Dados fiscais).',
      cabecalho: ['Produto', 'Categoria', 'NCM', 'Variações', 'Peças', 'Mínimo', 'Valor (custo)', 'Situação'],
      linhas: posicao.map((p) => Pdf.linhaComStatus([
        p.nome, p.categoria, textoNcm(p), p.variacoes.length, p.estoqueTotal, p.estoqueMinimo || 0, moeda(p.estoqueTotal * p.custo), Pdf.rotuloStatus(situacao(p))
      ], situacao(p))),
      direita: [6],
      centro: [3, 4, 5, 7],
      colunaStatus: 7,
      larguras: { 2: 24 },
      // "Sem NCM" em vermelho, como na tela de produtos
      corCelula: (linha, coluna) => (coluna === 2 && posicao[linha].ncmOrigem === 'sem' ? 'zerado' : null),
      rodape: ['Total', '', '', variacoes.length, pecas, '', moeda(valorCusto), '']
    });

    // Lista de reposição: variações sem estoque
    if (zeradas.length) {
      pdf.tabela({
        titulo: 'Para repor (variações zeradas)',
        cabecalho: ['Produto', 'Tamanho', 'Cor', 'SKU', 'Código de barras'],
        linhas: zeradas.map((v) => [v.produto.nome, v.tamanho, v.cor, v.sku, v.codigoBarras]),
        centro: [1]
      });
    }

    // Movimentações do filtro atual
    const entradas = movimentacoes.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + m.quantidade, 0);
    const saidas = movimentacoes.filter((m) => m.tipo === 'saida').reduce((s, m) => s + m.quantidade, 0);
    const ajustes = movimentacoes.filter((m) => m.tipo === 'ajuste').reduce((s, m) => s + m.quantidade, 0);
    pdf.tabela({
      titulo: `Movimentações · ${Pdf.descreverPeriodo(form.dataInicio.value, form.dataFim.value)}`,
      cabecalho: ['Data', 'Produto', 'Variação', 'Tipo', 'Qtd.', 'Motivo', 'Usuário'],
      linhas: movimentacoes.map((m) => {
        const sinal = m.tipo === 'saida' ? '-' : m.quantidade > 0 ? '+' : '';
        return Pdf.linhaComStatus([
          Pdf.dataHora(m.data), m.produtoNome, `${m.tamanho || ''} / ${m.cor || ''}`,
          Pdf.rotuloStatus(m.tipo), `${sinal}${m.quantidade}`, m.motivo || '-', m.usuarioNome
        ], m.tipo);
      }),
      centro: [4],
      colunaStatus: 3,
      larguras: { 0: 29, 2: 27, 3: 16, 4: 12, 6: 26 },
      vazio: 'Nenhuma movimentação com os filtros escolhidos.',
      rodape: [
        { content: `Resumo: ${movimentacoes.length} movimentações`, colSpan: 3, styles: { halign: 'left' } },
        { content: `Entradas +${entradas}  ·  Saídas -${saidas}  ·  Ajustes ${ajustes >= 0 ? '+' : ''}${ajustes}`, colSpan: 4, styles: { halign: 'right' } }
      ]
    });

    pdf.salvar(`estoque_${App.dataInput()}.pdf`);
  });

  /* ---------- Inicialização ---------- */
  await atualizarIndicadores();
  App.preencherSelect(form.produtoId, produtos.map((p) => ({ valor: p.id, texto: p.nome })), { vazio: 'Todos os produtos' });
  form.dataInicio.value = App.diasAtras(30);
  // Vindo de Produtos ("Ajustar estoque"): já mostra só aquele produto
  const produtoUrl = App.parametroUrl('produto');
  const prodUrl = produtos.find((p) => p.id === produtoUrl);
  if (prodUrl) { form.produtoId.value = prodUrl.id; if (pBusca) pBusca.value = prodUrl.nome; }
  form.dataFim.value = App.dataInput();

  form.addEventListener('submit', (e) => e.preventDefault());
  form.busca.addEventListener('input', App.debounce(carregar, 250));
  form.querySelectorAll('select, input[type=date]').forEach((c) => c.addEventListener('change', carregar));
  document.getElementById('btn-entrada').addEventListener('click', () => abrirModalMovimentacao('entrada'));
  document.getElementById('btn-ajuste').addEventListener('click', () => abrirModalMovimentacao('ajuste'));

  // Vendedor: só consulta (sem movimentar estoque e sem ver custo)
  if (!App.pode('movimentar-estoque')) {
    document.querySelectorAll('[data-so-dono]').forEach((el) => el.remove());
  }
  if (!App.pode('ver-custos')) {
    document.getElementById('kpi-valor-rotulo').textContent = 'Valor em estoque (venda)';
    const valorVenda = produtos.reduce((s, p) => s + p.estoqueTotal * p.preco, 0);
    document.getElementById('kpi-valor').textContent = App.formatarMoeda(valorVenda);
    document.getElementById('kpi-valor-det').textContent = 'Pelo preço de venda';
  }

  App.preencherSelect(pCategoria, (await Data.listarCategorias()).map((c) => ({ valor: c, texto: c })), { vazio: 'Todas as categorias' });
  // Começa mostrando os problemas abertos: grades dos produtos sem estoque/baixo
  produtos.filter((p) => situacao(p) !== 'ok').forEach((p) => abertos.add(p.id));
  desenharPosicao();
  if (location.hash === '#movimentacoes') ativarAba(document.getElementById('aba-movimentacoes'));

  await carregar();
});
