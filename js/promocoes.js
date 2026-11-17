/* ==========================================================================
   promocoes.js — Cadastro de promoções (só o dono)
   Tipos: % de desconto · preço fixo · leve X pague Y
   Onde vale: loja toda, categoria, coleção ou produtos escolhidos
   O PDV aplica sozinho (e a venda recalcula ao gravar).
   ========================================================================== */
App.aoIniciar(async () => {
  const $ = (id) => document.getElementById(id);
  const [categorias, colecoes, produtos] = await Promise.all([Data.listarCategorias(), Data.listarColecoes(), Data.listarProdutos()]);
  const produtoPorId = Object.fromEntries(produtos.map((p) => [p.id, p]));
  let promocoes = [];

  /* ---------- Textos ---------- */
  function regra(p) {
    if (p.tipo === 'percentual') return `${String(p.valor).replace('.', ',')}% de desconto`;
    if (p.tipo === 'preco') return `Por ${App.formatarMoeda(p.valor)}`;
    return `Leve ${p.leve} pague ${p.pague}`;
  }
  function ondeVale(p) {
    const e = p.escopo || { tipo: 'todos' };
    if (e.tipo === 'todos') return 'Loja toda';
    if (e.tipo === 'categoria') return `Categoria: ${e.valor}`;
    if (e.tipo === 'colecao') return `Coleção: ${e.valor}`;
    const nomes = (e.valor || []).map((id) => (produtoPorId[id] || {}).nome).filter(Boolean);
    return nomes.length <= 2 ? nomes.join(', ') : `${nomes.slice(0, 2).join(', ')} +${nomes.length - 2}`;
  }
  const periodo = (p) => `${p.inicio ? App.formatarData(p.inicio) : 'sem início'} a ${p.fim ? App.formatarData(p.fim) : 'sem fim'}`;

  /* ---------- Lista ---------- */
  async function carregar() {
    promocoes = await Data.listarPromocoes();
    const corpo = $('lista');
    if (!promocoes.length) {
      corpo.innerHTML = `<tr><td colspan="6">${App.estadoVazio({ icone: 'badge-percent', titulo: 'Nenhuma promoção cadastrada', texto: 'Crie descontos por categoria, coleção ou produto, ou um "leve 3 pague 2".', acao: '<button type="button" class="btn btn-primario" data-nova>Nova promoção</button>' })}</td></tr>`;
      corpo.querySelector('[data-nova]').addEventListener('click', () => abrirFormulario());
      App.icones();
      return;
    }
    corpo.innerHTML = promocoes.map((p) => `
      <tr>
        <td class="cel-principal"><span class="negrito">${App.escapeHtml(p.nome)}</span></td>
        <td data-label="Regra"><span class="tag" style="background:var(--cor-sucesso-suave);color:var(--cor-sucesso)">${regra(p)}</span></td>
        <td data-label="Onde vale">${App.escapeHtml(ondeVale(p))}</td>
        <td data-label="Período" class="nowrap">${periodo(p)}</td>
        <td data-label="Status">${App.badgeStatus(p.status)}</td>
        <td class="col-acoes">
          <button type="button" class="btn-icone" data-pausar="${p.id}" aria-label="${p.ativo ? 'Pausar' : 'Reativar'} ${App.escapeHtml(p.nome)}" title="${p.ativo ? 'Pausar' : 'Reativar'}"><i data-lucide="${p.ativo ? 'pause' : 'play'}"></i></button>
          <button type="button" class="btn-icone" data-editar="${p.id}" aria-label="Editar ${App.escapeHtml(p.nome)}" title="Editar"><i data-lucide="pencil"></i></button>
          <button type="button" class="btn-icone perigo" data-excluir="${p.id}" aria-label="Excluir ${App.escapeHtml(p.nome)}" title="Excluir"><i data-lucide="trash-2"></i></button>
        </td>
      </tr>`).join('');
    corpo.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirFormulario(promocoes.find((p) => p.id === b.dataset.editar))));
    corpo.querySelectorAll('[data-pausar]').forEach((b) => b.addEventListener('click', async () => {
      const p = promocoes.find((x) => x.id === b.dataset.pausar);
      try {
        await Data.salvarPromocao({ ...p, ativo: !p.ativo });
        App.toast(p.ativo ? 'Promoção pausada.' : 'Promoção reativada.');
        carregar();
      } catch (e) { App.toast(e.message, 'erro'); }
    }));
    corpo.querySelectorAll('[data-excluir]').forEach((b) => b.addEventListener('click', async () => {
      const p = promocoes.find((x) => x.id === b.dataset.excluir);
      if (!(await App.confirmar({ titulo: 'Excluir promoção?', mensagem: `"${p.nome}" deixa de valer no PDV. Vendas já feitas não mudam.`, textoConfirmar: 'Excluir', perigo: true }))) return;
      await Data.excluirPromocao(p.id);
      App.toast('Promoção excluída.');
      carregar();
    }));
    App.icones();
  }

  /* ---------- Formulário ---------- */
  function abrirFormulario(promo = null) {
    const p = promo || { tipo: 'percentual', valor: 10, leve: 3, pague: 2, escopo: { tipo: 'categoria', valor: categorias[0] }, inicio: App.dataInput(), fim: '', ativo: true };
    let tipo = p.tipo;
    const selecionados = new Set(p.escopo && p.escopo.tipo === 'produtos' ? p.escopo.valor : []);

    const { el, fechar } = App.abrirModal({
      titulo: promo ? 'Editar promoção' : 'Nova promoção',
      tamanho: 'lg',
      corpo: `
        <form id="form-promo" class="form-grid" novalidate>
          <div class="campo col-span-2">
            <label for="pr-nome">Nome <span class="obrigatorio" aria-hidden="true">*</span></label>
            <input class="input" id="pr-nome" required value="${App.escapeHtml(p.nome || '')}" placeholder="Ex.: Semana do Moletom">
          </div>
          <div class="campo col-span-2">
            <span class="rotulo" id="rot-tipo-pr">Tipo</span>
            <div class="chips" role="radiogroup" aria-labelledby="rot-tipo-pr">
              <button type="button" class="chip" role="radio" data-tipo="percentual"><i data-lucide="percent"></i>% de desconto</button>
              <button type="button" class="chip" role="radio" data-tipo="preco"><i data-lucide="tag"></i>Preço fixo</button>
              <button type="button" class="chip" role="radio" data-tipo="leve-pague"><i data-lucide="shopping-bag"></i>Leve X pague Y</button>
            </div>
          </div>
          <div class="campo" data-so="percentual">
            <label for="pr-percentual">Desconto (%)</label>
            <input class="input" id="pr-percentual" type="number" min="1" max="99" step="0.5" value="${p.tipo === 'percentual' ? p.valor : 10}">
          </div>
          <div class="campo" data-so="preco">
            <label for="pr-preco">Preço promocional</label>
            <div class="input-grupo"><span class="prefixo">R$</span><input class="input" id="pr-preco" inputmode="decimal" data-mascara="moeda" value="${p.tipo === 'preco' ? App.formatarValorInput(p.valor) : ''}"></div>
          </div>
          <div class="campo" data-so="leve-pague">
            <label for="pr-leve">Leve (peças)</label>
            <input class="input" id="pr-leve" type="number" min="2" max="10" value="${p.leve || 3}">
          </div>
          <div class="campo" data-so="leve-pague">
            <label for="pr-pague">Pague (peças)</label>
            <input class="input" id="pr-pague" type="number" min="1" max="9" value="${p.pague || 2}">
          </div>

          <div class="campo">
            <label for="pr-escopo">Onde vale</label>
            <select class="select" id="pr-escopo">
              <option value="todos">Loja toda</option>
              <option value="categoria">Uma categoria</option>
              <option value="colecao">Uma coleção</option>
              <option value="produtos">Produtos escolhidos</option>
            </select>
          </div>
          <div class="campo" data-escopo="categoria">
            <label for="pr-categoria">Categoria</label>
            <select class="select" id="pr-categoria">${categorias.map((c) => `<option ${p.escopo && p.escopo.tipo === 'categoria' && p.escopo.valor === c ? 'selected' : ''}>${App.escapeHtml(c)}</option>`).join('')}</select>
          </div>
          <div class="campo" data-escopo="colecao">
            <label for="pr-colecao">Coleção</label>
            <select class="select" id="pr-colecao">${colecoes.map((c) => `<option ${p.escopo && p.escopo.tipo === 'colecao' && p.escopo.valor === c ? 'selected' : ''}>${App.escapeHtml(c)}</option>`).join('')}</select>
          </div>
          <div class="campo col-span-2" data-escopo="produtos">
            <span class="rotulo">Produtos (<span id="qtd-sel">0</span> escolhidos)</span>
            <input class="input" id="pr-busca" type="search" placeholder="Filtrar produtos…" aria-label="Filtrar produtos">
            <div id="pr-produtos" style="max-height:200px;overflow:auto;border:1px solid var(--cor-borda);border-radius:var(--raio-sm);padding:6px 10px;margin-top:6px"></div>
          </div>

          <div class="campo">
            <label for="pr-inicio">Início</label>
            <input class="input" type="date" id="pr-inicio" value="${p.inicio || ''}">
          </div>
          <div class="campo">
            <label for="pr-fim">Fim</label>
            <input class="input" type="date" id="pr-fim" value="${p.fim || ''}">
            <span class="ajuda">Vazio = até ser pausada.</span>
          </div>
          <label class="checkbox col-span-2"><input type="checkbox" id="pr-ativo" ${p.ativo !== false ? 'checked' : ''}> Promoção ativa</label>
          <div class="alerta info col-span-2" id="pr-exemplo"><i data-lucide="eye"></i><span></span></div>
        </form>`,
      acoes: [{ texto: 'Cancelar' }, { texto: 'Salvar promoção', classe: 'btn-primario', icone: 'check', aoClicar: salvar }]
    });

    const escopoSel = el.querySelector('#pr-escopo');
    escopoSel.value = (p.escopo && p.escopo.tipo) || 'todos';

    function desenharProdutos() {
      const termo = el.querySelector('#pr-busca').value.toLowerCase();
      el.querySelector('#pr-produtos').innerHTML = produtos
        .filter((x) => !termo || x.nome.toLowerCase().includes(termo))
        .map((x) => `<label class="checkbox" style="display:flex;padding:4px 0"><input type="checkbox" data-prod="${x.id}" ${selecionados.has(x.id) ? 'checked' : ''}> ${App.escapeHtml(x.nome)} <span class="texto-3 texto-xs">· ${App.formatarMoeda(x.preco)}</span></label>`).join('');
      el.querySelectorAll('[data-prod]').forEach((c) => c.addEventListener('change', () => {
        c.checked ? selecionados.add(c.dataset.prod) : selecionados.delete(c.dataset.prod);
        atualizar();
      }));
      el.querySelector('#qtd-sel').textContent = selecionados.size;
    }
    el.querySelector('#pr-busca').addEventListener('input', desenharProdutos);

    function coletar() {
      const escopoTipo = escopoSel.value;
      const escopo = { tipo: escopoTipo, valor: escopoTipo === 'categoria' ? el.querySelector('#pr-categoria').value : escopoTipo === 'colecao' ? el.querySelector('#pr-colecao').value : escopoTipo === 'produtos' ? [...selecionados] : null };
      const dados = {
        id: promo ? promo.id : undefined,
        nome: el.querySelector('#pr-nome').value.trim(), tipo, escopo,
        inicio: el.querySelector('#pr-inicio').value, fim: el.querySelector('#pr-fim').value,
        ativo: el.querySelector('#pr-ativo').checked
      };
      if (tipo === 'percentual') dados.valor = Number(el.querySelector('#pr-percentual').value);
      if (tipo === 'preco') dados.valor = App.lerNumero(el.querySelector('#pr-preco').value);
      if (tipo === 'leve-pague') { dados.leve = Number(el.querySelector('#pr-leve').value); dados.pague = Number(el.querySelector('#pr-pague').value); }
      return dados;
    }

    // Exemplo com um produto da promoção
    function atualizar() {
      el.querySelectorAll('[data-tipo]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tipo === tipo)));
      el.querySelectorAll('[data-so]').forEach((c) => c.classList.toggle('oculto', c.dataset.so !== tipo));
      el.querySelectorAll('[data-escopo]').forEach((c) => c.classList.toggle('oculto', c.dataset.escopo !== escopoSel.value));
      el.querySelector('#qtd-sel').textContent = selecionados.size;
      const d = coletar();
      const e = d.escopo;
      const exemplo = produtos.find((x) => e.tipo === 'todos' || (e.tipo === 'categoria' && x.categoria === e.valor) || (e.tipo === 'colecao' && x.colecao === e.valor) || (e.tipo === 'produtos' && e.valor.includes(x.id)));
      const caixa = el.querySelector('#pr-exemplo span');
      if (!exemplo) { caixa.textContent = 'Nenhum produto se encaixa ainda.'; return; }
      const qtd = produtos.filter((x) => e.tipo === 'todos' || (e.tipo === 'categoria' && x.categoria === e.valor) || (e.tipo === 'colecao' && x.colecao === e.valor) || (e.tipo === 'produtos' && e.valor.includes(x.id))).length;
      if (tipo === 'percentual') caixa.innerHTML = `Ex.: ${App.escapeHtml(exemplo.nome)} de <s>${App.formatarMoeda(exemplo.preco)}</s> por <strong>${App.formatarMoeda(exemplo.preco * (1 - (d.valor || 0) / 100))}</strong> · vale para ${qtd} produto(s).`;
      else if (tipo === 'preco') caixa.innerHTML = `Ex.: ${App.escapeHtml(exemplo.nome)} de <s>${App.formatarMoeda(exemplo.preco)}</s> por <strong>${App.formatarMoeda(d.valor || 0)}</strong> · vale para ${qtd} produto(s).`;
      else caixa.innerHTML = `Ex.: levando ${d.leve} peças de ${App.escapeHtml(exemplo.nome)} (${App.formatarMoeda(exemplo.preco)}), paga <strong>${App.formatarMoeda(exemplo.preco * d.pague)}</strong> em vez de ${App.formatarMoeda(exemplo.preco * d.leve)} · vale para ${qtd} produto(s).`;
    }

    el.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => { tipo = b.dataset.tipo; atualizar(); }));
    el.querySelectorAll('input, select').forEach((c) => c.addEventListener('input', atualizar));
    el.querySelectorAll('select').forEach((c) => c.addEventListener('change', atualizar));
    desenharProdutos();
    atualizar();

    async function salvar(_, botao) {
      const dados = coletar();
      if (!dados.nome) { el.querySelector('#pr-nome').focus(); return App.toast('Dê um nome à promoção.', 'erro'); }
      botao.disabled = true;
      try {
        const salva = await Data.salvarPromocao(dados);
        fechar();
        App.toast(`Promoção salva (${App.badgeStatus(salva.status).replace(/<[^>]+>/g, '').toLowerCase()}).`);
        carregar();
      } catch (e) { App.toast(e.message, 'erro'); botao.disabled = false; }
    }
  }

  $('btn-nova').addEventListener('click', () => abrirFormulario());
  await carregar();
});
