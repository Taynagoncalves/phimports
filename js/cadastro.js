/* ==========================================================================
   cadastro.js — Tela genérica de cadastro (lista + formulário em modal)
   Usada por clientes.js e fornecedores.js para não duplicar código.

   Cadastro.iniciar({
     singular, plural, generoFeminino?, icone,
     listar(busca), salvar(dados), excluir(id),
     camposExtras: [{ nome, rotulo, placeholder, tipo }],
     colunas: [{ titulo, classe, render(item, extra) }],
     carregarExtra: async () => objeto usado pelas colunas
     // Opcionais (usados em Clientes):
     indicadores(todos, extra) → HTML dos cartões do topo (#indicadores)
     segmentos: [{ id, rotulo, filtro(item, extra) }] → chips com contagem (#segmentos)
     ordenacoes: [{ id, rotulo, comparar(a, b, extra) }] → select (#ordem)
     subtitulo(item, extra) → linha abaixo do nome
     acoesExtras(item, extra) → botões antes de "Editar"
     aoAbrir(item, extra, { editar }) → ficha ao clicar na linha
   })
   ========================================================================== */
window.Cadastro = {
  iniciar(cfg) {
    App.aoIniciar(async () => {
      const POR_PAGINA = 8;
      let pagina = 1;
      let registros = [];   // resultado da busca
      let visiveis = [];    // depois do segmento e da ordenação
      let extra = {};
      let segmento = '';
      const elSegmentos = document.getElementById('segmentos');
      const elOrdem = document.getElementById('ordem');
      if (elOrdem && cfg.ordenacoes) {
        elOrdem.innerHTML = cfg.ordenacoes.map((o) => `<option value="${o.id}">${o.rotulo}</option>`).join('');
        elOrdem.addEventListener('change', () => { pagina = 1; desenhar(); });
      }

      const inputBusca = document.getElementById('busca');
      const cabecalho = document.getElementById('cabecalho');
      const corpo = document.getElementById('lista');
      const novo = cfg.generoFeminino ? 'Nova' : 'Novo';
      // Permissão de excluir (ex.: vendedor não exclui clientes)
      const podeExcluir = cfg.acaoExcluir ? App.pode(cfg.acaoExcluir) : true;

      // Cabeçalho da tabela a partir da configuração
      cabecalho.innerHTML = `<tr>
        <th>${cfg.singular}</th>
        ${cfg.colunas.map((c) => `<th class="${c.classe || ''}">${c.titulo}</th>`).join('')}
        <th class="col-acoes"><span class="sr-only">Ações</span></th>
      </tr>`;

      async function carregar() {
        [registros, extra] = await Promise.all([cfg.listar(inputBusca.value), cfg.carregarExtra ? cfg.carregarExtra() : {}]);
        if (cfg.indicadores && document.getElementById('indicadores')) {
          const todos = inputBusca.value ? await cfg.listar('') : registros;
          document.getElementById('indicadores').innerHTML = cfg.indicadores(todos, extra);
        }
        desenhar();
      }

      function desenharSegmentos() {
        if (!elSegmentos || !cfg.segmentos) return;
        const opcoes = [{ id: '', rotulo: 'Todos', filtro: () => true }, ...cfg.segmentos];
        elSegmentos.innerHTML = opcoes.map((o) => `
          <button type="button" class="chip" role="radio" data-segmento="${o.id}" aria-checked="${o.id === segmento}">
            ${o.ponto ? `<span class="ponto-status st-${o.ponto}"></span>` : ''}${o.rotulo}
            <span class="chip-contagem">${registros.filter((r) => o.filtro(r, extra)).length}</span>
          </button>`).join('');
        elSegmentos.querySelectorAll('[data-segmento]').forEach((b) => b.addEventListener('click', () => {
          segmento = b.dataset.segmento;
          pagina = 1;
          desenhar();
        }));
      }

      function desenhar() {
        const seg = (cfg.segmentos || []).find((o) => o.id === segmento);
        visiveis = seg ? registros.filter((r) => seg.filtro(r, extra)) : registros.slice();
        const ord = elOrdem && cfg.ordenacoes ? cfg.ordenacoes.find((o) => o.id === elOrdem.value) : null;
        if (ord) visiveis.sort((a, b) => ord.comparar(a, b, extra));
        desenharSegmentos();
        document.getElementById('contador').textContent = `${visiveis.length} ${visiveis.length === 1 ? cfg.singular.toLowerCase() : cfg.plural.toLowerCase()}`;
        const colspan = cfg.colunas.length + 2;

        if (!visiveis.length) {
          corpo.innerHTML = `<tr><td colspan="${colspan}">${inputBusca.value || segmento
            ? App.estadoVazio({ icone: 'search-x', titulo: `Nenhum ${cfg.singular.toLowerCase()} encontrado`, texto: 'Tente buscar por outro nome, documento ou telefone.' })
            : App.estadoVazio({ icone: cfg.icone, titulo: `Nenhum ${cfg.singular.toLowerCase()} cadastrado`, texto: `Cadastre o primeiro ${cfg.singular.toLowerCase()} para começar.`, acao: `<button type="button" class="btn btn-primario" data-novo>${novo} ${cfg.singular.toLowerCase()}</button>` })
          }</td></tr>`;
          corpo.querySelector('[data-novo]')?.addEventListener('click', () => abrirFormulario());
          document.getElementById('paginacao').innerHTML = '';
          App.icones();
          return;
        }

        const pag = App.paginar(visiveis, pagina, POR_PAGINA);
        pagina = pag.pagina;
        corpo.innerHTML = pag.itens.map((r) => `
          <tr class="${cfg.aoAbrir ? 'clicavel' : ''}" data-id="${r.id}">
            <td class="cel-principal">
              <div class="produto-cel">
                <div class="avatar" style="${corAvatar(r.nome)}">${App.escapeHtml(App.iniciais(r.nome))}</div>
                <div style="min-width:0">
                  <div class="titulo">${App.escapeHtml(r.nome)}</div>
                  <div class="sub">${cfg.subtitulo ? cfg.subtitulo(r, extra) : App.escapeHtml(r.email || 'Sem e-mail')}</div>
                </div>
              </div>
            </td>
            ${cfg.colunas.map((c) => `<td data-label="${c.titulo}" class="${c.classe || ''}">${c.render(r, extra)}</td>`).join('')}
            <td class="col-acoes">
              ${cfg.acoesExtras ? cfg.acoesExtras(r, extra) : ''}
              <button type="button" class="btn-icone" data-editar="${r.id}" aria-label="Editar ${App.escapeHtml(r.nome)}" title="Editar"><i data-lucide="pencil"></i></button>
              ${podeExcluir ? `<button type="button" class="btn-icone perigo" data-excluir="${r.id}" aria-label="Excluir ${App.escapeHtml(r.nome)}" title="Excluir"><i data-lucide="trash-2"></i></button>` : ''}
            </td>
          </tr>`).join('');

        corpo.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirFormulario(registros.find((r) => r.id === b.dataset.editar))));
        corpo.querySelectorAll('[data-excluir]').forEach((b) => b.addEventListener('click', async () => {
          const r = registros.find((x) => x.id === b.dataset.excluir);
          const ok = await App.confirmar({ titulo: `Excluir ${cfg.singular.toLowerCase()}?`, mensagem: `"${r.nome}" será removido(a) do cadastro.`, textoConfirmar: 'Excluir', perigo: true });
          if (!ok) return;
          await cfg.excluir(r.id);
          App.toast(`${cfg.singular} excluído(a).`);
          carregar();
        }));

        // Ficha ao clicar na linha (fora dos botões e links)
        if (cfg.aoAbrir) corpo.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', (e) => {
          if (e.target.closest('button, a')) return;
          const r = registros.find((x) => x.id === tr.dataset.id);
          cfg.aoAbrir(r, extra, { editar: () => abrirFormulario(r) });
        }));

        App.renderPaginacao(document.getElementById('paginacao'), {
          total: visiveis.length, pagina, porPagina: POR_PAGINA,
          aoMudar: (n) => { pagina = n; desenhar(); }
        });
        App.icones();
      }

      /** Cor suave e estável para o avatar (a partir do nome) */
      function corAvatar(nome) {
        const tons = [[238, 240, 255, 55, 48, 163], [236, 253, 243, 6, 118, 71], [255, 250, 235, 181, 71, 8], [255, 241, 243, 192, 16, 72], [239, 248, 255, 23, 92, 211], [245, 243, 255, 109, 40, 217]];
        const h = [...String(nome)].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7) % tons.length;
        const t = tons[h];
        return document.documentElement.dataset.tema === 'escuro' ? '' : `background:rgb(${t[0]},${t[1]},${t[2]});color:rgb(${t[3]},${t[4]},${t[5]})`;
      }

      /* ---------- Formulário em modal ---------- */
      function abrirFormulario(registro = null) {
        const r = registro || {};
        const v = (campo) => App.escapeHtml(r[campo] || '');
        const extras = (cfg.camposExtras || []).map((c) => `
          <div class="campo ${c.largo ? 'col-span-2' : ''}">
            <label for="cad-${c.nome}">${c.rotulo}</label>
            <input class="input" id="cad-${c.nome}" name="${c.nome}" type="${c.tipo || 'text'}" ${c.tipo === 'number' ? 'min="0" step="0.01"' : ''} placeholder="${c.placeholder || ''}" value="${v(c.nome)}" ${c.soDono && !(App.usuario && App.usuario.perfil === 'dono') ? 'readonly title="Só o dono altera"' : ''}>
            ${c.soDono && !(App.usuario && App.usuario.perfil === 'dono') ? '<span class="ajuda">Só o dono da loja altera este campo.</span>' : ''}
          </div>`).join('');

        const { el, fechar } = App.abrirModal({
          titulo: registro ? `Editar ${cfg.singular.toLowerCase()}` : `${novo} ${cfg.singular.toLowerCase()}`,
          tamanho: 'lg',
          corpo: `
            <form id="form-cadastro" class="form-grid" novalidate>
              <input type="hidden" name="registroId" value="${v('id')}">
              <div class="campo col-span-2">
                <label for="cad-nome">Nome ${cfg.rotuloNome ? `/ ${cfg.rotuloNome}` : ''} <span class="obrigatorio" aria-hidden="true">*</span></label>
                <input class="input" id="cad-nome" name="nome" required autocomplete="off" value="${v('nome')}">
              </div>
              <div class="campo">
                <label for="cad-documento">CPF / CNPJ</label>
                <input class="input" id="cad-documento" name="documento" inputmode="numeric" data-mascara="documento" placeholder="000.000.000-00" value="${v('documento')}">
              </div>
              <div class="campo">
                <label for="cad-telefone">Telefone</label>
                <input class="input" id="cad-telefone" name="telefone" type="tel" inputmode="tel" data-mascara="telefone" placeholder="(00) 00000-0000" value="${v('telefone')}">
              </div>
              <div class="campo">
                <label for="cad-email">E-mail</label>
                <input class="input" id="cad-email" name="email" type="email" placeholder="nome@email.com" value="${v('email')}">
              </div>
              ${extras}
              <div class="campo col-span-2">
                <label for="cad-endereco">Endereço</label>
                <input class="input" id="cad-endereco" name="endereco" placeholder="Rua, número — bairro, cidade/UF" value="${v('endereco')}">
              </div>
            </form>`,
          acoes: [
            { texto: 'Cancelar' },
            { texto: 'Salvar', classe: 'btn-primario', icone: 'check', aoClicar: salvar }
          ]
        });

        const f = el.querySelector('#form-cadastro');
        f.addEventListener('submit', (e) => { e.preventDefault(); salvar(null, el.querySelector('.modal-rodape .btn-primario')); });

        async function salvar(_, botao) {
          if (!App.validarFormulario(f)) return;
          const dados = App.lerFormulario(f);
          if (dados.email && !/^\S+@\S+\.\S+$/.test(dados.email)) {
            f.email.classList.add('invalido');
            f.email.focus();
            return App.toast('E-mail inválido.', 'erro');
          }
          const doc = dados.documento.replace(/\D/g, '');
          if (doc && doc.length !== 11 && doc.length !== 14) {
            f.documento.classList.add('invalido');
            f.documento.focus();
            return App.toast('CPF deve ter 11 dígitos e CNPJ 14.', 'erro');
          }
          dados.id = dados.registroId || undefined;
          delete dados.registroId;
          botao.disabled = true;
          try {
            await cfg.salvar(dados);
            fechar();
            App.toast(registro ? `${cfg.singular} atualizado(a)!` : `${cfg.singular} cadastrado(a)!`);
            carregar();
          } catch (erro) {
            App.toast(erro.message, 'erro');
            botao.disabled = false;
          }
        }
      }

      /* ---------- Eventos ---------- */
      document.getElementById('btn-novo').addEventListener('click', () => abrirFormulario());
      inputBusca.addEventListener('input', App.debounce(() => { pagina = 1; carregar(); }, 250));
      await carregar();
    });
  }
};
