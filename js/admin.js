/* ==========================================================================
   admin.js — Painel do Suporte (super admin)
   Lojas, mensalidades, avisos "Já paguei", pagamentos, bloqueio e loja nova.
   ========================================================================== */
App.aoIniciar(async () => {
  // Só o suporte entra aqui
  const usuario = await Data.pronto().catch(() => null);
  if (Data.modo !== 'nuvem' || !usuario || usuario.perfil !== 'superadmin') {
    location.replace('../index.html');
    return;
  }
  const elEmail = document.getElementById('admin-email');
  if (elEmail) elEmail.textContent = usuario.email || '';

  const moeda = App.formatarMoeda;
  const mesAtual = () => new Date().toISOString().slice(0, 7);
  const nomeMes = (c) => {
    if (c === 'implantacao') return 'Implantação';
    const [a, m] = String(c).split('-').map(Number);
    if (!a || !m) return c;
    const t = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  let lojas = [];

  const badgeSituacao = (s) => ({
    pago: '<span class="badge badge-sucesso">Paga</span>',
    informado: '<span class="badge badge-info">Informou que pagou</span>',
    atrasado: `<span class="badge badge-perigo">Atrasada ${s.diasAtraso} dia${s.diasAtraso === 1 ? '' : 's'}</span>`,
    aberto: `<span class="badge badge-alerta">Vence ${App.formatarData(s.vencimento)}</span>`,
    sem: '<span class="badge">Sem mensalidade</span>',
    futuro: `<span class="badge badge-info">1ª cobrança em ${s.vencimento ? App.formatarData(s.vencimento) : ''}</span>`
  }[s.status] || '');

  async function carregar() {
    try {
      lojas = await Data.admin.listarLojas();
    } catch (e) {
      document.getElementById('admin-lista').innerHTML = `<tr><td colspan="6"><div class="alerta">${App.escapeHtml(e.message)}</div></td></tr>`;
      return;
    }
    desenhar();
  }

  function desenhar() {
    const ativas = lojas.filter((l) => l.assinatura && l.assinatura.ativa !== false && l.assinatura.valor > 0);
    // Lojas que ainda não começaram a pagar não entram na receita do mês
    const prevista = ativas.filter((l) => !l.situacao || l.situacao.status !== 'futuro').reduce((s, l) => s + Data.valorDaMensalidade(l.assinatura, mesAtual()), 0);
    const recebido = lojas.reduce((s, l) => s + l.pagamentos.filter((p) => p.competencia === mesAtual()).reduce((x, p) => x + (p.valor || 0), 0), 0);
    const atrasadas = lojas.filter((l) => l.situacao && l.situacao.status === 'atrasado');
    const pendentes = lojas.flatMap((l) => l.avisos.filter((a) => a.status === 'pendente').map((a) => ({ ...a, loja: l })));
    const card = (rotulo, icone, valor, detalhe, alerta) => `
      <article class="card stat ${alerta ? 'stat-alerta' : ''}">
        <div class="stat-topo"><span class="stat-rotulo">${rotulo}</span><span class="stat-icone"><i data-lucide="${icone}"></i></span></div>
        <div class="stat-valor">${valor}</div><div class="stat-detalhe">${detalhe}</div>
      </article>`;
    document.getElementById('admin-indicadores').innerHTML =
      card('Lojas', 'store', lojas.length, `${lojas.filter((l) => l.bloqueada).length} bloqueada(s)`)
      + card('Receita mensal', 'repeat', moeda(prevista), `${ativas.length} mensalidade(s) ativa(s)`)
      + card(`Recebido em ${nomeMes(mesAtual())}`, 'wallet', moeda(recebido), `falta ${moeda(Math.max(0, prevista - recebido))}`)
      + card('Implantações a receber', 'rocket', lojas.filter((l) => l.implantacao && l.implantacao.status !== 'paga' && l.implantacao.status !== 'sem').length,
        moeda(lojas.filter((l) => l.implantacao && l.implantacao.status !== 'paga' && l.implantacao.status !== 'sem').reduce((s, l) => s + l.implantacao.valor, 0)) + ' a receber')
      + card('Em atraso', 'triangle-alert', atrasadas.length, atrasadas.length ? moeda(atrasadas.reduce((s, l) => s + (l.situacao.valor || l.assinatura.valor), 0)) + ' a receber' : 'ninguém atrasado', atrasadas.length > 0);

    // Avisos "Já paguei" aguardando confirmação
    const avisos = document.getElementById('admin-avisos');
    avisos.classList.toggle('oculto', !pendentes.length);
    avisos.innerHTML = pendentes.length ? `
      <div class="card-cabecalho"><h2>Pagamentos informados — confira o Pix e confirme</h2><span class="badge badge-info">${pendentes.length}</span></div>
      ${pendentes.map((a) => `
        <div class="aviso-pagamento">
          <div style="flex:1;min-width:200px"><strong>${App.escapeHtml(a.loja.nome)}</strong>
            <div class="texto-xs texto-3">${nomeMes(a.competencia)} · ${moeda(a.valor || 0)} · avisou em ${App.formatarDataHora(a.criadoEm)}${a.informadoPor ? ' por ' + App.escapeHtml(a.informadoPor) : ''}</div></div>
          <button type="button" class="btn btn-secundario" data-recusar="${a.loja.id}|${a.competencia}"><i data-lucide="x"></i>Não recebi</button>
          <button type="button" class="btn btn-primario" data-confirmar="${a.loja.id}|${a.competencia}"><i data-lucide="check"></i>Confirmar pagamento</button>
        </div>`).join('')}` : '';

    document.getElementById('admin-contagem').textContent = `${lojas.length} loja${lojas.length === 1 ? '' : 's'}`;
    document.getElementById('admin-lista').innerHTML = lojas.length ? lojas.map((l) => {
      const dono = l.usuarios.find((u) => u.perfil === 'dono') || l.usuarios[0] || {};
      const ultimo = l.pagamentos[0];
      return `
      <tr class="linha-loja" data-ficha="${l.id}">
        <td class="cel-principal">
          <div class="titulo negrito">${App.escapeHtml(l.nome)}</div>
          <div class="texto-xs texto-3">${App.escapeHtml(dono.email || 'sem dono')}${l.telefone ? ' · ' + App.escapeHtml(l.telefone) : ''} · ${l.usuarios.length} usuário(s)</div>
          <div class="texto-xs ${diasDesdeBackup(l) === null || diasDesdeBackup(l) > 7 ? 'valor-negativo' : 'texto-3'}">${textoBackup(l)}</div>
        </td>
        <td data-label="Mensalidade">${l.assinatura && l.assinatura.valor > 0 ? `<strong>${moeda(Data.valorDaMensalidade(l.assinatura, mesAtual()))}</strong><div class="texto-xs texto-3">vence dia ${l.assinatura.diaVencimento}${l.assinatura.ativa === false ? ' · pausada' : ''}</div>
          ${Data.fimDaPromocao(l.assinatura) && mesAtual() <= Data.fimDaPromocao(l.assinatura) ? `<div class="texto-xs" style="color:var(--cor-info)">promoção até ${nomeMes(Data.fimDaPromocao(l.assinatura))}, depois ${moeda(l.assinatura.valor)}</div>` : ''}` : '<span class="texto-3">—</span>'}
          ${l.implantacao && l.implantacao.status !== 'sem' ? `<div class="texto-xs mt-2">Implantação ${moeda(l.implantacao.valor)}: ${{ paga: '<span class="valor-positivo">paga</span>', informada: '<span style="color:var(--cor-info)">informada</span>', pendente: '<span class="valor-negativo">pendente</span>' }[l.implantacao.status]}</div>` : ''}</td>
        <td data-label="Este mês">${badgeSituacao(l.situacao || { status: 'sem' })}</td>
        <td data-label="Último pagamento">${ultimo ? `${nomeMes(ultimo.competencia)}<div class="texto-xs texto-3">${moeda(ultimo.valor)} em ${App.formatarData(ultimo.pagoEm)}</div>` : '<span class="texto-3">—</span>'}</td>
        <td data-label="Acesso">${l.bloqueada ? `<span class="badge badge-perigo" title="${App.escapeHtml(l.motivoBloqueio || '')}">Bloqueada</span>` : '<span class="badge badge-sucesso">Ativa</span>'}</td>
        <td class="col-acoes"><button type="button" class="btn btn-secundario btn-gerenciar" data-ficha="${l.id}">Gerenciar<i data-lucide="chevron-right"></i></button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="6">${App.estadoVazio({ icone: 'store', titulo: 'Nenhuma loja ainda', texto: 'Clique em "Nova loja" para cadastrar a primeira cliente.' })}</td></tr>`;
    App.icones();
  }

  const achar = (id) => lojas.find((l) => l.id === id);

  /* ---------- Backup ---------- */
  function diasDesdeBackup(l) {
    const d = l.assinatura && l.assinatura.ultimoBackup;
    return d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null;
  }
  function textoBackup(l) {
    const dias = diasDesdeBackup(l);
    if (dias === null) return 'Nunca fez backup';
    return dias === 0 ? 'Backup feito hoje' : `Último backup há ${dias} dia${dias === 1 ? '' : 's'}`;
  }
  const nomeArquivo = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  function baixarArquivo(nome, dados) {
    const blob = new Blob([JSON.stringify(dados, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const contarRegistros = (b) => Object.values(b.colecoes || {}).reduce((s, docs) => s + Object.keys(docs || {}).length, 0);

  /* ---------- Zerar dados (antes de entregar a loja) ---------- */
  const GRUPOS_ZERAR = [
    ['vendas', 'Vendas e trocas', 'Vendas, trocas, vales-troca, crediário, caixas e notas. Dashboard e relatórios voltam a zero e as vendas recomeçam no nº 1001.', ['vendas', 'notas', 'creditos', 'caixas', 'contasReceber', 'ajustesPontos']],
    ['produtos', 'Produtos e estoque', 'Produtos, estoque, entradas, movimentações, inventários e promoções.', ['produtos', 'movimentacoes', 'entradas', 'inventarios', 'promocoes']],
    ['clientes', 'Clientes e fornecedores', 'Todos os clientes e fornecedores cadastrados.', ['clientes', 'fornecedores']],
    ['financeiro', 'Contas a pagar', 'Contas a pagar lançadas no Financeiro.', ['contasPagar']]
  ];

  function abrirZerar(l) {
    const { el, fechar } = App.abrirModal({
      titulo: `Zerar dados — ${l.nome}`,
      corpo: `
        <p class="texto-sm">Marque o que apagar. <strong>Continuam:</strong> configurações da loja, logo, usuários e senhas, cores/tamanhos/categorias e a mensalidade.</p>
        <div class="mt-4" style="display:grid;gap:10px">
          ${GRUPOS_ZERAR.map(([id, titulo, texto]) => `
            <label class="flex gap-3" style="align-items:flex-start;padding:12px;border:1px solid var(--cor-borda);border-radius:10px;cursor:pointer">
              <input type="checkbox" data-grupo="${id}" ${id === 'vendas' ? 'checked' : ''} style="margin-top:3px">
              <span><strong class="texto-sm">${titulo}</strong><br><span class="texto-xs texto-3">${texto}</span></span>
            </label>`).join('')}
        </div>
        <div class="alerta mt-4" style="align-items:flex-start"><i data-lucide="triangle-alert"></i>
          <span>Antes de apagar, o sistema <strong>baixa um backup</strong> no seu computador (dá para desfazer em "Backup → Restaurar").</span></div>
        <div class="campo mt-4">
          <label for="zr-confirma">Para confirmar, digite o nome da loja: <strong>${App.escapeHtml(l.nome)}</strong></label>
          <input class="input" id="zr-confirma" autocomplete="off">
        </div>`,
      acoes: [
        { texto: 'Cancelar' },
        { texto: 'Baixar backup e zerar', classe: 'btn-perigo', icone: 'eraser', aoClicar: zerar }
      ]
    });
    App.icones();

    async function zerar(_, botao) {
      const grupos = [...el.querySelectorAll('[data-grupo]')].filter((c) => c.checked).map((c) => c.dataset.grupo);
      if (!grupos.length) return App.toast('Marque o que apagar.', 'erro');
      const digitado = el.querySelector('#zr-confirma').value.trim().toLowerCase();
      if (digitado !== String(l.nome).trim().toLowerCase()) return App.toast('Digite o nome da loja exatamente como aparece.', 'erro');
      const colecoes = GRUPOS_ZERAR.filter((g) => grupos.includes(g[0])).flatMap((g) => g[3]);
      botao.disabled = true;
      try {
        await baixarBackup(l);
        const n = await Data.admin.zerarLoja(l.id, colecoes);
        App.toast(`Pronto! ${n} registro(s) apagado(s). O backup foi baixado antes.`, 'sucesso', 8000);
        fechar(); carregar();
      } catch (er) { App.toast(er.message, 'erro', 7000); botao.disabled = false; }
    }
  }

  async function baixarBackup(l) {
    const backup = await Data.admin.exportarLoja(l.id);
    baixarArquivo(`backup-${nomeArquivo(l.nome)}-${App.dataInput()}.json`, backup);
    return backup;
  }

  function abrirBackup(l) {
    const { el, fechar } = App.abrirModal({
      titulo: `Backup — ${l.nome}`,
      corpo: `
        <p class="texto-sm">${textoBackup(l)}. O arquivo traz <strong>tudo da loja</strong>: produtos, estoque, vendas, clientes, configurações, usuários e mensalidade. Guarde no seu computador ou no Google Drive.</p>
        <button type="button" class="btn btn-primario mt-4" id="bk-baixar"><i data-lucide="download"></i>Baixar backup agora</button>
        <div class="alerta mt-6" style="align-items:flex-start"><i data-lucide="triangle-alert"></i>
          <span><strong>Restaurar</strong> grava de volta tudo o que está no arquivo (o que foi apagado volta, e o que foi alterado volta como estava no dia do backup). O que foi criado depois do backup continua lá.</span></div>
        <label class="btn btn-secundario mt-4" style="cursor:pointer"><i data-lucide="upload"></i>Restaurar de um arquivo…
          <input type="file" id="bk-arquivo" accept=".json,application/json" hidden></label>`,
      acoes: [{ texto: 'Fechar' }]
    });
    el.querySelector('#bk-baixar').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const backup = await baixarBackup(l);
        App.toast(`Backup baixado: ${contarRegistros(backup)} registros.`, 'sucesso');
        fechar(); carregar();
      } catch (er) { App.toast(er.message, 'erro'); b.disabled = false; }
    });
    el.querySelector('#bk-arquivo').addEventListener('change', async (e) => {
      const arquivo = e.target.files[0];
      if (!arquivo) return;
      let backup;
      try { backup = JSON.parse(await arquivo.text()); } catch (er) { App.toast('Não foi possível ler o arquivo.', 'erro'); return; }
      // Arquivo 'Backup de todas': usa a parte desta loja
      if (backup && backup.tipo === 'backup-todas') backup = (backup.lojas || []).find((x) => x.lojaId === l.id) || { tipo: 'backup-loja', lojaId: '?' };
      if (!backup || backup.tipo !== 'backup-loja') return App.toast('Este arquivo não é um backup de loja do sistema.', 'erro');
      if (backup.lojaId !== l.id) return App.toast('Este backup é de outra loja.', 'erro');
      const ok = await App.confirmar({
        titulo: 'Restaurar este backup?',
        mensagem: `Backup de ${App.formatarDataHora(backup.geradoEm)} com ${contarRegistros(backup)} registros. Os dados da loja voltam a ficar como estavam nesse dia (o que foi criado depois continua).`,
        textoConfirmar: 'Restaurar', perigo: true
      });
      if (!ok) { e.target.value = ''; return; }
      try {
        const n = await Data.admin.restaurarLoja(l.id, backup);
        App.toast(`Backup restaurado: ${n} registros gravados.`, 'sucesso', 7000);
        fechar(); carregar();
      } catch (er) { App.toast(er.message, 'erro', 7000); }
    });
    App.icones();
  }

  async function backupDeTodas(botao) {
    if (!lojas.length) return App.toast('Nenhuma loja para copiar.', 'aviso');
    botao.disabled = true;
    try {
      const todas = [];
      for (const l of lojas) todas.push(await Data.admin.exportarLoja(l.id));
      baixarArquivo(`backup-todas-as-lojas-${App.dataInput()}.json`, { tipo: 'backup-todas', versao: 1, geradoEm: new Date().toISOString(), lojas: todas });
      App.toast(`Backup de ${todas.length} loja(s) baixado.`, 'sucesso');
      carregar();
    } catch (er) { App.toast(er.message, 'erro'); }
    botao.disabled = false;
  }

  /* ---------- Ações ---------- */
  function editarMensalidade(l) {
    const a = l.assinatura || {};
    const { el, fechar } = App.abrirModal({
      titulo: `Mensalidade — ${l.nome}`,
      tamanho: 'sm',
      corpo: `<form class="flex-col gap-4" id="f-mens" novalidate>
        <div class="campo"><label for="m-valor">Valor normal por mês (R$)</label><div class="input-grupo"><span class="prefixo">R$</span><input class="input" id="m-valor" inputmode="decimal" data-mascara="moeda" value="${App.formatarValorInput(a.valor || 0)}"></div></div>
        <div class="flex gap-2" style="flex-wrap:wrap">
          <div class="campo" style="flex:1;min-width:150px"><label for="m-promo">Valor promocional (R$)</label><div class="input-grupo"><span class="prefixo">R$</span><input class="input" id="m-promo" inputmode="decimal" data-mascara="moeda" value="${App.formatarValorInput(a.valorPromocional || 0)}"></div></div>
          <div class="campo" style="width:150px"><label for="m-meses">Nos primeiros</label><div class="input-grupo"><input class="input" id="m-meses" type="number" min="0" max="24" value="${a.mesesPromocionais || 0}" style="padding-left:12px"><span class="prefixo" style="left:auto;right:12px">meses</span></div></div>
        </div>
        <span class="ajuda" style="margin-top:-8px">Ex.: R$ 109,00 nos primeiros 3 meses e depois o valor normal. 0 = sem promoção.</span>
        <div class="campo"><label for="m-inicio">Início da cobrança (1º mês)</label><input class="input" id="m-inicio" type="month" value="${a.inicio || mesAtual()}"></div>
        <div class="campo"><label for="m-dia">Dia do vencimento (1 a 28)</label><input class="input" id="m-dia" type="number" min="1" max="28" value="${a.diaVencimento || 10}"></div>
        <div class="campo"><label for="m-impl">Implantação — pagamento único (R$)</label><div class="input-grupo"><span class="prefixo">R$</span><input class="input" id="m-impl" inputmode="decimal" data-mascara="moeda" value="${App.formatarValorInput(a.implantacaoValor ?? 300)}"></div><span class="ajuda">0,00 = sem implantação.</span></div>
        <div class="campo"><label for="m-obs">Observação (aparece para a loja)</label><input class="input" id="m-obs" value="${App.escapeHtml(a.observacao || '')}" placeholder="Ex.: 3 primeiros meses com desconto"></div>
        <label class="checkbox"><input type="checkbox" id="m-ativa" ${a.ativa === false ? '' : 'checked'}> Cobrança ativa</label>
      </form>`,
      acoes: [{ texto: 'Cancelar' }, { texto: 'Salvar', classe: 'btn-primario', icone: 'check', aoClicar: async (_, b) => {
        b.disabled = true;
        try {
          await Data.admin.salvarAssinatura(l.id, { nomeLoja: l.nome, valor: App.lerNumero(el.querySelector('#m-valor').value), valorPromocional: App.lerNumero(el.querySelector('#m-promo').value), mesesPromocionais: el.querySelector('#m-meses').value, inicio: el.querySelector('#m-inicio').value, implantacaoValor: App.lerNumero(el.querySelector('#m-impl').value), diaVencimento: el.querySelector('#m-dia').value, observacao: el.querySelector('#m-obs').value.trim(), ativa: el.querySelector('#m-ativa').checked });
          fechar(); App.toast('Mensalidade salva.', 'sucesso'); carregar();
        } catch (e) { App.toast(e.message, 'erro'); b.disabled = false; }
      } }]
    });
    App.aplicarMascaras && App.aplicarMascaras(el);
  }

  function registrarPagamento(l, competencia = mesAtual()) {
    const { el, fechar } = App.abrirModal({
      titulo: `Registrar pagamento — ${l.nome}`,
      tamanho: 'sm',
      corpo: `<form class="flex-col gap-4" novalidate>
        <div class="campo"><label for="p-tipo">Referente a</label><select class="select" id="p-tipo"><option value="mes">Mensalidade</option><option value="implantacao">Implantação (pagamento único)</option></select></div>
        <div class="campo" id="p-mes-campo"><label for="p-mes">Mês de referência</label><input class="input" id="p-mes" type="month" value="${competencia}"></div>
        <div class="campo"><label for="p-valor">Valor recebido (R$)</label><div class="input-grupo"><span class="prefixo">R$</span><input class="input" id="p-valor" inputmode="decimal" data-mascara="moeda" value="${App.formatarValorInput(Data.valorDaMensalidade(l.assinatura, competencia))}"></div></div>
        <div class="campo"><label for="p-data">Pago em</label><input class="input" id="p-data" type="date" value="${App.dataInput()}"></div>
        <div class="campo"><label for="p-forma">Forma</label><select class="select" id="p-forma"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="transferencia">Transferência</option><option value="boleto">Boleto</option><option value="cartao">Cartão</option></select></div>
      </form>`,
      acoes: [{ texto: 'Cancelar' }, { texto: 'Registrar', classe: 'btn-primario', icone: 'check', aoClicar: async (_, b) => {
        b.disabled = true;
        try {
          const ehImpl = el.querySelector('#p-tipo').value === 'implantacao';
          await Data.admin.registrarPagamento(l.id, { competencia: ehImpl ? 'implantacao' : el.querySelector('#p-mes').value, valor: App.lerNumero(el.querySelector('#p-valor').value), pagoEm: el.querySelector('#p-data').value, forma: el.querySelector('#p-forma').value });
          fechar(); App.toast('Pagamento registrado.', 'sucesso'); carregar();
        } catch (e) { App.toast(e.message, 'erro'); b.disabled = false; }
      } }]
    });
    App.aplicarMascaras && App.aplicarMascaras(el);
    const tipo = el.querySelector('#p-tipo');
    tipo.addEventListener('change', () => {
      const impl = tipo.value === 'implantacao';
      el.querySelector('#p-mes-campo').classList.toggle('oculto', impl);
      el.querySelector('#p-valor').value = App.formatarValorInput(impl ? ((l.assinatura && l.assinatura.implantacaoValor) || 300) : Data.valorDaMensalidade(l.assinatura, el.querySelector('#p-mes').value));
    });
    el.querySelector('#p-mes').addEventListener('change', (e) => {
      if (tipo.value !== 'implantacao') el.querySelector('#p-valor').value = App.formatarValorInput(Data.valorDaMensalidade(l.assinatura, e.target.value));
    });
  }

  function historico(l) {
    const { el, fechar } = App.abrirModal({
      titulo: `Pagamentos — ${l.nome}`,
      corpo: l.pagamentos.length ? `<ul class="lista">${l.pagamentos.map((p) => `
        <li class="lista-item" style="padding:10px 0">
          <div class="info"><div class="titulo">${nomeMes(p.competencia)}</div><div class="sub">Pago em ${App.formatarData(p.pagoEm)} · ${App.escapeHtml(p.forma || '')}</div></div>
          <span class="valor">${moeda(p.valor)}</span>
          <button type="button" class="btn-icone perigo" data-excluir-pag="${p.competencia}" title="Excluir registro" aria-label="Excluir registro"><i data-lucide="trash-2"></i></button>
        </li>`).join('')}</ul>` : '<p class="texto-sm texto-3">Nenhum pagamento registrado.</p>',
      acoes: [{ texto: 'Fechar', classe: 'btn-primario' }]
    });
    el.querySelectorAll('[data-excluir-pag]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await App.confirmar({ titulo: 'Excluir este pagamento?', mensagem: `O registro de ${nomeMes(b.dataset.excluirPag)} será apagado e o mês volta a ficar em aberto.`, textoConfirmar: 'Excluir', perigo: true }))) return;
      try { await Data.admin.excluirPagamento(l.id, b.dataset.excluirPag); fechar(); App.toast('Registro excluído.'); carregar(); } catch (e) { App.toast(e.message, 'erro'); }
    }));
  }

  async function alternarBloqueio(l) {
    if (l.bloqueada) {
      if (!(await App.confirmar({ titulo: `Desbloquear ${l.nome}?`, mensagem: 'A loja volta a usar o sistema normalmente.', textoConfirmar: 'Desbloquear' }))) return;
      try { await Data.admin.bloquearLoja(l.id, false); App.toast('Loja desbloqueada.', 'sucesso'); carregar(); } catch (e) { App.toast(e.message, 'erro'); }
      return;
    }
    const { el, fechar } = App.abrirModal({
      titulo: `Bloquear ${l.nome}?`,
      tamanho: 'sm',
      corpo: `<p class="texto-sm">A loja não conseguirá entrar no sistema até você desbloquear. Os dados continuam guardados.</p>
        <div class="campo mt-4"><label for="b-motivo">Motivo (só para você)</label><input class="input" id="b-motivo" placeholder="Ex.: mensalidade atrasada"></div>`,
      acoes: [{ texto: 'Cancelar' }, { texto: 'Bloquear', classe: 'btn-perigo', icone: 'lock', aoClicar: async (_, b) => {
        b.disabled = true;
        try { await Data.admin.bloquearLoja(l.id, true, el.querySelector('#b-motivo').value.trim()); fechar(); App.toast('Loja bloqueada.'); carregar(); } catch (e) { App.toast(e.message, 'erro'); b.disabled = false; }
      } }]
    });
  }

  async function enviarSenha(l) {
    const dono = l.usuarios.find((u) => u.perfil === 'dono') || l.usuarios[0];
    if (!dono || !dono.email) return App.toast('Esta loja não tem dono com e-mail.', 'erro');
    if (!(await App.confirmar({ titulo: 'Enviar link de nova senha?', mensagem: `Vamos mandar para ${dono.email} um e-mail com o link para criar uma senha nova.`, textoConfirmar: 'Enviar' }))) return;
    try { await Data.recuperarSenha(dono.email); App.toast(`Link enviado para ${dono.email}. Peça para olhar também o spam.`, 'sucesso', 7000); } catch (e) { App.toast(e.message, 'erro'); }
  }

  function novaLoja() {
    const { el, fechar } = App.abrirModal({
      titulo: 'Nova loja',
      corpo: `<form class="form-grid" novalidate>
        <div class="campo col-span-2"><label for="n-loja">Nome da loja *</label><input class="input" id="n-loja" required></div>
        <div class="campo"><label for="n-email">E-mail do dono *</label><input class="input" id="n-email" type="email" required autocomplete="off"></div>
        <div class="campo"><label for="n-senha">Senha inicial (mín. 6) *</label><input class="input" id="n-senha" type="text" required minlength="6" autocomplete="off"></div>
        <div class="campo"><label for="n-promo">Valor promocional (R$)</label><div class="input-grupo"><span class="prefixo">R$</span><input class="input" id="n-promo" inputmode="decimal" data-mascara="moeda" value="109,00"></div></div>
        <div class="campo"><label for="n-meses">Promoção nos primeiros (meses)</label><input class="input" id="n-meses" type="number" min="0" max="24" value="3"></div>
        <div class="campo"><label for="n-valor">Mensalidade normal (R$)</label><div class="input-grupo"><span class="prefixo">R$</span><input class="input" id="n-valor" inputmode="decimal" data-mascara="moeda" value="139,00"></div></div>
        <div class="campo"><label for="n-dia">Dia do vencimento</label><input class="input" id="n-dia" type="number" min="1" max="28" value="10"></div>
        <div class="campo"><label for="n-inicio">Início da cobrança (1º mês)</label><input class="input" id="n-inicio" type="month" value="${mesAtual()}"></div>
        <div class="campo col-span-2"><label for="n-impl">Implantação — pagamento único (R$)</label><div class="input-grupo"><span class="prefixo">R$</span><input class="input" id="n-impl" inputmode="decimal" data-mascara="moeda" value="300,00"></div></div>
      </form>
      <p class="texto-xs texto-3 mt-4">O usuário do dono é criado com o nome da loja. A loja começa vazia, com tamanhos, categorias e cores prontos.</p>`,
      acoes: [{ texto: 'Cancelar' }, { texto: 'Criar loja', classe: 'btn-primario', icone: 'store', aoClicar: async (_, b) => {
        const f = el.querySelector('form');
        if (!App.validarFormulario(f)) return;
        b.disabled = true;
        const dados = { nomeLoja: el.querySelector('#n-loja').value.trim(), nome: el.querySelector('#n-loja').value.trim(), email: el.querySelector('#n-email').value.trim(), senha: el.querySelector('#n-senha').value, valor: App.lerNumero(el.querySelector('#n-valor').value), diaVencimento: el.querySelector('#n-dia').value, implantacaoValor: App.lerNumero(el.querySelector('#n-impl').value), valorPromocional: App.lerNumero(el.querySelector('#n-promo').value), mesesPromocionais: el.querySelector('#n-meses').value, inicio: el.querySelector('#n-inicio').value };
        try {
          await Data.admin.criarLoja(dados);
          fechar();
          App.abrirModal({ titulo: 'Loja criada', tamanho: 'sm', corpo: `<p class="texto-sm">Passe estes dados para a cliente entrar em <strong>${location.origin}</strong>:</p>
            <dl class="detalhes mt-4"><div><dt>E-mail</dt><dd>${App.escapeHtml(dados.email)}</dd></div><div><dt>Senha</dt><dd class="mono">${App.escapeHtml(dados.senha)}</dd></div></dl>`, acoes: [{ texto: 'Fechar', classe: 'btn-primario' }] });
          carregar();
        } catch (e) { App.toast(e.message, 'erro', 7000); b.disabled = false; }
      } }]
    });
    App.aplicarMascaras && App.aplicarMascaras(el);
  }

  /* ---------- Ficha da loja (tudo de uma loja num lugar só) ---------- */
  const foneWhats = (t) => { let d = String(t || '').replace(/\D/g, ''); if (!d) return ''; if (d.length <= 11) d = '55' + d; return d; };
  function abrirFicha(l) {
    const e = App.escapeHtml;
    const dono = l.usuarios.find((u) => u.perfil === 'dono') || l.usuarios[0] || {};
    const a = l.assinatura || {};
    const temMens = a.valor > 0;
    const fimPromo = temMens && Data.fimDaPromocao(a);
    const wa = foneWhats(l.telefone);
    const dias = diasDesdeBackup(l);
    const pags = l.pagamentos.slice(0, 6);
    const linha = (rotulo, valor) => `<div><dt>${rotulo}</dt><dd>${valor}</dd></div>`;
    const { el, fechar } = App.abrirModal({
      titulo: l.nome,
      tamanho: 'lg',
      corpo: `
        <div class="ficha-status">
          ${l.bloqueada ? '<span class="badge badge-perigo">Bloqueada</span>' : '<span class="badge badge-sucesso">Ativa</span>'}
          ${badgeSituacao(l.situacao || { status: 'sem' })}
          <span class="badge ${dias === null || dias > 7 ? 'badge-alerta' : ''}">${textoBackup(l)}</span>
        </div>

        <div class="ficha-grade">
          <section class="ficha-bloco">
            <h3><i data-lucide="user-round"></i>Contato</h3>
            <dl class="ficha-dados">
              ${linha('Dono(a)', e(dono.nome || '—'))}
              ${linha('E-mail', e(dono.email || '—'))}
              ${linha('Telefone', l.telefone ? e(l.telefone) : '—')}
              ${linha('Usuários', `${l.usuarios.length}`)}
            </dl>
            <div class="ficha-acoes">
              ${wa ? `<a class="btn btn-secundario" href="https://wa.me/${wa}" target="_blank" rel="noopener"><i data-lucide="message-circle"></i>WhatsApp</a>` : ''}
              <button type="button" class="btn btn-secundario" data-f="senha"><i data-lucide="key-round"></i>Enviar nova senha</button>
            </div>
          </section>

          <section class="ficha-bloco">
            <h3><i data-lucide="badge-dollar-sign"></i>Mensalidade</h3>
            ${temMens ? `
              <div class="ficha-valor">${moeda(Data.valorDaMensalidade(a, mesAtual()))}<small>/mês</small></div>
              <dl class="ficha-dados">
                ${linha('Vencimento', `todo dia ${a.diaVencimento}${a.ativa === false ? ' · <span class="valor-negativo">pausada</span>' : ''}`)}
                ${fimPromo && mesAtual() <= fimPromo ? linha('Promoção', `até ${nomeMes(fimPromo)}, depois ${moeda(a.valor)}`) : ''}
                ${l.implantacao && l.implantacao.status !== 'sem' ? linha('Implantação', `${moeda(l.implantacao.valor)} · ${{ paga: '<span class="valor-positivo">paga</span>', informada: 'informada', pendente: '<span class="valor-negativo">pendente</span>' }[l.implantacao.status]}`) : ''}
              </dl>` : '<p class="texto-sm texto-3">Sem mensalidade cadastrada.</p>'}
            <div class="ficha-acoes">
              <button type="button" class="btn btn-primario" data-f="pagamento"><i data-lucide="hand-coins"></i>Registrar pagamento</button>
              <button type="button" class="btn btn-secundario" data-f="mensalidade"><i data-lucide="pencil"></i>Editar</button>
            </div>
          </section>

          <section class="ficha-bloco">
            <h3><i data-lucide="history"></i>Pagamentos</h3>
            ${pags.length ? `<ul class="ficha-pags">${pags.map((p) => `
              <li><span>${nomeMes(p.competencia)}<small>${App.formatarData(p.pagoEm)} · ${e(p.forma || '')}</small></span><strong>${moeda(p.valor)}</strong></li>`).join('')}</ul>
              ${l.pagamentos.length > 6 ? `<button type="button" class="btn btn-fantasma" data-f="historico">Ver todos (${l.pagamentos.length})</button>` : '<button type="button" class="btn btn-fantasma" data-f="historico">Editar registros</button>'}`
            : '<p class="texto-sm texto-3">Nenhum pagamento registrado ainda.</p>'}
          </section>

          <section class="ficha-bloco">
            <h3><i data-lucide="database-backup"></i>Backup</h3>
            <p class="texto-sm ${dias === null || dias > 7 ? 'valor-negativo' : 'texto-3'}">${textoBackup(l)}.</p>
            <p class="texto-xs texto-3">Cópia de tudo da loja: produtos, estoque, vendas, clientes e configurações.</p>
            <div class="ficha-acoes">
              <button type="button" class="btn btn-secundario" data-f="baixar"><i data-lucide="download"></i>Baixar backup</button>
              <button type="button" class="btn btn-fantasma" data-f="backup"><i data-lucide="upload"></i>Restaurar…</button>
            </div>
          </section>
        </div>

        <section class="ficha-perigo">
          <div>
            <h3><i data-lucide="shield-alert"></i>Zona de perigo</h3>
            <p class="texto-xs texto-3">Ações que afetam o uso ou os dados da loja. Sempre pedem confirmação.</p>
          </div>
          <div class="ficha-acoes">
            <button type="button" class="btn ${l.bloqueada ? 'btn-secundario' : 'btn-perigo-contorno'}" data-f="bloqueio"><i data-lucide="${l.bloqueada ? 'lock-open' : 'lock'}"></i>${l.bloqueada ? 'Desbloquear loja' : 'Bloquear loja'}</button>
            <button type="button" class="btn btn-perigo-contorno" data-f="zerar"><i data-lucide="eraser"></i>Zerar dados</button>
          </div>
        </section>`,
      acoes: []
    });
    App.icones();
    // Cada ação fecha a ficha e abre a janela dela (as janelas já existentes)
    el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', async () => {
      const acao = b.dataset.f;
      if (acao === 'baixar') {
        b.disabled = true;
        try { const bk = await baixarBackup(l); App.toast(`Backup baixado: ${contarRegistros(bk)} registros.`, 'sucesso'); fechar(); carregar(); }
        catch (er) { App.toast(er.message, 'erro'); b.disabled = false; }
        return;
      }
      fechar();
      setTimeout(() => ({ pagamento: () => registrarPagamento(l), mensalidade: () => editarMensalidade(l), historico: () => historico(l), bloqueio: () => alternarBloqueio(l), senha: () => enviarSenha(l), backup: () => abrirBackup(l), zerar: () => abrirZerar(l) })[acao](), 220);
    }));
  }

  /* ---------- Eventos ---------- */
  document.getElementById('admin-lista')?.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-ficha]');
    if (!alvo || e.target.closest('a')) return;
    const l = achar(alvo.dataset.ficha);
    if (l) abrirFicha(l);
  });
  document.getElementById('admin-avisos')?.addEventListener('click', async (e) => {
    const conf = e.target.closest('[data-confirmar]');
    const rec = e.target.closest('[data-recusar]');
    if (!conf && !rec) return;
    const [id, competencia] = (conf || rec).dataset[conf ? 'confirmar' : 'recusar'].split('|');
    const l = achar(id);
    if (rec && !(await App.confirmar({ titulo: 'Não recebeu?', mensagem: `O aviso de ${l.nome} (${nomeMes(competencia)}) volta para "em aberto" e a loja pode pagar de novo.`, textoConfirmar: 'Não recebi', perigo: true }))) return;
    try {
      await Data.admin.responderAviso(id, competencia, !!conf);
      App.toast(conf ? 'Pagamento confirmado.' : 'Aviso recusado.', conf ? 'sucesso' : 'aviso');
      carregar();
    } catch (er) { App.toast(er.message, 'erro'); }
  });
  document.getElementById('btn-nova-loja')?.addEventListener('click', novaLoja);
  document.getElementById('btn-atualizar')?.addEventListener('click', carregar);
  document.getElementById('btn-backup-todas')?.addEventListener('click', (e) => backupDeTodas(e.currentTarget));
  document.getElementById('btn-sair-admin')?.addEventListener('click', async () => { await Data.sair(); location.replace('../index.html'); });

  await carregar();
});
