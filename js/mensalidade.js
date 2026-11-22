/* ==========================================================================
   mensalidade.js — Mensalidade do sistema (lado da loja)
   Resumo da situação, pendências (implantação + meses em aberto) com um
   Pix único para o que estiver marcado, "Já paguei", últimos meses,
   plano e histórico. O suporte confirma o pagamento no painel.
   ========================================================================== */
App.aoIniciar(async () => {
  const el = document.getElementById('mensalidade');
  const moeda = App.formatarMoeda;
  const pix = window.PIX_SUPORTE || {};
  const hoje = () => new Date().toISOString().slice(0, 10);
  const mesAtual = () => hoje().slice(0, 7);
  const nomeMes = (c, curto = false) => {
    if (c === 'implantacao') return 'Implantação do sistema';
    const [a, m] = c.split('-').map(Number);
    const t = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', curto ? { month: 'short' } : { month: 'long', year: 'numeric' });
    return (t.charAt(0).toUpperCase() + t.slice(1)).replace('.', '');
  };
  const somarMes = (c, n) => { const [a, m] = c.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const diasEntre = (de, ate) => Math.round((new Date(ate + 'T12:00:00') - new Date(de + 'T12:00:00')) / 86400000);

  let selecionados = null; // ids das pendências marcadas (null = todas)
  const lojaNome = ((await Data.obterLoja()) || {}).nome || '';
  /** Comemoração rápida depois de avisar o pagamento */
  function comemorar() {
    const f = document.createElement('div');
    f.className = 'm3-festa';
    f.innerHTML = '<div class="m3-festa-cartao"><span class="m3-festa-check"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></span><strong>Aviso enviado!</strong><span>Obrigado. O suporte confirma o pagamento em breve.</span></div>';
    document.body.appendChild(f);
    setTimeout(() => f.classList.add('saindo'), 2200);
    setTimeout(() => f.remove(), 2700);
  }

  /** Situação de cada mês desde o início da cobrança (até 12 meses para trás) */
  function meses(assinatura, pagamentos, avisos) {
    if (!assinatura || assinatura.ativa === false || !(assinatura.valor > 0)) return [];
    const inicio = assinatura.inicio && /^\d{4}-\d{2}$/.test(assinatura.inicio) ? assinatura.inicio : mesAtual();
    const lista = [];
    const dia = String(assinatura.diaVencimento || 10).padStart(2, '0');
    for (let c = somarMes(mesAtual(), -11); c <= somarMes(mesAtual(), 1); c = somarMes(c, 1)) {
      if (c < inicio) continue;
      const venc = `${c}-${dia}`;
      // Meses futuros só aparecem quando faltam até 30 dias para vencer
      if (c > mesAtual() && diasEntre(hoje(), venc) > 30) continue;
      const pago = pagamentos.find((p) => p.competencia === c);
      const aviso = avisos.find((a) => a.competencia === c && a.status === 'pendente');
      const atraso = diasEntre(venc, hoje());
      lista.push({ competencia: c, vencimento: venc, valor: Data.valorDaMensalidade(assinatura, c), status: pago ? 'pago' : aviso ? 'informado' : atraso > 0 ? 'atrasado' : 'aberto', diasAtraso: Math.max(0, atraso), diasParaVencer: Math.max(0, -atraso), pagamento: pago });
    }
    return lista;
  }

  async function desenhar() {
    let m;
    try { m = await Data.obterMensalidade(); } catch (e) {
      el.innerHTML = `<div class="alerta"><i data-lucide="triangle-alert"></i><span>Não foi possível carregar a mensalidade agora. Tente de novo em instantes ou fale com o suporte.</span></div>`;
      App.icones();
      return;
    }
    const { assinatura, pagamentos, avisos, implantacao } = m;
    const listaMeses = meses(assinatura, pagamentos, avisos);

    const cobrancaAtiva = !!(assinatura && assinatura.ativa !== false && assinatura.valor > 0);
    const inicioCobranca = assinatura && assinatura.inicio ? assinatura.inicio : mesAtual();
    const primeiraFutura = cobrancaAtiva && !listaMeses.length ? `${inicioCobranca}-${String(assinatura.diaVencimento || 10).padStart(2, '0')}` : null;
    if (!assinatura || (!cobrancaAtiva && implantacao.status === 'sem')) {
      el.innerHTML = `<div class="card">${App.estadoVazio({ icone: 'badge-check', titulo: 'Nenhuma mensalidade cadastrada', texto: 'Quando o suporte cadastrar a mensalidade do sistema, ela aparece aqui com o Pix para pagamento.' })}</div>`;
      App.icones();
      return;
    }

    // Pendências: implantação + meses em aberto/atrasados (o mês atual só depois de aberto)
    const pendencias = [];
    if (implantacao.status === 'pendente') pendencias.push({ id: 'implantacao', titulo: 'Implantação do sistema', detalhe: 'Pagamento único', valor: implantacao.valor, tom: 'alerta' });
    listaMeses.filter((x) => x.status === 'atrasado' || x.status === 'aberto').forEach((x) => pendencias.push({
      id: x.competencia, titulo: `Mensalidade de ${nomeMes(x.competencia).toLowerCase()}`,
      detalhe: x.status === 'atrasado' ? `Venceu há ${x.diasAtraso} dia${x.diasAtraso === 1 ? '' : 's'} (${App.formatarData(x.vencimento)})` : (x.diasParaVencer === 0 ? 'Vence hoje' : `Vence em ${x.diasParaVencer} dia${x.diasParaVencer === 1 ? '' : 's'} (${App.formatarData(x.vencimento)})`),
      valor: x.valor, tom: x.status === 'atrasado' ? 'perigo' : 'alerta'
    }));
    const informados = [
      ...(implantacao.status === 'informada' ? [{ titulo: 'Implantação do sistema', valor: implantacao.valor }] : []),
      ...listaMeses.filter((x) => x.status === 'informado').map((x) => ({ titulo: `Mensalidade de ${nomeMes(x.competencia).toLowerCase()}`, valor: x.valor }))
    ];
    if (!selecionados) selecionados = new Set(pendencias.map((p) => p.id));
    const marcadas = pendencias.filter((p) => selecionados.has(p.id));
    const totalMarcado = marcadas.reduce((s, p) => s + p.valor, 0);
    const totalPendente = pendencias.reduce((s, p) => s + p.valor, 0);
    const temAtraso = pendencias.some((p) => p.tom === 'perigo');
    const proximo = listaMeses.length ? somarMes(mesAtual(), listaMeses.find((x) => x.competencia === mesAtual() && x.status === 'pago') ? 1 : 0) : null;

    // Pix único para o que está marcado
    let codigo = '';
    if (totalMarcado > 0 && pix.chave) {
      const ref = marcadas.length === 1 ? (marcadas[0].id === 'implantacao' ? 'IMPL' : marcadas[0].id.replace('-', '')) : `${marcadas.length}ITENS`;
      try { codigo = Pix.gerarCodigo({ chave: pix.chave, nome: pix.nome, cidade: pix.cidade, valor: totalMarcado, txid: `PH${ref}${String(m.lojaId).slice(-6)}`, descricao: marcadas.length === 1 ? marcadas[0].titulo : 'Mensalidade do sistema' }); } catch (e) { codigo = ''; }
    }

    // ======================= VISUAL LIMPO =======================
    const diaV = String((assinatura && assinatura.diaVencimento) || 10).padStart(2, '0');
    const estado = pendencias.length ? (temAtraso ? 'atraso' : 'aberto') : informados.length ? 'informado' : 'emdia';
    const rotuloEstado = { atraso: 'Em atraso', aberto: 'A pagar', informado: 'Aguardando confirmação', emdia: 'Tudo em dia' }[estado];
    const iconeEstado = { atraso: 'circle-alert', aberto: 'clock', informado: 'hourglass', emdia: 'circle-check' }[estado];
    const proximaData = primeiraFutura || (proximo ? `${proximo}-${diaV}` : null);
    const proximoValor = primeiraFutura ? Data.valorDaMensalidade(assinatura, inicioCobranca) : (proximo ? Data.valorDaMensalidade(assinatura, proximo) : 0);
    const valorTopo = pendencias.length ? totalPendente : informados.length ? informados.reduce((s, i) => s + i.valor, 0) : proximoValor;
    const legendaTopo = pendencias.length ? `em aberto · ${pendencias.length} ${pendencias.length === 1 ? 'item' : 'itens'}`
      : informados.length ? 'pagamento informado · o suporte confirma em breve'
      : primeiraFutura ? 'primeira mensalidade' : 'próxima mensalidade';

    // Data em destaque: a conta mais urgente (ou a próxima)
    const maisUrgente = listaMeses.filter((x) => x.status === 'atrasado' || x.status === 'aberto').sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
    const alvoData = maisUrgente ? maisUrgente.vencimento : proximaData;
    const dias = alvoData ? diasEntre(hoje(), alvoData) : null;
    const dataAlvo = alvoData ? new Date(alvoData + 'T12:00:00') : null;
    const calendario = dataAlvo ? `
      <div class="m4-data ${dias !== null && dias < 0 ? 'atraso' : ''}">
        <span class="m4-data-mes">${dataAlvo.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
        <strong>${dataAlvo.getDate()}</strong>
        <span class="m4-data-legenda">${dias < 0 ? `${-dias} dia${dias === -1 ? '' : 's'} de atraso` : dias === 0 ? 'vence hoje' : `em ${dias} dia${dias === 1 ? '' : 's'}`}</span>
      </div>` : '';

    // Meses (os últimos e o próximo) em bolinhas discretas
    const mapa = Object.fromEntries(listaMeses.map((x) => [x.competencia, x]));
    const comecoLinha = assinatura && assinatura.inicio && assinatura.inicio > somarMes(mesAtual(), -5) ? assinatura.inicio : somarMes(mesAtual(), -5);
    const linha = [];
    for (let c = comecoLinha; c <= somarMes(mesAtual(), 1); c = somarMes(c, 1)) {
      const x = mapa[c];
      const pago = pagamentos.find((pg) => pg.competencia === c);
      linha.push({ c, st: pago ? 'pago' : x ? x.status : (c > mesAtual() ? 'futuro' : 'pago-fora') });
    }
    const rotuloMes = { pago: 'paga', informado: 'informada', atrasado: 'atrasada', aberto: 'em aberto', futuro: 'a vencer', 'pago-fora': '—' };
    const mesesHtml = cobrancaAtiva ? `
      <ol class="m4-meses" aria-label="Mensalidades por mês">
        ${linha.map((x) => `<li class="${x.st} ${x.c === mesAtual() ? 'atual' : ''}" title="${nomeMes(x.c)}: ${rotuloMes[x.st]}"><span></span>${nomeMes(x.c, true)}</li>`).join('')}
      </ol>` : '';

    const topo = `
      <section class="card m4-resumo ${estado}">
        <div class="m4-resumo-corpo">
          <div class="m4-resumo-esq">
            <span class="m4-estado"><i data-lucide="${iconeEstado}"></i>${rotuloEstado}</span>
            <div class="m4-valor"><span class="m3-contar" data-valor="${valorTopo}">${moeda(valorTopo)}</span></div>
            <p class="m4-legenda">${legendaTopo}</p>
            ${pendencias.length ? '<a href="#pagar" class="btn btn-primario m4-btn-pagar"><i data-lucide="qr-code"></i>Pagar com Pix</a>' : ''}
          </div>
          ${calendario}
        </div>
        ${mesesHtml}
      </section>`;

    // Pagar: escolher o que pagar + Pix
    const blocoPagar = pendencias.length ? `
      <section class="card m4-pagar" id="pagar">
        <div class="m4-cabeca"><h2>Pagamento</h2><span>Marque o que vai pagar. O Pix sai com o total.</span></div>
        <div class="m4-pagar-corpo">
          <div class="m4-itens">
            ${pendencias.map((p) => `
              <label class="m4-item ${selecionados.has(p.id) ? 'marcada' : ''} ${p.tom === 'perigo' ? 'atrasada' : ''}">
                <input type="checkbox" data-pendencia="${p.id}" ${selecionados.has(p.id) ? 'checked' : ''}>
                <span class="m4-check" aria-hidden="true"><i data-lucide="check"></i></span>
                <span class="m4-item-info"><strong>${p.titulo}</strong><small>${p.detalhe}</small></span>
                <span class="m4-item-valor">${moeda(p.valor)}</span>
              </label>`).join('')}
            <div class="m4-total"><span>Total</span><strong>${moeda(totalMarcado)}</strong></div>
          </div>
          <div class="m4-pix">
            ${totalMarcado <= 0 ? '<div class="m4-pix-vazio"><i data-lucide="mouse-pointer-click"></i><span>Marque ao menos um item para gerar o Pix.</span></div>'
            : codigo ? `
              <div class="m4-qr">${Pix.qrSvg(codigo, 6)}</div>
              <p class="m4-pix-dica">Abra o app do banco → <strong>Pix</strong> → <strong>Ler QR Code</strong><br>ou use o <strong>Copia e cola</strong> abaixo.</p>
              <div class="m2-copia">
                <input class="input mono" id="pix-copia" readonly value="${App.escapeHtml(codigo)}" aria-label="Pix copia e cola">
                <button type="button" class="btn btn-secundario" id="btn-copiar"><i data-lucide="copy"></i><span>Copiar</span></button>
              </div>
              <button type="button" class="btn btn-primario btn-bloco btn-grande" id="btn-ja-paguei"><i data-lucide="check-check"></i>Já paguei ${moeda(totalMarcado)}</button>
              <span class="m4-recebedor">Recebedor: ${App.escapeHtml(pix.nomeRecibo || pix.nome || '')}</span>`
            : '<div class="alerta"><i data-lucide="triangle-alert"></i><span>A chave Pix do suporte ainda não foi configurada. Fale com o suporte para pagar.</span></div>'}
          </div>
        </div>
      </section>` : '';

    // Plano + pagamentos
    const plano = (() => {
      if (!cobrancaAtiva) return '<section class="card m4-bloco"><div class="m4-cabeca"><h2>Seu plano</h2></div><p class="texto-sm texto-3">Sem mensalidade ativa.</p></section>';
      const fim = Data.fimDaPromocao(assinatura);
      const ref = mesAtual() < inicioCobranca ? inicioCobranca : mesAtual();
      const emPromo = fim && ref <= fim;
      const totalPromo = Number(assinatura.mesesPromocionais) || 0;
      let mesPromo = 0;
      if (emPromo && totalPromo) { for (let c = inicioCobranca; c <= ref; c = somarMes(c, 1)) mesPromo++; }
      return `
        <section class="card m4-bloco">
          <div class="m4-cabeca"><h2>Seu plano</h2></div>
          <div class="m4-plano-valor">${moeda(Data.valorDaMensalidade(assinatura, ref))}<small>/mês</small></div>
          <dl class="m4-dados">
            <div><dt>Vencimento</dt><dd>todo dia ${assinatura.diaVencimento}</dd></div>
            ${emPromo && totalPromo ? `<div><dt>Preço promocional</dt><dd>mês ${Math.min(mesPromo, totalPromo)} de ${totalPromo}</dd></div>` : ''}
            ${emPromo && totalPromo ? `<div class="m4-barra-linha"><div class="m4-barra"><span style="--p:${Math.min(100, (mesPromo / totalPromo) * 100)}%"></span></div><small>Depois de ${nomeMes(fim).toLowerCase()}: ${moeda(assinatura.valor)}/mês</small></div>` : ''}
            ${implantacao.status !== 'sem' ? `<div><dt>Implantação</dt><dd>${moeda(implantacao.valor)} <span class="m4-tag ${implantacao.status}">${{ paga: 'paga', informada: 'informada', pendente: 'pendente' }[implantacao.status]}</span></dd></div>` : ''}
          </dl>
          <p class="m4-inclui"><i data-lucide="sparkles"></i>Inclui o sistema completo, catálogo online, dados na nuvem com backup, atualizações e suporte.</p>
          ${assinatura.observacao ? `<p class="texto-xs texto-3">${App.escapeHtml(assinatura.observacao)}</p>` : ''}
        </section>`;
    })();
    const historicoHtml = `
      <section class="card m4-bloco">
        <div class="m4-cabeca"><h2>Pagamentos</h2>${pagamentos.length ? `<span>${pagamentos.length} confirmado${pagamentos.length === 1 ? '' : 's'}</span>` : ''}</div>
        ${pagamentos.length ? `<ul class="m4-hist">${[...pagamentos].sort((a, b) => String(b.pagoEm).localeCompare(String(a.pagoEm))).slice(0, 8).map((pg) => `
          <li><span class="m4-hist-icone"><i data-lucide="check"></i></span><span class="m4-hist-info"><strong>${pg.competencia === 'implantacao' ? 'Implantação do sistema' : nomeMes(pg.competencia)}</strong><small>Pago em ${App.formatarData(pg.pagoEm)} · ${pg.forma === 'pix' ? 'Pix' : App.escapeHtml(pg.forma || '')}</small></span><strong>${moeda(pg.valor)}</strong></li>`).join('')}</ul>`
        : '<div class="m4-hist-vazio"><i data-lucide="receipt"></i><span>Seus pagamentos confirmados aparecem aqui.</span></div>'}
      </section>`;

    el.innerHTML = `
      ${topo}
      ${blocoPagar}
      <div class="m4-baixo">${plano}${historicoHtml}</div>`;

    // Valor do topo "contando" até o total (só na primeira vez)
    const contador = el.querySelector('.m3-contar');
    if (contador && !window.__mensContou && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.__mensContou = true;
      const alvo = Number(contador.dataset.valor) || 0;
      const t0 = performance.now();
      const passo = (t) => { const k = Math.min(1, (t - t0) / 900); contador.textContent = moeda(alvo * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(passo); };
      requestAnimationFrame(passo);
    }

    // Marcar/desmarcar pendências → recalcula o Pix
    el.querySelectorAll('[data-pendencia]').forEach((c) => c.addEventListener('change', () => {
      c.checked ? selecionados.add(c.dataset.pendencia) : selecionados.delete(c.dataset.pendencia);
      desenhar();
    }));
    document.getElementById('btn-copiar')?.addEventListener('click', async (e) => {
      const b = e.currentTarget;
      const campo = document.getElementById('pix-copia');
      try { await navigator.clipboard.writeText(campo.value); } catch (er) { campo.select(); document.execCommand('copy'); }
      b.querySelector('span').textContent = 'Copiado!';
      b.classList.add('copiado');
      setTimeout(() => { b.querySelector('span').textContent = 'Copiar'; b.classList.remove('copiado'); }, 2500);
      App.toast('Código Pix copiado! Cole no app do banco em "Pix copia e cola".', 'sucesso');
    });
    document.getElementById('btn-ja-paguei')?.addEventListener('click', async (e) => {
      const botao = e.currentTarget;   // depois do await o evento perde o currentTarget
      const ok = await App.confirmar({
        titulo: 'Avisar pagamento?',
        mensagem: `Confirme que você já pagou ${moeda(totalMarcado)} pelo Pix: ${marcadas.map((p) => p.titulo.toLowerCase()).join(', ')}.`,
        textoConfirmar: 'Sim, já paguei'
      });
      if (!ok) return;
      botao.disabled = true;
      try {
        for (const p of marcadas) await Data.informarPagamentoMensalidade(p.id);
        selecionados = null;
        comemorar();
        desenhar();
      } catch (er) { App.toast(er.message, 'erro'); botao.disabled = false; }
    });
    App.icones();
  }

  await desenhar();
});
