/* ==========================================================================
   firebase-config.js — Configuração do projeto Firebase
   Console do Firebase → Configurações do projeto → Seus apps → Web → firebaseConfig

   Preenchido  → modo NUVEM: login real e dados no Firestore.
   Vazio (null) → modo LOCAL: protótipo com dados de exemplo no navegador.

   Estes dados não são secretos (ficam visíveis no site de qualquer forma).
   Quem protege as informações são as regras em firestore.rules.
   ========================================================================== */
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDB5QA502gyWmvaEd0ABhfrZvyUL1oWmhE',
  authDomain: 'phimports.firebaseapp.com',
  projectId: 'phimports',
  storageBucket: 'phimports.firebasestorage.app',
  messagingSenderId: '9872726574',
  appId: '1:9872726574:web:c12279d9cda7e4a5ed5dbf'
};

/* Suporte (super admin): UID da conta em Firebase → Authentication → Usuários.
   Quem estiver aqui entra no Painel do Suporte (admin.html) em vez de uma loja.
   As regras (firestore.rules) precisam ter a MESMA lista. */
window.SUPER_ADMIN_UIDS = ['WLmBJby1xoRFC95wPOcKdoad0uo1'];

/* Pix do suporte: recebe as mensalidades das lojas (aba "Mensalidade").
   chave: CPF, CNPJ, e-mail, celular (+55DDDNÚMERO) ou chave aleatória. */
window.PIX_SUPORTE = {
  chave: '',
  nome: '',    // nome de quem recebe (até 25 letras)
  cidade: ''   // cidade (até 15 letras)
};
