/* ==========================================================================
   login.js — Tela de entrada
   Nuvem (Firebase): login real, recuperação de senha e primeiro acesso
   (cria a conta do dono e a loja). Local: protótipo, qualquer senha entra.
   Nome e logo da loja são aplicados pelo app.js (data-nome-loja / data-logo-loja).
   ========================================================================== */
App.aoIniciar(async () => {
  const nuvem = Data.modo === 'nuvem';
  const form = document.getElementById('form-login');

  if (nuvem) {
    // Já está logado? Vai direto para o sistema
    const logado = await Data.pronto().catch(() => null);
    if (logado) { location.replace('pages/dashboard.html'); return; }
    form.email.value = '';
    form.senha.value = '';
    document.getElementById('aviso-prototipo').classList.add('oculto');
    document.getElementById('primeiro-acesso').classList.remove('oculto');
  }

  /* ---------- Esqueci minha senha ---------- */
  document.getElementById('esqueci').addEventListener('click', async (e) => {
    e.preventDefault();
    if (!nuvem) return App.toast('Enviamos um link de recuperação para o seu e-mail (simulação).', 'sucesso');
    const email = form.email.value.trim();
    if (!email) { form.email.focus(); return App.toast('Digite seu e-mail acima e clique de novo em "Esqueci minha senha".', 'aviso'); }
    try {
      await Data.recuperarSenha(email);
      App.toast(`Se houver uma conta com ${email}, enviamos um link para criar uma senha nova. Veja também a caixa de spam.`, 'sucesso', 8000);
    } catch (erro) { App.toast(erro.message, 'erro'); }
  });

  /* ---------- Entrar ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!App.validarFormulario(form)) return;
    const botao = form.querySelector('button[type=submit]');
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    try {
      await Data.entrar(form.email.value, form.senha.value);
      location.href = 'pages/dashboard.html';
    } catch (erro) {
      App.toast(erro.message, 'erro', 6000);
      botao.disabled = false;
      botao.textContent = 'Entrar';
      form.senha.select();
    }
  });

  /* ---------- Primeiro acesso: criar a loja ---------- */
  document.getElementById('link-criar-loja')?.addEventListener('click', (e) => {
    e.preventDefault();
    const { el, fechar } = App.abrirModal({
      titulo: 'Criar a conta da loja',
      corpo: `
        <p class="texto-sm mb-4">Você será o <strong>dono</strong> da loja. Depois, em Configurações → Usuários, dá para convidar as vendedoras.</p>
        <form id="form-criar" class="form-grid" novalidate>
          <div class="campo col-span-2">
            <label for="c-loja">Nome da loja <span class="obrigatorio">*</span></label>
            <input class="input" id="c-loja" required maxlength="60" autocomplete="organization">
          </div>
          <div class="campo col-span-2">
            <label for="c-nome">Seu nome <span class="obrigatorio">*</span></label>
            <input class="input" id="c-nome" required autocomplete="name">
          </div>
          <div class="campo">
            <label for="c-email">E-mail <span class="obrigatorio">*</span></label>
            <input class="input" id="c-email" type="email" required autocomplete="email">
          </div>
          <div class="campo">
            <label for="c-senha">Senha (mín. 6) <span class="obrigatorio">*</span></label>
            <input class="input" id="c-senha" type="password" required minlength="6" autocomplete="new-password">
          </div>
          <label class="checkbox col-span-2"><input type="checkbox" id="c-exemplo"> Começar com produtos e vendas de exemplo (para testar)</label>
        </form>`,
      acoes: [
        { texto: 'Cancelar' },
        { texto: 'Criar loja', classe: 'btn-primario', icone: 'store', aoClicar: criar }
      ]
    });
    setTimeout(() => el.querySelector('#c-loja').focus(), 50);
    el.querySelector('#form-criar').addEventListener('submit', (ev) => { ev.preventDefault(); criar(null, el.querySelector('.modal-rodape .btn-primario')); });

    async function criar(_, botao) {
      const f = el.querySelector('#form-criar');
      if (!App.validarFormulario(f)) return;
      const senha = f.querySelector('#c-senha').value;
      if (senha.length < 6) return App.toast('A senha precisa ter pelo menos 6 caracteres.', 'erro');
      botao.disabled = true;
      botao.textContent = 'Criando…';
      try {
        await Data.criarLoja({
          nomeLoja: f.querySelector('#c-loja').value.trim(),
          nome: f.querySelector('#c-nome').value.trim(),
          email: f.querySelector('#c-email').value.trim(),
          senha,
          exemplo: f.querySelector('#c-exemplo').checked
        });
        fechar();
        App.toast('Loja criada! Abrindo o sistema…', 'sucesso');
        setTimeout(() => { location.href = 'pages/dashboard.html'; }, 700);
      } catch (erro) {
        App.toast(erro.message, 'erro', 7000);
        botao.disabled = false;
        botao.textContent = 'Criar loja';
      }
    }
  });
});
