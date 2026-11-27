/* ==========================================================================
   produtos.js — Catálogo: abas de categoria, filtros, ordenação,
   visão em lista ou cartões, paginação e exclusão
   ========================================================================== */
App.aoIniciar(async () => {
  const CHAVE_VISAO = 'gestaoloja:produtos-visao';
  let pagina = 1;
  let produtos = [];
  let visao = 'lista';
  let situacao = '';      // '', 'baixo', 'esgotado', 'semfoto', 'promo'
  let todos = [];         // todos os produtos (para o resumo e as contagens)
  const abertos = new Set(); // produtos com a grade de estoque aberta
  try { visao = localStorage.getItem(CHAVE_VISAO) === 'cartoes' ? 'cartoes' : 'lista'; } catch (e) { /* ignora */ }
  const porPagina = () => (visao === 'cartoes' ? 12 : 20);

  const form = document.getElementById('filtros');
  const corpo = document.getElementById('lista-produtos');
  const cartoes = document.getElementById('cartoes-produtos');
  const selOrdem = document.getElementById('f-ordem');

  /* ---------- Opções dos filtros ---------- */
  const [categorias, marcas, tamanhos, cores] = await Promise.all([
    Data.listarCategorias(), Data.listarMarcas(), Data.listarTamanhos(), Data.listarCores()
  ]);
  App.preencherSelect(form.marca, marcas, { vazio: 'Marca' });
  App.preencherSelect(form.tamanho, tamanhos, { vazio: 'Tamanho' });
  App.preencherSelect(form.cor, cores.map((c) => c.nome), { vazio: 'Cor' });

  // Vendedor consulta produtos, mas não cadastra/edita/exclui
  const podeGerenciar = App.pode('gerenciar-produtos');
  if (!podeGerenciar) document.getElementById('btn-novo-produto').remove();

  // Filtros vindos da URL (?busca=... da topbar, ?ncm=sem de outros atalhos)
  const buscaUrl = App.parametroUrl('busca');
  if (buscaUrl) form.busca.value = buscaUrl;
  const ncmUrl = App.parametroUrl('ncm');
  if (['sem', 'proprio', 'categoria'].includes(ncmUrl)) form.ncm.value = ncmUrl;

  /* ---------- Abas de categoria (com contagem) ---------- */
  async function desenharAbas() {
    todos = await Data.listarProdutos();
    desenharResumo();
    const contar = (c) => todos.filter((p) => !c || p.categoria === c).length;
    const el = document.getElementById('abas-categorias');
    el.innerHTML = ['', ...categorias].map((c) => `
      <button type="button" class="aba" role="tab" data-cat="${App.escapeHtml(c)}" aria-selected="${c === form.categoria.value}">
        ${c ? App.escapeHtml(c) : 'Todas'} <span class="aba-contagem">${contar(c)}</span>
      </button>`).join('');
    el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
      form.categoria.value = b.dataset.cat;
      el.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      carregar();
    }));
  }

  /* ---------- Resumo do estoque e filtros de situação ---------- */
  const SITUACOES = [
    ['', 'Todos', () => true],
    ['baixo', 'Estoque baixo', (p) => p.estoqueTotal > 0 && p.estoqueBaixo],
    ['esgotado', 'Esgotados', (p) => p.estoqueTotal === 0],
    ['semfoto', 'Sem foto', (p) => !p.foto],
    ['promo', 'Em promoção', (p) => !!(p.precoPromocional || p.promocao)]
  ];
  const filtroSituacao = (s) => (SITUACOES.find((x) => x[0] === s) || SITUACOES[0])[2];

  function desenharResumo() {
    const pecas = todos.reduce((s, p) => s + (p.estoqueTotal || 0), 0);
    const venda = todos.reduce((s, p) => s + (p.estoqueTotal || 0) * (p.precoPromocional || p.preco || 0), 0);
    const custo = todos.reduce((s, p) => s + (p.estoqueTotal || 0) * (p.custo || 0), 0);
    const baixo = todos.filter(filtroSituacao('baixo')).length;
    const esgotado = todos.filter(filtroSituacao('esgotado')).length;
    const card = (rot, valor, sub, acao = '', classe = '') => `<${acao ? 'button type="button"' : 'div'} class="prod-kpi ${classe}" ${acao ? `data-ir-situacao="${acao}"` : ''}><span>${rot}</span><strong>${valor}</strong><small>${sub}</small></${acao ? 'button' : 'div'}>`;
    document.getElementById('prod-resumo').innerHTML = [
      card('Produtos', todos.length, `${pecas} peça${pecas === 1 ? '' : 's'} na loja`),
      card('Valor em estoque', App.formatarMoeda(venda), custo && App.pode('gerenciar-produtos') ? `custou ${App.formatarMoeda(custo)}` : 'pelo preço de venda'),
      card('Estoque baixo', baixo, baixo ? 'ver quais repor →' : 'tudo em dia', baixo ? 'baixo' : '', baixo ? 'atencao' : ''),
      card('Esgotados', esgotado, esgotado ? 'ver quais →' : 'nenhum', esgotado ? 'esgotado' : '', esgotado ? 'perigo' : '')
    ].join('');
    document.querySelectorAll('[data-ir-situacao]').forEach((b) => b.addEventListener('click', () => { situacao = b.dataset.irSituacao; carregar(); document.getElementById('prod-situacao').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }));
    desenharSituacoes();
  }
  function desenharSituacoes() {
    const el = document.getElementById('prod-situacao');
    el.innerHTML = SITUACOES.map(([v, t, f]) => {
      const n = v ? todos.filter(f).length : todos.length;
      return `<button type="button" class="prod-sit${v === situacao ? ' ativo' : ''}" data-situacao="${v}" aria-pressed="${v === situacao}">${t}<span>${n}</span></button>`;
    }).join('');
    el.querySelectorAll('[data-situacao]').forEach((b) => b.addEventListener('click', () => { situacao = b.dataset.situacao; carregar(); }));
  }

  /* ---------- Grade de estoque (cor × tamanho) que abre na linha ---------- */
  function htmlGradeEstoque(p) {
    const tams = [...new Set(p.variacoes.map((v) => v.tamanho))];
    const crs = [...new Set(p.variacoes.map((v) => v.cor))];
    const q = (t, c) => p.variacoes.find((v) => v.tamanho === t && v.cor === c);
    return `<div class="prod-grade">
      <div class="prod-grade-tab" style="grid-template-columns:auto repeat(${tams.length}, minmax(38px, auto))">
        <span></span>${tams.map((t) => `<b>${App.escapeHtml(t)}</b>`).join('')}
        ${crs.map((c) => `<span class="prod-grade-cor">${App.bolinhaCor(c)}${App.escapeHtml(c)}</span>${tams.map((t) => {
          const v = q(t, c);
          if (!v) return '<i class="vazio">—</i>';
          const n = Number(v.estoque) || 0;
          return `<i class="${n === 0 ? 'zero' : n <= 1 ? 'pouco' : ''}" title="${App.escapeHtml(v.sku)}">${n}</i>`;
        }).join('')}`).join('')}
      </div>
      ${App.pode('movimentar-estoque') && App.podeAcessar('estoque') ? `<a class="btn btn-secundario" href="estoque.html?produto=${encodeURIComponent(p.id)}"><i data-lucide="arrow-left-right"></i>Ajustar estoque</a>` : ''}
    </div>`;
  }

  /* ---------- NCM (ncmEfetivo/ncmOrigem vêm calculados de data.js) ---------- */
  function celulaNcm(p) {
    if (p.ncmOrigem === 'proprio') return `<div><div class="mono nowrap">${App.escapeHtml(p.ncmEfetivo)}</div><div class="texto-xs texto-3">próprio</div></div>`;
    if (p.ncmOrigem === 'categoria') return `<div><div class="mono nowrap texto-2">${App.escapeHtml(p.ncmEfetivo)}</div><div class="texto-xs texto-3">da categoria</div></div>`;
    return '<span class="badge badge-perigo" title="Sem NCM: não é possível emitir NFC-e deste produto">Sem NCM</span>';
  }

  /* ---------- Aviso: produtos sem NCM no catálogo inteiro ---------- */
  async function atualizarAvisoNcm() {
    const aviso = document.getElementById('aviso-ncm');
    if (!App.emiteNota) { aviso.innerHTML = ''; return; } // loja sem nota fiscal: NCM não é obrigatório
    const semNcm = await Data.listarProdutos({ ncm: 'sem' });
    if (!semNcm.length || form.ncm.value === 'sem') { aviso.innerHTML = ''; return; }
    aviso.innerHTML = `<div class="alerta"><i data-lucide="triangle-alert"></i>
      <span style="flex:1"><strong>${semNcm.length} ${semNcm.length === 1 ? 'produto está' : 'produtos estão'} sem NCM</strong> — não é possível emitir NFC-e ${semNcm.length === 1 ? 'dele' : 'deles'}.</span>
      <button type="button" class="btn btn-secundario" id="ver-sem-ncm" style="min-height:34px">Ver produtos sem NCM</button></div>`;
    document.getElementById('ver-sem-ncm').addEventListener('click', () => {
      limparFiltros(false);
      form.ncm.value = 'sem';
      carregar();
    });
    App.icones();
  }

  /* ---------- Filtros ativos (etiquetas removíveis) ---------- */
  const rotulosNcm = { sem: 'Sem NCM', proprio: 'NCM próprio', categoria: 'NCM da categoria' };
  function desenharFiltrosAtivos() {
    const ativos = [];
    if (form.busca.value.trim()) ativos.push(['busca', `"${form.busca.value.trim()}"`]);
    if (form.marca.value) ativos.push(['marca', `Marca: ${form.marca.value}`]);
    if (form.tamanho.value) ativos.push(['tamanho', `Tamanho: ${form.tamanho.value}`]);
    if (form.cor.value) ativos.push(['cor', `Cor: ${form.cor.value}`]);
    if (form.ncm.value) ativos.push(['ncm', rotulosNcm[form.ncm.value]]);
    if (situacao) ativos.push(['situacao', (SITUACOES.find((x) => x[0] === situacao) || [])[1]]);
    const el = document.getElementById('filtros-ativos');
    el.innerHTML = ativos.length ? ativos.map(([campo, texto]) => `
      <button type="button" class="filtro-ativo" data-limpar="${campo}" aria-label="Remover filtro ${App.escapeHtml(texto)}">${App.escapeHtml(texto)}<i data-lucide="x"></i></button>`).join('')
      + '<button type="button" class="btn btn-fantasma" id="limpar-tudo" style="min-height:30px">Limpar filtros</button>' : '';
    el.querySelectorAll('[data-limpar]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.limpar === 'situacao') situacao = ''; else form[b.dataset.limpar].value = ''; carregar(); }));
    document.getElementById('limpar-tudo')?.addEventListener('click', () => { limparFiltros(true); carregar(); });
  }
  function limparFiltros(manterCategoria) {
    const cat = form.categoria.value;
    form.reset();
    situacao = '';
    form.categoria.value = manterCategoria ? cat : '';
    if (!manterCategoria) document.querySelectorAll('#abas-categorias [data-cat]').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.cat === '')));
  }

  /* ---------- Carregar e desenhar ---------- */
  async function carregar() {
    produtos = (await Data.listarProdutos(App.lerFormulario(form))).filter(filtroSituacao(situacao));
    desenharSituacoes();
    ordenar();
    pagina = 1;
    desenhar();
    desenharFiltrosAtivos();
    atualizarAvisoNcm();
    // Mantém o filtro de NCM no endereço (dá para salvar o link)
    const url = new URL(location.href);
    form.ncm.value ? url.searchParams.set('ncm', form.ncm.value) : url.searchParams.delete('ncm');
    history.replaceState(null, '', url);
  }

  const precoAtual = (p) => p.precoPromocional || p.preco;
  function ordenar() {
    const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
    const criterios = {
      'nome': porNome,
      'preco-menor': (a, b) => precoAtual(a) - precoAtual(b) || porNome(a, b),
      'preco-maior': (a, b) => precoAtual(b) - precoAtual(a) || porNome(a, b),
      'estoque-menor': (a, b) => a.estoqueTotal - b.estoqueTotal || porNome(a, b),
      'estoque-maior': (a, b) => b.estoqueTotal - a.estoqueTotal || porNome(a, b)
    };
    produtos.sort(criterios[selOrdem.value] || porNome);
  }

  /* Partes reaproveitadas na lista e nos cartões */
  function htmlPreco(p) {
    return `${p.precoPromocional
      ? `<span class="preco-de">${App.formatarMoeda(p.preco)}</span><span class="preco-por">${App.formatarMoeda(p.precoPromocional)}</span>`
      : `<span class="preco-atual">${App.formatarMoeda(p.preco)}</span>`}
      ${p.promocao ? `<span class="preco-promo">${App.escapeHtml(p.promocao.leve ? `Leve ${p.promocao.leve} pague ${p.promocao.pague}` : p.promocao.nome)}</span>` : ''}`;
  }
  function htmlGrade(p) {
    const tams = [...new Set(p.variacoes.map((v) => v.tamanho))];
    const crs = [...new Set(p.variacoes.map((v) => v.cor))];
    return `<div class="grade-resumo">
      <span class="pl-tamanhos">${tams.map((t) => App.escapeHtml(t)).join(' · ')}</span>
      <span class="cores-mini">${crs.map((c) => `<span title="${App.escapeHtml(c)}">${App.bolinhaCor(c)}</span>`).join('')}</span>
    </div>`;
  }
  function htmlEstoque(p) {
    const sit = p.estoqueTotal === 0 ? 'zerado' : p.estoqueBaixo ? 'baixo' : 'ok';
    const ref = Math.max((p.estoqueMinimo || 0) * 2, 1);
    const nivel = Math.max(4, Math.min(100, Math.round((p.estoqueTotal / ref) * 100)));
    const texto = sit === 'zerado' ? 'Esgotado' : `${p.estoqueTotal} un.`;
    return `<div class="estoque-mini ${sit}" title="Mínimo: ${p.estoqueMinimo || 0}">
      <span class="estoque-mini-texto">${texto}${p.variacoes.length > 1 ? `<button type="button" class="prod-abrir" data-abrir="${p.id}" aria-expanded="${abertos.has(p.id)}" aria-label="Ver estoque por tamanho e cor de ${App.escapeHtml(p.nome)}" title="Ver por tamanho e cor"><i data-lucide="chevron-down"></i></button>` : ''}</span>
      <span class="nivel-barra ${sit}"><span style="width:${sit === 'zerado' ? 0 : nivel}%"></span></span>
    </div>`;
  }
  function htmlAcoes(p) {
    return `<a href="etiquetas.html?produto=${p.id}" class="btn-icone" aria-label="Etiquetas de ${App.escapeHtml(p.nome)}" title="Imprimir etiquetas"><i data-lucide="tag"></i></a>
      ${podeGerenciar ? `<a href="produto-form.html?copiar=${p.id}" class="btn-icone" aria-label="Duplicar ${App.escapeHtml(p.nome)}" title="Duplicar (cadastrar outro parecido)"><i data-lucide="copy-plus"></i></a>
      <a href="produto-form.html?id=${p.id}" class="btn-icone" aria-label="Editar ${App.escapeHtml(p.nome)}" title="Editar"><i data-lucide="pencil"></i></a>
      <button type="button" class="btn-icone perigo" data-excluir="${p.id}" aria-label="Excluir ${App.escapeHtml(p.nome)}" title="Excluir"><i data-lucide="trash-2"></i></button>` : ''}`;
  }

  function htmlVazio() {
    const temFiltro = !!situacao || Object.values(App.lerFormulario(form)).some(Boolean);
    const somenteSemNcm = form.ncm.value === 'sem' && !Object.entries(App.lerFormulario(form)).some(([k, v]) => k !== 'ncm' && v);
    return somenteSemNcm
      ? App.estadoVazio({ icone: 'circle-check', titulo: 'Nenhum produto sem NCM', texto: 'Todos os produtos têm NCM (próprio ou da categoria) e podem sair na NFC-e.', acao: '<button type="button" class="btn btn-secundario" data-limpar-vazio>Ver todos os produtos</button>' })
      : temFiltro
        ? App.estadoVazio({ icone: 'search-x', titulo: 'Nenhum produto encontrado', texto: 'Tente outros termos ou limpe os filtros.', acao: '<button type="button" class="btn btn-secundario" data-limpar-vazio>Limpar filtros</button>' })
        : App.estadoVazio({ icone: 'shirt', titulo: 'Nenhum produto cadastrado', texto: 'Cadastre seu primeiro produto com a grade de tamanhos e cores.', acao: podeGerenciar ? '<a href="produto-form.html" class="btn btn-primario">Cadastrar produto</a>' : '' });
  }

  function desenhar() {
    document.getElementById('contador').textContent = `${produtos.length} ${produtos.length === 1 ? 'produto' : 'produtos'}${form.categoria.value ? ` em ${form.categoria.value}` : ''}`;
    document.getElementById('visao-lista').hidden = visao !== 'lista';
    document.getElementById('visao-cartoes').hidden = visao !== 'cartoes';
    document.querySelectorAll('[data-visao]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.visao === visao)));

    if (!produtos.length) {
      corpo.innerHTML = `<tr><td colspan="7">${htmlVazio()}</td></tr>`;
      cartoes.innerHTML = `<div class="card" style="grid-column:1/-1">${htmlVazio()}</div>`;
      document.querySelectorAll('[data-limpar-vazio]').forEach((b) => b.addEventListener('click', () => { limparFiltros(false); carregar(); }));
      document.getElementById('paginacao').innerHTML = '';
      document.getElementById('paginacao-cartoes').innerHTML = '';
      document.getElementById('paginacao-cartoes-card').hidden = true;
      App.icones();
      return;
    }

    const pag = App.paginar(produtos, pagina, porPagina());
    pagina = pag.pagina;

    if (visao === 'lista') {
      corpo.innerHTML = pag.itens.map((p) => `
        <tr class="${abertos.has(p.id) ? 'aberto' : ''}">
          <td class="cel-principal">
            <a class="produto-cel produto-link" ${podeGerenciar ? `href="produto-form.html?id=${p.id}"` : ''}>
              ${App.thumb(p)}
              <div style="min-width:0">
                <div class="titulo">${App.escapeHtml(p.nome)}</div>
                <div class="sub">${App.escapeHtml(p.marca)} · ${App.escapeHtml(p.colecao || 'Sem coleção')}</div>
              </div>
            </a>
          </td>
          <td data-label="Categoria"><span class="tag">${App.escapeHtml(p.categoria)}</span></td>
          <td data-label="Tamanhos e cores">${htmlGrade(p)}</td>
          <td data-label="NCM" class="so-nota">${celulaNcm(p)}</td>
          <td data-label="Preço" class="num"><div class="preco-bloco">${htmlPreco(p)}</div></td>
          <td data-label="Estoque">${htmlEstoque(p)}</td>
          <td class="col-acoes">${htmlAcoes(p)}</td>
        </tr>${abertos.has(p.id) ? `<tr class="prod-detalhe"><td colspan="7">${htmlGradeEstoque(p)}</td></tr>` : ''}`).join('');
    } else {
      cartoes.innerHTML = pag.itens.map((p) => `
        <article class="produto-cartao">
          <a class="produto-cartao-imagem" ${podeGerenciar ? `href="produto-form.html?id=${p.id}"` : ''} aria-label="${App.escapeHtml(p.nome)}">
            ${p.foto ? `<img src="${p.foto}" alt="">` : '<i data-lucide="shirt"></i>'}
            <span class="tag produto-cartao-cat">${App.escapeHtml(p.categoria)}</span>
            ${p.ncmOrigem === 'sem' ? '<span class="badge badge-perigo produto-cartao-ncm so-nota">Sem NCM</span>' : ''}
          </a>
          <div class="produto-cartao-corpo">
            <div>
              <div class="produto-cartao-nome">${App.escapeHtml(p.nome)}</div>
              <div class="texto-xs texto-3">${App.escapeHtml(p.marca)} · ${App.escapeHtml(p.colecao || 'Sem coleção')}</div>
            </div>
            <div class="preco-bloco preco-cartao">${htmlPreco(p)}</div>
            ${htmlGrade(p)}
            ${abertos.has(p.id) ? htmlGradeEstoque(p) : ''}
            <div class="produto-cartao-rodape">
              ${htmlEstoque(p)}
              <span class="produto-cartao-acoes">${htmlAcoes(p)}</span>
            </div>
          </div>
        </article>`).join('');
    }

    document.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', (ev) => {
      ev.preventDefault();
      const id = b.dataset.abrir;
      abertos.has(id) ? abertos.delete(id) : abertos.add(id);
      desenhar();
    }));

    // Exclusão com confirmação
    document.querySelectorAll('[data-excluir]').forEach((b) => b.addEventListener('click', async () => {
      const p = produtos.find((x) => x.id === b.dataset.excluir);
      const ok = await App.confirmar({ titulo: 'Excluir produto?', mensagem: `"${p.nome}" e todas as ${p.variacoes.length} variações serão removidas. Esta ação não pode ser desfeita.`, textoConfirmar: 'Excluir', perigo: true });
      if (!ok) return;
      await Data.excluirProduto(p.id);
      App.toast('Produto excluído.');
      produtos = produtos.filter((x) => x.id !== p.id);
      desenhar();
      desenharAbas();
      atualizarAvisoNcm();
    }));


    const alvoPag = visao === 'lista' ? 'paginacao' : 'paginacao-cartoes';
    document.getElementById('paginacao-cartoes-card').hidden = visao !== 'cartoes' || produtos.length <= porPagina();
    App.renderPaginacao(document.getElementById(alvoPag), {
      total: produtos.length, pagina, porPagina: porPagina(),
      aoMudar: (n) => { pagina = n; desenhar(); document.getElementById('conteudo').scrollIntoView({ behavior: 'smooth' }); }
    });
    App.icones();
  }

  /* ---------- Eventos ---------- */
  form.addEventListener('submit', (e) => e.preventDefault());
  form.busca.addEventListener('input', App.debounce(carregar, 250));
  form.querySelectorAll('select[name]').forEach((s) => s.addEventListener('change', carregar));
  selOrdem.addEventListener('change', () => { ordenar(); pagina = 1; desenhar(); });
  document.querySelectorAll('[data-visao]').forEach((b) => b.addEventListener('click', () => {
    visao = b.dataset.visao;
    try { localStorage.setItem(CHAVE_VISAO, visao); } catch (e) { /* ignora */ }
    pagina = 1;
    desenhar();
  }));

  await desenharAbas();
  await carregar();
});
