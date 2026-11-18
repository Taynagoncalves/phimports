/* ==========================================================================
   mensalidade.js — Mensalidade do sistema (lado da loja)
   Mostra valor, vencimento e situação do mês, gera o Pix (QR + copia e cola)
   com a chave do suporte e deixa o dono avisar "Já paguei".
   O suporte confirma o pagamento no painel (admin.html).
   ========================================================================== */
App.aoIniciar(async () => {
  const el = document.getElementById('mensalidade');
  const moeda = App.formatarMoeda;
  const nomeMes = (c) => {
    const [a, m] = c.split('-').map(Number);
    const t = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const pix = window.PIX_SUPORTE || {};

  async function desenhar() {
    let m;
    try { m = await Data.obterMensalidade(); } catch (e) { el.innerHTML = `<div class="alerta">${App.escapeHtml(e.message)}</div>`; return; }
    const { assinatura, pagamentos, situacao, implantacao } = m;

    if (!assinatura || (situacao.status === 'sem' && implantacao.status === 'sem')) {
      el.innerHTML = `<div class="card">${App.estadoVazio({ icone: 'badge-check', titulo: 'Nenhuma mensalidade cadastrada', texto: 'Quando o suporte cadastrar a mensalidade do sistema, ela aparece aqui com o Pix para pagamento.' })}</div>`;
      App.icones();
      return;
    }

    const badge = {
      pago: '<span class="badge badge-sucesso">Paga</span>',
      informado: '<span class="badge badge-info">Pagamento informado — aguardando confirmação</span>',
      atrasado: `<span class="badge badge-perigo">Atrasada há ${situacao.diasAtraso} dia${situacao.diasAtraso === 1 ? '' : 's'}</span>`,
      aberto: '<span class="badge badge-alerta">Em aberto</span>'
    }[situacao.status];
    const podePagar = situacao.status === 'aberto' || situacao.status === 'atrasado';
    const txid = `PH${situacao.competencia.replace('-', '')}${String(m.lojaId).slice(-8)}`;
    let codigo = '';
    if (podePagar && pix.chave) {
      try { codigo = Pix.gerarCodigo({ chave: pix.chave, nome: pix.nome, cidade: pix.cidade, valor: assinatura.valor, txid, descricao: `Mensalidade ${situacao.competencia}` }); } catch (e) { codigo = ''; }
    }

    // Implantação pendente: Pix de pagamento único
    let codigoImpl = '';
    if (implantacao.status === 'pendente' && pix.chave) {
      try { codigoImpl = Pix.gerarCodigo({ chave: pix.chave, nome: pix.nome, cidade: pix.cidade, valor: implantacao.valor, txid: `PHIMPL${String(m.lojaId).slice(-10)}`, descricao: 'Implantacao do sistema' }); } catch (e) { codigoImpl = ''; }
    }
    const blocoImplantacao = implantacao.status === 'sem' ? '' : `
      <section class="card card-corpo implantacao mb-4">
        <div class="implantacao-topo">
          <div>
            <span class="texto-sm texto-3">Implantação do sistema · pagamento único</span>
            <div class="mensalidade-valor" style="font-size:2rem">${moeda(implantacao.valor)}</div>
          </div>
          ${{ paga: '<span class="badge badge-sucesso">Paga</span>', informada: '<span class="badge badge-info">Pagamento informado — aguardando confirmação</span>', pendente: '<span class="badge badge-alerta">Pendente</span>' }[implantacao.status]}
        </div>
        ${implantacao.status === 'paga' ? `<p class="texto-sm mt-2">Paga em ${App.formatarData(implantacao.pagamento.pagoEm)}. Obrigado!</p>` : ''}
        ${implantacao.status === 'pendente' ? (codigoImpl ? `
          <div class="implantacao-pix">
            <div class="pix-qr" style="width:180px;margin:0">${Pix.qrSvg(codigoImpl, 5)}</div>
            <div style="flex:1;min-width:240px">
              <p class="texto-sm texto-3">Pague pelo Pix (QR Code ou copia e cola). O valor já vem preenchido.</p>
              <label class="rotulo mt-2" for="pix-impl">Pix copia e cola</label>
              <div class="flex gap-2 mt-2">
                <input class="input mono" id="pix-impl" readonly value="${App.escapeHtml(codigoImpl)}" style="flex:1">
                <button type="button" class="btn btn-secundario" data-copiar="pix-impl"><i data-lucide="copy"></i>Copiar</button>
              </div>
              <button type="button" class="btn btn-primario mt-4" id="btn-impl-paguei"><i data-lucide="check-check"></i>Já paguei a implantação</button>
            </div>
          </div>` : '<p class="texto-sm mt-2">Fale com o suporte para pagar a implantação.</p>') : ''}
      </section>`;

    el.innerHTML = blocoImplantacao + (situacao.status === 'sem' ? '' : `
      <div class="mensalidade-grade">
        <section class="card card-corpo mensalidade-resumo">
          <span class="texto-sm texto-3">Mensalidade do sistema</span>
          <div class="mensalidade-valor">${moeda(assinatura.valor)}<small>/mês</small></div>
          <div class="texto-sm texto-2">Vence todo dia <strong>${assinatura.diaVencimento}</strong></div>
          <div class="mensalidade-mes">
            <div><span class="texto-xs texto-3">${nomeMes(situacao.competencia)}</span>${badge}</div>
            ${situacao.status === 'pago' ? `<p class="texto-sm mt-2">Pago em ${App.formatarData(situacao.pagamento.pagoEm)}. Obrigado!</p>` : ''}
            ${situacao.status === 'informado' ? '<p class="texto-sm mt-2">Recebemos o seu aviso. Assim que o suporte confirmar, aparece como paga.</p>' : ''}
            ${podePagar ? `<p class="texto-sm mt-2">Vencimento: ${App.formatarData(situacao.vencimento)}</p>` : ''}
          </div>
          ${assinatura.observacao ? `<p class="texto-xs texto-3 mt-4">${App.escapeHtml(assinatura.observacao)}</p>` : ''}
        </section>

        <section class="card card-corpo mensalidade-pix">
          ${podePagar ? (codigo ? `
            <h2 class="flex items-center gap-2"><i data-lucide="qr-code"></i>Pagar com Pix</h2>
            <p class="texto-sm texto-3">Abra o app do banco, escolha <strong>Pix → Ler QR Code</strong> ou <strong>Pix copia e cola</strong>. O valor já vem preenchido.</p>
            <div class="pix-qr">${Pix.qrSvg(codigo, 6)}</div>
            <div class="pix-valor">${moeda(assinatura.valor)}</div>
            <label class="rotulo" for="pix-copia">Pix copia e cola</label>
            <div class="flex gap-2">
              <input class="input mono" id="pix-copia" readonly value="${App.escapeHtml(codigo)}" style="flex:1">
              <button type="button" class="btn btn-secundario" id="btn-copiar"><i data-lucide="copy"></i>Copiar</button>
            </div>
            <p class="texto-xs texto-3 mt-2">Recebedor: ${App.escapeHtml(pix.nome || '')}</p>
            <button type="button" class="btn btn-primario btn-bloco btn-grande mt-4" id="btn-ja-paguei"><i data-lucide="check-check"></i>Já paguei</button>
            <p class="texto-xs texto-3 texto-centro mt-2">Depois de pagar, clique em "Já paguei" para avisar o suporte.</p>`
          : `<div class="alerta"><i data-lucide="triangle-alert"></i><span>A chave Pix do suporte ainda não foi configurada. Fale com o suporte para pagar.</span></div>`)
          : `<div class="vazio"><div class="vazio-icone"><i data-lucide="${situacao.status === 'pago' ? 'party-popper' : 'hourglass'}"></i></div>
              <h3>${situacao.status === 'pago' ? 'Mensalidade em dia' : 'Aguardando confirmação'}</h3>
              <p>${situacao.status === 'pago' ? 'Nada a pagar neste mês.' : 'O suporte vai conferir o seu Pix.'}</p></div>`}
        </section>
      </div>`) + `

      <section class="card mt-4">
        <div class="card-cabecalho"><h2>Histórico de pagamentos</h2></div>
        ${pagamentos.length ? `<ul class="lista">${pagamentos.map((p) => `
          <li class="lista-item">
            <span class="stat-icone" style="width:32px;height:32px;background:var(--cor-sucesso-suave);color:var(--cor-sucesso)"><i data-lucide="check"></i></span>
            <div class="info"><div class="titulo">${p.competencia === 'implantacao' ? 'Implantação do sistema' : nomeMes(p.competencia)}</div><div class="sub">Pago em ${App.formatarData(p.pagoEm)} · ${App.escapeHtml(p.forma === 'pix' ? 'Pix' : p.forma || '')}</div></div>
            <span class="valor">${moeda(p.valor)}</span>
          </li>`).join('')}</ul>`
        : '<p class="card-corpo texto-sm texto-3">Nenhum pagamento registrado ainda.</p>'}
      </section>`;

    document.querySelectorAll('[data-copiar]').forEach((b) => b.addEventListener('click', async () => {
      const campo = document.getElementById(b.dataset.copiar);
      try { await navigator.clipboard.writeText(campo.value); } catch (e) { campo.select(); document.execCommand('copy'); }
      App.toast('Código Pix copiado! Cole no app do banco em "Pix copia e cola".', 'sucesso');
    }));
    document.getElementById('btn-impl-paguei')?.addEventListener('click', async () => {
      const ok = await App.confirmar({ titulo: 'Avisar pagamento da implantação?', mensagem: `Confirme que você já pagou ${moeda(implantacao.valor)} pelo Pix referente à implantação do sistema.`, textoConfirmar: 'Sim, já paguei' });
      if (!ok) return;
      try { await Data.informarPagamentoMensalidade('implantacao'); App.toast('Aviso enviado ao suporte. Obrigado!', 'sucesso'); desenhar(); } catch (e) { App.toast(e.message, 'erro'); }
    });
    document.getElementById('btn-copiar')?.addEventListener('click', async () => {
      const campo = document.getElementById('pix-copia');
      try { await navigator.clipboard.writeText(campo.value); } catch (e) { campo.select(); document.execCommand('copy'); }
      App.toast('Código Pix copiado! Cole no app do banco em "Pix copia e cola".', 'sucesso');
    });
    document.getElementById('btn-ja-paguei')?.addEventListener('click', async () => {
      const ok = await App.confirmar({ titulo: 'Avisar pagamento?', mensagem: `Confirme que você já pagou ${moeda(assinatura.valor)} pelo Pix referente a ${nomeMes(situacao.competencia)}.`, textoConfirmar: 'Sim, já paguei' });
      if (!ok) return;
      try {
        await Data.informarPagamentoMensalidade(situacao.competencia);
        App.toast('Aviso enviado ao suporte. Obrigado!', 'sucesso');
        desenhar();
      } catch (e) { App.toast(e.message, 'erro'); }
    });
    App.icones();
  }

  await desenhar();
});
