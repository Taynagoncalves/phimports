(() => {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  const params = new URLSearchParams(location.search);
  const lojaId = params.get('loja');
  const estado = document.getElementById('estado');
  const grade = document.getElementById('produtos');
  const pedido = new Map();
  let loja = null;
  let produtos = [];
  const safePhoto = (url) => /^https:\/\//i.test(url || '') ? url : '';

  function desenhar(lista) {
    grade.replaceChildren();
    lista.forEach((p) => {
      const card = document.createElement('article'); card.className = 'card catalogo-item';
      if (safePhoto(p.foto)) { const img = document.createElement('img'); img.className = 'catalogo-foto'; img.src = safePhoto(p.foto); img.alt = p.nome; img.loading = 'lazy'; card.append(img); }
      const info = document.createElement('div'); info.className = 'catalogo-info';
      const titulo = document.createElement('h2'); titulo.className = 'titulo'; titulo.textContent = p.nome; info.append(titulo);
      const categoria = document.createElement('p'); categoria.className = 'texto-xs texto-3'; categoria.textContent = [p.marca, p.categoria].filter(Boolean).join(' · '); info.append(categoria);
      const preco = document.createElement('p'); preco.className = 'stat-valor'; preco.textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.preco); info.append(preco);
      const opcoes = document.createElement('p'); opcoes.className = p.disponivel ? 'texto-xs' : 'catalogo-indisponivel texto-xs';
      opcoes.textContent = `${p.disponivel ? 'Disponível' : 'Indisponível'}${p.variacoes?.length ? ' · ' + p.variacoes.map((v) => `${v.tamanho}${v.cor ? `/${v.cor}` : ''}: ${v.disponivel ? 'em estoque' : 'esgotado'}`).join(', ') : ''}`; info.append(opcoes);
      const btn = document.createElement('button'); btn.className = 'btn btn-secundario btn-bloco mt-3'; btn.type = 'button'; btn.textContent = pedido.has(p.id) ? 'Adicionado ao pedido' : 'Adicionar ao pedido'; btn.disabled = !p.disponivel;
      btn.addEventListener('click', () => { pedido.set(p.id, p); btn.textContent = 'Adicionado ao pedido'; atualizarPedido(); });
      info.append(btn); card.append(info); grade.append(card);
    });
    estado.classList.toggle('oculto', lista.length > 0);
    if (!lista.length) { estado.textContent = produtos.length ? 'Nenhum produto encontrado.' : 'Nenhum produto publicado.'; estado.classList.remove('oculto'); }
    if (window.lucide) lucide.createIcons();
  }
  function atualizarPedido() {
    document.getElementById('qtd-pedido').textContent = `(${pedido.size})`;
    const btn = document.getElementById('btn-pedido'); btn.disabled = !pedido.size || !loja?.telefone;
    btn.onclick = () => {
      const linhas = [...pedido.values()].map((p) => `• ${p.nome} — ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.preco)}`);
      const texto = `Olá! Quero consultar estes produtos do catálogo ${loja.nome}:\n${linhas.join('\n')}`;
      let telefone = String(loja.telefone).replace(/\D/g, '');
      if (telefone && !telefone.startsWith('55')) telefone = `55${telefone}`;
      window.open(`https://wa.me/${telefone}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
    };
  }
  document.getElementById('busca').addEventListener('input', (e) => {
    const termo = e.target.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    desenhar(produtos.filter((p) => p.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(termo)));
  });
  async function iniciar() {
    if (!lojaId || !window.FIREBASE_CONFIG?.apiKey) { estado.textContent = 'Catálogo indisponível.'; return; }
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      const db = firebase.firestore();
      const ref = db.collection('catalogos').doc(lojaId);
      const snap = await ref.get();
      if (!snap.exists || !snap.data().publicado) { estado.textContent = 'Este catálogo não está disponível.'; return; }
      loja = snap.data();
      document.getElementById('nome-loja').textContent = loja.nome || 'Catálogo';
      document.getElementById('contato-loja').textContent = loja.instagram || '';
      produtos = (await ref.collection('produtos').where('ativo', '==', true).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
      produtos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      estado.textContent = '';
      desenhar(produtos); atualizarPedido();
    } catch (e) { console.error(e); estado.textContent = 'Não foi possível carregar o catálogo. Tente novamente mais tarde.'; }
  }
  iniciar();
})();
