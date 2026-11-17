/* ==========================================================================
   inventario.js — Inventário completo (só o dono)
   1) Inicia (loja toda ou uma categoria)
   2) Lê os códigos de barras: cada leitura soma 1 peça (ou digita o total)
   3) Confere sistema × contado (sobras e faltas)
   4) Finaliza: o estoque passa a ser o contado (com registro no histórico)
   A contagem fica salva: dá para pausar e continuar depois.
   ========================================================================== */
App.aoIniciar(async () => {
  const $ = (id) => document.getElementById(id);
  const categorias = await Data.listarCategorias();
  let inv = null;
  let filtro = 'todos'; // todos | divergentes | nao-contados | contados
  let busca = '';

  async function carregar() {
    inv = await Data.obterInventarioAberto();
    if (inv) desenharAberto(); else desenharInicio();
    carregarHistorico();
    App.icones();
  }

  /* ---------- Sem inventário: iniciar ---------- */
  function desenharInicio() {
    $('acoes').innerHTML = '';
    $('subtitulo').textContent = 'Conte as peças com o leitor de código de barras e ajuste o estoque de uma vez.';
    $('area').innerHTML = `
      <section class="card" style="max-width:640px">
        <div class="card-corpo">
          <h2>Novo inventário</h2>
          <p class="texto-sm mt-2">Dica: faça com a loja fechada (ou pause as vendas), para o estoque não mudar durante a contagem.</p>
          <div class="flex gap-2 items-end mt-4" style="flex-wrap:wrap">
            <div class="campo" style="flex:1;min-width:220px">
              <label for="escopo">O que vai contar</label>
              <select class="select" id="escopo">
                <option value="">Loja toda</option>
                ${categorias.map((c) => `<option value="${App.escapeHtml(c)}">Só ${App.escapeHtml(c)}</option>`).join('')}
              </select>
            </div>
            <button type="button" class="btn btn-primario btn-grande" id="btn-iniciar"><i data-lucide="scan-barcode"></i>Iniciar contagem</button>
          </div>
        </div>
      </section>`;
    $('btn-iniciar').addEventListener('click', async () => {
      try {
        await Data.iniciarInventario({ categoria: $('escopo').value || null });
        App.toast('Inventário iniciado. Leia os códigos de barras.');
        carregar();
      } catch (e) { App.toast(e.message, 'erro'); }
    });
  }

  /* ---------- Inventário em andamento ---------- */
  function desenharAberto() {
    $('subtitulo').textContent = `Nº ${inv.numero} · ${inv.escopo.categoria ? 'Categoria ' + inv.escopo.categoria : 'Loja toda'} · iniciado em ${App.formatarDataHora(inv.iniciadoEm)} por ${inv.iniciadoPorNome}`;
    $('acoes').innerHTML = `
      <button type="button" class="btn btn-secundario" id="btn-cancelar"><i data-lucide="x"></i>Cancelar inventário</button>
      <button type="button" class="btn btn-primario" id="btn-finalizar"><i data-lucide="clipboard-check"></i>Finalizar e ajustar estoque</button>`;
    $('btn-cancelar').addEventListener('click', cancelar);
    $('btn-finalizar').addEventListener('click', abrirFinalizacao);

    $('area').innerHTML = `
      <section class="grid-stats" aria-label="Andamento">
        <article class="card stat"><div class="stat-topo"><span class="stat-rotulo">Variações contadas</span><span class="stat-icone"><i data-lucide="list-checks"></i></span></div>
          <div class="stat-valor" id="k-contadas"></div><div class="stat-detalhe" id="k-progresso"></div></article>
        <article class="card stat"><div class="stat-topo"><span class="stat-rotulo">Peças contadas</span><span class="stat-icone"><i data-lucide="package"></i></span></div>
          <div class="stat-valor" id="k-pecas"></div><div class="stat-detalhe">Lidas até agora</div></article>
        <article class="card stat"><div class="stat-topo"><span class="stat-rotulo">Divergências</span><span class="stat-icone"><i data-lucide="triangle-alert"></i></span></div>
          <div class="stat-valor" id="k-div"></div><div class="stat-detalhe">Contado diferente do sistema</div></article>
        <article class="card stat"><div class="stat-topo"><span class="stat-rotulo">Não contadas</span><span class="stat-icone"><i data-lucide="circle-help"></i></span></div>
          <div class="stat-valor" id="k-nao"></div><div class="stat-detalhe">Ainda sem leitura</div></article>
      </section>

      <section class="card secao leitura">
        <div class="card-corpo">
          <form id="form-leitura" class="pdv-busca" role="search">
            <i data-lucide="scan-barcode"></i>
            <label for="codigo" class="sr-only">Código de barras ou SKU</label>
            <input class="input" id="codigo" autocomplete="off" placeholder="Leia o código de barras (cada leitura = 1 peça) e tecle Enter" autofocus>
          </form>
          <div class="ultima-leitura mt-4" id="ultima" style="padding:12px;border-radius:var(--raio-sm)" aria-live="polite">
            <span class="texto-sm texto-3">A última peça lida aparece aqui.</span>
          </div>
        </div>
      </section>

      <section class="card secao">
        <div class="card-cabecalho" style="flex-wrap:wrap">
          <div class="chips" role="radiogroup" aria-label="Mostrar" id="filtros">
            <button type="button" class="chip" role="radio" data-f="todos">Todas</button>
            <button type="button" class="chip" role="radio" data-f="divergentes">Divergências</button>
            <button type="button" class="chip" role="radio" data-f="nao-contados">Não contadas</button>
            <button type="button" class="chip" role="radio" data-f="contados">Contadas</button>
          </div>
          <input class="input" type="search" id="busca" placeholder="Filtrar produto ou SKU" style="max-width:240px" aria-label="Filtrar produto ou SKU">
        </div>
        <div class="tabela-wrap">
          <table class="tabela tabela-responsiva">
            <thead><tr><th>Produto</th><th>Variação</th><th>SKU</th><th class="num">Sistema</th><th class="num">Contado</th><th class="num">Diferença</th></tr></thead>
            <tbody id="itens"></tbody>
          </table>
        </div>
      </section>`;

    $('form-leitura').addEventListener('submit', async (e) => {
      e.preventDefault();
      const codigo = $('codigo').value.trim();
      $('codigo').value = '';
      if (!codigo) return;
      await contar({ codigo, quantidade: 1, modo: 'somar' });
    });
    $('filtros').querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.f; desenharItens(); }));
    $('busca').addEventListener('input', App.debounce((e) => { busca = e.target.value.toLowerCase(); desenharItens(); }, 200));
    desenharTotais();
    desenharItens();
  }

  async function contar(dados) {
    const ultima = $('ultima');
    try {
      const r = await Data.registrarContagem(dados);
      inv = r.inventario;
      const i = r.item;
      ultima.className = 'ultima-leitura mt-4 piscar';
      ultima.innerHTML = `<div class="flex items-center justify-between gap-3" style="flex-wrap:wrap">
        <div><strong>${App.escapeHtml(i.produtoNome)}</strong> · ${App.escapeHtml(i.tamanho)} / ${App.escapeHtml(i.cor)} <span class="mono texto-xs texto-3">${App.escapeHtml(i.sku)}</span></div>
        <div class="texto-sm">Contado <strong style="font-size:var(--fs-lg)">${i.contado}</strong> · sistema ${i.sistema} ${badgeDif(i.diferenca)}</div></div>`;
      setTimeout(() => ultima.classList.remove('piscar'), 500);
      desenharTotais();
      desenharItens();
    } catch (e) {
      ultima.className = 'ultima-leitura mt-4 erro';
      ultima.innerHTML = `<span class="texto-sm" style="color:var(--cor-perigo)"><strong>Não contado:</strong> ${App.escapeHtml(e.message)}</span>`;
    }
    $('codigo') && $('codigo').focus();
  }

  function badgeDif(d) {
    if (d === null) return '<span class="texto-3">—</span>';
    if (d === 0) return '<span class="badge badge-sucesso">Confere</span>';
    return `<span class="badge ${d > 0 ? 'badge-alerta' : 'badge-perigo'}">${d > 0 ? '+' : ''}${d}</span>`;
  }

  function desenharTotais() {
    const t = inv.totais;
    $('k-contadas').textContent = `${t.contadas} / ${t.variacoes}`;
    $('k-progresso').textContent = `${Math.round((t.contadas / Math.max(1, t.variacoes)) * 100)}% concluído`;
    $('k-pecas').textContent = App.formatarNumero(t.pecasContadas);
    $('k-div').textContent = t.divergencias;
    $('k-nao').textContent = t.variacoes - t.contadas;
  }

  function desenharItens() {
    $('filtros').querySelectorAll('[data-f]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.f === filtro)));
    const lista = inv.itens
      .filter((i) => filtro === 'todos' || (filtro === 'divergentes' && i.diferenca !== null && i.diferenca !== 0) || (filtro === 'nao-contados' && i.contado === null) || (filtro === 'contados' && i.contado !== null))
      .filter((i) => !busca || `${i.produtoNome} ${i.sku}`.toLowerCase().includes(busca));
    $('itens').innerHTML = lista.length ? lista.map((i) => `
      <tr>
        <td class="cel-principal"><span class="negrito">${App.escapeHtml(i.produtoNome)}</span></td>
        <td data-label="Variação"><span class="flex items-center gap-2" style="justify-content:inherit">${App.bolinhaCor(i.cor)}${App.escapeHtml(i.tamanho)} · ${App.escapeHtml(i.cor)}</span></td>
        <td data-label="SKU" class="mono">${App.escapeHtml(i.sku)}</td>
        <td data-label="Sistema" class="num">${i.sistema}</td>
        <td data-label="Contado" class="num">
          <label class="sr-only" for="c-${App.escapeHtml(i.sku)}">Contado de ${App.escapeHtml(i.produtoNome)} ${App.escapeHtml(i.tamanho)} ${App.escapeHtml(i.cor)}</label>
          <input class="input texto-direita" type="number" min="0" id="c-${App.escapeHtml(i.sku)}" data-sku="${App.escapeHtml(i.sku)}" value="${i.contado ?? ''}" placeholder="—" style="width:76px;margin-left:auto">
        </td>
        <td data-label="Diferença" class="num">${badgeDif(i.diferenca)}</td>
      </tr>`).join('')
      : `<tr><td colspan="6">${App.estadoVazio({ icone: 'search-x', titulo: 'Nada neste filtro' })}</td></tr>`;
    // Digitar o total substitui a contagem daquela variação
    $('itens').querySelectorAll('[data-sku]').forEach((inp) => inp.addEventListener('change', () => {
      if (inp.value === '') return;
      contar({ codigo: inp.dataset.sku, quantidade: Number(inp.value), modo: 'definir' });
    }));
    App.icones();
  }

  /* ---------- Finalizar ---------- */
  function abrirFinalizacao() {
    const contados = inv.itens.filter((i) => i.contado !== null);
    const sobras = contados.reduce((s, i) => s + Math.max(0, i.diferenca), 0);
    const faltas = contados.reduce((s, i) => s + Math.max(0, -i.diferenca), 0);
    const naoContadas = inv.itens.filter((i) => i.contado === null);
    const pecasNaoContadas = naoContadas.reduce((s, i) => s + i.sistema, 0);
    const valor = contados.reduce((s, i) => s + i.diferenca * (i.custo || 0), 0);
    const { el, fechar } = App.abrirModal({
      titulo: `Finalizar inventário nº ${inv.numero}`,
      corpo: `
        <dl class="detalhes">
          <div><dt>Variações contadas</dt><dd>${contados.length} de ${inv.itens.length}</dd></div>
          <div><dt>Divergências</dt><dd>${contados.filter((i) => i.diferenca !== 0).length}</dd></div>
          <div><dt>Sobras (peças a mais)</dt><dd style="color:var(--cor-alerta)">+${sobras}</dd></div>
          <div><dt>Faltas (peças a menos)</dt><dd style="color:var(--cor-perigo)">−${faltas}</dd></div>
          <div><dt>Diferença a preço de custo</dt><dd>${App.formatarMoeda(valor)}</dd></div>
        </dl>
        ${naoContadas.length ? `
          <div class="alerta mt-4"><i data-lucide="circle-help"></i>
            <span>${naoContadas.length} variação(ões) não foram contadas (${pecasNaoContadas} peça(s) no sistema).<br>
            <label class="checkbox mt-2"><input type="checkbox" id="zerar"> Zerar o estoque delas (não foram encontradas na loja)</label><br>
            <span class="texto-xs">Se não marcar, o estoque delas fica como está.</span></span>
          </div>` : ''}
        <p class="texto-sm mt-4">O estoque das variações contadas passa a ser o valor contado. Cada ajuste fica no histórico do Estoque como "Inventário nº ${inv.numero}".</p>`,
      acoes: [
        { texto: 'Continuar contando' },
        { texto: 'Finalizar e ajustar', classe: 'btn-primario', icone: 'clipboard-check', aoClicar: async (_, botao) => {
          botao.disabled = true;
          try {
            const r = await Data.finalizarInventario({ zerarNaoContados: !!(el.querySelector('#zerar') || {}).checked });
            fechar();
            App.toast(`Inventário finalizado: ${r.resultado.ajustadas} variação(ões) ajustada(s).`);
            carregar();
          } catch (e) { App.toast(e.message, 'erro'); botao.disabled = false; }
        } }
      ]
    });
  }

  async function cancelar() {
    if (!(await App.confirmar({ titulo: 'Cancelar inventário?', mensagem: 'A contagem feita até agora será descartada. O estoque não muda.', textoConfirmar: 'Cancelar inventário', perigo: true }))) return;
    await Data.cancelarInventario();
    App.toast('Inventário cancelado.');
    carregar();
  }

  /* ---------- Histórico ---------- */
  async function carregarHistorico() {
    const lista = await Data.listarInventarios();
    $('historico').innerHTML = lista.length ? lista.map((i) => `
      <tr>
        <td class="cel-principal"><span class="negrito">Nº ${i.numero}</span></td>
        <td data-label="Escopo">${i.escopo.categoria ? App.escapeHtml(i.escopo.categoria) : 'Loja toda'}${i.zerouNaoContados ? ' <span class="tag">zerou não contados</span>' : ''}</td>
        <td data-label="Período" class="nowrap">${App.formatarData(i.iniciadoEm)} → ${App.formatarData(i.finalizadoEm)}</td>
        <td data-label="Responsável">${App.escapeHtml(i.finalizadoPorNome || i.iniciadoPorNome)}</td>
        <td data-label="Contadas" class="num">${i.totais.contadas}</td>
        <td data-label="Sobras" class="num" style="color:var(--cor-alerta)">+${i.resultado.sobras}</td>
        <td data-label="Faltas" class="num" style="color:var(--cor-perigo)">−${i.resultado.faltas}</td>
        <td data-label="Diferença (custo)" class="num negrito">${App.formatarMoeda(i.resultado.valorDiferenca)}</td>
      </tr>`).join('')
      : `<tr><td colspan="8">${App.estadoVazio({ icone: 'clipboard-check', titulo: 'Nenhum inventário finalizado ainda' })}</td></tr>`;
    App.icones();
  }

  await carregar();
});
