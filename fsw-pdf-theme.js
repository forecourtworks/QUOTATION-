/**
 * FSW PDF Theme — shared layout for all Forecourt Works PDF exports
 * Spec: double navy boundary, logo top-right, company header left,
 *       blue separator, centred document title slot, section bars,
 *       no footer text, Roboto when available.
 *
 * Usage (browser):
 *   const theme = window.FSWPdfTheme;
 *   const ctx = await theme.create(doc, { title: 'FLOW METER CALIBRATION RECORD', subtitle: '...' });
 *   ctx.drawChrome(); // frame + header + title
 *   let y = ctx.yAfterTitle;
 *   y = ctx.sectionBar(y, '1.  SECTION');
 */
(function (global) {
  'use strict';

  const NAVY = [13, 71, 140];
  const DARK = [15, 23, 42];
  const GREY = [100, 116, 139];
  const AMBER = [180, 83, 9];
  const SOFT = [241, 245, 249];
  const GREEN = [22, 101, 52];
  const RED = [185, 28, 28];

  const OUTER = 8;
  const MARGIN = 13;
  const FOOTER_PAD = 4; // inside boundary only; no footer text

  async function loadRoboto(doc) {
    async function one(file, style) {
      try {
        const res = await fetch(file);
        if (!res.ok) return false;
        const buf = await res.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buf);
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        doc.addFileToVFS(file, btoa(binary));
        doc.addFont(file, 'Roboto', style);
        return true;
      } catch (_) { return false; }
    }
    const a = await one('Roboto-Regular.ttf', 'normal');
    const b = await one('Roboto-Bold.ttf', 'bold');
    return a && b;
  }

  /**
   * @param {jsPDF} doc
   * @param {object} opts
   * @param {string} opts.title - centred document title (required for page 1)
   * @param {string} [opts.subtitle] - optional pill under title
   * @param {string} [opts.logoDataUrl] - PNG data URL for mark
   * @param {boolean} [opts.loadFonts=true]
   */
  async function create(doc, opts) {
    opts = opts || {};
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const usable = pageW - MARGIN * 2;
    const bottomLimit = pageH - OUTER - FOOTER_PAD;
    const hasRoboto = opts.loadFonts === false ? false : await loadRoboto(doc);
    const logo = opts.logoDataUrl || null;

    function F(style, size) {
      if (hasRoboto && style !== 'italic') {
        doc.setFont('Roboto', style === 'bold' ? 'bold' : 'normal');
      } else if (style === 'bold') {
        doc.setFont('helvetica', 'bold');
      } else if (style === 'italic') {
        doc.setFont('helvetica', 'italic');
      } else {
        doc.setFont('helvetica', 'normal');
      }
      if (size) doc.setFontSize(size);
    }

    function drawFrame() {
      doc.setDrawColor.apply(doc, NAVY);
      doc.setLineWidth(0.65);
      doc.rect(OUTER, OUTER, pageW - OUTER * 2, pageH - OUTER * 2);
      doc.setLineWidth(0.22);
      doc.rect(OUTER + 1.2, OUTER + 1.2, pageW - (OUTER + 1.2) * 2, pageH - (OUTER + 1.2) * 2);
      if (logo) {
        try {
          doc.addImage(logo, 'PNG', pageW - MARGIN - 38, OUTER + 2.8, 36, 6.2);
        } catch (_) {}
      }
    }

    /** Header + separator + title (+ optional subtitle). Returns y after title block. */
    function drawHeaderAndTitle() {
      drawFrame();
      let y = OUTER + 4;

      F('bold', 12);
      doc.setTextColor.apply(doc, NAVY);
      doc.text('FORECOURT WORKS LIMITED', MARGIN, y + 3);

      F('normal', 7);
      doc.setTextColor.apply(doc, DARK);
      doc.text(
        'Ramco Court, GT 3B, South C, Nairobi  |  +254 729-002-087  |  sales@forecourtworks.co.ke',
        MARGIN,
        y + 7.2
      );

      F('italic', 8);
      doc.setTextColor.apply(doc, AMBER);
      doc.text('Engineering Reliability Into Every Forecourt', MARGIN, y + 11.2);
      y += 15;

      // Blue separator under header
      doc.setDrawColor.apply(doc, NAVY);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, y, pageW - MARGIN, y);
      y += 5;

      // Document title slot (same position on every PDF)
      F('bold', 14);
      doc.setTextColor.apply(doc, NAVY);
      doc.text(opts.title || 'DOCUMENT', pageW / 2, y, { align: 'center' });
      y += 5;

      if (opts.subtitle) {
        doc.setFillColor.apply(doc, SOFT);
        doc.roundedRect(MARGIN, y, usable, 8, 1.2, 1.2, 'F');
        F('bold', 9);
        doc.setTextColor.apply(doc, NAVY);
        doc.text(String(opts.subtitle), pageW / 2, y + 5.3, { align: 'center' });
        y += 11;
      } else {
        y += 3;
      }
      return y;
    }

    function sectionBar(y, label) {
      doc.setFillColor.apply(doc, NAVY);
      doc.rect(MARGIN, y, usable, 6.5, 'F');
      F('bold', 8.5);
      doc.setTextColor(255, 255, 255);
      doc.text(label, MARGIN + 2.5, y + 4.4);
      return y + 6.5;
    }

    /** Sign-off section: bar + 5mm clearance before labels */
    function signOffBar(y) {
      y = sectionBar(y, 'SIGN-OFF');
      return y + 5;
    }

    return {
      colors: { NAVY, DARK, GREY, AMBER, SOFT, GREEN, RED },
      OUTER,
      MARGIN,
      usable,
      pageW,
      pageH,
      bottomLimit,
      hasRoboto,
      F,
      drawFrame,
      drawHeaderAndTitle,
      sectionBar,
      signOffBar,
      /** No footer by design */
      drawFooter: function () {}
    };
  }

  global.FSWPdfTheme = {
    NAVY: NAVY,
    create: create,
    OUTER: OUTER,
    MARGIN: MARGIN
  };
})(typeof window !== 'undefined' ? window : globalThis);
