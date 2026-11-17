/* ==========================================================================
   cloudinary-config.js — Onde ficam as fotos dos produtos e o logo
   Cloudinary → Dashboard: "Cloud name"
   Cloudinary → Settings → Upload → Upload presets → Add: Signing mode "Unsigned"

   Preenchido → as fotos vão para o Cloudinary e o banco guarda só o endereço.
   Vazio      → as fotos ficam dentro do próprio registro (reduzidas).
   ========================================================================== */
window.CLOUDINARY_CONFIG = {
  cloudName: '',     // ex.: 'dxyz123ab'
  uploadPreset: '',  // ex.: 'phimports_fotos' (sem assinatura)
  pasta: 'phimports'
};
