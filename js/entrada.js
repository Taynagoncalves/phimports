/* ==========================================================================
   entrada.js — Entrada de mercadoria em lote (nota do fornecedor)
   - Grade tamanho × cor para digitar as quantidades de cada produto
   - Custo unitário (opção de atualizar o custo do produto)
   - Importação do XML da NF-e do fornecedor (encontra as peças pelo
     código de barras/EAN ou pelo SKU)
   - Depois de lançar: atalho para imprimir as etiquetas das peças recebidas
   ========================================================================== */
App.aoIniciar(async () => {
  const CHAVE_FILA = 'gestaoloja:fila-etiquetas';
  const $ = (id) => document.getElementById(id);
  const form = $('form-entrada');

  const [produtos, fornecedores, tamanhosOrdem] = await Promise.all([Data.listarProdutos(), Data.listarFornecedores(), Data.listarTamanhos()]);
  const produtoPorId = Object.fromEntries(produtos.map((p) => [p.id, p]));
  // itens: [{produtoId, custo, atualizarCusto, qtd: {sku: n}}]
  let itens = [];

  App.preencherSelect(form.fornecedorId, fornecedores.map((f) => ({ valor: f.id, texto: `${f.nome} — ${f.documento}` })), { vazio: 'Selecione…' });
  App.preencherSelect($('sel-produto'), produtos.map((p) => ({ valor: p.id, texto: `${p.nome} — ${p.marca}` })), { vazio: 'Escolha um produto…' });
  form.dataEmissao.value = App.dataInput();
  // 1º vencimento sugerido: 30 dias
  const venc30 = () => { const d = new Date(); d.setDate(d.getDate() + 30); return App.dataInput(d); };
  $('conta-venc').value = venc30();
  $('gerar-conta').addEventListener('change', () => { $('campos-conta').classList.toggle('oculto', !$('gerar-conta').checked); });

  /* ---------- Itens ---------- */
  function adicionarProduto(produtoId) {
    if (itens.some((i) => i.produtoId === produtoId)) return itens.find((i) => i.produtoId === produtoId);
    const p = produtoPorId[produtoId];
    const item = { produtoId, custo: p.custo, atualizarCusto: false, qtd: {} };
    itens.push(item);
    return item;
  }

  function lerTela() {
    form.querySelectorAll('[data-qtd-sku]').forEach((inp) => {
      const item = itens.find((i) => i.produtoId === inp.dataset.produto);
      if (item) item.qtd[inp.dataset.qtdSku] = Math.max(0, parseInt(inp.value, 10) || 0);
    });
    form.querySelectorAll('[data-custo]').forEach((inp) => {
      const item = itens.find((i) => i.produtoId === inp.dataset.custo);
      if (item) item.custo = App.lerNumero(inp.value);
    });
    form.querySelectorAll('[data-atualizar]').forEach((chk) => {
      const item = itens.find((i) => i.produtoId === chk.dataset.atualizar);
      if (item) item.atualizarCusto = chk.checked;
    });
  }

  const ordemTam = (t) => { const i = tamanhosOrdem.indexOf(t); return i < 0 ? 999 : i; };

  function desenhar() {
    const el = $('itens');
    if (!itens.length) {
      el.innerHTML = App.estadoVazio({ icone: 'package-plus', titulo: 'Nenhum produto ainda', texto: 'Adicione os produtos da nota ou importe o XML da NF-e do fornecedor.' });
      atualizarResumo();
      App.icones();
      return;
    }
    el.innerHTML = itens.map((item) => {
      const p = produtoPorId[item.produtoId];
      const tamanhos = [...new Set(p.variacoes.map((v) => v.tamanho))].sort((a, b) => ordemTam(a) - ordemTam(b));
      const cores = [...new Set(p.variacoes.map((v) => v.cor))];
      const varDe = (t, c) => p.variacoes.find((v) => v.tamanho === t && v.cor === c);
      return `
      <div style="border-bottom:1px solid var(--cor-borda);padding:16px 20px">
        <div class="flex items-center justify-between gap-3" style="flex-wrap:wrap">
          <div class="produto-cel">${App.thumb(p)}<div><div class="titulo">${App.escapeHtml(p.nome)}</div><div class="sub">${App.escapeHtml(p.marca)} · custo atual ${App.formatarMoeda(p.custo)}</div></div></div>
          <button type="button" class="btn-icone perigo" data-remover="${p.id}" aria-label="Tirar ${App.escapeHtml(p.nome)} da nota"><i data-lucide="trash-2"></i></button>
        </div>
        <div class="tabela-wrap mt-2">
          <table class="grade-entrada" aria-label="Quantidades de ${App.escapeHtml(p.nome)}">
            <thead><tr><th class="cor">Cor \\ Tamanho</th>${tamanhos.map((t) => `<th scope="col">${App.escapeHtml(t)}</th>`).join('')}<th>Total</th></tr></thead>
            <tbody>
              ${cores.map((c) => `
                <tr>
                  <th class="cor" scope="row"><span class="flex items-center gap-2">${App.bolinhaCor(c)}${App.escapeHtml(c)}</span></th>
                  ${tamanhos.map((t) => {
                    const v = varDe(t, c);
                    return v
                      ? `<td><input class="input" type="number" min="0" inputmode="numeric" data-produto="${p.id}" data-qtd-sku="${App.escapeHtml(v.sku)}" value="${item.qtd[v.sku] || ''}" placeholder="0" aria-label="${App.escapeHtml(c)} tamanho ${App.escapeHtml(t)} (estoque atual ${v.estoque})" title="Estoque atual: ${v.estoque}"></td>`
                      : '<td><input class="input" disabled aria-label="Variação inexistente" title="Este tamanho/cor não existe no produto"></td>';
                  }).join('')}
                  <td class="total" data-total-cor="${p.id}|${App.escapeHtml(c)}">0</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="flex gap-3 items-end mt-2" style="flex-wrap:wrap">
          <div class="campo" style="width:160px">
            <label for="custo-${p.id}">Custo unitário</label>
            <div class="input-grupo"><span class="prefixo">R$</span><input class="input" id="custo-${p.id}" data-custo="${p.id}" inputmode="decimal" data-mascara="moeda" value="${App.formatarValorInput(item.custo)}"></div>
          </div>
          <label class="checkbox" style="min-height:44px"><input type="checkbox" data-atualizar="${p.id}" ${item.atualizarCusto ? 'checked' : ''}> Atualizar o custo do produto</label>
          <span class="texto-sm" style="margin-left:auto">Subtotal: <strong data-subtotal="${p.id}">R$ 0,00</strong></span>
        </div>
      </div>`;
    }).join('');

    App.aplicarMascaras(el);
    el.querySelectorAll('input').forEach((i) => i.addEventListener('input', atualizarResumo));
    el.querySelectorAll('[data-atualizar]').forEach((i) => i.addEventListener('change', atualizarResumo));
    el.querySelectorAll('[data-remover]').forEach((b) => b.addEventListener('click', () => {
      lerTela();
      itens = itens.filter((i) => i.produtoId !== b.dataset.remover);
      desenhar();
    }));
    atualizarResumo();
    App.icones();
  }

  function atualizarResumo() {
    lerTela();
    let pecas = 0, valor = 0;
    itens.forEach((item) => {
      const p = produtoPorId[item.produtoId];
      const qtdProduto = Object.values(item.qtd).reduce((s, n) => s + n, 0);
      pecas += qtdProduto;
      valor += qtdProduto * (item.custo || 0);
      const sub = document.querySelector(`[data-subtotal="${p.id}"]`);
      if (sub) sub.textContent = `${qtdProduto} peça(s) · ${App.formatarMoeda(qtdProduto * (item.custo || 0))}`;
      // Totais por cor
      [...new Set(p.variacoes.map((v) => v.cor))].forEach((c) => {
        const cel = document.querySelector(`[data-total-cor="${p.id}|${CSS.escape(c)}"]`) || [...document.querySelectorAll('[data-total-cor]')].find((x) => x.dataset.totalCor === `${p.id}|${c}`);
        if (cel) cel.textContent = p.variacoes.filter((v) => v.cor === c).reduce((s, v) => s + (item.qtd[v.sku] || 0), 0);
      });
    });
    $('r-produtos').textContent = itens.length;
    $('r-pecas').textContent = pecas;
    $('r-valor').textContent = App.formatarMoeda(valor);
  }

  $('btn-add').addEventListener('click', () => {
    const id = $('sel-produto').value;
    if (!id) return App.toast('Escolha um produto.', 'erro');
    lerTela();
    adicionarProduto(id);
    $('sel-produto').value = '';
    desenhar();
    setTimeout(() => document.querySelector(`[data-produto="${id}"]`)?.focus(), 30);
  });

  /* ==================================================================
     IMPORTAR XML DA NF-e
     ================================================================== */
  $('arquivo-xml').addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;
    try {
      importarXml(await arquivo.text());
    } catch (erro) {
      console.error(erro);
      App.toast('Não foi possível ler o XML. Confira se é o XML da NF-e (modelo 55).', 'erro', 6000);
    }
  });

  function importarXml(texto) {
    const doc = new DOMParser().parseFromString(texto, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML inválido');
    const tag = (el, nome) => (el.getElementsByTagName(nome)[0] || {}).textContent || '';
    const ide = doc.getElementsByTagName('ide')[0];
    const emit = doc.getElementsByTagName('emit')[0];
    const dets = [...doc.getElementsByTagName('det')];
    if (!ide || !emit || !dets.length) throw new Error('Não é uma NF-e');

    lerTela();
    // Cabeçalho
    form.numeroNota.value = tag(ide, 'nNF');
    const emissao = tag(ide, 'dhEmi') || tag(ide, 'dEmi');
    if (emissao) form.dataEmissao.value = emissao.slice(0, 10);
    const cnpj = tag(emit, 'CNPJ').replace(/\D/g, '');
    const fornecedor = fornecedores.find((f) => (f.documento || '').replace(/\D/g, '') === cnpj);
    if (fornecedor) form.fornecedorId.value = fornecedor.id;

    // Itens: acha a variação pelo EAN (cEAN) ou pelo SKU (cProd)
    const naoEncontrados = [];
    let pecasImportadas = 0;
    dets.forEach((det) => {
      const ean = tag(det, 'cEAN').trim();
      const cProd = tag(det, 'cProd').trim().toUpperCase();
      const qtd = Math.round(Number(tag(det, 'qCom')) || 0);
      const custo = Number(tag(det, 'vUnCom')) || 0;
      let achado = null;
      for (const p of produtos) {
        const v = p.variacoes.find((x) => (ean && ean !== 'SEM GTIN' && x.codigoBarras === ean) || x.sku.toUpperCase() === cProd);
        if (v) { achado = { p, v }; break; }
      }
      if (!achado) { naoEncontrados.push({ nome: tag(det, 'xProd'), ean, cProd, qtd }); return; }
      const item = adicionarProduto(achado.p.id);
      item.qtd[achado.v.sku] = (item.qtd[achado.v.sku] || 0) + qtd;
      if (custo) item.custo = custo;
      pecasImportadas += qtd;
    });
    desenhar();

    // Avisos do que precisa de atenção
    const avisos = [];
    if (!fornecedor) avisos.push(`Fornecedor <strong>${App.escapeHtml(tag(emit, 'xNome'))}</strong> (CNPJ ${App.escapeHtml(tag(emit, 'CNPJ'))}) não está cadastrado. <a href="fornecedores.html">Cadastre</a> ou escolha na lista.`);
    if (naoEncontrados.length) {
      avisos.push(`${naoEncontrados.length} item(ns) da nota não foram encontrados no catálogo (cadastre o produto com o mesmo código de barras ou SKU, ou lance manualmente):
        <ul style="margin:6px 0 0 18px">${naoEncontrados.map((n) => `<li>${App.escapeHtml(n.nome)} — ${n.qtd} un. · EAN ${App.escapeHtml(n.ean || '—')} · cód. ${App.escapeHtml(n.cProd)}</li>`).join('')}</ul>`);
    }
    $('aviso-xml').innerHTML = `
      <div class="alerta info"><i data-lucide="file-check"></i><span>XML da NF-e nº <strong>${App.escapeHtml(form.numeroNota.value)}</strong> lido: ${pecasImportadas} peça(s) em ${dets.length - naoEncontrados.length} item(ns) preenchidas na grade. Confira antes de lançar.</span></div>
      ${avisos.map((a) => `<div class="alerta mt-2"><i data-lucide="triangle-alert"></i><span>${a}</span></div>`).join('')}`;
    App.icones();
    App.toast('XML importado. Confira as quantidades.');
  }

  /* ==================================================================
     LANÇAR
     ================================================================== */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!App.validarFormulario(form)) return;
    lerTela();
    const dados = App.lerFormulario(form);
    const payload = {
      fornecedorId: dados.fornecedorId,
      numeroNota: dados.numeroNota,
      dataEmissao: dados.dataEmissao,
      observacao: dados.observacao,
      // Boleto(s) do fornecedor direto no contas a pagar
      contaPagar: $('gerar-conta').checked ? { parcelas: Number($('conta-parcelas').value), vencimento: $('conta-venc').value } : null,
      itens: itens.map((i) => ({
        produtoId: i.produtoId,
        custoUnitario: i.custo,
        atualizarCusto: i.atualizarCusto,
        variacoes: Object.entries(i.qtd).filter(([, n]) => n > 0).map(([sku, qtd]) => ({ sku, qtd }))
      }))
    };
    const pecas = payload.itens.reduce((s, i) => s + i.variacoes.reduce((t, v) => t + v.qtd, 0), 0);
    if (!pecas) return App.toast('Informe a quantidade de pelo menos uma peça.', 'erro');
    if (payload.contaPagar && !payload.contaPagar.vencimento) return App.toast('Informe o 1º vencimento do boleto.', 'erro');
    if (!(await App.confirmar({ titulo: 'Lançar entrada?', mensagem: `${pecas} peça(s) entram no estoque com o motivo "NF ${dados.numeroNota}".`, textoConfirmar: 'Lançar entrada' }))) return;

    const botao = form.querySelector('button[type=submit]');
    botao.disabled = true;
    try {
      const entrada = await Data.registrarEntradaLote(payload);
      // Fila de etiquetas com exatamente as peças recebidas
      const fila = entrada.itens.flatMap((i) => i.variacoes.map((v) => ({ produtoId: i.produtoId, sku: v.sku, qtd: v.qtd })));
      itens = [];
      form.reset();
      form.dataEmissao.value = App.dataInput();
      $('conta-venc').value = venc30();
      $('campos-conta').classList.remove('oculto');
      $('aviso-xml').innerHTML = '';
      desenhar();
      carregarHistorico();
      App.abrirModal({
        titulo: 'Entrada lançada',
        tamanho: 'sm',
        corpo: `<div class="texto-centro">
            <div class="sucesso-icone"><i data-lucide="package-check"></i></div>
            <h3>NF ${App.escapeHtml(entrada.numeroNota)} — ${App.escapeHtml(entrada.fornecedorNome)}</h3>
            <p class="texto-sm mt-2">${entrada.totalPecas} peça(s) somadas ao estoque · ${App.formatarMoeda(entrada.totalValor)}</p>
            ${entrada.contasGeradas ? `<p class="texto-sm">${entrada.contasGeradas} boleto(s) lançado(s) no <a href="financeiro.html#pagar">contas a pagar</a>.</p>` : ''}
            <p class="texto-sm mt-4">Quer imprimir as etiquetas das peças que chegaram?</p>
          </div>`,
        acoes: [
          { texto: 'Agora não' },
          { texto: `Imprimir ${entrada.totalPecas} etiqueta(s)`, classe: 'btn-primario', icone: 'tag', aoClicar: () => {
            try { sessionStorage.setItem(CHAVE_FILA, JSON.stringify(fila)); } catch (err) { /* ignora */ }
            location.href = 'etiquetas.html';
          } }
        ]
      });
    } catch (erro) {
      App.toast(erro.message, 'erro', 6000);
    } finally {
      botao.disabled = false;
    }
  });

  /* ---------- Histórico ---------- */
  async function carregarHistorico() {
    const lista = await Data.listarEntradas();
    $('historico').innerHTML = lista.length
      ? lista.map((e) => `
        <tr>
          <td class="cel-principal"><span class="negrito">NF ${App.escapeHtml(e.numeroNota)}</span>${e.dataEmissao ? ` <span class="texto-xs texto-3">· emitida ${App.formatarData(e.dataEmissao)}</span>` : ''}</td>
          <td data-label="Lançada em" class="nowrap">${App.formatarDataHora(e.data)}</td>
          <td data-label="Fornecedor">${App.escapeHtml(e.fornecedorNome)}</td>
          <td data-label="Peças" class="num">${e.totalPecas}</td>
          <td data-label="Valor (custo)" class="num negrito">${App.formatarMoeda(e.totalValor)}</td>
          <td data-label="Usuário">${App.escapeHtml(e.usuarioNome)}</td>
        </tr>`).join('')
      : `<tr><td colspan="6">${App.estadoVazio({ icone: 'file-text', titulo: 'Nenhuma nota lançada ainda' })}</td></tr>`;
    App.icones();
  }

  desenhar();
  await carregarHistorico();
});
