/* ==========================================================================
   financeiro.js — Contas a receber (crediário) e a pagar (só o dono)
   - Receber parcela (total ou parcial): dinheiro entra no caixa aberto
   - Lembrar cliente pelo WhatsApp
   - Lançar conta a pagar (à vista ou parcelada) e dar baixa
   ========================================================================== */
App.aoIniciar(async () => {
  const $ = (id) => document.getElementById(id);
  const fornecedores = await Data.listarFornecedores();
  const CATEGORIAS = ['Fornecedores', 'Aluguel', 'Funcionários', 'Contas de consumo', 'Impostos', 'Embalagens', 'Marketing', 'Outros'];
  const FORMAS_PAGAR = { pix: 'Pix', boleto: 'Boleto', transferencia: 'Transferência', cartao: 'Cartão', caixa: 'Dinheiro do caixa' };
  const situacao = (s) => App.badgeStatus(s === 'aberto' ? 'avencer' : s);

  /* ---------- Abas ---------- */
  const abas = [$('aba-receber'), $('aba-pagar')];
  function ativarAba(aba) {
    abas.forEach((a) => {
      const ativa = a === aba;
      a.setAttribute('aria-selected', String(ativa));
      a.tabIndex = ativa ? 0 : -1;
      $(a.getAttribute('aria-controls')).hidden = !ativa;
    });
    history.replaceState(null, '', '#' + aba.id.replace('aba-', ''));
  }
  abas.forEach((a) => a.addEventListener('click', () => ativarAba(a)));
  if (location.hash === '#pagar') ativarAba($('aba-pagar'));

  /* ---------- Resumo ---------- */
  async function carregarResumo() {
    const r = await Data.resumoFinanceiro();
    $('k-receber').textContent = App.formatarMoeda(r.receberAberto);
    $('k-receber-venc').textContent = App.formatarMoeda(r.receberVencido);
    $('k-pagar7').textContent = App.formatarMoeda(r.pagar7dias);
    $('k-pagar-total').textContent = `${App.formatarMoeda(r.pagarAberto)} em aberto no total`;
    $('k-pagar-venc').textContent = App.formatarMoeda(r.pagarVencido);
  }

  /* ==================================================================
     A RECEBER
     ================================================================== */
  const formR = $('filtros-receber');
  async function carregarReceber() {
    const filtros = App.lerFormulario(formR);
    let lista = await Data.listarContasReceber(filtros);
    if (!filtros.status) lista = lista.filter((c) => c.status !== 'pago');
    const corpo = $('lista-receber');
    corpo.innerHTML = lista.length ? lista.map((c) => `
      <tr>
        <td class="cel-principal"><span class="negrito">${App.escapeHtml(c.clienteNome)}</span></td>
        <td data-label="Venda">${c.numeroVenda ? `<a href="vendas.html?venda=${c.vendaId}">#${c.numeroVenda}</a>` : '—'}</td>
        <td data-label="Parcela">${c.parcela}/${c.totalParcelas}</td>
        <td data-label="Vencimento" class="nowrap">${App.formatarData(c.vencimento)}</td>
        <td data-label="Valor" class="num">${App.formatarMoeda(c.valor)}</td>
        <td data-label="Falta" class="num negrito">${App.formatarMoeda(c.saldo)}</td>
        <td data-label="Situação">${situacao(c.status)}</td>
        <td class="col-acoes">
          ${c.status !== 'pago' ? `
            ${c.clienteTelefone ? `<a class="btn-icone" target="_blank" rel="noopener" href="https://wa.me/55${c.clienteTelefone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá, ${c.clienteNome.split(' ')[0]}! Lembrete da parcela ${c.parcela}/${c.totalParcelas} de ${App.formatarMoeda(c.saldo)} com vencimento em ${App.formatarData(c.vencimento)}.`)}" title="Lembrar pelo WhatsApp" aria-label="Lembrar ${App.escapeHtml(c.clienteNome)} pelo WhatsApp"><i data-lucide="message-circle"></i></a>` : ''}
            <button type="button" class="btn btn-secundario" data-receber="${c.id}" style="min-height:36px"><i data-lucide="hand-coins"></i>Receber</button>` : `<span class="texto-xs texto-3">Pago em ${App.formatarData(c.pagamentos[c.pagamentos.length - 1].data)}</span>`}
        </td>
      </tr>`).join('')
      : `<tr><td colspan="8">${App.estadoVazio({ icone: 'hand-coins', titulo: 'Nenhuma parcela neste filtro', texto: 'Vendas no crediário (PDV) geram parcelas aqui.' })}</td></tr>`;
    corpo.querySelectorAll('[data-receber]').forEach((b) => b.addEventListener('click', () => abrirRecebimento(lista.find((c) => c.id === b.dataset.receber))));
    App.icones();
  }

  /** Modal de recebimento (também usado na tela de Caixa) */
  function abrirRecebimento(c) {
    const { el, fechar } = App.abrirModal({
      titulo: `Receber parcela ${c.parcela}/${c.totalParcelas}`,
      tamanho: 'sm',
      corpo: `
        <p class="texto-sm mb-4"><strong>${App.escapeHtml(c.clienteNome)}</strong> · venda #${c.numeroVenda} · vence ${App.formatarData(c.vencimento)} ${situacao(c.status)}</p>
        <div class="campo">
          <label for="rec-valor">Valor recebido</label>
          <div class="input-grupo"><span class="prefixo">R$</span><input class="input" id="rec-valor" inputmode="decimal" data-mascara="moeda" value="${App.formatarValorInput(c.saldo)}"></div>
          <span class="ajuda">Falta ${App.formatarMoeda(c.saldo)}. Pode receber só uma parte.</span>
        </div>
        <div class="campo mt-4">
          <span class="rotulo" id="rot-forma-rec">Forma</span>
          <div class="chips" role="radiogroup" aria-labelledby="rot-forma-rec">
            ${['dinheiro', 'pix', 'debito', 'credito'].map((f, i) => `<button type="button" class="chip" role="radio" data-forma="${f}" aria-checked="${i === 1}">${App.FORMAS_CURTAS[f]}</button>`).join('')}
          </div>
          <span class="ajuda">Dinheiro precisa de caixa aberto e entra na gaveta.</span>
        </div>`,
      acoes: [{ texto: 'Cancelar' }, { texto: 'Confirmar recebimento', classe: 'btn-primario', icone: 'check', aoClicar: confirmar }]
    });
    let forma = 'pix';
    el.querySelectorAll('[data-forma]').forEach((b) => b.addEventListener('click', () => {
      forma = b.dataset.forma;
      el.querySelectorAll('[data-forma]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    }));
    async function confirmar(_, botao) {
      botao.disabled = true;
      try {
        const r = await Data.receberParcela(c.id, { valor: App.lerNumero(el.querySelector('#rec-valor').value), forma });
        fechar();
        App.toast(r.status === 'pago' ? 'Parcela quitada.' : `Recebido. Ainda faltam ${App.formatarMoeda(r.saldo)}.`);
        atualizarTudo();
      } catch (e) { App.toast(e.message, 'erro'); botao.disabled = false; }
    }
  }

  /* ==================================================================
     A PAGAR
     ================================================================== */
  const formP = $('filtros-pagar');
  async function carregarPagar() {
    const lista = await Data.listarContasPagar(App.lerFormulario(formP));
    const corpo = $('lista-pagar');
    corpo.innerHTML = lista.length ? lista.map((c) => `
      <tr>
        <td class="cel-principal"><div class="negrito">${App.escapeHtml(c.descricao)}</div>${c.documento ? `<div class="texto-xs texto-3">Doc. ${App.escapeHtml(c.documento)}</div>` : ''}</td>
        <td data-label="Fornecedor">${App.escapeHtml(c.fornecedorNome || '—')}</td>
        <td data-label="Categoria"><span class="tag">${App.escapeHtml(c.categoria || 'Outros')}</span></td>
        <td data-label="Vencimento" class="nowrap">${App.formatarData(c.vencimento)}</td>
        <td data-label="Valor" class="num negrito">${App.formatarMoeda(c.valor)}</td>
        <td data-label="Situação">${situacao(c.status)}${c.status === 'pago' ? `<div class="texto-xs texto-3">${App.formatarData(c.dataPagamento)} · ${FORMAS_PAGAR[c.formaPagamento] || c.formaPagamento || ''}</div>` : ''}</td>
        <td class="col-acoes">
          ${c.status !== 'pago' ? `<button type="button" class="btn btn-secundario" data-pagar="${c.id}" style="min-height:36px"><i data-lucide="check"></i>Pagar</button>
          <button type="button" class="btn-icone" data-editar="${c.id}" aria-label="Editar ${App.escapeHtml(c.descricao)}" title="Editar"><i data-lucide="pencil"></i></button>` : ''}
          <button type="button" class="btn-icone perigo" data-excluir="${c.id}" aria-label="Excluir ${App.escapeHtml(c.descricao)}" title="Excluir"><i data-lucide="trash-2"></i></button>
        </td>
      </tr>`).join('')
      : `<tr><td colspan="7">${App.estadoVazio({ icone: 'receipt-text', titulo: 'Nenhuma conta neste filtro', texto: 'Lance boletos de fornecedores, aluguel, contas de consumo…' })}</td></tr>`;
    corpo.querySelectorAll('[data-pagar]').forEach((b) => b.addEventListener('click', () => abrirPagamento(lista.find((c) => c.id === b.dataset.pagar))));
    corpo.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirConta(lista.find((c) => c.id === b.dataset.editar))));
    corpo.querySelectorAll('[data-excluir]').forEach((b) => b.addEventListener('click', async () => {
      const c = lista.find((x) => x.id === b.dataset.excluir);
      if (!(await App.confirmar({ titulo: 'Excluir conta?', mensagem: `"${c.descricao}" de ${App.formatarMoeda(c.valor)} será removida.`, textoConfirmar: 'Excluir', perigo: true }))) return;
      await Data.excluirContaPagar(c.id);
      App.toast('Conta excluída.');
      atualizarTudo();
    }));
    App.icones();
  }

  function abrirConta(conta = null) {
    const c = conta || { descricao: '', valor: '', vencimento: App.dataInput(), categoria: 'Fornecedores', fornecedorId: '', documento: '' };
    const { el, fechar } = App.abrirModal({
      titulo: conta ? 'Editar conta a pagar' : 'Nova conta a pagar',
      corpo: `
        <form id="form-conta" class="form-grid" novalidate>
          <div class="campo col-span-2"><label for="cp-desc">Descrição <span class="obrigatorio" aria-hidden="true">*</span></label>
            <input class="input" id="cp-desc" required value="${App.escapeHtml(c.descricao)}" placeholder="Ex.: Boleto NF 46210, aluguel de dezembro"></div>
          <div class="campo"><label for="cp-valor">Valor total <span class="obrigatorio" aria-hidden="true">*</span></label>
            <div class="input-grupo"><span class="prefixo">R$</span><input class="input" id="cp-valor" inputmode="decimal" data-mascara="moeda" required value="${c.valor ? App.formatarValorInput(c.valor) : ''}"></div></div>
          <div class="campo"><label for="cp-venc">${conta ? 'Vencimento' : '1º vencimento'} <span class="obrigatorio" aria-hidden="true">*</span></label>
            <input class="input" type="date" id="cp-venc" required value="${c.vencimento}"></div>
          ${conta ? '' : `<div class="campo"><label for="cp-parcelas">Parcelas (mensais)</label>
            <select class="select" id="cp-parcelas">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join('')}</select></div>`}
          <div class="campo"><label for="cp-cat">Categoria</label>
            <select class="select" id="cp-cat">${CATEGORIAS.map((x) => `<option ${x === c.categoria ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
          <div class="campo"><label for="cp-forn">Fornecedor</label>
            <select class="select" id="cp-forn"><option value="">—</option>${fornecedores.map((f) => `<option value="${f.id}" ${f.id === c.fornecedorId ? 'selected' : ''}>${App.escapeHtml(f.nome)}</option>`).join('')}</select></div>
          <div class="campo"><label for="cp-doc">Nº do documento/boleto</label>
            <input class="input" id="cp-doc" value="${App.escapeHtml(c.documento || '')}"></div>
        </form>`,
      acoes: [{ texto: 'Cancelar' }, { texto: 'Salvar', classe: 'btn-primario', icone: 'check', aoClicar: async (_, botao) => {
        const f = el.querySelector('#form-conta');
        if (!App.validarFormulario(f)) return;
        botao.disabled = true;
        try {
          const r = await Data.salvarContaPagar({
            id: conta ? conta.id : undefined,
            descricao: el.querySelector('#cp-desc').value.trim(),
            valor: App.lerNumero(el.querySelector('#cp-valor').value),
            vencimento: el.querySelector('#cp-venc').value,
            parcelas: conta ? 1 : Number(el.querySelector('#cp-parcelas').value),
            categoria: el.querySelector('#cp-cat').value,
            fornecedorId: el.querySelector('#cp-forn').value || null,
            documento: el.querySelector('#cp-doc').value.trim()
          });
          fechar();
          App.toast(Array.isArray(r) ? `${r.length} parcelas lançadas.` : 'Conta salva.');
          ativarAba($('aba-pagar'));
          atualizarTudo();
        } catch (e) { App.toast(e.message, 'erro'); botao.disabled = false; }
      } }]
    });
  }

  function abrirPagamento(c) {
    const { el, fechar } = App.abrirModal({
      titulo: 'Dar baixa na conta',
      tamanho: 'sm',
      corpo: `
        <p class="texto-sm mb-4"><strong>${App.escapeHtml(c.descricao)}</strong> · ${App.formatarMoeda(c.valor)} · vence ${App.formatarData(c.vencimento)}</p>
        <div class="campo"><label for="pg-forma">Como foi pago</label>
          <select class="select" id="pg-forma">${Object.entries(FORMAS_PAGAR).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <span class="ajuda">"Dinheiro do caixa" sai da gaveta do caixa aberto.</span></div>
        <div class="campo mt-4"><label for="pg-data">Data do pagamento</label>
          <input class="input" type="date" id="pg-data" value="${App.dataInput()}"></div>`,
      acoes: [{ texto: 'Cancelar' }, { texto: 'Confirmar pagamento', classe: 'btn-primario', icone: 'check', aoClicar: async (_, botao) => {
        botao.disabled = true;
        try {
          await Data.pagarConta(c.id, { forma: el.querySelector('#pg-forma').value, data: el.querySelector('#pg-data').value });
          fechar();
          App.toast('Conta paga.');
          atualizarTudo();
        } catch (e) { App.toast(e.message, 'erro'); botao.disabled = false; }
      } }]
    });
  }

  /* ---------- Eventos ---------- */
  async function atualizarTudo() {
    await Promise.all([carregarResumo(), carregarReceber(), carregarPagar()]);
  }
  [formR, formP].forEach((f) => {
    f.addEventListener('submit', (e) => e.preventDefault());
    f.querySelector('input[type=search]').addEventListener('input', App.debounce(() => (f === formR ? carregarReceber() : carregarPagar()), 250));
    f.querySelectorAll('select, input[type=date]').forEach((c) => c.addEventListener('change', () => (f === formR ? carregarReceber() : carregarPagar())));
  });
  $('btn-nova-conta').addEventListener('click', () => abrirConta());

  await atualizarTudo();
});
