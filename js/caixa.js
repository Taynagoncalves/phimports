/* ==========================================================================
   caixa.js — Controle de caixa
   - Abertura com troco inicial
   - Sangria (retirada) e reforço (entrada de troco)
   - Dinheiro esperado na gaveta, em tempo real
   - Fechamento com conferência por forma de pagamento (e contagem de cédulas)
   - Histórico com diferenças e impressão do fechamento
   ========================================================================== */
App.aoIniciar(async () => {
  const POR_PAGINA = 8;
  const FORMAS = [
    { id: 'dinheiro', nome: 'Dinheiro', icone: 'banknote', ajuda: 'Conte as cédulas e moedas da gaveta.' },
    { id: 'pix', nome: 'Pix', icone: 'qr-code', ajuda: 'Confira no extrato do banco.' },
    { id: 'debito', nome: 'Cartão de débito', icone: 'credit-card', ajuda: 'Confira no relatório da maquininha.' },
    { id: 'credito', nome: 'Cartão de crédito', icone: 'credit-card', ajuda: 'Confira no relatório da maquininha.' }
  ];
  const CEDULAS = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05];
  const moeda = App.formatarMoeda;
  const $ = (id) => document.getElementById(id);
  let pagina = 1;
  let historico = [];

  /* ==================================================================
     CAIXA ATUAL
     ================================================================== */
  async function carregar() {
    const caixa = await Data.obterCaixaAberto();
    if (caixa) desenharAberto(caixa); else desenharFechado();
    historico = (await Data.listarCaixas()).filter((c) => c.status === 'fechado');
    desenharHistorico();
    App.icones();
  }

  /** Sem caixa aberto: formulário de abertura */
  function desenharFechado() {
    $('acoes-caixa').innerHTML = '';
    $('subtitulo').textContent = 'O caixa está fechado. Abra para começar a vender no PDV.';
    $('caixa-atual').innerHTML = `
      <section class="card" style="max-width:560px">
        <div class="card-corpo">
          <div class="flex items-center gap-3 mb-4">
            <span class="stat-icone" style="background:var(--cor-superficie-2)"><i data-lucide="lock"></i></span>
            <div><h2>Abrir caixa</h2><p class="texto-sm">Conte o dinheiro que já está na gaveta (troco) antes da primeira venda.</p></div>
          </div>
          <form id="form-abrir" class="flex gap-2 items-end" style="flex-wrap:wrap" novalidate>
            <div class="campo" style="flex:1;min-width:200px">
              <label for="valor-inicial">Troco inicial na gaveta</label>
              <div class="input-grupo"><span class="prefixo">R$</span><input class="input" id="valor-inicial" inputmode="decimal" data-mascara="moeda" value="200,00" required></div>
            </div>
            <button type="submit" class="btn btn-primario btn-grande"><i data-lucide="lock-open"></i>Abrir caixa</button>
          </form>
        </div>
      </section>`;
    App.aplicarMascaras($('caixa-atual'));
    $('form-abrir').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Data.abrirCaixa({ valorInicial: App.lerNumero($('valor-inicial').value) });
        App.toast('Caixa aberto. Boas vendas!');
        carregar();
      } catch (erro) { App.toast(erro.message, 'erro'); }
    });
  }

  /** Caixa aberto: totais, formas de pagamento e movimentos da gaveta */
  function desenharAberto(cx) {
    $('subtitulo').textContent = `Aberto em ${App.formatarDataHora(cx.abertoEm)} por ${cx.abertoPorNome}.`;
    $('acoes-caixa').innerHTML = `
      <button type="button" class="btn btn-secundario" id="btn-receber"><i data-lucide="hand-coins"></i>Receber crediário</button>
      <button type="button" class="btn btn-secundario" id="btn-sangria"><i data-lucide="arrow-up-from-line"></i>Sangria</button>
      <button type="button" class="btn btn-secundario" id="btn-reforco"><i data-lucide="arrow-down-to-line"></i>Reforço</button>
      <button type="button" class="btn btn-primario" id="btn-fechar"><i data-lucide="lock"></i>Fechar caixa</button>`;
    $('btn-receber').addEventListener('click', abrirReceberCrediario);
    $('btn-sangria').addEventListener('click', () => abrirMovimento('sangria', cx));
    $('btn-reforco').addEventListener('click', () => abrirMovimento('suprimento', cx));
    $('btn-fechar').addEventListener('click', () => abrirFechamento(cx));

    const vendasDinheiro = cx.porForma.dinheiro;
    // Linhas da "conta" da gaveta
    const linhasGaveta = [
      ['Troco inicial', cx.valorInicial, ''],
      ['Vendas em dinheiro (já sem o troco)', vendasDinheiro, '+'],
      ['Recebimentos de crediário em dinheiro', (cx.recebimentos || {}).dinheiro || 0, '+'],
      ['Reforços', cx.suprimentos, '+'],
      ['Sangrias', cx.sangrias, '−'],
      ['Devoluções/estornos em dinheiro', cx.devolucoes, '−'],
      ['Contas pagas com dinheiro do caixa', cx.pagamentosContas || 0, '−']
    ];

    $('caixa-atual').innerHTML = `
      <section class="grid-stats" aria-label="Resumo do caixa">
        <article class="card stat">
          <div class="stat-topo"><span class="stat-rotulo">Dinheiro na gaveta</span><span class="stat-icone"><i data-lucide="banknote"></i></span></div>
          <div class="stat-valor">${moeda(cx.esperado.dinheiro)}</div>
          <div class="stat-detalhe">Valor esperado agora</div>
        </article>
        <article class="card stat">
          <div class="stat-topo"><span class="stat-rotulo">Vendido neste caixa</span><span class="stat-icone"><i data-lucide="shopping-bag"></i></span></div>
          <div class="stat-valor">${moeda(cx.totalVendido)}</div>
          <div class="stat-detalhe">${cx.qtdVendas} ${cx.qtdVendas === 1 ? 'venda' : 'vendas'}</div>
        </article>
        <article class="card stat">
          <div class="stat-topo"><span class="stat-rotulo">Cartões e Pix</span><span class="stat-icone"><i data-lucide="credit-card"></i></span></div>
          <div class="stat-valor">${moeda(cx.esperado.pix + cx.esperado.debito + cx.esperado.credito)}</div>
          <div class="stat-detalhe">Não entram na gaveta</div>
        </article>
        <article class="card stat">
          <div class="stat-topo"><span class="stat-rotulo">Troco inicial</span><span class="stat-icone"><i data-lucide="lock-open"></i></span></div>
          <div class="stat-valor">${moeda(cx.valorInicial)}</div>
          <div class="stat-detalhe">${App.escapeHtml(cx.abertoPorNome)}</div>
        </article>
      </section>

      <section class="grid-2 secao">
        <article class="card">
          <div class="card-cabecalho"><h2>Recebido por forma de pagamento</h2></div>
          <ul class="lista">
            ${FORMAS.map((f) => `
              <li class="lista-item">
                <span class="stat-icone" style="width:32px;height:32px"><i data-lucide="${f.icone}"></i></span>
                <div class="info"><div class="titulo">${f.nome}</div></div>
                <span class="valor">${moeda(cx.porForma[f.id] || 0)}</span>
              </li>`).join('')}
            <li class="lista-item">
              <span class="stat-icone" style="width:32px;height:32px"><i data-lucide="ticket"></i></span>
              <div class="info"><div class="titulo">Vale-troca</div><div class="sub">Crédito já existente — não é dinheiro novo</div></div>
              <span class="valor texto-3">${moeda(cx.porForma.vale || 0)}</span>
            </li>
            <li class="lista-item">
              <span class="stat-icone" style="width:32px;height:32px"><i data-lucide="calendar-clock"></i></span>
              <div class="info"><div class="titulo">Vendido no crediário</div><div class="sub">Entra quando o cliente pagar a parcela</div></div>
              <span class="valor texto-3">${moeda(cx.porForma.crediario || 0)}</span>
            </li>
            ${cx.totalRecebimentos ? `<li class="lista-item">
              <span class="stat-icone" style="width:32px;height:32px"><i data-lucide="hand-coins"></i></span>
              <div class="info"><div class="titulo">Parcelas de crediário recebidas</div><div class="sub">${['dinheiro', 'pix', 'debito', 'credito'].filter((f) => cx.recebimentos[f]).map((f) => `${App.FORMAS_CURTAS[f]} ${moeda(cx.recebimentos[f])}`).join(' · ')} (já somadas acima)</div></div>
              <span class="valor">${moeda(cx.totalRecebimentos)}</span>
            </li>` : ''}
          </ul>
        </article>

        <article class="card">
          <div class="card-cabecalho"><h2>Conta da gaveta</h2></div>
          <div class="card-corpo">
            ${linhasGaveta.map(([rot, val, sinal]) => `<div class="resumo-linha"><span>${sinal ? sinal + ' ' : ''}${rot}</span><strong>${moeda(val)}</strong></div>`).join('')}
            <div class="resumo-total"><span>Dinheiro esperado</span><strong>${moeda(cx.esperado.dinheiro)}</strong></div>
          </div>
        </article>
      </section>

      <section class="card secao">
        <div class="card-cabecalho"><h2>Movimentos da gaveta</h2><span class="texto-sm texto-3">${cx.movimentos.length} registro(s)</span></div>
        ${cx.movimentos.length ? `
          <div class="tabela-wrap"><table class="tabela tabela-responsiva">
            <thead><tr><th>Tipo</th><th>Data</th><th>Motivo</th><th>Usuário</th><th class="num">Valor</th></tr></thead>
            <tbody>${cx.movimentos.slice().reverse().map((m) => `
              <tr>
                <td class="cel-principal">${badgeMovimento(m.tipo)}</td>
                <td data-label="Data" class="nowrap">${App.formatarDataHora(m.data)}</td>
                <td data-label="Motivo">${App.escapeHtml(m.motivo || '—')}</td>
                <td data-label="Usuário">${App.escapeHtml(m.usuarioNome)}</td>
                <td data-label="Valor" class="num negrito ${m.tipo === 'suprimento' || m.tipo === 'recebimento' ? 'valor-positivo' : 'valor-negativo'}">${m.tipo === 'suprimento' || m.tipo === 'recebimento' ? '+' : '−'}${moeda(m.valor)}${m.forma && m.forma !== 'dinheiro' ? ` <span class="texto-xs texto-3">(${App.FORMAS_CURTAS[m.forma]})</span>` : ''}</td>
              </tr>`).join('')}</tbody>
          </table></div>`
          : App.estadoVazio({ icone: 'wallet', titulo: 'Nenhuma sangria ou reforço', texto: 'Retiradas para o banco e entradas de troco aparecem aqui.' })}
      </section>`;
  }

  function badgeMovimento(tipo) {
    const mapa = { sangria: ['Sangria', 'alerta'], suprimento: ['Reforço', 'sucesso'], devolucao: ['Devolução', 'perigo'], estorno: ['Estorno', 'perigo'], recebimento: ['Crediário recebido', 'sucesso'], pagamento: ['Conta paga', 'alerta'] };
    const [t, c] = mapa[tipo] || [tipo, ''];
    return `<span class="badge badge-${c}">${t}</span>`;
  }

  /* ==================================================================
     RECEBER PARCELA DE CREDIÁRIO (no balcão)
     ================================================================== */
  async function abrirReceberCrediario() {
    const parcelas = (await Data.listarContasReceber()).filter((c) => c.status !== 'pago');
    const situacao = (s) => App.badgeStatus(s === 'aberto' ? 'avencer' : s);
    const { el, fechar } = App.abrirModal({
      titulo: 'Receber crediário',
      tamanho: 'lg',
      corpo: parcelas.length ? `
        <input class="input mb-4" type="search" id="busca-cred" placeholder="Buscar cliente…" aria-label="Buscar cliente">
        <div class="tabela-wrap"><table class="tabela tabela-responsiva">
          <thead><tr><th>Cliente</th><th>Parcela</th><th>Vencimento</th><th class="num">Falta</th><th>Situação</th><th class="col-acoes"><span class="sr-only">Ações</span></th></tr></thead>
          <tbody>${parcelas.map((c) => `
            <tr data-cliente="${App.escapeHtml(c.clienteNome.toLowerCase())}">
              <td class="cel-principal negrito">${App.escapeHtml(c.clienteNome)} <span class="texto-xs texto-3">· venda #${c.numeroVenda}</span></td>
              <td data-label="Parcela">${c.parcela}/${c.totalParcelas}</td>
              <td data-label="Vencimento">${App.formatarData(c.vencimento)}</td>
              <td data-label="Falta" class="num negrito">${moeda(c.saldo)}</td>
              <td data-label="Situação">${situacao(c.status)}</td>
              <td class="col-acoes"><button type="button" class="btn btn-primario" data-rec="${c.id}" style="min-height:36px">Receber</button></td>
            </tr>`).join('')}</tbody>
        </table></div>`
        : App.estadoVazio({ icone: 'hand-coins', titulo: 'Nenhuma parcela em aberto', texto: 'Vendas no crediário geram parcelas a receber.' }),
      acoes: [{ texto: 'Fechar' }]
    });
    const busca = el.querySelector('#busca-cred');
    if (busca) busca.addEventListener('input', () => {
      el.querySelectorAll('tr[data-cliente]').forEach((tr) => { tr.hidden = !tr.dataset.cliente.includes(busca.value.toLowerCase()); });
    });
    el.querySelectorAll('[data-rec]').forEach((b) => b.addEventListener('click', () => {
      const c = parcelas.find((x) => x.id === b.dataset.rec);
      fechar();
      setTimeout(() => receberParcela(c), 200);
    }));
  }

  function receberParcela(c) {
    let forma = 'dinheiro';
    const { el, fechar } = App.abrirModal({
      titulo: `Receber de ${c.clienteNome}`,
      tamanho: 'sm',
      corpo: `
        <p class="texto-sm mb-4">Parcela ${c.parcela}/${c.totalParcelas} da venda #${c.numeroVenda} · vence ${App.formatarData(c.vencimento)}</p>
        <div class="campo">
          <label for="rc-valor">Valor recebido</label>
          <div class="input-grupo"><span class="prefixo">R$</span><input class="input" id="rc-valor" inputmode="decimal" data-mascara="moeda" value="${App.formatarValorInput(c.saldo)}"></div>
          <span class="ajuda">Falta ${moeda(c.saldo)}. Pode receber só uma parte.</span>
        </div>
        <div class="campo mt-4">
          <span class="rotulo" id="rot-rc">Forma</span>
          <div class="chips" role="radiogroup" aria-labelledby="rot-rc">
            ${['dinheiro', 'pix', 'debito', 'credito'].map((f) => `<button type="button" class="chip" role="radio" data-forma="${f}" aria-checked="${f === 'dinheiro'}">${App.FORMAS_CURTAS[f]}</button>`).join('')}
          </div>
        </div>`,
      acoes: [{ texto: 'Cancelar' }, { texto: 'Confirmar', classe: 'btn-primario', icone: 'check', aoClicar: async (_, botao) => {
        botao.disabled = true;
        try {
          const r = await Data.receberParcela(c.id, { valor: App.lerNumero(el.querySelector('#rc-valor').value), forma });
          fechar();
          App.toast(r.status === 'pago' ? `Parcela de ${c.clienteNome} quitada.` : `Recebido. Ainda faltam ${moeda(r.saldo)}.`);
          carregar();
        } catch (e) { App.toast(e.message, 'erro'); botao.disabled = false; }
      } }]
    });
    el.querySelectorAll('[data-forma]').forEach((b) => b.addEventListener('click', () => {
      forma = b.dataset.forma;
      el.querySelectorAll('[data-forma]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    }));
  }

  /* ==================================================================
     SANGRIA / REFORÇO
     ================================================================== */
  function abrirMovimento(tipo, cx) {
    const sangria = tipo === 'sangria';
    const { el, fechar } = App.abrirModal({
      titulo: sangria ? 'Sangria (retirar dinheiro)' : 'Reforço (colocar troco)',
      tamanho: 'sm',
      corpo: `
        <p class="texto-sm mb-4">${sangria
          ? `Retire o excesso de dinheiro da gaveta (ex.: depósito no banco). Na gaveta agora: <strong>${moeda(cx.esperado.dinheiro)}</strong>.`
          : 'Registre o dinheiro colocado na gaveta para troco.'}</p>
        <div class="campo">
          <label for="mov-valor">Valor</label>
          <div class="input-grupo"><span class="prefixo">R$</span><input class="input" id="mov-valor" inputmode="decimal" data-mascara="moeda" required></div>
        </div>
        <div class="campo mt-4">
          <label for="mov-motivo">Motivo</label>
          <input class="input" id="mov-motivo" placeholder="${sangria ? 'Ex.: Depósito no banco' : 'Ex.: Troco do cofre'}">
        </div>`,
      acoes: [
        { texto: 'Cancelar' },
        { texto: sangria ? 'Registrar sangria' : 'Registrar reforço', classe: 'btn-primario', icone: 'check', aoClicar: async (_, botao) => {
          const valor = App.lerNumero(el.querySelector('#mov-valor').value);
          if (!valor) return App.toast('Informe o valor.', 'erro');
          botao.disabled = true;
          try {
            await Data.registrarMovimentoCaixa({ tipo, valor, motivo: el.querySelector('#mov-motivo').value.trim() });
            fechar();
            App.toast(sangria ? `Sangria de ${moeda(valor)} registrada.` : `Reforço de ${moeda(valor)} registrado.`);
            carregar();
          } catch (erro) { App.toast(erro.message, 'erro'); botao.disabled = false; }
        } }
      ]
    });
  }

  /* ==================================================================
     FECHAMENTO COM CONFERÊNCIA
     ================================================================== */
  function abrirFechamento(cx) {
    const { el, fechar } = App.abrirModal({
      titulo: 'Fechar caixa',
      tamanho: 'lg',
      corpo: `
        <p class="texto-sm">Informe o que foi <strong>conferido</strong> em cada forma. A diferença aparece na hora.</p>
        <div class="tabela-wrap mt-4">
          <table class="tabela tabela-responsiva">
            <thead><tr><th>Forma</th><th class="num">Sistema</th><th class="num">Conferido</th><th class="num">Diferença</th></tr></thead>
            <tbody>
              ${FORMAS.map((f) => `
                <tr>
                  <td class="cel-principal"><div class="negrito">${f.nome}</div><div class="texto-xs texto-3">${f.ajuda}</div></td>
                  <td data-label="Sistema" class="num">${moeda(cx.esperado[f.id])}</td>
                  <td data-label="Conferido" class="num">
                    <label class="sr-only" for="contado-${f.id}">Conferido em ${f.nome}</label>
                    <div class="input-grupo" style="max-width:150px;margin-left:auto"><span class="prefixo">R$</span>
                      <input class="input texto-direita" id="contado-${f.id}" data-forma="${f.id}" inputmode="decimal" data-mascara="moeda" value="${f.id === 'dinheiro' ? '' : App.formatarValorInput(cx.esperado[f.id])}" placeholder="0,00">
                    </div>
                  </td>
                  <td data-label="Diferença" class="num negrito" id="dif-${f.id}">—</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <details class="mt-4">
          <summary class="texto-sm negrito" style="cursor:pointer">Contar o dinheiro por cédulas e moedas</summary>
          <div class="grid mt-2" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px">
            ${CEDULAS.map((c) => `
              <div class="campo">
                <label for="ced-${String(c).replace('.', '_')}" class="texto-xs">${c >= 2 ? 'Cédula' : 'Moeda'} ${moeda(c)}</label>
                <input class="input" type="number" min="0" inputmode="numeric" id="ced-${String(c).replace('.', '_')}" data-cedula="${c}" placeholder="0">
              </div>`).join('')}
          </div>
          <p class="texto-sm mt-2">Total contado: <strong id="total-cedulas">R$ 0,00</strong> (preenche o campo Dinheiro)</p>
        </details>

        <div class="resumo-total mt-4"><span>Diferença total</span><strong id="dif-total">—</strong></div>
        <div class="campo mt-4">
          <label for="obs-fechamento">Observação</label>
          <textarea class="textarea" id="obs-fechamento" placeholder="Ex.: diferença de troco, cliente pagou depois…" style="min-height:64px"></textarea>
        </div>`,
      acoes: [
        { texto: 'Cancelar' },
        { texto: 'Fechar caixa', classe: 'btn-primario', icone: 'lock', aoClicar: confirmar }
      ]
    });

    const lerContado = () => {
      const c = {};
      FORMAS.forEach((f) => { c[f.id] = el.querySelector(`#contado-${f.id}`).value === '' ? null : App.lerNumero(el.querySelector(`#contado-${f.id}`).value); });
      return c;
    };
    const corDif = (d) => (Math.abs(d) < 0.005 ? 'var(--cor-sucesso)' : d < 0 ? 'var(--cor-perigo)' : 'var(--cor-alerta)');
    const textoDif = (d) => (Math.abs(d) < 0.005 ? 'Confere' : `${d > 0 ? 'Sobra' : 'Falta'} ${moeda(Math.abs(d))}`);

    function atualizar() {
      const c = lerContado();
      let total = 0, completo = true;
      FORMAS.forEach((f) => {
        const cel = el.querySelector(`#dif-${f.id}`);
        if (c[f.id] === null) { cel.textContent = '—'; cel.style.color = ''; completo = false; return; }
        const d = Math.round((c[f.id] - cx.esperado[f.id]) * 100) / 100;
        total += d;
        cel.textContent = textoDif(d);
        cel.style.color = corDif(d);
      });
      const t = el.querySelector('#dif-total');
      t.textContent = completo ? textoDif(Math.round(total * 100) / 100) : 'Informe o dinheiro contado';
      t.style.color = completo ? corDif(total) : 'var(--cor-texto-3)';
    }
    el.querySelectorAll('[data-forma]').forEach((i) => i.addEventListener('input', atualizar));

    // Contagem de cédulas preenche o dinheiro
    el.querySelectorAll('[data-cedula]').forEach((i) => i.addEventListener('input', () => {
      const total = [...el.querySelectorAll('[data-cedula]')].reduce((s, x) => s + (Number(x.value) || 0) * Number(x.dataset.cedula), 0);
      el.querySelector('#total-cedulas').textContent = moeda(total);
      el.querySelector('#contado-dinheiro').value = App.formatarValorInput(total);
      atualizar();
    }));
    atualizar();

    async function confirmar(_, botao) {
      const contado = lerContado();
      if (contado.dinheiro === null) { el.querySelector('#contado-dinheiro').focus(); return App.toast('Conte o dinheiro da gaveta e informe o valor.', 'erro'); }
      const dif = FORMAS.reduce((s, f) => s + ((contado[f.id] ?? cx.esperado[f.id]) - cx.esperado[f.id]), 0);
      const obs = el.querySelector('#obs-fechamento').value.trim();
      if (Math.abs(dif) >= 0.005 && !obs) {
        const ok = await App.confirmar({ titulo: 'Fechar com diferença?', mensagem: `O caixa tem ${textoDif(Math.round(dif * 100) / 100).toLowerCase()}. Recomendo registrar uma observação. Fechar mesmo assim?`, textoConfirmar: 'Fechar mesmo assim' });
        if (!ok) return;
      }
      botao.disabled = true;
      try {
        const fechado = await Data.fecharCaixa({ contado, observacao: obs });
        fechar();
        App.toast('Caixa fechado.');
        await carregar();
        setTimeout(() => verFechamento(fechado), 250);
      } catch (erro) { App.toast(erro.message, 'erro'); botao.disabled = false; }
    }
  }

  /* ==================================================================
     HISTÓRICO
     ================================================================== */
  function badgeDiferenca(d) {
    if (d === null || d === undefined) return '—';
    if (Math.abs(d) < 0.005) return '<span class="badge badge-sucesso">Confere</span>';
    return `<span class="badge ${d < 0 ? 'badge-perigo' : 'badge-alerta'}">${d < 0 ? 'Falta' : 'Sobra'} ${moeda(Math.abs(d))}</span>`;
  }

  function desenharHistorico() {
    $('contador-historico').textContent = `${historico.length} fechamento(s)`;
    const corpo = $('historico');
    if (!historico.length) {
      corpo.innerHTML = `<tr><td colspan="8">${App.estadoVazio({ icone: 'history', titulo: 'Nenhum caixa fechado ainda', texto: 'Os fechamentos aparecem aqui com a conferência de cada dia.' })}</td></tr>`;
      $('paginacao').innerHTML = '';
      return;
    }
    const pag = App.paginar(historico, pagina, POR_PAGINA);
    pagina = pag.pagina;
    corpo.innerHTML = pag.itens.map((c) => `
      <tr>
        <td class="cel-principal"><span class="negrito">${App.formatarData(c.abertoEm)}</span> <span class="texto-xs texto-3">${new Date(c.abertoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></td>
        <td data-label="Fechamento" class="nowrap">${App.formatarDataHora(c.fechadoEm)}</td>
        <td data-label="Operador(a)">${App.escapeHtml(c.fechadoPorNome || c.abertoPorNome)}</td>
        <td data-label="Vendido" class="num">${moeda(c.totalVendido)}</td>
        <td data-label="Dinheiro esperado" class="num">${moeda(c.esperado.dinheiro)}</td>
        <td data-label="Dinheiro contado" class="num negrito">${moeda(c.fechamento.contado.dinheiro)}</td>
        <td data-label="Conferência">${badgeDiferenca(c.diferenca)}</td>
        <td class="col-acoes"><button type="button" class="btn btn-secundario" data-ver="${c.id}" style="min-height:36px"><i data-lucide="eye"></i>Ver</button></td>
      </tr>`).join('');
    corpo.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => verFechamento(historico.find((c) => c.id === b.dataset.ver))));
    App.renderPaginacao($('paginacao'), { total: historico.length, pagina, porPagina: POR_PAGINA, aoMudar: (n) => { pagina = n; desenharHistorico(); App.icones(); } });
  }

  /** Relatório do fechamento (tela + impressão em cupom) */
  async function verFechamento(c) {
    const loja = await Data.obterLoja();
    const m = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const e = App.escapeHtml;
    const linhas = FORMAS.map((f) => {
      const esp = c.fechamento.esperado[f.id] || 0, cont = c.fechamento.contado[f.id] || 0;
      return `<div class="c-linha c-negrito"><span>${f.nome}</span><span></span></div>
        <div class="c-linha"><span>  Sistema</span><span>${m(esp)}</span></div>
        <div class="c-linha"><span>  Conferido</span><span>${m(cont)}</span></div>
        ${Math.abs(cont - esp) >= 0.005 ? `<div class="c-linha"><span>  Diferença</span><span>${cont - esp > 0 ? '+' : ''}${m(cont - esp)}</span></div>` : ''}`;
    }).join('');
    const html = `<div class="cupom">
      <div class="c-centro c-negrito" style="font-size:15px">${e(loja.nome).toUpperCase()}</div>
      <div class="c-centro c-negrito">FECHAMENTO DE CAIXA</div>
      <div class="c-sep"></div>
      <div class="c-linha"><span>Abertura</span><span>${App.formatarDataHora(c.abertoEm)}</span></div>
      <div class="c-linha"><span>Aberto por</span><span>${e(c.abertoPorNome)}</span></div>
      <div class="c-linha"><span>Fechamento</span><span>${App.formatarDataHora(c.fechadoEm)}</span></div>
      <div class="c-linha"><span>Fechado por</span><span>${e(c.fechadoPorNome || '—')}</span></div>
      <div class="c-sep"></div>
      <div class="c-linha"><span>Vendas</span><span>${c.qtdVendas}</span></div>
      <div class="c-linha"><span>Total vendido</span><span>${m(c.totalVendido)}</span></div>
      ${c.porForma.vale ? `<div class="c-linha"><span>Pago com vale-troca</span><span>${m(c.porForma.vale)}</span></div>` : ''}
      <div class="c-sep"></div>
      <div class="c-linha"><span>Troco inicial</span><span>${m(c.valorInicial)}</span></div>
      <div class="c-linha"><span>Vendas em dinheiro</span><span>${m(c.porForma.dinheiro)}</span></div>
      <div class="c-linha"><span>Reforços</span><span>${m(c.suprimentos)}</span></div>
      <div class="c-linha"><span>Sangrias</span><span>-${m(c.sangrias)}</span></div>
      <div class="c-linha"><span>Devoluções/estornos</span><span>-${m(c.devolucoes)}</span></div>
      ${(c.recebimentos && c.recebimentos.dinheiro) ? `<div class="c-linha"><span>Crediário recebido (dinheiro)</span><span>${m(c.recebimentos.dinheiro)}</span></div>` : ''}
      ${c.pagamentosContas ? `<div class="c-linha"><span>Contas pagas pelo caixa</span><span>-${m(c.pagamentosContas)}</span></div>` : ''}
      <div class="c-sep"></div>
      ${linhas}
      <div class="c-sep"></div>
      <div class="c-linha c-negrito"><span>DIFERENÇA TOTAL</span><span>${c.diferenca > 0 ? '+' : ''}${m(c.diferenca)}</span></div>
      ${c.fechamento.observacao ? `<div class="c-sep"></div><div>Obs.: ${e(c.fechamento.observacao)}</div>` : ''}
      <div class="c-sep"></div>
      <div class="c-centro" style="margin-top:24px">_______________________________</div>
      <div class="c-centro">Assinatura do responsável</div>
    </div>`;
    App.abrirModal({
      titulo: `Fechamento de ${App.formatarData(c.abertoEm)}`,
      corpo: `<div class="flex justify-between items-center mb-4 gap-3" style="flex-wrap:wrap">${badgeDiferenca(c.diferenca)}<span class="texto-sm texto-3">${c.qtdVendas} vendas · ${moeda(c.totalVendido)}</span></div>
        <div style="background:var(--cor-superficie-2);padding:24px 8px;border-radius:12px">${html}</div>`,
      acoes: [{ texto: 'Fechar' }, { texto: 'Imprimir', classe: 'btn-primario', icone: 'printer', aoClicar: () => App.imprimir(html) }]
    });
  }

  await carregar();
});
