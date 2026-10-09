/**
 * Forecourt Works Ltd — Quotation Builder
 * PDF follows FSW theme + consolidated design amendments.
 */
(function () {
  'use strict';

  const NAVY = [13, 71, 140];
  const DARK = [15, 23, 42];
  const GREY = [100, 116, 139];
  const AMBER = [180, 83, 9];
  const SOFT = [241, 245, 249];
  const OUTER = 8;
  const MARGIN = 13;

  const STORAGE_KEY = 'fsw_quotation_v1';
  let items = [];
  let terms = [];
  let itemIdSeq = 1;
  let termIdSeq = 1;
  const pads = {};
  const sigFiles = { sigCreator: null, sigApprover: null, sigClient: null };
  let logoDataUrl = null;
  let saveTimer = null;
  let suppressSave = false;

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2600);
  }
  function money(n) {
    return (Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function todayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
  }

  // Remove near-black / solid background from product photos
  function removeBackground(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, c.width, c.height);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          // treat very dark / near-black as background
          if (r < 28 && g < 28 && b < 28) {
            d[i + 3] = 0;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // ---------- items ----------
  function defaultItem() {
    return {
      id: itemIdSeq++,
      name: '',
      description: '',
      qty: 1,
      unit: 'PC',
      cost: 0,
      imageDataUrl: null
    };
  }

  function renderItems() {
    const list = $('itemsList');
    list.innerHTML = '';
    items.forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.dataset.id = it.id;
      row.innerHTML = `
        <div class="row-num">${idx + 1}</div>
        <div class="item-body">
          <div class="grid-2">
            <div class="field">
              <label>Item Name</label>
              <input data-f="name" value="${escapeAttr(it.name)}" placeholder="e.g. DOL Starter" />
            </div>
            <div class="field">
              <label>Unit Cost (KES)</label>
              <input type="number" data-f="cost" value="${it.cost}" min="0" step="0.01" />
            </div>
          </div>
          <div class="field">
            <label>Description</label>
            <textarea data-f="description" rows="2">${escapeHtml(it.description)}</textarea>
          </div>
          <div class="grid-3">
            <div class="field">
              <label>Qty</label>
              <input type="number" data-f="qty" value="${it.qty}" min="1" step="1" />
            </div>
            <div class="field">
              <label>Unit</label>
              <input data-f="unit" value="${escapeAttr(it.unit)}" />
            </div>
            <div class="field">
              <label>Line Total</label>
              <input readonly value="${money(it.qty * it.cost)}" style="background:#f8fafc;font-weight:600;color:#0D478C;" />
            </div>
          </div>
          <div class="item-actions">
            <label class="btn btn-ghost btn-sm">+ ADD IMAGE
              <input type="file" accept="image/*" class="hidden" data-img="${it.id}" />
            </label>
            <img class="img-preview ${it.imageDataUrl ? 'show' : ''}" data-prev="${it.id}" src="${it.imageDataUrl || ''}" alt="" />
            ${it.imageDataUrl ? '<button type="button" class="btn btn-danger btn-sm" data-rmimg="' + it.id + '">Remove image</button>' : ''}
            ${items.length > 1 ? '<button type="button" class="btn btn-danger btn-sm" data-rm="' + it.id + '">Remove item</button>' : ''}
          </div>
        </div>`;
      list.appendChild(row);
    });

    list.querySelectorAll('input, textarea').forEach(el => {
      el.addEventListener('input', onItemField);
      el.addEventListener('change', onItemField);
    });
    list.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
      items = items.filter(x => x.id !== Number(b.dataset.rm));
      renderItems();
      recalc();
      scheduleSave();
    }));
    list.querySelectorAll('[data-rmimg]').forEach(b => b.addEventListener('click', () => {
      const it = items.find(x => x.id === Number(b.dataset.rmimg));
      if (it) { it.imageDataUrl = null; renderItems(); scheduleSave(); }
    }));
    list.querySelectorAll('input[type=file][data-img]').forEach(inp => {
      inp.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const it = items.find(x => x.id === Number(inp.dataset.img));
        if (!it) return;
        try {
          let url = await fileToDataUrl(file);
          url = await removeBackground(url);
          it.imageDataUrl = url;
          renderItems();
          scheduleSave();
          toast('Image attached (background cleaned)');
        } catch (_) {
          toast('Could not load image');
        }
      });
    });
  }

  function onItemField(e) {
    const row = e.target.closest('.item-row');
    if (!row) return;
    const it = items.find(x => x.id === Number(row.dataset.id));
    if (!it) return;
    const f = e.target.dataset.f;
    if (!f) return;
    if (f === 'qty' || f === 'cost') it[f] = Number(e.target.value) || 0;
    else it[f] = e.target.value;
    if (f === 'qty' || f === 'cost') {
      const totalInp = row.querySelector('input[readonly]');
      if (totalInp) totalInp.value = money(it.qty * it.cost);
      recalc();
    }
    scheduleSave();
  }

  function escapeAttr(s) {
    return String(s || '').replace(/"/g, '&quot;');
  }
  function escapeHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ---------- terms ----------
  function defaultTerm() {
    return {
      id: termIdSeq++,
      text: 'This quotation is valid for 30 days from the date of issue unless otherwise stated in writing.'
    };
  }

  function renderTerms() {
    const list = $('termsList');
    list.innerHTML = '';
    terms.forEach((t, idx) => {
      const row = document.createElement('div');
      row.className = 'term-row';
      row.dataset.id = t.id;
      row.innerHTML = `
        <div class="num">${idx + 1}</div>
        <input data-term value="${escapeAttr(t.text)}" />
        ${terms.length > 1 ? '<button type="button" class="btn btn-danger btn-sm" data-rmterm="' + t.id + '">×</button>' : ''}`;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-term]').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const row = e.target.closest('.term-row');
        const t = terms.find(x => x.id === Number(row.dataset.id));
        if (t) t.text = e.target.value;
        scheduleSave();
      });
    });
    list.querySelectorAll('[data-rmterm]').forEach(b => b.addEventListener('click', () => {
      terms = terms.filter(x => x.id !== Number(b.dataset.rmterm));
      renderTerms();
      scheduleSave();
    }));
  }

  // ---------- totals ----------
  function recalc() {
    const parts = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.cost) || 0), 0);
    const labour = Number($('labourAmt').value) || 0;
    const travel = Number($('travelAmt').value) || 0;
    const sub = parts + labour + travel;
    const discount = Number($('discount').value) || 0;
    const taxable = Math.max(0, sub - discount);
    const rate = Number($('taxRate').value) || 0;
    const tax = taxable * (rate / 100);
    const final = taxable + tax;
    $('sumSub').textContent = money(sub);
    $('sumTaxable').textContent = money(taxable);
    $('sumTax').textContent = money(tax);
    $('sumFinal').textContent = 'KES ' + money(final);
    return { sub, discount, taxable, tax, final, parts, labour, travel };
  }

  // ---------- signatures ----------
  function initPad(id) {
    const canvas = $(id);
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = 110 * ratio;
      canvas.getContext('2d').scale(ratio, ratio);
      if (pads[id]) pads[id].clear();
    };
    resize();
    const pad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255,255,255)',
      penColor: 'rgb(15,23,42)'
    });
    pads[id] = pad;
    window.addEventListener('resize', () => {
      const data = pad.isEmpty() ? null : pad.toData();
      resize();
      if (data) pad.fromData(data);
    });
  }

  function getSigDataUrl(id) {
    if (sigFiles[id]) return sigFiles[id];
    const pad = pads[id];
    if (pad && !pad.isEmpty()) return pad.toDataURL('image/png');
    return null;
  }

  // ---------- PDF ----------
  function wrapText(doc, text, font, size, maxW) {
    doc.setFont(font, 'normal');
    doc.setFontSize(size);
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    words.forEach(w => {
      const test = (cur + ' ' + w).trim();
      if (doc.getTextWidth(test) <= maxW) cur = test;
      else { if (cur) lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  /** Preserve hard line breaks from the form (each point on its own line), then wrap long lines. */
  function wrapMultiline(doc, text, font, size, maxW) {
    const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const paragraphs = raw.split('\n');
    const out = [];
    paragraphs.forEach((para) => {
      const trimmed = para.trimEnd();
      // empty line in source → blank line on PDF
      if (trimmed === '' && para.length > 0) {
        out.push('');
        return;
      }
      if (trimmed === '') return;
      const wrapped = wrapText(doc, trimmed, font, size, maxW);
      wrapped.forEach(ln => out.push(ln));
    });
    return out.length ? out : [''];
  }

  async function loadLogo() {
    if (logoDataUrl) return logoDataUrl;
    try {
      const res = await fetch('forecourt-logo-mark.png');
      const blob = await res.blob();
      logoDataUrl = await new Promise(r => {
        const fr = new FileReader();
        fr.onload = () => r(fr.result);
        fr.readAsDataURL(blob);
      });
    } catch (_) {}
    return logoDataUrl;
  }

  async function generatePdf() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const usable = pageW - MARGIN * 2;
    const bottomLimit = pageH - OUTER - 8;

    // fonts
    let hasRoboto = false;
    try {
      if (window.FSWPdfTheme) {
        const theme = await window.FSWPdfTheme.create(doc, { title: 'QUOTATION', loadFonts: true, logoDataUrl: await loadLogo() });
        hasRoboto = theme.hasRoboto;
      }
    } catch (_) {}
    // manual font load fallback
    async function tryFont(file, style) {
      try {
        const res = await fetch(file);
        if (!res.ok) return false;
        const buf = await res.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        doc.addFileToVFS(file, btoa(binary));
        doc.addFont(file, 'Roboto', style);
        return true;
      } catch (_) { return false; }
    }
    if (!hasRoboto) {
      const a = await tryFont('Roboto-Regular.ttf', 'normal');
      const b = await tryFont('Roboto-Bold.ttf', 'bold');
      hasRoboto = a && b;
    }

    function F(style, size) {
      if (hasRoboto) doc.setFont('Roboto', style === 'bold' ? 'bold' : 'normal');
      else doc.setFont('helvetica', style === 'bold' ? 'bold' : 'normal');
      if (size) doc.setFontSize(size);
    }

    const logo = await loadLogo();

    function drawFrame() {
      doc.setDrawColor(...NAVY);
      doc.setLineWidth(0.65);
      doc.rect(OUTER, OUTER, pageW - OUTER * 2, pageH - OUTER * 2);
      doc.setLineWidth(0.22);
      doc.rect(OUTER + 1.2, OUTER + 1.2, pageW - (OUTER + 1.2) * 2, pageH - (OUTER + 1.2) * 2);
      if (logo) {
        try { doc.addImage(logo, 'PNG', pageW - MARGIN - 38, OUTER + 2.8, 36, 6.2); } catch (_) {}
      }
    }

    function drawHeader(title, subtitle, pageNum, totalPages) {
      drawFrame();
      let y = OUTER + 4;
      F('bold', 12);
      doc.setTextColor(...NAVY);
      doc.text('FORECOURT WORKS LIMITED', MARGIN, y + 3);
      F('normal', 7);
      doc.setTextColor(...DARK);
      doc.text('Ramco Court, GT 3B, South C, Nairobi  |  +254 729-002-087  |  sales@forecourtworks.co.ke', MARGIN, y + 7.2);
      F('normal', 8);
      doc.setTextColor(...AMBER);
      doc.text('Engineering Reliability Into Every Forecourt', MARGIN, y + 11.2);
      y += 15;
      doc.setDrawColor(...NAVY);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, y, pageW - MARGIN, y);
      y += 5;
      F('bold', 14);
      doc.setTextColor(...NAVY);
      doc.text(title, pageW / 2, y, { align: 'center' });
      y += 5;
      if (subtitle) {
        doc.setFillColor(...SOFT);
        doc.roundedRect(MARGIN, y, usable, 8, 1.2, 1.2, 'F');
        F('bold', 9);
        doc.setTextColor(...NAVY);
        doc.text(subtitle, pageW / 2, y + 5.3, { align: 'center' });
        y += 11;
      } else y += 3;
      if (pageNum) {
        F('normal', 7);
        doc.setTextColor(...GREY);
        doc.text(`Page ${pageNum} of ${totalPages}`, pageW - MARGIN, pageH - OUTER - 3, { align: 'right' });
      }
      return y;
    }

    function sectionBar(y, label) {
      doc.setFillColor(...NAVY);
      doc.rect(MARGIN, y, usable, 6.5, 'F');
      F('bold', 8.5);
      doc.setTextColor(255, 255, 255);
      doc.text(label, MARGIN + 2.5, y + 4.4);
      return y + 6.5;
    }

    const fin = recalc();
    const qtNo = $('qtNo').value.trim() || 'QT#00000';
    const qtDate = fmtDate($('qtDate').value);
    const prepared = $('preparedBy').value.trim();
    const approved = $('approvedBy').value.trim();
    const qtType = $('qtType').value;
    const customer = $('customer').value.trim();
    const requested = $('requestedBy').value.trim();
    const scopeTitle = $('scopeTitle').value.trim() || 'SCOPE OF SUPPLY';

    // estimate pages: content page(s) + photo page if any images
    const withPhotos = items.some(it => it.imageDataUrl);
    // We'll use dynamic page breaks; totalPages refined at end is hard — show progressive
    let totalPagesEst = withPhotos ? 2 : 1;

    // ---- PAGE 1 ----
    let y = drawHeader(
      'QUOTATION',
      `${qtNo}  |  Date: ${qtDate}  |  Prepared: ${prepared}  |  Approved: ${approved}  |  Type: ${qtType}`,
      1, totalPagesEst
    );

    // meta tiles
    const colW = usable / 3;
    const metaH = 12;
    doc.setFillColor(...SOFT);
    doc.roundedRect(MARGIN, y, usable, metaH, 1, 1, 'F');
    [['CUSTOMER', customer], ['REQUESTED BY', requested], ['QUOTATION TYPE', qtType]].forEach((pair, i) => {
      const x = MARGIN + i * colW;
      F('normal', 6);
      doc.setTextColor(...GREY);
      doc.text(pair[0], x + 2.5, y + 3.5);
      F('bold', 8.5);
      doc.setTextColor(...DARK);
      doc.text(String(pair[1] || '').substring(0, 28), x + 2.5, y + 8.5);
    });
    y += metaH + 3;

    // commercial summary — equal height, dual navy bars
    const boxH = 46;
    const gap = 3.5;
    const half = (usable - gap) / 2;
    const barW = 2.4;
    const leftX = MARGIN;
    const rightX = MARGIN + half + gap;
    const bottom = y + boxH;

    doc.setFillColor(...SOFT);
    doc.roundedRect(leftX, y, half, boxH, 1.6, 1.6, 'F');
    doc.roundedRect(rightX, y, half, boxH, 1.6, 1.6, 'F');
    doc.setFillColor(...NAVY);
    doc.roundedRect(leftX, y, barW, boxH, 1, 1, 'F');
    doc.rect(leftX + 1, y, barW - 1, boxH, 'F');
    doc.roundedRect(rightX + half - barW, y, barW, boxH, 1, 1, 'F');
    doc.rect(rightX + half - barW, y, barW - 1, boxH, 'F');

    // left cost rows
    F('bold', 8);
    doc.setTextColor(...NAVY);
    doc.text('QUOTATION COST SUMMARY', leftX + 6, y + 6);
    const costRows = [
      ['Sub Total', fin.sub, false],
      ['Discount Allowed', fin.discount, false],
      ['Taxable Sub Total', fin.taxable, false],
      ['Tax Amount', fin.tax, false],
      ['Final Amount Payable', fin.final, true]
    ];
    const topC = y + 12;
    const botC = y + boxH - 6;
    const stepC = (botC - topC) / 4;
    costRows.forEach((r, i) => {
      const ty = topC + i * stepC;
      if (r[2]) {
        doc.setFillColor(...NAVY);
        doc.roundedRect(leftX + 4.5, ty - 2.6, half - 10, 6.4, 1, 1, 'F');
        F('bold', 8);
        doc.setTextColor(255, 255, 255);
        doc.text(r[0], leftX + 6, ty + 1.5);
        doc.text('KES  ' + money(r[1]), leftX + half - 5, ty + 1.5, { align: 'right' });
      } else {
        F('normal', 7.5);
        doc.setTextColor(...DARK);
        doc.text(r[0], leftX + 6, ty + 1.5);
        F('bold', 7.5);
        doc.setTextColor(...NAVY);
        doc.text(money(r[1]), leftX + half - 5, ty + 1.5, { align: 'right' });
      }
    });

    // right payment — right aligned, no PAYMENT DETAILS heading
    const rxR = rightX + half - barW - 3.2;
    const paySlots = [
      { h: true, t: 'FOR BANK PAYMENT' },
      { h: false, t: 'FORECOURT SUPPLIES AND WORKS LTD' },
      { h: false, t: 'Diamond Trust Bank (DTB) | Bank Code: 063 | Branch: TRM' },
      { h: false, t: 'Account: 0766-364-001' },
      { h: true, t: 'FOR PAYBILL PAYMENT' },
      { h: false, t: 'Paybill No: 516600 | A/C No. 0766364001' },
      { h: true, t: 'FOR DIRECT MPESA DEPOSIT' },
      { h: false, t: 'Mpesa No: 0729-002-087 | Reg Name: Elizabeth Kamando' }
    ];
    const topP = y + 6;
    const botP = y + boxH - 5.5;
    const stepP = (botP - topP) / (paySlots.length - 1);
    paySlots.forEach((s, i) => {
      const py = topP + i * stepP;
      if (s.h) {
        F('bold', 7);
        doc.setTextColor(...NAVY);
      } else {
        F('normal', 6.2);
        doc.setTextColor(...DARK);
      }
      // shrink if needed
      let size = s.h ? 7 : 6.2;
      doc.setFontSize(size);
      const maxW = half - barW - 8;
      while (size > 5 && doc.getTextWidth(s.t) > maxW) {
        size -= 0.2;
        doc.setFontSize(size);
      }
      doc.text(s.t, rxR, py, { align: 'right' });
    });

    y = bottom + 3.5;

    // items section
    y = sectionBar(y, '1.  ' + scopeTitle.toUpperCase());
    y += 1.5;

    const cols = [9, 30, 75, 11, 11, 22, 22]; // sum ~180
    const headers = ['No', 'ITEM NAME', 'ITEM DESCRIPTION', 'QTY', 'UNIT', 'COST/UNIT', 'TOTAL'];

    function drawItemHeader(yy) {
      doc.setFillColor(...NAVY);
      doc.rect(MARGIN, yy, usable, 6.5, 'F');
      F('bold', 7);
      doc.setTextColor(255, 255, 255);
      let x = MARGIN;
      headers.forEach((h, i) => {
        doc.text(h, x + 1.2, yy + 4.4);
        x += cols[i];
      });
      return yy + 6.5;
    }

    y = drawItemHeader(y);

    function ensureSpace(needed) {
      if (y + needed > bottomLimit) {
        doc.addPage();
        totalPagesEst = Math.max(totalPagesEst, doc.internal.getNumberOfPages() + (withPhotos ? 1 : 0));
        y = drawHeader('QUOTATION (continued)', `${qtNo}  |  ${customer}`, doc.internal.getNumberOfPages(), totalPagesEst);
        y = drawItemHeader(y);
      }
    }

    items.forEach((it, idx) => {
      const nameLines = wrapText(doc, it.name || '—', 'Roboto', 7.5, cols[1] - 2.5);
      const descLines = wrapMultiline(doc, it.description || '', 'Roboto', 6.5, cols[2] - 2.5);
      const nLines = Math.max(nameLines.length, descLines.length, 2);
      const rowH = Math.max(11, nLines * 3.3 + 3.5);

      ensureSpace(rowH + 2);

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(MARGIN, y, usable, rowH, 'F');
      }
      doc.setDrawColor(220, 220, 230);
      doc.setLineWidth(0.25);
      doc.line(MARGIN, y + rowH, pageW - MARGIN, y + rowH);

      let x = MARGIN;
      F('bold', 7.5);
      doc.setTextColor(...NAVY);
      doc.text(String(idx + 1), x + 1.2, y + 4.5);
      x += cols[0];

      F('bold', 7.5);
      doc.setTextColor(...DARK);
      nameLines.forEach((ln, li) => doc.text(ln, x + 1.2, y + 4.2 + li * 3.2));
      x += cols[1];

      F('normal', 6.5);
      descLines.forEach((ln, li) => doc.text(ln, x + 1.2, y + 4.2 + li * 3.1));
      x += cols[2];

      F('normal', 7.5);
      doc.setTextColor(...DARK);
      doc.text(String(it.qty || 0), x + cols[3] / 2, y + 4.5, { align: 'center' });
      x += cols[3];
      doc.text(String(it.unit || 'PC'), x + cols[4] / 2, y + 4.5, { align: 'center' });
      x += cols[4];
      doc.text(money(it.cost), x + cols[5] - 1.2, y + 4.5, { align: 'right' });
      x += cols[5];
      F('bold', 7.5);
      doc.setTextColor(...NAVY);
      doc.text(money((it.qty || 0) * (it.cost || 0)), x + cols[6] - 1.2, y + 4.5, { align: 'right' });

      y += rowH;
    });

    // labour / travel
    function simpleRow(label, value) {
      ensureSpace(8);
      y += 2;
      y = sectionBar(y, label);
      y += 0.8;
      doc.setDrawColor(220, 220, 230);
      doc.setLineWidth(0.25);
      doc.line(MARGIN, y + 6.5, pageW - MARGIN, y + 6.5);
      F('normal', 7.5);
      doc.setTextColor(...DARK);
      // label already in section; show amount line
      // re-read: we used section for title — show amount as simple row under
    }

    // Labour block
    ensureSpace(20);
    y += 2.5;
    y = sectionBar(y, '2.  LABOUR COST');
    y += 0.8;
    doc.setDrawColor(220, 220, 230);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, y + 6.5, pageW - MARGIN, y + 6.5);
    F('normal', 7.5);
    doc.setTextColor(...DARK);
    doc.text($('labourDesc').value || 'Installation', MARGIN + 2, y + 4.4);
    F('bold', 7.5);
    doc.setTextColor(...NAVY);
    doc.text(money(fin.labour), pageW - MARGIN - 2, y + 4.4, { align: 'right' });
    y += 6.5 + 1.5;

    ensureSpace(16);
    y = sectionBar(y, '3.  TRAVEL / DELIVERY EXPENSES REIMBURSEMENT');
    y += 0.8;
    doc.setDrawColor(220, 220, 230);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, y + 6.5, pageW - MARGIN, y + 6.5);
    F('normal', 7.5);
    doc.setTextColor(...DARK);
    const travelLines = wrapText(doc, $('travelDesc').value || '', 'Roboto', 7.5, usable - 40);
    doc.text(travelLines[0] || '', MARGIN + 2, y + 4.4);
    F('bold', 7.5);
    doc.setTextColor(...NAVY);
    doc.text(money(fin.travel), pageW - MARGIN - 2, y + 4.4, { align: 'right' });
    y += 6.5 + 3;

    // Important note
    const note = $('importantNote').value || '';
    const noteLines = wrapText(doc, note, 'Roboto', 6.5, usable - 5);
    const noteH = Math.max(14, 8 + noteLines.length * 3);
    ensureSpace(noteH + 4);
    doc.setFillColor(254, 243, 199);
    doc.roundedRect(MARGIN, y, usable, noteH, 1.2, 1.2, 'F');
    F('bold', 7);
    doc.setTextColor(...AMBER);
    doc.text('IMPORTANT NOTE', MARGIN + 2.5, y + 3.8);
    F('normal', 6.5);
    doc.setTextColor(...DARK);
    noteLines.forEach((ln, i) => doc.text(ln, MARGIN + 2.5, y + 7.5 + i * 3));
    y += noteH + 3;

    // Terms
    const termTexts = terms.map(t => t.text).filter(Boolean);
    const termBlockH = 6.5 + 2 + termTexts.length * 4.2 + 8;
    ensureSpace(termBlockH + 20);
    y = sectionBar(y, 'TERMS & CONDITIONS');
    y += 2;
    const contentH = termTexts.length * 4.2 + 8;
    doc.setFillColor(...SOFT);
    doc.roundedRect(MARGIN, y, usable, contentH, 1.5, 1.5, 'F');
    let ty = y + 5;
    termTexts.forEach((t, i) => {
      F('bold', 7);
      doc.setTextColor(...NAVY);
      doc.text(`${i + 1}.`, MARGIN + 3, ty);
      F('normal', 7);
      doc.setTextColor(...DARK);
      const ls = wrapText(doc, t, 'Roboto', 7, usable - 12);
      ls.forEach((ln, j) => doc.text(ln, MARGIN + 8, ty + j * 3.4));
      ty += Math.max(4.2, ls.length * 3.4);
    });
    y += contentH + 4;

    // Sign-off: Creator + Approver side by side, then full-width Client Acceptance box
    const statement = `My appended signature signifies our acceptance of quotation ${qtNo} dated ${qtDate} for ${scopeTitle} at KES ${money(fin.final)}, on the terms set out in the document.`;
    const stmtLines = wrapText(doc, statement, 'Roboto', 7.5, usable - 12);
    const clientBlockH = 6.5 + stmtLines.length * 3.5 + 2 + 22 + 5;
    ensureSpace(6.5 + 4 + 30 + clientBlockH + 10);
    y = sectionBar(y, 'SIGN-OFF');
    y += 4;

    // Creator + Approver
    const staffGap = 4;
    const staffHalf = (usable - staffGap) / 2;
    const staff = [
      { key: 'sigCreator', label: 'QUOTATION CREATOR', name: $('sigCreatorName').value || 'ECK' },
      { key: 'sigApprover', label: 'QUOTATION APPROVER', name: $('sigApproverName').value || 'B. O' }
    ];
    staff.forEach((s, i) => {
      const sx = MARGIN + i * (staffHalf + staffGap);
      F('bold', 7);
      doc.setTextColor(...NAVY);
      doc.text(s.label, sx + staffHalf / 2, y, { align: 'center' });
      doc.setDrawColor(180, 190, 205);
      doc.setLineWidth(0.35);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(sx, y + 2, staffHalf, 20, 1.2, 1.2, 'FD');
      const data = getSigDataUrl(s.key);
      if (data) {
        try { doc.addImage(data, 'PNG', sx + 4, y + 3.5, staffHalf - 8, 14); } catch (_) {}
      }
      F('normal', 7);
      doc.setTextColor(...DARK);
      doc.text(s.name, sx + staffHalf / 2, y + 25, { align: 'center' });
      F('normal', 5.5);
      doc.setTextColor(...GREY);
      doc.text('Signature / Name', sx + staffHalf / 2, y + 28.5, { align: 'center' });
    });
    y += 32;

    // Client acceptance — full-width navy boundary rectangle
    const hdrH = 6.5;
    const stmtH = stmtLines.length * 3.5 + 2;
    const sigBoxH = 20;
    const rectH = hdrH + stmtH + sigBoxH + 5;
    ensureSpace(rectH + 8);

    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(1.05);
    doc.roundedRect(MARGIN, y, usable, rectH, 2, 2, 'FD');
    doc.setFillColor(...NAVY);
    doc.rect(MARGIN, y, 2.2, rectH, 'F');
    doc.rect(MARGIN, y, usable, hdrH, 'F');
    F('bold', 8);
    doc.setTextColor(255, 255, 255);
    doc.text('CLIENT QUOTATION ACCEPTANCE', MARGIN + 5, y + 4.5);

    let sty = y + hdrH + 4.5;
    F('normal', 7.5);
    doc.setTextColor(...DARK);
    stmtLines.forEach(ln => {
      doc.text(ln, MARGIN + 5, sty);
      sty += 3.5;
    });

    const sigTop = y + hdrH + stmtH + 1;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.55);
    doc.roundedRect(MARGIN + 5, sigTop, usable - 10, sigBoxH, 1.5, 1.5, 'FD');
    F('bold', 6.5);
    doc.setTextColor(...NAVY);
    doc.text('CLIENT SIGNATURE', MARGIN + 8, sigTop + 4.5);
    const clientSig = getSigDataUrl('sigClient');
    if (clientSig) {
      try { doc.addImage(clientSig, 'PNG', MARGIN + 12, sigTop + 5.5, usable - 24, 10); } catch (_) {}
    } else {
      doc.setDrawColor(160, 170, 185);
      doc.setLineWidth(0.35);
      doc.line(MARGIN + 12, sigTop + 12, pageW - MARGIN - 12, sigTop + 12);
    }
    F('normal', 6.5);
    doc.setTextColor(...DARK);
    doc.text($('sigClientName').value || 'Name / Title / Date', pageW / 2, sigTop + 16.5, { align: 'center' });

    y += rectH + 6;

    F('normal', 8.5);
    doc.setTextColor(...AMBER);
    doc.text('Thank You For Your Business!', pageW / 2, Math.min(y + 2, bottomLimit - 2), { align: 'center' });

    // ---- PHOTO PAGE ----
    const photoItems = items.filter(it => it.imageDataUrl);
    if (photoItems.length) {
      doc.addPage();
      const pnum = doc.internal.getNumberOfPages();
      y = drawHeader(
        'QUOTATION — PRODUCT REFERENCE',
        `${qtNo}  |  ${customer}  |  Item Photos`,
        pnum, pnum
      );
      y = sectionBar(y, 'ITEM PHOTOGRAPHS  ·  LABELLED BY NAME');
      y += 5;

      // grid 2x2 per page, spill to extra pages
      let slot = 0;
      const gap = 5;
      const cellW = (usable - gap) / 2;

      function nextCellOrigin() {
        if (slot > 0 && slot % 4 === 0) {
          doc.addPage();
          const pn = doc.internal.getNumberOfPages();
          y = drawHeader(
            'QUOTATION — PRODUCT REFERENCE',
            `${qtNo}  |  ${customer}  |  Item Photos (cont.)`,
            pn, pn
          );
          y = sectionBar(y, 'ITEM PHOTOGRAPHS  ·  LABELLED BY NAME');
          y += 5;
          slot = 0;
        }
        const availH = y - (OUTER + 12);
        // when slot 0, compute cellH from remaining
        const cellH = (availH - gap) / 2;
        const col = slot % 2;
        const row = Math.floor(slot / 2) % 2;
        const x = MARGIN + col * (cellW + gap);
        const cy = y - (row + 1) * cellH - row * gap;
        return { x, cy, cellW, cellH };
      }

      // recompute cellH once at start of grid
      const availH0 = y - (OUTER + 12);
      const cellH0 = (availH0 - gap) / 2;

      photoItems.forEach((it, idx) => {
        if (slot > 0 && slot % 4 === 0) {
          doc.addPage();
          const pn = doc.internal.getNumberOfPages();
          y = drawHeader(
            'QUOTATION — PRODUCT REFERENCE',
            `${qtNo}  |  ${customer}  |  Item Photos (cont.)`,
            pn, pn
          );
          y = sectionBar(y, 'ITEM PHOTOGRAPHS  ·  LABELLED BY NAME');
          y += 5;
          slot = 0;
        }
        const col = slot % 2;
        const row = Math.floor(slot / 2);
        const availH = y - (OUTER + 12);
        const cellH = (availH - gap) / 2;
        const x = MARGIN + col * (cellW + gap);
        const cy = y - (row + 1) * cellH - row * gap;
        const labelH = 9;

        doc.setFillColor(...SOFT);
        doc.roundedRect(x, cy, cellW, cellH, 2, 2, 'F');
        doc.setFillColor(...NAVY);
        doc.roundedRect(x, cy + cellH - labelH, cellW, labelH, 2, 2, 'F');
        doc.rect(x, cy + cellH - labelH, cellW, 3, 'F');
        F('bold', 8);
        doc.setTextColor(255, 255, 255);
        const label = `${items.indexOf(it) + 1}.  ${(it.name || 'ITEM').toUpperCase()}`;
        doc.text(label.substring(0, 42), x + cellW / 2, cy + cellH - 3.5, { align: 'center' });

        const pad = 4;
        const areaW = cellW - 2 * pad;
        const areaH = cellH - labelH - 2 * pad - 6;
        try {
          // fit image preserving aspect
          const props = doc.getImageProperties(it.imageDataUrl);
          const scale = Math.min(areaW / props.width, areaH / props.height);
          const dw = props.width * scale;
          const dh = props.height * scale;
          const ix = x + (cellW - dw) / 2;
          const iy = cy + 6 + (areaH - dh) / 2 + 2;
          doc.addImage(it.imageDataUrl, 'PNG', ix, iy, dw, dh);
        } catch (_) {}

        F('normal', 6.5);
        doc.setTextColor(...GREY);
        const note = `${it.qty || 1} ${it.unit || 'PC'}  ·  ${money(it.cost)}`;
        doc.text(note, x + cellW / 2, cy + 3.5, { align: 'center' });

        slot++;
      });

      F('normal', 6.5);
      doc.setTextColor(...GREY);
      doc.text(
        'Product images are for identification only. Actual supplied items may vary in branding while meeting the quoted specifications.',
        pageW / 2, OUTER + 5, { align: 'center' }
      );
    }

    // download
    const safeCust = (customer || 'CLIENT').replace(/[^A-Z0-9]/gi, '').substring(0, 8).toUpperCase();
    const fname = `${qtNo.replace(/[^A-Z0-9#]/gi, '')}-${safeCust}.pdf`;
    doc.save(fname);
    toast('PDF generated: ' + fname);
  }

  // ---------- persistence ----------
  const FIELD_IDS = [
    'qtNo', 'qtDate', 'qtType', 'customer', 'requestedBy', 'preparedBy',
    'approvedBy', 'scopeTitle', 'labourDesc', 'labourAmt', 'travelDesc',
    'travelAmt', 'discount', 'taxRate', 'importantNote',
    'sigCreatorName', 'sigApproverName', 'sigClientName'
  ];

  const DEFAULT_FIELDS = {
    qtNo: 'QT#00067',
    qtType: 'Parts Only',
    customer: 'PETROSOMA · SALGAA',
    requestedBy: 'ISAAK',
    preparedBy: 'ECK',
    approvedBy: 'B. O',
    scopeTitle: 'SUPPLY OF MOTOR CONTROL & PROTECTION SYSTEM',
    labourDesc: 'Installation',
    labourAmt: '7500',
    travelDesc: 'Technician Travel — Nairobi to Salgaa (2 × RETURN @ 1,100.00)',
    travelAmt: '2200',
    discount: '0',
    taxRate: '0',
    importantNote: 'A formal approval of this quotation is required before we can raise a work order or sales order and commence work. Please append your signature on the client quotation acceptance section and return the signed copy to us via email sales@forecourtworks.co.ke',
    sigCreatorName: 'ECK',
    sigApproverName: 'B. O',
    sigClientName: ''
  };

  // Embedded transparent signature PNGs (no network/file fetch required)
  const DEFAULT_SIG_DATA = {
    sigCreator: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAApsAAAElCAYAAACruin8AAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAAg/0lEQVR4nO3dSZKlRrYA0JCs5jnMPWj/a9EeNNQK9Aep9xOR4HjfcY5ZWaUi3gPHOy7eEF9fAADQyG+jEwDs4dv3P/45/vfff/05Rf/ySdcs6QF4G50vEG3WgDLVLtcBsAIdLADwOseHTg+cAA2cR/cIk18AeUTysLGeT+53wVjPEYOrNLQ6/7fvf/xjNATqsb4aYDGtRuK+ff/jn8//WhwfeIfV+hD9HgAAAOSq+VTtCb09+cvblfQz2g9AJ4JL4A30TwAAALCakqd5o5XAKKl9z8591c7XBiyoNEDUqQEjpfRBb+mv3nKdAAAMINh89vvoBMBu7L4EdmAUE2AiudPjOmhgVfovAAAA2JWnfgAAHnnFB7AjfRUAAAAAsAejnQAD+Ys9wK70bQAAAAAAKzGqC2Tz1y8AuKPfB7LpQAAAAACAeRnBBACgKq8fAiCGewUAAAAAMC8jmEAzOhgAnrhXAAAA0IYnTgAAAKAbAxEAAACsw1MsxNNe3m2H8k+9Bu9YBrLpPCCddsNqcoNFdR0AAABgN08jPkaEWIUpciBIBwFjaHvMQKAIDKUDAtiLfh2Ygs4IYB/6dGAKOiPoT7vb26jyLZkaVycBYCNu7MAKfh+dAAAAAAAWVLpj3Ag6AABVCTABAAAAgHpKRxy9hB0AYGMjAj3BJQAAAHvyxAuwJlPiAEBTAo21KC8AYCmCF2AF/oLQS7gpAdT3mcq2SxzYls4JoC+BIQCwPcFOW/IXAHg1wVBdtfLTqCcAsAUBTZlaQaHgEgAAAABiGUn7Ve0RRnkMAPBitYNBwSUAAEsRwAIATKDFJhuBHsC/dIjA27RYX2lXOABAQwKtuSgPAICKTIMDd34bnQAA1nIMBP/+68/i+0jt483s2/c//tn9GgEAaCg0KmvEFgB4JS9FB9iQzhh40mKUrPbubbvBAQCoSmCZTp4BAHy1eck68F52xAEs5hwI1twRbqc0AADFjFz2Jb8BAGhGsAlUpVMBerMjHACAqgSWAAAAAEAZU9gAAAAAwL6MgAIAvFitYFBACQBAleDSa4dQ9gAANCPYhHu/j07AzHQeAAAA/L+ZpsRDx/AwuxflCQAAAAAAAHRQa0q8VnoAAAAAAAAAoKLSaW1T4gAAAAAAAAAsIHd6fOZp8ZnTBtDbVT+vnwSa09EAvJd7AAAAAACwppjRzd97JARgNaaHAPSFwCR0RrydNsCu1G2ACnSmlFKHAIBfCBCoRV1iZ+o3AAAAe+v95JtyPk/lAAAbyf2LQqOOCwDAAAI7AAC6MKoIAEAXtQPPnOMJfAEA+IURUgAAqvkElzkBpqCUnajPAFCZUUz4SVsAAAAAmIFRGkin3QBAQMnaSzdZEGwCwH+U3hjdWAEAADryEAbAtkpeQ3R1rBppAmBvv41OAABjXT04/P3Xn+4Pmb59/+Mf+Qc//T46AUAem24o9alDAqO6/v7rz9+0TfhJBwMTO9+wagcFn+MLNt5H2QMA0IRRcQAAmhBoAr2ZPoHFHAMFU6CkMHUO+a7ajzYV53+jEwDcuwosdWq0ZtMQ/JegsoxgEyamY6Mm9QnSCTTLCTaBbZSuRdz5ZpI6Wml0EwSatQg2N1Jyo9WQWMndK6HO7zf8/Pdd/b5b/7rTutinm+Xd71e/7pk8Be4C+zkJNOuRgQsK3QhT3stosTMreAoIW9XVHQLOmLw7BzoCH4jvX9wz2cLV37Lu9eoSr0iht2N9n63uzZaeGFdpPubtVT7PmPdvIM/nEtsOlFsc0+iTuRuJuPs3rCymvs/iaUp+JU95vcM1rqZWnp9H2nYYoe/tqp1bblJGJk3gqnMorcApT1saCz2dp3A/P699s70T+rvVu7SFmKk9y2j2FAqUvr6U7ZOUNrDLw2cP1TNJ5j+r2fBj12g+fc5NhlZa3ehi6n7oMzG/C7WnmdvKXcBhbeZ7Ke98o9aN70QGdZKyQzbmGJ/jHH9eUuFbjK7yXlejlzXq5/E4rUdrno6/Uhu56n8+/z5/ZpVrgl7u2sZKfQAbO290yFlIfLeAv1YaQ+d82lwAR08bT3KOdd4YVyOdqem4O/eMbcGmhvnVzvsZ6+GKQve8EemBRyU7amfaiavh8aRWgDlLcBkyW3rOYh8QRzzA0kZKm1PG+dwLmUbpjTb03yOtMqJDPzVG7K++t2Kdmqkt3AWRs6SP+lLKVl1II6+YRo2RnNppqs0NjI+SEfvz91ukb4SZridm9GWm9MIMnu5xZgIYpmSKvFWaetrlOnhWe+3l6nUnZkp6dJpyvl8zPdRzVzahMpuhTu7EgEsdXuqeIWX32bFC2rXGCko70W/ff+7QbPUuTcI+eR6T38pkXjGv84r5XUp9eLtzXvmjB3UINh/kNNLzzfV4893BTtfCTyVB4bGd7P4XNma6nlDf4rVGe7gqY+VY7qpNnH92lfe73c8ZLGeq/C3D6m+5zjeovYP8bUZef+lO5DeX226eylJZ/yomT2yQrcfI5knq6M4bpwjfcp07q7GDfMdR+yezjRDG/CWwu7Ke5RqI81T37n4vMLr21HZiZw0gSeoozVuebiyO3kvJ5rZdNvmUmKXup4xUGp3ZQ6h8lWW8u/yK2XEur/O9fmQzdaTijSOZrC20nvLpe8fPhxbM00/qSKXRmT2Eyis02qmcf/W06ScUUMrPTnaJ6nPWY77xqeZt17uT3HXHb6znsc6vPRqdhuPPYmcglO1+tNk4se3BqGZ9ySObq0f1KSOZdyM7b/LGa15dzuj7bGsRZ3bsF3qPHFlHxoc220bLUU1l9gIpIzaeYH7wdLeW0rWYxBk1+ltjTbny3sN5DbWyzhM7I1CSj9a7/7D9ms2UUR5PHawo5w0Kbx+xr2FEvqW880+57i2mDasDP4Tu7a3eR3vVL4+aEaGDlJHMNz91xNopj3Yo99T1mC3TwhxWr9PEM6oZJ2VG4OpnOXkZ+p6yCVgpc0yXt7FbXh2DzdWuzaaf90gJKAQfe0i5h+V+9y1KNwDJyzqip9FXGPKNnU40XZ5nh/w6lv1xSmNsquIcp178wYH3CP197JR6oA6sQ1nVk5KXNV6Ir71tLuZpbpWgYrSdn+5iR4JmYqr8vWwKIpWyDkvZFFQSbJZ+Zjf/P7K56oLVlKeIFa9vJjvUkZUWaBu9ere7Ms0pa/ViDTXasbL+IXZTUOrPeCFP7PXttm6l5hNrLzVGs1jfbm2RZyUbStSL/6oxI1A/VeFzbm+1i46dMl/tumawyzTcXZB5/P/ZpGzkmf1aKDfzzZJ+SjYLvdld///0uR5WvKdWsdJFPxXSawuxgpkaY4mroG3mepEaZM56HbSVElSqJ2ux3rat1LZT6/ihz6eeYwsrXfhKad3Bip3dSqM8gkxiCUb2Zbaurdb5plw2YTSzvdVHNVddmxn7mZmvg3pSRriMhu0hdtTNdPqz0jbRI+/e2j4f37P57fvYXbsxhWLHWJkdAs2vr3Z/dqymY54+vQv2uHt+tuugjVA5p+yWVV/WUfttE8r+VzXe6HCl5Dg97q9T1YWYofteabk6dygQWiUYWtUq+btKOr++5m5vZzOlhf9SNvswfV5HjXw6rp8P/e/4+RrnKklz6Ni1j1si+i8IjVL61zMIC+XlzPl7TPf5LwHNlu6rtN6ZKe0zpWV3d3U3NGp/dQxlto6UMr/7vvL+4Skvz0IzAndtrvY9MuavHO5k2mAz1JA0sHpWDOZXmjb/8OdTeZLS36kre3v64xM7BiOpYpYkHYPH0OfO34n5WUzach8kctt36rX29L/ZEvT15YltBrPn/+yBZsxo5swdA33FBhSrr6/mh5iRuKcy3b3PuLr+4zV/AsmWs0WhMkhdX10jPU9mrhNTjmy2WszLT6nTDqM9BW8z1g1BJk9yRkDUmT3ElPndQ8gudeB8v7kKJs8/v/t8aRru2tonv3N2s8csf+FfvTIo9vUP1LHSCEnKa19Gmi09zG/GekxbMfe60lf4zORuc835963P2yPfViyfXqYY2fQUP49Z83v2afMnK6aZtnI2BZn1Wd/TkokVyzo05f003V37eo75FAr8cvIzdB2hEdCdRqOb6fU00Poc/LD6E/Ns6XxKT8+0zpQW8sWW02xtgXwxazVnKOvQSGHt9OWMTKa0idT0ho6tLVYgA/cyc0f2sUpAHBPczZReYJwV+4OrQK/2dYSCys+/Y5dRtczfp2Cz9fmX95Q5IwpvxUa5ghXyO6ZBz+LpKXe29DKHlBvlCm2WOE9lPlNZt1jr+HTM0lHJu9HW2EA1Ju2xaeFXw9dsrrQuZQczv7v0qexnSOPRiHeUxqwZanFe6ootpxXfg8uvYgd1Zuv7avwZxuPazc/vS/ZnhIL22OOmXlfMm0V4MCqzRgyDv93sebtC+katiZw9byiTUr7qwh6O/cmKo2ZP6zdbpL3lmsyStJhpeDZ8ZPPIyEwbd099s42QXKVvlrTFBJlvfVkvcZ7aYe5nmVuoHwvtmJ69rEMjlT37q6u2kjr6mXLsj5HXvKKhf0FI4Yw3sgxWCYJnmuKaKQCnHdPne4jdUDJrH3iV/lFBVo2p8py0PrXFUBmPLj8CZn+aW82s+TnTYviQXgvDZ7tu6mq1KYK5xQabsd8bofZGoZpaTuGHyua8sSsmXXyNqdhP05IKal+rB5qzpZN9qFv7mKUsZ0hDC7GBZk45xA4yrPCwMIup1mzyHrNOG33cTYHMls63CnXmq5TNuS7NPqVKuhnWoT/9BZ/Z3dX/lOupPX1+/vfdZ/jp96+vcZ3YDjeMWc06KnfV6c3WOJ86EXWzj9Bu11XK4Km9lbwCiXmFgrsRffNu9eduBPPr69eNQqnX/vSd4+9mWMe/nN43/JZrLfDUlWvWIP0NzoFlbp7PVE4p675mSjf1PU3Nti7/FetXqD9++lzL/kN7LTAq4xRaffIzj0Czv5jF9jnHLD1GDbH1Sb3bS05A2aucd6hPKWs1W5xTe12YAqon9kmQX+lA+midpzOUWUoazPLsY/To5RvEBJW5I5oxDwPusfA1T0NYrdMVaLbVMy9nKLOU0Y8Z0ksdoTKfpY9Zob7F5kvN/Is9X41zwdJm6dBmCXhjrZbeVbSYIk853yg1RkhmuA7SpJbnyHJeoX7ljGDm5mnMwIj7REcydW4zdGjnp/gV6kxqHq1wTSMd68Ab8yp2RH+G9kpbd+1AOd+LeVC7+++a0+e9H5ZhCTM0hF060B2uoTfTgT+E0vSU3l3azxvFBkhPP+faVeBXc/pceUCE0cP7qeeZqWEbXcrXe/Ry9tHSEevMGE95thWTvy1HNUffX3fhLwhtYuRLZGPO/e37zxflzvbC22PaSn7+BlcdbIu8OJ/n77/+/G3Vv4TyuZbQy6CvPsN+lPO9u7x5yquSPH16ebvygn/NuPh8pjSkWjHNrZ3XYNbOn9CxVymLUL6YPt9XStkp57DYdZM9+wjLIODBiMbwNO3A/K4Cv9rleRVY7lpnYjYY7HjdbyHQrCM30Cw5n6lxKFTSYHLXvRz/vVKDLRmRWl1oNLHGte8wYlnKA9jeYtfo9kjLqmJn52r2U7mzDdoxrzO6MezcEHe4ho/QFHiLkYK3BZaxebhzeyFMGYeNCDRD5xx9b4WplKwPa5We3RriKtcUCiiPv29xzprHXFGoHR5HNUO/zzmn/GeEEf1IzQfY3ECz5Jz8YIfVgj6VPnaH3LfveTt4Y7+Xmp6ZHDuQu/THfKalq07ubjfz1e9apGPVneE13V3/sT20bBsrt7uVxea78snTsv089Vlv79NakqkbOTeUHg1n9g41Jg9iA87P70JPuE8d2VN6Q8HL0/FbuAowR6RjJa3y6Oq4yqO/lD5FudwLPayd+9oa+Xh3rKdzKMs6ZN4GWjz9xRxvp0aYG9Clfi9mlHIGvUbnVhUKOJ5+9/WVV8e8m3O8mDxXLs9i87Hmg9VVu3zqv5VlPV7qvpC7hpEynZ7y+V7HmsHxSTrl2lKvf+b8Kq1fb/E0Qn0XoJe0GYHmPHYPNHtNJYfq9N0azZJ0pX53h7KciWBzMSVrL3uPfK5oxFrIWHdBTmm6jvXDmqU4T8sd7j5TOiozU318m9i2oVye3eXR3YNaSZ4+zQw8pSf3vPyXjOQXtacBV/e0XjP3ASDmc6nlkBIsCizT5Uz/sb439ns9nUc1a+ZzzvQ5C/K6gLDS/Kn9CpSVXqkyKp0tz/v0+o3Qd1odn2dPr0yR32t7W/n1vt5WbUebnIeIfkGjnsqM2MwlZbTFk3w7oenzkhGxmGn5mlbZvNabUc06Und919gQdPX9UF+orNuRoQ3VCM5m2omqIY6XWgbnJQDKLk/O61FK87tX8HcV1Grrba3w8Nd7Ovvrq16gmXOM3HNelaX2QzO1huXPxwlNA5SeK5Wph3FSp7+VVV13+Vl7WcLTeWqco8Xx3ig2D+/qSEw/v4unthPKm9zztVqKdPf90H9jZDNLzektT0CEpI6ArDBispqcDXM57brH9F5K/Xj7SHgoz2M3ih3/Oya/Yz+7kpxZgZ5ajoC+vQ0defVRhpqVp8dNjPUIMucSMwV4/nmN92nWdFdH7n6uHt1r8a7N4/KFHkFKzzW6oftY7XOm5l3raXZ+WDLYzL2x9mxcNSrmqHd/eRobR5A5l7u28BS4laz7utLyPYPn93d+fje6PoXypFfaUkY1U0eNrz53VRa1Pa2TbHmumM/WXudcU+oo9+g2xIZ6rNvqodUamty09D7nKLlrMt+UR72F8veujeSWR6u1mjH1ZKZ6dE7L8b/Pa/xG95FXP8/53t1nc9NX47g9At67ci49bukxzsdL6QO4t+TI5oxqP8GUvKw712wN5w1PhTmjIbGfp427dlJaHq2WzMR8v9brmnKEplRD0/qj+qu7Nw7UXpNYq8/PnbJucc+56u9arEeO/WzJcgj97+JGP63OFnD1cjWCcPd7yqXUtxlGc96m54hGz1GsmUY5Z6zTT+Ue87OYY6Ucp0Ru/tYaUX/6+YjyL2kDs9XXlUwfmbco2FmfSO6epFqPNJyPf3W+3qMdu0oZycz5PP2VtI2e7WqWNhxTp1NH/GtdU8yxnj6Tk55RZdPznjND/XtKQ2kaZ7jGWU0/jf62Qmu9G3XU7naN8CdB5txSgoUaD8Mtl8yE6tH5PK2X6sQGmU/Tved09gg0U/qv3PTULvOYKeLjf99tVqo1/T96M27s53YLsGcxfbD5FqGbVq11O6MCzV7nWEHKukx5NkbPV6G0LuO7nebnc7eeGowdUUo5Xu2Zl9jvpu5IrnnuJ0/5eLdmMrRWtub5WykJNENrWnPKVb99TbA5ibtGUGvR9MhA861yR8iUyfxaTre13GzYe4lMTJAZM5JZO121leRdrYGA3CniUF3Iua7e/VetQDPldylp0Z//INjcWEmgqYHkS+mkBJnzqD0d96Tl9PmVGQPN2GOd15N//n0cuW25zu4pWM45b0jNNZ8xa/KfjpGShtx05p4v5kGlR6B59R19OtOI3bWXe+yc4959ryQtb5BSZp/Pytd5xJZHqzLrNZXdy935Pj8PpSfUL8aepzSdT9+pkZ+1jhHK67tlFDmfe0pHbjpzlJ7vqS7lXH/J96GpFoFmaQArCEqTEjjK1znFPoTVCGzeXAdK20nvgKX2987H6FWfUgPS2lqcI+dhpaWrYPPNbZ2JtGqApQGsBpJGfu2v5UhWr5t963M+BTRX6WidppCRwUCtfjr2AanldcaMIM5QroI/OChpELUamYb6TF7so9f031Mg1sLd9GjvQLPGqP/IUc0W564xqhk6dq/RzNUDTfc2Xml0oHmXBg3yh9ojD4zX62a5a11o8YBc+zxXx0r57G5lV3I956ni0Od6PtTcpadHoLljHanNbvQBPpXybjdg7ePl7Ij79r3932JfSUpeHstRHs4tpp7XKsPeu897KOljPnq/wzBnlqd1ObU+z7lPKtlxfvVmgLvz9XpBes49sGWe96o3KxFsDnJXCWu98kJlryc2LwWZa3ma1i65Kd8dr/RYJedslY7Uvucpf+/aUa13DqeaKdBM7e8/weHnFVG1X9fVK4grCRp7B5owhZrrtmpOnT+l5Y3TBLXWmjGnmm0x9Twj2tMs1xXbpmKna2OPNaqd1pzGnaUu3ek9dZ67TKx1W5ipTGZhZLOj2oHm11ebEc1ao66ryhnJZB8tRmRanydG7VHa3CnLniNNqbMNtdNRexp39F+oiUlzr5fc5+Rfr9H9FudYnWBzEjUaTM2GdJ5y0XD+y5T52q6mFHuuz2u9Nq/29PlTfc8NQo7TvKHz1/yLOjW/k3u81HONXi6VsjSi9rlj8y82DT36a+tAGabWsHqrqfOY4+08kpcyZb5zPtBWq7rzNNVYcsyS78ccPydNpeeukZbc4+Ved43jpIqpAy3TEVund+6Xr8pg5+ul0F1nkXqMkWt2dqzco9dz0VfPNtS6XrU6/rFN5C7xeQpOjv//9Lmnn8WkZVSwlJOeu++0TNfdOUf3iwYA6rQDXqLGiMOIQHNkYNuD0cz3CbWjFudqcczY49YMaFqdtyRNoXOfR4FqnqPkWLVGc3s8aOSmrXZazj/rdf4SpemKeVhbjTWbjdUINJ+O3XINx7fv678L8Cw2347XvlsevFGoLvdYa5bTlo79RM6rmELnjH3QOp7//PPzOxdbbABKzbfz53uuM8zZHJVzzNDPc8XUlR6v0joKHfvp/Kvdu2LryUrXdCTY7KBGZzHLezRXregfKYHm59+rXzP3Wt2QrupZym7o2O8+1dOr4ODp2E9pP/4+5ob/dA13YtIe+l5M2ZaW/VO6SvvpuyCvV6AZur4RgxwxaRhxbywpk9jlJKvfhwSbDYUqUY2doa0r39NT5ejXlOQcW5D5XndBVW93570K7mIDgKtjXt2YQ6P1d0HmZ0owZaS2djs6BrYp3yn5/WznOarR/4ZG0kYGQHfLXK5G0Xum68m5bcVMhae2c7jUas1j75tky/Md8yN1vVDOOUKfOf4/+7gr/97rzWoc766e5p6rdpubaQ1d63WNPc57t26xdD1gqD2kLq+orbQu105PiWOentN3l9YZr4MFrRZofs5Zu/MMNbpa50vpODXufZXeWHPPWaOthwLMmY47axu6u9GXHjPl56XnqtU/hr6XcswZ280M9S9mJDP3+3BpxEhKD6nB211gGTvKWCO9NY7DulaqAymjH0/HiDl2yTFX78tSxfRZPUdRU4PDp+PHnqN3ub+hjr2tLVFRy85hpFajQTWPazSTj9BNtGca7n5eI7hMSUeLdlvzeDN6yrfWI+TH89Q8Vsyo9ojyHR3c1pA6INMjTWyopAKtVPlK09pyKm+2DpQxZgg2Q1Zq728UE2SOTEPK51ODmxEzcynHXqHtXM3w1b7nrcQOp8q+fc/7m8sxn5lVaqNJeTVJTSvnMel61y/Wd+zLZtvtnOqc1tj2cHeNLdtTyrFXKYPzNa2SbhaWu95nhae3j9nWNN19tvb5WYfy5+xuOUOvc+d85+l+UWPWKfe7Jee0/Aki5AaMOwSao8TkkXzk60ugybMWa2hrBbKxx6m1vKnmMWuaJR2kM5xbSc70eWi6IvQ9fjBNypk2RW2hAOf88u6V69eI6fMY2i78q2Q6JPbn/GA0kxBtiivK/9nIdnLXbkekhTY8KTQSehoz+pJn941WQB1Xo43n4GVUHzHjSOhVvzlqA+fRLPlDOQVZ6K5BhhrqXcM+/4yfYpYkyLv3mnUKkLbuApSYh/2r77VIn/qXTr7t53+jE7Cyp7U8qb/TuMKegnf24gHsvWLL/m7N5N2sUcwxa1q17o5ue6vmGzRhnUkfObv5WcvdbtuYXbjWP++n1q7q43HUhV/NvvucfRjZZHpPyxQ8Ba/pPHpyVY7HkavQ1JrZgr18yj0n6Pn7rz9/u3qRuboQRz7B5DwN1hEzktUzPbSREkykBh7qyPpS3jxhNC6N2QB6M7LJVGJuLr3SQlulIyhPb3VgbTH1wyhcffIUJpA6GlN6jDd5GqGQb+vLLUOjmlCPNkJvv49OwIpiRlJCAdPVMd7umC8p7yZlDaUPCimjl+oI3DN9zgim0RPcbVCIfTm7gCmPfFtXyYu0U6fJ1RN4ZjMdIwg2I8Xe4ASaeVL/fjzzehqljvnuh93n0JYRTXoQbBYQaLYl39ZR+tLsY1nH/PWt2J8DP4T6U30sTCDlFRx3v2uTsrXZDLS282tnUsvr+Pkam+5Szg1AP55mIlyNtJxHYj7/HpG+FYXyTH7O6yqoy1mHmfq9z3fVCahDPwsLOP5VE6Mq6YxoruP8J/9yRjBL/2xg6CXUqceCN9F2YHIxf2VBcJTOX6+YX0lZXH23tFzVC8ij7TADG4QSnaceTEGksUh9Tufp7ZJd5LXL1quOoB7thhEEmzfuGuRTA9WQ88i3vkqDy6tj1Erb1Tm84QHSeLBnJoLNgNQbnBtgmMBhrKt8Lh3BHLVpR12BdKbUGUWwWYmAKZ88a+Nq9DK1nt4do8cyEg8nkOeqjWg3sIDQuwRtbMkn3+q5qqMlO79Hl413akI6u89hAak32RluyrxTy+By1jqtvUHY3dsgtBtYlAYcT16VqxkUzjJ6ecUMAuQxqgkLSLmZufGlkV9p7oLBmsHlrOWhrgCwrdibnJthuhYv+t5J7WBw5pHLkNA6zdWuBXoyG8DM7EZPZEdfPW/Nw6v3U169Rqjkb47vmLc7XhPUEAootRuYUKjRekrM99a1RLWnw8/HLUsdsAN9ASzG5oS+dsnTY1DZ4ppWWnOZ460PI9CC+xWzMbx+46qhmo5oZ5XlCed6cX5pcq30X0211zz+bO6ubedrhlJ3/aZ2w2xUxgcabT1PAeVVgDVC6EGjRRrvAti31L3QDfPq58APV32EdsOMVEa6SQ3UQqOINdJw1uNPu4UCyxbnW4FRTchzbiNv7keYmwpJVzkjg6Fg5O47oWP37JDvrlcgBeQyfQ4QaacF7K03CO3IZjzIo90AJFqtkxRY1iHvIF3oDx/0TgvEMtzOVGbYJHTXaVsbVY9NQQDvoUNnajVfQfX05H8X+JSck3jyG9J5QGMFKifTq92ZeofqWDYxQDqbggAggr8UBHm0EVb2++gEAABhVyOaAlAAOHBzhHRmA9iBkU0AmFho8yKsQLAJdPH3X3/+5qYJ8bQPAIjkRdSQxvQ5OzGyCXThlVNQRqDJqgSbQFdumBAWerewBzQAAIp4IGM3RjYBAAAAAACAykytszLT6AAwAa87AgCgGUElAADN3Y1wAgAAcPJ/h023rgIB+a4AAAAASUVORK5CYII=',
    sigApprover: 'data:image/png;base64,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'
  };

  function showSigPreview(id, dataUrl) {
    const img = $('preview-' + id);
    const wrap = $('wrap-' + id);
    if (!img || !wrap) return;
    if (dataUrl) {
      img.src = dataUrl;
      img.classList.add('show');
      wrap.classList.add('has-file');
    } else {
      img.removeAttribute('src');
      img.classList.remove('show');
      wrap.classList.remove('has-file');
    }
  }

  function clearSignature(id) {
    if (pads[id]) pads[id].clear();
    sigFiles[id] = null;
    showSigPreview(id, null);
    scheduleSave();
  }

  function setAttachedSignature(id, dataUrl) {
    sigFiles[id] = dataUrl || null;
    if (pads[id]) pads[id].clear();
    showSigPreview(id, dataUrl);
    scheduleSave();
  }

  function collectState() {
    const fields = {};
    FIELD_IDS.forEach(id => {
      const el = $(id);
      if (el) fields[id] = el.value;
    });
    const signatures = {};
    ['sigCreator', 'sigApprover', 'sigClient'].forEach(id => {
      if (sigFiles[id]) {
        signatures[id] = { type: 'file', data: sigFiles[id] };
      } else if (pads[id] && !pads[id].isEmpty()) {
        signatures[id] = { type: 'pad', data: pads[id].toDataURL('image/png') };
      } else {
        signatures[id] = null;
      }
    });
    return {
      version: 1,
      fields,
      items: items.map(it => ({
        id: it.id,
        name: it.name,
        description: it.description,
        qty: it.qty,
        unit: it.unit,
        cost: it.cost,
        imageDataUrl: it.imageDataUrl
      })),
      terms: terms.map(t => ({ id: t.id, text: t.text })),
      itemIdSeq,
      termIdSeq,
      signatures
    };
  }

  function scheduleSave() {
    if (suppressSave) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 250);
  }

  function saveState() {
    if (suppressSave) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collectState()));
    } catch (err) {
      console.warn('Could not save quotation state', err);
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function applyFields(fields) {
    if (!fields) return;
    FIELD_IDS.forEach(id => {
      const el = $(id);
      if (el && fields[id] !== undefined && fields[id] !== null) {
        el.value = fields[id];
      }
    });
  }

  function applySignatures(signatures) {
    if (!signatures) return;
    ['sigCreator', 'sigApprover', 'sigClient'].forEach(id => {
      const s = signatures[id];
      if (!s || !s.data) {
        sigFiles[id] = null;
        showSigPreview(id, null);
        if (pads[id]) pads[id].clear();
        return;
      }
      if (s.type === 'file') {
        setAttachedSignature(id, s.data);
      } else {
        // drawn pad — restore onto canvas
        sigFiles[id] = null;
        showSigPreview(id, null);
        if (pads[id]) {
          const img = new Image();
          img.onload = () => {
            const canvas = $(id);
            const ctx = canvas.getContext('2d');
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.scale(ratio, ratio);
            ctx.drawImage(img, 0, 0, canvas.width / ratio, canvas.height / ratio);
            // Keep as file-equivalent so getSigDataUrl works after restore
            sigFiles[id] = s.data;
            showSigPreview(id, s.data);
          };
          img.src = s.data;
        } else {
          sigFiles[id] = s.data;
          showSigPreview(id, s.data);
        }
      }
    });
  }

  function seedSample() {
    itemIdSeq = 1;
    termIdSeq = 1;
    items = [
      {
        id: itemIdSeq++,
        name: 'DOL Starter',
        description: 'Three Phase Direct On Line Electric Motor Starter. Suitable for 7.5HP / 5.5kW 3Ph motor. Pre-wired with Contactor 18-25A, Overload Relay 9-13A.',
        qty: 1, unit: 'PC', cost: 7500, imageDataUrl: null
      }
    ];
    terms = [defaultTerm()];
    terms.push({
      id: termIdSeq++,
      text: 'Prices are quoted in Kenya Shillings (KES) and are exclusive of any applicable taxes unless shown above.'
    });
    terms.push({
      id: termIdSeq++,
      text: 'Delivery / installation lead time will be confirmed upon receipt of formal purchase order / written approval.'
    });
    terms.push({
      id: termIdSeq++,
      text: 'Ownership of goods remains with Forecourt Works Limited until full payment is received.'
    });
  }

  async function fetchAsDataUrl(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
    } catch (_) {
      return null;
    }
  }

  function loadDefaultSignatures(forceAll) {
    // Elizabeth → Creator (ECK); Oguta → Approver (B. O). Embedded transparent PNGs.
    ['sigCreator', 'sigApprover'].forEach(id => {
      if (!forceAll && sigFiles[id]) return; // keep user-attached / restored
      const url = DEFAULT_SIG_DATA[id];
      if (!url) return;
      if (pads[id]) pads[id].clear();
      sigFiles[id] = url;
      showSigPreview(id, url);
    });
    if (forceAll) {
      if (pads.sigClient) pads.sigClient.clear();
      sigFiles.sigClient = null;
      showSigPreview('sigClient', null);
    }
  }

  function applyDefaultsToForm() {
    suppressSave = true;
    Object.keys(DEFAULT_FIELDS).forEach(id => {
      const el = $(id);
      if (el) el.value = DEFAULT_FIELDS[id];
    });
    const dateEl = $('qtDate');
    if (dateEl) dateEl.value = todayISO();
    ['sigCreator', 'sigApprover', 'sigClient'].forEach(id => {
      if (pads[id]) pads[id].clear();
      sigFiles[id] = null;
      showSigPreview(id, null);
    });
    suppressSave = false;
  }

  async function hardReset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    suppressSave = true;
    seedSample();
    applyDefaultsToForm();
    renderItems();
    renderTerms();
    recalc();
    suppressSave = false;
    loadDefaultSignatures(true);
    saveState();
  }

  function restoreOrSeed() {
    const state = loadState();
    suppressSave = true;
    if (state && state.version === 1) {
      itemIdSeq = state.itemIdSeq || 1;
      termIdSeq = state.termIdSeq || 1;
      items = Array.isArray(state.items) && state.items.length
        ? state.items.map(it => ({
            id: it.id,
            name: it.name || '',
            description: it.description || '',
            qty: Number(it.qty) || 1,
            unit: it.unit || 'PC',
            cost: Number(it.cost) || 0,
            imageDataUrl: it.imageDataUrl || null
          }))
        : null;
      if (!items) seedSample();
      terms = Array.isArray(state.terms) && state.terms.length
        ? state.terms.map(t => ({ id: t.id, text: t.text || '' }))
        : null;
      if (!terms) {
        terms = [defaultTerm()];
        terms.push({
          id: termIdSeq++,
          text: 'Prices are quoted in Kenya Shillings (KES) and are exclusive of any applicable taxes unless shown above.'
        });
        terms.push({
          id: termIdSeq++,
          text: 'Delivery / installation lead time will be confirmed upon receipt of formal purchase order / written approval.'
        });
        terms.push({
          id: termIdSeq++,
          text: 'Ownership of goods remains with Forecourt Works Limited until full payment is received.'
        });
      }
      applyFields(state.fields || {});
      if (!$('qtDate').value) $('qtDate').value = todayISO();
      renderItems();
      renderTerms();
      recalc();
      suppressSave = false;
      // signatures after pads exist
      return state.signatures || null;
    }
    seedSample();
    applyDefaultsToForm();
    renderItems();
    renderTerms();
    recalc();
    suppressSave = false;
    return null;
  }

  function bind() {
    $('btnAddItem').addEventListener('click', () => {
      items.push(defaultItem());
      renderItems();
      recalc();
      scheduleSave();
    });
    $('btnAddTerm').addEventListener('click', () => {
      terms.push({ id: termIdSeq++, text: '' });
      renderTerms();
      scheduleSave();
    });
    ['labourAmt', 'travelAmt', 'discount', 'taxRate'].forEach(id => {
      $(id).addEventListener('input', () => { recalc(); scheduleSave(); });
    });
    FIELD_IDS.forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', scheduleSave);
      el.addEventListener('change', scheduleSave);
    });
    $('btnPdf').addEventListener('click', () => {
      saveState();
      generatePdf().catch(err => {
        console.error(err);
        toast('PDF error: ' + (err.message || err));
      });
    });
    $('btnReset').addEventListener('click', async () => {
      if (!confirm('Reset form to defaults? All entered data will be cleared.')) return;
      await hardReset();
      toast('Form reset to defaults');
    });

    document.querySelectorAll('[data-clear]').forEach(b => {
      b.addEventListener('click', () => clearSignature(b.dataset.clear));
    });
    document.querySelectorAll('[data-sigfile]').forEach(inp => {
      inp.addEventListener('change', async (e) => {
        const id = inp.dataset.sigfile;
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          let url = await fileToDataUrl(file);
          // Strip solid black/near-black backgrounds from signature PNGs
          url = await removeBackground(url);
          setAttachedSignature(id, url);
          toast('Signature image attached');
        } catch (_) {
          toast('Could not attach signature');
        }
        inp.value = '';
      });
    });

    // persist pad strokes shortly after drawing stops
    ['sigCreator', 'sigApprover', 'sigClient'].forEach(id => {
      const canvas = $(id);
      if (!canvas) return;
      ['mouseup', 'touchend', 'pointerup'].forEach(ev => {
        canvas.addEventListener(ev, () => scheduleSave());
      });
    });
  }

  // Hook item/term edits to save
  const _renderItems = renderItems;
  // patch save into existing item field handler via scheduleSave calls below

  function init() {
    const pendingSigs = restoreOrSeed();
    bind();
    ['sigCreator', 'sigApprover', 'sigClient'].forEach(initPad);
    setTimeout(() => {
      if (pendingSigs) {
        applySignatures(pendingSigs);
      }
      // Always ensure creator/approver defaults if still empty (covers old localStorage)
      loadDefaultSignatures(false);
      saveState();
    }, 80);
    loadLogo();
    window.addEventListener('beforeunload', saveState);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
