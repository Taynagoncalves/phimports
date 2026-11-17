/* ==========================================================================
   notas.js — Lista de NFC-e e visualização do cupom térmico simulado
   ========================================================================== */
App.aoIniciar(async () => {
  const POR_PAGINA = 10;
  let pagina = 1;
  let notas = [];
  const fiscal = await Data.obterConfigFiscal(); // só para o aviso de ambiente/pendências

  const form = document.getElementById('filtros');
  const corpo = document.getElementById('lista');

  async function carregar() {
    notas = await Data.listarNotas(App.lerFormulario(form));
    pagina = 1;
    desenhar();
  }

  function desenhar() {
    // Indicadores do período filtrado
    const aut = notas.filter((n) => n.status === 'autorizada');
    document.getElementById('kpi-autorizadas').textContent = aut.length;
    document.getElementById('kpi-autorizadas-det').textContent = App.formatarMoeda(aut.reduce((s, n) => s + n.valor, 0));
    document.getElementById('kpi-pendentes').textContent = notas.filter((n) => n.status === 'pendente').length;
    document.getElementById('kpi-canceladas').textContent = notas.filter((n) => n.status === 'cancelada').length;

    if (!notas.length) {
      corpo.innerHTML = `<tr><td colspan="7">${App.estadoVazio({ icone: 'file-text', titulo: 'Nenhuma nota encontrada', texto: 'Emita notas a partir do PDV ou da tela de vendas.' })}</td></tr>`;
      document.getElementById('paginacao').innerHTML = '';
      App.icones();
      return;
    }

    const pag = App.paginar(notas, pagina, POR_PAGINA);
    pagina = pag.pagina;
    corpo.innerHTML = pag.itens.map((n) => `
      <tr>
        <td class="cel-principal"><span class="negrito">NFC-e ${String(n.numero).padStart(6, '0')}</span> <span class="texto-xs texto-3">· Série ${n.serie}</span>${n.ambiente === 'homologacao' ? ' <span class="tag">Homologação</span>' : ''}</td>
        <td data-label="Data" class="nowrap">${App.formatarDataHora(n.data)}</td>
        <td data-label="Cliente">${App.escapeHtml(n.clienteNome)}</td>
        <td data-label="Venda">${n.venda ? '#' + n.venda.numero : '—'}</td>
        <td data-label="Valor" class="num negrito">${App.formatarMoeda(n.valor)}</td>
        <td data-label="Status">${App.badgeStatus(n.status)}</td>
        <td class="col-acoes">
          <button type="button" class="btn btn-secundario" data-ver="${n.id}" style="min-height:36px"><i data-lucide="receipt"></i>Ver cupom</button>
        </td>
      </tr>`).join('');
    corpo.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => abrirCupom(b.dataset.ver)));
    App.renderPaginacao(document.getElementById('paginacao'), {
      total: notas.length, pagina, porPagina: POR_PAGINA,
      aoMudar: (p) => { pagina = p; desenhar(); }
    });
    App.icones();
  }

  /* ---------- Cupom NFC-e em modal ---------- */
  async function abrirCupom(id) {
    let nota;
    try { nota = await Data.obterNota(id); } catch (e) { return App.toast(e.message, 'erro'); }
    if (!nota.venda) return App.toast('Venda da nota não encontrada.', 'erro');
    const venda = await Data.obterVenda(nota.vendaId);
    const html = await App.gerarCupom({ venda, nota });

    const acoes = [];
    if (nota.status === 'autorizada' && App.pode('cancelar-nota')) acoes.push({ texto: 'Cancelar nota', classe: 'btn-perigo', icone: 'ban', aoClicar: async (fechar) => {
      const ok = await App.confirmar({ titulo: 'Cancelar NFC-e?', mensagem: `A nota nº ${nota.numero} será cancelada. Na versão real, isso envia o evento de cancelamento à SEFAZ (prazo de 30 minutos).`, textoConfirmar: 'Cancelar nota', perigo: true });
      if (!ok) return;
      await Data.cancelarNota(nota.id);
      fechar();
      App.toast('Nota cancelada.');
      carregar();
    } });
    if (nota.status === 'pendente') acoes.push({ texto: 'Transmitir', icone: 'send', aoClicar: async (fechar) => {
      await Data.transmitirNota(nota.id);
      fechar();
      App.toast('Nota transmitida e autorizada (simulação).');
      carregar();
    } });
    acoes.push({ texto: 'Imprimir', classe: 'btn-primario', icone: 'printer', aoClicar: () => App.imprimir(html) });

    App.abrirModal({
      titulo: `NFC-e nº ${nota.numero}`,
      corpo: `
        <div class="flex items-center justify-between mb-4 gap-3" style="flex-wrap:wrap">
          ${App.badgeStatus(nota.status)}
          <span class="texto-sm texto-3">Venda #${venda.numero} · ${App.escapeHtml(venda.clienteNome)}</span>
        </div>
        <div style="background:var(--cor-superficie-2);padding:24px 8px;border-radius:12px">${html}</div>`,
      acoes
    });
  }

  /* ---------- Inicialização ---------- */
  form.dataInicio.value = App.diasAtras(30);
  form.dataFim.value = App.dataInput();
  form.addEventListener('submit', (e) => e.preventDefault());
  form.busca.addEventListener('input', App.debounce(carregar, 250));
  form.querySelectorAll('select, input[type=date]').forEach((c) => c.addEventListener('change', carregar));
  await carregar();

  // Aviso sobre a configuração fiscal
  const pendencias = await Data.verificarConfigFiscal();
  const aviso = document.getElementById('aviso-fiscal');
  if (pendencias.length) {
    aviso.innerHTML = `<div class="alerta"><i data-lucide="triangle-alert"></i>
      <span><strong>Não é possível emitir NFC-e:</strong> faltam ${pendencias.length} dado(s) fiscal(is) — ${App.escapeHtml(pendencias.join(', '))}.
      <a href="configuracoes.html#fiscal">Completar dados fiscais</a></span></div>`;
  } else if (fiscal.nfce.ambiente === 'homologacao') {
    aviso.innerHTML = `<div class="alerta info"><i data-lucide="flask-conical"></i>
      <span><strong>Ambiente de homologação:</strong> as novas notas são de teste e não têm valor fiscal.
      <a href="configuracoes.html#fiscal">Mudar para produção</a></span></div>`;
  }
  App.icones();

  // Vindo da tela de vendas (?nota=id)
  const idUrl = App.parametroUrl('nota');
  if (idUrl) abrirCupom(idUrl);
});
