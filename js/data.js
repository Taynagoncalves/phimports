/* ==========================================================================
   data.js — Camada de dados
   ÚNICO arquivo que acessa os dados. As páginas chamam sempre Data.xxx().

   Dois modos (escolhidos sozinhos):
   - NUVEM: quando js/firebase-config.js tem a configuração do Firebase.
     Login real (Firebase Authentication) e dados no Firestore, sincronizados
     em tempo real entre computadores e celulares (e funcionando sem internet
     por um tempo, com o cache do navegador).
   - LOCAL: sem configuração. Protótipo com os dados de exemplo
     (js/mock-data.js) guardados no localStorage do navegador.

   As regras de negócio (vendas, estoque, caixa…) são as mesmas nos dois:
   as funções leem e alteram "db" em memória e chamam persistir(), que no
   modo nuvem envia ao Firestore só os registros que mudaram.
   ========================================================================== */
(function () {
  'use strict';

  const CHAVE_DB = 'gestaoloja:db:v1';
  const CHAVE_SESSAO = 'gestaoloja:sessao';

  /* ------------------------------------------------------------------
     Infra interna do mock (some quando migrar para o Firebase)
     ------------------------------------------------------------------ */

  // Modo nuvem só com configuração preenchida e o SDK do Firebase carregado
  const CONFIG = window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey ? window.FIREBASE_CONFIG : null;
  const MODO = CONFIG ? 'nuvem' : 'local'; // com configuração, nunca cai para os dados de exemplo

  // No Firestore: um documento por registro nestas coleções…
  const COLECOES = ['usuarios', 'produtos', 'clientes', 'fornecedores', 'vendas', 'notas', 'movimentacoes',
    'creditos', 'caixas', 'entradas', 'promocoes', 'contasReceber', 'contasPagar', 'inventarios', 'ajustesPontos', 'pedidos'];
  // …e um documento cada para estes ajustes (objetos ou listas simples)
  const AJUSTES = ['loja', 'fiscal', 'config', 'cores', 'tamanhos', 'categorias'];

  // Cópia profunda: evita que as páginas alterem o banco sem passar por uma função de gravação.
  const clonar = (obj) => JSON.parse(JSON.stringify(obj));
  // JSON com as chaves em ordem (para comparar registros sem falso "mudou")
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }

  function carregarBanco() {
    try {
      const salvo = localStorage.getItem(CHAVE_DB);
      if (salvo) {
        // Migração: coleções novas do mock que ainda não existem no banco salvo
        const banco = JSON.parse(salvo);
        Object.keys(window.MOCK_DATA).forEach((k) => { if (!(k in banco)) banco[k] = clonar(window.MOCK_DATA[k]); });
        COLECOES.forEach((c) => { if (!Array.isArray(banco[c])) banco[c] = []; });
        return banco;
      }
    } catch (e) { /* localStorage indisponível: segue com o mock */ }
    const banco = clonar(window.MOCK_DATA);
    COLECOES.forEach((c) => { if (!Array.isArray(banco[c])) banco[c] = []; });
    return banco;
  }

  /** Loja nova: sem produtos nem vendas, com tamanhos, categorias, cores e padrões prontos */
  function bancoBase(nomeLoja = 'PH Imports') {
    const m = window.MOCK_DATA;
    const b = {};
    COLECOES.forEach((c) => { b[c] = []; });
    b.loja = { nome: nomeLoja, razaoSocial: '', cnpj: '', inscricaoEstadual: '', telefone: '', email: '', endereco: '', logo: '', emitirNota: false };
    b.fiscal = {
      ...clonar(m.fiscal), inscricaoMunicipal: '',
      endereco: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', codigoMunicipio: '', uf: '' },
      nfce: { ...clonar(m.fiscal.nfce), proximoNumero: 1, cscId: '', csc: '', urlConsulta: '', certificado: null }
    };
    b.config = clonar(m.config);
    b.cores = clonar(m.cores);
    b.tamanhos = clonar(m.tamanhos);
    b.categorias = clonar(m.categorias);
    return b;
  }

  let db = MODO === 'local' ? carregarBanco() : bancoBase();

  // Modo local: outra aba alterou os dados (ex.: nome da loja) → recarrega e avisa a página.
  // No modo nuvem, isso vem dos ouvintes em tempo real (onSnapshot).
  window.addEventListener('storage', (e) => {
    if (MODO !== 'local' || e.key !== CHAVE_DB) return;
    db = carregarBanco();
    window.dispatchEvent(new CustomEvent('dados-alterados'));
  });

  function persistir() {
    agendarCatalogo();
    if (MODO === 'nuvem') { agendarSincronizacao(); return; }
    try { localStorage.setItem(CHAVE_DB, JSON.stringify(db)); } catch (e) { /* ignora */ }
  }

  // Devolve sempre uma cópia (no modo local, simula a latência de rede)
  const ATRASO = MODO === 'local' ? 60 : 0;
  function responder(valor) {
    return new Promise((resolve) => setTimeout(() => resolve(clonar(valor)), ATRASO));
  }
  function falhar(mensagem) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error(mensagem)), ATRASO));
  }

  /* ==================================================================
     NUVEM — Firebase Authentication + Firestore
       acessos/{uid}                  → { lojaId, perfil, nome, email, ativo }
       lojas/{lojaId}                 → { nome, donoUid, criadoEm }
       lojas/{lojaId}/ajustes/{nome}  → loja, fiscal, config, cores, tamanhos, categorias
       lojas/{lojaId}/{colecao}/{id}  → um documento por registro
     Regras de segurança: firestore.rules
     ================================================================== */
  let fb = null;            // { auth, fs }
  // Suporte (super admin): UIDs em js/firebase-config.js. As regras do Firestore conferem a mesma lista.
  const SUPER_ADMINS = Array.isArray(window.SUPER_ADMIN_UIDS) ? window.SUPER_ADMIN_UIDS : [];
  const ehSuperAdmin = (uid) => !!uid && SUPER_ADMINS.includes(uid);
  const MSG_BLOQUEIO = 'O acesso desta loja está suspenso. Entre em contato com o suporte.';
  const CHAVE_AVISO_LOGIN = 'gestaoloja:aviso-login';
  const CHAVE_ACESSO = 'gestaoloja:acesso:';   // acesso do usuário guardado neste computador
  let lojaId = null;
  let uidAtual = null;
  let perfilAcesso = null;  // documento acessos/{uid}
  const espelho = {};       // último estado sincronizado (para enviar só o que mudou)
  const ouvintes = [];

  function iniciarFirebase() {
    if (fb) return fb;
    if (!window.firebase) throw new Error('Não foi possível carregar o sistema. Verifique a internet e recarregue a página.');
    if (!firebase.apps.length) firebase.initializeApp(CONFIG);
    const banco = firebase.firestore();
    // Cache no navegador: abre mais rápido e continua funcionando se a internet cair
    try { banco.enablePersistence({ synchronizeTabs: true }).catch(() => { /* outro navegador/aba: segue sem cache */ }); } catch (e) { /* ignora */ }
    const auth = firebase.auth();
    auth.languageCode = 'pt-BR';
    fb = { auth, fs: banco };
    return fb;
  }

  /** Mensagens do Firebase em português */
  function traduzirErro(e) {
    const c = (e && e.code) || '';
    const msg = {
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
      'auth/wrong-password': 'E-mail ou senha incorretos.',
      'auth/user-not-found': 'E-mail ou senha incorretos.',
      'auth/invalid-email': 'E-mail inválido.',
      'auth/user-disabled': 'Este usuário foi desativado.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
      'auth/network-request-failed': 'Sem conexão com a internet.',
      'auth/email-already-in-use': 'Já existe uma conta com este e-mail.',
      'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
      'permission-denied': 'Sem permissão para essa ação.',
      'unavailable': 'Sem conexão com o servidor. Tente de novo em instantes.'
    }[c];
    return msg || (e && e.message) || 'Erro inesperado.';
  }

  const refLoja = () => fb.fs.collection('lojas').doc(lojaId);
  const ajusteParaDoc = (nome, valor) => (Array.isArray(valor) ? { itens: valor } : valor);
  const ajusteDeDoc = (nome, dados) => (Array.isArray(window.MOCK_DATA[nome]) ? (dados.itens || []) : dados);

  function pararOuvintes() { ouvintes.splice(0).forEach((parar) => parar()); }

  let avisoPendente = null;
  function avisarMudancaRemota() {
    clearTimeout(avisoPendente);
    avisoPendente = setTimeout(() => window.dispatchEvent(new CustomEvent('dados-alterados')), 250);
  }

  /** Abre a loja: escuta todas as coleções em tempo real (o primeiro retorno carrega tudo) */
  function abrirLoja(id) {
    pararOuvintes();
    lojaId = id;
    ultimoCatalogo = null;
    db = bancoBase();
    COLECOES.forEach((c) => { espelho[c] = new Map(); membrosPacote[c] = new Map(); });
    espelho.ajustes = {};
    const carregamentos = COLECOES.map((c) => new Promise((resolve, reject) => {
      let primeira = true;
      ouvintes.push(refLoja().collection(c).onSnapshot((snap) => {
        aplicarMudancas(c, snap.docChanges());
        if (primeira) { primeira = false; resolve(); } else if (!snap.metadata.hasPendingWrites) avisarMudancaRemota();
      }, (erro) => { if (primeira) reject(erro); else console.error('Firestore:', erro); }));
    }));
    carregamentos.push(new Promise((resolve, reject) => {
      let primeira = true;
      ouvintes.push(refLoja().collection('ajustes').onSnapshot((snap) => {
        snap.docChanges().forEach((ch) => {
          if (!AJUSTES.includes(ch.doc.id) || ch.type === 'removed') return;
          db[ch.doc.id] = ajusteDeDoc(ch.doc.id, ch.doc.data());
          espelho.ajustes[ch.doc.id] = canon(db[ch.doc.id]);
        });
        if (primeira) { primeira = false; resolve(); } else if (!snap.metadata.hasPendingWrites) avisarMudancaRemota();
      }, (erro) => { if (primeira) reject(erro); else console.error('Firestore:', erro); }));
    }));
    return Promise.all(carregamentos).then((r) => { setTimeout(() => publicarCatalogo(), 4000); return r; });
  }

  /* ---------- Pacotes mensais ----------
     Vendas e movimentações crescem sem parar (1 documento por venda e por peça).
     Para o Firebase não cobrar milhares de leituras a cada abertura, os registros
     com mais de ~2 meses são guardados juntos em "pacotes" (1 documento por mês,
     dividido se passar do tamanho). Na memória nada muda: db.vendas continua
     com TODAS as vendas — relatórios, pontos, clientes e trocas veem tudo. */
  const PACOTES = { vendas: 'data', movimentacoes: 'data' };   // coleção → campo de data
  const PREFIXO_PACOTE = '_pacote_';
  const LIMITE_PACOTE = 600 * 1024;                            // o Firestore aceita até 1 MB por documento
  const membrosPacote = {};                                    // coleção → (id do pacote → ids dentro)
  const ehPacote = (docId) => String(docId).startsWith(PREFIXO_PACOTE);
  /** Meses antes deste vão para pacotes (ex.: em novembro, empacota até agosto) */
  function mesLimitePacote() {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /** Como a coleção deve ficar no Firestore: docId → conteúdo */
  function documentosDesejados(c) {
    const docs = new Map();
    const campo = PACOTES[c];
    const limite = campo ? mesLimitePacote() : null;
    const porMes = {};
    (db[c] || []).forEach((item) => {
      if (item.id === undefined || item.id === null || item.id === '') item.id = gerarId(c.slice(0, 2));
      const mes = campo ? String(item[campo] || '').slice(0, 7) : '';
      if (campo && /^\d{4}-\d{2}$/.test(mes) && mes < limite) (porMes[mes] = porMes[mes] || []).push(item);
      else docs.set(String(item.id), item);
    });
    Object.keys(porMes).sort().forEach((mes) => {
      const itens = porMes[mes].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      let parte = 1;
      let atual = [];
      let tamanho = 0;
      const fechar = () => { docs.set(`${PREFIXO_PACOTE}${mes}_${parte}`, { _pacote: true, mes, itens: atual }); parte++; atual = []; tamanho = 0; };
      itens.forEach((it) => {
        const t = canon(it).length;
        if (atual.length && tamanho + t > LIMITE_PACOTE) fechar();
        atual.push(it);
        tamanho += t;
      });
      if (atual.length) fechar();
    });
    return docs;
  }

  /** Aplica no db o que mudou no Firestore (documentos soltos e pacotes) */
  function aplicarMudancas(c, mudancas) {
    const lista = db[c];
    const membros = (membrosPacote[c] = membrosPacote[c] || new Map());
    const pos = new Map(lista.map((x, i) => [String(x.id), i]));
    const talvezRemover = new Set();
    const gravar = (dados) => {
      const k = String(dados.id);
      if (pos.has(k)) lista[pos.get(k)] = dados;
      else { pos.set(k, lista.length); lista.push(dados); }
    };
    mudancas.forEach((ch) => {
      const docId = ch.doc.id;
      if (ehPacote(docId)) {
        const antigos = membros.get(docId) || new Set();
        if (ch.type === 'removed') {
          espelho[c].delete(docId);
          membros.delete(docId);
          antigos.forEach((k) => talvezRemover.add(k));
          return;
        }
        const dados = ch.doc.data();
        espelho[c].set(docId, canon(dados));
        const itens = Array.isArray(dados.itens) ? dados.itens : [];
        const novos = new Set(itens.map((it) => String(it.id)));
        antigos.forEach((k) => { if (!novos.has(k)) talvezRemover.add(k); });
        membros.set(docId, novos);
        itens.forEach(gravar);
        return;
      }
      if (ch.type === 'removed') { espelho[c].delete(docId); talvezRemover.add(docId); return; }
      const bruto = ch.doc.data();
      const dados = { ...bruto, id: (pos.has(docId) ? lista[pos.get(docId)].id : null) ?? bruto.id ?? docId };
      espelho[c].set(docId, canon(dados));
      gravar(dados);
    });
    // Só tira do db o que não está mais em lugar nenhum: um registro pode ter
    // saído de um documento solto para um pacote (ou de um pacote para outro).
    const emAlgumPacote = (k) => [...membros.values()].some((s) => s.has(k));
    const sumiram = new Set([...talvezRemover].filter((k) => !espelho[c].has(k) && !emAlgumPacote(k)));
    if (sumiram.size) {
      const ficam = lista.filter((x) => !sumiram.has(String(x.id)));
      lista.length = 0;
      ficam.forEach((x) => lista.push(x));
    }
  }

  /* ---------- Envio das alterações (só o que mudou) ---------- */
  let sincronizacaoAgendada = null;
  function agendarSincronizacao() {
    if (sincronizacaoAgendada || !lojaId) return;
    sincronizacaoAgendada = setTimeout(() => {
      sincronizacaoAgendada = null;
      sincronizar().catch((e) => {
        console.error('Erro ao salvar na nuvem:', e);
        window.dispatchEvent(new CustomEvent('erro-sincronizacao', { detail: traduzirErro(e) }));
      });
    }, 0);
  }

  async function sincronizar() {
    const ops = [];
    const apagar = [];
    COLECOES.forEach((c) => {
      const desejados = documentosDesejados(c);
      desejados.forEach((conteudo, docId) => {
        const j = canon(conteudo);
        if (espelho[c].get(docId) !== j) { ops.push(['set', refLoja().collection(c).doc(docId), JSON.parse(j)]); espelho[c].set(docId, j); }
      });
      [...espelho[c].keys()].forEach((docId) => {
        if (!desejados.has(docId)) { apagar.push(['del', refLoja().collection(c).doc(docId)]); espelho[c].delete(docId); }
      });
    });
    AJUSTES.forEach((n) => {
      const j = canon(db[n]);
      if (espelho.ajustes[n] !== j) { ops.push(['set', refLoja().collection('ajustes').doc(n), ajusteParaDoc(n, JSON.parse(j))]); espelho.ajustes[n] = j; }
    });
    // Apagar SEMPRE depois de gravar: ao empacotar, o pacote passa a existir antes
    // de os documentos soltos sumirem (nenhum registro some, nem por um instante).
    ops.push(...apagar);
    // Lotes de até 400 gravações (limite do Firestore: 500)
    for (let i = 0; i < ops.length; i += 400) {
      const lote = fb.fs.batch();
      ops.slice(i, i + 400).forEach(([tipo, ref, dados]) => (tipo === 'set' ? lote.set(ref, dados) : lote.delete(ref)));
      await lote.commit();
    }
  }

  /* ---------- Sessão ---------- */
  async function lerAcesso(user) {
    const doc = await fb.fs.collection('acessos').doc(user.uid).get();
    if (!doc.exists) throw new Error('Este usuário não está ligado a nenhuma loja.');
    const dados = doc.data();
    if (dados.ativo === false) throw new Error('Seu acesso foi desativado pelo dono da loja.');
    return dados;
  }
  /** A loja foi bloqueada pelo suporte? */
  async function lojaBloqueada(id) {
    try {
      const d = await fb.fs.collection('lojas').doc(id).get();
      return d.exists && d.data().bloqueada === true;
    } catch (e) { return false; }
  }
  const usuarioSuporte = (user) => ({ id: user.uid, nome: 'Suporte', email: user.email, perfil: 'superadmin', ativo: true });

  async function prepararSessao(user) {
    if (ehSuperAdmin(user.uid)) {
      uidAtual = user.uid;
      perfilAcesso = { perfil: 'superadmin', nome: 'Suporte', email: user.email };
      return usuarioSuporte(user);
    }
    // Acesso já conhecido neste computador: abre a loja na hora (dados do cache)
    // e confere no servidor em segundo plano (bloqueio, acesso desativado…).
    const chaveAcesso = CHAVE_ACESSO + user.uid;
    let guardado = null;
    try { guardado = JSON.parse(localStorage.getItem(chaveAcesso) || 'null'); } catch (e) { guardado = null; }
    const conferir = async () => {
      const real = await lerAcesso(user);
      if (await lojaBloqueada(real.lojaId)) throw new Error(MSG_BLOQUEIO);
      try { localStorage.setItem(chaveAcesso, JSON.stringify(real)); } catch (e) { /* ignora */ }
      return real;
    };
    if (guardado && guardado.lojaId && guardado.ativo !== false) {
      perfilAcesso = guardado;
      uidAtual = user.uid;
      conferir().then((real) => {
        if (real.lojaId !== guardado.lojaId) throw new Error('O acesso deste usuário mudou. Entre novamente.');
        perfilAcesso = real;
      }).catch((e) => {
        // Rede fora do ar: segue com o cache. Bloqueio/desativação: sai do sistema.
        if (e && (e.code === 'unavailable' || /offline|network/i.test(e.message || ''))) return;
        try { localStorage.removeItem(chaveAcesso); } catch (_) { /* ignora */ }
        try { sessionStorage.setItem(CHAVE_AVISO_LOGIN, (e && e.message) || MSG_BLOQUEIO); } catch (_) { /* ignora */ }
        fb.auth.signOut().finally(() => location.reload());
      });
      await abrirLoja(guardado.lojaId);
      return usuarioLogado();
    }
    perfilAcesso = await conferir();
    uidAtual = user.uid;
    await abrirLoja(perfilAcesso.lojaId);
    return usuarioLogado();
  }

  /**
   * Espera saber quem está logado e carrega a loja dele.
   * Resolve com o usuário (ou null se ninguém entrou). Modo local: o usuário da sessão.
   */
  let promessaPronto = null;
  function pronto() {
    if (MODO === 'local') return Promise.resolve(clonar(usuarioLogado()));
    if (promessaPronto) return promessaPronto;
    try { iniciarFirebase(); } catch (e) { return Promise.reject(e); }
    promessaPronto = new Promise((resolve) => {
      const parar = fb.auth.onAuthStateChanged(async (user) => {
        parar();
        if (!user) return resolve(null);
        try { resolve(clonar(await prepararSessao(user))); } catch (e) {
          console.error(e);
          // Mostra o motivo na tela de entrada (ex.: loja bloqueada)
          try { sessionStorage.setItem(CHAVE_AVISO_LOGIN, e.message); } catch (_) { /* ignora */ }
          try { await fb.auth.signOut(); } catch (_) { /* ignora */ }
          resolve(null);
        }
      });
    });
    return promessaPronto;
  }

  /** Conta extra (sem derrubar quem está logado): convites e autorização do dono */
  function appSecundario() {
    return (firebase.apps.find((a) => a.name === 'secundario') || firebase.initializeApp(CONFIG, 'secundario')).auth();
  }

  function gerarId(prefixo) {
    return prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Normaliza texto para busca (sem acento, minúsculo)
  function normalizar(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // Data local no formato AAAA-MM-DD (para comparar com filtros de período)
  function diaLocal(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function noPeriodo(iso, inicio, fim) {
    const dia = diaLocal(iso);
    if (inicio && dia < inicio) return false;
    if (fim && dia > fim) return false;
    return true;
  }

  // Campos derivados do produto (no Firebase podem ser gravados no documento)
  function comTotais(p) {
    const estoqueTotal = p.variacoes.reduce((s, v) => s + Number(v.estoque || 0), 0);
    const ncmEfetivo = ncmDoProduto(p);
    // Origem do NCM usado na nota: 'proprio' | 'categoria' | 'sem'
    const ncmOrigem = !ncmEfetivo ? 'sem' : ncmEfetivo === p.ncm ? 'proprio' : 'categoria';
    // Promoção ativa agora: preço promocional (% ou fixo) e/ou "leve X pague Y"
    const ativas = promocoesAtivas();
    const { preco: precoPromocional, promocao } = precoComPromocao(p, ativas);
    const leve = promocao ? null : ativas.find((x) => x.tipo === 'leve-pague' && promoAplica(x, p));
    return {
      ...p, estoqueTotal, estoqueBaixo: estoqueTotal <= (p.estoqueMinimo || 0), ncmEfetivo, ncmOrigem,
      precoPromocional: promocao ? precoPromocional : null,
      promocao: promocao || (leve ? { id: leve.id, nome: leve.nome, leve: leve.leve, pague: leve.pague } : null)
    };
  }

  function acharVariacao(sku) {
    for (const p of db.produtos) {
      const v = p.variacoes.find((x) => x.sku === sku);
      if (v) return { produto: p, variacao: v };
    }
    return null;
  }

  /* ---------- Pagamentos e valores da venda ---------- */
  const FORMAS_VALIDAS = ['pix', 'dinheiro', 'debito', 'credito', 'vale', 'crediario', 'pontos'];
  const arred = (n) => Math.round(Number(n || 0) * 100) / 100;

  /** Lista de pagamentos da venda (vendas antigas tinham um só "pagamento") */
  function pagamentosDe(v) {
    if (v.pagamentos && v.pagamentos.length) return v.pagamentos;
    return [{ forma: v.pagamento.forma, valor: v.total, parcelas: v.pagamento.parcelas || 1 }];
  }
  /** Valor devolvido em troca/devolução (com o desconto da venda rateado) */
  function valorDevolvido(v) {
    if (!v.devolucao) return 0;
    const fator = v.subtotal ? v.total / v.subtotal : 1;
    return arred(v.devolucao.valor * fator);
  }
  /** Quanto a venda realmente faturou: total − devoluções/trocas (cancelada = 0) */
  function valorLiquido(v) {
    return v.status === 'cancelada' ? 0 : Math.max(0, arred(v.total - valorDevolvido(v)));
  }
  /** Quantidade de um item que voltou para a loja */
  function qtdDevolvida(v, sku) {
    return v.devolucao ? ((v.devolucao.itens.find((i) => i.sku === sku) || {}).qtd || 0) : 0;
  }
  /** Parte da venda paga em dinheiro (para o caixa) */
  const dinheiroDa = (v) => pagamentosDe(v).filter((p) => p.forma === 'dinheiro').reduce((s, p) => s + p.valor, 0);

  // Vendas que contam como faturamento (o valor líquido já exclui o que voltou).
  // Troca = devolução + vale: a venda nova paga com vale é que fatura as peças novas.
  const vendaValida = (v) => v.status !== 'cancelada' && valorLiquido(v) > 0;

  /* ---------- Programa de pontos (fidelidade) ----------
     Regra em loja.fidelidade = { ativo, reaisPorPonto, valorPonto, minimoResgate,
       validadeMeses (0 = não vence), bonusPrimeiraCompra, campanha: { multiplicador, inicio, fim } }.
     O saldo NÃO fica guardado: é calculado pelo extrato do cliente
     (compras − pontos usados ± ajustes − pontos vencidos). Assim trocas,
     devoluções e cancelamentos acertam os pontos sozinhos. */
  function regraPontos() {
    const f = (db.loja && db.loja.fidelidade) || {};
    if (!f.ativo) return null;
    const camp = f.campanha || {};
    return {
      reaisPorPonto: Math.max(0.01, Number(f.reaisPorPonto) || 1),
      valorPonto: Math.max(0.001, Number(f.valorPonto) || 0.05),
      minimoResgate: Math.max(0, Math.floor(Number(f.minimoResgate ?? 100) || 0)),
      validadeMeses: Math.max(0, Math.floor(Number(f.validadeMeses) || 0)),
      bonusPrimeiraCompra: Math.max(0, Math.floor(Number(f.bonusPrimeiraCompra) || 0)),
      campanha: Number(camp.multiplicador) > 1 && camp.inicio && camp.fim
        ? { multiplicador: Math.min(5, Math.floor(Number(camp.multiplicador))), inicio: camp.inicio, fim: camp.fim, nome: camp.nome || '' }
        : null
    };
  }
  /** Campanha de pontos em dobro (ou triplo) valendo hoje? */
  function campanhaPontosHoje(regra = regraPontos()) {
    if (!regra || !regra.campanha) return null;
    const hoje = diaLocal(new Date().toISOString());
    return hoje >= regra.campanha.inicio && hoje <= regra.campanha.fim ? regra.campanha : null;
  }
  /** Pontos que a venda deu (sobre o que foi pago sem pontos e sem o que voltou em troca) */
  function pontosGanhosDa(v) {
    if (!v.pontos || !v.clienteId || v.status === 'cancelada') return 0;
    const liquido = valorLiquido(v);
    if (liquido <= 0) return 0;                       // devolvida inteira: perde também o bônus
    const base = Math.max(0, liquido - (v.pontos.valorUsado || 0));
    return Math.floor(base / (v.pontos.reaisPorPonto || 1) + 1e-9) * (v.pontos.mult || 1) + (v.pontos.bonus || 0);
  }
  const pontosUsadosDa = (v) => (v.pontos && v.status !== 'cancelada' ? (v.pontos.usados || 0) : 0);

  /** Movimentos de pontos (compras, usos e ajustes), agrupados por cliente */
  function movimentosPontos(clienteId = null) {
    const porCliente = new Map();
    const de = (id) => { if (!porCliente.has(id)) porCliente.set(id, []); return porCliente.get(id); };
    db.vendas.forEach((v) => {
      if (!v.pontos || !v.clienteId || (clienteId && v.clienteId !== clienteId)) return;
      const usados = pontosUsadosDa(v);
      const ganhos = pontosGanhosDa(v);
      // Na mesma compra: primeiro usa os pontos que tinha, depois ganha os novos
      if (usados) de(v.clienteId).push({ data: v.data, ordem: 0, tipo: 'uso', pontos: -usados, vendaId: v.id, numero: v.numero });
      if (ganhos) de(v.clienteId).push({ data: v.data, ordem: 1, tipo: 'compra', pontos: ganhos, vendaId: v.id, numero: v.numero, mult: v.pontos.mult || 1, bonus: v.pontos.bonus || 0 });
    });
    (db.ajustesPontos || []).forEach((a) => {
      if (!a.clienteId || (clienteId && a.clienteId !== clienteId)) return;
      de(a.clienteId).push({ data: a.data, ordem: 1, tipo: 'ajuste', pontos: Number(a.pontos) || 0, motivo: a.motivo || '', id: a.id });
    });
    porCliente.forEach((lista) => lista.sort((a, b) => a.data.localeCompare(b.data) || a.ordem - b.ordem));
    return porCliente;
  }

  /**
   * Saldo do cliente com validade: os pontos mais antigos são usados primeiro;
   * o que passa da validade sem ser usado vence.
   */
  function calcularPontos(movimentos, regra = regraPontos()) {
    const meses = regra ? regra.validadeMeses : 0;
    const agora = new Date().toISOString();
    const lotes = [];                     // { qtd, vence }
    const extrato = [];
    let ganhos = 0, usados = 0, vencidos = 0;
    let divida = 0;                       // usou pontos que depois voltaram (troca/devolução): as próximas compras cobrem
    const venceEm = (data) => { if (!meses) return null; const d = new Date(data); d.setMonth(d.getMonth() + meses); return d.toISOString(); };
    const vencerAte = (quando) => {
      while (lotes.length && lotes[0].vence && lotes[0].vence <= quando) {
        const l = lotes.shift();
        if (l.qtd > 0) { vencidos += l.qtd; extrato.push({ data: l.vence, tipo: 'vencidos', pontos: -l.qtd }); }
      }
    };
    const consumir = (qtd) => {
      let falta = qtd;
      while (falta > 0 && lotes.length) {
        const usa = Math.min(falta, lotes[0].qtd);
        lotes[0].qtd -= usa; falta -= usa;
        if (lotes[0].qtd <= 0) lotes.shift();
      }
      divida += falta;
    };
    movimentos.forEach((m) => {
      vencerAte(m.data);
      extrato.push(m);
      if (m.pontos > 0) {
        if (m.tipo === 'compra') ganhos += m.pontos;
        const paga = Math.min(divida, m.pontos);
        divida -= paga;
        if (m.pontos - paga <= 0) return;
        const vence = venceEm(m.data);
        // mantém a fila em ordem de vencimento (ajustes e compras no mesmo dia)
        const i = lotes.findIndex((l) => l.vence && vence && l.vence > vence);
        const lote = { qtd: m.pontos - paga, vence };
        if (i < 0) lotes.push(lote); else lotes.splice(i, 0, lote);
      } else if (m.pontos < 0) {
        if (m.tipo === 'uso') usados += -m.pontos;
        consumir(-m.pontos);
      }
    });
    vencerAte(agora);
    const saldo = lotes.reduce((s, l) => s + l.qtd, 0) - divida;
    const em30 = new Date(Date.now() + 30 * 86400000).toISOString();
    const vencendo = lotes.filter((l) => l.vence && l.vence <= em30).reduce((s, l) => s + l.qtd, 0);
    const proximo = lotes.find((l) => l.vence && l.qtd > 0);
    return { saldo, ganhos, usados, vencidos, vencendo, proximoVencimento: proximo ? proximo.vence : null, extrato };
  }

  function saldoPontosCliente(clienteId) {
    if (!clienteId) return 0;
    return calcularPontos(movimentosPontos(clienteId).get(clienteId) || []).saldo;
  }
  /** Saldo de pontos do cliente e quanto vale em R$ */
  function resumoPontos(clienteId) {
    const regra = regraPontos();
    const r = clienteId ? calcularPontos(movimentosPontos(clienteId).get(clienteId) || [], regra) : { saldo: 0, vencendo: 0, proximoVencimento: null };
    const saldo = Math.max(0, r.saldo);
    const campanha = campanhaPontosHoje(regra);
    return responder({
      ativo: !!regra, saldo, regra, campanha,
      valor: regra ? arred(saldo * regra.valorPonto) : 0,
      minimo: regra ? regra.minimoResgate : 0,
      podeUsar: !!regra && saldo > 0 && saldo >= regra.minimoResgate,
      vencendo: r.vencendo, proximoVencimento: r.proximoVencimento
    });
  }

  /** Tela do programa de pontos: clientes, extrato e números do mês */
  function painelPontos() {
    const regra = regraPontos();
    const fRegra = regra || { valorPonto: Number(((db.loja || {}).fidelidade || {}).valorPonto) || 0.05, minimoResgate: 0 };
    const movs = movimentosPontos();
    const mes = diaLocal(new Date().toISOString()).slice(0, 7);
    const clientes = [];
    const extrato = [];
    let dadosMes = 0, usadosMes = 0, vencidosMes = 0;
    movs.forEach((lista, clienteId) => {
      const cli = db.clientes.find((c) => c.id === clienteId);
      const r = calcularPontos(lista, regra);
      const ultima = lista.filter((m) => m.tipo === 'compra').map((m) => m.data).pop() || null;
      clientes.push({
        clienteId, nome: cli ? cli.nome : 'Cliente removido', telefone: cli ? cli.telefone || '' : '',
        saldo: Math.max(0, r.saldo), valor: arred(Math.max(0, r.saldo) * fRegra.valorPonto),
        ganhos: r.ganhos, usados: r.usados, vencidos: r.vencidos, vencendo: r.vencendo,
        proximoVencimento: r.proximoVencimento, ultimaCompra: ultima,
        podeUsar: !!regra && r.saldo > 0 && r.saldo >= fRegra.minimoResgate
      });
      r.extrato.forEach((m) => {
        extrato.push({ ...m, clienteId, clienteNome: cli ? cli.nome : '—' });
        if (m.data.slice(0, 7) !== mes) return;
        if (m.tipo === 'compra' || (m.tipo === 'ajuste' && m.pontos > 0)) dadosMes += m.pontos;
        if (m.tipo === 'uso') usadosMes += -m.pontos;
        if (m.tipo === 'vencidos') vencidosMes += -m.pontos;
      });
    });
    clientes.sort((a, b) => b.saldo - a.saldo || a.nome.localeCompare(b.nome, 'pt-BR'));
    extrato.sort((a, b) => b.data.localeCompare(a.data));
    const saldoTotal = clientes.reduce((s, c) => s + c.saldo, 0);
    return responder({
      ativo: !!regra, regra: regra || null, campanha: campanhaPontosHoje(regra),
      clientes, extrato,
      totais: {
        clientes: clientes.filter((c) => c.saldo > 0).length,
        saldo: saldoTotal, saldoValor: arred(saldoTotal * fRegra.valorPonto),
        dadosMes, usadosMes, usadosMesValor: arred(usadosMes * fRegra.valorPonto), vencidosMes,
        vencendo: clientes.reduce((s, c) => s + c.vencendo, 0),
        clientesVencendo: clientes.filter((c) => c.vencendo > 0).length
      }
    });
  }

  /** Bônus ou correção manual de pontos (só o dono) */
  function ajustarPontos({ clienteId, pontos, motivo }) {
    const negado = exigirDono('ajustar pontos'); if (negado) return negado;
    const qtd = Math.trunc(Number(pontos) || 0);
    if (!clienteId || !db.clientes.some((c) => c.id === clienteId)) return falhar('Escolha o cliente.');
    if (!qtd) return falhar('Informe quantos pontos dar ou tirar.');
    if (!String(motivo || '').trim()) return falhar('Escreva o motivo (aparece no extrato).');
    if (qtd < 0 && -qtd > Math.max(0, saldoPontosCliente(clienteId))) return falhar('O cliente não tem tudo isso de pontos para tirar.');
    db.ajustesPontos = db.ajustesPontos || [];
    const ajuste = { id: gerarId('ap'), clienteId, pontos: qtd, motivo: String(motivo).trim().slice(0, 80), data: new Date().toISOString(), usuarioId: usuarioLogadoId() };
    db.ajustesPontos.push(ajuste);
    persistir();
    return responder(ajuste);
  }

  function usuarioLogadoId() {
    if (MODO === 'nuvem') return uidAtual;
    try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO))?.id || 'u1'; } catch (e) { return 'u1'; }
  }
  function usuarioLogado() {
    if (MODO === 'nuvem') {
      const u = db.usuarios.find((x) => x.id === uidAtual);
      // O perfil vem sempre do "acesso" (é o que as regras de segurança usam)
      if (perfilAcesso) return { ...(u || { id: uidAtual, nome: perfilAcesso.nome, email: perfilAcesso.email, ativo: true, comissao: 0 }), perfil: perfilAcesso.perfil };
      return u || { id: null, nome: '', email: '', perfil: 'vendedor' };
    }
    return db.usuarios.find((u) => u.id === usuarioLogadoId()) || db.usuarios[0];
  }

  /**
   * Ações exclusivas do dono. Retorna uma Promise rejeitada se o usuário
   * logado for vendedor, ou null se pode seguir.
   * No Firebase, a mesma regra vai nas Security Rules (o navegador não é confiável).
   */
  function exigirDono(acao = 'fazer isso') {
    return usuarioLogado().perfil === 'dono' ? null : falhar(`Apenas o dono da loja pode ${acao}.`);
  }

  /* ==================================================================
     AUTENTICAÇÃO
     ================================================================== */

  /** Faz login. Nuvem: e-mail e senha de verdade. Local: aceita qualquer senha (protótipo). */
  async function entrar(email, senha, lembrar = true) {
    if (MODO === 'local') {
      const usuario = db.usuarios.find((u) => normalizar(u.email) === normalizar(email)) || db.usuarios[0];
      try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify(usuario)); } catch (e) { /* ignora */ }
      return responder(usuario);
    }
    iniciarFirebase();
    let cred;
    try {
      // Lembrar de mim: continua logado ao fechar o navegador; senão, só nesta janela
      await fb.auth.setPersistence(lembrar ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
      cred = await fb.auth.signInWithEmailAndPassword(String(email).trim(), senha);
    } catch (e) { throw new Error(traduzirErro(e)); }
    try {
      if (ehSuperAdmin(cred.user.uid)) return usuarioSuporte(cred.user);
      const acesso = await lerAcesso(cred.user);
      if (await lojaBloqueada(acesso.lojaId)) throw new Error(MSG_BLOQUEIO);
      return { id: cred.user.uid, nome: acesso.nome, email: acesso.email, perfil: acesso.perfil };
    } catch (e) {
      await fb.auth.signOut();
      throw e;
    }
  }

  /** Encerra a sessão. */
  async function sair() {
    if (MODO === 'local') {
      try { localStorage.removeItem(CHAVE_SESSAO); } catch (e) { /* ignora */ }
      return responder(true);
    }
    pararOuvintes();
    await fb.auth.signOut();
    return true;
  }

  /** Usuário logado. */
  function usuarioAtual() {
    return responder(usuarioLogado());
  }

  /** Troca a senha de quem está logado (confere a senha atual antes). */
  async function trocarSenha(senhaAtual, novaSenha) {
    if (!senhaAtual || !novaSenha) throw new Error('Preencha a senha atual e a nova.');
    if (String(novaSenha).length < 6) throw new Error('A nova senha precisa ter pelo menos 6 caracteres.');
    if (MODO === 'local') return true;
    iniciarFirebase();
    const user = fb.auth.currentUser;
    if (!user) throw new Error('Sua sessão expirou. Entre de novo.');
    try {
      await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email, senhaAtual));
    } catch (e) {
      throw new Error(e.code === 'auth/too-many-requests' ? traduzirErro(e) : 'A senha atual está incorreta.');
    }
    try { await user.updatePassword(novaSenha); } catch (e) { throw new Error(traduzirErro(e)); }
    return true;
  }

  /* ==================================================================
     PAINEL DO SUPORTE (super admin)
       assinaturas/{lojaId}                      → { nomeLoja, valor, diaVencimento, inicio, ativa, observacao }
       assinaturas/{lojaId}/pagamentos/{AAAA-MM} → { competencia, valor, pagoEm, forma, observacao }
       lojas/{lojaId}.bloqueada                  → bloqueio de acesso (regras impedem a loja de usar)
     ================================================================== */
  function exigirSuperAdmin() {
    if (MODO !== 'nuvem') throw new Error('O painel do suporte funciona só com o Firebase configurado.');
    iniciarFirebase();
    if (!ehSuperAdmin(fb.auth.currentUser && fb.auth.currentUser.uid)) throw new Error('Apenas o suporte pode fazer isso.');
  }

  /** Todas as lojas com donos/usuários, mensalidade e pagamentos */
  async function adminListarLojas() {
    exigirSuperAdmin();
    const [acessos, lojas, assinaturas] = await Promise.all([
      fb.fs.collection('acessos').get(), fb.fs.collection('lojas').get(), fb.fs.collection('assinaturas').get()
    ]);
    const mapa = {};
    const garantir = (id) => (mapa[id] = mapa[id] || { id, nome: '', bloqueada: false, motivoBloqueio: '', usuarios: [], assinatura: null, pagamentos: [] });
    lojas.forEach((d) => Object.assign(garantir(d.id), { nome: d.data().nome || '', bloqueada: d.data().bloqueada === true, motivoBloqueio: d.data().motivoBloqueio || '', criadoEm: d.data().criadoEm || '' }));
    acessos.forEach((d) => { const a = d.data(); if (a.lojaId) garantir(a.lojaId).usuarios.push({ uid: d.id, nome: a.nome, email: a.email, perfil: a.perfil, ativo: a.ativo !== false }); });
    assinaturas.forEach((d) => { garantir(d.id).assinatura = d.data(); });
    await Promise.all(Object.values(mapa).map(async (l) => {
      const [pags, ajuste, avs] = await Promise.all([
        fb.fs.collection('assinaturas').doc(l.id).collection('pagamentos').get(),
        fb.fs.collection('lojas').doc(l.id).collection('ajustes').doc('loja').get().catch(() => null),
        fb.fs.collection('assinaturas').doc(l.id).collection('avisos').get()
      ]);
      l.avisos = avs.docs.map((x) => ({ id: x.id, ...x.data() })).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
      l.pagamentos = pags.docs.map((x) => ({ id: x.id, ...x.data() })).sort((a, b) => String(b.competencia).localeCompare(String(a.competencia)));
      const dadosLoja = ajuste && ajuste.exists ? ajuste.data() : {};
      l.nome = dadosLoja.nome || l.nome || (l.assinatura && l.assinatura.nomeLoja) || 'Loja sem nome';
      l.telefone = dadosLoja.telefone || '';
      l.situacao = situacaoMensalidade(l.assinatura, l.pagamentos.filter((p) => p.competencia !== 'implantacao'), l.avisos);
      l.implantacao = situacaoImplantacao(l.assinatura, l.pagamentos, l.avisos);
    }));
    return Object.values(mapa).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  async function adminSalvarAssinatura(id, dados) {
    exigirSuperAdmin();
    const valor = Math.round(Number(dados.valor || 0) * 100) / 100;
    const dia = Math.min(28, Math.max(1, parseInt(dados.diaVencimento, 10) || 10));
    // Mês de início: só na primeira vez (ou quando informado)
    const atual = await fb.fs.collection('assinaturas').doc(id).get();
    if (!dados.inicio && !(atual.exists && atual.data().inicio)) dados.inicio = mesAtual();
    await fb.fs.collection('assinaturas').doc(id).set({
      nomeLoja: dados.nomeLoja || '', valor, diaVencimento: dia,
      ...(dados.inicio ? { inicio: dados.inicio } : {}),
      ...(dados.valorPromocional !== undefined ? { valorPromocional: Math.round(Number(dados.valorPromocional || 0) * 100) / 100 } : {}),
      ...(dados.mesesPromocionais !== undefined ? { mesesPromocionais: Math.max(0, parseInt(dados.mesesPromocionais, 10) || 0) } : {}),
      ativa: dados.ativa !== false, observacao: dados.observacao || '', atualizadoEm: new Date().toISOString(),
      ...(dados.implantacaoValor !== undefined ? { implantacaoValor: Math.round(Number(dados.implantacaoValor || 0) * 100) / 100 } : {})
    }, { merge: true });
    return true;
  }

  async function adminRegistrarPagamento(id, { competencia, valor, pagoEm, forma = 'pix', observacao = '' }) {
    exigirSuperAdmin();
    if (competencia !== 'implantacao' && !/^\d{4}-\d{2}$/.test(competencia || '')) throw new Error('Informe o mês de referência.');
    await fb.fs.collection('assinaturas').doc(id).collection('pagamentos').doc(competencia).set({
      competencia, valor: Math.round(Number(valor || 0) * 100) / 100, pagoEm: pagoEm || new Date().toISOString().slice(0, 10),
      forma, observacao, registradoEm: new Date().toISOString()
    });
    return true;
  }

  /** Confirma (vira pagamento) ou recusa um aviso de pagamento da loja */
  async function adminResponderAviso(id, competencia, confirmar, dados = {}) {
    exigirSuperAdmin();
    const ref = fb.fs.collection('assinaturas').doc(id).collection('avisos').doc(competencia);
    const aviso = await ref.get();
    if (confirmar) {
      await adminRegistrarPagamento(id, { competencia, valor: dados.valor ?? (aviso.exists ? aviso.data().valor : 0), pagoEm: dados.pagoEm, forma: 'pix', observacao: 'Confirmado pelo suporte' });
      await ref.set({ status: 'confirmado', respondidoEm: new Date().toISOString() }, { merge: true });
    } else {
      await ref.set({ status: 'recusado', motivo: dados.motivo || '', respondidoEm: new Date().toISOString() }, { merge: true });
    }
    return true;
  }

  async function adminExcluirPagamento(id, competencia) {
    exigirSuperAdmin();
    await fb.fs.collection('assinaturas').doc(id).collection('pagamentos').doc(competencia).delete();
    return true;
  }

  async function adminBloquearLoja(id, bloquear, motivo = '') {
    exigirSuperAdmin();
    await fb.fs.collection('lojas').doc(id).set({ bloqueada: !!bloquear, motivoBloqueio: bloquear ? motivo : '', bloqueioAtualizadoEm: new Date().toISOString() }, { merge: true });
    return true;
  }

  /* ---------- Backup (arquivo .json) ---------- */
  const COLECOES_BACKUP = [...COLECOES, 'ajustes'];
  const docsDe = (snap) => Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));

  /** Tudo de uma loja num objeto (para baixar como arquivo) */
  async function adminExportarLoja(id) {
    exigirSuperAdmin();
    const ref = fb.fs.collection('lojas').doc(id);
    const assin = fb.fs.collection('assinaturas').doc(id);
    const [cabecalho, acessos, assinatura, pagamentos, avisos, ...colecoes] = await Promise.all([
      ref.get(), fb.fs.collection('acessos').where('lojaId', '==', id).get(),
      assin.get(), assin.collection('pagamentos').get(), assin.collection('avisos').get(),
      ...COLECOES_BACKUP.map((c) => ref.collection(c).get())
    ]);
    const backup = {
      tipo: 'backup-loja', versao: 1, geradoEm: new Date().toISOString(), lojaId: id,
      loja: cabecalho.exists ? cabecalho.data() : null,
      colecoes: Object.fromEntries(COLECOES_BACKUP.map((c, i) => [c, docsDe(colecoes[i])])),
      acessos: docsDe(acessos),
      assinatura: assinatura.exists ? assinatura.data() : null,
      pagamentos: docsDe(pagamentos),
      avisos: docsDe(avisos)
    };
    // Lembra quando foi o último backup (aparece no painel)
    await assin.set({ ultimoBackup: backup.geradoEm }, { merge: true }).catch(() => {});
    return backup;
  }

  /**
   * Restaura uma loja a partir do arquivo de backup.
   * Grava de volta tudo o que está no arquivo (não apaga o que foi criado depois).
   * @returns {Promise<number>} quantidade de registros gravados
   */
  /**
   * Zera dados de uma loja (antes de entregar, por exemplo).
   * Apaga só as coleções pedidas; configurações, usuários e mensalidade ficam.
   * @returns {Promise<number>} quantidade de registros apagados
   */
  async function adminZerarLoja(id, colecoes) {
    exigirSuperAdmin();
    const alvo = (colecoes || []).filter((c) => COLECOES.includes(c) && c !== 'usuarios');
    if (!alvo.length) throw new Error('Escolha o que apagar.');
    const ref = fb.fs.collection('lojas').doc(id);
    const snaps = await Promise.all(alvo.map((c) => ref.collection(c).get()));
    const docs = snaps.flatMap((s) => s.docs.map((d) => d.ref));
    for (let i = 0; i < docs.length; i += 400) {
      const lote = fb.fs.batch();
      docs.slice(i, i + 400).forEach((r) => lote.delete(r));
      await lote.commit();
    }
    return docs.length;
  }

  async function adminRestaurarLoja(id, backup) {
    exigirSuperAdmin();
    if (!backup || backup.tipo !== 'backup-loja' || !backup.colecoes) throw new Error('Este arquivo não é um backup de loja do sistema.');
    if (backup.lojaId !== id) throw new Error('Este backup é de outra loja.');
    const ref = fb.fs.collection('lojas').doc(id);
    const assin = fb.fs.collection('assinaturas').doc(id);
    const ops = [];
    if (backup.loja) ops.push([ref, backup.loja, true]);
    Object.entries(backup.colecoes).forEach(([c, docs]) => {
      if (!COLECOES_BACKUP.includes(c)) return;
      Object.entries(docs || {}).forEach(([docId, dados]) => ops.push([ref.collection(c).doc(docId), dados]));
    });
    Object.entries(backup.acessos || {}).forEach(([uid, dados]) => { if (dados && dados.lojaId === id) ops.push([fb.fs.collection('acessos').doc(uid), dados]); });
    if (backup.assinatura) ops.push([assin, backup.assinatura, true]);
    Object.entries(backup.pagamentos || {}).forEach(([docId, dados]) => ops.push([assin.collection('pagamentos').doc(docId), dados]));
    Object.entries(backup.avisos || {}).forEach(([docId, dados]) => ops.push([assin.collection('avisos').doc(docId), dados]));
    for (let i = 0; i < ops.length; i += 400) {
      const lote = fb.fs.batch();
      ops.slice(i, i + 400).forEach(([r, dados, mesclar]) => (mesclar ? lote.set(r, dados, { merge: true }) : lote.set(r, dados)));
      await lote.commit();
    }
    return ops.length;
  }

  /** Cria a loja de uma cliente nova (conta do dono + loja vazia + mensalidade), sem sair do painel */
  async function adminCriarLoja({ nomeLoja, nome, email, senha, valor = 0, diaVencimento = 10, implantacaoValor = 300, valorPromocional = 0, mesesPromocionais = 0, inicio = '' }) {
    exigirSuperAdmin();
    if (!nomeLoja || !email || !senha) throw new Error('Preencha nome da loja, e-mail e senha.');
    if (String(senha).length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
    const authSec = appSecundario();
    let cred;
    try { cred = await authSec.createUserWithEmailAndPassword(String(email).trim(), senha); } catch (e) { throw new Error(traduzirErro(e)); }
    await authSec.signOut();
    const uid = cred.user.uid;
    const novaLoja = gerarId('loja');
    const agora = new Date().toISOString();
    const nomeDono = nome || 'Admin';
    await fb.fs.collection('acessos').doc(uid).set({ lojaId: novaLoja, perfil: 'dono', nome: nomeDono, email: String(email).trim(), ativo: true, criadoEm: agora });
    await fb.fs.collection('lojas').doc(novaLoja).set({ nome: nomeLoja, donoUid: uid, criadoEm: agora, bloqueada: false });
    // Dados iniciais da loja (tamanhos, categorias, cores, configurações e o dono)
    const base = bancoBase(nomeLoja);
    base.usuarios = [{ id: uid, nome: nomeDono, email: String(email).trim(), perfil: 'dono', ativo: true, comissao: 0 }];
    const lote = fb.fs.batch();
    const ref = fb.fs.collection('lojas').doc(novaLoja);
    AJUSTES.forEach((n) => lote.set(ref.collection('ajustes').doc(n), ajusteParaDoc(n, clonar(base[n]))));
    base.usuarios.forEach((u) => lote.set(ref.collection('usuarios').doc(u.id), clonar(u)));
    await lote.commit();
    await adminSalvarAssinatura(novaLoja, { nomeLoja, valor, diaVencimento, ativa: true, implantacaoValor, valorPromocional, mesesPromocionais, inicio: inicio || mesAtual() });
    return { lojaId: novaLoja, uid };
  }

  /* ---------- Mensalidade (lado da loja) ---------- */
  const mesAtual = () => new Date().toISOString().slice(0, 7);
  const somarMesesComp = (c, n) => { const [a, m] = c.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  /** Mês em que termina a promoção (último mês com valor promocional) ou null */
  function fimDaPromocao(a) {
    if (!a || !(a.valorPromocional > 0) || !(a.mesesPromocionais > 0) || !a.inicio) return null;
    return somarMesesComp(a.inicio, a.mesesPromocionais - 1);
  }
  /** Valor da mensalidade num mês: promocional nos primeiros meses, depois o normal */
  function valorDaMensalidade(a, competencia = mesAtual()) {
    if (!a) return 0;
    const fim = fimDaPromocao(a);
    return fim && competencia >= (a.inicio || competencia) && competencia <= fim ? a.valorPromocional : (a.valor || 0);
  }
  /** Situação de um mês: pago, informado (aguardando confirmação), atrasado ou em aberto */
  function situacaoMensalidade(assinatura, pagamentos, avisos, competencia = mesAtual()) {
    if (!assinatura || assinatura.ativa === false || !(assinatura.valor > 0)) return { status: 'sem', competencia };
    if (assinatura.inicio && competencia < assinatura.inicio) {
      return { status: 'futuro', competencia: assinatura.inicio, vencimento: `${assinatura.inicio}-${String(assinatura.diaVencimento || 10).padStart(2, '0')}`, valor: valorDaMensalidade(assinatura, assinatura.inicio) };
    }
    const valorMes = valorDaMensalidade(assinatura, competencia);
    const pago = pagamentos.find((p) => p.competencia === competencia);
    if (pago) return { status: 'pago', competencia, pagamento: pago, valor: valorMes };
    const vencimento = `${competencia}-${String(assinatura.diaVencimento || 10).padStart(2, '0')}`;
    const aviso = avisos.find((a) => a.competencia === competencia && a.status !== 'recusado');
    if (aviso) return { status: 'informado', competencia, vencimento, aviso, valor: valorMes };
    const hoje = new Date().toISOString().slice(0, 10);
    const dias = Math.floor((new Date(hoje + 'T12:00:00') - new Date(vencimento + 'T12:00:00')) / 86400000);
    return { status: dias > 0 ? 'atrasado' : 'aberto', competencia, vencimento, diasAtraso: Math.max(0, dias), valor: valorMes };
  }

  /** Implantação (pagamento único): sem, paga, informada ou pendente */
  function situacaoImplantacao(assinatura, pagamentos, avisos) {
    const valor = assinatura && assinatura.implantacaoValor > 0 ? assinatura.implantacaoValor : 0;
    if (!valor) return { status: 'sem', valor: 0 };
    const pago = pagamentos.find((p) => p.competencia === 'implantacao');
    if (pago) return { status: 'paga', valor, pagamento: pago };
    if (avisos.find((a) => a.competencia === 'implantacao' && a.status !== 'recusado')) return { status: 'informada', valor };
    return { status: 'pendente', valor };
  }

  /** Mensalidade da loja de quem está logado (dono) */
  async function obterMensalidade() {
    if (MODO !== 'nuvem') return { assinatura: null, pagamentos: [], avisos: [], situacao: { status: 'sem' } };
    iniciarFirebase();
    const ref = fb.fs.collection('assinaturas').doc(lojaId);
    const [doc, pags, avs] = await Promise.all([ref.get(), ref.collection('pagamentos').get(), ref.collection('avisos').get()]);
    const assinatura = doc.exists ? doc.data() : null;
    const pagamentos = pags.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.competencia).localeCompare(String(a.competencia)));
    const avisos = avs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    // A mensalidade (situação do mês) ignora o pagamento da implantação
    const mensais = pagamentos.filter((p) => p.competencia !== 'implantacao');
    return { lojaId, assinatura, pagamentos, avisos, situacao: situacaoMensalidade(assinatura, mensais, avisos), implantacao: situacaoImplantacao(assinatura, pagamentos, avisos) };
  }

  /** Dono avisa que pagou (o suporte confirma no painel) */
  async function informarPagamentoMensalidade(competencia = mesAtual(), observacao = '') {
    if (MODO !== 'nuvem') throw new Error('Disponível só com o sistema na nuvem.');
    if (usuarioLogado().perfil !== 'dono') throw new Error('Apenas o dono da loja pode informar o pagamento.');
    const doc = await fb.fs.collection('assinaturas').doc(lojaId).get();
    const dados = doc.exists ? doc.data() : {};
    const valor = competencia === 'implantacao' ? dados.implantacaoValor || 0 : valorDaMensalidade(dados, competencia);
    await fb.fs.collection('assinaturas').doc(lojaId).collection('avisos').doc(competencia).set({
      competencia, valor, observacao, status: 'pendente', criadoEm: new Date().toISOString(),
      informadoPor: usuarioLogado().nome || '', uid: uidAtual
    });
    return true;
  }

  /** Envia o e-mail para criar uma senha nova. */
  async function recuperarSenha(email) {
    if (!email) return falhar('Informe seu e-mail.');
    if (MODO === 'local') return responder(true);
    iniciarFirebase();
    try { await fb.auth.sendPasswordResetEmail(String(email).trim()); } catch (e) { throw new Error(traduzirErro(e)); }
    return true;
  }

  /**
   * Primeiro acesso: cria a conta do dono e a loja na nuvem.
   * @param {{nomeLoja, nome, email, senha, exemplo?}} p  exemplo=true carrega os dados de demonstração
   */
  async function criarLoja({ nomeLoja, nome, email, senha, exemplo = false }) {
    if (MODO === 'local') throw new Error('Configure o Firebase (js/firebase-config.js) para criar a loja na nuvem.');
    if (!nomeLoja || !nome || !email || !senha) throw new Error('Preencha todos os campos.');
    iniciarFirebase();
    let cred;
    try { cred = await fb.auth.createUserWithEmailAndPassword(String(email).trim(), senha); } catch (e) { throw new Error(traduzirErro(e)); }
    const uid = cred.user.uid;
    const agora = new Date().toISOString();
    const novaLoja = gerarId('loja');
    try {
      perfilAcesso = { lojaId: novaLoja, perfil: 'dono', nome, email: String(email).trim(), ativo: true, criadoEm: agora };
      await fb.fs.collection('acessos').doc(uid).set(perfilAcesso);
      await fb.fs.collection('lojas').doc(novaLoja).set({ nome: nomeLoja, donoUid: uid, criadoEm: agora });
      uidAtual = uid;
      lojaId = novaLoja;
      const dono = { id: uid, nome, email: String(email).trim(), perfil: 'dono', ativo: true, comissao: 0 };
      let base;
      if (exemplo) {
        // Dados de demonstração: o dono do exemplo ("u1") vira a conta criada agora
        base = JSON.parse(JSON.stringify(window.MOCK_DATA).split('"u1"').join(JSON.stringify(uid)));
        base.usuarios = [dono, ...base.usuarios.filter((u) => u.id !== uid)];
        base.loja = { ...base.loja, nome: nomeLoja };
      } else {
        base = bancoBase(nomeLoja);
        base.usuarios = [dono];
      }
      db = base;
      COLECOES.forEach((c) => { espelho[c] = new Map(); if (!Array.isArray(db[c])) db[c] = []; });
      espelho.ajustes = {};
      await sincronizar();
      return dono;
    } catch (e) {
      throw new Error(traduzirErro(e));
    }
  }

  /* ==================================================================
     LOJA E USUÁRIOS
     ================================================================== */

  function obterLoja() { return responder(db.loja); }

  function salvarLoja(dados) {
    const negado = exigirDono('alterar os dados da loja'); if (negado) return negado;
    db.loja = { ...db.loja, ...dados };
    persistir();
    return responder(db.loja);
  }

  function listarUsuarios() { return responder(db.usuarios); }

  function salvarUsuario(usuario) {
    const negado = exigirDono('gerenciar usuários'); if (negado) return negado;
    if (!usuario.nome || !usuario.email) return falhar('Nome e e-mail são obrigatórios.');
    if (MODO === 'nuvem') return salvarUsuarioNuvem(usuario);
    delete usuario.senha; // protótipo: senha não é usada nem guardada
    if (usuario.id) {
      const i = db.usuarios.findIndex((u) => u.id === usuario.id);
      db.usuarios[i] = { ...db.usuarios[i], ...usuario };
    } else {
      usuario = { ...usuario, id: gerarId('u'), ativo: usuario.ativo !== false };
      db.usuarios.push(usuario);
    }
    persistir();
    return responder(usuario);
  }

  function excluirUsuario(id) {
    const negado = exigirDono('gerenciar usuários'); if (negado) return negado;
    if (id === usuarioLogadoId()) return falhar('Você não pode excluir o próprio usuário.');
    if (MODO === 'nuvem') {
      // A conta de login não pode ser apagada pelo navegador: tira o acesso à loja
      return (async () => {
        try { await fb.fs.collection('acessos').doc(String(id)).delete(); } catch (e) { throw new Error(traduzirErro(e)); }
        db.usuarios = db.usuarios.filter((u) => u.id !== id);
        persistir();
        return true;
      })();
    }
    db.usuarios = db.usuarios.filter((u) => u.id !== id);
    persistir();
    return responder(true);
  }

  /**
   * Nuvem: usuário novo recebe um convite por e-mail (link para criar a senha).
   * Alterações de perfil/ativo também vão para o "acesso" (usado pelas regras).
   */
  async function salvarUsuarioNuvem(usuario) {
    const senha = usuario.senha;
    usuario = { ...usuario };
    delete usuario.senha; // a senha vai só para o Firebase Authentication, nunca para o banco
    try {
      if (usuario.id) {
        const i = db.usuarios.findIndex((u) => u.id === usuario.id);
        db.usuarios[i] = { ...db.usuarios[i], ...usuario };
        await fb.fs.collection('acessos').doc(String(usuario.id)).set({
          lojaId, perfil: db.usuarios[i].perfil, nome: db.usuarios[i].nome, email: db.usuarios[i].email, ativo: db.usuarios[i].ativo !== false
        }, { merge: true });
        persistir();
        return clonar(db.usuarios[i]);
      }
      const email = String(usuario.email).trim();
      const authSec = appSecundario();
      let cred;
      if (senha) {
        // Senha definida por quem cadastrou: a pessoa já entra com ela
        if (String(senha).length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
        cred = await authSec.createUserWithEmailAndPassword(email, senha);
      } else {
        // Sem senha: convite por e-mail para a pessoa criar a própria
        cred = await authSec.createUserWithEmailAndPassword(email, gerarId('S') + 'x9!' + Math.random().toString(36).slice(2, 8));
        authSec.languageCode = 'pt-BR';
        await authSec.sendPasswordResetEmail(email);
      }
      await authSec.signOut();
      const novo = { ...usuario, id: cred.user.uid, email, ativo: usuario.ativo !== false };
      await fb.fs.collection('acessos').doc(novo.id).set({ lojaId, perfil: novo.perfil || 'vendedor', nome: novo.nome, email, ativo: novo.ativo, criadoEm: new Date().toISOString() });
      db.usuarios.push(novo);
      persistir();
      return clonar(novo);
    } catch (e) {
      throw new Error(traduzirErro(e));
    }
  }

  /* ==================================================================
     CATÁLOGO AUXILIAR (listas para selects e filtros)
     ================================================================== */

  function listarCategorias() { return responder(db.categorias); }
  function listarTamanhos() { return responder(db.tamanhos); }
  function listarCores() { return responder(db.cores); }

  /** Adiciona uma cor personalizada à paleta ({nome, hex}). */
  function adicionarCor(cor) {
    const negado = exigirDono('cadastrar cores'); if (negado) return negado;
    if (!cor.nome) return falhar('Informe o nome da cor.');
    const existente = db.cores.find((c) => normalizar(c.nome) === normalizar(cor.nome));
    if (existente) return responder(existente);
    db.cores.push({ nome: cor.nome, hex: cor.hex || '#CCCCCC' });
    persistir();
    return responder(cor);
  }

  function listarMarcas() {
    return responder([...new Set(db.produtos.map((p) => p.marca))].sort());
  }
  function listarColecoes() {
    return responder([...new Set(db.produtos.map((p) => p.colecao).filter(Boolean))].sort());
  }

  /* ==================================================================
     PRODUTOS
     ================================================================== */

  /**
   * Lista produtos com filtros opcionais.
   * @param {{busca?, categoria?, marca?, tamanho?, cor?}} filtros
   */
  function listarProdutos(filtros = {}) {
    const busca = normalizar(filtros.busca);
    const lista = db.produtos
      .filter((p) => {
        if (busca) {
          const alvo = normalizar([p.nome, p.marca, p.categoria, ...p.variacoes.map((v) => v.sku + ' ' + v.codigoBarras)].join(' '));
          if (!alvo.includes(busca)) return false;
        }
        if (filtros.categoria && p.categoria !== filtros.categoria) return false;
        if (filtros.marca && p.marca !== filtros.marca) return false;
        if (filtros.tamanho && !p.variacoes.some((v) => v.tamanho === filtros.tamanho)) return false;
        if (filtros.cor && !p.variacoes.some((v) => v.cor === filtros.cor)) return false;
        return true;
      })
      .map(comTotais)
      // Situação do NCM: 'sem' | 'proprio' | 'categoria'
      .filter((p) => !filtros.ncm || p.ncmOrigem === filtros.ncm)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return responder(lista);
  }

  function obterProduto(id) {
    const p = db.produtos.find((x) => x.id === id);
    return p ? responder(comTotais(p)) : falhar('Produto não encontrado.');
  }

  /** Cria ou atualiza um produto (com sua grade de variações). */
  function salvarProduto(produto) {
    const negado = exigirDono('cadastrar ou alterar produtos'); if (negado) return negado;
    if (!produto.nome) return falhar('Informe o nome do produto.');
    if (!produto.variacoes || !produto.variacoes.length) return falhar('Gere a grade de variações.');

    // SKU e código de barras precisam ser únicos entre produtos
    for (const v of produto.variacoes) {
      const existente = acharVariacao(v.sku);
      if (existente && existente.produto.id !== produto.id) return falhar(`O SKU ${v.sku} já existe em outro produto.`);
    }

    const limpo = { ...produto };
    delete limpo.estoqueTotal;
    delete limpo.estoqueBaixo;
    delete limpo.ncmEfetivo; // campos calculados: não são gravados
    delete limpo.ncmOrigem;
    delete limpo.precoPromocional;
    delete limpo.promocao;

    if (limpo.id) {
      const i = db.produtos.findIndex((p) => p.id === limpo.id);
      if (i < 0) return falhar('Produto não encontrado.');
      db.produtos[i] = { ...db.produtos[i], ...limpo };
    } else {
      limpo.id = gerarId('p');
      limpo.ativo = true;
      limpo.criadoEm = new Date().toISOString();
      db.produtos.push(limpo);
      // Registra o estoque inicial como entrada
      limpo.variacoes.filter((v) => v.estoque > 0).forEach((v) => {
        db.movimentacoes.push({ id: gerarId('m'), data: limpo.criadoEm, tipo: 'entrada', produtoId: limpo.id, sku: v.sku, quantidade: Number(v.estoque), motivo: 'Estoque inicial (cadastro)', usuarioId: usuarioLogadoId() });
      });
    }
    persistir();
    return responder(comTotais(limpo.id ? db.produtos.find((p) => p.id === limpo.id) : limpo));
  }

  function excluirProduto(id) {
    const negado = exigirDono('excluir produtos'); if (negado) return negado;
    db.produtos = db.produtos.filter((p) => p.id !== id);
    persistir();
    return responder(true);
  }

  /** Busca uma variação pelo código de barras ou SKU (leitor do PDV). */
  function buscarPorCodigo(codigo) {
    const c = normalizar(codigo).trim();
    for (const p of db.produtos) {
      const v = p.variacoes.find((x) => x.codigoBarras === c || normalizar(x.sku) === c);
      if (v) return responder({ produto: comTotais(p), variacao: v });
    }
    return responder(null);
  }

  /** Produtos com estoque total abaixo (ou igual) ao mínimo. */
  function listarEstoqueBaixo() {
    const lista = db.produtos.map(comTotais).filter((p) => p.estoqueBaixo)
      .sort((a, b) => a.estoqueTotal - b.estoqueTotal);
    return responder(lista);
  }

  /* ==================================================================
     ESTOQUE (movimentações)
     ================================================================== */

  /**
   * Histórico de movimentações.
   * @param {{tipo?, produtoId?, busca?, dataInicio?, dataFim?}} filtros
   */
  function listarMovimentacoes(filtros = {}) {
    const busca = normalizar(filtros.busca);
    const lista = db.movimentacoes
      .filter((m) => {
        if (filtros.tipo && m.tipo !== filtros.tipo) return false;
        if (filtros.produtoId && m.produtoId !== filtros.produtoId) return false;
        if (!noPeriodo(m.data, filtros.dataInicio, filtros.dataFim)) return false;
        return true;
      })
      .map((m) => {
        const p = db.produtos.find((x) => x.id === m.produtoId);
        const v = p && p.variacoes.find((x) => x.sku === m.sku);
        const u = db.usuarios.find((x) => x.id === m.usuarioId);
        return { ...m, produtoNome: p ? p.nome : '(produto excluído)', tamanho: v?.tamanho, cor: v?.cor, usuarioNome: u ? u.nome : '—' };
      })
      .filter((m) => !busca || normalizar(`${m.produtoNome} ${m.sku} ${m.motivo}`).includes(busca))
      .sort((a, b) => b.data.localeCompare(a.data));
    return responder(lista);
  }

  /**
   * Registra entrada, saída ou ajuste.
   * - entrada: soma a quantidade
   * - saida: subtrai a quantidade
   * - ajuste: define o estoque final = quantidade informada (guarda a diferença)
   */
  function registrarMovimentacao({ produtoId, sku, tipo, quantidade, motivo }) {
    const negado = exigirDono('movimentar o estoque'); if (negado) return negado;
    const achado = acharVariacao(sku);
    if (!achado || achado.produto.id !== produtoId) return falhar('Variação não encontrada.');
    const v = achado.variacao;
    const qtd = Number(quantidade);
    if (!Number.isFinite(qtd) || qtd < 0) return falhar('Quantidade inválida.');

    let diferenca;
    if (tipo === 'entrada') diferenca = qtd;
    else if (tipo === 'saida') {
      if (qtd > v.estoque) return falhar(`Estoque insuficiente (disponível: ${v.estoque}).`);
      diferenca = qtd;
    } else if (tipo === 'ajuste') diferenca = qtd - v.estoque;
    else return falhar('Tipo de movimentação inválido.');

    if (tipo === 'saida') v.estoque -= qtd;
    else if (tipo === 'entrada') v.estoque += qtd;
    else v.estoque = qtd;

    const mov = { id: gerarId('m'), data: new Date().toISOString(), tipo, produtoId, sku, quantidade: diferenca, motivo: motivo || '', usuarioId: usuarioLogadoId() };
    db.movimentacoes.push(mov);
    persistir();
    return responder(mov);
  }

  /* ==================================================================
     VENDAS
     ================================================================== */

  function montarVenda(v) {
    const c = db.clientes.find((x) => x.id === v.clienteId);
    const u = db.usuarios.find((x) => x.id === v.vendedorId);
    const qtdItens = v.itens.reduce((s, i) => s + i.qtd, 0);
    const credito = v.devolucao && v.devolucao.creditoId ? (db.creditos || []).find((x) => x.id === v.devolucao.creditoId) : null;
    const cancelador = v.cancelamento ? db.usuarios.find((x) => x.id === v.cancelamento.usuarioId) : null;
    return {
      ...v,
      pagamentos: pagamentosDe(v),
      valorLiquido: valorLiquido(v),
      valorDevolvido: valorDevolvido(v),
      clienteNome: c ? c.nome : (v.clienteNomeAvulso || 'Consumidor final'),
      clienteDocumento: c ? c.documento || '' : '',
      clienteTelefone: c ? c.telefone || '' : '',
      vendedorNome: u ? u.nome : (v.vendedorNome || (v.vendedorId && v.vendedorId === usuarioLogadoId() ? usuarioLogado().nome : '') || '—'),
      qtdItens,
      credito: credito || null,
      pontosGanhos: pontosGanhosDa(v),
      pontosUsados: pontosUsadosDa(v),
      pontosSaldo: v.clienteId && v.pontos ? Math.max(0, saldoPontosCliente(v.clienteId)) : null,
      pontosValorSaldo: v.clienteId && v.pontos ? arred(Math.max(0, saldoPontosCliente(v.clienteId)) * (v.pontos.valorPonto || 0)) : null,
      cancelamento: v.cancelamento ? { ...v.cancelamento, usuarioNome: cancelador ? cancelador.nome : '—' } : null,
      // Parcelas do crediário desta venda (se houver)
      parcelasCrediario: (db.contasReceber || []).filter((c) => c.vendaId === v.id).map(montarParcela).sort((a, b) => a.parcela - b.parcela),
      descontoAutorizadoPorNome: v.descontoAutorizadoPor ? ((db.usuarios.find((x) => x.id === v.descontoAutorizadoPor) || {}).nome || '—') : null
    };
  }

  /**
   * Histórico de vendas.
   * @param {{busca?, status?, forma?, dataInicio?, dataFim?}} filtros
   */
  function listarVendas(filtros = {}) {
    const busca = normalizar(filtros.busca);
    const lista = db.vendas
      .filter((v) => {
        if (filtros.status && v.status !== filtros.status) return false;
        if (filtros.forma && !pagamentosDe(v).some((p) => p.forma === filtros.forma)) return false;
        if (!noPeriodo(v.data, filtros.dataInicio, filtros.dataFim)) return false;
        return true;
      })
      .map(montarVenda)
      .filter((v) => !busca || normalizar(`${v.numero} ${v.clienteNome} ${v.itens.map((i) => i.nome).join(' ')}`).includes(busca))
      .sort((a, b) => b.data.localeCompare(a.data));
    return responder(lista);
  }

  function obterVenda(id) {
    const v = db.vendas.find((x) => x.id === id);
    return v ? responder(montarVenda(v)) : falhar('Venda não encontrada.');
  }

  /**
   * Registra uma venda do PDV: valida e baixa o estoque, gera movimentações.
   * @param {{clienteId?, itens:[{produtoId, sku, qtd, preco}], desconto,
   *          pagamentos:[{forma, valor, parcelas?, codigoVale?}]}} dados
   *   - Pode dividir o pagamento (ex.: parte Pix, parte cartão).
   *   - Só dinheiro gera troco: o valor em dinheiro pode passar do que falta.
   *   - "vale" usa o saldo de um vale-troca (codigoVale).
   * Exige caixa aberto.
   */
  /** A loja controla caixa (abrir com troco e fechar com conferência)? Configurações → Sistema */
  function usaCaixa() { return !!(db.loja && db.loja.controlarCaixa); }

  function registrarVenda(dados) {
    if (!dados.itens || !dados.itens.length) return falhar('O carrinho está vazio.');
    const caixa = caixaAberto();
    if (!caixa && usaCaixa()) return falhar('O caixa está fechado. Abra o caixa para registrar vendas.');

    // 1) Valida estoque de todos os itens antes de gravar (peças reservadas em pedidos online não contam)
    const pedido = dados.pedidoId ? (db.pedidos || []).find((p) => p.id === dados.pedidoId) : null;
    if (dados.pedidoId && (!pedido || !PEDIDO_ABERTO.includes(pedido.status))) return falhar('Este pedido online não está mais em aberto.');
    const reservas = reservasPorSku(dados.pedidoId || null);
    for (const it of dados.itens) {
      const achado = acharVariacao(it.sku);
      if (!achado) return falhar(`Item ${it.sku} não encontrado.`);
      if (achado.variacao.estoque < it.qtd) return falhar(`Estoque insuficiente para ${achado.produto.nome} (${achado.variacao.tamanho}/${achado.variacao.cor}).`);
      const reservado = reservas[it.sku] || 0;
      if (reservado && achado.variacao.estoque - reservado < it.qtd) return falhar(`${achado.produto.nome} (${achado.variacao.tamanho}/${achado.variacao.cor}): ${reservado} peça(s) estão reservadas em pedido online. Cancele ou conclua o pedido primeiro.`);
    }

    // 2) Monta a venda — preços SEMPRE recalculados aqui (promoções ativas),
    //    nunca confiando no preço que veio da tela.
    const numero = Math.max(1000, ...db.vendas.map((v) => v.numero)) + 1;
    const calc = calcularCarrinhoInterno(dados.itens);
    const itens = calc.itens.map((i) => ({
      produtoId: i.produtoId, sku: i.sku, nome: i.nome, tamanho: i.tamanho, cor: i.cor, qtd: i.qtd,
      preco: i.preco, precoOriginal: i.precoOriginal, custo: i.custo,
      promocao: i.promocao || null
    }));
    const subtotal = calc.subtotal;
    const descontoPromocao = calc.descontoPromocao;      // "leve X pague Y"
    const base = arred(subtotal - descontoPromocao);
    const desconto = Math.min(arred(dados.desconto || 0), base);

    // Limite de desconto manual do vendedor (acima disso, só com autorização do dono)
    let descontoAutorizadoPor = null;
    if (usuarioLogado().perfil !== 'dono' && desconto > 0) {
      const percentual = base ? (desconto / base) * 100 : 0;
      const limite = Number((db.config || {}).limiteDescontoVendedor ?? 10);
      if (percentual > limite + 0.001) {
        const dono = validarAutorizacao(dados.autorizacao);
        if (!dono) return falhar(`Desconto de ${percentual.toFixed(1).replace('.', ',')}% passa do seu limite (${limite}%). Peça a autorização do dono.`);
        descontoAutorizadoPor = dono.id;
      }
    }
    const total = arred(base - desconto);

    // Pagamentos: valida formas, vales, crediário e soma
    const entrada = (dados.pagamentos || []).filter((p) => Number(p.valor) > 0);
    if (!entrada.length) return falhar('Informe a forma de pagamento.');
    const usosVale = [];
    const crediario = entrada.filter((p) => p.forma === 'crediario');
    if (crediario.length) {
      if (crediario.length > 1) return falhar('Use só um lançamento de crediário por venda.');
      const erroCred = validarCrediario(dados.clienteId, arred(crediario[0].valor));
      if (erroCred) return falhar(erroCred);
    }
    for (const p of entrada) {
      if (!FORMAS_VALIDAS.includes(p.forma)) return falhar('Forma de pagamento inválida.');
      if (p.forma === 'vale') {
        const credito = (db.creditos || []).find((c) => c.codigo === String(p.codigoVale || '').toUpperCase().trim());
        if (!credito) return falhar(`Vale-troca ${p.codigoVale || ''} não encontrado.`);
        const jaUsado = usosVale.filter((u) => u.credito === credito).reduce((s, u) => s + u.valor, 0);
        if (arred(p.valor) > arred(credito.saldo - jaUsado)) return falhar(`Saldo insuficiente no vale ${credito.codigo} (disponível: R$ ${(credito.saldo - jaUsado).toFixed(2).replace('.', ',')}).`);
        usosVale.push({ credito, valor: arred(p.valor) });
      }
    }
    const somaPagamentos = arred(entrada.reduce((s, p) => s + Number(p.valor), 0));
    // Pontos de fidelidade usados como pagamento
    const regraP = regraPontos();
    const valorPontos = arred(entrada.filter((p) => p.forma === 'pontos').reduce((s, p) => s + Number(p.valor), 0));
    let pontosUsados = 0;
    if (valorPontos > 0) {
      if (!regraP) return falhar('O programa de pontos está desligado.');
      if (!dados.clienteId) return falhar('Escolha o cliente para usar os pontos.');
      const saldoP = Math.max(0, saldoPontosCliente(dados.clienteId));
      if (saldoP < regraP.minimoResgate) return falhar(`O cliente precisa de pelo menos ${regraP.minimoResgate} pontos para usar (tem ${saldoP}).`);
      if (valorPontos > total + 0.001) return falhar('Os pontos não podem passar do total da venda.');
      pontosUsados = Math.ceil(valorPontos / regraP.valorPonto - 1e-9);
      if (pontosUsados > saldoP) return falhar(`Pontos insuficientes: o cliente tem ${saldoP} pontos (R$ ${(saldoP * regraP.valorPonto).toFixed(2).replace('.', ',')}).`);
    }
    if (somaPagamentos < total) return falhar(`Falta pagar R$ ${(total - somaPagamentos).toFixed(2).replace('.', ',')}.`);
    const troco = arred(somaPagamentos - total);
    const dinheiroRecebido = arred(entrada.filter((p) => p.forma === 'dinheiro').reduce((s, p) => s + Number(p.valor), 0));
    if (troco > dinheiroRecebido) return falhar('Só pagamento em dinheiro pode gerar troco. Ajuste os valores.');

    // Grava o valor que ficou em cada forma (o dinheiro já sem o troco)
    let trocoRestante = troco;
    const pagamentos = entrada.map((p) => {
      let valor = arred(p.valor);
      if (p.forma === 'dinheiro' && trocoRestante > 0) {
        const abate = Math.min(valor, trocoRestante);
        valor = arred(valor - abate);
        trocoRestante = arred(trocoRestante - abate);
      }
      const item = { forma: p.forma, valor, parcelas: p.forma === 'credito' || p.forma === 'crediario' ? Math.max(1, Math.min(12, Number(p.parcelas || 1))) : 1 };
      if (p.forma === 'vale') item.codigoVale = String(p.codigoVale).toUpperCase().trim();
      if (p.forma === 'crediario') item.primeiroVencimento = p.primeiroVencimento || somarDias(hojeStr(), 30);
      return item;
    }).filter((p) => p.valor > 0);

    const venda = {
      id: gerarId('v'),
      numero,
      data: new Date().toISOString(),
      clienteId: dados.clienteId || null,
      clienteNomeAvulso: dados.clienteId ? '' : String(dados.clienteNomeAvulso || '').trim().slice(0, 60), // nome digitado sem cadastro
      vendedorId: usuarioLogadoId(),
      vendedorNome: usuarioLogado().nome || '', // guardado na venda (não depende do cadastro de usuários)
      caixaId: caixa ? caixa.id : null,
      itens,
      subtotal,
      descontoPromocao,
      promocoes: calc.descontosPromocao,
      desconto,
      descontoAutorizadoPor,
      total,
      pagamentos,
      // Fidelidade: regra do dia da venda (os pontos ganhos são recalculados se houver troca)
      pontos: dados.clienteId && regraP ? {
        reaisPorPonto: regraP.reaisPorPonto, valorPonto: regraP.valorPonto, usados: pontosUsados, valorUsado: valorPontos,
        mult: (campanhaPontosHoje(regraP) || {}).multiplicador || 1,
        bonus: regraP.bonusPrimeiraCompra && !db.vendas.some((x) => x.clienteId === dados.clienteId && x.status !== 'cancelada') ? regraP.bonusPrimeiraCompra : 0
      } : null,
      // Resumo (compatível com relatórios antigos): forma principal, recebido e troco
      pagamento: {
        forma: pagamentos.length === 1 ? pagamentos[0].forma : 'multiplo',
        parcelas: (pagamentos.find((p) => p.forma === 'credito' || p.forma === 'crediario') || {}).parcelas || 1,
        recebido: arred(total + troco),
        troco
      },
      status: 'concluida',
      notaId: null
    };

    // Crediário: gera as parcelas a receber (vencimento mensal)
    const pCred = pagamentos.find((p) => p.forma === 'crediario');
    if (pCred) gerarParcelasCrediario(venda, pCred);

    // Pedido online que virou venda
    if (pedido) {
      pedido.status = 'concluido';
      pedido.vendaId = venda.id;
      pedido.numeroVenda = numero;
      pedido.historico = [...(pedido.historico || []), { status: 'concluido', data: venda.data, usuario: usuarioLogado().nome || '' }];
      venda.pedidoOnline = pedido.codigo || pedido.id;
    }

    // Consome o saldo dos vales usados
    usosVale.forEach(({ credito, valor }) => {
      credito.saldo = arred(credito.saldo - valor);
      credito.usos.push({ vendaId: venda.id, numeroVenda: numero, valor, data: venda.data });
    });

    // 3) Baixa estoque e registra saídas
    itens.forEach((it) => {
      acharVariacao(it.sku).variacao.estoque -= it.qtd;
      db.movimentacoes.push({ id: gerarId('m'), data: venda.data, tipo: 'saida', produtoId: it.produtoId, sku: it.sku, quantidade: it.qtd, motivo: `Venda #${numero}`, usuarioId: venda.vendedorId });
    });

    db.vendas.push(venda);
    persistir();
    return responder(montarVenda(venda));
  }

  /**
   * Troca ou devolução: devolve os itens ao estoque e muda o status da venda.
   * @param {string} vendaId
   * @param {{tipo:'troca'|'devolucao', itens:[{sku, qtd}], motivo}} dados
   */
  function registrarDevolucao(vendaId, { tipo, itens, motivo }) {
    const venda = db.vendas.find((v) => v.id === vendaId);
    if (!venda) return falhar('Venda não encontrada.');
    if (venda.status !== 'concluida') return falhar('Esta venda não permite troca/devolução.');
    if (!itens || !itens.length) return falhar('Selecione ao menos um item.');

    // Valor a devolver (com desconto rateado) e parte que sai da gaveta em dinheiro
    const fator = venda.subtotal ? venda.total / venda.subtotal : 1;
    const valorBruto = itens.reduce((s, it) => {
      const item = venda.itens.find((i) => i.sku === it.sku);
      return s + (item ? item.preco * it.qtd : 0);
    }, 0);
    const valorPago = arred(valorBruto * fator);
    // Venda no crediário: primeiro abate o que o cliente ainda deve nas parcelas
    const abatidoCrediario = arred(Math.min(valorPago, saldoCrediarioDaVenda(venda.id)));
    const aDevolver = arred(valorPago - abatidoCrediario);
    const dinheiroDevolvido = tipo === 'devolucao' ? arred(Math.min(aDevolver, dinheiroDa(venda))) : 0;
    const caixa = caixaAberto();
    if (dinheiroDevolvido > 0 && !caixa && usaCaixa()) return falhar('Abra o caixa para devolver o dinheiro ao cliente.');
    if (abatidoCrediario > 0) abaterCrediario(venda.id, abatidoCrediario);

    itens.forEach((it) => {
      const achado = acharVariacao(it.sku);
      if (achado) {
        achado.variacao.estoque += it.qtd;
        db.movimentacoes.push({ id: gerarId('m'), data: new Date().toISOString(), tipo: 'entrada', produtoId: achado.produto.id, sku: it.sku, quantidade: it.qtd, motivo: `${tipo === 'troca' ? 'Troca' : 'Devolução'} — venda #${venda.numero}`, usuarioId: usuarioLogadoId() });
      }
    });

    const agora = new Date().toISOString();
    venda.status = tipo === 'troca' ? 'trocada' : 'devolvida';
    venda.devolucao = { tipo, itens, motivo: motivo || '', valor: valorBruto, data: agora };

    venda.devolucao.abatidoCrediario = abatidoCrediario;
    if (tipo === 'troca' && aDevolver > 0) {
      // Troca gera um vale-troca com o valor pago pelas peças devolvidas
      // (descontado o que foi abatido das parcelas do crediário)
      const credito = {
        id: gerarId('cr'),
        codigo: gerarCodigoVale(),
        clienteId: venda.clienteId || null,
        valor: aDevolver,
        saldo: aDevolver,
        origemVendaId: venda.id,
        criadoEm: agora,
        usos: []
      };
      db.creditos = db.creditos || [];
      db.creditos.push(credito);
      venda.devolucao.creditoId = credito.id;
    } else if (dinheiroDevolvido > 0 && caixa) {
      // Devolução em dinheiro sai da gaveta do caixa aberto
      caixa.movimentos.push({ id: gerarId('mc'), tipo: 'devolucao', valor: dinheiroDevolvido, motivo: `Devolução — venda #${venda.numero}`, data: agora, usuarioId: usuarioLogadoId() });
    }
    venda.devolucao.dinheiroDevolvido = dinheiroDevolvido;

    persistir();
    return responder(montarVenda(venda));
  }

  /**
   * Cancela uma venda lançada errado (só o dono).
   * Devolve as peças ao estoque, devolve o saldo dos vales usados,
   * cancela a NFC-e (simulado) e, se a venda era de um caixa já fechado,
   * registra a saída do dinheiro no caixa aberto.
   */
  function cancelarVenda(vendaId, motivo) {
    const negado = exigirDono('cancelar vendas'); if (negado) return negado;
    const venda = db.vendas.find((v) => v.id === vendaId);
    if (!venda) return falhar('Venda não encontrada.');
    if (venda.status !== 'concluida') return falhar('Só é possível cancelar vendas concluídas (sem troca ou devolução).');
    if (!motivo) return falhar('Informe o motivo do cancelamento.');

    const caixa = caixaAberto();
    const outroCaixa = venda.caixaId !== (caixa && caixa.id);
    const dinheiro = arred(dinheiroDa(venda));
    if (outroCaixa && dinheiro > 0 && !caixa && usaCaixa()) return falhar('Abra o caixa para devolver o dinheiro desta venda.');
    // Crediário: com parcela já paga, o caminho é devolução (não cancelamento)
    const parcelas = (db.contasReceber || []).filter((c) => c.vendaId === venda.id && c.status !== 'cancelada');
    if (parcelas.some((c) => c.valorPago > 0)) return falhar('Esta venda tem parcela do crediário já paga. Use Troca / devolução.');
    parcelas.forEach((c) => { c.status = 'cancelada'; });

    const agora = new Date().toISOString();
    // 1) Peças voltam ao estoque
    venda.itens.forEach((it) => {
      const achado = acharVariacao(it.sku);
      if (!achado) return;
      achado.variacao.estoque += it.qtd;
      db.movimentacoes.push({ id: gerarId('m'), data: agora, tipo: 'entrada', produtoId: achado.produto.id, sku: it.sku, quantidade: it.qtd, motivo: `Cancelamento — venda #${venda.numero}`, usuarioId: usuarioLogadoId() });
    });
    // 2) Vales usados recuperam o saldo
    pagamentosDe(venda).filter((p) => p.forma === 'vale').forEach((p) => {
      const credito = (db.creditos || []).find((c) => c.codigo === p.codigoVale);
      if (credito) {
        credito.saldo = arred(credito.saldo + p.valor);
        credito.usos = credito.usos.filter((u) => u.vendaId !== venda.id);
      }
    });
    // 3) Dinheiro de venda de outro dia/caixa sai do caixa atual
    //    (se for do caixa aberto, a venda cancelada já deixa de contar no caixa)
    if (outroCaixa && dinheiro > 0 && caixa) {
      caixa.movimentos.push({ id: gerarId('mc'), tipo: 'estorno', valor: dinheiro, motivo: `Cancelamento — venda #${venda.numero}`, data: agora, usuarioId: usuarioLogadoId() });
    }
    // 4) NFC-e cancelada junto (na SEFAZ real: até 30 min após a emissão)
    let notaCancelada = false;
    if (venda.notaId) {
      const nota = db.notas.find((n) => n.id === venda.notaId);
      if (nota && nota.status !== 'cancelada') { nota.status = 'cancelada'; notaCancelada = true; }
    }

    venda.status = 'cancelada';
    venda.cancelamento = { motivo, data: agora, usuarioId: usuarioLogadoId(), notaCancelada };
    persistir();
    return responder(montarVenda(venda));
  }

  /* ---------- Datas (AAAA-MM-DD) ---------- */
  function hojeStr() { return diaLocal(new Date().toISOString()); }
  function somarDias(dia, n) {
    const d = new Date(dia + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return diaLocal(d.toISOString());
  }
  function somarMeses(dia, n) {
    const d = new Date(dia + 'T12:00:00');
    const diaDoMes = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(diaDoMes, ultimo));
    return diaLocal(d.toISOString());
  }

  /* ==================================================================
     REGRAS DE VENDA (limite de desconto) E AUTORIZAÇÃO DO DONO
     ================================================================== */

  function obterRegrasVenda() {
    return responder({ limiteDescontoVendedor: 10, ...(db.config || {}) });
  }

  function salvarRegrasVenda(dados) {
    const negado = exigirDono('alterar as regras de venda'); if (negado) return negado;
    const limite = Number(dados.limiteDescontoVendedor);
    if (!Number.isFinite(limite) || limite < 0 || limite > 100) return falhar('O limite deve ficar entre 0% e 100%.');
    db.config = { ...(db.config || {}), limiteDescontoVendedor: limite };
    persistir();
    return obterRegrasVenda();
  }

  // Autorizações válidas por 5 minutos (token → dono)
  const autorizacoes = {};
  /**
   * O dono digita e-mail e senha no PDV para liberar um desconto acima do limite.
   * Protótipo: aceita qualquer senha de um usuário dono ativo.
   * No Firebase: validar a senha numa Cloud Function e devolver um token assinado.
   */
  function autorizarDono(email, senha) {
    const u = db.usuarios.find((x) => normalizar(x.email) === normalizar(email) && x.perfil === 'dono' && x.ativo !== false);
    if (!u || !senha) return falhar('E-mail ou senha do dono inválidos.');
    if (MODO === 'nuvem') {
      // Confere a senha de verdade numa sessão separada (o vendedor continua logado)
      return (async () => {
        const authSec = appSecundario();
        try {
          const cred = await authSec.signInWithEmailAndPassword(String(email).trim(), senha);
          await authSec.signOut();
          if (cred.user.uid !== u.id) throw new Error('E-mail ou senha do dono inválidos.');
        } catch (e) {
          throw new Error(e.code ? 'E-mail ou senha do dono inválidos.' : e.message);
        }
        const token = gerarId('aut');
        autorizacoes[token] = { usuarioId: u.id, expira: Date.now() + 5 * 60 * 1000 };
        return { token, usuarioId: u.id, nome: u.nome };
      })();
    }
    const token = gerarId('aut');
    autorizacoes[token] = { usuarioId: u.id, expira: Date.now() + 5 * 60 * 1000 };
    return responder({ token, usuarioId: u.id, nome: u.nome });
  }
  function validarAutorizacao(aut) {
    const reg = aut && autorizacoes[aut.token];
    if (!reg || reg.expira < Date.now()) return null;
    delete autorizacoes[aut.token]; // uso único
    return db.usuarios.find((u) => u.id === reg.usuarioId) || null;
  }

  /* ==================================================================
     PROMOÇÕES
     ================================================================== */

  /** 'ativa' | 'agendada' | 'encerrada' | 'inativa' */
  function statusPromocao(p, hoje = hojeStr()) {
    if (!p.ativo) return 'inativa';
    if (p.inicio && hoje < p.inicio) return 'agendada';
    if (p.fim && hoje > p.fim) return 'encerrada';
    return 'ativa';
  }
  function promoAplica(p, produto) {
    const e = p.escopo || { tipo: 'todos' };
    if (e.tipo === 'todos') return true;
    if (e.tipo === 'categoria') return produto.categoria === e.valor;
    if (e.tipo === 'colecao') return produto.colecao === e.valor;
    if (e.tipo === 'produtos') return (e.valor || []).includes(produto.id);
    return false;
  }
  const promocoesAtivas = () => (db.promocoes || []).filter((p) => statusPromocao(p) === 'ativa');

  /** Melhor preço unitário do produto agora (promoção % ou preço fixo) */
  function precoComPromocao(produto, ativas = promocoesAtivas()) {
    let preco = produto.preco, promocao = null;
    ativas.filter((p) => p.tipo !== 'leve-pague' && promoAplica(p, produto)).forEach((p) => {
      const novo = p.tipo === 'percentual' ? arred(produto.preco * (1 - Number(p.valor) / 100)) : arred(p.valor);
      if (novo < preco) { preco = novo; promocao = { id: p.id, nome: p.nome }; }
    });
    return { preco, promocao };
  }

  /**
   * Preços do carrinho com as promoções ativas.
   * - % e preço fixo: vale o menor preço unitário
   * - "Leve X pague Y": nas peças sem outra promoção; a cada X peças, as (X−Y) mais baratas saem de graça
   */
  function calcularCarrinhoInterno(entrada) {
    const ativas = promocoesAtivas();
    const itens = (entrada || []).map((it) => {
      const achado = acharVariacao(it.sku);
      if (!achado) return null;
      const { produto, variacao } = achado;
      const { preco, promocao } = precoComPromocao(produto, ativas);
      return {
        produtoId: produto.id, sku: variacao.sku, nome: produto.nome, tamanho: variacao.tamanho, cor: variacao.cor,
        categoria: produto.categoria, qtd: Number(it.qtd) || 0, precoOriginal: produto.preco, preco, custo: produto.custo, promocao
      };
    }).filter(Boolean);

    const descontosPromocao = [];
    const usados = new Set(); // cada item entra em no máximo um "leve X pague Y"
    ativas.filter((p) => p.tipo === 'leve-pague').forEach((p) => {
      const leve = Number(p.leve), pague = Number(p.pague);
      if (!(leve >= 2 && pague >= 1 && pague < leve)) return;
      const elegiveis = itens.filter((i) => !i.promocao && !usados.has(i.sku) && promoAplica(p, db.produtos.find((x) => x.id === i.produtoId)));
      const unidades = [];
      elegiveis.forEach((i) => { for (let k = 0; k < i.qtd; k++) unidades.push(i); });
      if (unidades.length < leve) return;
      unidades.sort((a, b) => b.preco - a.preco);
      let valor = 0;
      for (let g = 0; g + leve <= unidades.length; g += leve) {
        unidades.slice(g + pague, g + leve).forEach((i) => {
          valor += i.preco;
          i.gratis = (i.gratis || 0) + 1;
          i.promocaoLeve = { id: p.id, nome: p.nome };
        });
      }
      elegiveis.forEach((i) => usados.add(i.sku));
      if (valor > 0) descontosPromocao.push({ id: p.id, nome: p.nome, valor: arred(valor) });
    });

    const subtotal = arred(itens.reduce((s, i) => s + i.preco * i.qtd, 0));
    const descontoPromocao = arred(descontosPromocao.reduce((s, d) => s + d.valor, 0));
    return { itens, descontosPromocao, subtotal, descontoPromocao, total: arred(subtotal - descontoPromocao) };
  }

  /** Para o PDV mostrar preços e promoções do carrinho (a venda recalcula ao gravar) */
  function calcularCarrinho(itens) {
    return responder(calcularCarrinhoInterno(itens));
  }

  function montarPromocao(p) {
    return { ...p, status: statusPromocao(p) };
  }
  function listarPromocoes() {
    const ordem = { ativa: 0, agendada: 1, inativa: 2, encerrada: 3 };
    return responder((db.promocoes || []).map(montarPromocao).sort((a, b) => ordem[a.status] - ordem[b.status] || (b.inicio || '').localeCompare(a.inicio || '')));
  }
  function salvarPromocao(dados) {
    const negado = exigirDono('gerenciar promoções'); if (negado) return negado;
    if (!dados.nome) return falhar('Dê um nome à promoção.');
    if (!['percentual', 'preco', 'leve-pague'].includes(dados.tipo)) return falhar('Tipo de promoção inválido.');
    if (dados.tipo === 'percentual' && !(dados.valor > 0 && dados.valor < 100)) return falhar('O desconto deve ficar entre 1% e 99%.');
    if (dados.tipo === 'preco' && !(dados.valor > 0)) return falhar('Informe o preço promocional.');
    if (dados.tipo === 'leve-pague' && !(dados.leve >= 2 && dados.pague >= 1 && dados.pague < dados.leve)) return falhar('No "leve X pague Y", o Y precisa ser menor que o X.');
    if (dados.inicio && dados.fim && dados.fim < dados.inicio) return falhar('A data final é antes da inicial.');
    const e = dados.escopo || {};
    if (e.tipo !== 'todos' && (!e.valor || (Array.isArray(e.valor) && !e.valor.length))) return falhar('Escolha onde a promoção vale (categoria, coleção ou produtos).');
    db.promocoes = db.promocoes || [];
    let registro;
    if (dados.id) {
      const i = db.promocoes.findIndex((p) => p.id === dados.id);
      if (i < 0) return falhar('Promoção não encontrada.');
      db.promocoes[i] = registro = { ...db.promocoes[i], ...dados };
    } else {
      registro = { ...dados, id: gerarId('pr'), ativo: dados.ativo !== false, criadoEm: new Date().toISOString() };
      db.promocoes.push(registro);
    }
    persistir();
    return responder(montarPromocao(registro));
  }
  function excluirPromocao(id) {
    const negado = exigirDono('gerenciar promoções'); if (negado) return negado;
    db.promocoes = (db.promocoes || []).filter((p) => p.id !== id);
    persistir();
    return responder(true);
  }

  /* ==================================================================
     CREDIÁRIO (contas a receber dos clientes)
     ================================================================== */

  /** 'aberto' | 'vencido' | 'pago' | 'cancelada' */
  function statusParcela(c) {
    if (c.status === 'cancelada') return 'cancelada';
    if (c.valorPago >= c.valor - 0.004) return 'pago';
    return c.vencimento < hojeStr() ? 'vencido' : 'aberto';
  }
  const parcelasAtivas = () => (db.contasReceber || []).filter((c) => c.status !== 'cancelada');
  const saldoParcela = (c) => arred(c.valor - c.valorPago);

  function resumoCrediario(clienteId) {
    const cli = db.clientes.find((c) => c.id === clienteId);
    const abertas = parcelasAtivas().filter((c) => c.clienteId === clienteId && statusParcela(c) !== 'pago');
    const emAberto = arred(abertas.reduce((s, c) => s + saldoParcela(c), 0));
    const vencido = arred(abertas.filter((c) => statusParcela(c) === 'vencido').reduce((s, c) => s + saldoParcela(c), 0));
    const limite = Number((cli && cli.limiteCredito) || 0);
    return { clienteId, limite, emAberto, vencido, disponivel: Math.max(0, arred(limite - emAberto)), parcelasAbertas: abertas.length };
  }
  function resumoCrediarioCliente(clienteId) { return responder(resumoCrediario(clienteId)); }

  /** Regras para vender no crediário. Retorna mensagem de erro ou null. */
  function validarCrediario(clienteId, valor) {
    if (!clienteId) return 'Para vender no crediário, escolha o cliente.';
    const r = resumoCrediario(clienteId);
    if (r.limite <= 0) return 'Este cliente não tem limite de crédito. Defina o limite no cadastro do cliente.';
    if (r.vencido > 0) return `O cliente tem R$ ${r.vencido.toFixed(2).replace('.', ',')} em parcelas vencidas. Receba antes de vender no crediário.`;
    if (valor > r.disponivel + 0.004) return `Limite de crédito insuficiente: disponível R$ ${r.disponivel.toFixed(2).replace('.', ',')}.`;
    return null;
  }

  function gerarParcelasCrediario(venda, p) {
    db.contasReceber = db.contasReceber || [];
    const n = p.parcelas;
    const base = Math.floor((p.valor / n) * 100) / 100;
    for (let i = 0; i < n; i++) {
      db.contasReceber.push({
        id: gerarId('crd'), vendaId: venda.id, clienteId: venda.clienteId, parcela: i + 1, totalParcelas: n,
        valor: i === n - 1 ? arred(p.valor - base * (n - 1)) : base,
        vencimento: somarMeses(p.primeiroVencimento, i), valorPago: 0, pagamentos: [], status: 'aberto'
      });
    }
  }
  function saldoCrediarioDaVenda(vendaId) {
    return arred(parcelasAtivas().filter((c) => c.vendaId === vendaId).reduce((s, c) => s + Math.max(0, saldoParcela(c)), 0));
  }
  /** Abate um valor das parcelas em aberto da venda (da última para a primeira) */
  function abaterCrediario(vendaId, valor) {
    let resta = valor;
    parcelasAtivas().filter((c) => c.vendaId === vendaId && saldoParcela(c) > 0)
      .sort((a, b) => b.parcela - a.parcela)
      .forEach((c) => {
        if (resta <= 0) return;
        const abate = Math.min(resta, saldoParcela(c));
        c.valor = arred(c.valor - abate);
        resta = arred(resta - abate);
        if (c.valor <= 0.004) c.status = 'cancelada';
      });
  }

  function montarParcela(c) {
    const cli = db.clientes.find((x) => x.id === c.clienteId);
    const venda = db.vendas.find((v) => v.id === c.vendaId);
    return { ...c, status: statusParcela(c), saldo: Math.max(0, saldoParcela(c)), clienteNome: cli ? cli.nome : '—', clienteTelefone: cli ? cli.telefone : '', numeroVenda: venda ? venda.numero : null };
  }

  /** @param {{status?, clienteId?, dataInicio?, dataFim?, busca?}} filtros  (período pelo vencimento) */
  function listarContasReceber(filtros = {}) {
    const b = normalizar(filtros.busca);
    const lista = (db.contasReceber || []).map(montarParcela)
      .filter((c) => c.status !== 'cancelada' || filtros.status === 'cancelada')
      .filter((c) => !filtros.status || c.status === filtros.status)
      .filter((c) => !filtros.clienteId || c.clienteId === filtros.clienteId)
      .filter((c) => (!filtros.dataInicio || c.vencimento >= filtros.dataInicio) && (!filtros.dataFim || c.vencimento <= filtros.dataFim))
      .filter((c) => !b || normalizar(`${c.clienteNome} ${c.numeroVenda}`).includes(b))
      .sort((a, b2) => a.vencimento.localeCompare(b2.vencimento));
    return responder(lista);
  }

  /**
   * Recebe (toda ou parte de) uma parcela. Dinheiro exige caixa aberto e entra na gaveta;
   * Pix/cartão entram no caixa aberto (se houver) para a conferência.
   */
  function receberParcela(id, { valor, forma }) {
    const c = (db.contasReceber || []).find((x) => x.id === id);
    if (!c || c.status === 'cancelada') return falhar('Parcela não encontrada.');
    const saldo = saldoParcela(c);
    const v = arred(valor);
    if (saldo <= 0) return falhar('Esta parcela já está paga.');
    if (!(v > 0) || v > saldo + 0.004) return falhar(`Informe um valor entre R$ 0,01 e R$ ${saldo.toFixed(2).replace('.', ',')}.`);
    if (!['dinheiro', 'pix', 'debito', 'credito'].includes(forma)) return falhar('Escolha a forma de recebimento.');
    const caixa = caixaAberto();
    if (forma === 'dinheiro' && !caixa && usaCaixa()) return falhar('Abra o caixa para receber em dinheiro.');
    const agora = new Date().toISOString();
    c.valorPago = arred(c.valorPago + v);
    c.pagamentos.push({ data: agora, valor: v, forma, usuarioId: usuarioLogadoId() });
    if (c.valorPago >= c.valor - 0.004) c.status = 'pago';
    const cli = db.clientes.find((x) => x.id === c.clienteId);
    if (caixa) caixa.movimentos.push({ id: gerarId('mc'), tipo: 'recebimento', forma, valor: v, motivo: `Crediário ${cli ? cli.nome : ''} — parcela ${c.parcela}/${c.totalParcelas}`, data: agora, usuarioId: usuarioLogadoId() });
    persistir();
    return responder(montarParcela(c));
  }

  /* ==================================================================
     CONTAS A PAGAR
     ================================================================== */

  function statusConta(c) {
    if (c.status === 'pago') return 'pago';
    return c.vencimento < hojeStr() ? 'vencido' : 'aberto';
  }
  function montarConta(c) {
    const f = c.fornecedorId ? db.fornecedores.find((x) => x.id === c.fornecedorId) : null;
    return { ...c, status: statusConta(c), fornecedorNome: f ? f.nome : '' };
  }
  /** @param {{status?, dataInicio?, dataFim?, busca?}} filtros (período pelo vencimento) */
  function listarContasPagar(filtros = {}) {
    const b = normalizar(filtros.busca);
    const lista = (db.contasPagar || []).map(montarConta)
      .filter((c) => !filtros.status || c.status === filtros.status)
      .filter((c) => (!filtros.dataInicio || c.vencimento >= filtros.dataInicio) && (!filtros.dataFim || c.vencimento <= filtros.dataFim))
      .filter((c) => !b || normalizar(`${c.descricao} ${c.fornecedorNome} ${c.documento} ${c.categoria}`).includes(b))
      .sort((a, b2) => a.vencimento.localeCompare(b2.vencimento));
    return responder(lista);
  }
  /**
   * Cria ou edita uma conta a pagar. Ao criar, `parcelas` > 1 gera várias
   * contas mensais a partir do vencimento informado.
   */
  function salvarContaPagar(dados) {
    const negado = exigirDono('lançar contas a pagar'); if (negado) return negado;
    if (!dados.descricao) return falhar('Informe a descrição.');
    if (!(Number(dados.valor) > 0)) return falhar('Informe o valor.');
    if (!dados.vencimento) return falhar('Informe o vencimento.');
    db.contasPagar = db.contasPagar || [];
    if (dados.id) {
      const i = db.contasPagar.findIndex((c) => c.id === dados.id);
      if (i < 0) return falhar('Conta não encontrada.');
      db.contasPagar[i] = { ...db.contasPagar[i], ...dados, valor: arred(dados.valor) };
      persistir();
      return responder(montarConta(db.contasPagar[i]));
    }
    const n = Math.max(1, Math.min(24, Number(dados.parcelas) || 1));
    const base = Math.floor((Number(dados.valor) / n) * 100) / 100;
    const criadas = [];
    for (let i = 0; i < n; i++) {
      const conta = {
        id: gerarId('cp'), descricao: n > 1 ? `${dados.descricao} — parcela ${i + 1}/${n}` : dados.descricao,
        fornecedorId: dados.fornecedorId || null, categoria: dados.categoria || 'Outros', documento: dados.documento || '',
        valor: i === n - 1 ? arred(Number(dados.valor) - base * (n - 1)) : base,
        vencimento: somarMeses(dados.vencimento, i), status: 'aberto', dataPagamento: null, formaPagamento: null,
        entradaId: dados.entradaId || null
      };
      db.contasPagar.push(conta);
      criadas.push(montarConta(conta));
    }
    persistir();
    return responder(criadas.length === 1 ? criadas[0] : criadas);
  }
  /** Dá baixa numa conta. forma 'caixa' = pago com dinheiro da gaveta (sai do caixa aberto). */
  function pagarConta(id, { forma, data }) {
    const negado = exigirDono('pagar contas'); if (negado) return negado;
    const c = (db.contasPagar || []).find((x) => x.id === id);
    if (!c) return falhar('Conta não encontrada.');
    if (c.status === 'pago') return falhar('Esta conta já está paga.');
    if (!forma) return falhar('Escolha como foi pago.');
    if (forma === 'caixa') {
      const caixa = caixaAberto();
      if (!caixa) return falhar('Para pagar com dinheiro do caixa, abra o caixa.');
      if (c.valor > resumoDoCaixa(caixa).esperado.dinheiro + 0.004) return falhar('Não há dinheiro suficiente na gaveta.');
      caixa.movimentos.push({ id: gerarId('mc'), tipo: 'pagamento', valor: c.valor, motivo: `Pagamento: ${c.descricao}`, data: new Date().toISOString(), usuarioId: usuarioLogadoId() });
    }
    c.status = 'pago';
    c.dataPagamento = data || hojeStr();
    c.formaPagamento = forma;
    persistir();
    return responder(montarConta(c));
  }
  function excluirContaPagar(id) {
    const negado = exigirDono('excluir contas'); if (negado) return negado;
    db.contasPagar = (db.contasPagar || []).filter((c) => c.id !== id);
    persistir();
    return responder(true);
  }

  /** Números do financeiro (para os cartões da tela) */
  function resumoFinanceiro() {
    const hoje = hojeStr(), em7 = somarDias(hoje, 7);
    const receber = (db.contasReceber || []).map(montarParcela).filter((c) => c.status === 'aberto' || c.status === 'vencido');
    const pagar = (db.contasPagar || []).map(montarConta).filter((c) => c.status !== 'pago');
    const soma = (l, campo = 'saldo') => arred(l.reduce((s, c) => s + (campo === 'saldo' ? c.saldo : c.valor), 0));
    return responder({
      receberAberto: soma(receber), receberVencido: soma(receber.filter((c) => c.status === 'vencido')),
      pagarAberto: soma(pagar, 'valor'), pagarVencido: soma(pagar.filter((c) => c.status === 'vencido'), 'valor'),
      pagar7dias: soma(pagar.filter((c) => c.vencimento >= hoje && c.vencimento <= em7), 'valor')
    });
  }

  /* ==================================================================
     INVENTÁRIO (contagem completa com leitor de código de barras)
     ================================================================== */

  const inventarioAberto = () => (db.inventarios || []).find((i) => i.status === 'aberto') || null;
  const noEscopo = (inv, produto) => !inv.escopo.categoria || produto.categoria === inv.escopo.categoria;

  function montarInventario(inv) {
    const itens = [];
    db.produtos.filter((p) => noEscopo(inv, p)).forEach((p) => p.variacoes.forEach((v) => {
      const contado = inv.contagens[v.sku];
      itens.push({
        produtoId: p.id, produtoNome: p.nome, categoria: p.categoria, custo: p.custo, sku: v.sku, codigoBarras: v.codigoBarras,
        tamanho: v.tamanho, cor: v.cor, sistema: v.estoque,
        contado: contado === undefined ? null : contado,
        diferenca: contado === undefined ? null : contado - v.estoque
      });
    }));
    const contados = itens.filter((i) => i.contado !== null);
    const nome = (id) => (db.usuarios.find((u) => u.id === id) || {}).nome || '—';
    return {
      ...inv, itens,
      iniciadoPorNome: nome(inv.iniciadoPor), finalizadoPorNome: inv.finalizadoPor ? nome(inv.finalizadoPor) : null,
      totais: {
        variacoes: itens.length, contadas: contados.length,
        pecasContadas: contados.reduce((s, i) => s + i.contado, 0),
        divergencias: contados.filter((i) => i.diferenca !== 0).length
      }
    };
  }

  function obterInventarioAberto() {
    const inv = inventarioAberto();
    return responder(inv ? montarInventario(inv) : null);
  }
  function listarInventarios() {
    return responder((db.inventarios || []).filter((i) => i.status === 'finalizado').map((i) => {
      const m = montarInventario(i);
      delete m.itens;
      return m;
    }).sort((a, b) => b.iniciadoEm.localeCompare(a.iniciadoEm)));
  }

  /** @param {{categoria?}} escopo  vazio = loja inteira */
  function iniciarInventario({ categoria } = {}) {
    const negado = exigirDono('fazer inventário'); if (negado) return negado;
    if (inventarioAberto()) return falhar('Já existe um inventário em andamento. Continue ou cancele o atual.');
    db.inventarios = db.inventarios || [];
    const inv = { id: gerarId('inv'), numero: db.inventarios.length + 1, status: 'aberto', escopo: { categoria: categoria || null }, contagens: {}, iniciadoEm: new Date().toISOString(), iniciadoPor: usuarioLogadoId(), ultimaLeitura: null };
    db.inventarios.push(inv);
    persistir();
    return responder(montarInventario(inv));
  }

  /**
   * Conta uma peça. Leitura do código de barras soma 1; digitar define o total.
   * @param {{codigo, quantidade?, modo:'somar'|'definir'}} dados
   */
  function registrarContagem({ codigo, quantidade = 1, modo = 'somar' }) {
    const negado = exigirDono('fazer inventário'); if (negado) return negado;
    const inv = inventarioAberto();
    if (!inv) return falhar('Nenhum inventário em andamento.');
    const c = normalizar(codigo).trim();
    let achado = null;
    for (const p of db.produtos) {
      const v = p.variacoes.find((x) => x.codigoBarras === c || normalizar(x.sku) === c);
      if (v) { achado = { produto: p, variacao: v }; break; }
    }
    if (!achado) return falhar(`Código ${codigo} não encontrado no catálogo.`);
    if (!noEscopo(inv, achado.produto)) return falhar(`${achado.produto.nome} é de ${achado.produto.categoria}, fora deste inventário.`);
    const sku = achado.variacao.sku;
    const q = Math.max(0, Math.round(Number(quantidade) || 0));
    inv.contagens[sku] = modo === 'definir' ? q : (inv.contagens[sku] || 0) + q;
    inv.ultimaLeitura = { sku, data: new Date().toISOString() };
    persistir();
    const m = montarInventario(inv);
    return responder({ inventario: m, item: m.itens.find((i) => i.sku === sku) });
  }

  function cancelarInventario() {
    const negado = exigirDono('fazer inventário'); if (negado) return negado;
    const inv = inventarioAberto();
    if (!inv) return falhar('Nenhum inventário em andamento.');
    db.inventarios = db.inventarios.filter((i) => i.id !== inv.id);
    persistir();
    return responder(true);
  }

  /**
   * Finaliza: ajusta o estoque de cada variação contada para o valor contado.
   * zerarNaoContados = variações do escopo que não foram contadas ficam com 0.
   */
  function finalizarInventario({ zerarNaoContados = false } = {}) {
    const negado = exigirDono('fazer inventário'); if (negado) return negado;
    const inv = inventarioAberto();
    if (!inv) return falhar('Nenhum inventário em andamento.');
    const agora = new Date().toISOString();
    let sobras = 0, faltas = 0, valorDiferenca = 0, ajustadas = 0;
    db.produtos.filter((p) => noEscopo(inv, p)).forEach((p) => p.variacoes.forEach((v) => {
      let contado = inv.contagens[v.sku];
      if (contado === undefined) {
        if (!zerarNaoContados) return;
        contado = 0;
      }
      const dif = contado - v.estoque;
      if (dif === 0) return;
      if (dif > 0) sobras += dif; else faltas += -dif;
      valorDiferenca += dif * (p.custo || 0);
      ajustadas++;
      v.estoque = contado;
      db.movimentacoes.push({ id: gerarId('m'), data: agora, tipo: 'ajuste', produtoId: p.id, sku: v.sku, quantidade: dif, motivo: `Inventário nº ${inv.numero}`, usuarioId: usuarioLogadoId() });
    }));
    inv.status = 'finalizado';
    inv.finalizadoEm = agora;
    inv.finalizadoPor = usuarioLogadoId();
    inv.zerouNaoContados = !!zerarNaoContados;
    inv.resultado = { sobras, faltas, ajustadas, valorDiferenca: arred(valorDiferenca) };
    persistir();
    const m = montarInventario(inv);
    delete m.itens;
    return responder(m);
  }

  /* ==================================================================
     VALE-TROCA (créditos do cliente)
     ================================================================== */

  function gerarCodigoVale() {
    const letras = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I para não confundir
    let codigo;
    do {
      codigo = 'VT-' + Array.from({ length: 6 }, () => letras[Math.floor(Math.random() * letras.length)]).join('');
    } while ((db.creditos || []).some((c) => c.codigo === codigo));
    return codigo;
  }

  function montarCredito(c) {
    const cli = db.clientes.find((x) => x.id === c.clienteId);
    const origem = db.vendas.find((v) => v.id === c.origemVendaId);
    return { ...c, clienteNome: cli ? cli.nome : 'Sem cliente', numeroVendaOrigem: origem ? origem.numero : null };
  }

  /** Vales-troca. @param {{clienteId?, comSaldo?}} filtros */
  function listarCreditos(filtros = {}) {
    const lista = (db.creditos || [])
      .filter((c) => (!filtros.clienteId || c.clienteId === filtros.clienteId) && (!filtros.comSaldo || c.saldo > 0))
      .map(montarCredito)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    return responder(lista);
  }

  /** Busca um vale pelo código impresso (ex.: VT-7Q4K2M). */
  function obterCreditoPorCodigo(codigo) {
    const c = (db.creditos || []).find((x) => x.codigo === String(codigo || '').toUpperCase().trim());
    return c ? responder(montarCredito(c)) : falhar('Vale-troca não encontrado. Confira o código.');
  }

  /* ==================================================================
     CAIXA (abertura, sangria/reforço, fechamento)
     ================================================================== */

  const caixaAberto = () => (db.caixas || []).find((c) => c.status === 'aberto') || null;

  /** Calcula o que o caixa deveria ter, por forma de pagamento */
  function resumoDoCaixa(cx) {
    const vendas = db.vendas.filter((v) => v.caixaId === cx.id && v.status !== 'cancelada');
    const porForma = { dinheiro: 0, pix: 0, debito: 0, credito: 0, vale: 0, crediario: 0 };
    vendas.forEach((v) => pagamentosDe(v).forEach((p) => { porForma[p.forma] = arred((porForma[p.forma] || 0) + p.valor); }));
    const soma = (tipo) => arred(cx.movimentos.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.valor, 0));
    const suprimentos = soma('suprimento');
    const sangrias = soma('sangria');
    const devolucoes = arred(soma('devolucao') + soma('estorno'));
    const pagamentosContas = soma('pagamento'); // contas pagas com dinheiro da gaveta
    // Parcelas de crediário recebidas neste caixa, por forma
    const recebimentos = { dinheiro: 0, pix: 0, debito: 0, credito: 0 };
    cx.movimentos.filter((m) => m.tipo === 'recebimento').forEach((m) => { recebimentos[m.forma] = arred((recebimentos[m.forma] || 0) + m.valor); });
    const totalRecebimentos = arred(Object.values(recebimentos).reduce((s, v) => s + v, 0));
    const esperado = {
      dinheiro: arred(cx.valorInicial + porForma.dinheiro + recebimentos.dinheiro + suprimentos - sangrias - devolucoes - pagamentosContas),
      pix: arred(porForma.pix + recebimentos.pix),
      debito: arred(porForma.debito + recebimentos.debito),
      credito: arred(porForma.credito + recebimentos.credito)
    };
    const nome = (id) => (db.usuarios.find((u) => u.id === id) || {}).nome || '—';
    const diferenca = cx.fechamento
      ? arred(['dinheiro', 'pix', 'debito', 'credito'].reduce((s, f) => s + (Number(cx.fechamento.contado[f]) || 0) - (cx.fechamento.esperado[f] || 0), 0))
      : null;
    return {
      ...cx,
      abertoPorNome: nome(cx.abertoPor),
      fechadoPorNome: cx.fechadoPor ? nome(cx.fechadoPor) : null,
      movimentos: cx.movimentos.map((m) => ({ ...m, usuarioNome: nome(m.usuarioId) })),
      qtdVendas: vendas.length,
      totalVendido: arred(vendas.reduce((s, v) => s + v.total, 0)),
      porForma, suprimentos, sangrias, devolucoes, pagamentosContas, recebimentos, totalRecebimentos,
      esperado: cx.fechamento ? cx.fechamento.esperado : esperado,
      diferenca
    };
  }

  /** Caixa aberto agora (com totais) ou null */
  function obterCaixaAberto() {
    const cx = caixaAberto();
    return responder(cx ? resumoDoCaixa(cx) : null);
  }

  function obterCaixa(id) {
    const cx = (db.caixas || []).find((c) => c.id === id);
    return cx ? responder(resumoDoCaixa(cx)) : falhar('Caixa não encontrado.');
  }

  /** Histórico de caixas (mais recente primeiro) */
  function listarCaixas() {
    return responder((db.caixas || []).map(resumoDoCaixa).sort((a, b) => b.abertoEm.localeCompare(a.abertoEm)));
  }

  /** Abre o caixa com o troco inicial na gaveta */
  function abrirCaixa({ valorInicial }) {
    if (caixaAberto()) return falhar('Já existe um caixa aberto.');
    const valor = arred(valorInicial);
    if (valor < 0) return falhar('Valor inicial inválido.');
    const cx = { id: gerarId('cx'), status: 'aberto', abertoEm: new Date().toISOString(), abertoPor: usuarioLogadoId(), valorInicial: valor, movimentos: [], fechadoEm: null, fechadoPor: null, fechamento: null };
    db.caixas = db.caixas || [];
    db.caixas.push(cx);
    persistir();
    return responder(resumoDoCaixa(cx));
  }

  /**
   * Sangria (retirada de dinheiro da gaveta) ou suprimento/reforço (entrada de troco).
   * @param {{tipo:'sangria'|'suprimento', valor, motivo}} dados
   */
  function registrarMovimentoCaixa({ tipo, valor, motivo }) {
    const cx = caixaAberto();
    if (!cx) return falhar('Não há caixa aberto.');
    if (!['sangria', 'suprimento'].includes(tipo)) return falhar('Movimento inválido.');
    const v = arred(valor);
    if (v <= 0) return falhar('Informe um valor maior que zero.');
    if (tipo === 'sangria' && v > resumoDoCaixa(cx).esperado.dinheiro) return falhar('A sangria é maior que o dinheiro que deveria estar na gaveta.');
    cx.movimentos.push({ id: gerarId('mc'), tipo, valor: v, motivo: motivo || '', data: new Date().toISOString(), usuarioId: usuarioLogadoId() });
    persistir();
    return responder(resumoDoCaixa(cx));
  }

  /**
   * Fecha o caixa com os valores conferidos.
   * @param {{contado:{dinheiro, pix, debito, credito}, observacao}} dados
   */
  function fecharCaixa({ contado, observacao }) {
    const cx = caixaAberto();
    if (!cx) return falhar('Não há caixa aberto.');
    const resumo = resumoDoCaixa(cx);
    const c = {};
    ['dinheiro', 'pix', 'debito', 'credito'].forEach((f) => { c[f] = arred(contado && contado[f] !== undefined && contado[f] !== '' ? contado[f] : resumo.esperado[f]); });
    cx.fechamento = { esperado: resumo.esperado, contado: c, observacao: observacao || '' };
    cx.status = 'fechado';
    cx.fechadoEm = new Date().toISOString();
    cx.fechadoPor = usuarioLogadoId();
    persistir();
    return responder(resumoDoCaixa(cx));
  }

  /* ==================================================================
     ENTRADA DE MERCADORIA EM LOTE (nota do fornecedor)
     ================================================================== */

  /**
   * Lança uma nota de fornecedor com várias peças de uma vez.
   * @param {{fornecedorId, numeroNota, dataEmissao, observacao,
   *          itens:[{produtoId, custoUnitario, atualizarCusto, variacoes:[{sku, qtd}]}]}} dados
   */
  function registrarEntradaLote(dados) {
    const negado = exigirDono('lançar entradas de mercadoria'); if (negado) return negado;
    if (!dados.numeroNota) return falhar('Informe o número da nota.');
    const fornecedor = db.fornecedores.find((f) => f.id === dados.fornecedorId);
    if (!fornecedor) return falhar('Escolha o fornecedor.');
    const repetida = (db.entradas || []).find((e) => e.fornecedorId === fornecedor.id && String(e.numeroNota) === String(dados.numeroNota));
    if (repetida) return falhar(`A nota ${dados.numeroNota} deste fornecedor já foi lançada em ${new Date(repetida.data).toLocaleDateString('pt-BR')}.`);

    // Valida tudo antes de alterar o estoque
    const itens = [];
    for (const it of dados.itens || []) {
      const produto = db.produtos.find((p) => p.id === it.produtoId);
      if (!produto) return falhar('Produto não encontrado.');
      const variacoes = (it.variacoes || []).filter((v) => Number(v.qtd) > 0);
      for (const v of variacoes) {
        if (!produto.variacoes.some((x) => x.sku === v.sku)) return falhar(`Variação ${v.sku} não existe em ${produto.nome}.`);
        if (!Number.isInteger(Number(v.qtd))) return falhar('As quantidades devem ser números inteiros.');
      }
      if (variacoes.length) itens.push({ produto, variacoes, custoUnitario: arred(it.custoUnitario), atualizarCusto: !!it.atualizarCusto });
    }
    if (!itens.length) return falhar('Informe a quantidade de pelo menos uma peça.');

    const agora = new Date().toISOString();
    const motivo = `NF ${dados.numeroNota} — ${fornecedor.nome}`;
    let totalPecas = 0, totalValor = 0;
    const resumoItens = itens.map(({ produto, variacoes, custoUnitario, atualizarCusto }) => {
      let pecas = 0;
      variacoes.forEach((v) => {
        const variacao = produto.variacoes.find((x) => x.sku === v.sku);
        const qtd = Number(v.qtd);
        variacao.estoque += qtd;
        pecas += qtd;
        db.movimentacoes.push({ id: gerarId('m'), data: agora, tipo: 'entrada', produtoId: produto.id, sku: v.sku, quantidade: qtd, motivo, usuarioId: usuarioLogadoId() });
      });
      if (atualizarCusto && custoUnitario > 0) produto.custo = custoUnitario;
      totalPecas += pecas;
      totalValor += pecas * (custoUnitario || produto.custo);
      return { produtoId: produto.id, nome: produto.nome, pecas, custoUnitario: custoUnitario || produto.custo, variacoes: variacoes.map((v) => ({ sku: v.sku, qtd: Number(v.qtd) })) };
    });

    const entrada = {
      id: gerarId('en'), data: agora, fornecedorId: fornecedor.id, numeroNota: String(dados.numeroNota),
      dataEmissao: dados.dataEmissao || '', observacao: dados.observacao || '',
      itens: resumoItens, totalPecas, totalValor: arred(totalValor), usuarioId: usuarioLogadoId()
    };
    db.entradas = db.entradas || [];
    db.entradas.push(entrada);
    // Opcional: já lança a nota no contas a pagar (boleto à vista ou parcelado)
    if (dados.contaPagar && dados.contaPagar.vencimento) {
      const n = Math.max(1, Math.min(12, Number(dados.contaPagar.parcelas) || 1));
      const base = Math.floor((entrada.totalValor / n) * 100) / 100;
      db.contasPagar = db.contasPagar || [];
      for (let i = 0; i < n; i++) {
        db.contasPagar.push({
          id: gerarId('cp'), descricao: `NF ${entrada.numeroNota}${n > 1 ? ` — parcela ${i + 1}/${n}` : ''}`,
          fornecedorId: fornecedor.id, categoria: 'Fornecedores', documento: `${entrada.numeroNota}${n > 1 ? '-' + (i + 1) : ''}`,
          valor: i === n - 1 ? arred(entrada.totalValor - base * (n - 1)) : base,
          vencimento: somarMeses(dados.contaPagar.vencimento, i), status: 'aberto', dataPagamento: null, formaPagamento: null, entradaId: entrada.id
        });
      }
      entrada.contasGeradas = n;
    }
    persistir();
    return responder({ ...entrada, fornecedorNome: fornecedor.nome });
  }

  /** Histórico de notas de fornecedor lançadas */
  function listarEntradas() {
    const lista = (db.entradas || []).map((e) => ({
      ...e,
      fornecedorNome: (db.fornecedores.find((f) => f.id === e.fornecedorId) || {}).nome || '—',
      usuarioNome: (db.usuarios.find((u) => u.id === e.usuarioId) || {}).nome || '—'
    })).sort((a, b) => b.data.localeCompare(a.data));
    return responder(lista);
  }

  /* ==================================================================
     NOTAS FISCAIS (NFC-e simulada)
     ================================================================== */

  function montarNota(n) {
    const c = db.clientes.find((x) => x.id === n.clienteId);
    const venda = db.vendas.find((v) => v.id === n.vendaId);
    return { ...n, clienteNome: c ? c.nome : 'Consumidor final', clienteDocumento: c ? c.documento : '', venda: venda || null };
  }

  /** @param {{busca?, status?, dataInicio?, dataFim?}} filtros */
  function listarNotas(filtros = {}) {
    const busca = normalizar(filtros.busca);
    const lista = db.notas
      .filter((n) => (!filtros.status || n.status === filtros.status) && noPeriodo(n.data, filtros.dataInicio, filtros.dataFim))
      .map(montarNota)
      .filter((n) => !busca || normalizar(`${n.numero} ${n.clienteNome} ${n.chave}`).includes(busca))
      .sort((a, b) => b.data.localeCompare(a.data));
    return responder(lista);
  }

  function obterNota(id) {
    const n = db.notas.find((x) => x.id === id);
    return n ? responder(montarNota(n)) : falhar('Nota não encontrada.');
  }

  /** Emite (simula) a NFC-e de uma venda. Futuro: chamar API fiscal via Cloud Function. */
  function emitirNota(vendaId) {
    const venda = db.vendas.find((v) => v.id === vendaId);
    if (!venda) return falhar('Venda não encontrada.');
    if (venda.notaId) {
      const existente = db.notas.find((n) => n.id === venda.notaId);
      if (existente) return responder(montarNota(existente));
    }
    // Só emite com os dados fiscais completos (Configurações → Dados fiscais)
    const pendencias = pendenciasFiscais();
    if (pendencias.length) return falhar(`Não é possível emitir: complete em Configurações → Dados fiscais (${pendencias.join(', ')}).`);

    // NCM de cada item: o do produto ou, se vazio, o padrão da categoria
    const itensFiscais = [];
    for (const it of venda.itens) {
      const p = db.produtos.find((x) => x.id === it.produtoId);
      const ncm = ncmDoProduto(p);
      if (!ncm) return falhar(`O produto "${it.nome}" está sem NCM. Informe no cadastro do produto ou em Configurações → Dados fiscais (NCM por categoria).`);
      itensFiscais.push({ sku: it.sku, ncm, cfop: db.fiscal.tributacao.cfop });
    }

    const cfg = db.fiscal.nfce;
    const serie = Number(cfg.serie) || 1;
    // Numeração sequencial por série; nunca repete um número já usado
    const usados = db.notas.filter((n) => Number(n.serie) === serie).map((n) => n.numero);
    const numero = Math.max(Number(cfg.proximoNumero) || 1, usados.length ? Math.max(...usados) + 1 : 1);
    cfg.proximoNumero = numero + 1;

    // Chave de acesso (44 dígitos): cUF + AAMM + CNPJ + modelo 65 + série + número + tpEmis + código + DV
    const d = new Date();
    const base = (CODIGO_UF[db.fiscal.endereco.uf] || '35') + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') +
      db.loja.cnpj.replace(/\D/g, '').padEnd(14, '0').slice(0, 14) + '65' + String(serie).padStart(3, '0') + String(numero).padStart(9, '0') + '1' +
      String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
    const chave = base + digitoChave(base);

    const nota = {
      id: gerarId('n'), numero, serie, vendaId, clienteId: venda.clienteId, data: d.toISOString(), valor: venda.total,
      status: 'autorizada', chave, ambiente: cfg.ambiente,
      itensFiscais // NCM/CFOP usados em cada item (iriam no XML da nota)
    };
    db.notas.push(nota);
    venda.notaId = nota.id;
    persistir();
    return responder(montarNota(nota));
  }

  /** Dígito verificador da chave de acesso (módulo 11, pesos 2 a 9) */
  function digitoChave(base) {
    let peso = 2, soma = 0;
    for (let i = base.length - 1; i >= 0; i--) {
      soma += Number(base[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }

  /* ==================================================================
     CONFIGURAÇÃO FISCAL (dados que aparecem na NFC-e)
     ================================================================== */

  // Código IBGE de cada UF (usado na chave de acesso)
  const CODIGO_UF = {
    RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17', MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26',
    AL: '27', SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41', SC: '42', RS: '43', MS: '50', MT: '51', GO: '52', DF: '53'
  };

  /** NCM efetivo de um produto: o próprio (8 dígitos) ou o padrão da categoria */
  function ncmDoProduto(p) {
    if (!p) return '';
    const proprio = String(p.ncm || '');
    if (proprio.replace(/\D/g, '').length === 8) return proprio;
    const padrao = String((db.fiscal.ncmPorCategoria || {})[p.categoria] || '');
    return padrao.replace(/\D/g, '').length === 8 ? padrao : '';
  }

  /** Produtos que ficariam sem NCM na nota (nem próprio nem da categoria) */
  function listarProdutosSemNcm() {
    return responder(db.produtos.filter((p) => !ncmDoProduto(p)).map((p) => ({ id: p.id, nome: p.nome, categoria: p.categoria })));
  }

  /** Valida CNPJ pelos dígitos verificadores */
  function cnpjValido(cnpj) {
    const n = String(cnpj || '').replace(/\D/g, '');
    if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false;
    const calc = (len) => {
      const pesos = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const soma = pesos.reduce((s, p, i) => s + Number(n[i]) * p, 0);
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(n[12]) && calc(13) === Number(n[13]);
  }

  /**
   * Lista do que falta para emitir NFC-e (vazia = pronto).
   * Mesma regra usada pelo checklist da tela e por emitirNota().
   */
  function pendenciasFiscais() {
    const p = [];
    const l = db.loja, f = db.fiscal, e = f.endereco || {}, n = f.nfce || {};
    if (!l.razaoSocial) p.push('Razão social');
    if (!cnpjValido(l.cnpj)) p.push('CNPJ válido');
    if (!l.inscricaoEstadual) p.push('Inscrição estadual');
    if (!f.regimeTributario) p.push('Regime tributário');
    if (!e.logradouro || !e.numero || !e.bairro) p.push('Endereço (logradouro, número e bairro)');
    if (!e.municipio || !/^\d{7}$/.test(e.codigoMunicipio || '')) p.push('Município com código IBGE');
    if (!CODIGO_UF[e.uf]) p.push('UF');
    if (String(e.cep || '').replace(/\D/g, '').length !== 8) p.push('CEP');
    if (!n.serie) p.push('Série da NFC-e');
    if (!n.cscId || !n.csc) p.push('CSC (ID e código)');
    if (!n.certificado) p.push('Certificado digital A1');
    else if (n.certificado.validade < new Date().toISOString().slice(0, 10)) p.push('Certificado digital dentro da validade');
    return p;
  }

  /** Dados fiscais completos (emitente vem de "loja", o resto de "fiscal") */
  function obterConfigFiscal() {
    const l = db.loja;
    return responder({
      ...db.fiscal,
      emitente: { razaoSocial: l.razaoSocial || '', nomeFantasia: l.nome || '', cnpj: l.cnpj || '', inscricaoEstadual: l.inscricaoEstadual || '' }
    });
  }

  /**
   * Salva os dados fiscais. Também atualiza razão social/CNPJ/IE e o
   * endereço de exibição da loja, para não haver duas fontes da verdade.
   */
  function salvarConfigFiscal(dados) {
    const negado = exigirDono('alterar os dados fiscais'); if (negado) return negado;
    if (dados.emitente) {
      if (dados.emitente.cnpj && !cnpjValido(dados.emitente.cnpj)) return falhar('CNPJ inválido. Confira os dígitos.');
      const { razaoSocial, cnpj, inscricaoEstadual } = dados.emitente;
      db.loja = { ...db.loja, razaoSocial, cnpj, inscricaoEstadual };
    }
    const copia = { ...dados };
    delete copia.emitente;
    db.fiscal = {
      ...db.fiscal,
      ...copia,
      endereco: { ...db.fiscal.endereco, ...(copia.endereco || {}) },
      nfce: { ...db.fiscal.nfce, ...(copia.nfce || {}) },
      tributacao: { ...db.fiscal.tributacao, ...(copia.tributacao || {}) },
      ncmPorCategoria: { ...db.fiscal.ncmPorCategoria, ...(copia.ncmPorCategoria || {}) }
    };
    const e = db.fiscal.endereco;
    if (e.logradouro) {
      db.loja.endereco = `${e.logradouro}, ${e.numero}${e.complemento ? ' ' + e.complemento : ''} — ${e.bairro}, ${e.municipio}/${e.uf} — ${e.cep}`;
    }
    persistir();
    return obterConfigFiscal();
  }

  /** Pendências para emitir NFC-e ([] = pronto) */
  function verificarConfigFiscal() {
    return responder(pendenciasFiscais());
  }

  /** Reenvia uma nota pendente (contingência) para autorização. */
  function transmitirNota(id) {
    const n = db.notas.find((x) => x.id === id);
    if (!n) return falhar('Nota não encontrada.');
    if (n.status !== 'pendente') return falhar('Apenas notas pendentes podem ser transmitidas.');
    n.status = 'autorizada';
    persistir();
    return responder(montarNota(n));
  }

  function cancelarNota(id) {
    const negado = exigirDono('cancelar notas fiscais'); if (negado) return negado;
    const n = db.notas.find((x) => x.id === id);
    if (!n) return falhar('Nota não encontrada.');
    n.status = 'cancelada';
    persistir();
    return responder(montarNota(n));
  }

  /* ==================================================================
     CLIENTES E FORNECEDORES (mesma estrutura de cadastro)
     ================================================================== */

  /**
   * @param {object} permissoes  { salvar: true se só o dono salva, excluir: true se só o dono exclui }
   */
  function criarCrud(colecao, prefixo, permissoes = {}) {
    return {
      listar(busca) {
        const b = normalizar(busca);
        const lista = db[colecao]
          .filter((x) => !b || normalizar(`${x.nome} ${x.documento} ${x.email} ${x.telefone}`).includes(b))
          .sort((a, c) => a.nome.localeCompare(c.nome, 'pt-BR'));
        return responder(lista);
      },
      obter(id) {
        const x = db[colecao].find((i) => i.id === id);
        return x ? responder(x) : falhar('Registro não encontrado.');
      },
      salvar(dados) {
        if (permissoes.salvar) { const negado = exigirDono(`cadastrar ${colecao}`); if (negado) return negado; }
        if (!dados.nome) return falhar('Informe o nome.');
        // Campos que só o dono altera (ex.: limite de crédito do cliente)
        for (const campo of permissoes.camposDono || []) {
          const atual = dados.id ? (db[colecao].find((x) => x.id === dados.id) || {})[campo] : undefined;
          if (campo in dados && Number(dados[campo] || 0) !== Number(atual || 0)) {
            const negado = exigirDono('alterar o limite de crédito'); if (negado) return negado;
          }
        }
        if ('limiteCredito' in dados) dados = { ...dados, limiteCredito: Math.max(0, Number(String(dados.limiteCredito).replace(',', '.')) || 0) };
        let registro;
        if (dados.id) {
          const i = db[colecao].findIndex((x) => x.id === dados.id);
          db[colecao][i] = registro = { ...db[colecao][i], ...dados };
        } else {
          registro = { ...dados, id: gerarId(prefixo), criadoEm: new Date().toISOString() };
          db[colecao].push(registro);
        }
        persistir();
        return responder(registro);
      },
      excluir(id) {
        if (permissoes.excluir) { const negado = exigirDono(`excluir ${colecao}`); if (negado) return negado; }
        db[colecao] = db[colecao].filter((x) => x.id !== id);
        persistir();
        return responder(true);
      }
    };
  }

  // Vendedor cadastra/edita clientes, mas só o dono exclui; fornecedores são só do dono
  const crudClientes = criarCrud('clientes', 'c', { excluir: true, camposDono: ['limiteCredito'] });
  const crudFornecedores = criarCrud('fornecedores', 'f', { salvar: true, excluir: true });

  /** Total comprado e saldo de vale-troca de cada cliente (para a listagem). */
  function resumoClientes() {
    const mapa = {};
    const de = (id) => (mapa[id] = mapa[id] || { compras: 0, total: 0, ultimaCompra: null, credito: 0 });
    db.vendas.filter(vendaValida).forEach((v) => {
      if (!v.clienteId) return;
      const r = de(v.clienteId);
      r.compras++;
      r.total += valorLiquido(v);
      if (!r.ultimaCompra || v.data > r.ultimaCompra) r.ultimaCompra = v.data;
    });
    (db.creditos || []).forEach((c) => { if (c.clienteId && c.saldo > 0) de(c.clienteId).credito += c.saldo; });
    // Crediário: quanto o cliente deve (e quanto está vencido)
    db.clientes.forEach((cli) => {
      const r = resumoCrediario(cli.id);
      if (r.emAberto > 0 || r.limite > 0) Object.assign(de(cli.id), { crediarioAberto: r.emAberto, crediarioVencido: r.vencido, limiteCredito: r.limite });
    });
    // Pontos de fidelidade (só com o programa ligado)
    const regra = regraPontos();
    if (regra) db.clientes.forEach((cli) => {
      const saldo = Math.max(0, saldoPontosCliente(cli.id));
      if (saldo > 0) Object.assign(de(cli.id), { pontos: saldo, pontosValor: arred(saldo * regra.valorPonto), pontosMinimo: regra.minimoResgate });
    });
    return responder(mapa);
  }

  /* ==================================================================
     PEDIDOS ONLINE (feitos pelo catálogo)
     Status: novo → confirmado → concluido (virou venda) | cancelado.
     Enquanto está novo ou confirmado, as peças ficam RESERVADAS: saem da
     disponibilidade do catálogo e não podem ser vendidas no caixa por engano.
     ================================================================== */
  const PEDIDO_ABERTO = ['novo', 'confirmado'];
  /** Peças reservadas em pedidos abertos (sku → quantidade). excluir = id de um pedido a ignorar */
  function reservasPorSku(excluir = null) {
    const r = {};
    (db.pedidos || []).forEach((p) => {
      if (!PEDIDO_ABERTO.includes(p.status) || p.id === excluir) return;
      (p.itens || []).forEach((it) => { r[it.sku] = (r[it.sku] || 0) + (Number(it.qtd) || 0); });
    });
    return r;
  }
  function listarPedidos() {
    const lista = [...(db.pedidos || [])].sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    return responder(lista);
  }
  function obterPedido(id) {
    const p = (db.pedidos || []).find((x) => x.id === id);
    return p ? responder(p) : falhar('Pedido não encontrado.');
  }
  /** Muda o status (confirmar ou cancelar). Concluir é feito pela venda. */
  function atualizarPedido(id, { status, observacaoLoja }) {
    const p = (db.pedidos || []).find((x) => x.id === id);
    if (!p) return falhar('Pedido não encontrado.');
    if (status && !['novo', 'confirmado', 'cancelado'].includes(status)) return falhar('Situação inválida.');
    if (p.status === 'concluido') return falhar('Este pedido já virou venda.');
    if (status) {
      p.status = status;
      p.historico = [...(p.historico || []), { status, data: new Date().toISOString(), usuario: usuarioLogado().nome || '' }];
    }
    if (observacaoLoja !== undefined) p.observacaoLoja = String(observacaoLoja).slice(0, 200);
    persistir();
    return responder(p);
  }
  function resumoPedidos() {
    const lista = db.pedidos || [];
    return responder({ novos: lista.filter((p) => p.status === 'novo').length, abertos: lista.filter((p) => PEDIDO_ABERTO.includes(p.status)).length });
  }

  /* ==================================================================
     CATÁLOGO ONLINE (página pública pages/catalogo.html)
     Uma CÓPIA separada, só com o que o cliente pode ver: nome, foto, preço e
     tamanhos/cores com estoque. Nada de custo, vendas ou clientes.
     Fica num documento só (catalogos/{lojaId}): cada visita = 1 leitura.
     ================================================================== */
  const CHAVE_CATALOGO = 'gestaoloja:catalogo';   // modo local: a "nuvem" do catálogo
  const soDigitos = (t) => String(t || '').replace(/\D/g, '');
  const fotoPublica = (f) => (f && !String(f).startsWith('data:') ? String(f) : '');

  function montarCatalogo() {
    const c = (db.loja && db.loja.catalogo) || {};
    if (c.ativo === false) return { publicado: false, atualizadoEm: new Date().toISOString() };
    const precos = c.mostrarPrecos !== false;
    const recente = Date.now() - 15 * 86400000;
    const reservas = reservasPorSku();
    const livre = (v) => Math.max(0, Number(v.estoque || 0) - (reservas[v.sku] || 0));
    const produtos = db.produtos
      .filter((p) => p.ativo !== false)
      .map(comTotais)
      .map((p) => ({ ...p, estoqueLivre: p.variacoes.reduce((s, v) => s + livre(v), 0) }))
      .sort((a, b) => (b.estoqueLivre > 0) - (a.estoqueLivre > 0) || String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')))
      .map((p) => ({
        id: String(p.id), nome: p.nome || '', categoria: p.categoria || '', marca: p.marca || '',
        foto: fotoPublica(p.foto) || Object.values(p.fotosCores || {}).map(fotoPublica).find(Boolean) || '',
        fotosExtras: (p.fotosExtras || []).map(fotoPublica).filter(Boolean).slice(0, 5),
        fotosCores: Object.fromEntries(Object.entries(p.fotosCores || {}).map(([cor, url]) => [cor, fotoPublica(url)]).filter(([, url]) => url)),
        recolor: p.recolorFoto !== false,
        preco: precos ? Number(p.preco || 0) : null,
        promo: precos && p.precoPromocional ? Number(p.precoPromocional) : null,
        novo: !!p.criadoEm && new Date(p.criadoEm).getTime() > recente,
        descricao: String(p.descricao || '').slice(0, 400),
        estoque: p.estoqueLivre,
        // todas as variações, com a quantidade disponível de cada uma (0 = esgotada ou reservada)
        variacoes: p.variacoes.map((v) => ({ s: v.sku, t: v.tamanho || '', c: v.cor || '', h: corHexCatalogo(v.cor), q: livre(v) }))
      }));
    // O documento do Firestore aceita até 1 MB: se crescer muito, tira as descrições
    if (JSON.stringify(produtos).length > 850000) produtos.forEach((p) => { p.descricao = ''; });
    const loja = db.loja || {};
    let whatsapp = soDigitos(c.whatsapp || loja.telefone);
    if (whatsapp && whatsapp.length <= 11) whatsapp = '55' + whatsapp;   // número brasileiro sem o 55
    return {
      publicado: true, nome: loja.nome || '', logo: fotoPublica(loja.logo), whatsapp,
      instagram: String(loja.instagram || '').replace(/^@/, '').trim(), mensagem: c.mensagem || '',
      endereco: String(loja.endereco || '').slice(0, 160), entrega: c.entrega !== false,
      tema: c.tema && typeof c.tema === 'object' ? c.tema : {},
      mostrarPrecos: precos, produtos, atualizadoEm: new Date().toISOString()
    };
  }

  var ultimoCatalogo = null;     // (var: persistir() pode rodar antes desta linha) última versão publicada (para só gravar quando muda)
  var catalogoAgendado = null;
  function agendarCatalogo() {
    clearTimeout(catalogoAgendado);
    catalogoAgendado = setTimeout(() => publicarCatalogo(), 1500);
  }
  /** Publica o catálogo se mudou. forcar = publica mesmo sem mudança (ex.: ao ligar/desligar). */
  async function publicarCatalogo(forcar = false) {
    if (MODO === 'nuvem' && !lojaId) return false;
    const memoria = `${CHAVE_CATALOGO}:${lojaId || 'local'}`;
    if (ultimoCatalogo === null) { try { ultimoCatalogo = localStorage.getItem(memoria) || ''; } catch (e) { ultimoCatalogo = ''; } }
    const dados = montarCatalogo();
    const chave = canon({ ...dados, atualizadoEm: '' });
    if (!forcar && chave === ultimoCatalogo) return false;
    if (!forcar && !dados.publicado && !ultimoCatalogo) return false;   // nunca publicado e desligado
    const anterior = ultimoCatalogo;
    ultimoCatalogo = chave;
    try {
      if (MODO === 'nuvem') await fb.fs.collection('catalogos').doc(lojaId).set(dados);
      else localStorage.setItem(CHAVE_CATALOGO, JSON.stringify(dados));
      try { localStorage.setItem(memoria, chave); } catch (e) { /* ignora */ }
      return true;
    } catch (e) {
      ultimoCatalogo = anterior;
      console.warn('Catálogo online não foi atualizado:', e);
      if (forcar) throw new Error('Não foi possível publicar o catálogo. Confira se as regras do Firestore estão atualizadas.');
      return false;
    }
  }
  /** Endereço público do catálogo desta loja */
  function linkCatalogo() {
    const base = location.origin + location.pathname.replace(/\/pages\/[^/]*$|\/[^/]*$/, '');
    // A loja principal do site tem o endereço curto (regra "Rewrite" no Render: /catalogo → /pages/catalogo.html)
    if (MODO === 'nuvem' && lojaId && window.CATALOGO_PRINCIPAL === lojaId) return `${base}/catalogo`;
    return `${base}/pages/catalogo.html${lojaId ? '?l=' + encodeURIComponent(lojaId) : ''}`;
  }
  /** Tom da cor (nome → hex) para as bolinhas do catálogo, pelas cores cadastradas */
  function corHexCatalogo(nome) {
    const c = (db.cores || []).find((x) => normalizar(typeof x === 'string' ? x : x.nome) === normalizar(nome));
    return c && typeof c === 'object' && c.hex ? c.hex : '';
  }


  /* ==================================================================
     INDICADORES E RELATÓRIOS
     ================================================================== */

  /** Números do dashboard. */
  function obterResumoDashboard() {
    const hoje = diaLocal(new Date().toISOString());
    const mes = hoje.slice(0, 7);
    const validas = db.vendas.filter(vendaValida);
    const doDia = validas.filter((v) => diaLocal(v.data) === hoje);
    const doMes = validas.filter((v) => diaLocal(v.data).startsWith(mes));
    const faturamentoMes = doMes.reduce((s, v) => s + valorLiquido(v), 0);
    const baixo = db.produtos.map(comTotais).filter((p) => p.estoqueBaixo);

    return responder({
      vendasHoje: doDia.length,
      totalHoje: doDia.reduce((s, v) => s + valorLiquido(v), 0),
      faturamentoMes,
      vendasMes: doMes.length,
      ticketMedio: doMes.length ? faturamentoMes / doMes.length : 0,
      estoqueBaixo: baixo.length
    });
  }

  /** Total vendido por dia nos últimos N dias (inclui hoje). */
  function obterVendasPorDia(dias = 7) {
    const resultado = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dia = diaLocal(d.toISOString());
      const vendasDia = db.vendas.filter((v) => vendaValida(v) && diaLocal(v.data) === dia);
      resultado.push({ data: dia, total: vendasDia.reduce((s, v) => s + valorLiquido(v), 0), quantidade: vendasDia.length });
    }
    return responder(resultado);
  }

  /**
   * Relatório completo de um período (AAAA-MM-DD).
   * Retorna totais, vendas por dia, por categoria, por forma de pagamento,
   * produtos mais vendidos e estoque parado (sem venda no período).
   */
  /**
   * Reposição e peças paradas (por tamanho e cor).
   * - comprar: o que vendeu nos últimos `diasVenda` dias e não dura `diasCobrir` dias no estoque
   * - parados: produtos com estoque sem venda há `diasParado` dias (ou mais)
   */
  function analisarEstoque({ diasVenda = 30, diasCobrir = 30, diasParado = 60 } = {}) {
    diasVenda = Math.max(7, Number(diasVenda) || 30);
    diasCobrir = Math.max(7, Number(diasCobrir) || 30);
    diasParado = Math.max(15, Number(diasParado) || 60);
    const agora = Date.now();
    const diasDesde = (iso) => (iso ? Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 86400000)) : null);
    const inicioJanela = new Date(agora - diasVenda * 86400000).toISOString();

    const vendidos = {};       // sku → peças vendidas na janela (sem trocas/devoluções)
    const ultimaVendaSku = {}; // sku → data da última venda
    db.vendas.filter(vendaValida).forEach((v) => v.itens.forEach((it) => {
      const qtd = it.qtd - qtdDevolvida(v, it.sku);
      if (qtd <= 0) return;
      if (!ultimaVendaSku[it.sku] || v.data > ultimaVendaSku[it.sku]) ultimaVendaSku[it.sku] = v.data;
      if (v.data >= inicioJanela) vendidos[it.sku] = (vendidos[it.sku] || 0) + qtd;
    }));
    // Última chegada de mercadoria (entrada de nota, cadastro, ajuste) — trocas e cancelamentos não contam
    const ultimaEntradaSku = {};
    (db.movimentacoes || []).forEach((m) => {
      if (m.tipo !== 'entrada' || /^(troca|devolu|cancel)/i.test(m.motivo || '')) return;
      if (!ultimaEntradaSku[m.sku] || m.data > ultimaEntradaSku[m.sku]) ultimaEntradaSku[m.sku] = m.data;
    });
    const nomeFornecedor = (id) => ((db.fornecedores || []).find((f) => f.id === id) || {}).nome || '';

    const comprar = [];
    const parados = [];
    db.produtos.filter((p) => p.ativo !== false).forEach((p) => {
      const custo = Number(p.custo || 0);
      const fornecedor = nomeFornecedor(p.fornecedorId);
      const base = { produtoId: p.id, nome: p.nome, categoria: p.categoria, foto: p.foto || '', fornecedorId: p.fornecedorId || '', fornecedor, custo, preco: Number(p.preco || 0) };

      // O que comprar (por variação)
      p.variacoes.forEach((v) => {
        const vendeu = vendidos[v.sku] || 0;
        if (!vendeu) return;
        const estoque = Number(v.estoque || 0);
        const porDia = vendeu / diasVenda;
        const duraDias = porDia > 0 ? Math.floor(estoque / porDia) : null;
        const comprarQtd = Math.max(0, Math.ceil(porDia * diasCobrir) - estoque);
        if (comprarQtd <= 0) return;
        comprar.push({ ...base, sku: v.sku, tamanho: v.tamanho, cor: v.cor, estoque, vendeu, duraDias, comprar: comprarQtd,
          urgencia: estoque <= 0 ? 'esgotado' : duraDias <= 7 ? 'acabando' : 'repor', valor: arred(comprarQtd * custo) });
      });

      // Peças paradas (por produto, com as variações que ainda têm estoque)
      const comEstoque = p.variacoes.filter((v) => Number(v.estoque || 0) > 0);
      if (!comEstoque.length) return;
      const ultimaVenda = comEstoque.map((v) => ultimaVendaSku[v.sku]).concat(p.variacoes.map((v) => ultimaVendaSku[v.sku])).filter(Boolean).sort().pop() || null;
      const chegada = comEstoque.map((v) => ultimaEntradaSku[v.sku]).filter(Boolean).sort().pop() || p.criadoEm || null;
      // Conta a partir do que for mais recente: última venda ou chegada da mercadoria
      const referencia = [ultimaVenda, chegada].filter(Boolean).sort().pop() || null;
      const dias = diasDesde(referencia);
      if (dias === null || dias < diasParado) return;
      const pecas = comEstoque.reduce((s, v) => s + Number(v.estoque || 0), 0);
      parados.push({ ...base, pecas, dias, ultimaVenda, chegada,
        valorCusto: arred(pecas * custo), valorVenda: arred(pecas * Number(p.preco || 0)),
        variacoes: comEstoque.map((v) => ({ sku: v.sku, tamanho: v.tamanho, cor: v.cor, estoque: Number(v.estoque || 0), ultimaVenda: ultimaVendaSku[v.sku] || null })) });
    });

    const ordemUrgencia = { esgotado: 0, acabando: 1, repor: 2 };
    comprar.sort((a, b) => ordemUrgencia[a.urgencia] - ordemUrgencia[b.urgencia] || (a.duraDias ?? 0) - (b.duraDias ?? 0) || b.vendeu - a.vendeu);
    parados.sort((a, b) => b.dias - a.dias || b.valorCusto - a.valorCusto);
    return responder({
      diasVenda, diasCobrir, diasParado, comprar, parados,
      totais: {
        pecasComprar: comprar.reduce((s, x) => s + x.comprar, 0),
        investimento: arred(comprar.reduce((s, x) => s + x.valor, 0)),
        esgotados: comprar.filter((x) => x.urgencia === 'esgotado').length,
        pecasParadas: parados.reduce((s, x) => s + x.pecas, 0),
        valorParado: arred(parados.reduce((s, x) => s + x.valorCusto, 0))
      }
    });
  }

  function obterRelatorio({ dataInicio, dataFim }) {
    const vendas = db.vendas.filter((v) => vendaValida(v) && noPeriodo(v.data, dataInicio, dataFim));

    let faturamento = 0, custo = 0, descontos = 0, pecas = 0;
    const porDia = {}, porCategoria = {}, porPagamento = {}, porProduto = {}, porVendedor = {};

    vendas.forEach((v) => {
      const liquido = valorLiquido(v);
      faturamento += liquido;
      descontos += v.desconto + (v.descontoPromocao || 0);
      // Comissão: faturamento líquido de cada vendedor
      porVendedor[v.vendedorId] = porVendedor[v.vendedorId] || { vendas: 0, faturamento: 0 };
      porVendedor[v.vendedorId].vendas++;
      porVendedor[v.vendedorId].faturamento += liquido;
      const dia = diaLocal(v.data);
      porDia[dia] = porDia[dia] || { data: dia, total: 0, lucro: 0, quantidade: 0 };
      porDia[dia].total += liquido;
      porDia[dia].quantidade++;
      // Divide o valor líquido entre as formas usadas (venda com pagamento dividido)
      const proporcao = v.total ? liquido / v.total : 0;
      pagamentosDe(v).forEach((p) => { porPagamento[p.forma] = (porPagamento[p.forma] || 0) + p.valor * proporcao; });

      // Rateia o desconto proporcionalmente entre os itens
      const fator = v.subtotal ? v.total / v.subtotal : 1;
      v.itens.forEach((it) => {
        // Peças que voltaram (troca/devolução) não contam como vendidas
        const qtd = it.qtd - qtdDevolvida(v, it.sku);
        if (qtd <= 0) return;
        const receita = it.preco * qtd * fator;
        const c = (it.custo || 0) * qtd;
        custo += c;
        pecas += qtd;
        porDia[dia].lucro += receita - c;
        const p = db.produtos.find((x) => x.id === it.produtoId);
        const cat = p ? p.categoria : 'Outros';
        porCategoria[cat] = (porCategoria[cat] || 0) + receita;
        porProduto[it.produtoId] = porProduto[it.produtoId] || { produtoId: it.produtoId, nome: it.nome, categoria: cat, quantidade: 0, total: 0, lucro: 0 };
        porProduto[it.produtoId].quantidade += qtd;
        porProduto[it.produtoId].total += receita;
        porProduto[it.produtoId].lucro += receita - c;
      });
    });

    // Preenche dias sem venda para o gráfico ficar contínuo
    const serie = [];
    if (dataInicio && dataFim) {
      const d = new Date(dataInicio + 'T12:00:00');
      const fim = new Date(dataFim + 'T12:00:00');
      while (d <= fim) {
        const dia = diaLocal(d.toISOString());
        serie.push(porDia[dia] || { data: dia, total: 0, lucro: 0, quantidade: 0 });
        d.setDate(d.getDate() + 1);
      }
    } else {
      serie.push(...Object.values(porDia).sort((a, b) => a.data.localeCompare(b.data)));
    }

    // Estoque parado: produtos com estoque e sem venda no período
    const ultimaVenda = {};
    db.vendas.filter(vendaValida).forEach((v) => v.itens.forEach((it) => {
      if (!ultimaVenda[it.produtoId] || v.data > ultimaVenda[it.produtoId]) ultimaVenda[it.produtoId] = v.data;
    }));
    const estoqueParado = db.produtos.map(comTotais)
      .filter((p) => p.estoqueTotal > 0 && !porProduto[p.id])
      .map((p) => ({ produtoId: p.id, nome: p.nome, categoria: p.categoria, estoque: p.estoqueTotal, valorParado: p.estoqueTotal * p.custo, ultimaVenda: ultimaVenda[p.id] || null }))
      .sort((a, b) => b.valorParado - a.valorParado);

    const lucro = faturamento - custo;
    return responder({
      totais: {
        faturamento, custo, lucro, descontos, pecas,
        vendas: vendas.length,
        ticketMedio: vendas.length ? faturamento / vendas.length : 0,
        margem: faturamento ? (lucro / faturamento) * 100 : 0
      },
      porDia: serie,
      porCategoria: Object.entries(porCategoria).map(([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total),
      porPagamento: Object.entries(porPagamento).map(([forma, total]) => ({ forma, total })).sort((a, b) => b.total - a.total),
      maisVendidos: Object.values(porProduto).sort((a, b) => b.quantidade - a.quantidade || b.total - a.total),
      // Comissão por vendedor (percentual do cadastro do usuário sobre o faturamento líquido)
      porVendedor: Object.entries(porVendedor).map(([id, r]) => {
        const u = db.usuarios.find((x) => x.id === id) || {};
        const percentual = Number(u.comissao || 0);
        return { vendedorId: id, nome: u.nome || '—', perfil: u.perfil || '', vendas: r.vendas, faturamento: arred(r.faturamento), percentual, comissao: arred(r.faturamento * percentual / 100) };
      }).sort((a, b) => b.faturamento - a.faturamento),
      estoqueParado
    });
  }

  /* ==================================================================
     UTILITÁRIO DO MOCK
     ================================================================== */

  /** Apaga as alterações locais e volta aos dados de exemplo. */
  function resetarDados() {
    if (MODO === 'nuvem') return falhar('Na nuvem os dados da loja não podem ser apagados por aqui.');
    try { localStorage.removeItem(CHAVE_DB); } catch (e) { /* ignora */ }
    db = clonar(window.MOCK_DATA);
    return responder(true);
  }

  /* ---------- API pública ---------- */
  window.Data = {
    // Modo ('nuvem' | 'local') e carregamento
    modo: MODO, pronto,
    // Autenticação
    entrar, sair, usuarioAtual, recuperarSenha, criarLoja, trocarSenha,
    // Painel do suporte (super admin)
    admin: {
      listarLojas: adminListarLojas, salvarAssinatura: adminSalvarAssinatura,
      registrarPagamento: adminRegistrarPagamento, excluirPagamento: adminExcluirPagamento,
      bloquearLoja: adminBloquearLoja, criarLoja: adminCriarLoja, responderAviso: adminResponderAviso,
      exportarLoja: adminExportarLoja, restaurarLoja: adminRestaurarLoja, zerarLoja: adminZerarLoja
    },
    // Mensalidade (dono da loja)
    obterMensalidade, informarPagamentoMensalidade, valorDaMensalidade, fimDaPromocao,
    // Loja e usuários
    obterLoja, salvarLoja, listarUsuarios, salvarUsuario, excluirUsuario,
    // Catálogo auxiliar
    listarCategorias, listarMarcas, listarColecoes, listarCores, adicionarCor, listarTamanhos,
    // Produtos
    listarProdutos, obterProduto, salvarProduto, excluirProduto, buscarPorCodigo, listarEstoqueBaixo,
    // Estoque
    listarMovimentacoes, registrarMovimentacao,
    // Entrada de mercadoria em lote (nota do fornecedor)
    registrarEntradaLote, listarEntradas,
    // Vendas
    listarVendas, obterVenda, registrarVenda, registrarDevolucao, cancelarVenda,
    // Vale-troca (crédito do cliente)
    listarCreditos, obterCreditoPorCodigo, resumoPontos, painelPontos, ajustarPontos,
    listarPedidos, obterPedido, atualizarPedido, resumoPedidos, reservasPorSku: (excluir) => responder(reservasPorSku(excluir)), publicarCatalogo, linkCatalogo,
    // Caixa
    obterCaixaAberto, obterCaixa, listarCaixas, abrirCaixa, registrarMovimentoCaixa, fecharCaixa,
    // Regras de venda (limite de desconto) e autorização do dono
    obterRegrasVenda, salvarRegrasVenda, autorizarDono,
    // Promoções
    listarPromocoes, salvarPromocao, excluirPromocao, calcularCarrinho,
    // Crediário (contas a receber)
    listarContasReceber, receberParcela, resumoCrediarioCliente,
    // Contas a pagar e resumo financeiro
    listarContasPagar, salvarContaPagar, pagarConta, excluirContaPagar, resumoFinanceiro,
    // Inventário
    obterInventarioAberto, listarInventarios, iniciarInventario, registrarContagem, finalizarInventario, cancelarInventario,
    // Notas fiscais
    listarNotas, obterNota, emitirNota, transmitirNota, cancelarNota,
    // Configuração fiscal (NFC-e)
    obterConfigFiscal, salvarConfigFiscal, verificarConfigFiscal, listarProdutosSemNcm,
    // Clientes
    listarClientes: crudClientes.listar, obterCliente: crudClientes.obter, salvarCliente: crudClientes.salvar, excluirCliente: crudClientes.excluir, resumoClientes,
    // Fornecedores
    listarFornecedores: crudFornecedores.listar, obterFornecedor: crudFornecedores.obter, salvarFornecedor: crudFornecedores.salvar, excluirFornecedor: crudFornecedores.excluir,
    // Indicadores e relatórios
    obterResumoDashboard, obterVendasPorDia, obterRelatorio, analisarEstoque,
    // Mock
    resetarDados
  };
})();
