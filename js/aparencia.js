/* ==========================================================================
   aparencia.js — Aparência do catálogo (prévia ao vivo no próprio site)
   e do sistema de gestão (cor principal e tema)
   ========================================================================== */
App.aoIniciar(async () => {
  const $ = (id) => document.getElementById(id);
  let loja = await Data.obterLoja();

  /* ---------- Abas ---------- */
  document.querySelectorAll('#abas-ap [data-aba]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#abas-ap [data-aba]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $('painel-catalogo').hidden = b.dataset.aba !== 'catalogo';
    $('painel-sistema').hidden = b.dataset.aba !== 'sistema';
  }));
  const marcar = (sel, attr, valor) => document.querySelectorAll(sel).forEach((b) => b.setAttribute('aria-checked', String(b.dataset[attr] === String(valor))));

  /* ==================================================================
     CATÁLOGO
     ================================================================== */
  const PADRAO = { fundo: 'concreto', destaque: '', fonte: 'urbana', frase1: '', frase2: '', faixa: true, foto: 'retrato', cantos: 'retos', colunas: 2 };
  const FUNDOS = [['concreto', 'Concreto', '#F1F1EE'], ['creme', 'Creme', '#FAF8F5'], ['branco', 'Branco', '#FFFFFF'], ['areia', 'Areia', '#F3EDE4'], ['cinza', 'Cinza', '#F4F4F5'], ['preto', 'Preto', '#121212']];
  const DESTAQUES = [['', 'Preto', '#141414'], ['#5B1A2B', 'Vinho', '#5B1A2B'], ['#1E2A44', 'Marinho', '#1E2A44'], ['#4B5A3A', 'Oliva', '#4B5A3A'], ['#A0522D', 'Terracota', '#A0522D'], ['#B07A7A', 'Rosé', '#B07A7A'], ['#B8924A', 'Dourado', '#B8924A']];
  const FONTES = [['urbana', 'Urbana', "'Anton', Impact, sans-serif"], ['classica', 'Clássica', "'Cormorant Garamond', Georgia, serif"], ['editorial', 'Editorial', "'Playfair Display', Georgia, serif"], ['moderna', 'Moderna', 'Inter, sans-serif']];
  let tema = { ...PADRAO, ...((loja.catalogo || {}).tema || {}) };

  // Fontes do catálogo para mostrar as opções de letra
  if (!document.querySelector('link[data-fontes-catalogo]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.dataset.fontesCatalogo = '1';
    l.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Cormorant+Garamond:ital,wght@0,500;1,500&family=Playfair+Display:ital,wght@0,500;1,500&display=swap';
    document.head.appendChild(l);
  }

  $('ap-fundos').innerHTML = FUNDOS.map(([id, nome, cor]) => `
    <button type="button" role="radio" data-fundo="${id}" aria-label="${nome}" title="${nome}"><span style="background:${cor}"></span><small>${nome}</small></button>`).join('');
  $('ap-cores').innerHTML = DESTAQUES.map(([id, nome, cor]) => `
    <button type="button" class="cor-opcao" role="radio" data-destaque="${id}" aria-label="${nome}" title="${nome}" style="--opcao:${cor}"><i data-lucide="check"></i></button>`).join('')
    + '<label class="seletor-cor" title="Outra cor"><input type="color" id="ap-cor-livre" aria-label="Outra cor"><i data-lucide="pipette"></i></label>';
  $('ap-fontes').innerHTML = FONTES.map(([id, nome, familia]) => `
    <button type="button" role="radio" data-fonte="${id}"><span style="font-family:${familia}${id === 'moderna' ? ';font-weight:600;letter-spacing:-.02em' : ''}">Aa</span><small>${nome}</small></button>`).join('');
  App.icones();

  function preencher() {
    marcar('[data-fundo]', 'fundo', tema.fundo);
    document.querySelectorAll('[data-destaque]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.destaque === (DESTAQUES.some(([id]) => id === tema.destaque) ? tema.destaque : '___'))));
    marcar('[data-fonte]', 'fonte', tema.fonte);
    marcar('[data-foto]', 'foto', tema.foto);
    marcar('[data-cantos]', 'cantos', tema.cantos);
    marcar('[data-colunas]', 'colunas', tema.colunas);
    $('ap-frase1').value = tema.frase1 || '';
    $('ap-frase2').value = tema.frase2 || '';
    $('ap-faixa').checked = tema.faixa !== false;
    if (/^#[0-9a-f]{6}$/i.test(tema.destaque || '')) $('ap-cor-livre').value = tema.destaque;
  }

  // Prévia: o catálogo dentro da moldura recebe o tema na hora
  const iframe = $('ap-iframe');
  const enviarPrevia = () => { try { iframe.contentWindow.postMessage({ tipo: 'tema-catalogo', tema }, location.origin); } catch (e) { /* ainda carregando */ } };
  iframe.addEventListener('load', () => { enviarPrevia(); setTimeout(enviarPrevia, 800); setTimeout(enviarPrevia, 2000); });
  const mudou = () => { preencher(); enviarPrevia(); $('ap-status').textContent = 'Alterações não salvas'; };

  document.querySelectorAll('[data-fundo]').forEach((b) => b.addEventListener('click', () => { tema.fundo = b.dataset.fundo; mudou(); }));
  document.querySelectorAll('[data-destaque]').forEach((b) => b.addEventListener('click', () => { tema.destaque = b.dataset.destaque; mudou(); }));
  $('ap-cor-livre').addEventListener('input', (e) => { tema.destaque = e.target.value.toUpperCase(); mudou(); });
  document.querySelectorAll('[data-fonte]').forEach((b) => b.addEventListener('click', () => { tema.fonte = b.dataset.fonte; mudou(); }));
  document.querySelectorAll('[data-foto]').forEach((b) => b.addEventListener('click', () => { tema.foto = b.dataset.foto; mudou(); }));
  document.querySelectorAll('[data-cantos]').forEach((b) => b.addEventListener('click', () => { tema.cantos = b.dataset.cantos; mudou(); }));
  document.querySelectorAll('[data-colunas]').forEach((b) => b.addEventListener('click', () => { tema.colunas = Number(b.dataset.colunas); mudou(); }));
  $('ap-frase1').addEventListener('input', (e) => { tema.frase1 = e.target.value; enviarPrevia(); $('ap-status').textContent = 'Alterações não salvas'; });
  $('ap-frase2').addEventListener('input', (e) => { tema.frase2 = e.target.value; enviarPrevia(); $('ap-status').textContent = 'Alterações não salvas'; });
  $('ap-faixa').addEventListener('change', (e) => { tema.faixa = e.target.checked; mudou(); });
  $('ap-padrao').addEventListener('click', () => { tema = { ...PADRAO }; mudou(); });

  // Celular / computador
  document.querySelectorAll('[data-tela]').forEach((b) => b.addEventListener('click', () => {
    marcar('[data-tela]', 'tela', b.dataset.tela);
    $('ap-moldura').classList.toggle('computador', b.dataset.tela === 'computador');
  }));

  $('form-ap-cat').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const botao = ev.submitter || $('form-ap-cat').querySelector('[type=submit]');
    botao.disabled = true;
    try {
      loja = await Data.salvarLoja({ catalogo: { ...(loja.catalogo || {}), tema: { ...tema, frase1: (tema.frase1 || '').trim(), frase2: (tema.frase2 || '').trim() } } });
      await Data.publicarCatalogo(true);
      $('ap-status').textContent = '✓ Publicado no catálogo';
      try { iframe.contentWindow.location.reload(); } catch (e) { /* ignora */ }
      App.toast('Aparência do catálogo publicada!', 'sucesso');
    } catch (e) { App.toast(e.message, 'erro', 7000); }
    botao.disabled = false;
  });
  $('ap-abrir').href = Data.linkCatalogo();
  preencher();

  /* ==================================================================
     SISTEMA DE GESTÃO — cor principal (loja toda) e tema (por aparelho)
     ================================================================== */
  const CORES_PRONTAS = [
    ['Preto', '#18181B'], ['Índigo', '#4F46E5'], ['Violeta', '#7C3AED'], ['Rosa', '#DB2777'], ['Vermelho', '#DC2626'],
    ['Vinho', '#9F1239'], ['Terracota', '#C2410C'], ['Âmbar', '#D97706'], ['Oliva', '#65A30D'],
    ['Verde', '#059669'], ['Petróleo', '#0F766E'], ['Azul', '#2563EB'], ['Grafite', '#27272A']
  ];
  const paleta = $('paleta-cores');
  const picker = $('cor-picker');
  const inputHex = $('cor-hex');
  const ajudaHex = $('cor-ajuda');
  const hexValido = (v) => /^#[0-9a-f]{6}$/i.test(v);
  let corSalva = (loja.corPrimaria || App.COR_PADRAO).toUpperCase();
  let corEscolhida = corSalva;
  paleta.innerHTML = CORES_PRONTAS.map(([nome, hex]) => `
    <button type="button" class="cor-opcao" role="radio" aria-checked="false" data-cor="${hex}" title="${nome}" aria-label="${nome}" style="--opcao:${hex}"><i data-lucide="check"></i></button>`).join('');

  function desenharPreviaSistema(el, vars) {
    Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
    el.innerHTML = `
      <div class="previa-topo"><span class="previa-logo">PH</span><strong>${el.dataset.tema === 'escuro' ? 'Modo escuro' : 'Modo claro'}</strong></div>
      <div class="nav-link ativo" style="pointer-events:none"><i data-lucide="layout-dashboard"></i><span>Dashboard</span></div>
      <div class="flex gap-2 mt-4" style="flex-wrap:wrap">
        <span class="btn btn-primario" style="pointer-events:none"><i data-lucide="plus"></i>Nova venda</span>
        <span class="btn btn-secundario" style="pointer-events:none">Cancelar</span>
      </div>
      <div class="previa-barras" aria-hidden="true">${[45, 70, 35, 60, 52, 95].map((h, i) => `<span style="height:${h}%;background:${i === 5 ? 'var(--cor-destaque)' : 'var(--cor-destaque-suave)'}"></span>`).join('')}</div>`;
  }
  function escolherCor(hex, { origem } = {}) {
    if (!hexValido(hex)) return;
    corEscolhida = hex.toUpperCase();
    paleta.querySelectorAll('.cor-opcao').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.cor === corEscolhida)));
    if (origem !== 'picker') picker.value = corEscolhida.toLowerCase();
    if (origem !== 'hex') inputHex.value = corEscolhida;
    ajudaHex.textContent = corEscolhida === corSalva ? 'Cor em uso.' : 'Prévia — clique em "Salvar cor".';
    const v = App.variaveisCor(corEscolhida);
    desenharPreviaSistema($('previa-claro'), v.claro);
    desenharPreviaSistema($('previa-escuro'), v.escuro);
    App.icones();
  }
  paleta.addEventListener('click', (e) => { const b = e.target.closest('.cor-opcao'); if (b) escolherCor(b.dataset.cor); });
  picker.addEventListener('input', () => escolherCor(picker.value, { origem: 'picker' }));
  inputHex.addEventListener('input', () => {
    let v = inputHex.value.trim();
    if (v && !v.startsWith('#')) v = '#' + v;
    if (hexValido(v)) escolherCor(v, { origem: 'hex' });
  });
  async function salvarCor(hex) {
    try {
      loja = await Data.salvarLoja({ corPrimaria: hex });
      corSalva = hex;
      App.aplicarCorPrimaria(hex);
      escolherCor(hex);
      App.toast('Cor principal atualizada em todo o sistema.', 'sucesso');
    } catch (erro) { App.toast(erro.message, 'erro'); }
  }
  $('btn-salvar-cor').addEventListener('click', () => salvarCor(corEscolhida));
  $('btn-cor-padrao').addEventListener('click', () => salvarCor(App.COR_PADRAO));

  const temaGuardado = () => { try { return localStorage.getItem('gestaoloja:tema') || 'auto'; } catch (e) { return 'auto'; } };
  const marcarTema = () => marcar('[data-tema-opcao]', 'temaOpcao', temaGuardado());
  document.querySelectorAll('[data-tema-opcao]').forEach((b) => b.addEventListener('click', () => {
    const op = b.dataset.temaOpcao;
    try { op === 'auto' ? localStorage.removeItem('gestaoloja:tema') : localStorage.setItem('gestaoloja:tema', op); } catch (e) { /* ignora */ }
    document.documentElement.dataset.tema = op === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro') : op;
    marcarTema();
  }));
  marcarTema();
  escolherCor(corSalva);
});
