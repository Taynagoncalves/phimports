/* ==========================================================================
   pedidos.js — Pedidos online (feitos no catálogo): ver, confirmar,
   falar com a cliente, cancelar (libera a reserva) e virar venda no caixa
   ========================================================================== */
App.aoIniciar(async () => {
  const $ = (id) => document.getElementById(id);
  const e = App.escapeHtml;
  const r$ = App.formatarMoeda;
  let pedidos = [];
  let aba = 'novo';
  const loja = await Data.obterLoja();
  $('btn-catalogo').href = Data.linkCatalogo();

  async function carregar() {
    pedidos = await Data.listarPedidos();
    ['novo', 'confirmado', 'concluido', 'cancelado'].forEach((s) => {
      const el = document.querySelector(`[data-cont="${s}"]`);
      if (el) el.textContent = pedidos.filter((p) => p.status === s).length;
    });
    desenhar();
  }

  const whats = (t) => { let d = String(t || '').replace(/\D/g, ''); if (!d) return ''; if (d.length <= 11) d = '55' + d; return d; };
  const quando = (iso) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    if (min < 1440) return `há ${Math.round(min / 60)} h`;
    return App.formatarDataHora(iso);
  };

  function desenhar() {
    const lista = pedidos.filter((p) => p.status === aba);
    const el = $('lista-pedidos');
    if (!lista.length) {
      const textos = {
        novo: ['Nenhum pedido novo', 'Quando uma cliente finalizar a sacola no catálogo, o pedido aparece aqui na hora.'],
        confirmado: ['Nenhum pedido confirmado', 'Confirme um pedido novo depois de combinar com a cliente.'],
        concluido: ['Nenhum pedido virou venda ainda', ''],
        cancelado: ['Nenhum pedido cancelado', '']
      }[aba];
      el.innerHTML = `<div class="card">${App.estadoVazio({ icone: 'inbox', titulo: textos[0], texto: textos[1] })}</div>`;
      App.icones();
      return;
    }
    el.innerHTML = lista.map((p) => {
      const nome = (p.cliente && p.cliente.nome) || 'Cliente sem nome';
      const fone = whats(p.cliente && p.cliente.telefone);
      const pecas = (p.itens || []).reduce((s, i) => s + (Number(i.qtd) || 0), 0);
      const aberto = p.status === 'novo' || p.status === 'confirmado';
      const msg = `Olá, ${nome.split(' ')[0]}! Aqui é da ${loja.nome} 💛 Recebemos o seu pedido #${p.codigo} (${pecas} peça${pecas === 1 ? '' : 's'}, ${r$(p.total)}).`;
      return `<article class="card pedido" data-id="${e(p.id)}">
        <header class="pedido-topo">
          <div>
            <div class="pedido-codigo">#${e(p.codigo || p.id)} ${p.status === 'novo' ? '<span class="badge badge-info">Novo</span>' : p.status === 'confirmado' ? '<span class="badge badge-alerta">Confirmado</span>' : p.status === 'concluido' ? `<span class="badge badge-sucesso">Venda #${e(p.numeroVenda || '')}</span>` : '<span class="badge badge-perigo">Cancelado</span>'}</div>
            <div class="texto-xs texto-3">${quando(p.criadoEm)}</div>
          </div>
          <strong class="pedido-total">${r$(p.total)}</strong>
        </header>
        <div class="pedido-cliente">
          <div><strong>${e(nome)}</strong>${p.cliente && p.cliente.telefone ? `<span class="texto-3"> · ${e(p.cliente.telefone)}</span>` : ''}</div>
          <div class="texto-sm texto-3">${p.entrega === 'entregar' ? `<i data-lucide="truck"></i>Enviar para: ${e(p.endereco || '—')}` : '<i data-lucide="store"></i>Vai retirar na loja'}</div>
          ${p.obs ? `<div class="texto-sm"><i data-lucide="message-square"></i>${e(p.obs)}</div>` : ''}
        </div>
        <ul class="pedido-itens">${(p.itens || []).map((i) => `
          <li><span>${i.qtd}× ${e(i.nome)} <span class="texto-3">${e([i.cor, i.tamanho && 'Tam. ' + i.tamanho].filter(Boolean).join(' · '))}</span></span><span>${r$((Number(i.preco) || 0) * (Number(i.qtd) || 0))}</span></li>`).join('')}
        </ul>
        <footer class="pedido-acoes">
          ${fone ? `<a class="btn btn-secundario btn-sm" href="https://wa.me/${fone}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener"><i data-lucide="message-circle"></i>WhatsApp</a>` : ''}
          ${aberto ? `<button type="button" class="btn btn-fantasma btn-sm" data-cancelar="${e(p.id)}"><i data-lucide="x"></i>Cancelar</button>` : ''}
          <span class="pedido-espaco"></span>
          ${p.status === 'novo' ? `<button type="button" class="btn btn-secundario btn-sm" data-confirmar="${e(p.id)}"><i data-lucide="check"></i>Confirmar</button>` : ''}
          ${aberto ? `<a class="btn btn-primario btn-sm" href="pdv.html?pedido=${encodeURIComponent(p.id)}"><i data-lucide="scan-barcode"></i>Virar venda</a>` : ''}
          ${p.status === 'concluido' && p.vendaId ? `<a class="btn btn-secundario btn-sm" href="vendas.html?venda=${encodeURIComponent(p.vendaId)}"><i data-lucide="receipt"></i>Ver venda</a>` : ''}
        </footer>
      </article>`;
    }).join('');
    el.querySelectorAll('[data-confirmar]').forEach((b) => b.addEventListener('click', async () => {
      try { await Data.atualizarPedido(b.dataset.confirmar, { status: 'confirmado' }); App.toast('Pedido confirmado. As peças continuam reservadas.', 'sucesso'); await carregar(); } catch (er) { App.toast(er.message, 'erro'); }
    }));
    el.querySelectorAll('[data-cancelar]').forEach((b) => b.addEventListener('click', async () => {
      const ok = await App.confirmar({ titulo: 'Cancelar este pedido?', mensagem: 'As peças voltam a ficar disponíveis no catálogo e no caixa.', textoConfirmar: 'Cancelar pedido', textoCancelar: 'Voltar', perigo: true });
      if (!ok) return;
      try { await Data.atualizarPedido(b.dataset.cancelar, { status: 'cancelado' }); App.toast('Pedido cancelado. As peças foram liberadas.'); await carregar(); } catch (er) { App.toast(er.message, 'erro'); }
    }));
    App.icones();
  }

  document.querySelectorAll('#abas-ped [data-status]').forEach((b) => b.addEventListener('click', () => {
    aba = b.dataset.status;
    document.querySelectorAll('#abas-ped [data-status]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    desenhar();
  }));
  window.addEventListener('dados-alterados', carregar);
  await carregar();
});
