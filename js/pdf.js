/* ==========================================================================
   pdf.js — Montagem de relatórios em PDF (jsPDF + AutoTable)
   Compartilhado por Relatórios, Vendas e Estoque.

   Uso:
     Pdf.ligarBotao(botao, async () => {
       const pdf = await Pdf.criar({ titulo, periodo, filtros });
       pdf.indicadores([[rotulo, valor, detalhe], ...]);
       pdf.tabela({ titulo, cabecalho, linhas, direita: [3, 4] });
       pdf.salvar('arquivo.pdf');
     });

   Requer na página:
     jspdf.umd.min.js e jspdf.plugin.autotable.min.js (cdnjs)
   ========================================================================== */
(function () {
  'use strict';

  // As fontes padrão do PDF (Helvetica) não têm alguns símbolos: normaliza
  const texto = (s) => String(s ?? '').replace(/[—–]/g, '-').replace(/ /g, ' ');
  const moeda = (v) => texto(App.formatarMoeda(v));
  const rgb = (hex, padrao) => {
    const h = (hex || padrao).trim();
    return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  };

  /** Cores do PDF vindas das variáveis CSS (mantém a identidade da loja) */
  /**
   * Papel é branco: o PDF usa SEMPRE as cores do tema claro,
   * mesmo com o sistema no modo escuro.
   */
  function corClara(variavel) {
    const el = document.createElement('div');
    el.dataset.tema = 'claro';
    el.style.display = 'none';
    document.body.appendChild(el);
    const valor = getComputedStyle(el).getPropertyValue(variavel).trim();
    el.remove();
    return valor;
  }
  function cores() {
    return {
      destaque: rgb(corClara('--cor-destaque'), '#1A1917'),
      texto: rgb(corClara('--cor-texto'), '#1A1917'),
      cinza: rgb(corClara('--cor-texto-2'), '#57534C'),
      borda: rgb(corClara('--cor-borda'), '#E6E1D9'),
      fundo: rgb(corClara('--cor-fundo'), '#F4F2EE'),
      sucesso: rgb(corClara('--cor-sucesso'), '#2D7A57'),
      alerta: rgb(corClara('--cor-alerta'), '#94600F'),
      perigo: rgb(corClara('--cor-perigo'), '#B03A35'),
      info: rgb(corClara('--cor-info'), '#36559A')
    };
  }

  /** Cor de texto para cada status (badge) */
  function corStatus(status) {
    const c = cores();
    return {
      concluida: c.sucesso, autorizada: c.sucesso, entrada: c.sucesso,
      devolvida: c.perigo, cancelada: c.perigo, saida: c.perigo,
      trocada: c.info, pendente: c.alerta, ajuste: c.alerta,
      ok: c.sucesso, baixo: c.alerta, zerado: c.perigo
    }[status] || c.cinza;
  }

  /** Rótulo legível de cada status */
  const ROTULOS = {
    concluida: 'Concluída', devolvida: 'Devolvida', trocada: 'Trocada', cancelada: 'Cancelada',
    autorizada: 'Autorizada', pendente: 'Pendente',
    entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste',
    ok: 'OK', baixo: 'Baixo', zerado: 'Zerado'
  };
  const rotuloStatus = (s) => ROTULOS[s] || s;

  /**
   * Cria um documento A4 retrato já com o cabeçalho da loja.
   * @param {{titulo: string, periodo?: string, filtros?: string}} opcoes
   */
  async function criar({ titulo, periodo = '', filtros = '' }) {
    if (!disponivel()) throw new Error('Biblioteca de PDF não carregou. Verifique a internet.');
    const loja = await Data.obterLoja();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const L = doc.internal.pageSize.getWidth();
    const A = doc.internal.pageSize.getHeight();
    const M = 14;
    const largura = L - M * 2;
    const c = cores();
    let y = M;

    /* ---------- Cabeçalho ---------- */
    let xTitulo = M;
    if (loja.logo) {
      try { doc.addImage(loja.logo, M, y, 14, 14); xTitulo = M + 18; } catch (_) { /* logo inválido: ignora */ }
    }
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...c.texto);
    doc.text(texto(loja.nome), xTitulo, y + 6);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...c.cinza);
    doc.text(texto(`CNPJ ${loja.cnpj}  ·  ${loja.endereco || ''}`), xTitulo, y + 11.5, { maxWidth: largura - 62 });

    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...c.destaque);
    doc.text(texto(titulo), L - M, y + 6, { align: 'right' });
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...c.cinza);
    if (periodo) doc.text(texto(periodo), L - M, y + 11.5, { align: 'right' });

    y += 18;
    doc.setDrawColor(...c.destaque).setLineWidth(0.6).line(M, y, L - M, y);
    y += 6;

    if (filtros) {
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...c.cinza);
      const linhas = doc.splitTextToSize(texto('Filtros: ' + filtros), largura);
      doc.text(linhas, M, y);
      y += linhas.length * 3.6 + 3;
    } else {
      y += 1;
    }

    const novaPaginaSePreciso = (altura) => {
      if (y + altura > A - 18) { doc.addPage(); y = M + 4; }
    };

    const api = {
      doc, cores: c, margem: M, largura,
      get y() { return y; },
      set y(v) { y = v; },

      /** Linha de caixas de indicador: [[rotulo, valor, detalhe], ...] (até 4) */
      indicadores(lista) {
        novaPaginaSePreciso(28);
        const gap = 4;
        const n = lista.length;
        const lk = (largura - gap * (n - 1)) / n;
        lista.forEach(([rotulo, valor, det], i) => {
          const x = M + i * (lk + gap);
          doc.setFillColor(...c.fundo).setDrawColor(...c.borda).setLineWidth(0.2);
          doc.roundedRect(x, y, lk, 22, 2.5, 2.5, 'FD');
          doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...c.cinza).text(texto(rotulo), x + 4, y + 6);
          doc.setFont('helvetica', 'bold').setFontSize(12.5).setTextColor(...c.texto).text(texto(valor), x + 4, y + 13.5);
          if (det) doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...c.cinza).text(texto(det), x + 4, y + 18.5, { maxWidth: lk - 6 });
        });
        y += 30;
        return api;
      },

      /** Título de seção */
      secao(titulo, x = M) {
        doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...c.texto).text(texto(titulo), x, y);
        return api;
      },

      /**
       * Linha de imagens (ex.: gráficos) com título, lado a lado.
       * itens: [{ titulo, imagem: (larguraMm, alturaMm) => dataURL }]
       */
      imagens(itens, altura) {
        novaPaginaSePreciso(altura + 10);
        const gap = 8;
        const w = (largura - gap * (itens.length - 1)) / itens.length;
        itens.forEach((it, i) => api.secao(it.titulo, M + i * (w + gap)));
        y += 3;
        itens.forEach((it, i) => {
          const src = it.imagem(w, altura);
          if (src) doc.addImage(src, 'PNG', M + i * (w + gap), y, w, altura, undefined, 'FAST');
        });
        y += altura + 8;
        return api;
      },

      /**
       * Tabela com cabeçalho na cor da marca (quebra páginas sozinha).
       * @param {{titulo?, cabecalho: string[], linhas: any[][], direita?: number[], centro?: number[],
       *          vazio?: string, colunaStatus?: number, rodape?: any[], larguras?: object}} t
       */
      tabela({ titulo, nota = '', cabecalho, linhas, direita = [], centro = [], vazio = 'Sem dados no período.', colunaStatus = null, rodape = null, larguras = {}, corCelula = null }) {
        novaPaginaSePreciso(30);
        if (titulo) { api.secao(titulo); y += 3; }
        // Nota explicativa em cinza logo abaixo do título (ex.: legenda de símbolos)
        if (nota) {
          doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...c.cinza);
          const linhasNota = doc.splitTextToSize(texto(nota), largura);
          doc.text(linhasNota, M, y + 1);
          y += linhasNota.length * 3.4 + 1.5;
        }
        const colunas = {};
        direita.forEach((i) => { colunas[i] = { ...(colunas[i] || {}), halign: 'right' }; });
        centro.forEach((i) => { colunas[i] = { ...(colunas[i] || {}), halign: 'center' }; });
        Object.entries(larguras).forEach(([i, w]) => { colunas[i] = { ...(colunas[i] || {}), cellWidth: w }; });

        // Converte para texto mantendo a chave de status (usada para colorir)
        const corpo = linhas.length
          ? linhas.map((l) => {
            const nova = l.map((v) => (typeof v === 'number' ? String(v) : texto(v)));
            if (l._status) nova._status = l._status;
            return nova;
          })
          : [[{ content: vazio, colSpan: cabecalho.length, styles: { halign: 'center', textColor: c.cinza } }]];

        doc.autoTable({
          startY: y,
          theme: 'plain',
          margin: { left: M, right: M, top: 18, bottom: 18 },
          head: [cabecalho.map(texto)],
          body: corpo,
          // Rodapé aceita texto ou célula { content, colSpan, styles }
          foot: rodape && linhas.length ? [rodape.map((v) => (v && typeof v === 'object' ? { ...v, content: texto(v.content) } : texto(v)))] : undefined,
          showFoot: 'lastPage',
          styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 }, textColor: c.texto, lineColor: c.borda, lineWidth: { bottom: 0.2 }, overflow: 'linebreak' },
          headStyles: { fillColor: c.destaque, textColor: [255, 255, 255], fontStyle: 'bold', lineWidth: 0 },
          footStyles: { fillColor: c.fundo, textColor: c.texto, fontStyle: 'bold', lineWidth: { top: 0.4 }, lineColor: c.destaque },
          alternateRowStyles: { fillColor: c.fundo },
          columnStyles: colunas,
          didParseCell: (d) => {
            // Alinha cabeçalho/rodapé como a coluna (exceto célula com alinhamento próprio)
            if (d.cell.raw && d.cell.raw.styles && d.cell.raw.styles.halign) return;
            if ((d.section === 'head' || d.section === 'foot') && direita.includes(d.column.index)) d.cell.styles.halign = 'right';
            if ((d.section === 'head' || d.section === 'foot') && centro.includes(d.column.index)) d.cell.styles.halign = 'center';
            // Pinta o texto da coluna de status
            if (d.section === 'body' && colunaStatus === d.column.index && linhas.length) {
              const chave = d.row.raw && d.row.raw._status;
              if (chave) { d.cell.styles.textColor = corStatus(chave); d.cell.styles.fontStyle = 'bold'; }
            }
            // Cor de texto por célula: corCelula(indiceLinha, indiceColuna, valor) → chave de status ou null
            if (d.section === 'body' && corCelula && linhas.length) {
              const chave = corCelula(d.row.index, d.column.index, d.cell.raw);
              if (chave) { d.cell.styles.textColor = corStatus(chave); d.cell.styles.fontStyle = 'bold'; }
            }
          }
        });
        y = doc.lastAutoTable.finalY + 10;
        return api;
      },

      /** Rodapé em todas as páginas e download */
      salvar(nomeArquivo) {
        const total = doc.getNumberOfPages();
        const geradoEm = texto(App.formatarDataHora(new Date().toISOString()));
        for (let i = 1; i <= total; i++) {
          doc.setPage(i);
          doc.setDrawColor(...c.borda).setLineWidth(0.2).line(M, A - 11, L - M, A - 11);
          doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...c.cinza);
          doc.text(texto(`${loja.nome} · ${titulo} · Gerado em ${geradoEm}`), M, A - 6.5);
          doc.text(`Página ${i} de ${total}`, L - M, A - 6.5, { align: 'right' });
        }
        doc.save(nomeArquivo);
      }
    };
    return api;
  }

  function disponivel() {
    return !!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable);
  }

  /**
   * Linha de tabela com status colorido: Pdf.linhaComStatus([...], 'concluida')
   * (o AutoTable aceita propriedades extras no array da linha)
   */
  function linhaComStatus(valores, status) {
    const linha = valores.slice();
    linha._status = status;
    return linha;
  }

  /** Data e hora curtas para tabelas: dd/mm/aaaa hh:mm */
  function dataHora(iso) {
    const d = new Date(iso);
    return `${App.formatarData(iso)} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  /** Descreve os filtros ativos de um <form> pelo texto das opções escolhidas */
  function descreverFiltros(form, ignorar = []) {
    const partes = [];
    form.querySelectorAll('select').forEach((s) => {
      if (s.value && !ignorar.includes(s.name)) partes.push(s.options[s.selectedIndex].text);
    });
    const busca = form.querySelector('input[type=search]');
    if (busca && busca.value.trim()) partes.push(`busca "${busca.value.trim()}"`);
    return partes.join(' · ');
  }

  /** Período legível a partir de inputs de data */
  function descreverPeriodo(inicio, fim) {
    if (inicio && fim) return `${App.formatarData(inicio)} a ${App.formatarData(fim)}`;
    if (inicio) return `A partir de ${App.formatarData(inicio)}`;
    if (fim) return `Até ${App.formatarData(fim)}`;
    return 'Todo o período';
  }

  /** Liga um botão à geração do PDF (desabilita, mostra toast e trata erro) */
  function ligarBotao(botao, gerar) {
    botao.addEventListener('click', async () => {
      if (!disponivel()) return App.toast('Biblioteca de PDF não carregou. Verifique a internet.', 'erro');
      botao.disabled = true;
      try {
        await gerar();
        App.toast('PDF gerado.');
      } catch (erro) {
        console.error(erro);
        App.toast(erro.message || 'Não foi possível gerar o PDF.', 'erro');
      } finally {
        botao.disabled = false;
      }
    });
  }

  window.Pdf = { criar, ligarBotao, linhaComStatus, descreverFiltros, descreverPeriodo, dataHora, texto, moeda, corStatus, rotuloStatus };
})();
