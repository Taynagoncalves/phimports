/* ==========================================================================
   fornecedores.js — Configuração da tela de fornecedores (usa cadastro.js)
   ========================================================================== */
Cadastro.iniciar({
  singular: 'Fornecedor',
  plural: 'Fornecedores',
  icone: 'truck',
  rotuloNome: 'Razão social',
  listar: Data.listarFornecedores,
  salvar: Data.salvarFornecedor,
  excluir: Data.excluirFornecedor,

  // Conta quantos produtos cada fornecedor fornece
  carregarExtra: async () => {
    const produtos = await Data.listarProdutos();
    return produtos.reduce((mapa, p) => {
      if (p.fornecedorId) mapa[p.fornecedorId] = (mapa[p.fornecedorId] || 0) + 1;
      return mapa;
    }, {});
  },

  camposExtras: [
    { nome: 'contato', rotulo: 'Pessoa de contato', placeholder: 'Nome do representante' }
  ],

  colunas: [
    { titulo: 'CNPJ', render: (f) => `<span class="mono">${App.escapeHtml(f.documento || '—')}</span>` },
    { titulo: 'Contato', render: (f) => App.escapeHtml(f.contato || '—') },
    { titulo: 'Telefone', render: (f) => `<span class="nowrap">${App.escapeHtml(f.telefone || '—')}</span>` },
    { titulo: 'Produtos', classe: 'num', render: (f, extra) => `<span class="tag">${extra[f.id] || 0}</span>` }
  ]
});
