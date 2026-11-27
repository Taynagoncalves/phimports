/* ==========================================================================
   mock-data.js — Dados de exemplo
   ATENÇÃO: nenhuma página deve ler este arquivo diretamente.
   Todo acesso passa por js/data.js (que depois será trocado pelo Firebase).

   As datas são geradas relativas a "hoje" para que o dashboard
   (vendas do dia, últimos 7 dias) sempre tenha dados.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- Auxiliares só para montar o mock ---------- */

  // Retorna uma data ISO de "d" dias atrás, no horário h:m
  function diasAtras(d, h = 10, m = 0) {
    const dt = new Date();
    dt.setDate(dt.getDate() - d);
    dt.setHours(h, m, 0, 0);
    return dt.toISOString();
  }

  // Calcula o dígito verificador de um EAN-13 a partir de 12 dígitos
  function ean13(base12) {
    const soma = base12.split('').reduce((acc, n, i) => acc + Number(n) * (i % 2 === 0 ? 1 : 3), 0);
    return base12 + ((10 - (soma % 10)) % 10);
  }

  // Remove acentos e gera uma sigla de 3 letras para o SKU
  function sigla(texto) {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
  }

  // Gerador pseudoaleatório com semente (para o estoque ser sempre igual)
  let semente = 42;
  function aleatorio(min, max) {
    semente = (semente * 9301 + 49297) % 233280;
    return min + Math.floor((semente / 233280) * (max - min + 1));
  }

  // Monta a grade tamanho × cor de um produto
  function gerarGrade(indice, codigo, tamanhos, cores, estoqueMin, estoqueMax) {
    const variacoes = [];
    let v = 0;
    tamanhos.forEach((tam) => {
      cores.forEach((cor) => {
        v++;
        variacoes.push({
          sku: `${codigo}-${tam}-${sigla(cor)}`,
          codigoBarras: ean13('789123' + String(indice).padStart(3, '0') + String(v).padStart(3, '0')),
          tamanho: tam,
          cor: cor,
          estoque: aleatorio(estoqueMin, estoqueMax)
        });
      });
    });
    return variacoes;
  }

  /* ---------- Paleta de cores disponíveis para variações ---------- */
  const cores = [
    { nome: 'Branco', hex: '#FFFFFF' },
    { nome: 'Off-white', hex: '#F4EFE6' },
    { nome: 'Preto', hex: '#1F1F1F' },
    { nome: 'Cinza mescla', hex: '#A6A8AD' },
    { nome: 'Azul-marinho', hex: '#1E2A4A' },
    { nome: 'Azul-escuro', hex: '#2B3F66' },
    { nome: 'Azul-médio', hex: '#4A6FA5' },
    { nome: 'Azul-claro', hex: '#9DB8DA' },
    { nome: 'Verde-oliva', hex: '#6B6B3A' },
    { nome: 'Bege', hex: '#D9C3A5' },
    { nome: 'Areia', hex: '#E3D3B8' },
    { nome: 'Terracota', hex: '#B5562F' },
    { nome: 'Vinho', hex: '#6D1F2E' },
    { nome: 'Rosa', hex: '#E9A6B8' },
    { nome: 'Azul', hex: '#3E6DB5' },
    { nome: 'Amarelo', hex: '#F2C94C' },
    { nome: 'Vermelho', hex: '#C0392B' },
    // Tons de jeans
    ...[
      { nome: 'Jeans claro', hex: '#9FB6D1' },
      { nome: 'Jeans médio', hex: '#5E7FA8' },
      { nome: 'Jeans escuro', hex: '#2F4468' },
      { nome: 'Jeans preto', hex: '#2A2C31' },
      { nome: 'Jeans cinza', hex: '#7C838D' },
      { nome: 'Jeans branco', hex: '#ECEEF0' }
    ]
  ];

  const tamanhos = ['PP', 'P', 'M', 'G', 'GG', '36', '38', '40', '42', '44', '46'];

  const categorias = ['Camisetas', 'Calças', 'Vestidos', 'Moletons', 'Jaquetas', 'Camisas', 'Shorts', 'Saias'];

  /* ---------- Fornecedores ---------- */
  const fornecedores = [
    { id: 'f1', nome: 'Têxtil Vale do Itajaí Ltda.', documento: '12.345.678/0001-90', telefone: '(47) 3333-1020', email: 'comercial@textilvale.com.br', endereco: 'Rua das Indústrias, 800 — Blumenau/SC', contato: 'Marcos Ribeiro' },
    { id: 'f2', nome: 'Denim Brasil Confecções', documento: '23.456.789/0001-01', telefone: '(11) 4002-3344', email: 'vendas@denimbrasil.com.br', endereco: 'Av. do Estado, 4500 — São Paulo/SP', contato: 'Juliana Prado' },
    { id: 'f3', nome: 'Ateliê Aurora Moda Feminina', documento: '34.567.890/0001-12', telefone: '(31) 3555-7788', email: 'pedidos@atelieaurora.com.br', endereco: 'Rua Pernambuco, 210 — Belo Horizonte/MG', contato: 'Carla Menezes' }
  ];

  /* ---------- Produtos (15) ---------- */
  const LETRAS = ['PP', 'P', 'M', 'G', 'GG'];
  const produtos = [
    { id: 'p1', nome: 'Camiseta Básica Algodão', marca: 'Urbana', categoria: 'Camisetas', colecao: 'Essenciais', descricao: 'Camiseta 100% algodão penteado, gola careca, modelagem regular.', custo: 22, preco: 59.9, fornecedorId: 'f1', estoqueMinimo: 15, variacoes: gerarGrade(1, 'CBA', LETRAS, ['Branco', 'Preto', 'Cinza mescla'], 2, 9) },
    { id: 'p2', nome: 'Camiseta Oversized Estampada', marca: 'Maré', categoria: 'Camisetas', colecao: 'Verão 2026', descricao: 'Malha encorpada, caimento oversized e estampa frontal em silk.', custo: 35, preco: 89.9, fornecedorId: 'f1', estoqueMinimo: 10, variacoes: gerarGrade(2, 'COE', ['P', 'M', 'G', 'GG'], ['Off-white', 'Preto'], 1, 6) },
    { id: 'p3', nome: 'Regata Canelada', marca: 'Aurora', categoria: 'Camisetas', colecao: 'Verão 2026', descricao: 'Regata em malha canelada com elastano, alças largas.', custo: 18, preco: 49.9, fornecedorId: 'f3', estoqueMinimo: 10, variacoes: gerarGrade(3, 'RCA', ['PP', 'P', 'M', 'G'], ['Branco', 'Rosa', 'Verde-oliva'], 0, 5) },
    { id: 'p4', nome: 'Calça Jeans Skinny', marca: 'Denim Co.', categoria: 'Calças', colecao: 'Essenciais', descricao: 'Jeans com elastano, cintura alta, lavagem escura.', custo: 75, preco: 189.9, fornecedorId: 'f2', estoqueMinimo: 10, variacoes: gerarGrade(4, 'CJS', ['36', '38', '40', '42', '44'], ['Azul-escuro', 'Azul-claro'], 1, 5) },
    { id: 'p5', nome: 'Calça Jeans Reta Masculina', marca: 'Denim Co.', categoria: 'Calças', colecao: 'Essenciais', descricao: 'Modelagem reta, jeans 100% algodão, cinco bolsos.', custo: 85, preco: 219.9, fornecedorId: 'f2', estoqueMinimo: 8, variacoes: gerarGrade(5, 'CJR', ['38', '40', '42', '44', '46'], ['Azul-médio', 'Preto'], 0, 4) },
    { id: 'p6', nome: 'Calça Wide Leg Alfaiataria', marca: 'Aurora', categoria: 'Calças', colecao: 'Inverno 2026', descricao: 'Pantalona de alfaiataria com pregas e cós alto.', custo: 70, preco: 179.9, fornecedorId: 'f3', estoqueMinimo: 6, variacoes: gerarGrade(6, 'CWL', ['36', '38', '40', '42'], ['Bege', 'Preto'], 1, 4) },
    { id: 'p7', nome: 'Vestido Midi Floral', marca: 'Aurora', categoria: 'Vestidos', colecao: 'Primavera 2026', descricao: 'Viscose estampada, decote V e faixa na cintura.', custo: 65, preco: 199.9, fornecedorId: 'f3', estoqueMinimo: 6, variacoes: gerarGrade(7, 'VMF', ['PP', 'P', 'M', 'G'], ['Azul', 'Rosa'], 1, 4) },
    { id: 'p8', nome: 'Vestido Tubinho Canelado', marca: 'Maré', categoria: 'Vestidos', colecao: 'Inverno 2026', descricao: 'Vestido justo em malha canelada, comprimento midi.', custo: 45, preco: 139.9, fornecedorId: 'f1', estoqueMinimo: 6, variacoes: gerarGrade(8, 'VTC', ['P', 'M', 'G'], ['Preto', 'Vinho'], 1, 5) },
    { id: 'p9', nome: 'Vestido Longo Linho', marca: 'Linha Norte', categoria: 'Vestidos', colecao: 'Verão 2026', descricao: 'Linho misto, alças finas e fenda lateral.', custo: 110, preco: 289.9, fornecedorId: 'f3', estoqueMinimo: 6, variacoes: gerarGrade(9, 'VLL', ['P', 'M', 'G'], ['Areia', 'Terracota'], 0, 1) },
    { id: 'p10', nome: 'Moletom Canguru Básico', marca: 'Urbana', categoria: 'Moletons', colecao: 'Inverno 2026', descricao: 'Moletom flanelado com capuz e bolso canguru.', custo: 60, preco: 159.9, fornecedorId: 'f1', estoqueMinimo: 12, variacoes: gerarGrade(10, 'MCB', ['P', 'M', 'G', 'GG'], ['Cinza mescla', 'Preto', 'Azul-marinho'], 1, 6) },
    { id: 'p11', nome: 'Moletom Careca Oversized', marca: 'Maré', categoria: 'Moletons', colecao: 'Inverno 2026', descricao: 'Moletom sem capuz, ombro caído e punhos canelados.', custo: 58, preco: 149.9, fornecedorId: 'f1', estoqueMinimo: 8, variacoes: gerarGrade(11, 'MCO', ['P', 'M', 'G', 'GG'], ['Off-white', 'Verde-oliva'], 0, 5) },
    { id: 'p12', nome: 'Jaqueta Jeans Clássica', marca: 'Denim Co.', categoria: 'Jaquetas', colecao: 'Essenciais', descricao: 'Jaqueta trucker em jeans rígido, botões metálicos.', custo: 95, preco: 249.9, fornecedorId: 'f2', estoqueMinimo: 6, variacoes: gerarGrade(12, 'JJC', ['P', 'M', 'G', 'GG'], ['Azul-médio'], 0, 2) },
    { id: 'p13', nome: 'Camisa Linho Manga Longa', marca: 'Linha Norte', categoria: 'Camisas', colecao: 'Verão 2026', descricao: 'Camisa de linho com botões de madrepérola.', custo: 70, preco: 189.9, fornecedorId: 'f1', estoqueMinimo: 6, variacoes: gerarGrade(13, 'CLM', ['P', 'M', 'G', 'GG'], ['Branco', 'Azul-claro'], 1, 4) },
    { id: 'p14', nome: 'Short Jeans Cintura Alta', marca: 'Denim Co.', categoria: 'Shorts', colecao: 'Verão 2026', descricao: 'Short jeans com barra desfiada e cintura alta.', custo: 40, preco: 109.9, fornecedorId: 'f2', estoqueMinimo: 8, variacoes: gerarGrade(14, 'SJC', ['36', '38', '40', '42'], ['Azul-claro'], 0, 2) },
    { id: 'p15', nome: 'Saia Midi Plissada', marca: 'Aurora', categoria: 'Saias', colecao: 'Primavera 2026', descricao: 'Saia plissada com cós elástico e forro.', custo: 50, preco: 149.9, fornecedorId: 'f3', estoqueMinimo: 6, variacoes: gerarGrade(15, 'SMP', ['PP', 'P', 'M', 'G'], ['Preto', 'Verde-oliva'], 1, 4) }
  ];
  produtos.forEach((p, i) => { p.foto = ''; p.ativo = true; p.criadoEm = diasAtras(60 - i); p.ncm = ''; });
  // NCM próprio quando difere do padrão da categoria (os demais usam o da categoria)
  produtos.find((p) => p.id === 'p5').ncm = '6203.42.00';   // calça jeans MASCULINA (categoria usa a feminina)
  produtos.find((p) => p.id === 'p13').ncm = '6205.90.00';  // camisa de LINHO (categoria usa a de algodão)

  /* ---------- Clientes (5) ---------- */
  const clientes = [
    { id: 'c1', nome: 'Ana Beatriz Souza', documento: '123.456.789-09', telefone: '(11) 98765-4321', email: 'ana.souza@email.com', endereco: 'Rua das Flores, 120 — São Paulo/SP', criadoEm: diasAtras(90), limiteCredito: 1000 },
    { id: 'c2', nome: 'Carlos Eduardo Lima', documento: '987.654.321-00', telefone: '(11) 97654-3210', email: 'carlos.lima@email.com', endereco: 'Av. Paulista, 1500, ap. 82 — São Paulo/SP', criadoEm: diasAtras(75), limiteCredito: 500 },
    { id: 'c3', nome: 'Fernanda Oliveira', documento: '456.789.123-45', telefone: '(11) 96543-2109', email: 'fe.oliveira@email.com', endereco: 'Rua Augusta, 900 — São Paulo/SP', criadoEm: diasAtras(40) },
    { id: 'c4', nome: 'Juliana Martins', documento: '321.654.987-12', telefone: '(11) 95432-1098', email: 'ju.martins@email.com', endereco: 'Rua Oscar Freire, 300 — São Paulo/SP', criadoEm: diasAtras(22), limiteCredito: 800 },
    { id: 'c5', nome: 'Rafael Costa', documento: '654.321.987-33', telefone: '(11) 94321-0987', email: 'rafael.costa@email.com', endereco: 'Rua Haddock Lobo, 45 — São Paulo/SP', criadoEm: diasAtras(10) }
  ];

  /* ---------- Usuários do sistema ---------- */
  const usuarios = [
    { id: 'u1', nome: 'Mariana Alves', email: 'mariana@lojamodas.com.br', perfil: 'dono', ativo: true, comissao: 0 },
    { id: 'u2', nome: 'Lucas Pereira', email: 'lucas@lojamodas.com.br', perfil: 'vendedor', ativo: true, comissao: 3 },
    { id: 'u3', nome: 'Bianca Rocha', email: 'bianca@lojamodas.com.br', perfil: 'vendedor', ativo: false, comissao: 3 }
  ];

  /* ---------- Dados da loja ---------- */
  const loja = {
    nome: 'Loja Modas',
    razaoSocial: 'Loja Modas Comércio de Vestuário Ltda.',
    cnpj: '45.678.901/0001-75',
    inscricaoEstadual: '123.456.789.110',
    telefone: '(11) 3456-7890',
    email: 'contato@lojamodas.com.br',
    endereco: 'Rua dos Pinheiros, 1200 — Pinheiros, São Paulo/SP — 05422-001',
    logo: ''
  };

  /* ---------- Configuração fiscal (NFC-e) ----------
     Razão social, CNPJ e IE ficam em "loja" (usados em vários lugares);
     o restante dos dados exigidos na nota fica aqui. */
  const emUmAno = new Date();
  emUmAno.setMonth(emUmAno.getMonth() + 8);
  const fiscal = {
    inscricaoMunicipal: '1.234.567-8',
    regimeTributario: '1',            // 1 Simples Nacional · 2 Simples (excesso sublimite) · 3 Regime normal · 4 MEI
    cnae: '4781-4/00',                // Comércio varejista de artigos do vestuário e acessórios
    endereco: {
      cep: '05422-001',
      logradouro: 'Rua dos Pinheiros',
      numero: '1200',
      complemento: '',
      bairro: 'Pinheiros',
      municipio: 'São Paulo',
      codigoMunicipio: '3550308',     // código IBGE
      uf: 'SP'
    },
    nfce: {
      ambiente: 'homologacao',        // 'homologacao' (testes, sem valor fiscal) | 'producao'
      serie: 1,
      proximoNumero: 0,               // calculado abaixo, depois das notas
      cscId: '000001',
      csc: 'A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D',
      urlConsulta: 'www.nfce.fazenda.sp.gov.br/consulta',
      // Simulação: no sistema real o certificado e a senha ficam só no servidor
      certificado: { arquivo: 'certificado-loja-modas.pfx', titular: 'LOJA MODAS COMERCIO DE VESTUARIO LTDA', validade: emUmAno.toISOString().slice(0, 10) }
    },
    tributacao: {
      origem: '0',                    // 0 = Nacional
      cfop: '5102',                   // Venda de mercadoria adquirida de terceiros
      csosn: '102',                   // Simples Nacional sem permissão de crédito
      cst: '00',                      // usado no regime normal
      aliquotaTributos: 31.45,        // % aproximado (Lei 12.741/2012, tabela IBPT)
      informacoesComplementares: 'Trocas em até 30 dias mediante apresentação deste documento.'
    },
    // NCM sugerido por categoria (confirme com o contador)
    ncmPorCategoria: {
      Camisetas: '6109.10.00',
      'Calças': '6204.62.00',
      Vestidos: '6204.42.00',
      Moletons: '6110.20.00',
      Jaquetas: '6203.32.00',
      Camisas: '6205.20.00',
      Shorts: '6204.62.00',
      Saias: '6204.52.00'
    }
  };

  /* ---------- Vendas (20) ----------
     Formato compacto: [diasAtras, hora, minuto, clienteId|null, [[produtoIndex, variacaoIndex, qtd]], desconto R$, forma, parcelas, status, vendedorId] */
  const vendasBrutas = [
    [0, 9, 42, 'c1', [[0, 2, 2], [3, 1, 1]], 0, 'pix', 1, 'concluida', 'u2'],
    [0, 11, 15, null, [[9, 4, 1]], 0, 'credito', 2, 'concluida', 'u2'],
    [0, 14, 8, 'c4', [[6, 1, 1], [2, 3, 1]], 10, 'debito', 1, 'concluida', 'u1'],
    [1, 10, 30, 'c2', [[4, 2, 1], [0, 4, 1]], 0, 'credito', 3, 'concluida', 'u2'],
    [1, 16, 5, null, [[1, 1, 2]], 0, 'dinheiro', 1, 'concluida', 'u2'],
    [2, 13, 20, 'c3', [[7, 0, 1], [14, 2, 1]], 15, 'pix', 1, 'concluida', 'u1'],
    [2, 17, 45, null, [[10, 3, 1]], 0, 'debito', 1, 'concluida', 'u2'],
    [3, 11, 0, 'c5', [[11, 1, 1]], 0, 'credito', 4, 'concluida', 'u2'],
    [3, 15, 35, null, [[0, 7, 3]], 9.7, 'dinheiro', 1, 'concluida', 'u2'],
    [4, 10, 10, 'c1', [[8, 1, 1]], 0, 'credito', 5, 'devolvida', 'u1'],
    [4, 18, 22, null, [[12, 0, 1], [2, 0, 2]], 0, 'pix', 1, 'concluida', 'u2'],
    [5, 12, 40, 'c4', [[5, 3, 1]], 0, 'debito', 1, 'concluida', 'u2'],
    [6, 14, 55, null, [[3, 5, 1], [13, 1, 1]], 20, 'credito', 2, 'concluida', 'u1'],
    [6, 16, 18, 'c2', [[9, 0, 1], [0, 1, 1]], 0, 'pix', 1, 'concluida', 'u2'],
    [8, 11, 25, null, [[1, 4, 1]], 0, 'dinheiro', 1, 'cancelada', 'u2'],
    [9, 15, 12, 'c3', [[6, 4, 1], [14, 5, 1]], 0, 'credito', 3, 'concluida', 'u1'],
    [11, 10, 48, null, [[10, 0, 2]], 0, 'pix', 1, 'concluida', 'u2'],
    [13, 17, 30, 'c5', [[4, 6, 1]], 0, 'debito', 1, 'trocada', 'u2'],
    [16, 13, 5, null, [[7, 3, 1], [2, 6, 1]], 0, 'credito', 2, 'concluida', 'u2'],
    [20, 12, 15, 'c1', [[0, 5, 2], [12, 3, 1]], 0, 'pix', 1, 'concluida', 'u1']
  ];

  const vendas = [];
  const notas = [];
  const movimentacoes = [];

  // Percorre do mais antigo para o mais recente para numerar em ordem
  vendasBrutas.slice().reverse().forEach((linha, i) => {
    const [dias, h, m, clienteId, itensBrutos, desconto, forma, parcelas, status, vendedorId] = linha;
    const data = diasAtras(dias, h, m);
    const itens = itensBrutos.map(([pi, vi, qtd]) => {
      const p = produtos[pi];
      const v = p.variacoes[vi % p.variacoes.length];
      return { produtoId: p.id, sku: v.sku, nome: p.nome, tamanho: v.tamanho, cor: v.cor, qtd, preco: p.preco, custo: p.custo };
    });
    const subtotal = itens.reduce((s, it) => s + it.qtd * it.preco, 0);
    const total = Math.round((subtotal - desconto) * 100) / 100;
    const numero = 1001 + i;
    const venda = {
      id: 'v' + numero,
      numero,
      data,
      clienteId,
      vendedorId,
      itens,
      subtotal,
      desconto,
      total,
      // Resumo do pagamento (forma principal, valor recebido em dinheiro e troco)
      pagamento: {
        forma,
        parcelas,
        recebido: forma === 'dinheiro' ? Math.ceil(total / 50) * 50 : total,
        troco: forma === 'dinheiro' ? Math.ceil(total / 50) * 50 - total : 0
      },
      // Lista de pagamentos (permite dividir: parte Pix, parte cartão…)
      pagamentos: [{ forma, valor: total, parcelas }],
      // Vendas dos últimos 4 dias pertencem aos caixas de exemplo (cx0 = hoje)
      caixaId: dias <= 3 ? 'cx' + dias : null,
      status,
      notaId: null
    };

    // Nota fiscal: a maioria autorizada; as duas mais recentes ficam pendentes
    if (dias !== 0 || i % 2 === 0) {
      const numeroNota = 3200 + notas.length + 1;
      const nota = {
        id: 'n' + numeroNota,
        numero: numeroNota,
        serie: 1,
        vendaId: venda.id,
        clienteId,
        data,
        valor: total,
        status: status === 'cancelada' ? 'cancelada' : (dias === 0 ? 'pendente' : 'autorizada'),
        chave: '3526' + String(11 + (i % 12)).padStart(2, '0') + '45678901000175' + '65001' + String(numeroNota).padStart(9, '0') + '1' + String(10000000 + numeroNota * 7).slice(0, 8) + String(i % 10)
      };
      notas.push(nota);
      venda.notaId = nota.id;
    }

    vendas.push(venda);

    // Movimentação de saída por item vendido
    itens.forEach((it) => {
      movimentacoes.push({
        id: 'm' + (movimentacoes.length + 1),
        data,
        tipo: 'saida',
        produtoId: it.produtoId,
        sku: it.sku,
        quantidade: it.qtd,
        motivo: `Venda #${numero}`,
        usuarioId: vendedorId
      });
    });
  });

  // Entradas de mercadoria (compras de fornecedor) e ajustes de inventário
  [
    [28, 'p1', 0, 20, 'entrada', 'NF 45821 — Têxtil Vale'],
    [28, 'p10', 1, 12, 'entrada', 'NF 45821 — Têxtil Vale'],
    [25, 'p4', 2, 10, 'entrada', 'NF 9932 — Denim Brasil'],
    [25, 'p5', 0, 8, 'entrada', 'NF 9932 — Denim Brasil'],
    [21, 'p7', 1, 6, 'entrada', 'NF 1288 — Ateliê Aurora'],
    [18, 'p3', 2, -1, 'ajuste', 'Inventário: peça com defeito'],
    [12, 'p11', 0, 10, 'entrada', 'NF 46010 — Têxtil Vale'],
    [7, 'p15', 3, -2, 'ajuste', 'Inventário mensal'],
    [3, 'p2', 1, 8, 'entrada', 'NF 46133 — Têxtil Vale'],
    [1, 'p8', 2, 1, 'ajuste', 'Peça encontrada no depósito']
  ].forEach(([dias, produtoId, vi, qtd, tipo, motivo]) => {
    const p = produtos.find((x) => x.id === produtoId);
    movimentacoes.push({
      id: 'm' + (movimentacoes.length + 1),
      data: diasAtras(dias, 9, 15),
      tipo,
      produtoId,
      sku: p.variacoes[vi].sku,
      quantidade: qtd,
      motivo,
      usuarioId: 'u1'
    });
  });

  // Próxima NFC-e continua a numeração das notas de exemplo
  fiscal.nfce.proximoNumero = Math.max(...notas.map((n) => n.numero)) + 1;

  /* ---------- Exemplo de pagamento dividido: venda #1018 = Pix + débito ---------- */
  const vDividida = vendas.find((v) => v.numero === 1018);
  if (vDividida) {
    vDividida.pagamentos = [
      { forma: 'pix', valor: 100, parcelas: 1 },
      { forma: 'debito', valor: Math.round((vDividida.total - 100) * 100) / 100, parcelas: 1 }
    ];
    vDividida.pagamento = { forma: 'multiplo', parcelas: 1, recebido: vDividida.total, troco: 0 };
  }

  /* ---------- Trocas/devoluções de exemplo + vale-troca (créditos) ---------- */
  const creditos = [];
  vendas.filter((v) => v.status === 'devolvida' || v.status === 'trocada').forEach((v) => {
    const tipo = v.status === 'trocada' ? 'troca' : 'devolucao';
    const dataDev = new Date(new Date(v.data).getTime() + 26 * 3600 * 1000).toISOString();
    v.devolucao = {
      tipo,
      itens: v.itens.map((i) => ({ sku: i.sku, qtd: i.qtd })),
      motivo: tipo === 'troca' ? 'Tamanho não serviu' : 'Arrependimento',
      valor: v.subtotal,
      data: dataDev
    };
    if (tipo === 'troca') {
      const credito = {
        id: 'cr1',
        codigo: 'VT-7Q4K2M',
        clienteId: v.clienteId,
        valor: v.total,
        saldo: v.total,
        origemVendaId: v.id,
        criadoEm: dataDev,
        usos: []
      };
      creditos.push(credito);
      v.devolucao.creditoId = credito.id;
    }
  });

  /* ---------- Caixas: hoje aberto (cx0) e os 3 dias anteriores fechados ---------- */
  const caixas = [];
  for (let d = 3; d >= 0; d--) {
    const doDia = vendas.filter((v) => v.caixaId === 'cx' + d && v.status !== 'cancelada');
    const porForma = { dinheiro: 0, pix: 0, debito: 0, credito: 0 };
    doDia.forEach((v) => v.pagamentos.forEach((p) => { porForma[p.forma] = (porForma[p.forma] || 0) + p.valor; }));
    const caixa = {
      id: 'cx' + d,
      status: d === 0 ? 'aberto' : 'fechado',
      abertoEm: diasAtras(d, 8, 55),
      abertoPor: 'u2',
      valorInicial: 200,
      movimentos: d === 2 ? [{ id: 'mc1', tipo: 'sangria', valor: 150, motivo: 'Depósito no banco', data: diasAtras(d, 15, 0), usuarioId: 'u1' }] : [],
      fechadoEm: null,
      fechadoPor: null,
      fechamento: null
    };
    if (d > 0) {
      const sangrias = caixa.movimentos.reduce((s, m) => s + (m.tipo === 'sangria' ? m.valor : 0), 0);
      const esperado = { dinheiro: Math.round((200 + porForma.dinheiro - sangrias) * 100) / 100, pix: porForma.pix, debito: porForma.debito, credito: porForma.credito };
      // Um dos dias fechou com R$ 3,50 a menos na gaveta
      const contado = { ...esperado, dinheiro: Math.round((esperado.dinheiro - (d === 3 ? 3.5 : 0)) * 100) / 100 };
      caixa.status = 'fechado';
      caixa.fechadoEm = diasAtras(d, 19, 5);
      caixa.fechadoPor = d === 3 ? 'u2' : 'u1';
      caixa.fechamento = { esperado, contado, observacao: d === 3 ? 'Diferença de troco não identificada.' : '' };
    }
    caixas.push(caixa);
  }

  /* ---------- Entradas de mercadoria (notas de fornecedor lançadas em lote) ---------- */
  const entradas = [
    { id: 'en1', data: diasAtras(28, 9, 15), fornecedorId: 'f1', numeroNota: '45821', dataEmissao: diasAtras(29).slice(0, 10), observacao: '', totalPecas: 32, totalValor: 1160, usuarioId: 'u1',
      itens: [{ produtoId: 'p1', nome: 'Camiseta Básica Algodão', pecas: 20, custoUnitario: 22 }, { produtoId: 'p10', nome: 'Moletom Canguru Básico', pecas: 12, custoUnitario: 60 }] },
    { id: 'en2', data: diasAtras(25, 9, 15), fornecedorId: 'f2', numeroNota: '9932', dataEmissao: diasAtras(26).slice(0, 10), observacao: '', totalPecas: 18, totalValor: 1430, usuarioId: 'u1',
      itens: [{ produtoId: 'p4', nome: 'Calça Jeans Skinny', pecas: 10, custoUnitario: 75 }, { produtoId: 'p5', nome: 'Calça Jeans Reta Masculina', pecas: 8, custoUnitario: 85 }] }
  ];

  /* ---------- Regras de venda ---------- */
  const config = {
    limiteDescontoVendedor: 10   // % máximo de desconto manual que o vendedor dá sem a senha do dono
  };

  /* ---------- Promoções ----------
     tipo: 'percentual' (valor = % off) · 'preco' (valor = preço fixo) · 'leve-pague' (leve N pague M)
     escopo: { tipo: 'todos'|'categoria'|'colecao'|'produtos', valor } */
  const promocoes = [
    { id: 'pr1', nome: 'Semana do Moletom', tipo: 'percentual', valor: 20, escopo: { tipo: 'categoria', valor: 'Moletons' }, inicio: diasAtras(2).slice(0, 10), fim: diasAtras(-10).slice(0, 10), ativo: true },
    { id: 'pr2', nome: 'Leve 3 pague 2 em Camisetas', tipo: 'leve-pague', leve: 3, pague: 2, escopo: { tipo: 'categoria', valor: 'Camisetas' }, inicio: diasAtras(5).slice(0, 10), fim: diasAtras(-25).slice(0, 10), ativo: true },
    { id: 'pr3', nome: 'Jaqueta Jeans por R$ 199,90', tipo: 'preco', valor: 199.9, escopo: { tipo: 'produtos', valor: ['p12'] }, inicio: diasAtras(-3).slice(0, 10), fim: diasAtras(-17).slice(0, 10), ativo: true },
    { id: 'pr4', nome: 'Liquidação Inverno 2026', tipo: 'percentual', valor: 30, escopo: { tipo: 'colecao', valor: 'Inverno 2026' }, inicio: diasAtras(60).slice(0, 10), fim: diasAtras(30).slice(0, 10), ativo: true }
  ];

  /* ---------- Crediário: venda #1001 (Ana) em 3x, com 1ª parcela vencida ---------- */
  const contasReceber = [];
  const vCred = vendas.find((v) => v.numero === 1001);
  if (vCred) {
    vCred.pagamentos = [{ forma: 'crediario', valor: vCred.total, parcelas: 3 }];
    vCred.pagamento = { forma: 'crediario', parcelas: 3, recebido: vCred.total, troco: 0 };
    const base = Math.floor((vCred.total / 3) * 100) / 100;
    [0, 1, 2].forEach((i) => {
      contasReceber.push({
        id: 'cr-v1001-' + (i + 1), vendaId: vCred.id, clienteId: vCred.clienteId, parcela: i + 1, totalParcelas: 3,
        valor: i === 2 ? Math.round((vCred.total - base * 2) * 100) / 100 : base,
        vencimento: diasAtras(5 - 30 * i).slice(0, 10), valorPago: 0, pagamentos: [], status: 'aberto'
      });
    });
  }
  // Venda #1009 (Juliana) em 2x, 1ª parcela já paga
  const vCred2 = vendas.find((v) => v.numero === 1009);
  if (vCred2) {
    vCred2.pagamentos = [{ forma: 'crediario', valor: vCred2.total, parcelas: 2 }];
    vCred2.pagamento = { forma: 'crediario', parcelas: 2, recebido: vCred2.total, troco: 0 };
    const metade = Math.round((vCred2.total / 2) * 100) / 100;
    contasReceber.push(
      { id: 'cr-v1009-1', vendaId: vCred2.id, clienteId: vCred2.clienteId, parcela: 1, totalParcelas: 2, valor: metade, vencimento: diasAtras(1).slice(0, 10), valorPago: metade, pagamentos: [{ data: diasAtras(1, 16, 0), valor: metade, forma: 'pix', usuarioId: 'u2' }], status: 'pago' },
      { id: 'cr-v1009-2', vendaId: vCred2.id, clienteId: vCred2.clienteId, parcela: 2, totalParcelas: 2, valor: Math.round((vCred2.total - metade) * 100) / 100, vencimento: diasAtras(-29).slice(0, 10), valorPago: 0, pagamentos: [], status: 'aberto' }
    );
  }

  /* ---------- Contas a pagar (fornecedores e despesas da loja) ---------- */
  const contasPagar = [
    { id: 'cp1', descricao: 'NF 45821 — parcela 1/2', fornecedorId: 'f1', categoria: 'Fornecedores', documento: '45821-1', valor: 580, vencimento: diasAtras(28).slice(0, 10), status: 'pago', dataPagamento: diasAtras(28).slice(0, 10), formaPagamento: 'boleto', entradaId: 'en1' },
    { id: 'cp2', descricao: 'NF 45821 — parcela 2/2', fornecedorId: 'f1', categoria: 'Fornecedores', documento: '45821-2', valor: 580, vencimento: diasAtras(-2).slice(0, 10), status: 'aberto', dataPagamento: null, formaPagamento: null, entradaId: 'en1' },
    { id: 'cp3', descricao: 'NF 9932 — boleto único', fornecedorId: 'f2', categoria: 'Fornecedores', documento: '9932', valor: 1430, vencimento: diasAtras(4).slice(0, 10), status: 'aberto', dataPagamento: null, formaPagamento: null, entradaId: 'en2' },
    { id: 'cp4', descricao: 'Aluguel da loja', fornecedorId: null, categoria: 'Aluguel', documento: '', valor: 3500, vencimento: diasAtras(-12).slice(0, 10), status: 'aberto', dataPagamento: null, formaPagamento: null },
    { id: 'cp5', descricao: 'Energia elétrica', fornecedorId: null, categoria: 'Contas de consumo', documento: '', valor: 386.4, vencimento: diasAtras(6).slice(0, 10), status: 'pago', dataPagamento: diasAtras(7).slice(0, 10), formaPagamento: 'pix' }
  ];

  /* ---------- Exporta para o escopo global (lido SOMENTE por data.js) ---------- */
  window.MOCK_DATA = {
    loja,
    fiscal,
    usuarios,
    cores,
    tamanhos,
    categorias,
    produtos,
    clientes,
    fornecedores,
    vendas,
    notas,
    movimentacoes,
    creditos,
    caixas,
    entradas,
    config,
    promocoes,
    contasReceber,
    contasPagar,
    inventarios: []
  };
})();
