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

  const DEFAULT_SIG_PATHS = {
    sigCreator: 'assets/sig-elizabeth.png',
    sigApprover: 'assets/sig-oguta.png'
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

  async function loadDefaultSignatures() {
    // Elizabeth → Creator (ECK); Oguta → Approver (B. O). Transparent PNG assets.
    for (const id of Object.keys(DEFAULT_SIG_PATHS)) {
      const url = await fetchAsDataUrl(DEFAULT_SIG_PATHS[id]);
      if (url) {
        if (pads[id]) pads[id].clear();
        sigFiles[id] = url;
        showSigPreview(id, url);
      }
    }
    // Client never has a default company signature
    if (pads.sigClient) pads.sigClient.clear();
    sigFiles.sigClient = null;
    showSigPreview('sigClient', null);
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
    await loadDefaultSignatures();
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
    if (pendingSigs) {
      setTimeout(() => applySignatures(pendingSigs), 50);
    } else {
      // Fresh defaults: auto-attach Elizabeth (Creator) & Oguta (Approver)
      setTimeout(() => {
        loadDefaultSignatures().then(() => saveState());
      }, 50);
    }
    loadLogo();
    window.addEventListener('beforeunload', saveState);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
