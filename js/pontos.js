/* ==========================================================================
   pontos.js — Programa de pontos: liga/desliga, regras em frases simples,
   números, clientes (saldo, vencimento, WhatsApp, ajuste) e extrato
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

  const fid = () => ({ ativo: false, reaisPorPonto: 1, valorPonto: 0.05, minimoResgate: 100, validadeMeses: 0, bonusPrimeiraCompra: 0, campanha: {}, ...(loja.fidelidade || {}) });

  async function carregar() {
    [painel, loja] = await Promise.all([Data.painelPontos(), Data.obterLoja()]);
    mostrar();
  }

  /* ---------- O que aparece na tela ---------- */
  function mostrar() {
    const ativo = !!fid().ativo;
    const temDados = painel.clientes.length > 0;
    $('pt-ativo').checked = ativo;
    $('pt-chave-texto').textContent = ativo ? 'Ligado' : 'Desligado';
    $('pt-ativo').closest('.pt-chave').classList.toggle('ligado', ativo);
    $('pt-intro').hidden = ativo;
    const comPainel = ativo || temDados;
    $('pt-painel').hidden = !comPainel;
    if (!comPainel) aba = 'regras';
    ['clientes', 'extrato', 'regras'].forEach((a) => { $(`painel-${a}`).hidden = a !== aba; });
    document.querySelectorAll('#abas [data-aba]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.aba === aba)));
    if (comPainel) desenharTopo();
    if (aba === 'clientes') desenharClientes();
    if (aba === 'extrato') desenharExtrato();
    textosIntro();
    App.icones();
  }

  function desenharTopo() {
    const t = painel.totais;
    const c = painel.campanha;
    $('pt-aviso').innerHTML = c ? `<div class="alerta info mb-4"><i data-lucide="sparkles"></i><span><strong>Pontos ${c.multiplicador === 2 ? 'em dobro' : 'em triplo'}</strong> até ${App.formatarData(c.fim + 'T12:00:00')} — avise as clientes!</span></div>` : '';
    const card = (rotulo, icone, valor, detalhe) => `
      <article class="card stat">
        <div class="stat-topo"><span class="stat-rotulo">${rotulo}</span><span class="stat-icone"><i data-lucide="${icone}"></i></span></div>
        <div class="stat-valor">${valor}</div>
        <div class="stat-detalhe">${detalhe}</div>
      </article>`;
    $('indicadores').innerHTML =
      card('Clientes com pontos', 'users', n(t.clientes), `${painel.clientes.filter((x) => x.podeUsar).length} já podem usar`)
      + card('Pontos em aberto', 'star', n(t.saldo), `valem ${r$(t.saldoValor)} em desconto`)
      + card('Dados este mês', 'trending-up', n(t.dadosMes), `${n(t.usadosMes)} usados (${r$(t.usadosMesValor)})`)
      + card('Vencem em 30 dias', 'hourglass', n(t.vencendo), t.vencendo ? `${t.clientesVencendo} cliente(s) — bom motivo para chamar` : (fid().validadeMeses ? 'nada vencendo' : 'os pontos não vencem'));
    $('cont-clientes').textContent = painel.clientes.length;
  }

  function trocarAba(nova) { aba = nova; mostrar(); }

  /* ---------- Liga / desliga ---------- */
  async function definirAtivo(ativo) {
    try {
      const atual = lerRegras();
      if (ativo && (!atual.reaisPorPonto || !atual.valorPonto)) { $('pt-ativo').checked = false; trocarAba('regras'); return App.toast('Preencha as regras antes de ligar.', 'erro'); }
      loja = await Data.salvarLoja({ fidelidade: { ...atual, ativo } });
      App.toast(ativo ? 'Programa de pontos ligado! As clientes cadastradas já ganham pontos nas compras.' : 'Programa desligado. Os pontos das clientes ficam guardados.', 'sucesso', 5000);
      await carregar();
    } catch (er) { App.toast(er.message, 'erro'); $('pt-ativo').checked = !ativo; }
  }
  $('pt-ativo').addEventListener('change', () => definirAtivo($('pt-ativo').checked));
  $('btn-ligar').addEventListener('click', () => definirAtivo(true));

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
      compra: () => `Compra #${m.numero}${m.mult > 1 ? ` <span class="badge badge-info">${m.mult}×</span>` : ''}${m.bonus ? ` <span class="badge badge-sucesso">+${m.bonus} boas-vindas</span>` : ''}`,
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

  /* ---------- Regras (em frases) ---------- */
  const lerNum = (v) => Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;
  const fmt = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function preencherRegras() {
    const f = fid();
    const bloco = Number(f.blocoPontos) || 100;
    $('r-reais').value = fmt(f.reaisPorPonto);
    $('r-bloco').value = bloco;
    $('r-desconto').value = fmt(f.descontoBloco ?? Math.round(f.valorPonto * bloco * 100) / 100);
    $('r-minimo').value = f.minimoResgate;
    $('r-validade').value = String(f.validadeMeses || 0);
    $('x-bonus').checked = Number(f.bonusPrimeiraCompra) > 0;
    $('r-bonus').value = Number(f.bonusPrimeiraCompra) > 0 ? f.bonusPrimeiraCompra : 50;
    const c = f.campanha || {};
    $('x-campanha').checked = Number(c.multiplicador) > 1;
    $('r-mult').value = String(Number(c.multiplicador) > 1 ? c.multiplicador : 2);
    $('r-inicio').value = c.inicio || '';
    $('r-fim').value = c.fim || '';
    atualizarRegras();
  }
  function lerRegras() {
    const bloco = Math.max(1, Math.floor(Number($('r-bloco').value) || 0));
    const desconto = lerNum($('r-desconto').value);
    return {
      ativo: !!fid().ativo,
      reaisPorPonto: lerNum($('r-reais').value),
      blocoPontos: bloco, descontoBloco: desconto,
      valorPonto: bloco ? desconto / bloco : 0,
      minimoResgate: Math.max(0, Math.floor(Number($('r-minimo').value) || 0)),
      validadeMeses: Number($('r-validade').value) || 0,
      bonusPrimeiraCompra: $('x-bonus').checked ? Math.max(0, Math.floor(Number($('r-bonus').value) || 0)) : 0,
      campanha: $('x-campanha').checked ? { multiplicador: Number($('r-mult').value) || 2, inicio: $('r-inicio').value, fim: $('r-fim').value } : {}
    };
  }
  function atualizarRegras() {
    $('x-bonus-campos').hidden = !$('x-bonus').checked;
    $('x-campanha-campos').hidden = !$('x-campanha').checked;
    const r = lerRegras();
    if (!r.reaisPorPonto || !r.valorPonto) {
      ['ex-pontos', 'ex-desconto'].forEach((id) => { $(id).textContent = '—'; });
      $('ex-volta').textContent = 'Preencha os valores';
    } else {
      const pontos = Math.floor(200 / r.reaisPorPonto + 1e-9);
      $('ex-pontos').textContent = `${n(pontos)} pontos`;
      $('ex-desconto').textContent = r$(pontos * r.valorPonto);
      $('ex-volta').textContent = `${(r.valorPonto / r.reaisPorPonto * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% de volta`;
    }
    textosIntro(r);
  }
  function textosIntro(r = lerRegras()) {
    $('pi-1').textContent = r.reaisPorPonto ? `A cada ${r$(r.reaisPorPonto)} ganha 1 ponto` : '—';
    $('pi-3').textContent = r.blocoPontos && r.descontoBloco ? `${n(r.blocoPontos)} pontos = ${r$(r.descontoBloco)}` : '—';
  }
  document.querySelectorAll('#form-regras input, #form-regras select').forEach((i) => {
    i.addEventListener('input', () => { atualizarRegras(); $('r-status').textContent = 'Alterações não salvas'; });
    i.addEventListener('change', () => { atualizarRegras(); $('r-status').textContent = 'Alterações não salvas'; });
  });
  $('form-regras').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const r = lerRegras();
    if (r.reaisPorPonto <= 0 || r.valorPonto <= 0) return App.toast('Preencha os valores das regras.', 'erro');
    if (r.valorPonto / r.reaisPorPonto > 0.3) return App.toast('Mais de 30% de volta? Confira os valores.', 'erro');
    if (r.campanha.multiplicador && (!r.campanha.inicio || !r.campanha.fim || r.campanha.fim < r.campanha.inicio)) return App.toast('Informe as datas dos pontos em dobro (o fim depois do início).', 'erro');
    if ($('x-bonus').checked && !r.bonusPrimeiraCompra) return App.toast('Informe quantos pontos de boas-vindas.', 'erro');
    try {
      loja = await Data.salvarLoja({ fidelidade: r });
      $('r-status').textContent = '✓ Regras salvas';
      App.toast('Regras salvas.', 'sucesso');
      painel = await Data.painelPontos();
      mostrar();
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

  [painel, loja] = await Promise.all([Data.painelPontos(), Data.obterLoja()]);
  preencherRegras();
  if (location.hash === '#regras') aba = 'regras';
  mostrar();
});
