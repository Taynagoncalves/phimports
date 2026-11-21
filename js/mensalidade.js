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

    // ---------- Topo: situação em um cartão só ----------
    const diaV = String((assinatura && assinatura.diaVencimento) || 10).padStart(2, '0');
    const estado = pendencias.length ? (temAtraso ? 'atraso' : 'aberto') : informados.length ? 'informado' : 'emdia';
    const rotuloEstado = { atraso: 'Em atraso', aberto: 'A pagar', informado: 'Aguardando confirmação', emdia: 'Em dia' }[estado];
    const iconeEstado = { atraso: 'circle-alert', aberto: 'clock', informado: 'hourglass', emdia: 'badge-check' }[estado];
    const proximaData = primeiraFutura || (proximo ? `${proximo}-${diaV}` : null);
    const proximoValor = primeiraFutura ? Data.valorDaMensalidade(assinatura, inicioCobranca) : (proximo ? Data.valorDaMensalidade(assinatura, proximo) : 0);
    const topo = `
      <section class="card m2-topo ${estado}">
        <div class="m2-topo-esq">
          <span class="m2-estado"><i data-lucide="${iconeEstado}"></i>${rotuloEstado}</span>
          ${pendencias.length ? `
            <span class="m2-legenda">Total em aberto</span>
            <strong class="m2-valor">${moeda(totalPendente)}</strong>
            <span class="m2-sub">${pendencias.map((p) => p.titulo).join(' · ')}</span>`
          : informados.length ? `
            <span class="m2-legenda">Pagamento informado</span>
            <strong class="m2-valor">${moeda(informados.reduce((s, i) => s + i.valor, 0))}</strong>
            <span class="m2-sub">O suporte vai conferir o Pix e confirmar em breve.</span>`
          : `
            <span class="m2-legenda">${primeiraFutura ? '1ª mensalidade' : 'Próxima mensalidade'}</span>
            <strong class="m2-valor">${proximaData ? moeda(proximoValor) : '—'}</strong>
            <span class="m2-sub">${proximaData ? `Vence em ${App.formatarData(proximaData)}` : 'Nenhum pagamento pendente.'}</span>`}
        </div>
        ${pendencias.length ? '<a href="#pagar" class="btn btn-primario btn-grande"><i data-lucide="qr-code"></i>Pagar com Pix</a>' : ''}
      </section>`;

    // ---------- Pagar: o que pagar + Pix, num cartão só ----------
    const blocoPagar = pendencias.length ? `
      <section class="card m2-pagar" id="pagar">
        <div class="m2-itens">
          <h2>O que pagar</h2>
          <ul>
            ${pendencias.map((p) => `
              <li>
                <label class="m2-item ${selecionados.has(p.id) ? 'marcada' : ''}">
                  <input type="checkbox" data-pendencia="${p.id}" ${selecionados.has(p.id) ? 'checked' : ''}>
                  <span class="m2-item-info"><strong>${p.titulo}</strong><small class="${p.tom === 'perigo' ? 'valor-negativo' : ''}">${p.detalhe}</small></span>
                  <span class="m2-item-valor">${moeda(p.valor)}</span>
                </label>
              </li>`).join('')}
          </ul>
          <div class="m2-total"><span>Total</span><strong>${moeda(totalMarcado)}</strong></div>
        </div>
        <div class="m2-pix">
          ${totalMarcado <= 0 ? '<div class="m2-pix-vazio"><i data-lucide="mouse-pointer-click"></i><span>Marque o que vai pagar para gerar o Pix.</span></div>'
          : codigo ? `
            <div class="pix-qr m2-qr">${Pix.qrSvg(codigo, 6)}</div>
            <p class="m2-pix-dica">Abra o app do banco → <strong>Pix</strong> → <strong>Ler QR Code</strong> ou <strong>Copia e cola</strong>. Recebedor: ${App.escapeHtml(pix.nome || '')}.</p>
            <div class="m2-copia">
              <input class="input mono" id="pix-copia" readonly value="${App.escapeHtml(codigo)}" aria-label="Pix copia e cola">
              <button type="button" class="btn btn-secundario" id="btn-copiar"><i data-lucide="copy"></i><span>Copiar</span></button>
            </div>
            <button type="button" class="btn btn-primario btn-bloco btn-grande" id="btn-ja-paguei"><i data-lucide="check-check"></i>Já paguei ${moeda(totalMarcado)}</button>`
          : '<div class="alerta"><i data-lucide="triangle-alert"></i><span>A chave Pix do suporte ainda não foi configurada. Fale com o suporte para pagar.</span></div>'}
        </div>
      </section>` : '';

    // ---------- Plano + histórico ----------
    const plano = `
      <section class="card m2-plano">
        <h2>Seu plano</h2>
        ${cobrancaAtiva ? (() => {
          const fim = Data.fimDaPromocao(assinatura);
          const ref = mesAtual() < inicioCobranca ? inicioCobranca : mesAtual();
          const emPromo = fim && ref <= fim;
          return `<div class="m2-plano-valor">${moeda(Data.valorDaMensalidade(assinatura, ref))}<small>/mês</small></div>
            <dl class="m2-dados">
              <div><dt>Vencimento</dt><dd>Todo dia ${assinatura.diaVencimento}</dd></div>
              ${emPromo ? `<div><dt>Promoção</dt><dd>Até ${nomeMes(fim).toLowerCase()} · depois ${moeda(assinatura.valor)}</dd></div>` : ''}
              ${implantacao.status !== 'sem' ? `<div><dt>Implantação</dt><dd>${moeda(implantacao.valor)} · ${{ paga: 'paga', informada: 'informada', pendente: 'pendente' }[implantacao.status]}</dd></div>` : ''}
            </dl>`;
        })() : '<p class="texto-sm texto-3">Sem mensalidade ativa.</p>'}
        <p class="m2-incluso">Inclui o sistema completo, dados na nuvem com backup, atualizações e suporte.</p>
        ${assinatura.observacao ? `<p class="texto-xs texto-3">${App.escapeHtml(assinatura.observacao)}</p>` : ''}
      </section>`;
    const rotuloMes = { pago: 'Paga', informado: 'Informada', atrasado: 'Atrasada', aberto: 'Em aberto' };
    const historicoHtml = `
      <section class="card m2-historico">
        <h2>Pagamentos</h2>
        ${listaMeses.length ? `<div class="m2-meses">${listaMeses.slice(-6).map((x) => `<span class="m2-mes ${x.status}" title="${nomeMes(x.competencia)}: ${rotuloMes[x.status].toLowerCase()}">${nomeMes(x.competencia, true)}</span>`).join('')}</div>` : ''}
        ${pagamentos.length ? `<ul class="m2-lista">${[...pagamentos].sort((a, b) => String(b.pagoEm).localeCompare(String(a.pagoEm))).slice(0, 8).map((p) => `
          <li><span>${p.competencia === 'implantacao' ? 'Implantação' : nomeMes(p.competencia)}<small>Pago em ${App.formatarData(p.pagoEm)}</small></span><strong>${moeda(p.valor)}</strong></li>`).join('')}</ul>`
        : '<p class="texto-sm texto-3">Nenhum pagamento registrado ainda.</p>'}
      </section>`;

    el.innerHTML = `
      ${topo}
      ${blocoPagar}
      <div class="m2-baixo">${plano}${historicoHtml}</div>`;

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
      const ok = await App.confirmar({
        titulo: 'Avisar pagamento?',
        mensagem: `Confirme que você já pagou ${moeda(totalMarcado)} pelo Pix: ${marcadas.map((p) => p.titulo.toLowerCase()).join(', ')}.`,
        textoConfirmar: 'Sim, já paguei'
      });
      if (!ok) return;
      e.currentTarget.disabled = true;
      try {
        for (const p of marcadas) await Data.informarPagamentoMensalidade(p.id);
        selecionados = null;
        App.toast('Aviso enviado ao suporte. Obrigado!', 'sucesso');
        desenhar();
      } catch (er) { App.toast(er.message, 'erro'); e.currentTarget.disabled = false; }
    });
    App.icones();
  }

  await desenhar();
});
