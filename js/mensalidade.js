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
    for (let c = somarMes(mesAtual(), -11); c <= mesAtual(); c = somarMes(c, 1)) {
      if (c < inicio) continue;
      const venc = `${c}-${String(assinatura.diaVencimento || 10).padStart(2, '0')}`;
      const pago = pagamentos.find((p) => p.competencia === c);
      const aviso = avisos.find((a) => a.competencia === c && a.status === 'pendente');
      const atraso = diasEntre(venc, hoje());
      lista.push({ competencia: c, vencimento: venc, valor: assinatura.valor, status: pago ? 'pago' : aviso ? 'informado' : atraso > 0 ? 'atrasado' : 'aberto', diasAtraso: Math.max(0, atraso), diasParaVencer: Math.max(0, -atraso), pagamento: pago });
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

    if (!assinatura || (!listaMeses.length && implantacao.status === 'sem')) {
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

    const resumo = pendencias.length ? `
      <section class="mens-resumo ${temAtraso ? 'perigo' : 'alerta'}">
        <span class="mens-resumo-icone"><i data-lucide="${temAtraso ? 'circle-alert' : 'clock'}"></i></span>
        <div class="mens-resumo-texto">
          <strong>${temAtraso ? 'Você tem pagamento em atraso' : `Você tem ${pendencias.length} pagamento${pendencias.length === 1 ? '' : 's'} em aberto`}</strong>
          <span>${pendencias.map((p) => p.titulo).join(' · ')}</span>
        </div>
        <div class="mens-resumo-total"><span>Total</span><strong>${moeda(totalPendente)}</strong></div>
        <a href="#pagar" class="btn btn-primario">Pagar agora</a>
      </section>` : `
      <section class="mens-resumo sucesso">
        <span class="mens-resumo-icone"><i data-lucide="${informados.length ? 'hourglass' : 'badge-check'}"></i></span>
        <div class="mens-resumo-texto">
          <strong>${informados.length ? 'Pagamento informado — aguardando confirmação' : 'Tudo em dia!'}</strong>
          <span>${informados.length ? 'O suporte vai conferir o Pix e confirmar em breve.' : (proximo ? `Próxima mensalidade: ${moeda(assinatura.valor)} em ${App.formatarData(`${proximo}-${String(assinatura.diaVencimento).padStart(2, '0')}`)}.` : 'Nenhum pagamento pendente.')}</span>
        </div>
      </section>`;

    const blocoPendencias = pendencias.length ? `
      <section class="card" id="pagar">
        <div class="card-cabecalho"><h2>O que pagar</h2><span class="texto-sm texto-3">Marque o que vai pagar agora</span></div>
        <ul class="mens-pendencias">
          ${pendencias.map((p) => `
            <li>
              <label class="mens-pendencia ${selecionados.has(p.id) ? 'marcada' : ''}">
                <input type="checkbox" data-pendencia="${p.id}" ${selecionados.has(p.id) ? 'checked' : ''}>
                <span class="mens-pendencia-info"><strong>${p.titulo}</strong><span class="${p.tom === 'perigo' ? 'valor-negativo' : 'texto-3'}">${p.detalhe}</span></span>
                <span class="mens-pendencia-valor">${moeda(p.valor)}</span>
              </label>
            </li>`).join('')}
        </ul>
        <div class="mens-total-marcado"><span>Total a pagar</span><strong>${moeda(totalMarcado)}</strong></div>
      </section>` : '';

    const blocoPix = pendencias.length ? `
      <section class="card card-corpo mens-pix">
        ${totalMarcado <= 0 ? '<div class="vazio"><div class="vazio-icone"><i data-lucide="mouse-pointer-click"></i></div><h3>Marque o que vai pagar</h3><p>O Pix é gerado com o valor do que estiver marcado.</p></div>'
        : codigo ? `
          <div class="flex items-center justify-between gap-3"><h2 class="flex items-center gap-2"><i data-lucide="qr-code"></i>Pagar com Pix</h2><span class="mens-pix-valor">${moeda(totalMarcado)}</span></div>
          <div class="pix-qr">${Pix.qrSvg(codigo, 6)}</div>
          <ol class="mens-passos">
            <li>Abra o app do seu banco e entre em <strong>Pix</strong>.</li>
            <li>Escolha <strong>Ler QR Code</strong> e aponte para o código, ou <strong>Pix copia e cola</strong> e cole o código abaixo.</li>
            <li>Confira o valor e o recebedor (<strong>${App.escapeHtml(pix.nome || '')}</strong>) e confirme.</li>
          </ol>
          <div class="flex gap-2">
            <input class="input mono" id="pix-copia" readonly value="${App.escapeHtml(codigo)}" aria-label="Pix copia e cola" style="flex:1">
            <button type="button" class="btn btn-secundario" id="btn-copiar"><i data-lucide="copy"></i><span>Copiar</span></button>
          </div>
          <button type="button" class="btn btn-primario btn-bloco btn-grande mt-4" id="btn-ja-paguei"><i data-lucide="check-check"></i>Já paguei ${moeda(totalMarcado)}</button>
          <p class="texto-xs texto-3 texto-centro mt-2">Depois de pagar, clique em "Já paguei" para avisar o suporte.</p>`
        : '<div class="alerta"><i data-lucide="triangle-alert"></i><span>A chave Pix do suporte ainda não foi configurada. Fale com o suporte para pagar.</span></div>'}
      </section>` : '';

    const linhaTempo = listaMeses.length ? `
      <section class="card card-corpo">
        <h2 class="mb-4">Últimos meses</h2>
        <div class="mens-linha">
          ${listaMeses.slice(-6).map((x) => `
            <div class="mens-mes ${x.status}" title="${nomeMes(x.competencia)}: ${{ pago: 'paga', informado: 'pagamento informado', atrasado: 'atrasada', aberto: 'em aberto' }[x.status]}">
              <span class="mens-mes-ponto"><i data-lucide="${{ pago: 'check', informado: 'hourglass', atrasado: 'x', aberto: 'clock' }[x.status]}"></i></span>
              <strong>${nomeMes(x.competencia, true)}</strong>
              <span>${{ pago: 'Paga', informado: 'Informada', atrasado: 'Atrasada', aberto: 'Em aberto' }[x.status]}</span>
            </div>`).join('')}
        </div>
      </section>` : '';

    const plano = `
      <section class="card card-corpo mens-plano">
        <span class="texto-sm texto-3">Seu plano</span>
        ${listaMeses.length ? `<div class="mensalidade-valor">${moeda(assinatura.valor)}<small>/mês</small></div>
        <div class="texto-sm texto-2">Vence todo dia <strong>${assinatura.diaVencimento}</strong></div>` : '<div class="texto-sm texto-2 mt-2">Sem mensalidade ativa.</div>'}
        ${implantacao.status !== 'sem' ? `<div class="texto-sm texto-2 mt-2">Implantação: <strong>${moeda(implantacao.valor)}</strong> · ${{ paga: '<span class="valor-positivo">paga</span>', informada: 'informada', pendente: 'pendente' }[implantacao.status]}</div>` : ''}
        <ul class="mens-incluso">
          <li><i data-lucide="check"></i>Sistema completo: caixa, estoque, vendas e relatórios</li>
          <li><i data-lucide="check"></i>Dados guardados na nuvem, com backup</li>
          <li><i data-lucide="check"></i>Atualizações e melhorias</li>
          <li><i data-lucide="check"></i>Suporte</li>
        </ul>
        ${assinatura.observacao ? `<p class="texto-xs texto-3 mt-4">${App.escapeHtml(assinatura.observacao)}</p>` : ''}
      </section>`;

    const historicoHtml = `
      <section class="card">
        <div class="card-cabecalho"><h2>Histórico de pagamentos</h2><span class="texto-sm texto-3">${pagamentos.length} pagamento${pagamentos.length === 1 ? '' : 's'}</span></div>
        ${pagamentos.length ? `<ul class="lista">${pagamentos.map((p) => `
          <li class="lista-item">
            <span class="stat-icone" style="width:32px;height:32px;background:var(--cor-sucesso-suave);color:var(--cor-sucesso)"><i data-lucide="check"></i></span>
            <div class="info"><div class="titulo">${p.competencia === 'implantacao' ? 'Implantação do sistema' : nomeMes(p.competencia)}</div><div class="sub">Pago em ${App.formatarData(p.pagoEm)} · ${App.escapeHtml(p.forma === 'pix' ? 'Pix' : p.forma || '')}</div></div>
            <span class="valor">${moeda(p.valor)}</span>
          </li>`).join('')}</ul>`
        : '<p class="card-corpo texto-sm texto-3">Nenhum pagamento registrado ainda.</p>'}
      </section>`;

    el.innerHTML = `
      ${resumo}
      ${pendencias.length ? `<div class="mens-grade">${blocoPendencias}${blocoPix}</div>` : ''}
      <div class="mens-grade mens-grade-2">${linhaTempo || ''}${plano}</div>
      ${historicoHtml}`;

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
