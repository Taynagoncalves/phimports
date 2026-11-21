/* ==========================================================================
   produto-form.js — Cadastro/edição de produto
   - Margem % calculada automaticamente
   - Upload de foto com preview (guardada como dataURL; no Firebase vai
     para o Storage)
   - Grade de variações: tamanhos × cores → SKU, código de barras e estoque
   ========================================================================== */
App.aoIniciar(async () => {
  const form = document.getElementById('form-produto');
  const corpoGrade = document.getElementById('grade');
  const idEdicao = App.parametroUrl('id');

  const LETRAS = ['PP', 'P', 'M', 'G', 'GG'];

  // Estado da grade
  const selecionados = { tamanhos: new Set(), cores: new Set() };
  let variacoes = []; // [{tamanho, cor, sku, codigoBarras, estoque}]
  let foto = '';
  let envioFoto = null; // envio da foto em andamento (o salvar espera terminar)
  let produtoOriginal = null;

  /* ---------- Carrega listas auxiliares ---------- */
  const [categorias, marcas, colecoes, fornecedores, tamanhos] = await Promise.all([
    Data.listarCategorias(), Data.listarMarcas(), Data.listarColecoes(), Data.listarFornecedores(), Data.listarTamanhos()
  ]);
  let cores = await Data.listarCores();

  App.preencherSelect(form.categoria, categorias, { vazio: 'Selecione…' });
  App.preencherSelect(form.fornecedorId, fornecedores.map((f) => ({ valor: f.id, texto: f.nome })), { vazio: 'Nenhum' });

  /* ==================================================================
     NCM — obrigatório em cada item da NFC-e.
     Vazio = usa o NCM padrão da categoria (Configurações → Dados fiscais).
     ================================================================== */
  const fiscal = await Data.obterConfigFiscal();
  const ncmDaCategoria = () => (fiscal.ncmPorCategoria || {})[form.categoria.value] || '';
  const ncmValido = (v) => String(v || '').replace(/\D/g, '').length === 8;

  function atualizarNcm() {
    const proprio = form.ncm.value.trim();
    const padrao = ncmDaCategoria();
    const ajuda = document.getElementById('ncm-ajuda');
    const efetivo = document.getElementById('ncm-efetivo');
    const texto = efetivo.querySelector('span');

    form.ncm.placeholder = padrao || '0000.00.00';
    form.ncm.classList.toggle('invalido', !!proprio && !ncmValido(proprio));
    ajuda.textContent = proprio && !ncmValido(proprio)
      ? 'O NCM tem 8 dígitos.'
      : form.categoria.value
        ? (padrao ? `Deixe em branco para usar o padrão de ${form.categoria.value}: ${padrao}.` : `A categoria ${form.categoria.value} não tem NCM padrão.`)
        : 'Escolha a categoria para ver o NCM padrão.';
    ajuda.style.color = proprio && !ncmValido(proprio) ? 'var(--cor-perigo)' : '';

    // Mostra qual NCM vai de fato para a nota (e de onde ele vem)
    if (ncmValido(proprio)) {
      efetivo.className = 'alerta info';
      texto.innerHTML = `<strong class="mono">${App.escapeHtml(proprio)}</strong>&nbsp;· definido no produto`;
    } else if (padrao) {
      efetivo.className = 'alerta info';
      texto.innerHTML = `<strong class="mono">${App.escapeHtml(padrao)}</strong>&nbsp;· padrão da categoria`;
    } else {
      efetivo.className = 'alerta';
      texto.innerHTML = 'Sem NCM — a nota deste produto não poderá ser emitida';
    }
    document.getElementById('btn-ncm-padrao').disabled = !padrao || proprio === padrao;
  }
  form.ncm.addEventListener('input', atualizarNcm);
  form.categoria.addEventListener('change', atualizarNcm);
  document.getElementById('btn-ncm-padrao').addEventListener('click', () => {
    form.ncm.value = ncmDaCategoria();
    atualizarNcm();
  });
  document.getElementById('lista-marcas').innerHTML = marcas.map((m) => `<option value="${App.escapeHtml(m)}">`).join('');
  document.getElementById('lista-colecoes').innerHTML = colecoes.map((c) => `<option value="${App.escapeHtml(c)}">`).join('');

  /* ==================================================================
     MARGEM
     ================================================================== */
  function atualizarMargem() {
    const custo = App.lerNumero(form.custo.value);
    const preco = App.lerNumero(form.preco.value);
    const box = document.getElementById('box-margem');
    const texto = document.getElementById('texto-margem');
    if (!custo || !preco) {
      box.className = 'alerta info';
      texto.textContent = 'Informe custo e preço para calcular a margem.';
      return;
    }
    const lucro = preco - custo;
    const margem = (lucro / preco) * 100;   // margem sobre o preço de venda
    const markup = (preco / custo);          // multiplicador
    box.className = 'alerta';
    box.style.background = margem >= 40 ? 'var(--cor-sucesso-suave)' : margem >= 20 ? 'var(--cor-alerta-suave)' : 'var(--cor-perigo-suave)';
    box.style.color = margem >= 40 ? 'var(--cor-sucesso)' : margem >= 20 ? 'var(--cor-alerta)' : 'var(--cor-perigo)';
    texto.innerHTML = `Margem de <strong>${App.formatarPercentual(margem)}</strong> · lucro de <strong>${App.formatarMoeda(lucro)}</strong> por peça · markup ${markup.toFixed(2).replace('.', ',')}x`;
  }
  form.custo.addEventListener('input', atualizarMargem);
  form.preco.addEventListener('input', atualizarMargem);

  /* ==================================================================
     FOTO (preview)
     ================================================================== */
  const inputFoto = document.getElementById('foto');
  const preview = document.getElementById('foto-preview');
  const placeholder = document.getElementById('upload-placeholder');
  const btnRemover = document.getElementById('btn-remover-foto');

  function mostrarFoto(src) {
    foto = src || '';
    preview.src = foto;
    preview.classList.toggle('oculto', !foto);
    placeholder.classList.toggle('oculto', !!foto);
    btnRemover.classList.toggle('oculto', !foto);
  }
  inputFoto.addEventListener('change', () => {
    const arquivo = inputFoto.files[0];
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) return App.toast('Escolha um arquivo de imagem.', 'erro');
    if (arquivo.size > 15 * 1024 * 1024) return App.toast('A imagem deve ter no máximo 15 MB.', 'erro');
    // Mostra na hora (reduzida) e envia ao Cloudinary em segundo plano
    App.comprimirImagem(arquivo, 900).then(mostrarFoto).catch(() => {});
    envioFoto = App.enviarImagem(arquivo, { maximo: 1200, subpasta: 'produtos' })
      .then((url) => { foto = url; if (App.cloudinaryAtivo()) App.toast('Foto enviada.', 'sucesso'); return url; })
      .catch((e) => { App.toast(e.message, 'erro', 7000); mostrarFoto(''); throw e; })
      .finally(() => { envioFoto = null; });
  });
  btnRemover.addEventListener('click', () => { inputFoto.value = ''; mostrarFoto(''); });

  /* ==================================================================
     GRADE DE VARIAÇÕES
     ================================================================== */

  // Sigla sem acento (3 letras) — usada no SKU
  const sigla = (t, n = 3) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').slice(0, n).toUpperCase();

  // Prefixo do SKU a partir das iniciais do nome: "Camiseta Básica Algodão" → "CBA"
  function prefixoSku() {
    const palavras = form.nome.value.trim().split(/\s+/).filter((p) => p.length > 2 || /^[A-Z]/.test(p));
    const pref = palavras.slice(0, 3).map((p) => sigla(p, 1)).join('');
    return pref || 'PRD';
  }

  // EAN-13 com dígito verificador (prefixo 789 = Brasil)
  function gerarCodigoBarras() {
    let base = '789';
    for (let i = 0; i < 9; i++) base += Math.floor(Math.random() * 10);
    const soma = base.split('').reduce((acc, n, i) => acc + Number(n) * (i % 2 === 0 ? 1 : 3), 0);
    return base + ((10 - (soma % 10)) % 10);
  }

  // Bolinha de cor usando a paleta local (inclui cores recém-adicionadas)
  const bolinha = (nome) => `<span class="cor-bolinha" style="background:${(cores.find((c) => c.nome === nome) || {}).hex || '#CCCCCC'}" aria-hidden="true"></span>`;

  // Ordena tamanhos conforme a lista oficial (PP, P, M… 36, 38…)
  const ordemTamanho = (t) => { const i = tamanhos.indexOf(t); return i < 0 ? 999 : i; };

  /** Desenha os chips de tamanhos e cores */
  function desenharChips() {
    const chip = (valor, grupo, extra = '') => `
      <button type="button" class="chip" data-grupo="${grupo}" data-valor="${App.escapeHtml(valor)}" aria-pressed="${selecionados[grupo].has(valor)}">${extra}${App.escapeHtml(valor)}</button>`;
    document.getElementById('chips-letras').innerHTML = tamanhos.filter((t) => LETRAS.includes(t)).map((t) => chip(t, 'tamanhos')).join('');
    document.getElementById('chips-numeros').innerHTML = tamanhos.filter((t) => !LETRAS.includes(t)).map((t) => chip(t, 'tamanhos')).join('');
    document.getElementById('chips-cores').innerHTML = cores.map((c) => chip(c.nome, 'cores', `<span class="cor-bolinha" style="background:${c.hex}" aria-hidden="true"></span>`)).join('');

    document.querySelectorAll('.chip[data-grupo]').forEach((b) => b.addEventListener('click', () => {
      const conjunto = selecionados[b.dataset.grupo];
      const v = b.dataset.valor;
      conjunto.has(v) ? conjunto.delete(v) : conjunto.add(v);
      b.setAttribute('aria-pressed', String(conjunto.has(v)));
      gerarGrade();
    }));
  }

  /**
   * Gera a tabela tamanho × cor.
   * Mantém SKU/código/estoque já digitados para combinações que continuam existindo.
   */
  function gerarGrade() {
    lerGradeDaTela();
    const anteriores = new Map(variacoes.map((v) => [v.tamanho + '|' + v.cor, v]));
    const lista = [];
    [...selecionados.tamanhos].sort((a, b) => ordemTamanho(a) - ordemTamanho(b)).forEach((tam) => {
      [...selecionados.cores].forEach((cor) => {
        const anterior = anteriores.get(tam + '|' + cor);
        lista.push(anterior || {
          tamanho: tam,
          cor,
          sku: `${prefixoSku()}-${tam}-${sigla(cor)}`,
          codigoBarras: gerarCodigoBarras(),
          estoque: 0
        });
      });
    });
    variacoes = lista;
    desenharGrade();
  }

  /** Lê os valores digitados na tabela para o array de variações */
  function lerGradeDaTela() {
    corpoGrade.querySelectorAll('tr[data-i]').forEach((tr) => {
      const v = variacoes[Number(tr.dataset.i)];
      if (!v) return;
      v.sku = tr.querySelector('[data-campo=sku]').value.trim().toUpperCase();
      v.codigoBarras = tr.querySelector('[data-campo=codigoBarras]').value.trim();
      v.estoque = Math.max(0, parseInt(tr.querySelector('[data-campo=estoque]').value, 10) || 0);
    });
  }

  function desenharGrade() {
    const ferramentas = document.getElementById('ferramentas-grade');
    if (!variacoes.length) {
      ferramentas.classList.add('oculto');
      corpoGrade.innerHTML = `<tr><td colspan="5">${App.estadoVazio({ icone: 'grid-3x3', titulo: 'Nenhuma variação ainda', texto: 'Selecione ao menos um tamanho e uma cor acima para gerar a grade.' })}</td></tr>`;
      document.getElementById('resumo-grade').textContent = '';
      App.icones();
      return;
    }
    ferramentas.classList.remove('oculto');
    corpoGrade.innerHTML = variacoes.map((v, i) => {
      const rotulo = `${v.tamanho} / ${v.cor}`;
      return `
      <tr data-i="${i}">
        <td class="cel-principal"><span class="negrito">${App.escapeHtml(v.tamanho)}</span></td>
        <td data-label="Cor"><span class="flex items-center gap-2" style="justify-content:inherit">${bolinha(v.cor)}${App.escapeHtml(v.cor)}</span></td>
        <td data-label="SKU"><input class="input mono" data-campo="sku" value="${App.escapeHtml(v.sku)}" aria-label="SKU ${App.escapeHtml(rotulo)}"></td>
        <td data-label="Código de barras"><input class="input mono" data-campo="codigoBarras" inputmode="numeric" maxlength="14" value="${App.escapeHtml(v.codigoBarras)}" aria-label="Código de barras ${App.escapeHtml(rotulo)}"></td>
        <td data-label="Estoque" class="num"><input class="input input-estoque texto-direita" data-campo="estoque" type="number" min="0" value="${v.estoque}" aria-label="Estoque ${App.escapeHtml(rotulo)}"></td>
      </tr>`;
    }).join('');
    corpoGrade.querySelectorAll('[data-campo=estoque]').forEach((i) => i.addEventListener('input', atualizarResumoGrade));
    atualizarResumoGrade();
  }

  function atualizarResumoGrade() {
    lerGradeDaTela();
    const pecas = variacoes.reduce((s, v) => s + v.estoque, 0);
    const el = document.getElementById('resumo-grade');
    el.textContent = variacoes.length && !pecas
      ? `${variacoes.length} variações · 0 peças — preencha a coluna Estoque`
      : `${variacoes.length} variações · ${pecas} peças no total`;
    el.classList.toggle('valor-negativo', !!variacoes.length && !pecas);
    el.classList.toggle('negrito', !!variacoes.length && !pecas);
  }

  // Aplica o mesmo estoque em todas as linhas
  document.getElementById('btn-aplicar-estoque').addEventListener('click', () => {
    const valor = parseInt(document.getElementById('estoque-todos').value, 10);
    if (Number.isNaN(valor) || valor < 0) return App.toast('Informe uma quantidade válida.', 'erro');
    corpoGrade.querySelectorAll('[data-campo=estoque]').forEach((i) => { i.value = valor; });
    atualizarResumoGrade();
  });

  // Regera SKUs (com o nome atual) e códigos de barras
  document.getElementById('btn-regerar').addEventListener('click', () => {
    lerGradeDaTela();
    variacoes.forEach((v) => { v.sku = `${prefixoSku()}-${v.tamanho}-${sigla(v.cor)}`; v.codigoBarras = gerarCodigoBarras(); });
    desenharGrade();
    App.toast('SKUs e códigos de barras regerados.');
  });

  // Nova cor personalizada
  document.getElementById('btn-add-cor').addEventListener('click', async () => {
    const nome = document.getElementById('nova-cor').value.trim();
    if (!nome) return App.toast('Digite o nome da cor.', 'erro');
    const nomeFormatado = nome.charAt(0).toUpperCase() + nome.slice(1);
    await Data.adicionarCor({ nome: nomeFormatado, hex: document.getElementById('nova-cor-hex').value.toUpperCase() });
    cores = await Data.listarCores();
    selecionados.cores.add(cores.find((c) => c.nome.toLowerCase() === nome.toLowerCase())?.nome || nomeFormatado);
    document.getElementById('nova-cor').value = '';
    desenharChips();
    gerarGrade();
    App.toast(`Cor "${nomeFormatado}" adicionada.`);
  });

  /* ==================================================================
     EDIÇÃO: carrega produto existente
     ================================================================== */
  if (idEdicao) {
    try {
      produtoOriginal = await Data.obterProduto(idEdicao);
      document.getElementById('titulo-form').textContent = 'Editar produto';
      document.body.dataset.tituloAba = 'Editar produto';
      App.aplicarMarcaLoja(await Data.obterLoja());
      const p = produtoOriginal;
      form.produtoId.value = p.id;
      form.nome.value = p.nome;
      form.marca.value = p.marca;
      form.categoria.value = p.categoria;
      form.colecao.value = p.colecao || '';
      form.fornecedorId.value = p.fornecedorId || '';
      form.ncm.value = p.ncm || '';
      form.descricao.value = p.descricao || '';
      document.getElementById('recolor-foto').checked = p.recolorFoto !== false;
      form.custo.value = App.formatarValorInput(p.custo);
      form.preco.value = App.formatarValorInput(p.preco);
      form.estoqueMinimo.value = p.estoqueMinimo ?? 5;
      mostrarFoto(p.foto);
      variacoes = p.variacoes.map((v) => ({ ...v }));
      variacoes.forEach((v) => { selecionados.tamanhos.add(v.tamanho); selecionados.cores.add(v.cor); });
    } catch (e) {
      App.toast('Produto não encontrado.', 'erro');
    }
  }

  desenharChips();
  if (variacoes.length) desenharGrade(); else gerarGrade();
  atualizarMargem();
  atualizarNcm();

  /* ==================================================================
     SALVAR
     ================================================================== */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!App.validarFormulario(form)) return;
    lerGradeDaTela();

    if (!variacoes.length) return App.toast('Selecione tamanhos e cores para gerar a grade.', 'erro');
    const skus = variacoes.map((v) => v.sku);
    if (skus.some((s) => !s)) return App.toast('Todas as variações precisam de SKU.', 'erro');
    if (new Set(skus).size !== skus.length) return App.toast('Há SKUs repetidos na grade.', 'erro');
    const codigos = variacoes.map((v) => v.codigoBarras).filter(Boolean);
    if (new Set(codigos).size !== codigos.length) return App.toast('Há códigos de barras repetidos na grade.', 'erro');

    const dados = App.lerFormulario(form);
    if (envioFoto) {
      App.toast('Terminando de enviar a foto…');
      try { await envioFoto; } catch (er) { return; }
    }

    // NCM: se informado, precisa ter 8 dígitos; se vazio, avisa quando a categoria também não tem
    if (dados.ncm && !ncmValido(dados.ncm)) {
      form.ncm.focus();
      return App.toast('O NCM deve ter 8 dígitos (ex.: 6109.10.00).', 'erro');
    }
    if (!dados.ncm && !ncmDaCategoria() && App.emiteNota) {
      const ok = await App.confirmar({
        titulo: 'Produto sem NCM',
        mensagem: `Nem o produto nem a categoria "${dados.categoria}" têm NCM. Você poderá vender, mas não emitir NFC-e deste produto até informar o NCM.`,
        textoConfirmar: 'Salvar sem NCM'
      });
      if (!ok) { form.ncm.focus(); return; }
    }

    const produto = {
      ...(produtoOriginal || {}),
      id: dados.produtoId || undefined,
      nome: dados.nome,
      marca: dados.marca,
      categoria: dados.categoria,
      colecao: dados.colecao,
      fornecedorId: dados.fornecedorId || null,
      ncm: dados.ncm || '',   // vazio = usa o NCM padrão da categoria
      descricao: dados.descricao,
      custo: App.lerNumero(dados.custo),
      preco: App.lerNumero(dados.preco),
      estoqueMinimo: parseInt(dados.estoqueMinimo, 10) || 0,
      foto,
      recolorFoto: document.getElementById('recolor-foto').checked,
      variacoes
    };
    // Produto novo sem nenhuma peça: quase sempre é porque a quantidade não foi preenchida na grade
    if (!idEdicao && variacoes.length && variacoes.every((v) => !v.estoque)) {
      const ok = await App.confirmar({
        titulo: 'Nenhuma peça no estoque',
        mensagem: 'A quantidade de cada tamanho/cor está zerada, então o produto vai aparecer como "Esgotado". Preencha a coluna "Estoque" na grade (ou use "Quantidade em cada tamanho/cor" + Aplicar).',
        textoConfirmar: 'Salvar esgotado mesmo',
        textoCancelar: 'Voltar e preencher'
      });
      if (!ok) { const campo = document.getElementById('estoque-todos'); campo.scrollIntoView({ block: 'center' }); campo.focus(); return; }
    }
    if (produto.preco < produto.custo) {
      const ok = await App.confirmar({ titulo: 'Preço abaixo do custo', mensagem: 'O preço de venda está menor que o custo. Deseja salvar mesmo assim?', textoConfirmar: 'Salvar assim mesmo' });
      if (!ok) return;
    }

    const botao = form.querySelector('button[type=submit]');
    botao.disabled = true;
    try {
      await Data.salvarProduto(produto);
      App.toast(idEdicao ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!');
      setTimeout(() => { location.href = 'produtos.html'; }, 700);
    } catch (erro) {
      App.toast(erro.message, 'erro');
      botao.disabled = false;
    }
  });
});
