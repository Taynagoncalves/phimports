/* ==========================================================================
   configuracoes.js — Dados da loja (com logo), usuários (dono/vendedor)
   e utilidades do sistema
   ========================================================================== */
App.aoIniciar(async () => {
  /* ==================================================================
     ABAS (acessíveis: setas esquerda/direita trocam de aba)
     ================================================================== */
  const abas = [...document.querySelectorAll('[role=tab]')];
  function ativarAba(aba, focar = false) {
    abas.forEach((a) => {
      const ativa = a === aba;
      a.setAttribute('aria-selected', String(ativa));
      a.tabIndex = ativa ? 0 : -1;
      document.getElementById(a.getAttribute('aria-controls')).hidden = !ativa;
    });
    if (focar) aba.focus();
    history.replaceState(null, '', '#' + aba.id.replace('aba-', ''));
  }
  abas.forEach((a, i) => {
    a.addEventListener('click', () => ativarAba(a));
    a.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') ativarAba(abas[(i + 1) % abas.length], true);
      if (e.key === 'ArrowLeft') ativarAba(abas[(i - 1 + abas.length) % abas.length], true);
    });
  });
  const abaUrl = document.getElementById('aba-' + location.hash.slice(1));
  if (abaUrl) ativarAba(abaUrl);
  // Links internos do tipo "#fiscal" trocam de aba
  window.addEventListener('hashchange', () => {
    const aba = document.getElementById('aba-' + location.hash.slice(1));
    if (aba) ativarAba(aba, true);
  });

  /* ==================================================================
     DADOS DA LOJA
     ================================================================== */
  const form = document.getElementById('form-loja');
  const loja = await Data.obterLoja();
  let logo = loja.logo || '';
  let envioLogo = null;

  // Razão social, CNPJ e IE ficam na aba "Dados fiscais" (só com nota fiscal ligada)
  ['nome', 'telefone', 'email', 'endereco', 'instagram', 'site', 'mensagemRecibo'].forEach((c) => {
    form.elements[c].value = loja[c] || '';
  });

  const preview = document.getElementById('logo-preview');
  function mostrarLogo(src) {
    logo = src || '';
    preview.src = logo;
    preview.classList.toggle('oculto', !logo);
    document.getElementById('logo-placeholder').classList.toggle('oculto', !!logo);
    document.getElementById('btn-remover-logo').classList.toggle('oculto', !logo);
  }
  mostrarLogo(logo);

  document.getElementById('logo').addEventListener('change', (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) return App.toast('Escolha um arquivo de imagem.', 'erro');
    if (arquivo.size > 10 * 1024 * 1024) return App.toast('O logo deve ter no máximo 10 MB.', 'erro');
    App.comprimirImagem(arquivo, 400, true).then(mostrarLogo).catch(() => {});
    envioLogo = App.enviarImagem(arquivo, { maximo: 600, manterPng: true, subpasta: 'logo' })
      .then((url) => { logo = url; return url; })
      .catch((er) => { App.toast(er.message, 'erro', 7000); mostrarLogo(''); throw er; })
      .finally(() => { envioLogo = null; });
  });
  document.getElementById('btn-remover-logo').addEventListener('click', () => {
    document.getElementById('logo').value = '';
    mostrarLogo('');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!App.validarFormulario(form)) return;
    const dados = App.lerFormulario(form);
    delete dados[''];
    const nomeAnterior = loja.nome;
    if (envioLogo) { try { await envioLogo; } catch (er) { return; } }
    const salva = await Data.salvarLoja({ ...dados, logo });
    Object.assign(loja, salva);
    // Nome/logo atualizados na hora em toda a tela (menu, título, aba fiscal);
    // as outras páginas e abas leem o nome novo de Data.obterLoja().
    App.aplicarMarcaLoja(salva);
    App.toast(salva.nome !== nomeAnterior
      ? `Nome alterado para "${salva.nome}". Já vale para menu, notas fiscais, comprovantes e relatórios.`
      : 'Dados da loja salvos!', 'sucesso', 5000);
  });

  // Prévia ao vivo do nome enquanto digita
  form.elements.nome.addEventListener('input', () => {
    document.getElementById('previa-nome-loja').textContent = form.elements.nome.value.trim() || '—';
  });
  document.getElementById('previa-nome-loja').textContent = loja.nome;

  /* ==================================================================
     DADOS FISCAIS (o que aparece na NFC-e) — editável só pelo dono
     ================================================================== */
  const formFiscal = document.getElementById('form-fiscal');
  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

  const [fiscal, categorias, notas, usuarioLogado, produtosCadastrados] = await Promise.all([
    Data.obterConfigFiscal(), Data.listarCategorias(), Data.listarNotas(), Data.usuarioAtual(), Data.listarProdutos()
  ]);
  let ambiente = fiscal.nfce.ambiente || 'homologacao';
  let certificado = fiscal.nfce.certificado || null;
  let arquivoPendente = null; // certificado escolhido aguardando a senha
  let alterado = false;

  /* ---------- Preenche o formulário ---------- */
  App.preencherSelect(formFiscal.uf, UFS, { vazio: 'Selecione…' });
  const valores = {
    razaoSocial: fiscal.emitente.razaoSocial, cnpj: fiscal.emitente.cnpj, inscricaoEstadual: fiscal.emitente.inscricaoEstadual,
    inscricaoMunicipal: fiscal.inscricaoMunicipal, cnae: fiscal.cnae, regimeTributario: fiscal.regimeTributario,
    ...fiscal.endereco,
    serie: fiscal.nfce.serie, proximoNumero: fiscal.nfce.proximoNumero, cscId: fiscal.nfce.cscId, csc: fiscal.nfce.csc, urlConsulta: fiscal.nfce.urlConsulta,
    origem: fiscal.tributacao.origem, cfop: fiscal.tributacao.cfop, csosn: fiscal.tributacao.csosn, cst: fiscal.tributacao.cst,
    aliquotaTributos: String(fiscal.tributacao.aliquotaTributos ?? '').replace('.', ','),
    informacoesComplementares: fiscal.tributacao.informacoesComplementares
  };
  Object.entries(valores).forEach(([nome, valor]) => {
    const campo = formFiscal.elements[nome];
    if (campo && valor !== undefined && valor !== null) campo.value = valor;
  });

  // NCM por categoria
  document.getElementById('tabela-ncm').innerHTML = categorias.map((c) => `
    <tr>
      <td class="cel-principal negrito">${App.escapeHtml(c)}</td>
      <td data-label="NCM">
        <label class="sr-only" for="ncm-${App.escapeHtml(c)}">NCM de ${App.escapeHtml(c)}</label>
        <input class="input mono" id="ncm-${App.escapeHtml(c)}" data-ncm="${App.escapeHtml(c)}" data-mascara="ncm" inputmode="numeric" placeholder="0000.00.00" style="max-width:160px" value="${App.escapeHtml((fiscal.ncmPorCategoria || {})[c] || '')}">
      </td>
    </tr>`).join('');
  App.aplicarMascaras(formFiscal);

  /* ---------- Permissão: só o dono edita ---------- */
  const podeEditar = usuarioLogado.perfil === 'dono';
  if (!podeEditar) {
    document.getElementById('campos-fiscais').disabled = true;
    document.getElementById('barra-fiscal').classList.add('oculto');
    document.getElementById('aviso-permissao').innerHTML = `<div class="alerta"><i data-lucide="lock"></i><span>Somente o <strong>dono</strong> da loja pode alterar os dados fiscais. Você está vendo em modo leitura.</span></div>`;
  }

  /* ---------- Regime → CSOSN (Simples/MEI) ou CST (regime normal) ---------- */
  function atualizarRegime() {
    const normal = formFiscal.regimeTributario.value === '3';
    document.getElementById('campo-csosn').classList.toggle('oculto', normal);
    document.getElementById('campo-cst').classList.toggle('oculto', !normal);
  }
  formFiscal.regimeTributario.addEventListener('change', atualizarRegime);

  /* ---------- Ambiente: homologação × produção ---------- */
  function desenharAmbiente() {
    formFiscal.querySelectorAll('[data-ambiente]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.ambiente === ambiente)));
    document.getElementById('ajuda-ambiente').textContent = ambiente === 'producao'
      ? 'As notas emitidas têm valor fiscal e são enviadas à SEFAZ.'
      : 'Use para testar: as notas saem com "SEM VALOR FISCAL" e não contam para o fisco.';
  }
  formFiscal.querySelectorAll('[data-ambiente]').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.ambiente === ambiente) return;
    if (b.dataset.ambiente === 'producao') {
      const ok = await App.confirmar({
        titulo: 'Emitir em produção?',
        mensagem: 'A partir de agora as NFC-e terão valor fiscal. Antes, confira os dados com seu contador e teste a emissão em homologação.',
        textoConfirmar: 'Mudar para produção'
      });
      if (!ok) return;
    }
    ambiente = b.dataset.ambiente;
    marcarAlterado();
    desenharAmbiente();
  }));

  /* ---------- Mostrar/ocultar CSC ---------- */
  document.getElementById('btn-ver-csc').addEventListener('click', (e) => {
    const visivel = formFiscal.csc.type === 'text';
    formFiscal.csc.type = visivel ? 'password' : 'text';
    e.currentTarget.setAttribute('aria-pressed', String(!visivel));
    e.currentTarget.setAttribute('aria-label', visivel ? 'Mostrar código CSC' : 'Ocultar código CSC');
  });

  /* ---------- CNPJ: valida enquanto digita ---------- */
  function validarCnpjCampo() {
    const ajuda = document.getElementById('f-cnpj-ajuda');
    const digitos = formFiscal.cnpj.value.replace(/\D/g, '');
    const ok = App.cnpjValido(formFiscal.cnpj.value);
    formFiscal.cnpj.classList.toggle('invalido', digitos.length === 14 && !ok);
    ajuda.textContent = digitos.length < 14 ? '' : ok ? '✓ CNPJ válido' : 'CNPJ inválido — confira os dígitos';
    ajuda.style.color = digitos.length < 14 ? '' : ok ? 'var(--cor-sucesso)' : 'var(--cor-perigo)';
  }
  formFiscal.cnpj.addEventListener('input', validarCnpjCampo);

  /* ---------- Busca de CEP (ViaCEP) ---------- */
  document.getElementById('btn-buscar-cep').addEventListener('click', async (e) => {
    const cep = formFiscal.cep.value.replace(/\D/g, '');
    if (cep.length !== 8) return App.toast('Digite um CEP com 8 dígitos.', 'erro');
    const botao = e.currentTarget;
    botao.disabled = true;
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await resp.json();
      if (d.erro) throw new Error('CEP não encontrado.');
      formFiscal.logradouro.value = d.logradouro || formFiscal.logradouro.value;
      formFiscal.bairro.value = d.bairro || formFiscal.bairro.value;
      formFiscal.municipio.value = d.localidade || '';
      formFiscal.codigoMunicipio.value = d.ibge || '';
      formFiscal.uf.value = d.uf || '';
      marcarAlterado();
      formFiscal.numero.focus();
      App.toast('Endereço preenchido pelo CEP.');
    } catch (erro) {
      App.toast(erro.message === 'CEP não encontrado.' ? erro.message : 'Não foi possível buscar o CEP. Preencha manualmente.', 'erro');
    } finally {
      botao.disabled = false;
    }
  });

  /* ---------- Certificado digital A1 ---------- */
  function desenharCertificado() {
    const info = document.getElementById('certificado-info');
    if (!certificado) {
      info.innerHTML = `<span class="stat-icone" style="background:var(--cor-perigo-suave);color:var(--cor-perigo)"><i data-lucide="shield-alert"></i></span>
        <div style="flex:1"><div class="negrito texto-sm">Nenhum certificado enviado</div><div class="texto-xs texto-3">Sem ele não é possível assinar e emitir a NFC-e.</div></div>`;
    } else {
      const hoje = App.dataInput();
      const dias = Math.round((new Date(certificado.validade + 'T12:00:00') - new Date(hoje + 'T12:00:00')) / 86400000);
      const badge = dias < 0 ? '<span class="badge badge-perigo">Vencido</span>'
        : dias <= 30 ? `<span class="badge badge-alerta">Vence em ${dias} dia(s)</span>`
          : '<span class="badge badge-sucesso">Válido</span>';
      info.innerHTML = `<span class="stat-icone" style="background:var(--cor-sucesso-suave);color:var(--cor-sucesso)"><i data-lucide="shield-check"></i></span>
        <div style="flex:1;min-width:180px">
          <div class="negrito texto-sm">${App.escapeHtml(certificado.titular)}</div>
          <div class="texto-xs texto-3">${App.escapeHtml(certificado.arquivo)} · válido até ${App.formatarData(certificado.validade)}</div>
        </div>
        ${badge}
        ${podeEditar ? '<button type="button" class="btn-icone perigo" id="btn-remover-cert" aria-label="Remover certificado" title="Remover certificado"><i data-lucide="trash-2"></i></button>' : ''}`;
      document.getElementById('btn-remover-cert')?.addEventListener('click', async () => {
        if (!(await App.confirmar({ titulo: 'Remover certificado?', mensagem: 'Sem certificado a loja não consegue emitir NFC-e.', textoConfirmar: 'Remover', perigo: true }))) return;
        certificado = null;
        marcarAlterado();
        desenharCertificado();
      });
    }
    App.icones();
    atualizarChecklist();
  }

  // Simulação: no sistema real o arquivo + senha vão para o servidor, que lê titular e validade
  function processarCertificado() {
    const senha = document.getElementById('f-cert-senha').value;
    if (!arquivoPendente) return;
    if (!senha) { App.toast('Informe a senha do certificado para concluir o envio.', 'aviso'); document.getElementById('f-cert-senha').focus(); return; }
    const validade = new Date();
    validade.setFullYear(validade.getFullYear() + 1);
    certificado = {
      arquivo: arquivoPendente.name,
      titular: (formFiscal.razaoSocial.value || 'Titular do certificado').toUpperCase(),
      validade: App.dataInput(validade)
    };
    arquivoPendente = null;
    document.getElementById('f-cert-senha').value = ''; // a senha não é guardada
    marcarAlterado();
    desenharCertificado();
    App.toast('Certificado carregado. Salve para confirmar.');
  }
  document.getElementById('f-certificado').addEventListener('change', (e) => {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;
    if (!/\.(pfx|p12)$/i.test(arquivo.name)) return App.toast('Envie o certificado A1 no formato .pfx ou .p12.', 'erro');
    arquivoPendente = arquivo;
    processarCertificado();
  });
  document.getElementById('f-cert-senha').addEventListener('change', processarCertificado);

  /* ---------- Contador das informações complementares ---------- */
  const atualizarContador = () => { document.getElementById('contador-info').textContent = formFiscal.informacoesComplementares.value.length; };
  formFiscal.informacoesComplementares.addEventListener('input', atualizarContador);

  /* ---------- Coleta os dados da tela ---------- */
  function coletarFiscal() {
    const d = App.lerFormulario(formFiscal);
    const ncm = {};
    formFiscal.querySelectorAll('[data-ncm]').forEach((i) => { ncm[i.dataset.ncm] = i.value.trim(); });
    return {
      emitente: { razaoSocial: d.razaoSocial, cnpj: d.cnpj, inscricaoEstadual: d.inscricaoEstadual },
      inscricaoMunicipal: d.inscricaoMunicipal,
      cnae: d.cnae,
      regimeTributario: d.regimeTributario,
      endereco: { cep: d.cep, logradouro: d.logradouro, numero: d.numero, complemento: d.complemento, bairro: d.bairro, municipio: d.municipio, codigoMunicipio: d.codigoMunicipio, uf: d.uf },
      nfce: { ambiente, serie: Number(d.serie) || 1, proximoNumero: Number(d.proximoNumero) || 1, cscId: d.cscId, csc: d.csc, urlConsulta: d.urlConsulta, certificado },
      tributacao: { origem: d.origem, cfop: d.cfop, csosn: d.csosn, cst: d.cst, aliquotaTributos: App.lerNumero(d.aliquotaTributos), informacoesComplementares: d.informacoesComplementares },
      ncmPorCategoria: ncm
    };
  }

  /* ---------- Checklist "Pronto para emitir?" (ao vivo) ---------- */
  function atualizarChecklist() {
    const c = coletarFiscal();
    const e = c.endereco, n = c.nfce;
    const hoje = App.dataInput();
    const ultimoUsado = Math.max(0, ...notas.filter((x) => Number(x.serie) === n.serie).map((x) => x.numero));
    const itens = [
      { ok: c.emitente.razaoSocial && App.cnpjValido(c.emitente.cnpj) && c.emitente.inscricaoEstadual && c.regimeTributario, texto: 'Emitente', det: 'Razão social, CNPJ válido, IE e regime' },
      { ok: e.logradouro && e.numero && e.bairro && e.municipio && /^\d{7}$/.test(e.codigoMunicipio) && e.uf && e.cep.replace(/\D/g, '').length === 8, texto: 'Endereço', det: 'Completo, com código IBGE e CEP' },
      { ok: n.serie >= 1 && n.proximoNumero > ultimoUsado, texto: 'Série e numeração', det: ultimoUsado ? `Último nº usado na série ${n.serie}: ${ultimoUsado}` : 'Nenhuma nota nesta série ainda' },
      { ok: n.cscId && n.csc, texto: 'CSC', det: 'ID e código gerados na SEFAZ' },
      { ok: certificado && certificado.validade >= hoje, texto: 'Certificado digital A1', det: certificado ? `Válido até ${App.formatarData(certificado.validade)}` : 'Não enviado' },
      (() => {
        // Produto sem NCM próprio e cuja categoria (na tela) também está sem NCM
        const oito = (v) => String(v || '').replace(/\D/g, '').length === 8;
        const semNcm = produtosCadastrados.filter((p) => !oito(p.ncm) && !oito(c.ncmPorCategoria[p.categoria]));
        return {
          ok: semNcm.length === 0,
          texto: 'NCM dos produtos',
          link: semNcm.length ? { href: 'produtos.html?ncm=sem', texto: 'Ver produtos sem NCM' } : null,
          det: semNcm.length
            ? `${semNcm.length} sem NCM: ${semNcm.slice(0, 3).map((p) => p.nome).join(', ')}${semNcm.length > 3 ? '…' : ''}`
            : 'Todos os produtos têm NCM (próprio ou da categoria)'
        };
      })()
    ];
    const prontos = itens.filter((i) => i.ok).length;
    document.getElementById('checklist-fiscal').innerHTML = `
      ${itens.map((i) => `
        <li class="lista-item">
          <span style="color:${i.ok ? 'var(--cor-sucesso)' : 'var(--cor-perigo)'}"><i data-lucide="${i.ok ? 'circle-check' : 'circle-x'}"></i></span>
          <div class="info"><div class="titulo">${i.texto}</div><div class="sub">${App.escapeHtml(i.det)}</div>${i.link ? `<a href="${i.link.href}" class="texto-xs">${i.link.texto}</a>` : ''}</div>
        </li>`).join('')}
      <li class="lista-item">
        <span style="color:var(--cor-${ambiente === 'producao' ? 'sucesso' : 'alerta'})"><i data-lucide="${ambiente === 'producao' ? 'badge-check' : 'flask-conical'}"></i></span>
        <div class="info"><div class="titulo">Ambiente: ${ambiente === 'producao' ? 'Produção' : 'Homologação'}</div><div class="sub">${ambiente === 'producao' ? 'Notas com valor fiscal' : 'Notas de teste, sem valor fiscal'}</div></div>
      </li>
      <li class="lista-item" style="background:var(--cor-fundo)">
        <div class="info"><div class="titulo">${prontos === itens.length ? '✓ Tudo pronto para emitir' : `${prontos} de ${itens.length} itens completos`}</div>
        ${alterado ? '<div class="sub" style="color:var(--cor-alerta)">Há alterações não salvas</div>' : ''}</div>
      </li>`;
    App.icones();
  }

  function marcarAlterado() {
    alterado = true;
    atualizarChecklist();
  }
  formFiscal.addEventListener('input', App.debounce(marcarAlterado, 200));
  formFiscal.addEventListener('change', marcarAlterado);

  /* ---------- Prévia do cupom com os dados da tela ---------- */
  document.getElementById('btn-previa').addEventListener('click', () => {
    const c = coletarFiscal();
    const lojaPrevia = { ...loja, razaoSocial: c.emitente.razaoSocial, cnpj: c.emitente.cnpj, inscricaoEstadual: c.emitente.inscricaoEstadual };
    const vendaExemplo = {
      numero: 0, data: new Date().toISOString(), clienteNome: 'Consumidor final', subtotal: 249.8, desconto: 0, total: 249.8,
      pagamento: { forma: 'pix', parcelas: 1, recebido: 249.8, troco: 0 },
      itens: [
        { sku: 'CBA-M-PRE', nome: 'Camiseta Básica Algodão', tamanho: 'M', cor: 'Preto', qtd: 1, preco: 59.9 },
        { sku: 'CJS-38-AZU', nome: 'Calça Jeans Skinny', tamanho: '38', cor: 'Azul-escuro', qtd: 1, preco: 189.9 }
      ]
    };
    const notaExemplo = {
      numero: c.nfce.proximoNumero, serie: c.nfce.serie, data: new Date().toISOString(), status: 'autorizada', ambiente,
      chave: '35' + '0'.repeat(42), clienteDocumento: '', clienteNome: 'Consumidor final'
    };
    App.abrirModal({
      titulo: 'Prévia do cupom NFC-e',
      corpo: `<p class="texto-sm mb-4">Exemplo com os dados preenchidos na tela (mesmo os não salvos).</p>
        <div style="background:var(--cor-superficie-2);padding:24px 8px;border-radius:12px">${App.htmlCupom({ loja: lojaPrevia, fiscal: { ...c, tributacao: c.tributacao }, venda: vendaExemplo, nota: notaExemplo })}</div>`,
      acoes: [{ texto: 'Fechar' }]
    });
  });

  /* ---------- Salvar ---------- */
  formFiscal.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!podeEditar) return;
    if (!App.validarFormulario(formFiscal)) return;
    const c = coletarFiscal();
    if (!App.cnpjValido(c.emitente.cnpj)) { formFiscal.cnpj.focus(); return App.toast('CNPJ inválido. Confira os dígitos.', 'erro'); }
    if (c.endereco.cep.replace(/\D/g, '').length !== 8) { formFiscal.cep.focus(); return App.toast('CEP deve ter 8 dígitos.', 'erro'); }
    if (!/^\d{7}$/.test(c.endereco.codigoMunicipio)) { formFiscal.codigoMunicipio.focus(); return App.toast('O código IBGE do município tem 7 dígitos.', 'erro'); }
    const ncmInvalido = Object.entries(c.ncmPorCategoria).find(([, v]) => v && v.replace(/\D/g, '').length !== 8);
    if (ncmInvalido) return App.toast(`NCM de "${ncmInvalido[0]}" deve ter 8 dígitos.`, 'erro');

    const botao = formFiscal.querySelector('button[type=submit]');
    botao.disabled = true;
    try {
      await Data.salvarConfigFiscal(c);
      alterado = false;
      atualizarChecklist();
      const pendencias = await Data.verificarConfigFiscal();
      App.toast(pendencias.length ? `Dados salvos. Ainda falta: ${pendencias.join(', ')}.` : 'Dados fiscais salvos. Tudo pronto para emitir NFC-e!', pendencias.length ? 'aviso' : 'sucesso', 5000);
    } catch (erro) {
      App.toast(erro.message, 'erro');
    } finally {
      botao.disabled = false;
    }
  });

  atualizarRegime();
  desenharAmbiente();
  validarCnpjCampo();
  atualizarContador();
  desenharCertificado(); // também desenha o checklist

  /* ==================================================================
     USUÁRIOS
     ================================================================== */
  const corpoUsuarios = document.getElementById('lista-usuarios');
  const PERFIS = { dono: 'Dono(a)', vendedor: 'Vendedor(a)' };

  async function carregarUsuarios() {
    const [usuarios, atual] = await Promise.all([Data.listarUsuarios(), Data.usuarioAtual()]);
    corpoUsuarios.innerHTML = usuarios.map((u) => `
      <tr>
        <td class="cel-principal">
          <div class="produto-cel">
            <div class="avatar">${App.escapeHtml(App.iniciais(u.nome))}</div>
            <div><div class="titulo">${App.escapeHtml(u.nome)} ${u.id === atual.id ? '<span class="tag">você</span>' : ''}</div><div class="sub">${App.escapeHtml(u.email)}</div></div>
          </div>
        </td>
        <td data-label="Perfil"><span class="badge badge-neutro ${u.perfil === 'dono' ? 'badge-info' : ''}">${PERFIS[u.perfil]}</span></td>
        <td data-label="Comissão" class="num">${Number(u.comissao || 0) ? String(u.comissao).replace('.', ',') + '%' : '<span class="texto-3">—</span>'}</td>
        <td data-label="Status">${App.badgeStatus(u.ativo ? 'ativo' : 'inativo')}</td>
        <td class="col-acoes">
          <button type="button" class="btn-icone" data-editar="${u.id}" aria-label="Editar ${App.escapeHtml(u.nome)}" title="Editar"><i data-lucide="pencil"></i></button>
          ${u.id !== atual.id ? `<button type="button" class="btn-icone perigo" data-excluir="${u.id}" aria-label="Excluir ${App.escapeHtml(u.nome)}" title="Excluir"><i data-lucide="trash-2"></i></button>` : ''}
        </td>
      </tr>`).join('');

    corpoUsuarios.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirUsuario(usuarios.find((u) => u.id === b.dataset.editar))));
    corpoUsuarios.querySelectorAll('[data-excluir]').forEach((b) => b.addEventListener('click', async () => {
      const u = usuarios.find((x) => x.id === b.dataset.excluir);
      if (!(await App.confirmar({ titulo: 'Excluir usuário?', mensagem: `${u.nome} perderá o acesso ao sistema.`, textoConfirmar: 'Excluir', perigo: true }))) return;
      try {
        await Data.excluirUsuario(u.id);
        App.toast('Usuário excluído.');
        carregarUsuarios();
      } catch (erro) { App.toast(erro.message, 'erro'); }
    }));
    App.icones();
  }

  function abrirUsuario(usuario = null) {
    const u = usuario || { perfil: 'vendedor', ativo: true };
    const { el, fechar } = App.abrirModal({
      titulo: usuario ? 'Editar usuário' : 'Novo usuário',
      corpo: `
        <form id="form-usuario" class="flex-col gap-4" novalidate>
          <div class="campo">
            <label for="u-nome">Nome <span class="obrigatorio" aria-hidden="true">*</span></label>
            <input class="input" id="u-nome" name="nome" required value="${App.escapeHtml(u.nome || '')}">
          </div>
          <div class="campo">
            <label for="u-email">E-mail de acesso <span class="obrigatorio" aria-hidden="true">*</span></label>
            <input class="input" id="u-email" name="email" type="email" required autocomplete="off" value="${App.escapeHtml(u.email || '')}" ${usuario && Data.modo === 'nuvem' ? 'readonly' : ''}>
            ${usuario && Data.modo === 'nuvem' ? '<span class="ajuda">O e-mail de acesso não muda depois de criado. Para trocar, crie outro usuário.</span>' : ''}
          </div>
          ${!usuario ? `<div class="campo">
            <label for="u-senha">Senha <span class="obrigatorio" aria-hidden="true">*</span></label>
            <div class="flex gap-2">
              <input class="input" id="u-senha" name="senha" type="password" required minlength="6" autocomplete="new-password" style="flex:1">
              <button type="button" class="btn btn-secundario" id="u-ver-senha" title="Mostrar senha" aria-label="Mostrar senha"><i data-lucide="eye"></i></button>
            </div>
            <span class="ajuda">Mínimo de 6 caracteres. A pessoa entra no sistema com este e-mail e esta senha.</span>
          </div>` : ''}
          <div class="campo">
            <label for="u-perfil">Perfil</label>
            <select class="select" id="u-perfil" name="perfil">
              <option value="vendedor" ${u.perfil === 'vendedor' ? 'selected' : ''}>Vendedor(a) — frente de caixa, vendas, trocas e clientes</option>
              <option value="dono" ${u.perfil === 'dono' ? 'selected' : ''}>Dono(a) — acesso total</option>
            </select>
          </div>
          <div class="campo">
            <label for="u-comissao">Comissão sobre as vendas (%)</label>
            <input class="input" id="u-comissao" name="comissao" type="number" min="0" max="100" step="0.5" value="${u.comissao || 0}">
            <span class="ajuda">Calculada sobre o faturamento líquido (sem trocas e devoluções) em Relatórios.</span>
          </div>
          <label class="checkbox"><input type="checkbox" name="ativo" ${u.ativo ? 'checked' : ''}> Usuário ativo</label>
        </form>`,
      acoes: [
        { texto: 'Cancelar' },
        { texto: 'Salvar', classe: 'btn-primario', icone: 'check', aoClicar: async (_, botao) => {
          const f = el.querySelector('#form-usuario');
          if (!App.validarFormulario(f)) return;
          if (!usuario && f.senha.value.length < 6) { f.senha.focus(); return App.toast('A senha precisa ter pelo menos 6 caracteres.', 'erro'); }
          botao.disabled = true;
          try {
            await Data.salvarUsuario({ id: usuario?.id, nome: f.nome.value.trim(), email: f.email.value.trim(), perfil: f.perfil.value, ativo: f.ativo.checked, comissao: Math.max(0, Math.min(100, Number(f.comissao.value) || 0)), ...(usuario ? {} : { senha: f.senha.value }) });
            fechar();
            App.toast(usuario ? 'Usuário atualizado!' : `Usuário criado! ${f.email.value.trim()} já pode entrar com a senha cadastrada.`, 'sucesso', 6000);
            carregarUsuarios();
          } catch (erro) {
            App.toast(erro.message, 'erro');
            botao.disabled = false;
          }
        } }
      ]
    });
  }

  // Olhinho para mostrar/ocultar a senha no cadastro de usuário
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#u-ver-senha');
    if (!b) return;
    const campo = document.getElementById('u-senha');
    campo.type = campo.type === 'password' ? 'text' : 'password';
    b.innerHTML = `<i data-lucide="${campo.type === 'password' ? 'eye' : 'eye-off'}"></i>`;
    App.icones();
  });
  document.getElementById('btn-novo-usuario').addEventListener('click', () => abrirUsuario());
  await carregarUsuarios();

  /* ---------- Regras de venda: limite de desconto do vendedor ---------- */
  const formRegras = document.getElementById('form-regras');
  const regras = await Data.obterRegrasVenda();
  formRegras.querySelector('#limite-desconto').value = regras.limiteDescontoVendedor;
  formRegras.querySelector('#pontos-ativos').checked = !!regras.pontosAtivos;
  formRegras.querySelector('#pontos-por-real').value = regras.pontosPorReal;
  formRegras.querySelector('#valor-por-ponto').value = regras.valorPorPonto;
  formRegras.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await Data.salvarRegrasVenda({
        limiteDescontoVendedor: Number(formRegras.querySelector('#limite-desconto').value),
        pontosAtivos: formRegras.querySelector('#pontos-ativos').checked,
        pontosPorReal: Number(formRegras.querySelector('#pontos-por-real').value),
        valorPorPonto: Number(formRegras.querySelector('#valor-por-ponto').value)
      });
      App.toast(r.pontosAtivos ? `Fidelidade ativa: ${r.pontosPorReal} ponto(s) por real e ${App.formatarMoeda(r.valorPorPonto)} por ponto.` : `Limite de desconto do vendedor: ${r.limiteDescontoVendedor}%.`);
    } catch (erro) { App.toast(erro.message, 'erro'); }
  });

  /* ==================================================================
     APARÊNCIA — cor principal (vale para a loja toda) e tema (por aparelho)
     ================================================================== */
  const CORES_PRONTAS = [
    ['Preto', '#18181B'], ['Índigo', '#4F46E5'], ['Violeta', '#7C3AED'], ['Rosa', '#DB2777'], ['Vermelho', '#DC2626'],
    ['Vinho', '#9F1239'], ['Terracota', '#C2410C'], ['Âmbar', '#D97706'], ['Oliva', '#65A30D'],
    ['Verde', '#059669'], ['Petróleo', '#0F766E'], ['Azul', '#2563EB'], ['Grafite', '#27272A']
  ];
  const paleta = document.getElementById('paleta-cores');
  const picker = document.getElementById('cor-picker');
  const inputHex = document.getElementById('cor-hex');
  const ajudaHex = document.getElementById('cor-ajuda');
  const hexValido = (v) => /^#[0-9a-f]{6}$/i.test(v);
  let corSalva = ((await Data.obterLoja()).corPrimaria || App.COR_PADRAO).toUpperCase();
  let corEscolhida = corSalva;

  paleta.innerHTML = CORES_PRONTAS.map(([nome, hex]) => `
    <button type="button" class="cor-opcao" role="radio" aria-checked="false" data-cor="${hex}" title="${nome}" aria-label="${nome}" style="--opcao:${hex}">
      <i data-lucide="check"></i>
    </button>`).join('');
  App.icones();

  function desenharPrevia(el, vars) {
    Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
    el.innerHTML = `
      <div class="previa-topo">
        <span class="previa-logo">LM</span>
        <strong>${el.dataset.tema === 'escuro' ? 'Modo escuro' : 'Modo claro'}</strong>
      </div>
      <div class="nav-link ativo" style="pointer-events:none">${'<i data-lucide="layout-dashboard"></i>'}<span>Dashboard</span></div>
      <div class="flex gap-2 mt-4" style="flex-wrap:wrap">
        <span class="btn btn-primario" style="pointer-events:none"><i data-lucide="plus"></i>Nova venda</span>
        <span class="btn btn-secundario" style="pointer-events:none">Cancelar</span>
      </div>
      <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
        <span class="chip" aria-checked="true" style="pointer-events:none">M</span>
        <span class="chip" style="pointer-events:none">G</span>
        <a href="#" tabindex="-1" onclick="return false">Ver relatórios →</a>
      </div>
      <div class="previa-barras" aria-hidden="true">
        ${[45, 70, 35, 60, 52, 95].map((h, i) => `<span style="height:${h}%;background:${i === 5 ? 'var(--cor-destaque)' : 'var(--cor-destaque-suave)'}"></span>`).join('')}
      </div>`;
  }

  function escolherCor(hex, { origem } = {}) {
    if (!hexValido(hex)) return;
    corEscolhida = hex.toUpperCase();
    paleta.querySelectorAll('.cor-opcao').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.cor === corEscolhida)));
    if (origem !== 'picker') picker.value = corEscolhida.toLowerCase();
    if (origem !== 'hex') inputHex.value = corEscolhida;
    inputHex.classList.remove('invalido');
    ajudaHex.textContent = corEscolhida === corSalva ? 'Cor em uso no sistema.' : 'Prévia — clique em "Salvar cor" para aplicar.';
    const v = App.variaveisCor(corEscolhida);
    desenharPrevia(document.getElementById('previa-claro'), v.claro);
    desenharPrevia(document.getElementById('previa-escuro'), v.escuro);
    App.icones();
  }

  paleta.addEventListener('click', (e) => {
    const b = e.target.closest('.cor-opcao');
    if (b) escolherCor(b.dataset.cor);
  });
  picker.addEventListener('input', () => escolherCor(picker.value, { origem: 'picker' }));
  inputHex.addEventListener('input', () => {
    let v = inputHex.value.trim();
    if (v && !v.startsWith('#')) v = '#' + v;
    if (hexValido(v)) escolherCor(v, { origem: 'hex' });
    else { inputHex.classList.toggle('invalido', v.length >= 7); ajudaHex.textContent = 'Use o formato #RRGGBB, ex.: #E11D48'; }
  });

  async function salvarCor(hex) {
    try {
      await Data.salvarLoja({ corPrimaria: hex });
      corSalva = hex;
      App.aplicarCorPrimaria(hex);
      escolherCor(hex);
      App.toast('Cor principal atualizada em todo o sistema.', 'sucesso');
    } catch (erro) { App.toast(erro.message, 'erro'); }
  }
  document.getElementById('btn-salvar-cor').addEventListener('click', () => salvarCor(corEscolhida));
  document.getElementById('btn-cor-padrao').addEventListener('click', () => salvarCor(App.COR_PADRAO));

  // Tema: claro, escuro ou automático (guardado só neste navegador)
  const opcoesTema = [...document.querySelectorAll('[data-tema-opcao]')];
  function temaGuardado() { try { return localStorage.getItem('gestaoloja:tema') || 'auto'; } catch (e) { return 'auto'; } }
  function marcarTema() {
    const atual = temaGuardado();
    opcoesTema.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.temaOpcao === atual)));
  }
  opcoesTema.forEach((b) => b.addEventListener('click', () => {
    const op = b.dataset.temaOpcao;
    try { op === 'auto' ? localStorage.removeItem('gestaoloja:tema') : localStorage.setItem('gestaoloja:tema', op); } catch (e) { /* ignora */ }
    document.documentElement.dataset.tema = op === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro') : op;
    marcarTema();
  }));
  marcarTema();
  escolherCor(corSalva);

  /* ==================================================================
     SISTEMA
     ================================================================== */
  // Vendas e recibo: impressão automática e emissão de nota fiscal
  {
    const lojaAtual = await Data.obterLoja();
    const chkAuto = document.getElementById('cfg-recibo-auto');
    const chkNota = document.getElementById('cfg-emitir-nota');
    const ajuda = document.getElementById('cfg-nota-ajuda');
    const chkCatalogo = document.getElementById('cfg-catalogo-publico');
    const linkCatalogo = document.getElementById('link-catalogo');
    chkCatalogo.checked = !!lojaAtual.catalogoPublico;
    const mostrarLinkCatalogo = () => {
      linkCatalogo.innerHTML = chkCatalogo.checked && lojaAtual.id
        ? `<a href="${new URL(`../catalogo.html?loja=${encodeURIComponent(lojaAtual.id)}`, location.href).href}" target="_blank" rel="noopener">Abrir catálogo público</a> · compartilhe este link com clientes.`
        : chkCatalogo.checked ? 'Publique o sistema na nuvem para gerar o link público.' : '';
    };
    mostrarLinkCatalogo();
    chkCatalogo.addEventListener('change', async () => {
      try {
        await Data.salvarLoja({ catalogoPublico: chkCatalogo.checked });
        mostrarLinkCatalogo();
        App.toast(chkCatalogo.checked ? 'Catálogo publicado. Os produtos ativos e a disponibilidade estão visíveis publicamente.' : 'Catálogo despublicado.');
      } catch (e) { App.toast(e.message, 'erro'); chkCatalogo.checked = !chkCatalogo.checked; mostrarLinkCatalogo(); }
    });
    chkAuto.checked = !!lojaAtual.imprimirReciboAuto;
    const chkCaixa = document.getElementById('cfg-controlar-caixa');
    chkCaixa.checked = !!lojaAtual.controlarCaixa;
    chkCaixa.addEventListener('change', async () => {
      try {
        await Data.salvarLoja({ controlarCaixa: chkCaixa.checked });
        App.toast(chkCaixa.checked ? 'Controle de caixa ligado: o menu "Caixa" volta e é preciso abrir o caixa para vender. Atualizando…' : 'Controle de caixa desligado: vende direto. Atualizando…');
        setTimeout(() => location.reload(), 1200);
      } catch (e) { App.toast(e.message, 'erro'); chkCaixa.checked = !chkCaixa.checked; }
    });
    chkNota.checked = !!lojaAtual.emitirNota;
    const textoAjuda = () => {
      ajuda.textContent = chkNota.checked
        ? 'Nota fiscal ligada: preencha a aba "Dados fiscais" (precisa de CNPJ e inscrição estadual).'
        : 'Sem nota fiscal: o menu "Notas fiscais", o botão "Emitir nota" e os avisos de NCM ficam escondidos. Ligue quando a loja tiver CNPJ.';
    };
    textoAjuda();
    chkAuto.addEventListener('change', async () => {
      try {
        await Data.salvarLoja({ imprimirReciboAuto: chkAuto.checked });
        App.toast(chkAuto.checked ? 'O recibo vai abrir para impressão ao finalizar cada venda.' : 'Impressão automática do recibo desligada.');
      } catch (e) { App.toast(e.message, 'erro'); chkAuto.checked = !chkAuto.checked; }
    });
    chkNota.addEventListener('change', async () => {
      try {
        await Data.salvarLoja({ emitirNota: chkNota.checked });
        textoAjuda();
        App.toast(chkNota.checked ? 'Nota fiscal ligada. Atualizando…' : 'Nota fiscal desligada: só recibo. Atualizando…');
        setTimeout(() => location.reload(), 900); // menu e telas se ajustam
      } catch (e) { App.toast(e.message, 'erro'); chkNota.checked = !chkNota.checked; }
    });
  }
  if (Data.modo === 'nuvem') document.getElementById('btn-resetar').closest('.card').remove();
  else document.getElementById('btn-resetar').addEventListener('click', async () => {
    const ok = await App.confirmar({ titulo: 'Restaurar dados de exemplo?', mensagem: 'Todas as alterações feitas neste navegador (produtos, vendas, clientes…) serão descartadas.', textoConfirmar: 'Restaurar', perigo: true });
    if (!ok) return;
    await Data.resetarDados();
    App.toast('Dados restaurados. Recarregando…');
    setTimeout(() => location.reload(), 800);
  });
});
