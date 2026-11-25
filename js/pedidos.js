/* ==========================================================================
   pedidos.js — Pedidos online (feitos no catálogo)
   Caixa de entrada: lista à esquerda, pedido aberto à direita.
   Andamento: recebido → confirmado → pago → separado → pronto/enviado → venda.
   Mensagens prontas de WhatsApp, anotação da loja, folha de separação,
   aviso (com som) quando chega pedido novo.
   ========================================================================== */
App.aoIniciar(async () => {
  const $ = (id) => document.getElementById(id);
  const e = App.escapeHtml;
  const r$ = App.formatarMoeda;
  const CHAVE_SOM = 'gestaoloja:pedidos-som';
  const HORAS_PARADO = 24;
  const ABERTO = ['novo', 'confirmado'];

  let pedidos = [];
  let fotos = new Map();          // produtoId → foto
  let precos = new Map();         // produtoId → preço atual (o menor entre normal e promocional)
  let filtro = 'abertos';         // abertos | novo | confirmado | concluido | cancelado | todos
  let busca = '';
  let selecionado = App.parametroUrl('pedido') || '';
  let conhecidos = null;          // ids já vistos (para avisar pedido novo)
  let som = true;
  try { som = localStorage.getItem(CHAVE_SOM) !== 'nao'; } catch (er) { /* ignora */ }
  const loja = await Data.obterLoja();
  $('btn-catalogo').href = Data.linkCatalogo();

  /* ---------- Utilidades ---------- */
  const whats = (t) => { let d = String(t || '').replace(/\D/g, ''); if (!d) return ''; if (d.length <= 11) d = '55' + d; return d; };
  const horasDesde = (iso) => (Date.now() - new Date(iso).getTime()) / 3600000;
  const quando = (iso) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    if (min < 1440) return `há ${Math.round(min / 60)} h`;
    const dias = Math.round(min / 1440);
    return dias <= 6 ? `há ${dias} dia${dias === 1 ? '' : 's'}` : App.formatarData(iso);
  };
  const pecasDe = (p) => (p.itens || []).reduce((s, i) => s + (Number(i.qtd) || 0), 0);
  const nomeDe = (p) => (p.cliente && p.cliente.nome) || 'Cliente sem nome';
  const primeiroNome = (p) => nomeDe(p).split(' ')[0];
  const iniciais = (p) => nomeDe(p).split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
  const separadoTudo = (p) => (p.itens || []).length > 0 && (p.itens || []).every((_, i) => p.separados && p.separados[i]);
  const qtdSeparados = (p) => (p.itens || []).filter((_, i) => p.separados && p.separados[i]).length;
  const parado = (p) => ABERTO.includes(p.status) && !p.pronto && horasDesde(p.criadoEm) > HORAS_PARADO;
  const retirar = (p) => p.entrega !== 'entregar';
  const FORMAS = [['pix', 'Pix'], ['cartao', 'Cartão'], ['dinheiro', 'Dinheiro'], ['outro', 'Outro']];
  const nomeForma = (f) => (FORMAS.find((x) => x[0] === f) || [f, f])[1];

  /** Etapas do pedido (para a linha do tempo e a lista) */
  function etapas(p) {
    const venda = p.status === 'concluido';
    const confirmado = venda || p.status === 'confirmado' || !!p.pago || !!p.pronto;
    return [
      { id: 'recebido', nome: 'Recebido', feito: true },
      { id: 'confirmado', nome: 'Confirmado', feito: confirmado },
      { id: 'pago', nome: 'Pago', feito: venda || !!p.pago },
      { id: 'separado', nome: 'Separado', feito: venda || separadoTudo(p) },
      { id: 'pronto', nome: retirar(p) ? 'Pronto' : 'Enviado', feito: venda || !!p.pronto },
      { id: 'venda', nome: 'Venda', feito: venda }
    ];
  }
  function situacao(p) {
    if (p.status === 'cancelado') return ['Cancelado', 'cancelado'];
    if (p.status === 'concluido') return [`Venda #${p.numeroVenda || ''}`, 'concluido'];
    if (p.status === 'novo') return ['Novo', 'novo'];
    if (p.pronto) return [retirar(p) ? 'Pronto p/ retirar' : 'Enviado', 'pronto'];
    if (p.pago) return ['Pago', 'pago'];
    return ['Confirmado', 'confirmado'];
  }

  /* ---------- Mensagens prontas ---------- */
  function mensagens(p) {
    const n = primeiroNome(p);
    const pecas = pecasDe(p);
    const lista = (p.itens || []).map((i) => `• ${i.qtd}× ${i.nome}${[i.cor, i.tamanho && 'tam. ' + i.tamanho].filter(Boolean).length ? ' (' + [i.cor, i.tamanho && 'tam. ' + i.tamanho].filter(Boolean).join(', ') + ')' : ''}`).join('\n');
    const cupom = App.cupomDoPedido(p);
    return [
      ['Recebemos o pedido', 'message-circle-heart', `Olá, ${n}! Aqui é da ${loja.nome} 💛 Recebemos o seu pedido #${p.codigo}:\n${lista}\n${cupom ? `Cupom ${cupom.codigo}: −${r$(cupom.desconto)}\n` : ''}Total: ${r$(p.total)} (${pecas} peça${pecas === 1 ? '' : 's'}). Já vamos separar!`],
      ['Combinar pagamento', 'wallet', `Oi, ${n}! Seu pedido #${p.codigo} deu ${r$(p.total)}. Você prefere pagar por Pix ou cartão? Assim que confirmar, a gente ${retirar(p) ? 'deixa separado pra você' : 'já envia'} 😉`],
      retirar(p)
        ? ['Pronto para retirar', 'store', `Oi, ${n}! Seu pedido #${p.codigo} está separado e pronto pra retirar na ${loja.nome}${loja.endereco ? ` (${loja.endereco})` : ''}. Te esperamos! 🖤`]
        : ['Pedido enviado', 'truck', `Oi, ${n}! Seu pedido #${p.codigo} já foi enviado para ${p.endereco || 'o seu endereço'}. Qualquer coisa é só chamar! 📦`],
      ['Peça em falta', 'circle-alert', `Oi, ${n}! Sobre o pedido #${p.codigo}: infelizmente uma das peças acabou 😕 Posso te mostrar outra opção parecida?`],
      ['Agradecer', 'heart', `${n}, obrigada pela compra na ${loja.nome}! 🖤 Marca a gente quando usar${loja.instagram ? ` (@${String(loja.instagram).replace(/^@/, '')})` : ''}. Volte sempre!`]
    ];
  }
  const linkWhats = (p, texto) => `https://wa.me/${whats(p.cliente && p.cliente.telefone)}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;

  function resumoTexto(p) {
    const cupom = App.cupomDoPedido(p);
    const linhas = (p.itens || []).map((i) => `${i.qtd}× ${i.nome}${i.cor ? ' — ' + i.cor : ''}${i.tamanho ? ' — Tam. ' + i.tamanho : ''}  ${r$((Number(i.preco) || 0) * (Number(i.qtd) || 0))}`);
    return [
      `Pedido #${p.codigo} — ${App.formatarDataHora(p.criadoEm)}`,
      `Cliente: ${nomeDe(p)}${p.cliente && p.cliente.telefone ? ' · ' + p.cliente.telefone : ''}`,
      retirar(p) ? 'Retirada na loja' : `Entrega: ${p.endereco || '—'}`,
      ...((cupom ? cupom.obs : p.obs) ? [`Obs.: ${cupom ? cupom.obs : p.obs}`] : []),
      '', ...linhas, '',
      ...(cupom ? [`Cupom ${cupom.codigo}: −${r$(cupom.desconto)}`] : []),
      `Total: ${r$(p.total)}`
    ].join('\n');
  }

  /* ---------- Carregar ---------- */
  async function carregar() {
    const [lista, produtos] = await Promise.all([Data.listarPedidos(), Data.listarProdutos().catch(() => [])]);
    pedidos = lista.map(App.limparPedido);
    fotos = new Map(produtos.filter((p) => p.foto).map((p) => [p.id, p.foto]));
    precos = new Map(produtos.map((p) => [p.id, Math.min(Number(p.preco) || 0, Number(p.precoPromocional) || Infinity)]));
    avisarNovos();
    desenharResumo();
    desenharFiltros();
    desenharLista();
    desenharDetalhe();
  }

  /* ---------- Pedido novo chegando: som + aviso ---------- */
  let audio = null;
  function tocar() {
    if (!som) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach((t, k) => {
        const o = audio.createOscillator(); const g = audio.createGain();
        o.type = 'sine'; o.frequency.value = k ? 1318.5 : 987.8;
        g.gain.setValueAtTime(0.0001, audio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.22, audio.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.32);
        o.connect(g).connect(audio.destination); o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.35);
      });
    } catch (er) { /* sem som */ }
  }
  function avisarNovos() {
    const ids = new Set(pedidos.map((p) => p.id));
    if (conhecidos) {
      const chegaram = pedidos.filter((p) => !conhecidos.has(p.id) && p.status === 'novo');
      if (chegaram.length) {
        tocar();
        App.toast(chegaram.length === 1 ? `Pedido novo de ${nomeDe(chegaram[0])} — ${r$(chegaram[0].total)}` : `${chegaram.length} pedidos novos chegaram`, 'sucesso', 7000);
        chegaram.forEach((p) => recemChegados.add(p.id));
      }
    }
    conhecidos = ids;
    const novos = pedidos.filter((p) => p.status === 'novo').length;
    document.title = novos ? `(${novos}) Pedidos online` : 'Pedidos online';
  }
  const recemChegados = new Set();
  function desenharSom() {
    $('btn-som').setAttribute('aria-pressed', String(som));
    $('btn-som').title = som ? 'Som de pedido novo: ligado' : 'Som de pedido novo: desligado';
    $('btn-som').innerHTML = `${App.icone(som ? 'bell-ring' : 'bell-off')}<span>${som ? 'Som ligado' : 'Som desligado'}</span>`;
    App.icones();
  }
  $('btn-som').addEventListener('click', () => {
    som = !som;
    try { localStorage.setItem(CHAVE_SOM, som ? 'sim' : 'nao'); } catch (er) { /* ignora */ }
    desenharSom();
    if (som) tocar();
  });

  /* ---------- Resumo ---------- */
  function desenharResumo() {
    const abertos = pedidos.filter((p) => ABERTO.includes(p.status));
    const novos = pedidos.filter((p) => p.status === 'novo');
    const aPagar = pedidos.filter((p) => p.status === 'confirmado' && !p.pago);
    const mes = new Date().toISOString().slice(0, 7);
    const dataVenda = (p) => String(((p.historico || []).find((h) => h.status === 'concluido') || {}).data || p.criadoEm).slice(0, 7);
    const vendidos = pedidos.filter((p) => p.status === 'concluido' && dataVenda(p) === mes);
    const nParados = abertos.filter(parado).length;
    const kpi = (icone, rot, valor, sub, classe = '', alvo = '') => `
      <${alvo ? `button type="button" data-ir="${alvo}"` : 'div'} class="pd-kpi ${classe}">
        <span class="pd-kpi-icone">${App.icone(icone)}</span>
        <span class="pd-kpi-txt"><small>${rot}</small><strong>${valor}</strong><em>${sub}</em></span>
      </${alvo ? 'button' : 'div'}>`;
    $('pd-resumo').innerHTML = [
      kpi('inbox', 'Esperando resposta', novos.length, novos.length ? 'responda pelo WhatsApp' : 'tudo respondido', novos.length ? 'destaque' : '', 'novo'),
      kpi('wallet', 'Aguardando pagamento', aPagar.length, aPagar.length ? r$(aPagar.reduce((s, p) => s + (Number(p.total) || 0), 0)) : 'nenhum', '', 'confirmado'),
      kpi('package', 'Em aberto', r$(abertos.reduce((s, p) => s + (Number(p.total) || 0), 0)), `${abertos.length} pedido${abertos.length === 1 ? '' : 's'}${nParados ? ` · ${nParados} parado${nParados === 1 ? '' : 's'}` : ''}`, nParados ? 'atencao' : '', 'abertos'),
      kpi('trending-up', 'Vendido pelo catálogo', r$(vendidos.reduce((s, p) => s + (Number(p.total) || 0), 0)), `${vendidos.length} pedido${vendidos.length === 1 ? '' : 's'} este mês`, '', 'concluido')
    ].join('');
    $('pd-resumo').querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.ir; selecionado = ''; desenharFiltros(); desenharLista(); desenharDetalhe(); }));
    App.icones();
  }

  /* ---------- Filtros ---------- */
  const FILTROS = [
    ['abertos', 'Em aberto', (p) => ABERTO.includes(p.status)],
    ['novo', 'Novos', (p) => p.status === 'novo'],
    ['confirmado', 'Confirmados', (p) => p.status === 'confirmado'],
    ['concluido', 'Viraram venda', (p) => p.status === 'concluido'],
    ['cancelado', 'Cancelados', (p) => p.status === 'cancelado'],
    ['todos', 'Todos', () => true]
  ];
  const regraFiltro = () => (FILTROS.find((f) => f[0] === filtro) || FILTROS[0])[2];
  function desenharFiltros() {
    $('pd-filtros').innerHTML = FILTROS.map(([id, nome, f]) => {
      const n = pedidos.filter(f).length;
      return `<button type="button" role="tab" data-filtro="${id}" aria-selected="${id === filtro}">${nome}<span>${n}</span></button>`;
    }).join('');
    $('pd-filtros').querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
      filtro = b.dataset.filtro; desenharFiltros(); desenharLista();
      if (!visiveis().some((p) => p.id === selecionado)) { selecionado = ''; desenharDetalhe(); }
    }));
  }
  function visiveis() {
    const t = busca.trim().toLowerCase();
    const dig = t.replace(/\D/g, '');
    let lista = pedidos.filter(regraFiltro());
    if (t) lista = lista.filter((p) => {
      const fone = String((p.cliente && p.cliente.telefone) || '').replace(/\D/g, '');
      return nomeDe(p).toLowerCase().includes(t) || String(p.codigo || '').toLowerCase().includes(t.replace('#', ''))
        || (dig.length >= 3 && fone.includes(dig)) || (p.itens || []).some((i) => String(i.nome).toLowerCase().includes(t));
    });
    const ordem = $('pd-ordem').value;
    // Em aberto: quem espera há mais tempo primeiro
    const antigoPrimeiro = ordem === 'antigos' || (ordem === 'auto' && ['abertos', 'novo', 'confirmado'].includes(filtro));
    return lista.sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)) * (antigoPrimeiro ? 1 : -1));
  }

  /* ---------- Lista ---------- */
  function desenharLista() {
    const lista = visiveis();
    const el = $('pd-lista');
    $('pd-contagem').textContent = `${lista.length} pedido${lista.length === 1 ? '' : 's'}`;
    if (!lista.length) {
      const textos = busca.trim() ? ['Nada encontrado', `Nenhum pedido com “${busca.trim()}”.`]
        : filtro === 'abertos' || filtro === 'novo' ? ['Tudo em dia', 'Quando uma cliente finalizar a sacola no catálogo, o pedido aparece aqui na hora.']
        : ['Nenhum pedido aqui', ''];
      el.innerHTML = `<div class="pd-vazio">${App.icone(busca.trim() ? 'search-x' : 'inbox')}<strong>${textos[0]}</strong><span>${textos[1]}</span></div>`;
      App.icones();
      return;
    }
    el.innerHTML = lista.map((p) => {
      const [sit, cls] = situacao(p);
      const et = etapas(p);
      const feitas = et.filter((x) => x.feito).length;
      const fotosItens = (p.itens || []).slice(0, 3).map((i) => { const f = fotos.get(i.produtoId); return `<span class="pd-mini">${f ? `<img src="${e(f)}" alt="" loading="lazy">` : App.icone('shirt')}</span>`; }).join('');
      return `<button type="button" class="pd-item${p.id === selecionado ? ' ativo' : ''}${parado(p) ? ' parado' : ''}${recemChegados.has(p.id) ? ' chegou' : ''}" data-id="${e(p.id)}">
        <span class="pd-avatar s-${cls}">${e(iniciais(p))}</span>
        <span class="pd-item-meio">
          <span class="pd-item-linha"><strong>${e(nomeDe(p))}</strong><b>${r$(p.total)}</b></span>
          <span class="pd-item-linha sub"><span>#${e(p.codigo || '')} · ${pecasDe(p)} peça${pecasDe(p) === 1 ? '' : 's'} · ${retirar(p) ? 'retirada' : 'entrega'}</span><span class="${parado(p) ? 'pd-tempo-alerta' : ''}">${quando(p.criadoEm)}</span></span>
          <span class="pd-item-linha pe">
            <span class="pd-status s-${cls}">${sit}</span>
            ${ABERTO.includes(p.status) ? `<span class="pd-progresso" title="${feitas} de ${et.length} etapas">${et.map((x) => `<i class="${x.feito ? 'ok' : ''}"></i>`).join('')}</span>` : ''}
            <span class="pd-minis">${fotosItens}</span>
          </span>
        </span>
      </button>`;
    }).join('');
    el.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => abrir(b.dataset.id)));
    App.icones();
  }

  function abrir(id) {
    selecionado = id;
    recemChegados.delete(id);
    const url = new URL(location.href); url.searchParams.set('pedido', id); history.replaceState(null, '', url);
    document.querySelectorAll('.pd-item').forEach((x) => x.classList.toggle('ativo', x.dataset.id === id));
    document.querySelector(`.pd-item[data-id="${CSS.escape(id)}"]`)?.classList.remove('chegou');
    desenharDetalhe();
    $('pd-layout').classList.add('com-detalhe');
    if (window.matchMedia('(max-width: 1023px)').matches) window.scrollTo({ top: 0 });
  }
  function fecharDetalhe() {
    selecionado = '';
    const url = new URL(location.href); url.searchParams.delete('pedido'); history.replaceState(null, '', url);
    $('pd-layout').classList.remove('com-detalhe');
    document.querySelectorAll('.pd-item').forEach((x) => x.classList.remove('ativo'));
    desenharDetalhe();
  }

  /* ---------- Detalhe ---------- */
  const achar = (id) => pedidos.find((p) => p.id === id);
  const NOMES_EVENTO = { novo: 'Pedido recebido', confirmado: 'Confirmado', cancelado: 'Cancelado', concluido: 'Virou venda', pago: 'Pagamento recebido', 'pago-desfeito': 'Pagamento desmarcado', pronto: 'Pronto para retirar', enviado: 'Enviado', 'pronto-desfeito': 'Voltou para separação' };

  /** Confere se o pedido bate com a loja (o pedido vem de fora, sem login) */
  function conferencia(p) {
    const avisos = [];
    const subtotal = (p.itens || []).reduce((s, i) => s + i.preco * i.qtd, 0);
    const cupom = App.cupomDoPedido(p);
    if (cupom) {
      const c = App.conferirCupom(cupom, loja, subtotal);
      if (!c.ok) avisos.push(`O cupom <strong>${e(cupom.codigo)}</strong> ${e(c.motivo)}.`);
      else if (cupom.desconto > c.desconto + 0.05) avisos.push(`O desconto do cupom deveria ser ${r$(c.desconto)}, mas o pedido diz ${r$(cupom.desconto)}.`);
    }
    const baratos = (p.itens || []).filter((i) => precos.has(i.produtoId) && i.preco < precos.get(i.produtoId) - 0.009);
    if (baratos.length) avisos.push(`Preço no pedido menor que o da loja: ${baratos.map((i) => `${e(i.nome)} (${r$(i.preco)} × loja ${r$(precos.get(i.produtoId))})`).join(', ')}.`);
    const esperado = subtotal - (cupom ? cupom.desconto : 0);
    if (Math.abs(esperado - p.total) > 0.05) avisos.push(`O total do pedido (${r$(p.total)}) não bate com as peças (${r$(esperado)}).`);
    return avisos;
  }

  function proximoPasso(p) {
    if (p.status === 'cancelado') return { titulo: 'Pedido cancelado', texto: 'As peças foram liberadas para o catálogo e o caixa.', acoes: `<button type="button" class="btn btn-secundario" data-acao="reabrir">${App.icone('rotate-ccw')}Reabrir pedido</button>` };
    if (p.status === 'concluido') return { titulo: 'Pedido finalizado', texto: `Virou a venda #${e(p.numeroVenda || '')}.`, acoes: p.vendaId ? `<a class="btn btn-secundario" href="vendas.html?venda=${encodeURIComponent(p.vendaId)}">${App.icone('receipt')}Ver venda</a>` : '' };
    if (p.status === 'novo') return { titulo: 'Confirme o pedido', texto: 'Fale com a cliente pelo WhatsApp para confirmar as peças e combinar o pagamento.', acoes: `<a class="btn btn-secundario" data-whats-msg="0" target="_blank" rel="noopener">${App.icone('message-circle')}Mandar “recebemos”</a><button type="button" class="btn btn-primario" data-acao="confirmar">${App.icone('check')}Confirmar pedido</button>` };
    if (!p.pago) return { titulo: 'Aguardando pagamento', texto: 'Quando a cliente pagar, marque a forma de pagamento.', acoes: `<div class="pd-formas">${FORMAS.map(([f, n]) => `<button type="button" class="btn btn-secundario" data-pago="${f}">${n}</button>`).join('')}</div>` };
    if (!separadoTudo(p)) return { titulo: 'Separe as peças', texto: `Marque cada peça ao separar (${qtdSeparados(p)} de ${(p.itens || []).length}).`, acoes: `<button type="button" class="btn btn-secundario" data-acao="separar-tudo">${App.icone('list-checks')}Marcar tudo separado</button><button type="button" class="btn btn-secundario" data-acao="imprimir">${App.icone('printer')}Imprimir para separar</button>` };
    if (!p.pronto) return { titulo: retirar(p) ? 'Avise que está pronto' : 'Envie o pedido', texto: retirar(p) ? 'Tudo separado. Avise a cliente que pode retirar.' : 'Tudo separado. Depois de despachar, marque como enviado.', acoes: `<button type="button" class="btn btn-primario" data-acao="pronto">${App.icone(retirar(p) ? 'store' : 'truck')}${retirar(p) ? 'Marcar pronto para retirar' : 'Marcar como enviado'}</button>` };
    return { titulo: 'Finalize no caixa', texto: 'Quando a cliente retirar (ou o pedido for entregue), registre a venda — as peças saem do estoque.', acoes: `<a class="btn btn-primario" href="pdv.html?pedido=${encodeURIComponent(p.id)}">${App.icone('scan-barcode')}Virar venda</a>` };
  }

  function desenharDetalhe() {
    const el = $('pd-detalhe');
    const p = achar(selecionado);
    if (!p) {
      $('pd-layout').classList.remove('com-detalhe');
      const novos = pedidos.filter((x) => x.status === 'novo').length;
      el.innerHTML = `<div class="pd-detalhe-vazio">${App.icone('mouse-pointer-click')}<strong>Escolha um pedido</strong><span>${novos ? `Você tem ${novos} pedido${novos === 1 ? '' : 's'} esperando resposta.` : 'Os detalhes aparecem aqui.'}</span></div>`;
      App.icones();
      return;
    }
    const [sit, cls] = situacao(p);
    const aberto = ABERTO.includes(p.status);
    const fone = whats(p.cliente && p.cliente.telefone);
    const cupom = App.cupomDoPedido(p);
    const obs = cupom ? cupom.obs : p.obs;
    const subtotal = (p.itens || []).reduce((s, i) => s + (Number(i.preco) || 0) * (Number(i.qtd) || 0), 0);
    const passo = proximoPasso(p);
    const hist = [{ status: 'novo', data: p.criadoEm, usuario: '' }, ...(p.historico || [])].slice().reverse();
    const mapa = p.endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.endereco)}` : '';

    el.innerHTML = `
      <div class="pd-d-topo">
        <button type="button" class="btn-icone pd-voltar" data-acao="fechar" aria-label="Voltar para a lista">${App.icone('arrow-left')}</button>
        <div class="pd-d-titulo">
          <div class="pd-d-codigo">Pedido #${e(p.codigo || p.id)} <span class="pd-status s-${cls}">${sit}</span>${parado(p) ? `<span class="pd-status s-alerta">Esperando ${quando(p.criadoEm).replace('há ', '')}</span>` : ''}</div>
          <small>${App.formatarDataHora(p.criadoEm)} · ${quando(p.criadoEm)}</small>
        </div>
        <div class="pd-d-mais">
          <button type="button" class="btn-icone" data-acao="imprimir" title="Imprimir pedido" aria-label="Imprimir pedido">${App.icone('printer')}</button>
          <button type="button" class="btn-icone" data-acao="copiar" title="Copiar resumo" aria-label="Copiar resumo">${App.icone('copy')}</button>
          ${aberto ? `<button type="button" class="btn-icone perigo" data-acao="cancelar" title="Cancelar pedido" aria-label="Cancelar pedido">${App.icone('x-circle')}</button>` : ''}
        </div>
      </div>

      <ol class="pd-etapas">${etapas(p).map((x, i, arr) => `<li class="${x.feito ? 'ok' : ''}${!x.feito && (i === 0 || arr[i - 1].feito) && p.status !== 'cancelado' ? ' atual' : ''}"><span>${x.feito ? App.icone('check') : i + 1}</span><em>${x.nome}</em></li>`).join('')}</ol>

      <section class="pd-passo${p.status === 'cancelado' ? ' cancelado' : ''}">
        <div><strong>${passo.titulo}</strong><span>${passo.texto}</span></div>
        <div class="pd-passo-acoes">${passo.acoes}</div>
      </section>

      <div class="pd-grade">
        <section class="pd-bloco">
          <h3>Cliente</h3>
          <div class="pd-cliente">
            <span class="pd-avatar grande s-${cls}">${e(iniciais(p))}</span>
            <div><strong>${e(nomeDe(p))}</strong>${p.cliente && p.cliente.telefone ? `<span>${e(p.cliente.telefone)}</span>` : '<span>Sem telefone</span>'}</div>
          </div>
          ${fone ? `<div class="pd-contato">
            <div class="pd-whats">
              <a class="btn btn-whats" href="${linkWhats(p, '')}" target="_blank" rel="noopener">${App.icone('message-circle')}WhatsApp</a>
              <button type="button" class="btn btn-secundario pd-whats-mais" data-acao="menu-whats" aria-expanded="false" aria-label="Mensagens prontas" title="Mensagens prontas">${App.icone('sparkles')}Mensagens</button>
              <div class="pd-menu" id="pd-menu-whats" hidden>
                <span>Mensagens prontas</span>
                ${mensagens(p).map(([t, ic], k) => `<a data-whats-msg="${k}" target="_blank" rel="noopener">${App.icone(ic)}${e(t)}</a>`).join('')}
              </div>
            </div>
            <a class="btn-icone" href="tel:${e(String(p.cliente.telefone).replace(/[^\d+]/g, ''))}" title="Ligar" aria-label="Ligar">${App.icone('phone')}</a>
          </div>` : ''}
        </section>

        <section class="pd-bloco">
          <h3>${retirar(p) ? 'Retirada' : 'Entrega'}</h3>
          ${retirar(p)
            ? `<div class="pd-entrega">${App.icone('store')}<div><strong>Vai retirar na loja</strong><span>${p.pronto ? `Avisada em ${App.formatarDataHora(p.pronto.data)}` : 'Avise quando estiver pronto'}</span></div></div>`
            : `<div class="pd-entrega">${App.icone('truck')}<div><strong>Enviar para</strong><span>${e(p.endereco || '—')}</span></div></div>
               ${p.endereco ? `<div class="pd-entrega-acoes"><a class="btn btn-secundario" href="${mapa}" target="_blank" rel="noopener">${App.icone('map-pin')}Ver no mapa</a><button type="button" class="btn btn-secundario" data-acao="copiar-end">${App.icone('copy')}Copiar endereço</button></div>` : ''}`}
          ${p.pago ? `<div class="pd-pago">${App.icone('badge-check')}<span>Pago no <strong>${e(nomeForma(p.pago.forma))}</strong> · ${App.formatarDataHora(p.pago.data)}</span>${aberto ? '<button type="button" data-acao="desfazer-pago">Desfazer</button>' : ''}</div>` : ''}
        </section>
      </div>

      ${ABERTO.includes(p.status) && conferencia(p).length ? `<div class="alerta perigo pd-conferir">${App.icone('shield-alert')}<span><strong>Confira antes de cobrar:</strong> ${conferencia(p).join(' ')} No caixa vale o preço da loja.</span></div>` : ''}
      ${obs ? `<div class="pd-obs">${App.icone('quote')}<span>${e(obs)}</span></div>` : ''}

      <section class="pd-bloco">
        <div class="pd-bloco-cabeca"><h3>Peças</h3>${aberto ? `<span class="pd-sep-cont">${qtdSeparados(p)}/${(p.itens || []).length} separadas</span>` : ''}</div>
        <ul class="pd-itens">${(p.itens || []).map((i, k) => {
          const f = fotos.get(i.produtoId);
          const sep = !!(p.separados && p.separados[k]);
          return `<li class="${sep ? 'separado' : ''}">
            ${aberto ? `<label class="pd-check" title="Separado"><input type="checkbox" data-separar="${k}" ${sep ? 'checked' : ''} aria-label="Peça ${e(i.nome)} separada"><span>${App.icone('check')}</span></label>` : ''}
            <span class="pd-foto">${f ? `<img src="${e(f)}" alt="" loading="lazy">` : App.icone('shirt')}</span>
            <span class="pd-item-info"><strong>${e(i.nome)}</strong><small>${e([i.cor, i.tamanho && 'Tam. ' + i.tamanho].filter(Boolean).join(' · '))}${i.sku ? `<span class="pd-sku"> · <span class="mono">${e(i.sku)}</span></span>` : ''}</small></span>
            <span class="pd-qtd">${i.qtd}×</span>
            <span class="pd-preco">${r$((Number(i.preco) || 0) * (Number(i.qtd) || 0))}</span>
          </li>`;
        }).join('')}</ul>
        <div class="pd-totais">
          ${cupom ? `<div><span>Subtotal</span><span>${r$(subtotal)}</span></div><div class="pd-cupom-linha"><span>${App.icone('ticket-percent')}Cupom ${e(cupom.codigo)}</span><span>−${r$(cupom.desconto)}</span></div>` : ''}
          <div class="total"><span>Total</span><strong>${r$(p.total)}</strong></div>
        </div>
      </section>

      <section class="pd-bloco">
        <h3>Anotação da loja <small>só vocês veem</small></h3>
        <textarea class="textarea pd-nota" id="pd-nota" rows="2" maxlength="200" placeholder="Ex.: pagou no Pix, vem buscar sábado…" ${p.status === 'concluido' ? 'disabled' : ''}>${e(p.observacaoLoja || '')}</textarea>
      </section>

      <section class="pd-bloco">
        <h3>Histórico</h3>
        <ol class="pd-hist">${hist.map((h) => `<li><span class="pd-hist-ponto s-${h.status === 'cancelado' ? 'cancelado' : h.status === 'concluido' ? 'concluido' : 'ok'}"></span><div><strong>${NOMES_EVENTO[h.status] || h.status}</strong><small>${App.formatarDataHora(h.data)}${h.usuario ? ` · ${e(h.usuario.split(' ')[0])}` : ''}</small></div></li>`).join('')}</ol>
      </section>

      ${aberto ? `<div class="pd-rodape">
        <button type="button" class="btn btn-fantasma pd-cancelar" data-acao="cancelar">${App.icone('x')}Cancelar pedido</button>
        ${p.pronto ? "" : `<a class="btn btn-primario" href="pdv.html?pedido=${encodeURIComponent(p.id)}">${App.icone("scan-barcode")}Virar venda</a>`}
      </div>` : ''}`;
    ligarDetalhe(p);
    App.icones();
  }

  async function atualizar(id, dados, msg) {
    try { await Data.atualizarPedido(id, dados); if (msg) App.toast(msg, 'sucesso'); await carregar(); } catch (er) { App.toast(er.message, 'erro'); }
  }

  function ligarDetalhe(p) {
    const el = $('pd-detalhe');
    const acao = (nome, fn) => el.querySelectorAll(`[data-acao="${nome}"]`).forEach((b) => b.addEventListener('click', fn));
    acao('fechar', fecharDetalhe);
    acao('confirmar', () => atualizar(p.id, { status: 'confirmado' }, 'Pedido confirmado. As peças continuam reservadas.'));
    acao('reabrir', () => atualizar(p.id, { status: 'novo' }, 'Pedido reaberto — as peças voltaram a ficar reservadas.'));
    acao('pronto', () => atualizar(p.id, { pronto: true }, retirar(p) ? 'Marcado como pronto. Avise a cliente pelo WhatsApp.' : 'Marcado como enviado.'));
    acao('desfazer-pago', () => atualizar(p.id, { pago: null }, 'Pagamento desmarcado.'));
    acao('separar-tudo', () => atualizar(p.id, { separados: (p.itens || []).map(() => true) }, 'Todas as peças separadas.'));
    acao('cancelar', async () => {
      const ok = await App.confirmar({ titulo: `Cancelar o pedido #${p.codigo}?`, mensagem: 'As peças voltam a ficar disponíveis no catálogo e no caixa.', textoConfirmar: 'Cancelar pedido', textoCancelar: 'Voltar', perigo: true });
      if (ok) atualizar(p.id, { status: 'cancelado' }, 'Pedido cancelado. As peças foram liberadas.');
    });
    acao('copiar', async () => { try { await navigator.clipboard.writeText(resumoTexto(p)); App.toast('Resumo do pedido copiado.'); } catch (er) { App.toast('Não deu para copiar neste navegador.', 'erro'); } });
    acao('copiar-end', async () => { try { await navigator.clipboard.writeText(p.endereco || ''); App.toast('Endereço copiado.'); } catch (er) { /* ignora */ } });
    acao('imprimir', () => imprimirPedido(p));
    el.querySelectorAll('[data-pago]').forEach((b) => b.addEventListener('click', () => atualizar(p.id, { pago: { forma: b.dataset.pago } }, `Pagamento no ${nomeForma(b.dataset.pago)} registrado.`)));
    el.querySelectorAll('[data-separar]').forEach((c) => c.addEventListener('change', () => {
      const lista = (p.itens || []).map((_, i) => !!(p.separados && p.separados[i]));
      lista[Number(c.dataset.separar)] = c.checked;
      atualizar(p.id, { separados: lista }, lista.every(Boolean) ? 'Tudo separado ✓' : '');
    }));
    // Mensagens prontas
    el.querySelectorAll('[data-whats-msg]').forEach((a) => {
      a.href = linkWhats(p, mensagens(p)[Number(a.dataset.whatsMsg)][2]);
      a.addEventListener('click', () => { $('pd-menu-whats') && ($('pd-menu-whats').hidden = true); });
    });
    const menu = $('pd-menu-whats');
    acao('menu-whats', (ev) => {
      ev.stopPropagation();
      menu.hidden = !menu.hidden;
      ev.currentTarget.setAttribute('aria-expanded', String(!menu.hidden));
    });
    // Anotação: salva sozinha
    const nota = $('pd-nota');
    if (nota) {
      const salvar = async () => {
        if ((p.observacaoLoja || '') === nota.value.trim()) return;
        try { await Data.atualizarPedido(p.id, { observacaoLoja: nota.value.trim() }); p.observacaoLoja = nota.value.trim(); App.toast('Anotação salva.'); } catch (er) { App.toast(er.message, 'erro'); }
      };
      nota.addEventListener('blur', salvar);
      nota.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); nota.blur(); } });
    }
  }
  document.addEventListener('click', (ev) => { const m = $('pd-menu-whats'); if (m && !m.hidden && !ev.target.closest('.pd-whats')) m.hidden = true; });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const m = $('pd-menu-whats');
    if (m && !m.hidden) { m.hidden = true; return; }
    if (selecionado && !document.activeElement.matches('input, textarea')) fecharDetalhe();
  });

  /* ---------- Folha de separação (impressora de recibo) ---------- */
  function imprimirPedido(p) {
    App.imprimirTira(App.htmlPedidoOnline({ loja, pedido: p }));
  }

  /* ---------- Eventos ---------- */
  $('pd-busca').addEventListener('input', (ev) => { busca = ev.target.value; desenharLista(); });
  $('pd-ordem').addEventListener('change', desenharLista);
  window.addEventListener('dados-alterados', () => { if (!document.activeElement || !document.activeElement.matches('#pd-nota')) carregar(); });
  setInterval(() => { if (!document.activeElement || !document.activeElement.matches('#pd-nota, #pd-busca')) { desenharResumo(); desenharLista(); } }, 60000);

  desenharSom();
  await carregar();
  if (selecionado && achar(selecionado)) {
    const p = achar(selecionado);
    if (!regraFiltro()(p)) { filtro = 'todos'; desenharFiltros(); desenharLista(); }
    abrir(selecionado);
  } else if (window.matchMedia('(min-width: 1024px)').matches) {
    // No computador já abre o primeiro da lista
    const primeiro = visiveis()[0];
    if (primeiro) abrir(primeiro.id);
  }
});
