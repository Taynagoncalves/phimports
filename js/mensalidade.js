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

    // ======================= VISUAL PREMIUM =======================
    const diaV = String((assinatura && assinatura.diaVencimento) || 10).padStart(2, '0');
    const estado = pendencias.length ? (temAtraso ? 'atraso' : 'aberto') : informados.length ? 'informado' : 'emdia';
    const rotuloEstado = { atraso: 'Em atraso', aberto: 'A pagar', informado: 'Aguardando confirmação', emdia: 'Tudo em dia' }[estado];
    const iconeEstado = { atraso: 'circle-alert', aberto: 'clock', informado: 'hourglass', emdia: 'badge-check' }[estado];
    const proximaData = primeiraFutura || (proximo ? `${proximo}-${diaV}` : null);
    const proximoValor = primeiraFutura ? Data.valorDaMensalidade(assinatura, inicioCobranca) : (proximo ? Data.valorDaMensalidade(assinatura, proximo) : 0);
    const valorTopo = pendencias.length ? totalPendente : informados.length ? informados.reduce((s, i) => s + i.valor, 0) : proximoValor;
    const legendaTopo = pendencias.length ? 'em aberto' : informados.length ? 'informado' : primeiraFutura ? '1ª mensalidade' : 'próxima mensalidade';

    // Anel: dias para vencer (ou de atraso) da conta mais urgente
    const maisUrgente = listaMeses.filter((x) => x.status === 'atrasado' || x.status === 'aberto').sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
    const alvoData = maisUrgente ? maisUrgente.vencimento : proximaData;
    const dias = alvoData ? diasEntre(hoje(), alvoData) : null;
    const frac = dias === null ? 1 : dias < 0 ? 1 : Math.max(0.04, Math.min(1, 1 - dias / 30));
    const R = 52, CIRC = 2 * Math.PI * R;
    const anel = `
      <div class="m3-anel ${dias !== null && dias < 0 ? 'atraso' : ''}">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="${R}" class="trilha"/>
          <circle cx="60" cy="60" r="${R}" class="progresso" style="--circ:${CIRC.toFixed(1)};--alvo:${(CIRC * (1 - frac)).toFixed(1)}"/>
        </svg>
        <div class="m3-anel-texto">
          ${estado === 'emdia' && dias === null ? '<i data-lucide="check"></i><small>em dia</small>'
          : dias === null ? '<strong>—</strong>'
          : dias < 0 ? `<strong>${-dias}</strong><small>dia${dias === -1 ? '' : 's'} de atraso</small>`
          : dias === 0 ? '<strong>Hoje</strong><small>vence hoje</small>'
          : `<strong>${dias}</strong><small>dia${dias === 1 ? '' : 's'} para vencer</small>`}
        </div>
      </div>`;

    const topo = `
      <section class="m3-hero ${estado}">
        <div class="m3-hero-brilho" aria-hidden="true"></div>
        <div class="m3-hero-esq">
          <span class="m3-marca"><i data-lucide="gem"></i>Plano do sistema${lojaNome ? ' · ' + App.escapeHtml(lojaNome) : ''}</span>
          <span class="m3-estado"><i data-lucide="${iconeEstado}"></i>${rotuloEstado}</span>
          <div class="m3-valor"><span class="m3-contar" data-valor="${valorTopo}">${moeda(valorTopo)}</span><small>${legendaTopo}</small></div>
          <p class="m3-sub">${pendencias.length ? pendencias.map((p) => p.titulo).join(' · ')
            : informados.length ? 'Recebemos o seu aviso. O suporte confere o Pix e confirma em breve.'
            : proximaData ? `Vence em ${App.formatarData(proximaData)}. Você será avisado aqui.` : 'Nenhum pagamento pendente.'}</p>
          ${pendencias.length ? '<a href="#pagar" class="m3-btn"><i data-lucide="qr-code"></i>Pagar com Pix</a>' : ''}
        </div>
        ${anel}
      </section>`;

    // Linha do ano: últimos meses + o próximo
    const mapa = Object.fromEntries(listaMeses.map((x) => [x.competencia, x]));
    const comecoLinha = assinatura && assinatura.inicio && assinatura.inicio > somarMes(mesAtual(), -8) ? assinatura.inicio : somarMes(mesAtual(), -8);
    const linha = [];
    for (let c = comecoLinha; c <= somarMes(mesAtual(), 2); c = somarMes(c, 1)) {
      const x = mapa[c];
      const pago = pagamentos.find((pg) => pg.competencia === c);
      linha.push({ c, st: pago ? 'pago' : x ? x.status : (c > mesAtual() ? 'futuro' : 'pago-fora') });
    }
    const iconeMes = { pago: 'check', informado: 'hourglass', atrasado: 'x', aberto: 'clock', futuro: 'calendar', 'pago-fora': 'minus' };
    const linhaAno = cobrancaAtiva ? `
      <section class="card m3-ano">
        <div class="m3-titulo-secao"><h2>Linha do tempo</h2><span>${pagamentos.filter((pg) => pg.competencia !== 'implantacao').length} mensalidade${pagamentos.length === 1 ? '' : 's'} paga${pagamentos.length === 1 ? '' : 's'}</span></div>
        <ol class="m3-meses">
          ${linha.map((x) => `
            <li class="m3-mes ${x.st} ${x.c === mesAtual() ? 'atual' : ''}" title="${nomeMes(x.c)}">
              <span class="m3-mes-bola"><i data-lucide="${iconeMes[x.st]}"></i></span>
              <span class="m3-mes-nome">${nomeMes(x.c, true)}</span>
            </li>`).join('')}
        </ol>
      </section>` : '';

    // Pagar em 3 passos: escolher → pagar → avisar
    const passoAtual = totalMarcado > 0 ? 2 : 1;
    const blocoPagar = pendencias.length ? `
      <section class="card m3-pagar" id="pagar">
        <ol class="m3-passos">
          <li class="${passoAtual >= 1 ? 'feito' : ''}"><span>1</span>Escolha</li>
          <li class="${passoAtual >= 2 ? 'feito' : ''}"><span>2</span>Pague com Pix</li>
          <li><span>3</span>Avise que pagou</li>
        </ol>
        <div class="m3-pagar-corpo">
          <div class="m3-itens">
            ${pendencias.map((p) => `
              <label class="m3-item ${selecionados.has(p.id) ? 'marcada' : ''} ${p.tom === 'perigo' ? 'atrasada' : ''}">
                <input type="checkbox" data-pendencia="${p.id}" ${selecionados.has(p.id) ? 'checked' : ''}>
                <span class="m3-check" aria-hidden="true"><i data-lucide="check"></i></span>
                <span class="m3-item-info"><strong>${p.titulo}</strong><small>${p.detalhe}</small></span>
                <span class="m3-item-valor">${moeda(p.valor)}</span>
              </label>`).join('')}
            <div class="m3-total"><span>Total selecionado</span><strong>${moeda(totalMarcado)}</strong></div>
          </div>
          <div class="m3-ticket">
            ${totalMarcado <= 0 ? '<div class="m3-ticket-vazio"><i data-lucide="mouse-pointer-click"></i><span>Marque o que vai pagar para gerar o Pix.</span></div>'
            : codigo ? `
              <div class="m3-ticket-topo"><span>Pix</span><strong>${moeda(totalMarcado)}</strong></div>
              <div class="m3-qr">${Pix.qrSvg(codigo, 6)}</div>
              <div class="m3-corte" aria-hidden="true"></div>
              <p class="m3-ticket-dica">Banco → <strong>Pix</strong> → <strong>Ler QR Code</strong> ou <strong>Copia e cola</strong><br><span>Recebedor: ${App.escapeHtml(pix.nome || '')}</span></p>
              <div class="m2-copia">
                <input class="input mono" id="pix-copia" readonly value="${App.escapeHtml(codigo)}" aria-label="Pix copia e cola">
                <button type="button" class="btn btn-secundario" id="btn-copiar"><i data-lucide="copy"></i><span>Copiar</span></button>
              </div>
              <button type="button" class="btn btn-primario btn-bloco btn-grande" id="btn-ja-paguei"><i data-lucide="check-check"></i>Já paguei</button>`
            : '<div class="alerta"><i data-lucide="triangle-alert"></i><span>A chave Pix do suporte ainda não foi configurada. Fale com o suporte para pagar.</span></div>'}
          </div>
        </div>
      </section>` : '';

    // Plano (com a barra da promoção) + pagamentos
    const plano = (() => {
      if (!cobrancaAtiva) return '<section class="card m3-plano"><h2>Seu plano</h2><p class="texto-sm texto-3">Sem mensalidade ativa.</p></section>';
      const fim = Data.fimDaPromocao(assinatura);
      const ref = mesAtual() < inicioCobranca ? inicioCobranca : mesAtual();
      const emPromo = fim && ref <= fim;
      const totalPromo = Number(assinatura.mesesPromocionais) || 0;
      let mesPromo = 0;
      if (emPromo && totalPromo) { for (let c = inicioCobranca; c <= ref; c = somarMes(c, 1)) mesPromo++; }
      return `
        <section class="card m3-plano">
          <h2>Seu plano</h2>
          <div class="m3-plano-valor">${moeda(Data.valorDaMensalidade(assinatura, ref))}<small>/mês</small></div>
          <span class="texto-sm texto-3">Vence todo dia ${assinatura.diaVencimento}</span>
          ${emPromo && totalPromo ? `
            <div class="m3-promo">
              <div class="m3-promo-topo"><span><i data-lucide="sparkles"></i>Preço promocional</span><span>mês ${Math.min(mesPromo, totalPromo)} de ${totalPromo}</span></div>
              <div class="m3-barra"><span style="--p:${Math.min(100, (mesPromo / totalPromo) * 100)}%"></span></div>
              <small>Depois de ${nomeMes(fim).toLowerCase()}: ${moeda(assinatura.valor)}/mês</small>
            </div>` : ''}
          ${implantacao.status !== 'sem' ? `<div class="m3-impl"><span>Implantação</span><strong>${moeda(implantacao.valor)}</strong><span class="m3-tag ${implantacao.status}">${{ paga: 'paga', informada: 'informada', pendente: 'pendente' }[implantacao.status]}</span></div>` : ''}
          <ul class="m3-recursos">
            <li><i data-lucide="scan-barcode"></i>Caixa e vendas</li>
            <li><i data-lucide="package"></i>Estoque e etiquetas</li>
            <li><i data-lucide="store"></i>Catálogo online</li>
            <li><i data-lucide="cloud"></i>Nuvem com backup</li>
            <li><i data-lucide="refresh-cw"></i>Atualizações</li>
            <li><i data-lucide="headset"></i>Suporte</li>
          </ul>
          ${assinatura.observacao ? `<p class="texto-xs texto-3">${App.escapeHtml(assinatura.observacao)}</p>` : ''}
        </section>`;
    })();
    const historicoHtml = `
      <section class="card m3-historico">
        <h2>Pagamentos</h2>
        ${pagamentos.length ? `<ul>${[...pagamentos].sort((a, b) => String(b.pagoEm).localeCompare(String(a.pagoEm))).slice(0, 8).map((pg) => `
          <li><span class="m3-hist-icone"><i data-lucide="check"></i></span><span class="m3-hist-info"><strong>${pg.competencia === 'implantacao' ? 'Implantação do sistema' : nomeMes(pg.competencia)}</strong><small>Pago em ${App.formatarData(pg.pagoEm)} · ${pg.forma === 'pix' ? 'Pix' : App.escapeHtml(pg.forma || '')}</small></span><strong class="m3-hist-valor">${moeda(pg.valor)}</strong></li>`).join('')}</ul>`
        : '<div class="m3-hist-vazio"><i data-lucide="receipt"></i><span>Seus pagamentos confirmados aparecem aqui.</span></div>'}
      </section>`;

    el.innerHTML = `
      ${topo}
      ${linhaAno}
      ${blocoPagar}
      <div class="m3-baixo">${plano}${historicoHtml}</div>`;

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
