const PDFDocument = require('pdfkit');
const https = require('https');
const http = require('http');

// Fetch a remote URL as a Buffer, following up to 5 redirects
// Sends browser-like headers so CDNs (e.g. Facebook) serve the image
const fetchBuf = (url, hops = 5) =>
  new Promise((resolve) => {
    if (!url || typeof url !== 'string') return resolve(null);
    const mod = url.startsWith('https') ? https : http;
    const reqOpts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.facebook.com/',
      },
    };
    const req = mod.get(url, reqOpts, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops > 0) {
        res.resume();
        return resolve(fetchBuf(res.headers.location, hops - 1));
      }
      // Accept image/* or application/octet-stream — magic bytes confirm real images
      const ct = res.headers['content-type'] || '';
      const couldBeImage = ct.startsWith('image/') || ct === 'application/octet-stream' || ct.includes('jpeg') || ct.includes('png');
      if (!couldBeImage) { res.resume(); return resolve(null); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 4) return resolve(null);
        const isImg =
          (buf[0] === 0x89 && buf[1] === 0x50) ||
          (buf[0] === 0xFF && buf[1] === 0xD8) ||
          (buf[0] === 0x47 && buf[1] === 0x49) ||
          (buf[0] === 0x42 && buf[1] === 0x4D) ||
          buf.toString('ascii', 0, 4) === 'RIFF';
        resolve(isImg ? buf : null);
      });
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });

const WATERMARK_ORANGE = '#e86b00';

/** Rotated company name, used when there is no logo image to fall back on. */
const drawTextWatermark = (doc) => {
  const pw = doc.page.width;
  const ph = doc.page.height;
  doc.opacity(0.10);
  doc.rotate(-40, { origin: [pw / 2, ph / 2] });
  doc.fontSize(52).font('Helvetica-Bold').fillColor(WATERMARK_ORANGE)
    .text('DAN & DOR\nSOLAR', 0, ph / 2 - 60, { width: pw, align: 'center', lineGap: 4 });
  doc.rotate(40, { origin: [pw / 2, ph / 2] });
};

/**
 * Draw the company logo faintly behind the content of the current page.
 *
 * Kept very light on purpose: this sits *under* body text, so anything much
 * stronger makes the text below it hard to read on a printed sheet.
 */
const drawWatermark = (doc, logoBuf, opts = {}) => {
  // doc.text moves the text cursor, and the watermark must not disturb where
  // the caller was about to write — save/restore only covers graphics state.
  const cx = doc.x;
  const cy = doc.y;
  doc.save();
  try {
    if (logoBuf) {
      const pw = doc.page.width;
      const ph = doc.page.height;
      const w = Math.min(opts.width || 330, pw * 0.62);
      doc.opacity(opts.opacity ?? 0.13);
      // Vertically a little above centre so the mark sits behind the body of
      // the page rather than the signature block at the foot.
      doc.image(logoBuf, (pw - w) / 2, ph * 0.34, { width: w });
    } else {
      drawTextWatermark(doc);
    }
  } catch {
    // Unsupported or corrupt image — the text mark still identifies the sheet.
    try { drawTextWatermark(doc); } catch {}
  }
  doc.restore();
  doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);
  doc.x = cx;
  doc.y = cy;
};

/**
 * Watermark the current page and every page added afterwards.
 *
 * These generators add pages mid-flow (`doc.addPage()` when a section will not
 * fit), so a one-off call would only ever mark page 1. `pageAdded` fires before
 * any content is written to the new page, which is exactly what a watermark
 * needs — it has to be underneath.
 */
const attachWatermark = (doc, logoBuf, opts = {}) => {
  if (doc.page) drawWatermark(doc, logoBuf, opts);
  doc.on('pageAdded', () => drawWatermark(doc, logoBuf, opts));
};

/**
 * Generate a thermal receipt PDF for a sale.
 * @param {Object} saleData - Sale document with items populated
 * @returns {Promise<Buffer>}
 */
const generateReceipt = async (saleData, options = {}) => {
  const logoBuf = await fetchBuf(options.logoUrl || null);
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [226, 800],
        margins: { top: 10, bottom: 10, left: 10, right: 10 },
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const {
        invoice_no, customer_name, customer_phone, items,
        subtotal, discount, discount_type, cart_total, total_amount,
        debt_amount, payment_method, payment_status, sale_date, user_id,
        payments, points_earned, points_redeemed, loyalty_discount,
      } = saleData;

      const servedBy = options.servedBy || options.cashierName || user_id?.username || 'Staff';
      const companyName = options.companyName || 'DAN & DOR SOLAR COMPANY LIMITED';
      const companyAddress = options.companyAddress || 'Bogoso, Western Region';
      const companyPhone = options.companyPhone || '+233 595413632';
      const grandTotal = cart_total || total_amount || 0;
      const discountAmount = Math.max(0, (subtotal || 0) - grandTotal);

      const W = 206; // page width minus margins (226 - 10 - 10)

      // Header
      if (logoBuf) {
        try {
          doc.image(logoBuf, (226 - 80) / 2, doc.y, { width: 80 });
          doc.moveDown(0.4);
        } catch {}
      }
      doc.fontSize(9).font('Helvetica-Bold').text(companyName, 10, doc.y, { width: W, align: 'center' });
      if (companyAddress) doc.fontSize(7).font('Helvetica').text(companyAddress, 10, doc.y, { width: W, align: 'center' });
      if (companyPhone) doc.fontSize(7).text(`Tel: ${companyPhone}`, 10, doc.y, { width: W, align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(7).text('--------------------------------', { align: 'center' });
      doc.fontSize(8).font('Helvetica-Bold').text('SALES RECEIPT', { align: 'center' });
      doc.fontSize(7).font('Helvetica').text('--------------------------------', { align: 'center' });

      // Invoice info
      doc.fontSize(7);
      doc.text(`Invoice: ${invoice_no}`);
      doc.text(`Date: ${new Date(sale_date || Date.now()).toLocaleString('en-GH')}`);
      doc.text(`Served by: ${servedBy}`);
      if (customer_name) doc.text(`Customer: ${customer_name}`);
      if (customer_phone) doc.text(`Phone: ${customer_phone}`);

      doc.fontSize(7).text('--------------------------------', { align: 'center' });

      // Items header
      doc.fontSize(7).font('Helvetica-Bold');
      doc.text('Item                  Qty   Price    Total');
      doc.font('Helvetica');
      doc.fontSize(7).text('--------------------------------', { align: 'center' });

      (items || []).forEach((item) => {
        const name = (item.product_name || '').substring(0, 18).padEnd(18);
        const qty = String(item.quantity).padStart(4);
        const price = `GHC${Number(item.unit_price).toFixed(2)}`.padStart(8);
        const total = `GHC${Number(item.total).toFixed(2)}`.padStart(8);
        doc.text(`${name} ${qty} ${price} ${total}`);
      });

      doc.fontSize(7).text('--------------------------------', { align: 'center' });

      // Totals
      doc.fontSize(7);
      doc.text(`Subtotal:              GHC${Number(subtotal || 0).toFixed(2)}`);
      if (discountAmount > 0) {
        const discStr = discount_type === 'percentage' ? `${discount}%` : `GHC${discountAmount.toFixed(2)}`;
        doc.text(`Discount (${discStr}):  -GHC${discountAmount.toFixed(2)}`);
      }
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text(`TOTAL:                 GHC${Number(grandTotal).toFixed(2)}`);
      doc.fontSize(7).font('Helvetica');
      if (debt_amount > 0) {
        doc.text(`Paid:                  GHC${Number(total_amount || 0).toFixed(2)}`);
        doc.font('Helvetica-Bold').text(`BALANCE DUE:           GHC${Number(debt_amount).toFixed(2)}`).font('Helvetica');
      }
      if (loyalty_discount > 0) {
        doc.text(`Points discount:      -GHC${Number(loyalty_discount).toFixed(2)}`);
      }
      doc.text(`Payment: ${(payment_method || '').replace(/_/g, ' ').toUpperCase()}`);
      // Split tenders, itemised so the customer can see how it was settled
      if (Array.isArray(payments) && payments.length > 1) {
        payments.forEach((p) => {
          const label = `  ${(p.method || '').replace(/_/g, ' ')}`.padEnd(22);
          doc.text(`${label}GHC${Number(p.amount).toFixed(2)}`);
        });
      }
      doc.text(`Status: ${(payment_status || '').toUpperCase()}`);

      if (points_earned > 0 || points_redeemed > 0) {
        doc.fontSize(7).text('--------------------------------', { align: 'center' });
        if (points_redeemed > 0) doc.text(`Points redeemed: ${points_redeemed}`);
        if (points_earned > 0) doc.text(`Points earned: ${points_earned}`);
      }

      doc.fontSize(7).text('--------------------------------', { align: 'center' });

      // QR code — scans through to the public receipt page
      if (options.qrBuffer) {
        try {
          const qrSize = 90;
          doc.moveDown(0.3);
          doc.image(options.qrBuffer, (226 - qrSize) / 2, doc.y, { width: qrSize });
          doc.y += qrSize + 4;
          doc.fontSize(6).text('Scan to view this receipt online', 10, doc.y, { width: W, align: 'center' });
          doc.fontSize(7).text('--------------------------------', { align: 'center' });
        } catch {}
      }

      doc.fontSize(7).text('Thank you for your business!', { align: 'center' });
      doc.text('Powered by ITTEK Solution', { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Generate a credit agreement PDF (A4).
 * @param {Object} agreementData - CreditAgreement document
 * @param {Object} options - { logoUrl }
 * @returns {Promise<Buffer>}
 */
const generateCreditAgreement = async (agreementData, options = {}) => {
  const [customerPhotoBuf, guarantorPhotoBuf, logoBuf] = await Promise.all([
    fetchBuf(agreementData.customer_passport_url),
    fetchBuf(agreementData.guarantor_passport_url),
    fetchBuf(options.logoUrl || null),
  ]);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 50, right: 50 }, autoFirstPage: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ML = 50;
      const W = 495;
      const ORANGE = '#e86b00';
      const LGRAY = '#777777';

      // These were read from an outer scope that does not exist here, so every
      // credit agreement threw a ReferenceError before a byte was written.
      const company = options.company || {};
      const companyAddress = company.address || 'Bogoso, Western Region';
      const companyPhone = company.phone || '+233 595413632';

      const {
        customer_name = '', customer_phone = '', customer_address = '',
        document_type = '', id_number = '',
        product_type = '', serial_number = '',
        total_amount = 0, down_payment = 0, payment_plan = 'weekly',
        guarantor_name = '', guarantor_phone = '', guarantor_address = '', guarantor_ghana_card = '',
        start_date,
      } = agreementData;

      const balance = Math.max(0, total_amount - down_payment);
      const installment = balance > 0 ? balance / 3 : 0;
      const planDays = { daily: 1, weekly: 7, monthly: 30 };
      const planLabel = { daily: 'Day', weekly: 'Week', monthly: 'Month' };
      const days = planDays[payment_plan] || 7;
      const start = new Date(start_date || new Date());
      const dueDates = [1, 2, 3].map((n) => {
        const d = new Date(start);
        d.setDate(d.getDate() + n * days);
        return d.toLocaleDateString('en-GH');
      });

      // ── Helpers ──────────────────────────────────────────────────────────────

      const resetColors = () => {
        doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);
      };

      const sectionTitle = (text, y) => {
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor(ORANGE).text(text, ML, y, { width: W });
        const lineY = y + 11;
        doc.moveTo(ML, lineY).lineTo(ML + W, lineY).lineWidth(0.8).strokeColor(ORANGE).stroke();
        resetColors();
        return lineY + 4;
      };

      const drawField = (label, value, x, y, width) => {
        doc.fontSize(6).font('Helvetica-Bold').fillColor(LGRAY).text(label, x, y, { width, lineBreak: false });
        doc.fontSize(8).font('Helvetica').fillColor('#111111').text(String(value || '—'), x, y + 8, { width, lineBreak: false });
        doc.moveTo(x, y + 18).lineTo(x + width, y + 18).lineWidth(0.3).strokeColor('#cccccc').stroke();
        resetColors();
      };

      const drawPhotoBox = (x, y, buf, topLabel) => {
        const PW = 62; const PH = 72;
        doc.rect(x, y, PW, PH).lineWidth(0.8).strokeColor('#aaaaaa').stroke();
        if (buf) {
          try { doc.image(buf, x + 2, y + 2, { width: PW - 4, height: PH - 4, cover: [PW - 4, PH - 4] }); } catch {}
        } else {
          doc.moveTo(x + 2, y + 2).lineTo(x + PW - 2, y + PH - 2).lineWidth(0.4).strokeColor('#dddddd').stroke();
          doc.moveTo(x + PW - 2, y + 2).lineTo(x + 2, y + PH - 2).lineWidth(0.4).strokeColor('#dddddd').stroke();
          doc.fontSize(6.5).fillColor('#aaaaaa').text('PASSPORT\nPHOTO', x, y + PH / 2 - 8, { width: PW, align: 'center' });
        }
        doc.fontSize(6).fillColor(LGRAY).text(topLabel, x, y + PH + 3, { width: PW, align: 'center' });
        resetColors();
      };

      // Watermark on this page and on any continuation page.
      attachWatermark(doc, logoBuf);

      // ── Header: passport photos + company info ─────────────────────────────
      const H_Y = 42;
      const PHOTO_W = 62;
      const PHOTO_H = 72;

      drawPhotoBox(ML, H_Y, customerPhotoBuf, 'CUSTOMER');
      drawPhotoBox(ML + W - PHOTO_W, H_Y, guarantorPhotoBuf, 'GUARANTOR');

      const cX = ML + PHOTO_W + 5;
      const cW = W - PHOTO_W * 2 - 10;
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#111111')
        .text('DAN & DOR SOLAR COMPANY LIMITED', cX, H_Y + 8, { width: cW, align: 'center' });
      doc.fontSize(8).font('Helvetica').fillColor(LGRAY)
        .text(`${companyAddress}  |  Tel: ${companyPhone}`, cX, H_Y + 28, { width: cW, align: 'center' });
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor(ORANGE)
        .text('CREDIT SALE AGREEMENT', cX, H_Y + 46, { width: cW, align: 'center' });
      resetColors();

      let y = H_Y + PHOTO_H + 14;

      // ── Separator ─────────────────────────────────────────────────────────────
      doc.moveTo(ML, y).lineTo(ML + W, y).lineWidth(1.2).strokeColor(ORANGE).stroke();
      resetColors();
      y += 10;

      // ── Customer Details ──────────────────────────────────────────────────────
      y = sectionTitle('CUSTOMER DETAILS', y);
      const c3 = (W - 10) / 3;
      drawField('Customer Name', customer_name, ML, y, c3 - 4);
      drawField('Document Type', document_type, ML + c3, y, c3 - 4);
      drawField('ID Number', id_number, ML + c3 * 2, y, c3 - 4);
      y += 26;
      drawField('Date', start ? start.toLocaleDateString('en-GH') : '—', ML, y, c3 - 4);
      drawField('Location', customer_address, ML + c3, y, c3 - 4);
      drawField('Phone / Tel', customer_phone, ML + c3 * 2, y, c3 - 4);
      y += 24;

      // ── Product & Payment Terms ────────────────────────────────────────────────
      y = sectionTitle('PRODUCT AND PAYMENT TERMS', y);
      drawField('Product Type', product_type, ML, y, c3 - 4);
      drawField('Serial Number', serial_number || '—', ML + c3, y, c3 - 4);
      drawField('Down Payment (GHC)', 'GHC ' + Number(down_payment).toFixed(2), ML + c3 * 2, y, c3 - 4);
      y += 26;

      const c2 = (W - 6) / 2;
      drawField('Payment Plan', (planLabel[payment_plan] || 'Week') + 'ly', ML, y, c2 - 3);
      drawField('Loan Total Amount (GHC)', 'GHC ' + Number(total_amount).toFixed(2), ML + c2 + 6, y, c2 - 3);
      y += 26;

      // Balance display
      doc.fontSize(6.5).font('Helvetica-Bold').fillColor(LGRAY).text('Balance (Loan Total - Down Payment)', ML, y);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(ORANGE)
        .text('GHC ' + balance.toFixed(2), ML, y + 8);
      resetColors();
      y += 26;

      // Payment schedule table
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#111').text('Payment Schedule (3 equal instalments):', ML, y);
      y += 12;

      const TH = 15;
      const tCols = [W * 0.22, W * 0.44, W * 0.34];
      const tX = ML;

      // Table header
      doc.fillColor(ORANGE).rect(tX, y, W, TH).fill();
      ['Period', 'Due Date', 'Amount (GHC)'].forEach((h, i) => {
        const cx = tX + tCols.slice(0, i).reduce((a, b) => a + b, 0);
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#fff')
          .text(h, cx + 4, y + 4, { width: tCols[i] - 6, align: 'center', lineBreak: false });
      });
      y += TH;

      [1, 2, 3].forEach((n, ri) => {
        doc.fillColor(ri % 2 === 0 ? '#fff9f5' : '#ffffff').rect(tX, y, W, TH).fill();
        doc.strokeColor('#e5e7eb').lineWidth(0.4).rect(tX, y, W, TH).stroke();
        resetColors();
        const row = [
          (planLabel[payment_plan] || 'Week') + ' ' + n,
          dueDates[n - 1],
          'GHC ' + installment.toFixed(2),
        ];
        row.forEach((cell, ci) => {
          const cx = tX + tCols.slice(0, ci).reduce((a, b) => a + b, 0);
          doc.fontSize(7.5).font('Helvetica').fillColor('#111')
            .text(cell, cx + 4, y + 4, { width: tCols[ci] - 6, align: 'center', lineBreak: false });
        });
        y += TH;
      });

      // Total row
      doc.fillColor('#fff3e0').rect(tX, y, W, TH).fill();
      doc.strokeColor(ORANGE).lineWidth(0.8).rect(tX, y, W, TH).stroke();
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(ORANGE)
        .text('TOTAL BALANCE', tX + 3, y + 4, { width: tCols[0] + tCols[1] - 6, align: 'right', lineBreak: false });
      doc.text('GHC ' + balance.toFixed(2), tX + tCols[0] + tCols[1] + 3, y + 4, { width: tCols[2] - 6, align: 'center', lineBreak: false });
      resetColors();
      y += TH + 8;

      // ── Guarantor Details ─────────────────────────────────────────────────────
      y = sectionTitle('GUARANTOR DETAILS', y);
      const c4 = (W - 12) / 4;
      drawField('Guarantor Name', guarantor_name, ML, y, c4 - 3);
      drawField('Ghana Card No.', guarantor_ghana_card || '—', ML + c4 + 4, y, c4 - 3);
      drawField('Location', guarantor_address, ML + (c4 + 4) * 2, y, c4 - 3);
      drawField('Phone Number', guarantor_phone, ML + (c4 + 4) * 3, y, c4 - 3);
      y += 24;

      // ── Agreement Text ────────────────────────────────────────────────────────
      y = sectionTitle('CUSTOMER AGREEMENT', y);
      const custText =
        'I, ' + customer_name + ', enter into this agreement with DAN & DOR SOLAR COMPANY LIMITED ("the Company") of my own free will. ' +
        'I confirm that the information I have given is true, and I understand that this is a legally binding contract.\n' +
        'I agree to pay each instalment in full and on the due date shown in the schedule above. Ownership of the goods remains ' +
        'with the Company until the total amount has been paid in full. Until then I may not sell, pledge, hire out, or part with ' +
        'the goods, and I must keep them in good condition.\n' +
        'If I fail to pay on the due date, I agree that the Company may repossess the goods and recover any outstanding balance, ' +
        'and that one third (1/3) of my down payment will be refunded to me.';
      doc.fontSize(7).font('Helvetica').fillColor('#222222').text(custText, ML, y, { width: W, lineGap: 0.5 });
      y = doc.y + 6;

      // ── Default and Enforcement ────────────────────────────────────────────
      // One sheet whenever the content allows, spilling to a second only when it
      // genuinely does not fit. The tail is measured with heightOfString rather
      // than estimated — a guessed allowance forced a page break that was not
      // needed once the layout was tightened.
      //
      // Enforcement, the guarantor undertaking and the signatures move together:
      // a signature block stranded alone on sheet two would let someone sign
      // without the terms in front of them.
      const enforceText =
        '1. If any instalment remains unpaid for fourteen (14) days after its due date, the whole outstanding balance becomes ' +
        'due immediately, and the Company may repossess the goods without further notice.\n' +
        '2. Should the customer refuse or neglect to pay, the Company shall be entitled to recover the outstanding balance ' +
        'through lawful debt-recovery proceedings before a court of competent jurisdiction in the Republic of Ghana. ' +
        'All reasonable costs of recovery, including legal fees, shall be borne by the customer.\n' +
        '3. The goods remain the property of the Company until paid for in full. Selling, pledging, hiding or otherwise ' +
        'disposing of them, or giving false information in order to obtain them, may constitute a criminal offence and may be ' +
        'reported to the Ghana Police Service for investigation and prosecution.\n' +
        '4. Where the customer defaults, the guarantor named below becomes liable for the full outstanding balance.';

      const guarText =
        'I, ' + guarantor_name + ', stand as guarantor for ' + customer_name + '. I confirm that I know the customer personally ' +
        'and I have read and understood this agreement. If the customer fails to pay any amount when it falls due, I undertake to ' +
        'pay that amount to the Company on demand, and I accept that the Company may pursue the same remedies against me as ' +
        'against the customer.';

      const A4_BOTTOM = 802 - 40;
      const SECTION_H = 15;   // heading + rule + gap
      const SIG_BLOCK_H = 86; // signature boxes, labels and date line

      doc.fontSize(7).font('Helvetica');
      const tailHeight =
        SECTION_H + doc.heightOfString(enforceText, { width: W, lineGap: 0.5 }) + 6 +
        SECTION_H + doc.heightOfString(guarText, { width: W, lineGap: 0.5 }) + 8 +
        SECTION_H + SIG_BLOCK_H;

      if (y + tailHeight > A4_BOTTOM) {
        doc.addPage();
        y = 50;
      }

      y = sectionTitle('DEFAULT AND ENFORCEMENT', y);
      doc.fontSize(7).font('Helvetica').fillColor('#222222').text(enforceText, ML, y, { width: W, lineGap: 0.5 });
      y = doc.y + 6;

      // ── Guarantor Section ─────────────────────────────────────────────────────
      y = sectionTitle('GUARANTOR SECTION', y);
      doc.fontSize(7).font('Helvetica').fillColor('#222222').text(guarText, ML, y, { width: W, lineGap: 0.5 });
      y = doc.y + 8;

      // ── Signatories ───────────────────────────────────────────────────────────
      // Backstop only: the tail measurement above normally keeps these with the
      // clauses. Never drag the block upwards to save a page — that printed the
      // signature boxes on top of the guarantor text.
      if (y + SIG_BLOCK_H > A4_BOTTOM) {
        doc.addPage();
        y = 50;
      }

      y = sectionTitle('SIGNATORIES', y);

      const sigLabels = ['CEO', 'MANAGER', 'CUSTOMER', 'GUARANTOR'];
      const sigSubNames = ['', '', customer_name, guarantor_name];
      const sigW = (W - 12) / 4;

      sigLabels.forEach((label, i) => {
        const sx = ML + i * (sigW + 4);
        doc.rect(sx, y, sigW, 36).lineWidth(0.5).strokeColor('#cccccc').stroke();
        doc.fontSize(6).fillColor('#bbbbbb').text('Signature', sx + 2, y + 4, { width: sigW - 4, align: 'center', lineBreak: false });
        doc.moveTo(sx + 6, y + 29).lineTo(sx + sigW - 6, y + 29).lineWidth(0.5).strokeColor('#999999').stroke();
        resetColors();
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#111').text(label, sx, y + 39, { width: sigW, align: 'center', lineBreak: false });
        if (sigSubNames[i]) {
          doc.fontSize(6).font('Helvetica').fillColor(LGRAY).text(sigSubNames[i], sx, y + 48, { width: sigW, align: 'center', lineBreak: false });
        }
        resetColors();
      });

      y += 60;
      doc.fontSize(7).font('Helvetica').fillColor(LGRAY)
        .text('Date: ___________________________', ML + W / 2 - 60, y);
      resetColors();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};


/**
 * Generate a Pay & Pick Later (layaway) agreement — A4.
 *
 * Deliberately NOT a copy of the credit sale agreement. There the customer
 * takes the goods away and owes money, so the clauses are about repossession.
 * Here the shop keeps the goods until they are paid for, so the risks are the
 * reverse: the customer needs certainty that their money is held against
 * specific reserved items and that the price won't move, and the shop needs a
 * clear rule for abandoned plans and uncollected goods.
 *
 * @param {Object} layaway - Layaway document (plain object)
 * @param {Object} options - { logoUrl, company, terms }
 * @returns {Promise<Buffer>}
 */
const generateLayawayAgreement = async (layaway, options = {}) => {
  const logoBuf = await fetchBuf(options.logoUrl || null);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 50, right: 50 } });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ML = 50;
      const W = 495;
      const ORANGE = '#e86b00';
      const LGRAY = '#777777';
      const A4_BOTTOM = 802 - 40;

      attachWatermark(doc, logoBuf);

      const company = options.company || {};
      const companyName = company.name || 'DAN & DOR SOLAR COMPANY LIMITED';
      const companyAddress = company.address || 'Bogoso, Western Region';
      const companyPhone = company.phone || '+233 595413632';

      const terms = options.terms || {};
      const cancelFee = Number(terms.cancellation_fee_percent ?? 10);
      const collectionDays = Number(terms.collection_days ?? 30);
      const defaultDays = Number(terms.default_after_days ?? 30);

      const {
        reference, customer_name = '', customer_phone = '', customer_address = '',
        customer_id_type = '', customer_id_number = '', items = [],
        total_amount = 0, down_payment = 0, balance = 0,
        installments = 0, frequency = 'weekly', schedule = [], createdAt,
      } = layaway;

      const reset = () => doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);

      const sectionTitle = (text, yy) => {
        doc.fontSize(9).font('Helvetica-Bold').fillColor(ORANGE).text(text, ML, yy, { width: W });
        const lineY = yy + 13;
        doc.moveTo(ML, lineY).lineTo(ML + W, lineY).lineWidth(0.8).strokeColor(ORANGE).stroke();
        reset();
        return lineY + 6;
      };

      const drawField = (lbl, value, x, yy, width) => {
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor(LGRAY).text(lbl, x, yy, { width, lineBreak: false });
        doc.fontSize(8.5).font('Helvetica').fillColor('#111111').text(String(value || '—'), x, yy + 9, { width, lineBreak: false });
        doc.moveTo(x, yy + 21).lineTo(x + width, yy + 21).lineWidth(0.3).strokeColor('#cccccc').stroke();
        reset();
      };

      // ── Header ──────────────────────────────────────────────────────────────
      let y = 42;
      if (logoBuf) {
        try { doc.image(logoBuf, ML, y, { width: 52 }); } catch {}
      }
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#111111')
        .text(companyName, ML + 60, y + 4, { width: W - 60 });
      doc.fontSize(8).font('Helvetica').fillColor(LGRAY)
        .text(companyAddress + '  |  Tel: ' + companyPhone, ML + 60, y + 22, { width: W - 60 });
      doc.fontSize(11).font('Helvetica-Bold').fillColor(ORANGE)
        .text('PAY & PICK LATER AGREEMENT', ML + 60, y + 36, { width: W - 60 });
      reset();

      y += 62;
      doc.moveTo(ML, y).lineTo(ML + W, y).lineWidth(1.2).strokeColor(ORANGE).stroke();
      reset();
      y += 10;

      doc.fontSize(8).font('Helvetica-Bold').fillColor('#111')
        .text('Agreement No: ' + (reference || '—'), ML, y, { width: W / 2, lineBreak: false });
      doc.font('Helvetica').fillColor(LGRAY)
        .text('Date: ' + new Date(createdAt || Date.now()).toLocaleDateString('en-GH'),
          ML + W / 2, y, { width: W / 2, align: 'right', lineBreak: false });
      reset();
      y += 18;

      // ── Customer ────────────────────────────────────────────────────────────
      y = sectionTitle('CUSTOMER DETAILS', y);
      const c3 = (W - 10) / 3;
      drawField('Full Name', customer_name, ML, y, c3 - 4);
      drawField('Phone Number', customer_phone, ML + c3, y, c3 - 4);
      drawField('Address / Location', customer_address, ML + c3 * 2, y, c3 - 4);
      y += 30;
      const c2 = (W - 6) / 2;
      drawField('ID Type', customer_id_type, ML, y, c2 - 3);
      drawField('ID Number', customer_id_number, ML + c2 + 6, y, c2 - 3);
      y += 30;

      // ── Goods reserved ──────────────────────────────────────────────────────
      y = sectionTitle('GOODS RESERVED', y);
      const TH = 17;
      const cols = [W * 0.50, W * 0.12, W * 0.19, W * 0.19];
      doc.fillColor(ORANGE).rect(ML, y, W, TH).fill();
      ['Item', 'Qty', 'Unit Price', 'Total'].forEach((h, i) => {
        const cx = ML + cols.slice(0, i).reduce((a, b) => a + b, 0);
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#fff')
          .text(h, cx + 4, y + 5, { width: cols[i] - 8, align: i === 0 ? 'left' : 'center', lineBreak: false });
      });
      y += TH;

      items.forEach((it, ri) => {
        doc.fillColor(ri % 2 === 0 ? '#fff9f5' : '#ffffff').rect(ML, y, W, TH).fill();
        doc.strokeColor('#e5e7eb').lineWidth(0.4).rect(ML, y, W, TH).stroke();
        reset();
        const name = it.product_name + (it.variant_name ? ' — ' + it.variant_name : '');
        const row = [name, String(it.quantity), 'GHC ' + Number(it.unit_price).toFixed(2), 'GHC ' + Number(it.total).toFixed(2)];
        row.forEach((cell, ci) => {
          const cx = ML + cols.slice(0, ci).reduce((a, b) => a + b, 0);
          doc.fontSize(7.5).font('Helvetica').fillColor('#111')
            .text(cell, cx + 4, y + 5, { width: cols[ci] - 8, align: ci === 0 ? 'left' : 'center', lineBreak: false });
        });
        y += TH;
      });

      doc.fillColor('#fff3e0').rect(ML, y, W, TH).fill();
      doc.strokeColor(ORANGE).lineWidth(0.8).rect(ML, y, W, TH).stroke();
      doc.fontSize(8).font('Helvetica-Bold').fillColor(ORANGE)
        .text('AGREED PRICE', ML + 4, y + 5, { width: W * 0.62, align: 'right', lineBreak: false });
      doc.text('GHC ' + Number(total_amount).toFixed(2), ML + W * 0.62 + 4, y + 5, { width: W * 0.38 - 8, align: 'center', lineBreak: false });
      reset();
      y += TH + 10;

      // ── Payment plan ────────────────────────────────────────────────────────
      y = sectionTitle('PAYMENT PLAN', y);
      const c4 = (W - 12) / 4;
      drawField('Paid Today', 'GHC ' + Number(down_payment).toFixed(2), ML, y, c4 - 3);
      drawField('Balance', 'GHC ' + Number(balance).toFixed(2), ML + c4 + 4, y, c4 - 3);
      drawField('Instalments', String(installments), ML + (c4 + 4) * 2, y, c4 - 3);
      drawField('Frequency', frequency.charAt(0).toUpperCase() + frequency.slice(1), ML + (c4 + 4) * 3, y, c4 - 3);
      y += 30;

      if (schedule.length) {
        const SH = 15;
        const sCols = [W * 0.15, W * 0.5, W * 0.35];
        doc.fillColor('#f3f4f6').rect(ML, y, W, SH).fill();
        ['No.', 'Due Date', 'Amount (GHC)'].forEach((h, i) => {
          const cx = ML + sCols.slice(0, i).reduce((a, b) => a + b, 0);
          doc.fontSize(7).font('Helvetica-Bold').fillColor('#374151')
            .text(h, cx + 4, y + 4, { width: sCols[i] - 8, align: 'center', lineBreak: false });
        });
        reset();
        y += SH;

        // Cap the printed rows so a long plan can't run away with the page.
        schedule.slice(0, 12).forEach((entry, i) => {
          doc.strokeColor('#e5e7eb').lineWidth(0.3).rect(ML, y, W, SH).stroke();
          reset();
          const row = [
            String(i + 1),
            new Date(entry.due_date).toLocaleDateString('en-GH'),
            'GHC ' + Number(entry.amount).toFixed(2),
          ];
          row.forEach((cell, ci) => {
            const cx = ML + sCols.slice(0, ci).reduce((a, b) => a + b, 0);
            doc.fontSize(7.5).font('Helvetica').fillColor('#111')
              .text(cell, cx + 4, y + 4, { width: sCols[ci] - 8, align: 'center', lineBreak: false });
          });
          y += SH;
        });
        if (schedule.length > 12) {
          doc.fontSize(7).font('Helvetica-Oblique').fillColor(LGRAY)
            .text('… and ' + (schedule.length - 12) + ' further instalments as scheduled.', ML, y + 2, { width: W });
          reset();
          y += 14;
        }
        y += 8;
      }

      // ── Terms ───────────────────────────────────────────────────────────────
      const TAIL_H = 300;
      if (y + TAIL_H > A4_BOTTOM) { doc.addPage(); y = 50; }

      y = sectionTitle('TERMS OF THIS AGREEMENT', y);
      const termsText =
        '1. The goods listed above are reserved for the customer and remain in the custody and ownership of the ' +
        'Company until the agreed price has been paid in full. They will not be sold to any other person while ' +
        'this agreement is in force.\n' +
        '2. The agreed price holds only while payment is being completed as scheduled. If the agreement is not ' +
        'paid up in full and the cost of the goods rises in the meantime, the Company reserves the right to add ' +
        'the increase to the outstanding balance. The customer will be informed of any such adjustment, and the ' +
        'revised balance will apply from that date.\n' +
        '3. The customer undertakes to pay each instalment on or before the due date shown above. Payments may be ' +
        'made in person at the shop, and a receipt will be issued for every payment.\n' +
        '4. The goods will be released to the customer only when the balance reaches zero. Proof of identity may ' +
        'be required at collection.\n' +
        '5. The customer should collect the goods within ' + collectionDays + ' days of the final payment.\n' +
        '6. If no payment is made for ' + defaultDays + ' days, the Company may cancel this agreement and return the ' +
        'goods to stock. In that event the amounts already paid will be refunded to the customer, less an ' +
        'administrative charge of ' + cancelFee + '% of the agreed price.\n' +
        '7. The customer may cancel at any time on the same terms as clause 6.\n' +
        '8. This agreement is governed by the laws of the Republic of Ghana. Any dispute that cannot be settled ' +
        'between the parties may be referred to a court of competent jurisdiction.';
      doc.fontSize(7.5).font('Helvetica').fillColor('#222222').text(termsText, ML, y, { width: W, lineGap: 1 });
      y = doc.y + 12;

      // ── Signatures ──────────────────────────────────────────────────────────
      const SIG_H = 96;
      if (y + SIG_H > A4_BOTTOM) { doc.addPage(); y = 50; }

      y = sectionTitle('SIGNATURES', y);
      const sig = [['CUSTOMER', customer_name], ['FOR THE COMPANY', '']];
      const sigW = (W - 20) / 2;
      sig.forEach(([lbl, sub], i) => {
        const sx = ML + i * (sigW + 20);
        doc.rect(sx, y, sigW, 44).lineWidth(0.5).strokeColor('#cccccc').stroke();
        doc.fontSize(6).fillColor('#bbbbbb').text('Signature', sx + 3, y + 4, { width: sigW - 6, lineBreak: false });
        doc.moveTo(sx + 8, y + 36).lineTo(sx + sigW - 8, y + 36).lineWidth(0.5).strokeColor('#999999').stroke();
        reset();
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#111')
          .text(lbl, sx, y + 48, { width: sigW, align: 'center', lineBreak: false });
        if (sub) {
          doc.fontSize(6.5).font('Helvetica').fillColor(LGRAY)
            .text(sub, sx, y + 59, { width: sigW, align: 'center', lineBreak: false });
        }
        reset();
      });
      y += 74;
      doc.fontSize(7.5).font('Helvetica').fillColor(LGRAY)
        .text('Date: ______________________', ML, y, { width: sigW, align: 'center' });
      doc.text('Date: ______________________', ML + sigW + 20, y, { width: sigW, align: 'center' });
      reset();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};


/**
 * Generate a product price list — A4, two columns.
 *
 * Customer-facing: selling prices only. Cost price, profit margin and supplier
 * are never included, so this can be handed across the counter or pinned up in
 * the shop without leaking anything.
 *
 * @param {Array} groups - [{ category, products: [{ name, price, in_stock }] }]
 * @param {Object} options - { logoUrl, company, showStock }
 */
const generatePriceList = async (groups, options = {}) => {
  const logoBuf = await fetchBuf(options.logoUrl || null);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 45, left: 45, right: 45 } });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ML = 45;
      const W = 505;
      const ORANGE = '#e86b00';
      const LGRAY = '#777777';
      const TOP = 40;
      const BOTTOM = 802 - 45;

      attachWatermark(doc, logoBuf);

      const company = options.company || {};
      const companyName = company.name || 'DAN & DOR SOLAR COMPANY LIMITED';
      const showStock = options.showStock !== false;

      const COL_GAP = 20;
      const COL_W = (W - COL_GAP) / 2;
      let col = 0;                 // 0 = left, 1 = right
      let y = 0;
      let pageNo = 0;

      const reset = () => doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);

      const drawHeader = () => {
        pageNo += 1;
        let hy = TOP;
        if (logoBuf) {
          try { doc.image(logoBuf, ML, hy, { width: 40 }); } catch {}
        }
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#111111')
          .text(companyName, ML + 48, hy + 2, { width: W - 48 });
        doc.fontSize(8).font('Helvetica').fillColor(LGRAY)
          .text([company.address, company.phone && 'Tel: ' + company.phone].filter(Boolean).join('  |  '),
            ML + 48, hy + 19, { width: W - 48 });
        doc.fontSize(11).font('Helvetica-Bold').fillColor(ORANGE)
          .text('PRICE LIST', ML + 48, hy + 32, { width: W - 48 });
        doc.fontSize(7.5).font('Helvetica').fillColor(LGRAY)
          .text(new Date().toLocaleDateString('en-GH', { day: '2-digit', month: 'long', year: 'numeric' }),
            ML, hy + 32, { width: W, align: 'right' });
        reset();

        hy += 50;
        doc.moveTo(ML, hy).lineTo(ML + W, hy).lineWidth(1.2).strokeColor(ORANGE).stroke();
        reset();
        return hy + 12;
      };

      const columnX = () => ML + col * (COL_W + COL_GAP);

      /** Move to the next column, or the next page when both are full. */
      const nextColumn = (startY) => {
        if (col === 0) { col = 1; y = startY; return; }
        col = 0;
        doc.addPage();
        y = drawHeader();
      };

      const ensureSpace = (needed, startY) => {
        if (y + needed > BOTTOM) nextColumn(startY);
      };

      const headerY = drawHeader();
      y = headerY;

      groups.forEach((group) => {
        // Keep a category heading with at least its first row.
        ensureSpace(30, headerY);

        doc.fontSize(9).font('Helvetica-Bold').fillColor(ORANGE)
          .text(group.category || 'Uncategorised', columnX(), y, { width: COL_W });
        const lineY = y + 12;
        doc.moveTo(columnX(), lineY).lineTo(columnX() + COL_W, lineY).lineWidth(0.6).strokeColor('#e5c9b0').stroke();
        reset();
        y = lineY + 5;

        group.products.forEach((p, i) => {
          ensureSpace(15, headerY);

          if (i % 2 === 0) {
            doc.fillColor('#fbfbfb').rect(columnX(), y - 2, COL_W, 14).fill();
            reset();
          }

          const priceStr = 'GHC ' + Number(p.price).toFixed(2);
          const priceW = 62;
          const nameW = COL_W - priceW - 6;

          doc.fontSize(8).font('Helvetica').fillColor('#111111')
            .text(p.name, columnX() + 2, y, { width: nameW, ellipsis: true, lineBreak: false });
          doc.font('Helvetica-Bold').fillColor(p.in_stock === false ? LGRAY : '#111111')
            .text(priceStr, columnX() + COL_W - priceW, y, { width: priceW - 2, align: 'right', lineBreak: false });
          reset();

          if (showStock && p.in_stock === false) {
            doc.fontSize(6).fillColor('#b91c1c')
              .text('out of stock', columnX() + 2, y + 8, { width: nameW, lineBreak: false });
            reset();
            y += 6;
          }

          y += 14;
        });

        y += 8;
      });

      // Footer note on the last page
      doc.fontSize(7).font('Helvetica-Oblique').fillColor(LGRAY)
        .text('Prices are in Ghana Cedis and may change without notice. Correct as at ' +
          new Date().toLocaleDateString('en-GH') + '.',
          ML, BOTTOM + 8, { width: W, align: 'center' });
      reset();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Generate a general report PDF (A4).
 * @param {Object} reportData - Data for the report
 * @param {string} title - Report title
 * @returns {Promise<Buffer>}
 */
const generateReport = async (reportData, title = 'Report', options = {}) => {
  const logoBuf = await fetchBuf(options.logoUrl || null);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 60, right: 60 } });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      attachWatermark(doc, logoBuf);

      // Header
      doc.fontSize(16).font('Helvetica-Bold').text('DAN & DOR SOLAR COMPANY LIMITED', { align: 'center' });
      doc.fontSize(12).font('Helvetica').text('ITTEK Solution - Business Management', { align: 'center' });
      doc.moveDown(0.5);
      doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke();
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica-Bold').text(title, { align: 'center' });
      doc.fontSize(9).font('Helvetica').text('Generated: ' + new Date().toLocaleString('en-GH'), { align: 'center' });
      doc.moveDown(1);

      // Summary section
      if (reportData.summary) {
        doc.fontSize(11).font('Helvetica-Bold').text('Summary:');
        doc.moveDown(0.3);
        Object.entries(reportData.summary).forEach(([key, value]) => {
          doc.fontSize(9).font('Helvetica-Bold').text(key + ': ', { continued: true });
          doc.font('Helvetica').text(String(value));
        });
        doc.moveDown(0.5);
      }

      // Data table
      if (reportData.rows && reportData.rows.length > 0) {
        doc.fontSize(11).font('Helvetica-Bold').text('Details:');
        doc.moveDown(0.3);
        reportData.rows.forEach((row, idx) => {
          doc.fontSize(9).font(idx % 2 === 0 ? 'Helvetica' : 'Helvetica-Oblique').text(
            Object.values(row).join('  |  ')
          );
        });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateReceipt, generateCreditAgreement, generateLayawayAgreement, generatePriceList, generateReport };
