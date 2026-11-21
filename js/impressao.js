/* ==========================================================================
   impressao.js — Opções do recibo com prévia ao vivo (venda e vale-troca).
   Salva sozinho em loja.impressao; vale para todas as impressões do sistema.
   ========================================================================== */
App.aoIniciar(async () => {
  const $ = (id) => document.getElementById(id);
  let loja = await Data.obterLoja();
  let op = App.opcoesImpressao(loja);
  let modelo = 'venda';
  const usuario = App.usuario || {};

  /* ---------- Venda de exemplo (só para a prévia) ---------- */
  function vendaExemplo() {
    const itens = [
      { sku: 'VES-M-PRE', nome: 'Vestido Midi Canelado', tamanho: 'M', cor: 'Preto', qtd: 1, preco: 189.9 },
      { sku: 'BLU-P-OFF', nome: 'Blusa Tricot Gola Alta', tamanho: 'P', cor: 'Off-white', qtd: 2, preco: 89.9 }
    ];
    const subtotal = itens.reduce((s, i) => s + i.qtd * i.preco, 0);
    const desconto = 20;
    const total = Math.round((subtotal - desconto) * 100) / 100;
    const comPontos = !!(loja.fidelidade && loja.fidelidade.ativo);
    return {
      numero: 1234, data: new Date().toISOString(), itens, subtotal, desconto, total, promocoes: [],
      pagamentos: [{ forma: 'pix', valor: 200 }, { forma: 'dinheiro', valor: Math.round((total - 200) * 100) / 100 }],
      pagamento: { forma: 'multiplo', troco: 10.3, parcelas: 1 },
      clienteNome: 'Cliente de Teste', clienteDocumento: '123.456.789-00', clienteTelefone: '(45) 99999-0000',
      vendedorNome: usuario.nome || 'Vendedora',
      pontosSaldo: comPontos ? 512 : null, pontosGanhos: comPontos ? Math.floor(total) : 0, pontosUsados: 0,
      pontosValorSaldo: comPontos ? 512 * (Number(loja.fidelidade.valorPonto) || 0.05) : 0, pontos: comPontos ? { mult: 1 } : null,
      parcelasCrediario: []
    };
  }

  /* ---------- Prévia ---------- */
  async function desenharPrevia() {
    const lojaPrevia = { ...loja, impressao: op, instagram: $('imp-insta').value.trim(), mensagemRecibo: $('imp-mensagem').value.trim() };
    const html = modelo === 'venda'
      ? App.htmlCupom({ loja: lojaPrevia, venda: vendaExemplo() })
      : await App.gerarVale({ loja: lojaPrevia, credito: { codigo: 'VT-7Q4K2M', saldo: 219.9, valor: 219.9, clienteNome: 'Cliente de Teste', criadoEm: new Date().toISOString() }, venda: { numero: 1203 } });
    $('imp-papel').innerHTML = html;
    $('imp-papel').classList.toggle('estreito', Number(op.largura) === 58);
    $('imp-badge').textContent = `${op.largura} mm`;
    // A biblioteca do QR carrega em segundo plano: redesenha quando chegar
    if (op.qrInstagram && $('imp-insta').value.trim() && !window.qrcode) setTimeout(desenharPrevia, 400);
  }

  /* ---------- Preencher a tela ---------- */
  function marcar(seletor, attr, valor) {
    document.querySelectorAll(seletor).forEach((b) => b.setAttribute('aria-checked', String(b.dataset[attr] === String(valor))));
  }
  function preencher() {
    marcar('[data-largura]', 'largura', op.largura);
    marcar('[data-fonte]', 'fonte', op.fonte);
    document.querySelectorAll('[data-op]').forEach((c) => { c.checked = !!op[c.dataset.op]; });
    $('imp-auto').checked = !!loja.imprimirReciboAuto;
    $('imp-mensagem').value = loja.mensagemRecibo || '';
    $('imp-insta').value = String(loja.instagram || '').replace(/^@/, '');
    $('imp-textoqr').value = op.textoQr || '';
    atualizarDependentes();
  }
  function atualizarDependentes() {
    $('imp-mensagem').disabled = !op.mensagem;
    $('imp-textoqr').disabled = !op.qrInstagram;
  }

  /* ---------- Salvar sozinho (um pouco depois de mexer) ---------- */
  let timer = null;
  function agendarSalvar() {
    $('salvo').textContent = 'Salvando…';
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        loja = await Data.salvarLoja({
          impressao: { ...op, textoQr: $('imp-textoqr').value.trim() || 'Nos siga no Instagram' },
          mensagemRecibo: $('imp-mensagem').value.trim(),
          instagram: $('imp-insta').value.trim().replace(/^@/, ''),
          imprimirReciboAuto: $('imp-auto').checked
        });
        $('salvo').textContent = '✓ Salvo';
      } catch (e) { $('salvo').textContent = ''; App.toast(e.message, 'erro'); }
    }, 600);
  }
  function mudou() { atualizarDependentes(); desenharPrevia(); agendarSalvar(); }

  document.querySelectorAll('[data-largura]').forEach((b) => b.addEventListener('click', () => { op.largura = Number(b.dataset.largura); marcar('[data-largura]', 'largura', op.largura); mudou(); }));
  document.querySelectorAll('[data-fonte]').forEach((b) => b.addEventListener('click', () => { op.fonte = b.dataset.fonte; marcar('[data-fonte]', 'fonte', op.fonte); mudou(); }));
  document.querySelectorAll('[data-op]').forEach((c) => c.addEventListener('change', () => { op[c.dataset.op] = c.checked; mudou(); }));
  ['imp-mensagem', 'imp-insta', 'imp-textoqr'].forEach((id) => $(id).addEventListener('input', () => { op.textoQr = $('imp-textoqr').value.trim() || 'Nos siga no Instagram'; mudou(); }));
  $('imp-auto').addEventListener('change', agendarSalvar);
  document.querySelectorAll('[data-modelo]').forEach((b) => b.addEventListener('click', () => { modelo = b.dataset.modelo; marcar('[data-modelo]', 'modelo', modelo); desenharPrevia(); }));
  $('btn-teste').addEventListener('click', () => App.imprimir($('imp-papel').innerHTML));

  preencher();
  await desenharPrevia();
});
