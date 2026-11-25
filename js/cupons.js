/* ==========================================================================
   cupons.js — Cupons de desconto do catálogo online (página Promoções)
   O código fica só aqui (dados da loja). No catálogo público vai apenas o
   "hash" do código, então ninguém descobre os cupons olhando a página.
   ========================================================================== */
App.aoIniciar(async () => {
  const $ = (id) => document.getElementById(id);
  const e = App.escapeHtml;
  if (!$('cupons-lista')) return;

  const normalizar = (t) => String(t || '').trim().toUpperCase().replace(/\s+/g, '');
  async function hashCupom(codigo) {
    const dados = new TextEncoder().encode(`cupom:${normalizar(codigo)}`);
    const h = await crypto.subtle.digest('SHA-256', dados);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const hoje = () => App.dataInput();
  const regra = (c) => (c.tipo === 'valor' ? `${App.formatarMoeda(c.valor)} de desconto` : `${String(c.valor).replace('.', ',')}% de desconto`);
  const situacao = (c) => (c.ativo === false ? ['Pausado', 'badge-neutro'] : c.validade && c.validade < hoje() ? ['Vencido', 'badge-perigo'] : ['Ativo', 'badge-sucesso']);

  let cupons = [];
  let usos = {};

  async function carregar() {
    const loja = await Data.obterLoja();
    cupons = [...((loja.catalogo && loja.catalogo.cupons) || [])];
    // Quantas vezes cada cupom foi usado (pedidos do catálogo)
    usos = {};
    try {
      (await Data.listarPedidos()).forEach((p) => {
        const cod = p.cupom ? p.cupom.codigo : ((String(p.obs || '').match(/^Cupom ([A-Z0-9_-]+)/) || [])[1]);
        if (cod && p.status !== 'cancelado') usos[cod] = (usos[cod] || 0) + 1;
      });
    } catch (er) { /* sem pedidos */ }
    desenhar();
  }

  function desenhar() {
    const el = $('cupons-lista');
    if (!cupons.length) {
      el.innerHTML = `<div class="cupons-vazio">${App.icone('ticket-percent')}<strong>Nenhum cupom ainda</strong><span>Crie um código (ex.: PH10) e divulgue no Instagram. A cliente digita na sacola do catálogo e o desconto já vai no pedido.</span></div>`;
      App.icones();
      return;
    }
    el.innerHTML = cupons.map((c, i) => {
      const [sit, cls] = situacao(c);
      return `<div class="cupom-linha">
        <div class="cupom-codigo"><strong>${e(c.codigo)}</strong><span class="badge ${cls}">${sit}</span></div>
        <div class="cupom-regra">${e(regra(c))}${c.minimo ? ` <span class="texto-3">· acima de ${App.formatarMoeda(c.minimo)}</span>` : ''}<div class="texto-xs texto-3">${c.validade ? `Até ${App.formatarData(c.validade)}` : 'Sem data para acabar'} · usado ${usos[c.codigo] || 0}×</div></div>
        <div class="cupom-acoes">
          <label class="interruptor" title="${c.ativo === false ? 'Ativar' : 'Pausar'}"><input type="checkbox" data-ativo="${i}" ${c.ativo === false ? '' : 'checked'} aria-label="Cupom ${e(c.codigo)} ativo"></label>
          <button type="button" class="btn-icone" data-copiar="${i}" title="Copiar código" aria-label="Copiar ${e(c.codigo)}"><i data-lucide="copy"></i></button>
          <button type="button" class="btn-icone perigo" data-excluir="${i}" title="Excluir" aria-label="Excluir ${e(c.codigo)}"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-ativo]').forEach((inp) => inp.addEventListener('change', async () => {
      cupons[inp.dataset.ativo].ativo = inp.checked;
      await salvar(inp.checked ? 'Cupom ativado.' : 'Cupom pausado — não vale mais no catálogo.');
    }));
    el.querySelectorAll('[data-copiar]').forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(cupons[b.dataset.copiar].codigo); App.toast('Código copiado.'); } catch (er) { /* ignora */ }
    }));
    el.querySelectorAll('[data-excluir]').forEach((b) => b.addEventListener('click', async () => {
      const c = cupons[b.dataset.excluir];
      const ok = await App.confirmar({ titulo: `Excluir o cupom ${c.codigo}?`, mensagem: 'Ele para de valer no catálogo na hora. Pedidos que já usaram continuam com o desconto.', textoConfirmar: 'Excluir', perigo: true });
      if (!ok) return;
      cupons.splice(Number(b.dataset.excluir), 1);
      await salvar('Cupom excluído.');
    }));
    App.icones();
  }

  async function salvar(msg) {
    try {
      const loja = await Data.obterLoja();
      await Data.salvarLoja({ catalogo: { ...(loja.catalogo || {}), cupons } });
      await Data.publicarCatalogo(true);
      if (msg) App.toast(msg, 'sucesso');
    } catch (er) { App.toast(er.message, 'erro', 7000); }
    await carregar();
  }

  /* ---------- Novo cupom ---------- */
  const form = $('form-cupom');
  let tipo = 'percentual';
  form.querySelectorAll('[data-tipo-cupom]').forEach((b) => b.addEventListener('click', () => {
    tipo = b.dataset.tipoCupom;
    form.querySelectorAll('[data-tipo-cupom]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('cp-prefixo').textContent = tipo === 'valor' ? 'R$' : '%';
    $('cp-valor').placeholder = tipo === 'valor' ? '20,00' : '10';
  }));
  $('cp-codigo').addEventListener('input', () => { const i = $('cp-codigo'); const pos = i.selectionStart; i.value = i.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''); i.setSelectionRange(pos, pos); });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const codigo = normalizar($('cp-codigo').value);
    const valor = App.lerNumero($('cp-valor').value);
    const minimo = App.lerNumero($('cp-minimo').value) || 0;
    const validade = $('cp-validade').value || '';
    if (codigo.length < 3) { $('cp-codigo').focus(); return App.toast('O código precisa ter pelo menos 3 letras ou números.', 'erro'); }
    if (cupons.some((c) => c.codigo === codigo)) { $('cp-codigo').focus(); return App.toast('Já existe um cupom com esse código.', 'erro'); }
    if (!valor || valor <= 0 || (tipo === 'percentual' && valor > 90)) { $('cp-valor').focus(); return App.toast(tipo === 'percentual' ? 'Informe um desconto entre 1% e 90%.' : 'Informe o valor do desconto.', 'erro'); }
    if (validade && validade < hoje()) { $('cp-validade').focus(); return App.toast('A data já passou.', 'erro'); }
    if (!window.crypto || !crypto.subtle) return App.toast('Abra o sistema pelo endereço https para criar cupons.', 'erro');
    const botao = form.querySelector('[type=submit]');
    botao.disabled = true;
    try {
      cupons.unshift({ id: 'cup' + Date.now().toString(36), codigo, hash: await hashCupom(codigo), tipo, valor, minimo, validade, ativo: true, criadoEm: new Date().toISOString() });
      await salvar(`Cupom ${codigo} criado! Já vale no catálogo.`);
      form.reset();
      form.querySelector('[data-tipo-cupom=percentual]').click();
    } finally { botao.disabled = false; }
  });

  await carregar();
});
