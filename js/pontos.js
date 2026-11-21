/* ==========================================================================
   pontos.js — Programa de pontos: números, clientes (saldo, vencimento,
   WhatsApp, ajuste manual), extrato e regras (validade, bônus, campanha)
   ========================================================================== */
App.aoIniciar(async () => {
  const $ = (id) => document.getElementById(id);
  const e = App.escapeHtml;
  const r$ = App.formatarMoeda;
  const n = App.formatarNumero;
  let painel = null;
  let loja = null;
  let aba = 'clientes';
  let filtro = 'todos';
  let mostrarExtrato = 50;

  async function carregar() {
    [painel, loja] = await Promise.all([Data.painelPontos(), Data.obterLoja()]);
    desenharTopo();
    desenhar();
  }

  /* ---------- Topo: situação, aviso e números ---------- */
  function desenharTopo() {
    const t = painel.totais;
    $('pt-status').innerHTML = painel.ativo ? '<span class="badge badge-sucesso">Ligado</span>' : '<span class="badge">Desligado</span>';
    const c = painel.campanha;
    $('pt-aviso').innerHTML = !painel.ativo
      ? `<div class="alerta mb-4"><i data-lucide="power"></i><span>O programa está <strong>desligado</strong>: ninguém ganha pontos nas compras. Ligue na aba <a href="#" data-ir="regras">Regras</a>.</span></div>`
      : c ? `<div class="alerta info mb-4"><i data-lucide="sparkles"></i><span><strong>Pontos ${c.multiplicador === 2 ? 'em dobro' : 'em triplo'}</strong> até ${App.formatarData(c.fim + 'T12:00:00')} — avisa as clientes!</span></div>` : '';
    $('pt-aviso').querySelector('[data-ir]')?.addEventListener('click', (ev) => { ev.preventDefault(); trocarAba('regras'); });
    const card = (rotulo, icone, valor, detalhe) => `
      <article class="card stat">
        <div class="stat-topo"><span class="stat-rotulo">${rotulo}</span><span class="stat-icone"><i data-lucide="${icone}"></i></span></div>
        <div class="stat-valor">${valor}</div>
        <div class="stat-detalhe">${detalhe}</div>
      </article>`;
    $('indicadores').innerHTML =
      card('Clientes com pontos', 'users', n(t.clientes), `${painel.clientes.filter((x) => x.podeUsar).length} já podem usar`)
      + card('Pontos em aberto', 'star', n(t.saldo), `= ${r$(t.saldoValor)} em descontos a conceder`)
      + card('Movimento do mês', 'arrow-left-right', `+${n(t.dadosMes)}`, `${n(t.usadosMes)} usados (${r$(t.usadosMesValor)} de desconto)`)
      + card('Vencem em 30 dias', 'hourglass', n(t.vencendo), t.vencendo ? `${t.clientesVencendo} cliente(s) — bom motivo para chamar` : (painel.regra && painel.regra.validadeMeses ? 'nada vencendo' : 'os pontos não vencem'));
    $('cont-clientes').textContent = painel.clientes.length;
  }

  function trocarAba(nova) {
    aba = nova;
    document.querySelectorAll('#abas [data-aba]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.aba === aba)));
    ['clientes', 'extrato', 'regras'].forEach((a) => { $(`painel-${a}`).hidden = a !== aba; });
    desenhar();
  }

  function desenhar() {
    if (aba === 'clientes') desenharClientes();
    if (aba === 'extrato') desenharExtrato();
    App.icones();
  }

  /* ---------- Clientes ---------- */
  function telefoneWhats(t) {
    let d = String(t || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length <= 11) d = '55' + d;
    return d;
  }
  function mensagemSaldo(c) {
    const primeiro = String(c.nome).split(' ')[0];
    let txt = `Oi, ${primeiro}! 💛 Você tem *${n(c.saldo)} pontos* na ${loja.nome}, que valem *${r$(c.valor)} de desconto* na sua próxima compra.`;
    if (c.vencendo > 0 && c.proximoVencimento) txt += `\n⏳ ${n(c.vencendo)} pontos vencem em ${App.formatarData(c.proximoVencimento)} — aproveite!`;
    if (painel.campanha) txt += `\n✨ E até ${App.formatarData(painel.campanha.fim + 'T12:00:00')} as compras valem pontos ${painel.campanha.multiplicador === 2 ? 'em dobro' : 'em triplo'}!`;
    return txt;
  }

  function desenharClientes() {
    const q = $('busca').value.trim().toLowerCase();
    const lista = painel.clientes.filter((c) => (filtro === 'todos' || (filtro === 'usar' ? c.podeUsar : c.vencendo > 0))
      && (!q || c.nome.toLowerCase().includes(q) || String(c.telefone).includes(q)));
    const el = $('lista-clientes');
    if (!lista.length) {
      el.innerHTML = App.estadoVazio({ icone: 'star', titulo: painel.clientes.length ? 'Nenhum cliente neste filtro' : 'Nenhum cliente com pontos ainda', texto: painel.clientes.length ? '' : 'Na Frente de caixa, escolha a cliente cadastrada antes de finalizar a venda: os pontos entram sozinhos.' });
      return;
    }
    el.innerHTML = `
      <table class="tabela tabela-responsiva">
        <thead><tr><th>Cliente</th><th class="num">Saldo</th><th>Vencimento</th><th class="num">Ganhou</th><th class="num">Usou</th><th>Última compra</th><th></th></tr></thead>
        <tbody>${lista.map((c) => `
          <tr>
            <td class="cel-principal"><div class="produto-cel"><span class="avatar" style="width:32px;height:32px;font-size:12px">${e(App.iniciais(c.nome))}</span><div>
              <div class="titulo">${e(c.nome)}</div><div class="sub">${e(c.telefone || 'sem telefone')}</div></div></div></td>
            <td data-label="Saldo" class="num"><div class="negrito">${n(c.saldo)} pts</div><div class="texto-xs ${c.podeUsar ? 'valor-positivo' : 'texto-3'}">${r$(c.valor)}${c.podeUsar ? ' · pode usar' : ''}</div></td>
            <td data-label="Vencimento">${c.vencendo > 0 ? `<span class="badge badge-alerta">${n(c.vencendo)} vencem ${App.formatarData(c.proximoVencimento)}</span>` : c.proximoVencimento ? `<span class="texto-xs texto-3">próximo: ${App.formatarData(c.proximoVencimento)}</span>` : '<span class="texto-3">—</span>'}</td>
            <td data-label="Ganhou" class="num">${n(c.ganhos)}</td>
            <td data-label="Usou" class="num">${n(c.usados)}${c.vencidos ? `<div class="texto-xs texto-3">${n(c.vencidos)} venceram</div>` : ''}</td>
            <td data-label="Última compra">${c.ultimaCompra ? App.formatarData(c.ultimaCompra) : '—'}</td>
            <td class="num nowrap">
              ${telefoneWhats(c.telefone) && c.saldo > 0 ? `<a class="btn-icone" href="https://wa.me/${telefoneWhats(c.telefone)}?text=${encodeURIComponent(mensagemSaldo(c))}" target="_blank" rel="noopener" title="Mandar o saldo no WhatsApp" aria-label="Mandar o saldo de ${e(c.nome)} no WhatsApp"><i data-lucide="message-circle"></i></a>` : ''}
              <button type="button" class="btn-icone" data-extrato="${e(c.clienteId)}" title="Ver extrato" aria-label="Extrato de ${e(c.nome)}"><i data-lucide="list"></i></button>
              <button type="button" class="btn-icone" data-ajustar="${e(c.clienteId)}" title="Dar ou tirar pontos" aria-label="Ajustar pontos de ${e(c.nome)}"><i data-lucide="circle-plus"></i></button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    el.querySelectorAll('[data-ajustar]').forEach((b) => b.addEventListener('click', () => abrirAjuste(b.dataset.ajustar)));
    el.querySelectorAll('[data-extrato]').forEach((b) => b.addEventListener('click', () => abrirExtratoCliente(b.dataset.extrato)));
  }

  /* ---------- Extrato ---------- */
  function linhaExtrato(m, mostrarCliente = true) {
    const desc = {
      compra: () => `Compra #${m.numero}${m.mult > 1 ? ` <span class="badge badge-info">${m.mult}×</span>` : ''}${m.bonus ? ` <span class="badge badge-sucesso">+${m.bonus} bônus 1ª compra</span>` : ''}`,
      uso: () => `Usou na compra #${m.numero}`,
      ajuste: () => `Ajuste: ${e(m.motivo)}`,
      vencidos: () => 'Pontos venceram'
    }[m.tipo]();
    return `<tr>
      <td data-label="Data" class="nowrap">${App.formatarData(m.data)}</td>
      ${mostrarCliente ? `<td data-label="Cliente">${e(m.clienteNome)}</td>` : ''}
      <td data-label="O que foi">${desc}</td>
      <td data-label="Pontos" class="num negrito ${m.pontos > 0 ? 'valor-positivo' : 'valor-negativo'}">${m.pontos > 0 ? '+' : ''}${n(m.pontos)}</td>
    </tr>`;
  }
  function desenharExtrato() {
    const el = $('lista-extrato');
    if (!painel.extrato.length) { el.innerHTML = App.estadoVazio({ icone: 'list', titulo: 'Nenhum movimento de pontos ainda' }); return; }
    el.innerHTML = `
      <table class="tabela tabela-responsiva">
        <thead><tr><th>Data</th><th>Cliente</th><th>O que foi</th><th class="num">Pontos</th></tr></thead>
        <tbody>${painel.extrato.slice(0, mostrarExtrato).map((m) => linhaExtrato(m)).join('')}</tbody>
      </table>
      ${painel.extrato.length > mostrarExtrato ? `<div class="card-corpo texto-centro"><button type="button" class="btn btn-secundario" id="mais">Mostrar mais (${painel.extrato.length - mostrarExtrato})</button></div>` : ''}`;
    el.querySelector('#mais')?.addEventListener('click', () => { mostrarExtrato += 50; desenharExtrato(); App.icones(); });
  }
  function abrirExtratoCliente(id) {
    const c = painel.clientes.find((x) => x.clienteId === id);
    const movs = painel.extrato.filter((m) => m.clienteId === id);
    App.abrirModal({
      titulo: `Pontos — ${c.nome}`,
      corpo: `
        <div class="ficha-numeros">
          <div><span>Saldo</span><strong>${n(c.saldo)} pts</strong></div>
          <div><span>Vale</span><strong>${r$(c.valor)}</strong></div>
          <div><span>Ganhou</span><strong>${n(c.ganhos)}</strong></div>
          <div><span>Usou</span><strong>${n(c.usados)}</strong></div>
        </div>
        <div class="card mt-4" style="overflow:hidden"><table class="tabela tabela-responsiva">
          <thead><tr><th>Data</th><th>O que foi</th><th class="num">Pontos</th></tr></thead>
          <tbody>${movs.map((m) => linhaExtrato(m, false)).join('')}</tbody>
        </table></div>`,
      acoes: [{ texto: 'Fechar' }, { texto: 'Dar ou tirar pontos', classe: 'btn-primario', icone: 'circle-plus', aoClicar: (fechar) => { fechar(); setTimeout(() => abrirAjuste(id), 200); } }]
    });
  }

  /* ---------- Ajuste manual (bônus ou correção) ---------- */
  async function abrirAjuste(clienteId = '') {
    const clientes = await Data.listarClientes();
    const { el, fechar } = App.abrirModal({
      titulo: 'Dar ou tirar pontos',
      tamanho: 'sm',
      corpo: `
        <div class="campo">
          <label for="aj-cliente">Cliente</label>
          <select class="select" id="aj-cliente"></select>
        </div>
        <div class="chips mt-4" role="radiogroup" aria-label="Dar ou tirar">
          <button type="button" class="chip" role="radio" data-sinal="1" aria-checked="true"><i data-lucide="plus"></i>Dar pontos</button>
          <button type="button" class="chip" role="radio" data-sinal="-1" aria-checked="false"><i data-lucide="minus"></i>Tirar pontos</button>
        </div>
        <div class="campo mt-4">
          <label for="aj-qtd">Quantos pontos</label>
          <input class="input" id="aj-qtd" type="number" min="1" step="1" placeholder="Ex.: 50">
        </div>
        <div class="campo mt-4">
          <label for="aj-motivo">Motivo</label>
          <input class="input" id="aj-motivo" maxlength="80" list="aj-sugestoes" placeholder="Ex.: Aniversário da cliente">
          <datalist id="aj-sugestoes"><option value="Aniversário da cliente"><option value="Indicou uma amiga"><option value="Postou foto no Instagram"><option value="Correção"><option value="Cortesia da loja"></datalist>
          <span class="ajuda">Aparece no extrato da cliente.</span>
        </div>`,
      acoes: [{ texto: 'Cancelar' }, { texto: 'Salvar', classe: 'btn-primario', icone: 'check', aoClicar: salvar }]
    });
    App.preencherSelect(el.querySelector('#aj-cliente'), clientes.map((c) => ({ valor: c.id, texto: c.nome })), { vazio: 'Escolha…' });
    el.querySelector('#aj-cliente').value = clienteId;
    let sinal = 1;
    el.querySelectorAll('[data-sinal]').forEach((b) => b.addEventListener('click', () => {
      sinal = Number(b.dataset.sinal);
      el.querySelectorAll('[data-sinal]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    }));
    App.icones();
    async function salvar(_, botao) {
      botao.disabled = true;
      try {
        const qtd = Math.abs(parseInt(el.querySelector('#aj-qtd').value, 10) || 0) * sinal;
        await Data.ajustarPontos({ clienteId: el.querySelector('#aj-cliente').value, pontos: qtd, motivo: el.querySelector('#aj-motivo').value });
        fechar();
        App.toast(qtd > 0 ? `${n(qtd)} pontos dados.` : `${n(-qtd)} pontos tirados.`, 'sucesso');
        await carregar();
      } catch (er) { App.toast(er.message, 'erro'); botao.disabled = false; }
    }
  }

  /* ---------- Regras ---------- */
  const lerNum = (v) => Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;
  const fmt = (v, casas = 2) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: 3 });
  function preencherRegras() {
    const f = { ativo: false, reaisPorPonto: 1, valorPonto: 0.05, minimoResgate: 100, validadeMeses: 0, bonusPrimeiraCompra: 0, campanha: {}, ...(loja.fidelidade || {}) };
    $('r-ativo').checked = !!f.ativo;
    $('r-reais').value = fmt(f.reaisPorPonto);
    $('r-valor').value = fmt(f.valorPonto);
    $('r-minimo').value = f.minimoResgate;
    $('r-validade').value = String(f.validadeMeses || 0);
    $('r-bonus').value = f.bonusPrimeiraCompra || 0;
    const c = f.campanha || {};
    $('r-mult').value = String(c.multiplicador || 1);
    $('r-inicio').value = c.inicio || '';
    $('r-fim').value = c.fim || '';
    exemplo();
  }
  function lerRegras() {
    const mult = Number($('r-mult').value) || 1;
    return {
      ativo: $('r-ativo').checked,
      reaisPorPonto: lerNum($('r-reais').value), valorPonto: lerNum($('r-valor').value),
      minimoResgate: Math.max(0, Math.floor(Number($('r-minimo').value) || 0)),
      validadeMeses: Number($('r-validade').value) || 0,
      bonusPrimeiraCompra: Math.max(0, Math.floor(Number($('r-bonus').value) || 0)),
      campanha: mult > 1 ? { multiplicador: mult, inicio: $('r-inicio').value, fim: $('r-fim').value } : {}
    };
  }
  function exemplo() {
    const r = lerRegras();
    $('r-campos').classList.toggle('desativado', !r.ativo);
    if (!r.reaisPorPonto || !r.valorPonto) { $('r-exemplo').textContent = 'Preencha os valores.'; return; }
    const pontos = Math.floor(200 / r.reaisPorPonto);
    const volta = (r.valorPonto / r.reaisPorPonto) * 100;
    $('r-exemplo').innerHTML = `Compra de <strong>R$ 200,00</strong> → <strong>${pontos} pontos</strong> = ${r$(pontos * r.valorPonto)} de desconto depois (<strong>${fmt(volta, 1)}% de volta</strong>). Usa a partir de ${r.minimoResgate} pontos (${r$(r.minimoResgate * r.valorPonto)}).${r.validadeMeses ? ` Vencem em ${r.validadeMeses} meses.` : ''}`;
  }
  document.querySelectorAll('#form-regras input, #form-regras select').forEach((i) => { i.addEventListener('input', exemplo); i.addEventListener('change', exemplo); });
  $('form-regras').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const r = lerRegras();
    if (r.ativo && (r.reaisPorPonto <= 0 || r.valorPonto <= 0)) return App.toast('Preencha quanto vale cada ponto e a cada quantos reais a cliente ganha 1 ponto.', 'erro');
    if (r.ativo && r.valorPonto / r.reaisPorPonto > 0.3) return App.toast('Mais de 30% de volta? Confira os valores.', 'erro');
    if (r.campanha.multiplicador && (!r.campanha.inicio || !r.campanha.fim || r.campanha.fim < r.campanha.inicio)) return App.toast('Informe as datas da campanha (o fim depois do início).', 'erro');
    try {
      await Data.salvarLoja({ fidelidade: r });
      App.toast(r.ativo ? 'Regras salvas.' : 'Programa desligado. Os pontos das clientes ficam guardados.', 'sucesso');
      await carregar();
    } catch (er) { App.toast(er.message, 'erro'); }
  });

  /* ---------- Eventos ---------- */
  document.querySelectorAll('#abas [data-aba]').forEach((b) => b.addEventListener('click', () => trocarAba(b.dataset.aba)));
  document.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
    filtro = b.dataset.filtro;
    document.querySelectorAll('[data-filtro]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    desenharClientes(); App.icones();
  }));
  $('busca').addEventListener('input', () => { desenharClientes(); App.icones(); });
  $('btn-ajuste').addEventListener('click', () => abrirAjuste());
  window.addEventListener('dados-alterados', carregar);

  await carregar();
  preencherRegras();
  if (location.hash === '#regras' || !painel.ativo && !painel.clientes.length) trocarAba('regras');
});
