/* ==========================================================================
   pix.js — "Pix copia e cola" (BR Code estático, padrão do Banco Central)
   Gera o texto do Pix com chave, valor e identificador, e o QR Code dele.
   Pix estático não avisa sozinho quando é pago: a confirmação é manual.
   ========================================================================== */
window.Pix = (function () {
  'use strict';

  // Campo EMV: id (2 dígitos) + tamanho (2 dígitos) + valor
  const campo = (id, valor) => id + String(valor.length).padStart(2, '0') + valor;

  // Só letras, números e espaço, sem acento (exigência do padrão)
  const limpar = (t, max) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

  // CRC16-CCITT (polinômio 0x1021, início 0xFFFF)
  function crc16(texto) {
    let crc = 0xFFFF;
    for (let i = 0; i < texto.length; i++) {
      crc ^= texto.charCodeAt(i) << 8;
      for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * @param {{chave, nome, cidade, valor?, txid?, descricao?}} p
   * @returns {string} Pix copia e cola
   */
  function gerarCodigo({ chave, nome, cidade, valor, txid = '***', descricao = '' }) {
    if (!chave) throw new Error('Chave Pix não configurada.');
    const conta = campo('00', 'br.gov.bcb.pix') + campo('01', String(chave).trim())
      + (descricao ? campo('02', limpar(descricao, 40)) : '');
    const idTx = txid === '***' ? '***' : (String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***');
    let codigo = campo('00', '01')
      + campo('26', conta)
      + campo('52', '0000')
      + campo('53', '986')
      + (valor ? campo('54', Number(valor).toFixed(2)) : '')
      + campo('58', 'BR')
      + campo('59', limpar(nome, 25) || 'RECEBEDOR')
      + campo('60', limpar(cidade, 15) || 'BRASIL')
      + campo('62', campo('05', idTx));
    codigo += '6304';
    return codigo + crc16(codigo);
  }

  /** SVG do QR Code (usa qrcode-generator, carregado na página) */
  function qrSvg(codigo, tamanhoCelula = 5) {
    if (!window.qrcode) return '';
    const qr = window.qrcode(0, 'M');
    qr.addData(codigo);
    qr.make();
    return qr.createSvgTag({ cellSize: tamanhoCelula, margin: 2, scalable: true });
  }

  return { gerarCodigo, qrSvg, crc16 };
})();
