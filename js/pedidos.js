/* ==========================================================================
   pedidos.js — Pedidos online (feitos no catálogo): ver, confirmar,
   falar com a cliente (mensagens prontas), anotar, cancelar (libera a
   reserva) e virar venda no caixa
   ========================================================================== */
App.aoIniciar(async () => {
  const $ = (id) => document.getElementById(id);
  const e = App.escapeHtml;
  const r$ = App.formatarMoeda;
  let pedidos = [];
  let fotos = new Map();   // produtoId → foto
  let aba = 'novo';
  let busca = '';
  const loja = await Data.obterLoja();
  $('btn-catalogo').href = Data.linkCatalogo();

  const ABERTO = ['novo', 'confirmado'];
  const HORAS_PARADO = 24;

  async function carregar() {
    const [lista, produtos] = await Promise.all([Data.listarPedidos(), Data.listarProdutos().catch(() => [])]);
    pedidos = lista;
    fotos = new Map(produtos.filter((p) => p.foto).map((p) => [p.id, p.foto]));
    ['novo', 'confirmado', 'concluido', 'cancelado'].forEach((s) => {
      const el = document.querySelector(`[data-cont="${s}"]`);
      if (el) el.textContent = pedidos.filter((p) => p.status === s).length;
    });
    desenharResumo();
    desenhar();
  }

  const whats = (t) => { let d = String(t || '').replace(/\D/g, ''); if (!d) return ''; if (d.length <= 11) d = '55' + d; return d; };
  const horasDesde = (iso) => (Date.now() - new Date(iso).getTime()) / 3600000;
  const quando = (iso) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    if (min < 1440) return `há ${Math.round(min / 60)} h`;
    const dias = Math.round(min / 1440);
    return dias <= 6 ? `há ${dias} dia${dias === 1 ? '' : 's'}` : App.formatarDataHora(iso);
  };
  const pecasDe = (p) => (p.itens || []).reduce((s, i) => s + (Number(i.qtd) || 0), 0);
  const primeiroNome = (p) => ((p.cliente && p.cliente.nome) || '').split(' ')[0] || 'tudo bem';

  /* ---------- Resumo no topo ---------- */
  function desenharResumo() {
    const abertos = pedidos.filter((p) => ABERTO.includes(p.status));
    const novos = pedidos.filter((p) => p.status === 'novo');
    const mes = new Date().toISOString().slice(0, 7);
    const vendidosMes = pedidos.filter((p) => p.status === 'concluido' && String(((p.historico || []).find((h) => h.status === 'concluido') || {}).data || p.criadoEm).slice(0, 7) === mes);
    const parados = abertos.filter((p) => horasDesde(p.criadoEm) > HORAS_PARADO).length;
    const cartao = (rot, valor, sub, classe = '') => `<div class="ped-kpi ${classe}"><span>${rot}</span><strong>${valor}</strong><small>${sub}</small></div>`;
    $('ped-resumo').innerHTML = [
      cartao('Esperando resposta', novos.length, novos.length ? 'responda pelo WhatsApp' : 'tudo respondido', novos.length ? 'destaque' : ''),
      cartao('Em aberto', r$(abertos.reduce((s, p) => s + (Number(p.total) || 0), 0)), `${abertos.length} pedido${abertos.length === 1 ? '' : 's'}${parados ? ` · ${parados} parado${parados === 1 ? '' : 's'}` : ''}`, parados ? 'atencao' : ''),
      cartao('Peças reservadas', abertos.reduce((s, p) => s + pecasDe(p), 0), 'saem do estoque do catálogo'),
      cartao('Vendido pelo catálogo', r$(vendidosMes.reduce((s, p) => s + (Number(p.total) || 0), 0)), `${vendidosMes.length} pedido${vendidosMes.length === 1 ? '' : 's'} este mês`)
    ].join('');
  }

  /* ---------- Mensagens prontas de WhatsApp ---------- */
  function mensagens(p) {
    const n = primeiroNome(p);
    const pecas = pecasDe(p);
    const lista = (p.itens || []).map((i) => `• ${i.qtd}× ${i.nome}${[i.cor, i.tamanho && 'tam. ' + i.tamanho].filter(Boolean).length ? ' (' + [i.cor, i.tamanho && 'tam. ' + i.tamanho].filter(Boolean).join(', ') + ')' : ''}`).join('\n');
    const retirar = p.entrega !== 'entregar';
    return [
      ['Recebemos o pedido', `Olá, ${n}! Aqui é da ${loja.nome} 💛 Recebemos o seu pedido #${p.codigo}:\n${lista}\nTotal: ${r$(p.total)} (${pecas} peça${pecas === 1 ? '' : 's'}). Já vamos separar!`],
      ['Combinar pagamento', `Oi, ${n}! Seu pedido #${p.codigo} deu ${r$(p.total)}. Você prefere pagar por Pix ou cartão? Assim que confirmar, a gente ${retirar ? 'deixa separado pra você' : 'já envia'} 😉`],
      retirar
        ? ['Pronto para retirar', `Oi, ${n}! Seu pedido #${p.codigo} está separado e pronto pra retirar na ${loja.nome}${loja.endereco ? ` (${loja.endereco})` : ''}. Te esperamos! 🖤`]
        : ['Pedido enviado', `Oi, ${n}! Seu pedido #${p.codigo} já foi enviado para ${p.endereco || 'o seu endereço'}. Qualquer coisa é só chamar! 📦`],
      ['Peça em falta', `Oi, ${n}! Sobre o pedido #${p.codigo}: infelizmente uma das peças acabou 😕 Posso te mostrar outra opção parecida?`],
      ['Agradecer', `${n}, obrigada pela compra na ${loja.nome}! 🖤 Marca a gente quando usar${loja.instagram ? ` (@${String(loja.instagram).replace(/^@/, '')})` : ''}. Volte sempre!`]
    ];
  }

  function resumoTexto(p) {
    const linhas = (p.itens || []).map((i) => `${i.qtd}× ${i.nome}${i.cor ? ' — ' + i.cor : ''}${i.tamanho ? ' — Tam. ' + i.tamanho : ''}  ${r$((Number(i.preco) || 0) * (Number(i.qtd) || 0))}`);
    return [
      `Pedido #${p.codigo} — ${App.formatarDataHora(p.criadoEm)}`,
      `Cliente: ${(p.cliente && p.cliente.nome) || '—'}${p.cliente && p.cliente.telefone ? ' · ' + p.cliente.telefone : ''}`,
      p.entrega === 'entregar' ? `Entrega: ${p.endereco || '—'}` : 'Retirada na loja',
      ...(p.obs ? [`Obs.: ${p.obs}`] : []),
      '',
      ...linhas,
      '',
      `Total: ${r$(p.total)}`
    ].join('\n');
  }

  const NOMES_STATUS = { novo: 'Recebido', confirmado: 'Confirmado', cancelado: 'Cancelado', concluido: 'Virou venda' };

  function badge(p) {
    if (p.status === 'novo') return '<span class="badge badge-info">Novo</span>';
    if (p.status === 'confirmado') return '<span class="badge badge-alerta">Confirmado</span>';
    if (p.status === 'concluido') return `<span class="badge badge-sucesso">Venda #${e(p.numeroVenda || '')}</span>`;
    return '<span class="badge badge-perigo">Cancelado</span>';
  }

  function filtrar(lista) {
    const t = busca.trim().toLowerCase();
    if (!t) return lista;
    const dig = t.replace(/\D/g, '');
    return lista.filter((p) => {
      const nome = String((p.cliente && p.cliente.nome) || '').toLowerCase();
      const fone = String((p.cliente && p.cliente.telefone) || '').replace(/\D/g, '');
      const pecas = (p.itens || []).map((i) => i.nome).join(' ').toLowerCase();
      return nome.includes(t) || String(p.codigo || '').toLowerCase().includes(t.replace('#', '')) || (dig.length >= 3 && fone.includes(dig)) || pecas.includes(t);
    });
  }

  function cartao(p) {
    const nome = (p.cliente && p.cliente.nome) || 'Cliente sem nome';
    const fone = whats(p.cliente && p.cliente.telefone);
    const aberto = ABERTO.includes(p.status);
    const parado = aberto && horasDesde(p.criadoEm) > HORAS_PARADO;
    const hist = (p.historico || []).filter((h) => h.status !== 'novo');
    return `<article class="card ped${parado ? ' parado' : ''}" data-id="${e(p.id)}">
      <div class="ped-topo">
        <div class="ped-quem">
          <div class="ped-codigo">#${e(p.codigo || p.id)} ${badge(p)}${parado ? `<span class="badge badge-perigo">Esperando ${quando(p.criadoEm)}</span>` : ''}</div>
          <div class="ped-nome"><strong>${e(nome)}</strong>${p.cliente && p.cliente.telefone ? `<span>${e(p.cliente.telefone)}</span>` : ''}</div>
          <div class="ped-linha">${p.entrega === 'entregar' ? `${App.icone('truck')}Enviar para: ${e(p.endereco || '—')}` : `${App.icone('store')}Vai retirar na loja`}</div>
          ${p.obs ? `<div class="ped-linha ped-obs">${App.icone('message-square')}“${e(p.obs)}”</div>` : ''}
        </div>
        <div class="ped-valor"><strong>${r$(p.total)}</strong><span>${pecasDe(p)} peça${pecasDe(p) === 1 ? '' : 's'} · ${quando(p.criadoEm)}</span></div>
      </div>

      <ul class="ped-itens">${(p.itens || []).map((i) => {
        const f = fotos.get(i.produtoId);
        return `<li>
          <span class="ped-foto">${f ? `<img src="${e(f)}" alt="" loading="lazy">` : App.icone('shirt')}</span>
          <span class="ped-item"><strong>${e(i.nome)}</strong><small>${e([i.cor, i.tamanho && 'Tam. ' + i.tamanho].filter(Boolean).join(' · '))}${Number(i.qtd) > 1 ? ` · ${i.qtd} unid.` : ''}</small></span>
          <span class="ped-preco">${r$((Number(i.preco) || 0) * (Number(i.qtd) || 0))}</span>
        </li>`;
      }).join('')}</ul>

      <div class="ped-nota">
        ${App.icone('notebook-pen')}
        <input class="input" data-nota="${e(p.id)}" value="${e(p.observacaoLoja || '')}" maxlength="200" placeholder="Anotação da loja (só vocês veem): pagou no Pix, separar amanhã…" aria-label="Anotação da loja sobre o pedido #${e(p.codigo || '')}"${p.status === 'concluido' ? ' disabled' : ''}>
      </div>

      ${hist.length ? `<div class="ped-hist">${App.icone('history')}Recebido ${App.formatarDataHora(p.criadoEm)}${hist.map((h) => ` · ${NOMES_STATUS[h.status] || h.status} ${App.formatarDataHora(h.data)}${h.usuario ? ' por ' + e(h.usuario.split(' ')[0]) : ''}`).join('')}</div>` : ''}

      <footer class="ped-acoes">
        ${fone ? `<div class="ped-whats">
          <a class="btn btn-secundario" href="https://wa.me/${fone}" target="_blank" rel="noopener" data-whats="${e(p.id)}"><i data-lucide="message-circle"></i>WhatsApp</a>
          <button type="button" class="btn btn-secundario ped-whats-mais" data-menu-whats="${e(p.id)}" aria-label="Mensagens prontas" aria-expanded="false" title="Mensagens prontas"><i data-lucide="chevron-down"></i></button>
          <div class="ped-menu" hidden>${mensagens(p).map(([t], k) => `<button type="button" data-msg="${k}">${e(t)}</button>`).join('')}</div>
        </div>` : ''}
        <button type="button" class="btn btn-fantasma" data-copiar="${e(p.id)}" title="Copiar o resumo do pedido"><i data-lucide="copy"></i>Copiar</button>
        ${aberto ? `<button type="button" class="btn btn-fantasma ped-cancelar" data-cancelar="${e(p.id)}"><i data-lucide="x"></i>Cancelar</button>` : ''}
        ${p.status === 'cancelado' ? `<button type="button" class="btn btn-fantasma" data-reabrir="${e(p.id)}"><i data-lucide="rotate-ccw"></i>Reabrir</button>` : ''}
        <span class="ped-espaco"></span>
        ${p.status === 'novo' ? `<button type="button" class="btn btn-secundario" data-confirmar="${e(p.id)}"><i data-lucide="check"></i>Confirmar</button>` : ''}
        ${aberto ? `<a class="btn btn-primario" href="pdv.html?pedido=${encodeURIComponent(p.id)}"><i data-lucide="scan-barcode"></i>Virar venda</a>` : ''}
        ${p.status === 'concluido' && p.vendaId ? `<a class="btn btn-secundario" href="vendas.html?venda=${encodeURIComponent(p.vendaId)}"><i data-lucide="receipt"></i>Ver venda</a>` : ''}
      </footer>
    </article>`;
  }

  function desenhar() {
    const daAba = pedidos.filter((p) => p.status === aba);
    // Abertos: o mais antigo primeiro (é quem está esperando há mais tempo)
    if (ABERTO.includes(aba)) daAba.sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
    const lista = filtrar(daAba);
    const el = $('lista-pedidos');
    if (!lista.length) {
      const textos = busca.trim() && daAba.length
        ? ['Nada encontrado', `Nenhum pedido desta aba com “${busca.trim()}”.`]
        : {
          novo: ['Nenhum pedido novo', 'Quando uma cliente finalizar a sacola no catálogo, o pedido aparece aqui na hora.'],
          confirmado: ['Nenhum pedido confirmado', 'Confirme um pedido novo depois de combinar com a cliente.'],
          concluido: ['Nenhum pedido virou venda ainda', ''],
          cancelado: ['Nenhum pedido cancelado', '']
        }[aba];
      el.innerHTML = `<div class="card">${App.estadoVazio({ icone: 'inbox', titulo: textos[0], texto: textos[1] })}</div>`;
      App.icones();
      return;
    }
    el.innerHTML = lista.map(cartao).join('');
    ligarAcoes(el);
    App.icones();
  }

  const achar = (id) => pedidos.find((p) => p.id === id);

  function ligarAcoes(el) {
    el.querySelectorAll('[data-confirmar]').forEach((b) => b.addEventListener('click', async () => {
      try { await Data.atualizarPedido(b.dataset.confirmar, { status: 'confirmado' }); App.toast('Pedido confirmado. As peças continuam reservadas.', 'sucesso'); await carregar(); } catch (er) { App.toast(er.message, 'erro'); }
    }));
    el.querySelectorAll('[data-cancelar]').forEach((b) => b.addEventListener('click', async () => {
      const ok = await App.confirmar({ titulo: 'Cancelar este pedido?', mensagem: 'As peças voltam a ficar disponíveis no catálogo e no caixa.', textoConfirmar: 'Cancelar pedido', textoCancelar: 'Voltar', perigo: true });
      if (!ok) return;
      try { await Data.atualizarPedido(b.dataset.cancelar, { status: 'cancelado' }); App.toast('Pedido cancelado. As peças foram liberadas.'); await carregar(); } catch (er) { App.toast(er.message, 'erro'); }
    }));
    el.querySelectorAll('[data-reabrir]').forEach((b) => b.addEventListener('click', async () => {
      try { await Data.atualizarPedido(b.dataset.reabrir, { status: 'novo' }); App.toast('Pedido reaberto — as peças voltaram a ficar reservadas.'); aba = 'novo'; marcarAba(); await carregar(); } catch (er) { App.toast(er.message, 'erro'); }
    }));
    // Anotação da loja: salva ao sair do campo (ou Enter)
    el.querySelectorAll('[data-nota]').forEach((inp) => {
      const salvar = async () => {
        const p = achar(inp.dataset.nota);
        if (!p || (p.observacaoLoja || '') === inp.value.trim()) return;
        try { await Data.atualizarPedido(p.id, { observacaoLoja: inp.value.trim() }); p.observacaoLoja = inp.value.trim(); App.toast('Anotação salva.'); } catch (er) { App.toast(er.message, 'erro'); }
      };
      inp.addEventListener('blur', salvar);
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); } });
    });
    el.querySelectorAll('[data-copiar]').forEach((b) => b.addEventListener('click', async () => {
      const p = achar(b.dataset.copiar);
      try { await navigator.clipboard.writeText(resumoTexto(p)); App.toast('Resumo do pedido copiado.'); } catch (er) { App.toast('Não deu para copiar neste navegador.', 'erro'); }
    }));
    // WhatsApp: botão principal manda a 1ª mensagem; a setinha abre as outras
    el.querySelectorAll('[data-whats]').forEach((a) => {
      const p = achar(a.dataset.whats);
      a.href = `https://wa.me/${whats(p.cliente.telefone)}?text=${encodeURIComponent(mensagens(p)[0][1])}`;
    });
    el.querySelectorAll('[data-menu-whats]').forEach((b) => {
      const menu = b.nextElementSibling;
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const abrir = menu.hidden;
        fecharMenus();
        menu.hidden = !abrir;
        b.setAttribute('aria-expanded', String(abrir));
      });
      menu.querySelectorAll('[data-msg]').forEach((m) => m.addEventListener('click', () => {
        const p = achar(b.dataset.menuWhats);
        window.open(`https://wa.me/${whats(p.cliente.telefone)}?text=${encodeURIComponent(mensagens(p)[Number(m.dataset.msg)][1])}`, '_blank', 'noopener');
        fecharMenus();
      }));
    });
  }
  function fecharMenus() {
    document.querySelectorAll('.ped-menu').forEach((m) => { m.hidden = true; });
    document.querySelectorAll('[data-menu-whats]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  document.addEventListener('click', (ev) => { if (!ev.target.closest('.ped-whats')) fecharMenus(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fecharMenus(); });

  function marcarAba() {
    document.querySelectorAll('#abas-ped [data-status]').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.status === aba)));
  }
  document.querySelectorAll('#abas-ped [data-status]').forEach((b) => b.addEventListener('click', () => {
    aba = b.dataset.status;
    marcarAba();
    desenhar();
  }));
  $('busca-pedidos').addEventListener('input', (ev) => { busca = ev.target.value; desenhar(); });

  // Não redesenha enquanto alguém digita a anotação (perderia o texto)
  window.addEventListener('dados-alterados', () => { if (!document.activeElement || !document.activeElement.matches('[data-nota]')) carregar(); });
  // Atualiza o "há X min" e os pedidos parados
  setInterval(() => { if (!document.activeElement || !document.activeElement.matches('[data-nota], #busca-pedidos')) { desenharResumo(); desenhar(); } }, 60000);
  await carregar();
});
