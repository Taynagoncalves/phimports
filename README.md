# Gestão de Loja de Roupas

O sistema agora também pode ser instalado como aplicativo (PWA), publicar um catálogo online, calcular e resgatar pontos de fidelidade e sugerir reposição de estoque. A tela de Relatórios já contém o relatório de estoque parado.

No celular, use **Adicionar à tela inicial** no navegador. No computador, use **Instalar aplicativo** na barra de endereço ou no menu do navegador. A instalação exige o site publicado em HTTPS.

Em **Configurações → Usuários → Regras de venda**, o dono ativa a fidelidade, define pontos por real gasto e o valor de desconto de cada ponto. Clientes cadastrados acumulam pontos ao comprar; no PDV, seus pontos podem compor o pagamento. Cancelar a venda reverte o saldo.

Em **Configurações → Sistema**, o dono pode publicar o catálogo. O link público mostra produtos ativos, preços, fotos e disponibilidade por tamanho/cor; o cliente monta uma lista e envia o pedido à loja por WhatsApp. O catálogo não expõe custos.

Em **Estoque → Sugestão de compra**, a reposição usa as vendas dos últimos 60 dias e calcula quantidade para 30 dias de cobertura. O relatório é uma estimativa para apoiar o pedido, considerando conferência de pedidos em aberto e sazonalidade.

Na nuvem, o login carrega primeiro os ajustes da loja; as coleções são abertas conforme a tela. Dashboard, caixa, PDV e sugestão de compra limitam vendas ao intervalo recente necessário. Histórico de vendas e relatórios consultam o período selecionado.

Sistema de gestão para loja de roupas em HTML, CSS e JavaScript puro, com login e banco de dados no Firebase (veja "Banco de dados na nuvem"). Todo acesso a dados passa por `js/data.js`; sem configuração do Firebase, roda como protótipo com os dados de exemplo de `js/mock-data.js`.

## Como rodar
1. Abra a pasta no VS Code.
2. Instale a extensão **Live Server** e clique em **Go Live** (ou botão direito em `index.html` → *Open with Live Server*).
3. Faça login com qualquer senha.

Também funciona abrindo `index.html` direto no navegador. É preciso internet para carregar a fonte Inter, o Lucide e o Chart.js.

As alterações ficam salvas no `localStorage` do navegador. Para voltar aos dados de exemplo: **Configurações → Sistema → Restaurar dados de exemplo**.

**Exportar PDF** está disponível em **Relatórios**, **Vendas** e **Estoque**. Cada PDF respeita os filtros aplicados na tela. A montagem comum (cabeçalho da loja, indicadores, tabelas, rodapé com páginas) fica em `js/pdf.js`, que usa jsPDF e AutoTable. Em Relatórios também há **Exportar CSV**.

Em **Configurações → Dados fiscais**, o dono informa o que sai na NFC-e: emitente, endereço, série/numeração, CSC, certificado A1, tributação e NCM por categoria. O sistema só emite nota quando o checklist "Pronto para emitir?" estiver completo.

## Operação da loja
- **Frente de caixa** (`pdv.html`): visual de caixa de loja. Campo "quantidade ×" + código de barras, visor do último item, lista estilo cupom e visor do total. Atalhos: F2 consultar produto, F3 quantidade, F4 cliente, F8 desconto, Del remover item, F9 finalizar.
- **Produtos** (`produtos.html`): abas por categoria com contagem, filtros com etiquetas removíveis, ordenação e duas visões (lista ou cartões, fica lembrada).
- **Etiquetas** (`etiquetas.html`): em 3 passos — escolher produtos (busca, categoria ou leitor), conferir quantidades na grade tamanho × cor, escolher modelo e imprimir.
- **Clientes** (`clientes.html`): indicadores (ativos, crediário, vales), grupos (crediário vencido/em aberto, com vale, sumidos 60+ dias, nunca compraram), ordenação, WhatsApp e ficha do cliente com as últimas compras.
- **Estoque** (`estoque.html`): aba **Posição atual** com cada produto agrupado por categoria e a grade tamanho × cor (zerados em vermelho, 1–2 peças em amarelo); aba **Movimentações** com o histórico.
- **Caixa** (`caixa.html`): abertura com troco, sangria/reforço, dinheiro esperado na gaveta e fechamento com conferência (com contagem de cédulas). O PDV só vende com o caixa aberto.
- **Pagamento dividido** no PDV (ex.: parte Pix, parte cartão). Só o dinheiro gera troco.
- **Vale-troca**: a troca gera um vale com código e saldo, que é usado no PDV como forma de pagamento. O saldo aparece em Clientes.
- **Cancelar venda** (só o dono): devolve as peças ao estoque, devolve o saldo do vale, cancela a NFC-e e lança a saída do dinheiro no caixa.
- **Etiquetas** (`etiquetas.html`): código de barras EAN-13, em rolo térmico 40×25 mm ou folha A4 Pimaco A4256.
- **Entrada de nota em lote** (`entrada.html`): grade tamanho × cor por produto ou importação do XML da NF-e do fornecedor. Para testar, use `exemplos/nfe-fornecedor-exemplo.xml`.
- **Limite de desconto** (Configurações → Usuários → Regras de venda): acima do limite, o vendedor precisa do e-mail e da senha do dono no PDV.
- **Comissão** (% em cada usuário): aparece em Relatórios e no PDF, sobre o faturamento líquido.
- **Promoções** (`promocoes.html`): % de desconto, preço fixo ou "leve X pague Y", por categoria, coleção ou produtos, com período. O PDV aplica sozinho.
- **Inventário** (`inventario.html`): contagem com o leitor de código de barras, sobras e faltas, e ajuste do estoque de uma vez.
- **Crediário e Financeiro** (`financeiro.html`): venda a prazo para clientes com limite de crédito, parcelas recebidas no Caixa, contas a pagar (a entrada de nota pode gerar os boletos).
- **Permissões**: o vendedor vende, opera o caixa, faz trocas, cadastra clientes e consulta produtos/estoque. Custos, relatórios, cancelamentos, entradas, fornecedores e configurações são só do dono. As regras ficam em `data.js` (no Firebase, nas Security Rules).

## Visual
Visual limpo: fundo branco, cinzas frios, índigo como cor de destaque e fonte *Inter*.
- **Menu recolhível:** no computador, o botão ao lado do nome da loja deixa o menu só com ícones (fica salvo).
- **Modo escuro:** botão de lua/sol na barra do topo. A escolha fica salva; sem escolha, segue o sistema.
- **Atalho Ctrl+K:** vai direto para a busca.
- **Cor principal:** Configurações → Aparência (cores prontas ou qualquer cor). O sistema gera a versão do modo escuro sozinho; o padrão continua nas variáveis de `css/style.css`. Os PDFs usam sempre as cores claras, porque o papel é branco.

## Estrutura
- `css/style.css`: variáveis (cores, fontes, espaçamentos), reset e base
- `css/components.css`: botões, inputs, badges, cards, tabelas, modais, toasts, cupom
- `css/layout.css`: sidebar, topbar, grids, responsividade, PDV
- `js/app.js`: menu, topbar, formatadores pt-BR, toast, modal, paginação, máscaras, cupom/impressão
- `js/data.js`: **única** camada de dados (trocar pelo Firebase)
- `js/mock-data.js`: dados de exemplo
- `js/cadastro.js`: tela genérica de cadastro, usada por clientes e fornecedores
- `js/<página>.js`: lógica de cada tela

## Banco de dados na nuvem (Firebase)
O sistema funciona em dois modos, escolhidos sozinhos:
- **Local** (`js/firebase-config.js` vazio): protótipo com dados de exemplo guardados no navegador.
- **Nuvem** (`js/firebase-config.js` preenchido): login de verdade (Firebase Authentication) e dados no Firestore, sincronizados em tempo real entre computadores e celulares, com cache para continuar funcionando se a internet cair.

### Configurar
1. No [console do Firebase](https://console.firebase.google.com), crie o projeto, ative **Authentication → E-mail/senha** e crie o **Firestore** (região `southamerica-east1`).
2. Em **Configurações do projeto → Seus apps → Web**, copie o `firebaseConfig` para `js/firebase-config.js`.
3. Em **Firestore → Regras**, cole o conteúdo de `firestore.rules` e publique.
4. **Lojas e senhas são do suporte:** abra `suporte/nova-loja.html` pelo Live Server (no seu computador) para criar a loja de uma cliente (conta da dona + loja na nuvem) ou mandar o e-mail de troca de senha. Essa pasta **não vai para o site publicado**. A tela de entrada da cliente tem só e-mail, senha e "Lembrar de mim". Quem cria vira o **dono**. Vendedoras são convidadas em **Configurações → Usuários** (recebem um e-mail para criar a senha).

### Estrutura no Firestore
- `acessos/{uid}` — liga cada login à loja e ao perfil (dono/vendedor).
- `lojas/{lojaId}/ajustes/{loja|fiscal|config|cores|tamanhos|categorias}`
- `lojas/{lojaId}/{produtos|vendas|clientes|caixas|…}/{id}` — um documento por registro.

As regras de negócio continuam em `js/data.js`: as funções alteram os dados em memória e `persistir()` envia ao Firestore só o que mudou.

### Publicar o site
**Render (Static Site, grátis):** New → Static Site → repositório `phimports`, branch `main`.
- Build Command: `mkdir -p dist && cp -r index.html catalogo.html manifest.webmanifest service-worker.js css js img pages dist/`
- Publish Directory: `dist`

(O build copia só o sistema, sem a pasta `suporte/`.)

**Ou Firebase Hosting:**
```
npm install -g firebase-tools
firebase login
firebase use --add      (escolha o projeto)
firebase deploy
```
