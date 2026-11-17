/* ==========================================================================
   login.js — Tela de entrada (logo, e-mail, senha, "Lembrar de mim")
   Contas e senhas são criadas/trocadas pelo suporte (ver suporte/nova-loja.html).
   Nuvem (Firebase): login real. Local: protótipo, qualquer senha entra.
   ========================================================================== */
App.aoIniciar(async () => {
  const nuvem = Data.modo === 'nuvem';
  const form = document.getElementById('form-login');
  const CHAVE_EMAIL = 'gestaoloja:lembrar-email';

  if (nuvem) {
    // Já está logado? Vai direto para o sistema
    const logado = await Data.pronto().catch(() => null);
    if (logado) { location.replace('pages/dashboard.html'); return; }
  } else {
    document.getElementById('aviso-prototipo').classList.remove('oculto');
  }

  // Lembrar de mim: e-mail já preenchido na próxima vez
  try {
    const salvo = localStorage.getItem(CHAVE_EMAIL);
    if (salvo) { form.email.value = salvo; form.senha.focus(); } else form.email.focus();
  } catch (e) { /* ignora */ }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!App.validarFormulario(form)) return;
    const botao = form.querySelector('button[type=submit]');
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    try {
      const lembrar = form.lembrar.checked;
      await Data.entrar(form.email.value, form.senha.value, lembrar);
      try { lembrar ? localStorage.setItem(CHAVE_EMAIL, form.email.value.trim()) : localStorage.removeItem(CHAVE_EMAIL); } catch (er) { /* ignora */ }
      location.href = 'pages/dashboard.html';
    } catch (erro) {
      const senhaErrada = /incorret/i.test(erro.message);
      App.toast(senhaErrada ? `${erro.message} Esqueceu a senha? Fale com o suporte.` : erro.message, 'erro', 7000);
      botao.disabled = false;
      botao.textContent = 'Entrar';
      form.senha.select();
    }
  });
});
