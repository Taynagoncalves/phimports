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
  const idCopia = idEdicao ? '' : App.parametroUrl('copiar');   // "Duplicar" na lista de produtos

  // Estado da grade
  const selecionados = { tamanhos: new Set(), cores: new Set() };
  let variacoes = []; // [{tamanho, cor, sku, codigoBarras, estoque}]
  let foto = '';
  let envioFoto = null; // envio da foto em andamento (o salvar espera terminar)
  let fotosCores = {};  // cor → foto daquela cor (opcional)
  let fotosExtras = []; // mais fotos da peça (até 5)
  const enviosExtras = new Set();
  const enviosCores = new Map(); // cor → envio em andamento
  let produtoOriginal = null;
  let sujo = false;          // tem alteração não salva
  let salvarOutro = false;   // "Salvar e cadastrar outro"

  /* ---------- Carrega listas auxiliares ---------- */
  const [categorias, marcas, colecoes, fornecedores, tamanhos] = await Promise.all([
    Data.listarCategorias(), Data.listarMarcas(), Data.listarColecoes(), Data.listarFornecedores(), Data.listarTamanhos()
  ]);
  try { await Data.garantirCoresJeans(); } catch (er) { /* só o dono grava */ }
  let cores = await Data.listarCores();

  App.preencherSelect(form.categoria, categorias, { vazio: 'Selecione…' });

  // Links "+ Outro tamanho" / "+ Outra cor": abrem o campo só quando precisa
  document.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => {
    const bloco = document.getElementById(b.dataset.abrir);
    bloco.hidden = !bloco.hidden;
    b.classList.toggle('aberto', !bloco.hidden);
    if (!bloco.hidden) bloco.querySelector('input')?.focus();
  }));

  // Categoria nova: fica salva na lista da loja e já vem escolhida
  const blocoCategoria = document.getElementById('nova-categoria-bloco');
  const campoCategoria = document.getElementById('nova-categoria');
  document.getElementById('btn-nova-categoria').addEventListener('click', () => {
    blocoCategoria.hidden = !blocoCategoria.hidden;
    if (!blocoCategoria.hidden) campoCategoria.focus();
  });
  async function criarCategoria() {
    const nome = campoCategoria.value.trim();
    if (!nome) { campoCategoria.focus(); return App.toast('Digite o nome da categoria.', 'erro'); }
    try {
      const salva = await Data.adicionarCategoria(nome);
      const lista = await Data.listarCategorias();
      App.preencherSelect(form.categoria, lista, { vazio: 'Selecione…' });
      form.categoria.value = salva;
      form.categoria.classList.remove('invalido');
      form.categoria.dispatchEvent(new Event('change'));
      campoCategoria.value = '';
      blocoCategoria.hidden = true;
      App.toast(`Categoria "${salva}" criada.`);
    } catch (er) { App.toast(er.message, 'erro'); }
  }
  document.getElementById('btn-salvar-categoria').addEventListener('click', criarCategoria);
  campoCategoria.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); criarCategoria(); } });
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
    const [eLucro, eMargem, eMarkup] = ['m-lucro', 'm-margem', 'm-markup'].map((id) => document.getElementById(id));
    box.classList.remove('bom', 'medio', 'ruim');
    if (!custo || !preco) {
      eLucro.textContent = eMargem.textContent = eMarkup.textContent = '—';
      texto.textContent = 'Informe custo e preço para ver o lucro.';
      desenharPrevia();
      return;
    }
    const lucro = preco - custo;
    const margem = (lucro / preco) * 100;   // margem sobre o preço de venda
    const markup = preco / custo;           // multiplicador
    box.classList.add(margem >= 40 ? 'bom' : margem >= 20 ? 'medio' : 'ruim');
    eLucro.textContent = App.formatarMoeda(lucro);
    eMargem.textContent = App.formatarPercentual(margem);
    eMarkup.textContent = markup.toFixed(2).replace('.', ',') + '×';
    texto.textContent = margem >= 40 ? 'Boa margem.' : margem >= 20 ? 'Margem apertada — confira se cobre as despesas da loja.' : lucro < 0 ? 'Você está vendendo abaixo do custo.' : 'Margem baixa.';
    document.querySelectorAll('#chips-markup [data-markup]').forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(markup - Number(b.dataset.markup)) < 0.06)));
    desenharPrevia();
  }
  form.custo.addEventListener('input', atualizarMargem);
  form.preco.addEventListener('input', atualizarMargem);

  // Sugere o preço multiplicando o custo (2×, 2,5×…), terminando em ,90 se marcado
  document.querySelectorAll('#chips-markup [data-markup]').forEach((b) => b.addEventListener('click', () => {
    const custo = App.lerNumero(form.custo.value);
    if (!custo) { form.custo.focus(); return App.toast('Informe o custo primeiro.', 'erro'); }
    let preco = custo * Number(b.dataset.markup);
    preco = document.getElementById('terminar-90').checked ? Math.max(1, Math.ceil(preco)) - 0.10 : Math.round(preco * 100) / 100;
    form.preco.value = App.formatarValorInput(preco);
    form.preco.classList.remove('invalido');
    sujo = true;
    atualizarMargem();
  }));

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
    desenharPrevia();
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

  /* ---------- Mais fotos (galeria) ---------- */
  function desenharFotosExtras() {
    const el = document.getElementById('fotos-extras');
    el.innerHTML = fotosExtras.map((url, i) => `
      <div class="foto-extra"><img src="${App.escapeHtml(url)}" alt="Foto ${i + 2}"><button type="button" data-tirar-extra="${i}" aria-label="Tirar foto ${i + 2}">${App.icone('x')}</button></div>`).join('')
      + (fotosExtras.length < 5 ? `<label class="foto-extra mais" title="Adicionar foto">${App.icone('plus')}<input type="file" accept="image/*" id="nova-foto-extra" multiple hidden></label>` : '');
    el.querySelectorAll('[data-tirar-extra]').forEach((b) => b.addEventListener('click', () => { fotosExtras.splice(Number(b.dataset.tirarExtra), 1); desenharFotosExtras(); }));
    const inp = document.getElementById('nova-foto-extra');
    if (inp) inp.addEventListener('change', () => {
      [...inp.files].filter((a) => a.type.startsWith('image/')).slice(0, 5 - fotosExtras.length).forEach((arquivo) => {
        const pos = fotosExtras.length;
        fotosExtras.push('');
        let enviada = false;
        App.comprimirImagem(arquivo, 500).then((previa) => { if (!enviada) { fotosExtras[pos] = previa; desenharFotosExtras(); } }).catch(() => {});
        const envio = App.enviarImagem(arquivo, { maximo: 1400, subpasta: 'produtos' })
          .then((url) => { enviada = true; fotosExtras[pos] = url; desenharFotosExtras(); })
          .catch((e) => { App.toast(e.message, 'erro', 7000); fotosExtras.splice(pos, 1); desenharFotosExtras(); throw e; })
          .finally(() => enviosExtras.delete(envio));
        enviosExtras.add(envio);
      });
      desenharFotosExtras();
    });
  }

  /* ---------- Foto de cada cor (opcional) ---------- */
  function desenharFotosCores() {
    const cores = [...selecionados.cores];
    const bloco = document.getElementById('fotos-cores-bloco');
    bloco.hidden = cores.length < 2;
    document.getElementById('fotos-cores').innerHTML = cores.map((cor, i) => {
      const url = fotosCores[cor];
      return `<div class="foto-cor">
        <label class="foto-cor-slot" title="Foto da cor ${App.escapeHtml(cor)}">
          ${url ? `<img src="${App.escapeHtml(url)}" alt="">` : App.icone('image-plus')}
          <input type="file" accept="image/*" data-foto-cor="${i}" aria-label="Foto da cor ${App.escapeHtml(cor)}" hidden>
        </label>
        <span class="foto-cor-nome">${App.bolinhaCor(cor)}${App.escapeHtml(cor)}</span>
        ${url ? `<button type="button" class="foto-cor-tirar" data-tirar-cor="${i}">Tirar</button>` : ''}
      </div>`;
    }).join('');
    document.querySelectorAll('[data-foto-cor]').forEach((inp) => inp.addEventListener('change', () => {
      const cor = cores[Number(inp.dataset.fotoCor)];
      const arquivo = inp.files[0];
      if (!arquivo || !arquivo.type.startsWith('image/')) return;
      let enviada = false;   // a prévia (reduzida) não pode passar por cima da foto já enviada
      App.comprimirImagem(arquivo, 600).then((previa) => { if (!enviada) { fotosCores[cor] = previa; desenharFotosCores(); } }).catch(() => {});
      const envio = App.enviarImagem(arquivo, { maximo: 1200, subpasta: 'produtos' })
        .then((url) => { enviada = true; fotosCores[cor] = url; desenharFotosCores(); return url; })
        .catch((e) => { App.toast(e.message, 'erro', 7000); delete fotosCores[cor]; desenharFotosCores(); throw e; })
        .finally(() => enviosCores.delete(cor));
      enviosCores.set(cor, envio);
    }));
    document.querySelectorAll('[data-tirar-cor]').forEach((b) => b.addEventListener('click', () => { delete fotosCores[cores[Number(b.dataset.tirarCor)]]; desenharFotosCores(); }));
  }

  /* ==================================================================
     GRADE DE VARIAÇÕES
     ================================================================== */

  // Sigla sem acento (3 letras) — usada no SKU
  const sigla = (t, n = 3) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').slice(0, n).toUpperCase();

  // Sigla da cor no SKU: uma palavra → 3 letras (Preto → PRE); duas ou mais → inicial + 2 letras
  // da última (Jeans claro → JCL, Azul-escuro → AES), para não repetir entre tons parecidos
  function siglaCor(cor) {
    const partes = String(cor).normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[\s-]+/).filter(Boolean);
    if (partes.length < 2) return sigla(cor);
    return (sigla(partes[0], 1) + sigla(partes[partes.length - 1], 2)).toUpperCase();
  }

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

  const hexDaCor = (nome) => (cores.find((c) => c.nome === nome) || {}).hex || '#CCCCCC';
  const bolinha = (nome) => `<span class="cor-bolinha" style="background:${hexDaCor(nome)}" aria-hidden="true"></span>`;

  // Ordena tamanhos conforme a lista (PP, P, M… 36, 38… e os que você criou no fim)
  const ordemTamanho = (t) => { const i = tamanhos.indexOf(t); return i < 0 ? 999 : i; };
  const ehNumero = (t) => /^\d+$/.test(t);
  const tamanhosEscolhidos = () => [...selecionados.tamanhos].sort((a, b) => ordemTamanho(a) - ordemTamanho(b));
  const coresEscolhidas = () => [...selecionados.cores];

  /** Desenha os chips de tamanhos e cores */
  function desenharChips() {
    const chip = (valor, grupo, extra = '') => `
      <button type="button" class="chip" data-grupo="${grupo}" data-valor="${App.escapeHtml(valor)}" aria-pressed="${selecionados[grupo].has(valor)}">${extra}${App.escapeHtml(valor)}</button>`;
    document.getElementById('chips-letras').innerHTML = tamanhos.filter((t) => !ehNumero(t)).map((t) => chip(t, 'tamanhos')).join('');
    document.getElementById('chips-numeros').innerHTML = tamanhos.filter(ehNumero).map((t) => chip(t, 'tamanhos')).join('');
    const ehJeans = (c) => /^jeans\b/i.test(c.nome);
    const chipCor = (c) => chip(c.nome, 'cores', `<span class="cor-bolinha" style="background:${c.hex}" aria-hidden="true"></span>`);
    document.getElementById('chips-cores').innerHTML = cores.filter((c) => !ehJeans(c)).map(chipCor).join('');
    document.getElementById('chips-jeans').innerHTML = cores.filter(ehJeans).map(chipCor).join('');
    document.getElementById('rot-jeans').hidden = !cores.some(ehJeans);

    document.querySelectorAll('.chip[data-grupo]').forEach((b) => b.addEventListener('click', () => {
      const conjunto = selecionados[b.dataset.grupo];
      const v = b.dataset.valor;
      conjunto.has(v) ? conjunto.delete(v) : conjunto.add(v);
      b.setAttribute('aria-pressed', String(conjunto.has(v)));
      sujo = true;
      gerarGrade();
    }));
  }

  // Atalhos de tamanhos (P ao GG, 38 ao 44…)
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const lista = b.dataset.preset ? b.dataset.preset.split(',') : [];
    selecionados.tamanhos = new Set(lista.filter((t) => tamanhos.includes(t)));
    sujo = true;
    desenharChips();
    gerarGrade();
  }));

  // Tamanho que não está na lista (XG, Único, 34…)
  async function adicionarTamanho() {
    const campo = document.getElementById('novo-tamanho');
    const t = campo.value.trim().toUpperCase().replace(/^UNICO$|^ÚNICO$/, 'Único');
    if (!t) return App.toast('Digite o tamanho.', 'erro');
    // Fica salvo na lista de tamanhos da loja (aparece nos próximos cadastros)
    try { await Data.adicionarTamanho(t); } catch (er) { App.toast(er.message, 'erro'); }
    if (!tamanhos.includes(t)) tamanhos.push(t);
    App.toast(`Tamanho "${t}" salvo.`);
    selecionados.tamanhos.add(t);
    campo.value = '';
    sujo = true;
    desenharChips();
    gerarGrade();
  }
  document.getElementById('btn-add-tamanho').addEventListener('click', adicionarTamanho);
  document.getElementById('novo-tamanho').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarTamanho(); } });

  /**
   * Gera as variações tamanho × cor.
   * Mantém SKU/código/estoque já digitados para combinações que continuam existindo.
   */
  function gerarGrade() {
    lerGradeDaTela();
    const anteriores = new Map(variacoes.map((v) => [v.tamanho + '|' + v.cor, v]));
    const lista = [];
    tamanhosEscolhidos().forEach((tam) => {
      coresEscolhidas().forEach((cor) => {
        lista.push(anteriores.get(tam + '|' + cor) || {
          tamanho: tam,
          cor,
          sku: `${prefixoSku()}-${tam}-${siglaCor(cor)}`,
          codigoBarras: gerarCodigoBarras(),
          estoque: 0
        });
      });
    });
    variacoes = lista;
    desenharGrade();
    desenharFotosCores();
  }

  /** Lê o que foi digitado (quantidades na matriz, SKU/código na tabela) */
  function lerGradeDaTela() {
    document.querySelectorAll('#matriz-estoque [data-mat]').forEach((inp) => {
      const v = variacoes[Number(inp.dataset.mat)];
      if (v) v.estoque = Math.max(0, parseInt(inp.value, 10) || 0);
    });
    corpoGrade.querySelectorAll('tr[data-i]').forEach((tr) => {
      const v = variacoes[Number(tr.dataset.i)];
      if (!v) return;
      v.sku = tr.querySelector('[data-campo=sku]').value.trim().toUpperCase();
      v.codigoBarras = tr.querySelector('[data-campo=codigoBarras]').value.trim();
    });
  }

  function desenharGrade() {
    const matriz = document.getElementById('matriz-estoque');
    const ferramentas = document.getElementById('ferramentas-grade');
    const codigos = document.getElementById('pf-codigos');
    if (!variacoes.length) {
      ferramentas.classList.add('oculto');
      codigos.classList.add('oculto');
      const falta = !selecionados.tamanhos.size && !selecionados.cores.size ? 'os tamanhos e as cores'
        : !selecionados.tamanhos.size ? 'pelo menos um tamanho' : 'pelo menos uma cor';
      matriz.innerHTML = `<div class="pf-vazio">${App.icone('grid-3x3')}<strong>Falta escolher ${falta}</strong><span>Marque na etapa 3 e a tabela de quantidades aparece aqui.</span></div>`;
      corpoGrade.innerHTML = '';
      atualizarResumoGrade();
      App.icones();
      return;
    }
    ferramentas.classList.remove('oculto');
    codigos.classList.remove('oculto');

    // Matriz: cores nas linhas, tamanhos nas colunas
    const tams = tamanhosEscolhidos();
    const cs = coresEscolhidas();
    const indice = new Map(variacoes.map((v, i) => [v.tamanho + '|' + v.cor, i]));
    matriz.innerHTML = `
      <table class="pf-matriz">
        <thead><tr><th class="pf-matriz-cor">Cor</th>${tams.map((t) => `<th>${App.escapeHtml(t)}</th>`).join('')}<th class="pf-matriz-soma">Total</th></tr></thead>
        <tbody>${cs.map((cor, ci) => `
          <tr>
            <th class="pf-matriz-cor" scope="row"><span>${bolinha(cor)}${App.escapeHtml(cor)}</span></th>
            ${tams.map((t) => { const i = indice.get(t + '|' + cor); return `<td><input class="input" type="number" min="0" inputmode="numeric" data-mat="${i}" value="${variacoes[i].estoque || ''}" placeholder="0" aria-label="Quantidade ${App.escapeHtml(cor)} tamanho ${App.escapeHtml(t)}"></td>`; }).join('')}
            <td class="pf-matriz-soma" data-soma-linha="${ci}">0</td>
          </tr>`).join('')}
        </tbody>
        ${cs.length > 1 ? `<tfoot><tr><th class="pf-matriz-cor">Total</th>${tams.map((t, ti) => `<td data-soma-col="${ti}">0</td>`).join('')}<td class="pf-matriz-soma" data-soma-geral>0</td></tr></tfoot>` : ''}
      </table>`;
    const entradas = [...matriz.querySelectorAll('[data-mat]')];
    entradas.forEach((inp, k) => {
      inp.addEventListener('input', atualizarResumoGrade);
      inp.addEventListener('focus', () => inp.select());
      // Enter pula para a próxima casa (em vez de salvar o formulário)
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        (entradas[k + 1] || document.getElementById('estoqueMinimo')).focus();
      });
    });

    // Tabela de SKUs e códigos
    corpoGrade.innerHTML = variacoes.map((v, i) => {
      const rotulo = `${v.tamanho} / ${v.cor}`;
      return `
      <tr data-i="${i}">
        <td class="cel-principal"><span class="negrito">${App.escapeHtml(v.tamanho)}</span></td>
        <td data-label="Cor"><span class="flex items-center gap-2" style="justify-content:inherit">${bolinha(v.cor)}${App.escapeHtml(v.cor)}</span></td>
        <td data-label="SKU"><input class="input mono" data-campo="sku" value="${App.escapeHtml(v.sku)}" aria-label="SKU ${App.escapeHtml(rotulo)}"></td>
        <td data-label="Código de barras"><input class="input mono" data-campo="codigoBarras" inputmode="numeric" maxlength="14" value="${App.escapeHtml(v.codigoBarras)}" aria-label="Código de barras ${App.escapeHtml(rotulo)}"></td>
      </tr>`;
    }).join('');
    atualizarResumoGrade();
  }

  function atualizarResumoGrade() {
    lerGradeDaTela();
    const tams = tamanhosEscolhidos();
    const cs = coresEscolhidas();
    const qtd = (t, c) => (variacoes.find((v) => v.tamanho === t && v.cor === c) || {}).estoque || 0;
    cs.forEach((c, ci) => { const el = document.querySelector(`[data-soma-linha="${ci}"]`); if (el) el.textContent = tams.reduce((s, t) => s + qtd(t, c), 0); });
    tams.forEach((t, ti) => { const el = document.querySelector(`[data-soma-col="${ti}"]`); if (el) el.textContent = cs.reduce((s, c) => s + qtd(t, c), 0); });
    const pecas = variacoes.reduce((s, v) => s + v.estoque, 0);
    const geral = document.querySelector('[data-soma-geral]'); if (geral) geral.textContent = pecas;

    const el = document.getElementById('resumo-grade');
    el.textContent = variacoes.length ? `${pecas} peça${pecas === 1 ? '' : 's'}` : '';
    el.classList.toggle('zerado', !!variacoes.length && !pecas);
    document.getElementById('pf-barra-resumo').innerHTML = variacoes.length
      ? `<strong>${variacoes.length}</strong> variaç${variacoes.length === 1 ? 'ão' : 'ões'} · <strong>${pecas}</strong> peça${pecas === 1 ? '' : 's'}`
      : '';
    desenharPrevia();
  }

  // Aplica a mesma quantidade em todas as casas
  document.getElementById('btn-aplicar-estoque').addEventListener('click', () => {
    const valor = parseInt(document.getElementById('estoque-todos').value, 10);
    if (Number.isNaN(valor) || valor < 0) return App.toast('Informe uma quantidade válida.', 'erro');
    document.querySelectorAll('#matriz-estoque [data-mat]').forEach((i) => { i.value = valor; });
    sujo = true;
    atualizarResumoGrade();
  });
  document.getElementById('estoque-todos').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-aplicar-estoque').click(); } });

  // Regera SKUs (com o nome atual) e códigos de barras
  document.getElementById('btn-regerar').addEventListener('click', () => {
    lerGradeDaTela();
    variacoes.forEach((v) => { v.sku = `${prefixoSku()}-${v.tamanho}-${siglaCor(v.cor)}`; v.codigoBarras = gerarCodigoBarras(); });
    desenharGrade();
    App.toast('SKUs e códigos de barras gerados de novo.');
  });

  // Nova cor personalizada
  async function adicionarCor() {
    const nome = document.getElementById('nova-cor').value.trim();
    if (!nome) return App.toast('Digite o nome da cor.', 'erro');
    const nomeFormatado = nome.charAt(0).toUpperCase() + nome.slice(1);
    await Data.adicionarCor({ nome: nomeFormatado, hex: document.getElementById('nova-cor-hex').value.toUpperCase() });
    cores = await Data.listarCores();
    selecionados.cores.add(cores.find((c) => c.nome.toLowerCase() === nome.toLowerCase())?.nome || nomeFormatado);
    document.getElementById('nova-cor').value = '';
    sujo = true;
    desenharChips();
    gerarGrade();
    App.toast(`Cor "${nomeFormatado}" adicionada.`);
  }
  document.getElementById('btn-add-cor').addEventListener('click', adicionarCor);
  document.getElementById('nova-cor').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarCor(); } });

  /* ==================================================================
     PRÉVIA — como a peça aparece no catálogo
     ================================================================== */
  function desenharPrevia() {
    const el = document.getElementById('pf-previa');
    if (!el) return;
    const preco = App.lerNumero(form.preco.value);
    const tams = tamanhosEscolhidos();
    const cs = coresEscolhidas();
    const pecas = variacoes.reduce((s, v) => s + (v.estoque || 0), 0);
    el.innerHTML = `
      <div class="pf-previa-foto">
        ${foto ? `<img src="${App.escapeHtml(foto)}" alt="">` : `<span>${App.escapeHtml(form.nome.value.trim() || 'Sua peça')}</span>`}
        ${variacoes.length && !pecas ? '<em>Esgotado</em>' : ''}
      </div>
      <div class="pf-previa-info">
        <small>${App.escapeHtml(form.marca.value.trim() || 'Marca')}</small>
        <strong>${App.escapeHtml(form.nome.value.trim() || 'Nome da peça')}</strong>
        <b>${preco ? App.formatarMoeda(preco) : 'R$ —'}</b>
        ${cs.length ? `<span class="pf-previa-cores">${cs.slice(0, 8).map(bolinha).join('')}</span>` : ''}
        ${tams.length ? `<span class="pf-previa-tams">${tams.map((t) => App.escapeHtml(t)).join(' · ')}</span>` : ''}
      </div>`;
  }
  ['nome', 'marca'].forEach((n) => form[n].addEventListener('input', desenharPrevia));

  /* ==================================================================
     EDIÇÃO: carrega produto existente
     ================================================================== */
  if (idEdicao || idCopia) {
    try {
      const p = await Data.obterProduto(idEdicao || idCopia);
      if (idEdicao) produtoOriginal = p;
      const titulo = idEdicao ? 'Editar produto' : 'Novo produto (cópia)';
      document.getElementById('titulo-form').textContent = titulo;
      document.body.dataset.tituloAba = titulo;
      App.aplicarMarcaLoja(await Data.obterLoja());
      if (idEdicao) form.produtoId.value = p.id;
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
      fotosCores = { ...(p.fotosCores || {}) };
      fotosExtras = [...(p.fotosExtras || [])];
      // Cópia: mesmos tamanhos e cores, mas códigos novos e estoque zerado
      variacoes = idEdicao ? p.variacoes.map((v) => ({ ...v })) : [];
      p.variacoes.forEach((v) => { selecionados.tamanhos.add(v.tamanho); selecionados.cores.add(v.cor); if (!tamanhos.includes(v.tamanho)) tamanhos.push(v.tamanho); });
      if (idEdicao) document.getElementById('btn-salvar-outro').hidden = true;
      else { App.toast('Cópia pronta: troque o nome, a cor ou o que precisar e informe as quantidades.'); setTimeout(() => { form.nome.focus(); form.nome.select(); }, 50); }
      if (p.colecao || p.fornecedorId || p.ncm) document.getElementById('pf-mais').open = true;
    } catch (e) {
      App.toast('Produto não encontrado.', 'erro');
    }
  }

  desenharChips();
  if (variacoes.length) desenharGrade(); else gerarGrade();
  desenharFotosCores();
  desenharFotosExtras();
  atualizarMargem();
  atualizarNcm();

  // Avisa antes de sair com alterações não salvas
  form.addEventListener('input', () => { sujo = true; });
  form.addEventListener('change', () => { sujo = true; });
  window.addEventListener('beforeunload', (e) => { if (sujo) { e.preventDefault(); e.returnValue = ''; } });
  document.getElementById('btn-salvar-outro').addEventListener('click', () => { salvarOutro = true; form.requestSubmit(); });

  /* ==================================================================
     SALVAR
     ================================================================== */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const outro = salvarOutro; salvarOutro = false;
    if (!App.validarFormulario(form)) return;
    lerGradeDaTela();

    if (!variacoes.length) return App.toast('Selecione tamanhos e cores para gerar a grade.', 'erro');
    const skus = variacoes.map((v) => v.sku);
    if (skus.some((s) => !s)) return App.toast('Todas as variações precisam de SKU.', 'erro');
    if (new Set(skus).size !== skus.length) return App.toast('Há SKUs repetidos na grade.', 'erro');
    const codigos = variacoes.map((v) => v.codigoBarras).filter(Boolean);
    if (new Set(codigos).size !== codigos.length) return App.toast('Há códigos de barras repetidos na grade.', 'erro');

    if (!idEdicao) {
      const pref = prefixoSku();
      for (const v of variacoes) {
        let k = 2;
        while (await Data.buscarPorCodigo(v.sku) && k < 100) { v.sku = `${pref}${k}-${v.tamanho}-${siglaCor(v.cor)}`; k++; }
      }
    }
    const dados = App.lerFormulario(form);
    if (envioFoto) {
      App.toast('Terminando de enviar a foto…');
      try { await envioFoto; } catch (er) { return; }
    }
    if (enviosExtras.size) {
      App.toast('Terminando de enviar as fotos…');
      try { await Promise.all([...enviosExtras]); } catch (er) { return; }
    }
    if (enviosCores.size) {
      App.toast('Terminando de enviar as fotos das cores…');
      try { await Promise.all([...enviosCores.values()]); } catch (er) { return; }
    }

    // NCM: se informado, precisa ter 8 dígitos; se vazio, avisa quando a categoria também não tem
    if (dados.ncm && !ncmValido(dados.ncm)) {
      document.getElementById('pf-mais').open = true;
      form.ncm.focus();
      return App.toast('O NCM deve ter 8 dígitos (ex.: 6109.10.00).', 'erro');
    }
    if (!dados.ncm && !ncmDaCategoria() && App.emiteNota) {
      const ok = await App.confirmar({
        titulo: 'Produto sem NCM',
        mensagem: `Nem o produto nem a categoria "${dados.categoria}" têm NCM. Você poderá vender, mas não emitir NFC-e deste produto até informar o NCM.`,
        textoConfirmar: 'Salvar sem NCM'
      });
      if (!ok) { document.getElementById('pf-mais').open = true; form.ncm.focus(); return; }
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
      fotosExtras: fotosExtras.filter(Boolean).slice(0, 5),
      fotosCores: Object.fromEntries(Object.entries(fotosCores).filter(([cor, url]) => url && variacoes.some((v) => v.cor === cor))),
      recolorFoto: document.getElementById('recolor-foto').checked,
      variacoes
    };
    // Produto novo sem nenhuma peça: quase sempre é porque a quantidade não foi preenchida na grade
    if (!idEdicao && variacoes.length && variacoes.every((v) => !v.estoque)) {
      const ok = await App.confirmar({
        titulo: 'Nenhuma peça no estoque',
        mensagem: 'As quantidades estão zeradas, então o produto vai aparecer como "Esgotado". Preencha a etapa 4 — Quantas peças você tem.',
        textoConfirmar: 'Salvar esgotado mesmo',
        textoCancelar: 'Voltar e preencher'
      });
      if (!ok) { const campo = document.querySelector('#matriz-estoque [data-mat]') || document.getElementById('estoque-todos'); campo.scrollIntoView({ block: 'center' }); campo.focus(); return; }
    }
    if (produto.preco < produto.custo) {
      const ok = await App.confirmar({ titulo: 'Preço abaixo do custo', mensagem: 'O preço de venda está menor que o custo. Deseja salvar mesmo assim?', textoConfirmar: 'Salvar assim mesmo' });
      if (!ok) return;
    }

    const botoes = form.querySelectorAll('.pf-barra button');
    botoes.forEach((b) => { b.disabled = true; });
    try {
      await Data.salvarProduto(produto);
      sujo = false;
      App.toast(idEdicao ? 'Produto atualizado com sucesso!' : outro ? 'Produto cadastrado! Pode cadastrar o próximo.' : 'Produto cadastrado com sucesso!');
      setTimeout(() => { location.href = outro ? 'produto-form.html' : 'produtos.html'; }, 700);
    } catch (erro) {
      App.toast(erro.message, 'erro');
      botoes.forEach((b) => { b.disabled = false; });
    }
  });
});
