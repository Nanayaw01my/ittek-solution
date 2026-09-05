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
        '2. If the price of the goods increases before this agreement is paid off, the increase will be added to ' +
        'the balance the customer still has to pay. The customer will be told of the new balance when this ' +
        'happens.\n' +
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


/**
 * A blank A4 receipt form to be filled in by hand.
 *
 * Stationery, not a record of anything: there is no sale behind it. The shop
 * prints a stack and writes on them when the counter printer is down, the power
 * is out, or a receipt has to be written away from the system.
 *
 * The row height is derived from the space actually left between the header and
 * the signature block, so any sensible number of rows still fits on one sheet
 * rather than pushing the signatures under the footer.
 *
 * Products can optionally be filled in ahead of printing: any lines supplied
 * are printed into the top rows with their totals, and the rest stay blank for
 * the pen. Filling a form in never records a sale and never moves stock — it
 * is a sheet of paper, not a transaction.
 *
 * @param {Object} options - { logoUrl, company, rows, copies, items, customer, receiptNo, date }
 * @returns {Promise<Buffer>}
 */
const generateBlankReceiptForm = async (options = {}) => {
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
      const RULE = '#c9c9c9';
      const PAGE_BOTTOM = 802;

      const company = options.company || {};
      const companyName = company.name || 'DAN & DOR SOLAR COMPANY LIMITED';
      const companyAddress = company.address || 'Bogoso, Western Region';
      const companyPhone = company.phone || '+233 595413632';

      const rows = Math.min(30, Math.max(5, Number(options.rows) || 17));
      const copies = Math.min(50, Math.max(1, Number(options.copies) || 1));

      // Pre-filled lines, if any. Everything below is written to work equally
      // well with none of them.
      const filled = (options.items || [])
        .filter((i) => i && i.name)
        .slice(0, rows)
        .map((i) => {
          const qty = Number(i.quantity) || 0;
          const price = Number(i.unit_price) || 0;
          return { name: String(i.name), qty, price, total: +(qty * price).toFixed(2) };
        });
      const customer = options.customer || {};
      const subtotal = filled.reduce((sum, i) => sum + i.total, 0);
      const discount = Math.max(0, Number(options.discount) || 0);
      const grandTotal = Math.max(0, subtotal - discount);
      const hasItems = filled.length > 0;
      const gh = (n) => 'GHC' + Number(n).toFixed(2);

      const reset = () => doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);

      /**
       * A label with an empty ruled line beside it. `rightX` is the absolute
       * right-hand edge of the rule, not a width.
       */
      /** Write a supplied value onto one of the ruled lines, if there is one. */
      const writeOnRule = (value, x, y, rightX) => {
        if (!value) return;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#111111')
          .text(String(value), x, y, { width: rightX - x - 4, lineBreak: false });
        reset();
      };

      const blankField = (label, x, y, rightX, labelW = 62) => {
        doc.fontSize(8).font('Helvetica-Bold').fillColor(LGRAY)
          .text(label, x, y + 2, { width: labelW, lineBreak: false });
        doc.moveTo(x + labelW, y + 11).lineTo(rightX, y + 11).lineWidth(0.6).strokeColor(RULE).stroke();
        reset();
      };

      const drawForm = () => {
        // ── Header ──────────────────────────────────────────────────────────
        let y = 42;
        if (logoBuf) {
          try { doc.image(logoBuf, ML, y, { width: 52 }); } catch { /* keep the gap */ }
        }
        doc.fontSize(14.5).font('Helvetica-Bold').fillColor('#111111')
          .text(companyName, ML + 62, y + 4, { width: W - 62 });
        doc.fontSize(8.5).font('Helvetica').fillColor(LGRAY)
          .text([companyAddress, companyPhone && 'Tel: ' + companyPhone].filter(Boolean).join('  |  '),
            ML + 62, y + 23, { width: W - 62 });
        reset();

        y += 58;
        doc.moveTo(ML, y).lineTo(ML + W, y).lineWidth(1.5).strokeColor(ORANGE).stroke();
        reset();

        // ── Title, receipt number and date ──────────────────────────────────
        y += 12;
        doc.fontSize(16).font('Helvetica-Bold').fillColor(ORANGE)
          .text('OFFICIAL RECEIPT', ML, y, { width: 260 });
        blankField('Receipt No.', ML + 275, y - 2, ML + W, 62);
        blankField('Date', ML + 275, y + 18, ML + W, 62);
        writeOnRule(options.receiptNo, ML + 275 + 62 + 4, y - 1, ML + W);
        writeOnRule(options.date, ML + 275 + 62 + 4, y + 19, ML + W);
        reset();

        // ── Who it was received from ────────────────────────────────────────
        y += 46;
        blankField('Received from', ML, y, ML + W, 78);
        writeOnRule(customer.name, ML + 82, y + 1, ML + W);
        y += 22;
        blankField('Telephone', ML, y, ML + 235, 78);
        writeOnRule(customer.phone, ML + 82, y + 1, ML + 235);
        blankField('Address', ML + 255, y, ML + W, 50);
        writeOnRule(customer.address, ML + 309, y + 1, ML + W);

        // ── Items table ─────────────────────────────────────────────────────
        y += 30;
        const COLS = [
          { key: '#', x: ML, w: 26 },
          { key: 'DESCRIPTION', x: ML + 26, w: 249 },
          { key: 'QTY', x: ML + 275, w: 46 },
          { key: 'UNIT PRICE', x: ML + 321, w: 87 },
          { key: 'TOTAL', x: ML + 408, w: 87 },
        ];

        doc.rect(ML, y, W, 20).fill(ORANGE);
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
        COLS.forEach((c) => doc.text(c.key, c.x, y + 6.5, { width: c.w, align: 'center' }));
        reset();
        y += 20;

        const tableTop = y;

        // Everything below the table has a known height, so the rows take
        // whatever is left. Without this a larger row count simply ran the
        // signatures off the bottom of the sheet.
        const FOOTER_TOP = PAGE_BOTTOM - 40 - 42;
        const SIG_BLOCK_H = 96;
        const TOTALS_H = 22 + 22 + 26;
        const available = FOOTER_TOP - SIG_BLOCK_H - 12 - tableTop;
        const rowH = Math.min(26, Math.max(14, Math.floor((available - TOTALS_H) / rows)));

        for (let i = 0; i < rows; i += 1) {
          const ry = tableTop + i * rowH;
          if (i % 2 === 1) { doc.rect(ML, ry, W, rowH).fill('#faf6f2'); reset(); }
          // Pre-printed row numbers make it read as a form rather than a box.
          doc.fontSize(8.5).font('Helvetica').fillColor(filled[i] ? '#666666' : '#bbbbbb')
            .text(String(i + 1), COLS[0].x, ry + (rowH - 9) / 2, { width: COLS[0].w, align: 'center' });

          const line = filled[i];
          if (line) {
            const ty = ry + (rowH - 9) / 2;
            doc.fontSize(9).font('Helvetica').fillColor('#111111')
              .text(line.name, COLS[1].x + 6, ty, { width: COLS[1].w - 12, lineBreak: false });
            doc.text(String(line.qty), COLS[2].x, ty, { width: COLS[2].w, align: 'center' });
            doc.text(gh(line.price), COLS[3].x, ty, { width: COLS[3].w - 8, align: 'right' });
            doc.font('Helvetica-Bold')
              .text(gh(line.total), COLS[4].x, ty, { width: COLS[4].w - 8, align: 'right' });
          }
          doc.moveTo(ML, ry + rowH).lineTo(ML + W, ry + rowH).lineWidth(0.4).strokeColor(RULE).stroke();
          reset();
        }

        const tableBottom = tableTop + rows * rowH;
        doc.rect(ML, tableTop, W, rows * rowH).lineWidth(0.7).strokeColor('#b5b5b5').stroke();
        COLS.slice(1).forEach((c) => {
          doc.moveTo(c.x, tableTop).lineTo(c.x, tableBottom).lineWidth(0.5).strokeColor('#b5b5b5').stroke();
        });
        reset();
        y = tableBottom;

        // ── Totals, under the last two columns ──────────────────────────────
        const totalsX = COLS[3].x;
        const labelW = COLS[3].w;
        const valueW = COLS[4].w;
        const totalsRow = (label, h, opts = {}) => {
          doc.rect(totalsX, y, labelW + valueW, h).lineWidth(0.7).strokeColor('#b5b5b5').stroke();
          doc.moveTo(COLS[4].x, y).lineTo(COLS[4].x, y + h).lineWidth(0.5).strokeColor('#b5b5b5').stroke();
          doc.fontSize(opts.big ? 10 : 8.5).font('Helvetica-Bold').fillColor(opts.color || '#333333')
            .text(label, totalsX, y + (h - (opts.big ? 10 : 9)) / 2, { width: labelW, align: 'center' });
          if (opts.value) {
            doc.fontSize(opts.big ? 11 : 9).font('Helvetica-Bold').fillColor(opts.color || '#111111')
              .text(opts.value, COLS[4].x, y + (h - (opts.big ? 11 : 9)) / 2, { width: valueW - 8, align: 'right' });
          }
          reset();
          y += h;
        };
        totalsRow('SUBTOTAL', 22, { value: hasItems ? gh(subtotal) : null });
        totalsRow('DISCOUNT', 22, { value: discount > 0 ? '-' + gh(discount) : null });
        totalsRow('GRAND TOTAL', 26, { big: true, color: ORANGE, value: hasItems ? gh(grandTotal) : null });

        // Amount in words and payment method sit beside the totals.
        let leftY = tableBottom + 4;
        blankField('Amount in words', ML, leftY, totalsX - 10, 84);
        leftY += 22;
        doc.moveTo(ML, leftY + 11).lineTo(totalsX - 10, leftY + 11).lineWidth(0.6).strokeColor(RULE).stroke();
        reset();
        leftY += 22;
        blankField('Payment method', ML, leftY, totalsX - 10, 84);
        leftY += 22;

        // ── Signatories ─────────────────────────────────────────────────────
        y = Math.max(y, leftY) + 34;
        const sigW = (W - 40) / 2;
        [['CUSTOMER / RECEIVED BY', 'Name & Signature'], ['FOR THE COMPANY', 'Name & Signature']]
          .forEach(([lbl, sub], i) => {
            const sx = ML + i * (sigW + 40);
            doc.moveTo(sx, y).lineTo(sx + sigW, y).lineWidth(0.8).strokeColor('#888888').stroke();
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#333333')
              .text(lbl, sx, y + 6, { width: sigW, align: 'center' });
            doc.fontSize(7).font('Helvetica').fillColor(LGRAY)
              .text(sub, sx, y + 17, { width: sigW, align: 'center' });
            reset();
          });
        y += 36;
        [0, 1].forEach((i) => {
          const sx = ML + i * (sigW + 40);
          blankField('Date', sx + 20, y, sx + sigW - 20, 30);
        });

        // ── Footer ──────────────────────────────────────────────────────────
        const fy = FOOTER_TOP;
        doc.moveTo(ML, fy).lineTo(ML + W, fy).lineWidth(0.6).strokeColor('#dddddd').stroke();
        reset();
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#111111')
          .text('Thank you for your business!', ML, fy + 8, { width: W, align: 'center' });
        doc.fontSize(7.5).font('Helvetica').fillColor(LGRAY)
          .text('Goods returned are accepted subject to our terms and conditions. Please keep this receipt as proof of purchase.',
            ML, fy + 20, { width: W, align: 'center' });
        reset();
      };

      attachWatermark(doc, logoBuf);
      drawForm();
      for (let c = 1; c < copies; c += 1) {
        doc.addPage();   // pageAdded redraws the watermark
        drawForm();
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};


/**
 * An installment offer sheet (A4) — freezers, power stations, anything sold on
 * a deposit and a schedule.
 *
 * Each package gets its own page by default — that is the sheet handed to a
 * customer who has already chosen a size. Pass layout:'combined' to put all
 * of them on one page instead, for comparing.
 *
 * Either way a package shows what it costs on installment, what it costs for
 * ready cash, and exactly what hardware is in the box. Both prices sit side by
 * side and the saving for paying cash is stated rather than left to be worked
 * out.
 *
 * Carries no customer, date or reference: it is a price sheet the shop hands
 * out, not a document raised for one person. It is signed off by the manager
 * and the company rather than by a buyer.
 *
 * @param {Object} options - { logoUrl, company, title, packages, layout, latePercent, lateAfterMonths }
 * @returns {Promise<Buffer>}
 */
const generateInstallmentPlanSheet = async (options = {}) => {
  const logoBuf = await fetchBuf(options.logoUrl || null);
  const packages = options.packages || [];

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ML = 40;
      const W = 515;
      const ORANGE = '#e86b00';
      const LGRAY = '#777777';
      const RULE = '#c9c9c9';

      const company = options.company || {};
      const companyName = company.name || 'DAN & DOR SOLAR COMPANY LIMITED';
      const companyAddress = company.address || 'Bogoso, Western Region';
      const companyPhone = company.phone || '+233 595413632';

      // Weekly figures can carry pesewas (1,406.25), so decimals are kept when
      // there are any and dropped when there are none.
      const gh = (n) => 'GHC' + Number(n || 0).toLocaleString('en-GB', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });

      // Late-payment terms, taken from the first package so the sheet and the
      // plans it prints cannot drift apart.
      const title = options.title || 'INSTALLMENT PLAN';
      const latePercent = options.latePercent ?? 3;
      // A number only when every plan agrees on it.
      const sharedMonths = packages.length && packages.every((p) => p.months === packages[0].months)
        ? packages[0].months
        : null;
      const lateAfterMonths = options.lateAfterMonths ?? sharedMonths;
      const reset = () => doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);

      attachWatermark(doc, logoBuf);

      // ── Page furniture, drawn once per sheet ──────────────────────────────
      const drawHeader = (subtitle) => {
        let hy = 40;
        if (logoBuf) {
          try { doc.image(logoBuf, ML, hy, { width: 48 }); } catch { /* keep the gap */ }
        }
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#111111')
          .text(companyName, ML + 58, hy + 2, { width: W - 58 });
        doc.fontSize(8.5).font('Helvetica').fillColor(LGRAY)
          .text([companyAddress, companyPhone && 'Tel: ' + companyPhone].filter(Boolean).join('  |  '),
            ML + 58, hy + 20, { width: W - 58 });
        reset();

        hy += 52;
        doc.moveTo(ML, hy).lineTo(ML + W, hy).lineWidth(1.5).strokeColor(ORANGE).stroke();
        reset();

        hy += 10;
        doc.fontSize(15).font('Helvetica-Bold').fillColor(ORANGE)
          .text(title, ML, hy, { width: W });
        if (subtitle) {
          doc.fontSize(10).font('Helvetica').fillColor('#555555')
            .text(subtitle, ML, hy + 19, { width: W });
          hy += 16;
        }
        reset();
        return hy + 26;
      };

      /**
       * `months` is the period the page is about. A page showing one plan says
       * that plan's length; a comparison page says a number only when every
       * plan on it runs the same length, and otherwise falls back to wording
       * that cannot contradict the schedules above it.
       */
      const drawFooter = (months) => {
        const fy = 802 - 40 - 88;
        doc.moveTo(ML, fy).lineTo(ML + W, fy).lineWidth(0.6).strokeColor('#dddddd').stroke();
        reset();
        // The late-payment charge, set apart so it is not skimmed over: it is
        // the one term on this sheet that costs the customer money.
        doc.roundedRect(ML, fy + 6, W, 30, 3).fill('#fdf2e9');
        const period = months ? months + ' months' : 'agreed payment period';
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#b34700')
          .text('If the ' + period + ' pass' + (months ? '' : 'es')
            + ' and payment is not complete, an additional '
            + latePercent + '% of the total amount is charged for every week thereafter.',
            ML + 8, fy + 13, { width: W - 16, align: 'center', lineGap: 1 });
        reset();

        doc.fontSize(7.5).font('Helvetica').fillColor(LGRAY)
          .text('Goods remain the property of the Company until the agreed price is paid in full. Prices are subject to change without notice.',
            ML, fy + 44, { width: W, align: 'center' });

        const sigW = (W - 60) / 2;
        [['MANAGER', ''], ['FOR THE COMPANY', '']].forEach(([lbl], i) => {
          const sx = ML + i * (sigW + 60);
          doc.moveTo(sx, fy + 74).lineTo(sx + sigW, fy + 74).lineWidth(0.6).strokeColor('#999999').stroke();
          doc.fontSize(7).font('Helvetica-Bold').fillColor(LGRAY)
            .text(lbl, sx, fy + 78, { width: sigW, align: 'center' });
          reset();
        });
      };

      /** The compact block: three columns, used when all plans share a page. */
      const drawPackageCompact = (p, top) => {
        const balance = Math.max(0, p.total - p.deposit);
        const saving = p.total - p.cashPrice;
        const contents = p.contents || [];
        const BLOCK_H = 132;

        doc.roundedRect(ML, top, W, BLOCK_H, 5).lineWidth(0.8).strokeColor('#dddddd').stroke();
        doc.rect(ML, top, W, 20).fill(ORANGE);
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#ffffff')
          .text(p.name.toUpperCase(), ML + 10, top + 6, { width: W - 20 });
        reset();

        const bodyY = top + 28;
        const colW = (W - 30) / 3;

        let cy = bodyY;
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(ORANGE)
          .text('INSTALLMENT PLAN', ML + 10, cy, { width: colW });
        cy += 12;
        const kv = (k, v, strong) => {
          doc.fontSize(8).font('Helvetica').fillColor('#555555')
            .text(k, ML + 10, cy, { width: colW * 0.52, lineBreak: false });
          doc.fontSize(strong ? 9 : 8).font('Helvetica-Bold').fillColor('#111111')
            .text(v, ML + 10 + colW * 0.52, cy - (strong ? 1 : 0), { width: colW * 0.48 - 6, align: 'right', lineBreak: false });
          reset();
          cy += 13;
        };
        kv('Total amount', gh(p.total), true);
        kv('Initial deposit', gh(p.deposit));
        kv('Balance', gh(balance), true);
        kv('Period', p.months + ' months');

        const c2 = ML + 10 + colW + 5;
        cy = bodyY;
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(ORANGE)
          .text('PAYING THE BALANCE', c2, cy, { width: colW });
        cy += 12;
        const sched = (k, per, times, total) => {
          doc.fontSize(8).font('Helvetica').fillColor('#555555')
            .text(k, c2, cy, { width: colW, lineBreak: false });
          cy += 11;
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#111111')
            .text(`${gh(per)} × ${times}  =  ${gh(total)}`, c2, cy, { width: colW, lineBreak: false });
          reset();
          cy += 15;
        };
        sched('Every month', p.monthly, p.months, p.monthly * p.months);
        sched('Every week', p.weekly, p.weeks, p.weekly * p.weeks);

        if (p.cashPrice) {
          const c3 = ML + 10 + (colW + 5) * 2;
          cy = bodyY;
          doc.roundedRect(c3 - 6, cy - 4, colW + 6, 52, 4).fill('#f4f9f4');
          doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#2f7d32')
            .text('READY CASH PRICE', c3, cy, { width: colW });
          doc.fontSize(14).font('Helvetica-Bold').fillColor('#2f7d32')
            .text(gh(p.cashPrice), c3, cy + 12, { width: colW });
          doc.fontSize(7.5).font('Helvetica').fillColor('#2f7d32')
            .text('You save ' + gh(saving), c3, cy + 31, { width: colW });
          reset();
        }

        // Nothing listed means nothing to head: a phone sold on its own would
        // otherwise print "PACKAGE INCLUDES" against an empty line.
        if (contents.length) {
          const listY = top + BLOCK_H - 34;
          doc.moveTo(ML + 10, listY - 6).lineTo(ML + W - 10, listY - 6)
            .lineWidth(0.4).strokeColor('#e5e5e5').stroke();
          doc.fontSize(7).font('Helvetica-Bold').fillColor(LGRAY)
            .text('PACKAGE INCLUDES', ML + 10, listY, { width: 100, lineBreak: false });
          doc.fontSize(8).font('Helvetica').fillColor('#111111')
            .text(contents.join('   •   '), ML + 100, listY, { width: W - 110, lineBreak: false });
          reset();
        }

        return top + BLOCK_H;
      };

      /**
       * The sheet-per-plan block. Not the compact one scaled up — at larger
       * type the three columns collide, so this stacks instead: the plan and
       * the cash price side by side, then the two payment schedules in boxes
       * of their own, then the contents as a list.
       */
      const drawPackageFull = (p, top) => {
        const balance = Math.max(0, p.total - p.deposit);
        const saving = p.total - p.cashPrice;
        const contents = p.contents || [];
        const TITLE_H = 30;
        const BLOCK_H = 300 + contents.length * 19;

        doc.roundedRect(ML, top, W, BLOCK_H, 6).lineWidth(0.8).strokeColor('#dddddd').stroke();
        doc.rect(ML, top, W, TITLE_H).fill(ORANGE);
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#ffffff')
          .text(p.name.toUpperCase(), ML + 14, top + 8, { width: W - 28 });
        reset();

        // ── The plan, and the cash alternative beside it ────────────────────
        const secY = top + TITLE_H + 18;
        const leftW = 290;
        doc.fontSize(9).font('Helvetica-Bold').fillColor(ORANGE)
          .text('INSTALLMENT PLAN', ML + 14, secY, { width: leftW });
        let ry = secY + 18;
        const row = (k, v, strong) => {
          doc.fontSize(10).font('Helvetica').fillColor('#555555')
            .text(k, ML + 14, ry, { width: 150, lineBreak: false });
          doc.fontSize(strong ? 12 : 10).font('Helvetica-Bold').fillColor('#111111')
            .text(v, ML + 150, ry - (strong ? 2 : 0), { width: leftW - 150, align: 'right', lineBreak: false });
          reset();
          ry += strong ? 20 : 18;
        };
        row('Total amount', gh(p.total), true);
        row('Initial deposit', gh(p.deposit));
        row('Balance to pay', gh(balance), true);
        row('Period', p.months + ' months');

        // Not every package has a ready-cash alternative; where there is none
        // the panel is left out rather than printed empty.
        if (p.cashPrice) {
          const cardX = ML + leftW + 30;
          const cardW = W - leftW - 44;
          doc.roundedRect(cardX, secY - 8, cardW, 92, 5).fill('#f1f8f1');
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#2f7d32')
            .text('READY CASH PRICE', cardX + 12, secY + 2, { width: cardW - 24 });
          doc.fontSize(22).font('Helvetica-Bold').fillColor('#2f7d32')
            .text(gh(p.cashPrice), cardX + 12, secY + 20, { width: cardW - 24 });
          doc.fontSize(9).font('Helvetica').fillColor('#2f7d32')
            .text('Pay cash and save ' + gh(saving), cardX + 12, secY + 52, { width: cardW - 24 });
          reset();
        }

        // ── The two ways of clearing the balance ────────────────────────────
        const payY = top + TITLE_H + 122;
        doc.fontSize(9).font('Helvetica-Bold').fillColor(ORANGE)
          .text('PAYING THE BALANCE', ML + 14, payY, { width: W - 28 });

        const boxW = (W - 40) / 2;
        [
          ['EVERY MONTH', p.monthly, p.months, p.monthly * p.months],
          ['EVERY WEEK', p.weekly, p.weeks, p.weekly * p.weeks],
        ].forEach(([label, per, times, total], i) => {
          const bx = ML + 14 + i * (boxW + 12);
          const by = payY + 18;
          doc.roundedRect(bx, by, boxW, 62, 5).lineWidth(0.7).strokeColor('#e3e3e3').stroke();
          doc.fontSize(8).font('Helvetica-Bold').fillColor(LGRAY)
            .text(label, bx + 12, by + 9, { width: boxW - 24 });
          doc.fontSize(15).font('Helvetica-Bold').fillColor('#111111')
            .text(gh(per) + ' × ' + times, bx + 12, by + 22, { width: boxW - 24 });
          doc.fontSize(8.5).font('Helvetica').fillColor('#666666')
            .text('Totalling ' + gh(total), bx + 12, by + 44, { width: boxW - 24 });
          reset();
        });

        // ── What is in the box ──────────────────────────────────────────────
        const listY = top + TITLE_H + 218;
        if (contents.length) {
          doc.moveTo(ML + 14, listY - 12).lineTo(ML + W - 14, listY - 12)
            .lineWidth(0.5).strokeColor('#e5e5e5').stroke();
          doc.fontSize(9).font('Helvetica-Bold').fillColor(ORANGE)
            .text('PACKAGE INCLUDES', ML + 14, listY, { width: W - 28 });
        }
        contents.forEach((item, i) => {
          const iy = listY + 22 + i * 19;
          doc.circle(ML + 22, iy + 4, 2).fill(ORANGE);
          doc.fontSize(10.5).font('Helvetica').fillColor('#111111')
            .text(item, ML + 34, iy, { width: W - 50 });
          reset();
        });

        return top + BLOCK_H;
      };

      // ── Lay the sheets out ────────────────────────────────────────────────
      // Default is the lot: a comparison page with every plan on it, then a
      // page each. That way one print run covers both jobs — the customer
      // choosing a size and the customer who has chosen one.
      //   'combined' — only the comparison page
      //   'separate' — only the page-per-plan sheets
      const layout = options.layout || 'all';
      const wantsCombined = layout === 'all' || layout === 'combined';
      const wantsSeparate = layout === 'all' || layout === 'separate';

      let page = 0;
      const nextPage = () => { if (page > 0) doc.addPage(); page += 1; };

      if (wantsCombined) {
        // Three blocks fit a page; a fourth ran under the footer. Each page of
        // the comparison gets its own header and footer rather than one long
        // list broken mid-block.
        const COMPACT_H = 132;
        const FOOTER_TOP = 802 - 40 - 88;
        nextPage();
        let y = drawHeader('All plans at a glance');
        packages.forEach((p) => {
          if (y + COMPACT_H > FOOTER_TOP - 8) {
            drawFooter(lateAfterMonths);
            nextPage();
            y = drawHeader('All plans at a glance (continued)');
          }
          y = drawPackageCompact(p, y) + 12;
        });
        drawFooter(lateAfterMonths);
      }

      if (wantsSeparate) {
        packages.forEach((p) => {
          nextPage();   // pageAdded redraws the watermark
          const y = drawHeader();
          drawPackageFull(p, y);
          drawFooter(p.months);
        });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};


/**
 * A fixed price list (A4) — a product and what it costs, nothing more.
 *
 * Kept separate from the installment sheet on purpose. There is no deposit, no
 * schedule and no late-payment term here, and a sheet that borrowed that
 * furniture would imply terms that do not apply.
 *
 * @param {Object} options - { logoUrl, company, title, subtitle, items }
 * @returns {Promise<Buffer>}
 */
const generateFixedPriceList = async (options = {}) => {
  const logoBuf = await fetchBuf(options.logoUrl || null);
  const items = options.items || [];

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ML = 40;
      const W = 515;
      const ORANGE = '#e86b00';
      const LGRAY = '#777777';
      const PAGE_BOTTOM = 802;

      const company = options.company || {};
      const companyName = company.name || 'DAN & DOR SOLAR COMPANY LIMITED';
      const companyAddress = company.address || 'Bogoso, Western Region';
      const companyPhone = company.phone || '+233 595413632';

      const gh = (n) => 'GHC' + Number(n || 0).toLocaleString('en-GB', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
      const reset = () => doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);

      attachWatermark(doc, logoBuf);

      const drawHeader = () => {
        let hy = 40;
        if (logoBuf) {
          try { doc.image(logoBuf, ML, hy, { width: 48 }); } catch { /* keep the gap */ }
        }
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#111111')
          .text(companyName, ML + 58, hy + 2, { width: W - 58 });
        doc.fontSize(8.5).font('Helvetica').fillColor(LGRAY)
          .text([companyAddress, companyPhone && 'Tel: ' + companyPhone].filter(Boolean).join('  |  '),
            ML + 58, hy + 20, { width: W - 58 });
        reset();

        hy += 52;
        doc.moveTo(ML, hy).lineTo(ML + W, hy).lineWidth(1.5).strokeColor(ORANGE).stroke();
        reset();

        hy += 12;
        doc.fontSize(16).font('Helvetica-Bold').fillColor(ORANGE)
          .text(options.title || 'PRICE LIST', ML, hy, { width: W });
        if (options.subtitle) {
          doc.fontSize(10).font('Helvetica').fillColor('#555555')
            .text(options.subtitle, ML, hy + 21, { width: W });
          hy += 16;
        }
        reset();
        return hy + 30;
      };

      const FOOTER_TOP = PAGE_BOTTOM - 40 - 60;
      const drawFooter = () => {
        doc.moveTo(ML, FOOTER_TOP).lineTo(ML + W, FOOTER_TOP).lineWidth(0.6).strokeColor('#dddddd').stroke();
        reset();
        doc.fontSize(8).font('Helvetica').fillColor(LGRAY)
          .text('Prices are subject to change without notice. Installation and delivery are quoted separately.',
            ML, FOOTER_TOP + 10, { width: W, align: 'center' });

        const sigW = (W - 60) / 2;
        [['MANAGER', ''], ['FOR THE COMPANY', '']].forEach(([lbl], i) => {
          const sx = ML + i * (sigW + 60);
          doc.moveTo(sx, FOOTER_TOP + 44).lineTo(sx + sigW, FOOTER_TOP + 44)
            .lineWidth(0.6).strokeColor('#999999').stroke();
          doc.fontSize(7).font('Helvetica-Bold').fillColor(LGRAY)
            .text(lbl, sx, FOOTER_TOP + 48, { width: sigW, align: 'center' });
          reset();
        });
      };

      const ROW_H = 34;
      const drawTableHead = (y) => {
        doc.rect(ML, y, W, 24).fill(ORANGE);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');
        doc.text('SYSTEM', ML + 14, y + 8, { width: W - 180 });
        doc.text('PRICE', ML + W - 160, y + 8, { width: 146, align: 'right' });
        reset();
        return y + 24;
      };

      let y = drawTableHead(drawHeader());
      const tableTop = y;

      items.forEach((item, i) => {
        if (y + ROW_H > FOOTER_TOP - 8) {
          doc.rect(ML, tableTop, W, y - tableTop).lineWidth(0.7).strokeColor('#dddddd').stroke();
          drawFooter();
          doc.addPage();       // pageAdded redraws the watermark
          y = drawTableHead(drawHeader());
        }
        if (i % 2 === 1) { doc.rect(ML, y, W, ROW_H).fill('#faf6f2'); reset(); }
        doc.fontSize(12).font('Helvetica').fillColor('#111111')
          .text(item.name, ML + 14, y + 10, { width: W - 180, lineBreak: false });
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#111111')
          .text(gh(item.price), ML + W - 160, y + 9, { width: 146, align: 'right', lineBreak: false });
        doc.moveTo(ML, y + ROW_H).lineTo(ML + W, y + ROW_H).lineWidth(0.4).strokeColor('#e8e8e8').stroke();
        reset();
        y += ROW_H;
      });

      doc.rect(ML, tableTop, W, y - tableTop).lineWidth(0.7).strokeColor('#dddddd').stroke();
      reset();
      drawFooter();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};


/**
 * A report as an A4 table — the generic one, driven entirely by its columns.
 *
 * Column widths are given as weights rather than points, so a caller says
 * "this column is twice that one" and the table fills the page whatever the
 * orientation. Anything that would overflow its cell is truncated with an
 * ellipsis rather than wrapping, because a report is read down its columns and
 * one wrapped product name knocks every figure beside it out of line.
 *
 * @param {Object} options - { logoUrl, company, title, subtitle, columns,
 *   rows, summary, landscape, note }
 *   columns: [{ label, key, weight, align, format }]
 *   summary: [{ label, value }] — printed above the table
 * @returns {Promise<Buffer>}
 */
/**
 * The end-of-day sheet (A4): everything sold and refunded on one date, set out
 * under the person who did it.
 *
 * Written for closing up. The owner wants to see each till's takings against
 * the person who took them, what actually left the shop, and what went back —
 * so the sales are itemised under the cashier who rang them, and the refunds
 * name both who asked and who approved.
 *
 * @param {Object} options - { logoUrl, company, date, sellers, refunds, totals }
 * @returns {Promise<Buffer>}
 */
const generateDayEndReport = async (options = {}) => {
  const logoBuf = await fetchBuf(options.logoUrl || null);
  const sellers = options.sellers || [];
  const refunds = options.refunds || [];
  const totals = options.totals || {};

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ML = 40;
      const W = 515;
      const ORANGE = '#e86b00';
      const LGRAY = '#777777';
      const PAGE_BOTTOM = 842;
      const FOOTER_TOP = PAGE_BOTTOM - 40 - 78;

      const company = options.company || {};
      const companyName = company.name || 'DAN & DOR SOLAR COMPANY LIMITED';
      const companyAddress = company.address || 'Bogoso, Western Region';
      const companyPhone = company.phone || '+233 595413632';

      const gh = (n) => 'GHC' + Number(n || 0).toLocaleString('en-GB', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      });
      const reset = () => doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);
      const fit = (text, width, size) => {
        let t = String(text ?? '');
        doc.fontSize(size);
        if (doc.widthOfString(t) <= width) return t;
        while (t.length > 1 && doc.widthOfString(t + '…') > width) t = t.slice(0, -1);
        return t + '…';
      };

      attachWatermark(doc, logoBuf);

      const drawHeader = () => {
        let hy = 40;
        if (logoBuf) {
          try { doc.image(logoBuf, ML, hy, { width: 44 }); } catch { /* keep the gap */ }
        }
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#111111')
          .text(companyName, ML + 54, hy + 1, { width: W - 54 });
        doc.fontSize(8).font('Helvetica').fillColor(LGRAY)
          .text([companyAddress, companyPhone && 'Tel: ' + companyPhone].filter(Boolean).join('  |  '),
            ML + 54, hy + 17, { width: W - 54 });
        reset();

        hy += 46;
        doc.moveTo(ML, hy).lineTo(ML + W, hy).lineWidth(1.5).strokeColor(ORANGE).stroke();
        reset();

        hy += 9;
        doc.fontSize(15).font('Helvetica-Bold').fillColor(ORANGE)
          .text('END OF DAY REPORT', ML, hy, { width: W });
        doc.fontSize(9).font('Helvetica').fillColor('#555555')
          .text(options.date || '', ML, hy + 19, { width: W });
        doc.fontSize(7.5).font('Helvetica').fillColor(LGRAY)
          .text('Printed ' + new Date().toLocaleString('en-GB'), ML, hy + 32, { width: W });
        reset();
        return hy + 50;
      };

      const drawFooter = () => {
        doc.moveTo(ML, FOOTER_TOP).lineTo(ML + W, FOOTER_TOP).lineWidth(0.5).strokeColor('#dddddd').stroke();
        reset();
        doc.fontSize(7).font('Helvetica').fillColor(LGRAY)
          .text('Figures are taken from the system records for the day named above.',
            ML, FOOTER_TOP + 8, { width: W, align: 'center' });

        const sigW = (W - 40) / 3;
        ['CASHIER', 'MANAGER', 'CEO'].forEach((lbl, i) => {
          const sx = ML + i * (sigW + 20);
          doc.moveTo(sx, FOOTER_TOP + 52).lineTo(sx + sigW, FOOTER_TOP + 52)
            .lineWidth(0.6).strokeColor('#999999').stroke();
          doc.fontSize(7).font('Helvetica-Bold').fillColor(LGRAY)
            .text(lbl, sx, FOOTER_TOP + 56, { width: sigW, align: 'center' });
          reset();
        });
      };

      let y = drawHeader();

      /** Start a fresh page when `needed` points will not fit above the footer. */
      const room = (needed) => {
        if (y + needed <= FOOTER_TOP - 6) return;
        drawFooter();
        doc.addPage();          // pageAdded redraws the watermark
        y = drawHeader();
      };

      // ── The day in figures ────────────────────────────────────────────────
      const boxes = [
        { label: 'SALES', value: String(totals.sale_count || 0) },
        { label: 'TAKINGS', value: gh(totals.sales_total) },
        { label: 'REFUNDS', value: gh(totals.refunds_total) },
        { label: 'NET', value: gh((totals.sales_total || 0) - (totals.refunds_total || 0)) },
      ];
      const boxW = (W - 3 * 8) / 4;
      boxes.forEach((b, i) => {
        const bx = ML + i * (boxW + 8);
        doc.roundedRect(bx, y, boxW, 40, 3).fill('#fdf2e9');
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#b34700')
          .text(b.label, bx + 8, y + 8, { width: boxW - 16, lineBreak: false });
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111')
          .text(fit(b.value, boxW - 16, 11), bx + 8, y + 20, { width: boxW - 16, lineBreak: false });
        reset();
      });
      y += 54;

      const sectionHeading = (text) => {
        room(28);
        doc.rect(ML, y, W, 18).fill(ORANGE);
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff')
          .text(text, ML + 8, y + 5.5, { width: W - 16, lineBreak: false });
        reset();
        y += 24;
      };

      // ── Sales, grouped by whoever rang them up ────────────────────────────
      sectionHeading('SALES BY USER');

      if (sellers.length === 0) {
        doc.fontSize(9).font('Helvetica-Oblique').fillColor(LGRAY)
          .text('No sales recorded for this day.', ML, y + 4, { width: W, align: 'center' });
        reset();
        y += 26;
      }

      sellers.forEach((seller) => {
        room(40);
        doc.rect(ML, y, W, 17).fill('#f3f3f3');
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#111111')
          .text(fit(seller.username || 'Unknown user', W - 200, 8.5), ML + 8, y + 4.5, { lineBreak: false });
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#111111')
          .text(`${seller.count} sale${seller.count === 1 ? '' : 's'}   ${gh(seller.total)}`,
            ML + W - 208, y + 4.5, { width: 200, align: 'right', lineBreak: false });
        reset();
        y += 21;

        seller.sales.forEach((sale) => {
          const itemsLine = (sale.items || [])
            .map((i) => `${i.product_name}${i.quantity > 1 ? ` x${i.quantity}` : ''}`)
            .join(', ');
          const needed = itemsLine ? 24 : 14;
          room(needed);

          doc.fontSize(7.5).font('Helvetica').fillColor('#555555')
            .text(sale.time || '', ML + 8, y, { width: 34, lineBreak: false });
          doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#111111')
            .text(fit(sale.invoice_no || '', 96, 7.5), ML + 44, y, { lineBreak: false });
          doc.fontSize(7.5).font('Helvetica').fillColor('#333333')
            .text(fit(sale.customer_name || 'Walk-in', 150, 7.5), ML + 146, y, { lineBreak: false });
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#111111')
            .text(gh(sale.amount), ML + W - 108, y - 0.5, { width: 100, align: 'right', lineBreak: false });
          reset();
          y += 10;

          if (itemsLine) {
            doc.fontSize(7).font('Helvetica').fillColor(LGRAY)
              .text(fit(itemsLine, W - 60, 7), ML + 44, y, { lineBreak: false });
            reset();
            y += 10;
          }

          doc.moveTo(ML + 8, y + 1).lineTo(ML + W - 8, y + 1)
            .lineWidth(0.3).strokeColor('#eeeeee').stroke();
          reset();
          y += 4;
        });

        y += 6;
      });

      // ── Refunds ───────────────────────────────────────────────────────────
      y += 4;
      sectionHeading('REFUNDS');

      if (refunds.length === 0) {
        doc.fontSize(9).font('Helvetica-Oblique').fillColor(LGRAY)
          .text('No refunds recorded for this day.', ML, y + 4, { width: W, align: 'center' });
        reset();
        y += 26;
      }

      refunds.forEach((r) => {
        const itemsLine = (r.items || [])
          .map((i) => `${i.product_name}${i.quantity > 1 ? ` x${i.quantity}` : ''}`)
          .join(', ');
        room(itemsLine ? 34 : 24);

        doc.fontSize(7.5).font('Helvetica').fillColor('#555555')
          .text(r.time || '', ML + 8, y, { width: 34, lineBreak: false });
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#111111')
          .text(fit(r.invoice_ref || '—', 96, 7.5), ML + 44, y, { lineBreak: false });
        doc.fontSize(7.5).font('Helvetica').fillColor('#333333')
          .text(fit(r.customer_name || '', 150, 7.5), ML + 146, y, { lineBreak: false });
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#b3261e')
          .text('-' + gh(r.amount), ML + W - 108, y - 0.5, { width: 100, align: 'right', lineBreak: false });
        reset();
        y += 10;

        // Both names, because a refund is two decisions: asking and allowing.
        doc.fontSize(7).font('Helvetica').fillColor(LGRAY)
          .text(fit(`Refunded by ${r.refunded_by || 'unknown'}`
            + (r.approved_by ? `  ·  approved by ${r.approved_by}` : '  ·  not yet approved')
            + (r.reason ? `  ·  ${r.reason}` : ''), W - 60, 7),
            ML + 44, y, { lineBreak: false });
        reset();
        y += 10;

        if (itemsLine) {
          doc.fontSize(7).font('Helvetica').fillColor(LGRAY)
            .text(fit(itemsLine, W - 60, 7), ML + 44, y, { lineBreak: false });
          reset();
          y += 10;
        }

        doc.moveTo(ML + 8, y + 1).lineTo(ML + W - 8, y + 1)
          .lineWidth(0.3).strokeColor('#eeeeee').stroke();
        reset();
        y += 4;
      });

      // ── What the day came to ──────────────────────────────────────────────
      room(64);
      y += 6;
      doc.roundedRect(ML, y, W, 52, 3).lineWidth(0.8).strokeColor(ORANGE).stroke();
      const line = (label, value, ly, strong, colour) => {
        doc.fontSize(strong ? 9 : 8).font(strong ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(strong ? '#111111' : '#555555')
          .text(label, ML + 12, ly, { lineBreak: false });
        doc.fontSize(strong ? 10 : 8.5).font('Helvetica-Bold').fillColor(colour || '#111111')
          .text(value, ML + W - 162, ly - 1, { width: 150, align: 'right', lineBreak: false });
        reset();
      };
      line('Total sales for the day', gh(totals.sales_total), y + 10);
      line('Less refunds', '-' + gh(totals.refunds_total), y + 24, false, '#b3261e');
      doc.moveTo(ML + 12, y + 35).lineTo(ML + W - 12, y + 35)
        .lineWidth(0.5).strokeColor('#dddddd').stroke();
      reset();
      line('NET TAKINGS', gh((totals.sales_total || 0) - (totals.refunds_total || 0)), y + 40, true);
      y += 60;

      drawFooter();
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};


const generateTableReport = async (options = {}) => {
  const logoBuf = await fetchBuf(options.logoUrl || null);
  const columns = options.columns || [];
  const rows = options.rows || [];
  const summary = options.summary || [];

  return new Promise((resolve, reject) => {
    try {
      const landscape = !!options.landscape;
      const doc = new PDFDocument({
        size: 'A4',
        layout: landscape ? 'landscape' : 'portrait',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ML = 40;
      const W = (landscape ? 842 : 595) - ML * 2;
      const PAGE_BOTTOM = landscape ? 595 : 842;
      const ORANGE = '#e86b00';
      const LGRAY = '#777777';

      const company = options.company || {};
      const companyName = company.name || 'DAN & DOR SOLAR COMPANY LIMITED';
      const companyAddress = company.address || 'Bogoso, Western Region';
      const companyPhone = company.phone || '+233 595413632';

      const reset = () => doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);

      const totalWeight = columns.reduce((s, c) => s + (c.weight || 1), 0) || 1;
      const widths = columns.map((c) => ((c.weight || 1) / totalWeight) * W);
      const colX = (i) => ML + widths.slice(0, i).reduce((s, w) => s + w, 0);

      /** Cut to fit rather than wrap — a wrapped cell misaligns the whole row. */
      const fit = (text, width, size) => {
        let s = String(text ?? '');
        doc.fontSize(size);
        if (doc.widthOfString(s) <= width) return s;
        while (s.length > 1 && doc.widthOfString(s + '…') > width) s = s.slice(0, -1);
        return s + '…';
      };

      // Fainter on a sheet meant to be written on — a pencil figure over a
      // strong watermark is hard to read back.
      attachWatermark(doc, logoBuf, {
        width: landscape ? 300 : 330,
        opacity: options.grid ? 0.05 : 0.13,
      });

      const drawHeader = () => {
        let hy = 40;
        if (logoBuf) {
          try { doc.image(logoBuf, ML, hy, { width: 44 }); } catch { /* keep the gap */ }
        }
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#111111')
          .text(companyName, ML + 54, hy + 1, { width: W - 54 });
        doc.fontSize(8).font('Helvetica').fillColor(LGRAY)
          .text([companyAddress, companyPhone && 'Tel: ' + companyPhone].filter(Boolean).join('  |  '),
            ML + 54, hy + 17, { width: W - 54 });
        reset();

        hy += 46;
        doc.moveTo(ML, hy).lineTo(ML + W, hy).lineWidth(1.5).strokeColor(ORANGE).stroke();
        reset();

        hy += 9;
        doc.fontSize(14).font('Helvetica-Bold').fillColor(ORANGE)
          .text(options.title || 'REPORT', ML, hy, { width: W });
        hy += 18;
        if (options.subtitle) {
          doc.fontSize(8.5).font('Helvetica').fillColor('#555555')
            .text(options.subtitle, ML, hy, { width: W });
          hy += 13;
        }
        doc.fontSize(7.5).font('Helvetica').fillColor(LGRAY)
          .text('Generated ' + new Date().toLocaleString('en-GB'), ML, hy, { width: W });
        reset();
        return hy + 18;
      };

      /** The headline figures, boxed above the detail. */
      const drawSummary = (y) => {
        if (summary.length === 0) return y;
        const perRow = Math.min(4, summary.length);
        const boxW = (W - (perRow - 1) * 8) / perRow;
        const lines = Math.ceil(summary.length / perRow);
        summary.forEach((s, i) => {
          const bx = ML + (i % perRow) * (boxW + 8);
          const by = y + Math.floor(i / perRow) * 44;
          doc.roundedRect(bx, by, boxW, 38, 3).fill('#fdf2e9');
          doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#b34700')
            .text(String(s.label).toUpperCase(), bx + 8, by + 7, { width: boxW - 16, lineBreak: false });
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111')
            .text(String(s.value), bx + 8, by + 19, { width: boxW - 16, lineBreak: false });
          reset();
        });
        return y + lines * 44 + 8;
      };

      const FOOTER_TOP = PAGE_BOTTOM - 40 - 34;
      const drawFooter = () => {
        doc.moveTo(ML, FOOTER_TOP).lineTo(ML + W, FOOTER_TOP).lineWidth(0.5).strokeColor('#dddddd').stroke();
        reset();
        doc.fontSize(7).font('Helvetica').fillColor(LGRAY)
          .text(options.note || 'This report is generated from the system records and is for internal use.',
            ML, FOOTER_TOP + 8, { width: W, align: 'center' });
        reset();
      };

      const HEAD_H = 22;
      // Taller rows when the sheet is meant to be written on by hand.
      const ROW_H = options.rowHeight || 17;
      // Vertical rules between columns. Without them a hand-written figure
      // drifts into the next column and the sheet is hard to read back.
      const grid = !!options.grid;

      const drawTableHead = (y) => {
        doc.rect(ML, y, W, HEAD_H).fill(ORANGE);
        doc.font('Helvetica-Bold').fillColor('#ffffff');
        columns.forEach((c, i) => {
          doc.fontSize(7).text(fit(c.label, widths[i] - 10, 7), colX(i) + 5, y + 7.5,
            { width: widths[i] - 10, align: c.align || 'left', lineBreak: false });
        });
        reset();
        reset();
        return y + HEAD_H;
      };

      let y = drawTableHead(drawSummary(drawHeader()));
      let tableTop = y;

      const closeTable = () => {
        doc.rect(ML, tableTop, W, y - tableTop).lineWidth(0.6).strokeColor('#dddddd').stroke();
        reset();
      };

      if (rows.length === 0) {
        doc.fontSize(9).font('Helvetica-Oblique').fillColor(LGRAY)
          .text('No records for this period.', ML, y + 12, { width: W, align: 'center' });
        reset();
        y += 34;
      }

      rows.forEach((row, ri) => {
        if (y + ROW_H > FOOTER_TOP - 6) {
          closeTable();
          drawFooter();
          doc.addPage();          // pageAdded redraws the watermark
          // No summary on continuation pages: it describes the whole report,
          // and repeating it reads as a fresh set of totals for that page.
          y = drawTableHead(drawHeader());
          tableTop = y;
        }
        // Zebra striping is for reading, not for writing on: a shaded row
        // under a pencil figure is harder to read back than a plain one.
        if (ri % 2 === 1 && !grid) { doc.rect(ML, y, W, ROW_H).fill('#faf6f2'); reset(); }

        columns.forEach((c, i) => {
          if (grid && i > 0) {
            doc.moveTo(colX(i), y).lineTo(colX(i), y + ROW_H)
              .lineWidth(0.3).strokeColor('#e0e0e0').stroke();
            reset();
          }
          // A column left blank on purpose — somewhere to write the counted
          // figure. Nothing is printed in it.
          if (c.blank) return;

          const raw = c.format ? c.format(row[c.key], row) : row[c.key];
          const ty = y + (ROW_H - 9) / 2;
          doc.fontSize(7.5).font(c.bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#111111')
            .text(fit(raw ?? '', widths[i] - 10, 7.5), colX(i) + 5, ty,
              { width: widths[i] - 10, align: c.align || 'left', lineBreak: false });
        });

        doc.moveTo(ML, y + ROW_H).lineTo(ML + W, y + ROW_H)
          .lineWidth(0.3).strokeColor('#ebebeb').stroke();
        reset();
        y += ROW_H;
      });

      closeTable();
      drawFooter();
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};


/**
 * An installment price table (A4) — one row per model.
 *
 * The block-per-package sheet reads well for a handful of solar packages, but
 * a phone catalogue runs to thirty-odd models: a page each would be a
 * thirty-page handout nobody reads, and the compact blocks still run to nine.
 * A table puts the whole range on two sheets, which is what is actually wanted
 * at a counter — the customer points at a row.
 *
 * Every figure is printed as supplied. The deposit, the monthly and the weekly
 * are worked out where the offers are defined, so this only lays them out.
 *
 * @param {Object} options - { logoUrl, company, title, subtitle, packages,
 *   latePercent, note }
 * @returns {Promise<Buffer>}
 */
const generateInstallmentTable = async (options = {}) => {
  const logoBuf = await fetchBuf(options.logoUrl || null);
  const packages = options.packages || [];

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ML = 40;
      const W = 515;
      const ORANGE = '#e86b00';
      const LGRAY = '#777777';
      const PAGE_BOTTOM = 802;

      const company = options.company || {};
      const companyName = company.name || 'DAN & DOR SOLAR COMPANY LIMITED';
      const companyAddress = company.address || 'Bogoso, Western Region';
      const companyPhone = company.phone || '+233 595413632';

      // No "GHC" on every cell — thirty rows of it is noise, and the column
      // headings say the currency once.
      const num = (n) => Number(n || 0).toLocaleString('en-GB', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
      const reset = () => doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);

      const latePercent = options.latePercent ?? 3;
      const months = packages.length && packages.every((p) => p.months === packages[0].months)
        ? packages[0].months : null;
      const weeks = packages.length && packages.every((p) => p.weeks === packages[0].weeks)
        ? packages[0].weeks : null;

      attachWatermark(doc, logoBuf);

      const drawHeader = () => {
        let hy = 40;
        if (logoBuf) {
          try { doc.image(logoBuf, ML, hy, { width: 48 }); } catch { /* keep the gap */ }
        }
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#111111')
          .text(companyName, ML + 58, hy + 2, { width: W - 58 });
        doc.fontSize(8.5).font('Helvetica').fillColor(LGRAY)
          .text([companyAddress, companyPhone && 'Tel: ' + companyPhone].filter(Boolean).join('  |  '),
            ML + 58, hy + 20, { width: W - 58 });
        reset();

        hy += 52;
        doc.moveTo(ML, hy).lineTo(ML + W, hy).lineWidth(1.5).strokeColor(ORANGE).stroke();
        reset();

        hy += 10;
        doc.fontSize(15).font('Helvetica-Bold').fillColor(ORANGE)
          .text(options.title || 'INSTALLMENT PRICE LIST', ML, hy, { width: W });
        hy += 19;
        if (options.subtitle) {
          doc.fontSize(9).font('Helvetica').fillColor('#555555')
            .text(options.subtitle, ML, hy, { width: W });
          hy += 14;
        }
        reset();
        return hy + 12;
      };

      const FOOTER_TOP = PAGE_BOTTOM - 40 - 92;
      const drawFooter = () => {
        doc.moveTo(ML, FOOTER_TOP).lineTo(ML + W, FOOTER_TOP).lineWidth(0.6).strokeColor('#dddddd').stroke();
        reset();

        // The one term that costs the customer money, set apart so it is not
        // skimmed past.
        doc.roundedRect(ML, FOOTER_TOP + 6, W, 30, 3).fill('#fdf2e9');
        const period = months ? months + ' months' : 'agreed payment period';
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#b34700')
          .text('If the ' + period + ' pass' + (months ? '' : 'es')
            + ' and payment is not complete, an additional ' + latePercent
            + '% of the total amount is charged for every week thereafter.',
            ML + 8, FOOTER_TOP + 13, { width: W - 16, align: 'center', lineGap: 1 });
        reset();

        doc.fontSize(7.5).font('Helvetica').fillColor(LGRAY)
          .text('Goods remain the property of the Company until the agreed price is paid in full. Prices are subject to change without notice.',
            ML, FOOTER_TOP + 44, { width: W, align: 'center' });

        const sigW = (W - 60) / 2;
        [['MANAGER'], ['FOR THE COMPANY']].forEach(([lbl], i) => {
          const sx = ML + i * (sigW + 60);
          doc.moveTo(sx, FOOTER_TOP + 76).lineTo(sx + sigW, FOOTER_TOP + 76)
            .lineWidth(0.6).strokeColor('#999999').stroke();
          doc.fontSize(7).font('Helvetica-Bold').fillColor(LGRAY)
            .text(lbl, sx, FOOTER_TOP + 80, { width: sigW, align: 'center' });
          reset();
        });
      };

      // Model | Cash | Total | Deposit | Monthly | Weekly
      const COLS = [
        { key: 'name', label: 'MODEL', w: 150, align: 'left' },
        { key: 'cashPrice', label: 'CASH', w: 63, align: 'right' },
        { key: 'total', label: 'TOTAL', w: 63, align: 'right' },
        { key: 'deposit', label: 'DEPOSIT', w: 68, align: 'right' },
        { key: 'monthly', label: months ? `MONTHLY x${months}` : 'MONTHLY', w: 84, align: 'right' },
        { key: 'weekly', label: weeks ? `WEEKLY x${weeks}` : 'WEEKLY', w: 77, align: 'right' },
      ];
      const colX = (i) => ML + COLS.slice(0, i).reduce((s, c) => s + c.w, 0);

      const HEAD_H = 26;
      const ROW_H = 19;

      const drawTableHead = (y) => {
        doc.rect(ML, y, W, HEAD_H).fill(ORANGE);
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#ffffff');
        COLS.forEach((c, i) => {
          doc.text(c.label, colX(i) + 6, y + 9, { width: c.w - 12, align: c.align, lineBreak: false });
        });
        reset();
        return y + HEAD_H;
      };

      let y = drawTableHead(drawHeader());
      let tableTop = y;

      const closeTable = () => {
        doc.rect(ML, tableTop, W, y - tableTop).lineWidth(0.7).strokeColor('#dddddd').stroke();
        reset();
      };

      packages.forEach((p, i) => {
        if (y + ROW_H > FOOTER_TOP - 6) {
          closeTable();
          drawFooter();
          doc.addPage();          // pageAdded redraws the watermark
          y = drawTableHead(drawHeader());
          tableTop = y;
        }

        if (i % 2 === 1) { doc.rect(ML, y, W, ROW_H).fill('#faf6f2'); reset(); }

        doc.fontSize(8).font('Helvetica-Bold').fillColor('#111111')
          .text(p.name, colX(0) + 6, y + 5.5, { width: COLS[0].w - 12, lineBreak: false });

        // A dash, not a blank: an empty cash cell reads as a missing figure,
        // where these models genuinely have no cheaper cash price.
        doc.fontSize(8).font('Helvetica').fillColor(p.cashPrice ? '#1a7f37' : '#bbbbbb')
          .text(p.cashPrice ? num(p.cashPrice) : '—',
            colX(1) + 6, y + 5.5, { width: COLS[1].w - 12, align: 'right', lineBreak: false });

        [['total', 2, 'Helvetica-Bold', '#111111'],
         ['deposit', 3, 'Helvetica', '#111111'],
         ['monthly', 4, 'Helvetica-Bold', '#b34700'],
         ['weekly', 5, 'Helvetica-Bold', '#b34700']].forEach(([key, ci, font, colour]) => {
          doc.fontSize(8).font(font).fillColor(colour)
            .text(num(p[key]), colX(ci) + 6, y + 5.5,
              { width: COLS[ci].w - 12, align: 'right', lineBreak: false });
        });

        doc.moveTo(ML, y + ROW_H).lineTo(ML + W, y + ROW_H)
          .lineWidth(0.35).strokeColor('#e8e8e8').stroke();
        reset();
        y += ROW_H;
      });

      closeTable();

      if (options.note) {
        doc.fontSize(8).font('Helvetica-Oblique').fillColor(LGRAY)
          .text(options.note, ML, y + 8, { width: W });
        reset();
      }

      drawFooter();
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};


/**
 * Acceptance letter for an industrial attachment or internship (A4).
 *
 * Written for a named person and addressed to whoever asked for it — usually a
 * school. Everything but the name is optional: the sentences are assembled
 * from what was supplied, so a letter with only a name still reads properly
 * rather than printing "undefined" or an empty clause.
 *
 * Pronouns follow the title when one is given (Mr → he, Mrs/Ms/Miss → she) and
 * are they/them otherwise, since the shop will not always know and a wrong
 * guess is worse than the neutral form.
 *
 * @param {Object} options - { logoUrl, company, name, title, institution,
 *   programme, kind, startDate, endDate, department, addressee, reference,
 *   date, signatoryName, signatoryRole }
 * @returns {Promise<Buffer>}
 */
const generateAcceptanceLetter = async (options = {}) => {
  const logoBuf = await fetchBuf(options.logoUrl || null);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 55, right: 55 } });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ML = 55;
      const W = 485;
      const ORANGE = '#e86b00';
      const LGRAY = '#777777';

      const company = options.company || {};
      const companyName = company.name || 'DAN & DOR SOLAR COMPANY LIMITED';
      const companyAddress = company.address || 'Bogoso, Western Region';
      const companyPhone = company.phone || '+233 595413632';

      const name = String(options.name || '').trim();
      const title = String(options.title || '').trim();
      const fullName = [title, name].filter(Boolean).join(' ');
      const institution = String(options.institution || '').trim();
      const programme = String(options.programme || '').trim();
      const department = String(options.department || '').trim();
      const kind = options.kind === 'internship' ? 'internship' : 'industrial attachment';
      const addressee = String(options.addressee || '').trim();
      const reference = String(options.reference || '').trim();
      const letterDate = String(options.date || new Date().toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      })).trim();
      const signatoryName = String(options.signatoryName || '').trim();
      const signatoryRole = String(options.signatoryRole || 'Manager').trim();

      // he/she when the title says so, they/them when it does not.
      const t = title.toLowerCase().replace(/\./g, '');
      const subject = t === 'mr' ? 'he' : ['mrs', 'ms', 'miss', 'madam'].includes(t) ? 'she' : 'they';
      const possessive = subject === 'he' ? 'his' : subject === 'she' ? 'her' : 'their';
      const objectPron = subject === 'he' ? 'him' : subject === 'she' ? 'her' : 'them';
      const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

      const reset = () => doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);

      attachWatermark(doc, logoBuf);

      // ── Letterhead ────────────────────────────────────────────────────────
      let y = 42;
      if (logoBuf) {
        try { doc.image(logoBuf, ML, y, { width: 52 }); } catch { /* keep the gap */ }
      }
      doc.fontSize(15).font('Helvetica-Bold').fillColor('#111111')
        .text(companyName, ML + 64, y + 4, { width: W - 64 });
      doc.fontSize(9).font('Helvetica').fillColor(LGRAY)
        .text(companyAddress, ML + 64, y + 24, { width: W - 64 });
      doc.text('Tel: ' + companyPhone, ML + 64, y + 37, { width: W - 64 });
      reset();

      y += 62;
      doc.moveTo(ML, y).lineTo(ML + W, y).lineWidth(1.5).strokeColor(ORANGE).stroke();
      reset();

      // ── Reference and date ────────────────────────────────────────────────
      y += 18;
      if (reference) {
        doc.fontSize(9.5).font('Helvetica').fillColor('#333333')
          .text('Our Ref: ' + reference, ML, y, { width: W / 2 });
      }
      doc.fontSize(9.5).font('Helvetica').fillColor('#333333')
        .text(letterDate, ML + W / 2, y, { width: W / 2, align: 'right' });
      reset();

      // ── Addressee ─────────────────────────────────────────────────────────
      y += 30;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111')
        .text(addressee || 'TO WHOM IT MAY CONCERN', ML, y, { width: W });
      y = doc.y + 20;

      doc.fontSize(11).font('Helvetica').fillColor('#111111').text('Dear Sir/Madam,', ML, y);
      y = doc.y + 16;

      // ── Subject line ──────────────────────────────────────────────────────
      const subjectLine = 'RE: ACCEPTANCE FOR ' + (kind === 'internship' ? 'INTERNSHIP' : 'INDUSTRIAL ATTACHMENT')
        + (name ? ' — ' + name.toUpperCase() : '');
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111')
        .text(subjectLine, ML, y, { width: W, underline: true });
      y = doc.y + 18;

      // ── Body ──────────────────────────────────────────────────────────────
      const who = fullName || 'the applicant';
      const fromSchool = institution ? ' of ' + institution : '';
      const studying = programme ? ', offering ' + programme + ',' : '';

      const paragraphs = [];

      paragraphs.push(
        // 'has', not 'have': the subject of this sentence is the person's
        // name, which is singular even where the pronoun later is they.
        `We write to confirm that ${who}${fromSchool}${studying} has been accepted to undertake `
        + `${possessive} ${kind} with ${companyName}.`
      );

      if (options.startDate && options.endDate) {
        paragraphs.push(
          `The ${kind} is scheduled to run from ${options.startDate} to ${options.endDate}.`
          + (department ? ` ${cap(subject)} will be attached to our ${department} unit.` : '')
        );
      } else if (department) {
        paragraphs.push(`${cap(subject)} will be attached to our ${department} unit.`);
      }

      paragraphs.push(
        `${cap(subject)} will work under the supervision of our staff, and we shall provide the guidance and `
        + `practical exposure needed to meet the requirements of the programme. We will also report on `
        + `${possessive} conduct and performance at the end of the period should the institution require it.`
      );

      paragraphs.push(
        `We are pleased to receive ${objectPron} and trust that the period spent with us will be of `
        + `benefit to ${possessive} training.`
      );

      paragraphs.push('Thank you.');

      doc.fontSize(11).font('Helvetica').fillColor('#111111');
      paragraphs.forEach((para) => {
        doc.text(para, ML, y, { width: W, align: 'justify', lineGap: 3 });
        y = doc.y + 14;
      });

      // ── Signature ─────────────────────────────────────────────────────────
      y += 10;
      doc.fontSize(11).font('Helvetica').fillColor('#111111').text('Yours faithfully,', ML, y);
      y = doc.y + 46;

      doc.moveTo(ML, y).lineTo(ML + 220, y).lineWidth(0.7).strokeColor('#888888').stroke();
      reset();
      if (signatoryName) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111')
          .text(signatoryName, ML, y + 6, { width: 220 });
        doc.fontSize(9.5).font('Helvetica').fillColor(LGRAY)
          .text(signatoryRole, ML, y + 20, { width: 220 });
      } else {
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(LGRAY)
          .text(signatoryRole.toUpperCase(), ML, y + 6, { width: 220 });
        doc.fontSize(8.5).font('Helvetica').fillColor(LGRAY)
          .text('Name, signature and company stamp', ML, y + 19, { width: 220 });
      }
      reset();

      // ── Footer ────────────────────────────────────────────────────────────
      const fy = 802 - 40 - 28;
      doc.moveTo(ML, fy).lineTo(ML + W, fy).lineWidth(0.6).strokeColor('#dddddd').stroke();
      doc.fontSize(8).font('Helvetica').fillColor(LGRAY)
        .text(companyName + '  |  ' + companyAddress + '  |  Tel: ' + companyPhone,
          ML, fy + 8, { width: W, align: 'center' });
      reset();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Letter confirming an attachment or internship has been completed (A4).
 *
 * The other side of the acceptance letter: that one says a person is coming,
 * this one says they came, for how long, and how they did. Schools ask for it
 * on headed paper, so it is a letter rather than a certificate.
 *
 * Everything but the name is optional, and the sentences are assembled from
 * what was given — a letter written with only a name still reads properly.
 *
 * @param {Object} options - { logoUrl, company, name, title, institution,
 *   programme, kind, startDate, endDate, department, addressee, reference,
 *   date, conduct, remarks, signatoryName, signatoryRole }
 * @returns {Promise<Buffer>}
 */
const generateCompletionLetter = async (options = {}) => {
  const logoBuf = await fetchBuf(options.logoUrl || null);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 55, right: 55 } });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ML = 55;
      const W = 485;
      const ORANGE = '#e86b00';
      const LGRAY = '#777777';

      const company = options.company || {};
      const companyName = company.name || 'DAN & DOR SOLAR COMPANY LIMITED';
      const companyAddress = company.address || 'Bogoso, Western Region';
      const companyPhone = company.phone || '+233 595413632';

      const name = String(options.name || '').trim();
      const title = String(options.title || '').trim();
      const fullName = [title, name].filter(Boolean).join(' ');
      const institution = String(options.institution || '').trim();
      const programme = String(options.programme || '').trim();
      const department = String(options.department || '').trim();
      const kind = options.kind === 'internship' ? 'internship' : 'industrial attachment';
      const addressee = String(options.addressee || '').trim();
      const reference = String(options.reference || '').trim();
      const conduct = String(options.conduct || '').trim();
      const remarks = String(options.remarks || '').trim();
      const letterDate = String(options.date || new Date().toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      })).trim();
      const signatoryName = String(options.signatoryName || '').trim();
      const signatoryRole = String(options.signatoryRole || 'Manager').trim();

      const t = title.toLowerCase().replace(/\./g, '');
      const subject = t === 'mr' ? 'he' : ['mrs', 'ms', 'miss', 'madam'].includes(t) ? 'she' : 'they';
      const possessive = subject === 'he' ? 'his' : subject === 'she' ? 'her' : 'their';
      const objectPron = subject === 'he' ? 'him' : subject === 'she' ? 'her' : 'them';
      // they/them takes a plural verb where he/she takes a singular one. This
      // applies only where the PRONOUN is the subject — where the person's
      // name is, the verb stays singular however they are referred to later.
      const wasWere = subject === 'they' ? 'were' : 'was';
      const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

      const reset = () => doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);

      attachWatermark(doc, logoBuf);

      let y = 42;
      if (logoBuf) {
        try { doc.image(logoBuf, ML, y, { width: 52 }); } catch { /* keep the gap */ }
      }
      doc.fontSize(15).font('Helvetica-Bold').fillColor('#111111')
        .text(companyName, ML + 64, y + 4, { width: W - 64 });
      doc.fontSize(9).font('Helvetica').fillColor(LGRAY)
        .text(companyAddress, ML + 64, y + 24, { width: W - 64 });
      doc.text('Tel: ' + companyPhone, ML + 64, y + 37, { width: W - 64 });
      reset();

      y += 62;
      doc.moveTo(ML, y).lineTo(ML + W, y).lineWidth(1.5).strokeColor(ORANGE).stroke();
      reset();

      y += 18;
      if (reference) {
        doc.fontSize(9.5).font('Helvetica').fillColor('#333333')
          .text('Our Ref: ' + reference, ML, y, { width: W / 2 });
      }
      doc.fontSize(9.5).font('Helvetica').fillColor('#333333')
        .text(letterDate, ML + W / 2, y, { width: W / 2, align: 'right' });
      reset();

      y += 30;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111')
        .text(addressee || 'TO WHOM IT MAY CONCERN', ML, y, { width: W });
      y = doc.y + 20;

      doc.fontSize(11).font('Helvetica').fillColor('#111111').text('Dear Sir/Madam,', ML, y);
      y = doc.y + 16;

      const subjectLine = 'RE: COMPLETION OF ' + (kind === 'internship' ? 'INTERNSHIP' : 'INDUSTRIAL ATTACHMENT')
        + (name ? ' — ' + name.toUpperCase() : '');
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111')
        .text(subjectLine, ML, y, { width: W, underline: true });
      y = doc.y + 18;

      const who = fullName || 'the bearer';
      const fromSchool = institution ? ' of ' + institution : '';
      const studying = programme ? ', offering ' + programme + ',' : '';
      const period = options.startDate && options.endDate
        ? ` from ${options.startDate} to ${options.endDate}`
        : '';

      const paragraphs = [];

      paragraphs.push(
        // 'has', not 'have': the subject here is the name, which is singular.
        `This is to certify that ${who}${fromSchool}${studying} has successfully completed `
        + `${possessive} ${kind} with ${companyName}${period}.`
      );

      paragraphs.push(
        (department
          ? `${cap(subject)} ${wasWere} attached to our ${department} unit, where ${subject} `
          : `During the period ${subject} `)
        + `${wasWere} taken through the practical work of the company and given the guidance `
        + `required by the programme.`
      );

      if (conduct) {
        paragraphs.push(`${cap(subject)} ${wasWere} found to be ${conduct} throughout the period.`);
      }
      if (remarks) paragraphs.push(remarks);

      paragraphs.push(
        `We wish ${objectPron} every success in ${possessive} studies and in ${possessive} future career.`
      );

      paragraphs.push('Thank you.');

      doc.fontSize(11).font('Helvetica').fillColor('#111111');
      paragraphs.forEach((para) => {
        doc.text(para, ML, y, { width: W, align: 'justify', lineGap: 3 });
        y = doc.y + 14;
      });

      y += 10;
      doc.fontSize(11).font('Helvetica').fillColor('#111111').text('Yours faithfully,', ML, y);
      y = doc.y + 46;

      doc.moveTo(ML, y).lineTo(ML + 220, y).lineWidth(0.7).strokeColor('#888888').stroke();
      reset();
      if (signatoryName) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111')
          .text(signatoryName, ML, y + 6, { width: 220 });
        doc.fontSize(9.5).font('Helvetica').fillColor(LGRAY)
          .text(signatoryRole, ML, y + 20, { width: 220 });
      } else {
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(LGRAY)
          .text(signatoryRole.toUpperCase(), ML, y + 6, { width: 220 });
        doc.fontSize(8.5).font('Helvetica').fillColor(LGRAY)
          .text('Name, signature and company stamp', ML, y + 19, { width: 220 });
      }
      reset();

      const fy = 802 - 40 - 28;
      doc.moveTo(ML, fy).lineTo(ML + W, fy).lineWidth(0.6).strokeColor('#dddddd').stroke();
      doc.fontSize(8).font('Helvetica').fillColor(LGRAY)
        .text(companyName + '  |  ' + companyAddress + '  |  Tel: ' + companyPhone,
          ML, fy + 8, { width: W, align: 'center' });
      reset();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};


/**
 * Certificate of internship or industrial attachment (A4 landscape).
 *
 * The thing the student frames, as opposed to the letter the school files.
 * Landscape with a ruled border, the name large in the middle, and two
 * signature lines at the foot.
 *
 * @param {Object} options - { logoUrl, company, name, title, institution,
 *   programme, kind, startDate, endDate, department, certificateNo, date,
 *   signatoryName, signatoryRole, secondSignatoryName, secondSignatoryRole }
 * @returns {Promise<Buffer>}
 */
const generateInternshipCertificate = async (options = {}) => {
  const logoBuf = await fetchBuf(options.logoUrl || null);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4', layout: 'landscape',
        margins: { top: 30, bottom: 30, left: 30, right: 30 },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PW = 842;
      const PH = 595;
      const ORANGE = '#e86b00';
      const LGRAY = '#777777';

      const company = options.company || {};
      const companyName = company.name || 'DAN & DOR SOLAR COMPANY LIMITED';
      const companyAddress = company.address || 'Bogoso, Western Region';
      const companyPhone = company.phone || '+233 595413632';

      const name = String(options.name || '').trim();
      const title = String(options.title || '').trim();
      const fullName = [title, name].filter(Boolean).join(' ');
      const institution = String(options.institution || '').trim();
      const programme = String(options.programme || '').trim();
      const department = String(options.department || '').trim();
      const kind = options.kind === 'internship' ? 'Internship' : 'Industrial Attachment';
      const certificateNo = String(options.certificateNo || '').trim();
      const awardDate = String(options.date || new Date().toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      })).trim();

      const reset = () => doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);

      // A very faint watermark: this one is looked at, not read through.
      attachWatermark(doc, logoBuf, { width: 260, opacity: 0.05 });

      // ── Border ────────────────────────────────────────────────────────────
      doc.rect(24, 24, PW - 48, PH - 48).lineWidth(2.5).strokeColor(ORANGE).stroke();
      doc.rect(32, 32, PW - 64, PH - 64).lineWidth(0.7).strokeColor('#e0b48a').stroke();
      reset();

      let y = 52;
      if (logoBuf) {
        try { doc.image(logoBuf, (PW - 54) / 2, y, { width: 54 }); y += 60; }
        catch { y += 6; }
      }

      doc.fontSize(15).font('Helvetica-Bold').fillColor('#111111')
        .text(companyName, 60, y, { width: PW - 120, align: 'center' });
      y = doc.y + 2;
      doc.fontSize(8.5).font('Helvetica').fillColor(LGRAY)
        .text(companyAddress + '  |  Tel: ' + companyPhone, 60, y, { width: PW - 120, align: 'center' });
      reset();

      y = doc.y + 22;
      doc.fontSize(26).font('Helvetica-Bold').fillColor(ORANGE)
        .text('CERTIFICATE OF ' + kind.toUpperCase(), 60, y, {
          width: PW - 120, align: 'center', characterSpacing: 1.5,
        });
      reset();

      y = doc.y + 18;
      doc.fontSize(11).font('Helvetica').fillColor('#444444')
        .text('This is to certify that', 60, y, { width: PW - 120, align: 'center' });

      // ── The name, which is what the certificate is for ────────────────────
      y = doc.y + 12;
      doc.fontSize(28).font('Helvetica-Bold').fillColor('#111111')
        .text(fullName || '________________________', 60, y, { width: PW - 120, align: 'center' });
      y = doc.y + 6;
      doc.moveTo(PW / 2 - 190, y).lineTo(PW / 2 + 190, y)
        .lineWidth(0.8).strokeColor('#cccccc').stroke();
      reset();

      // ── The sentence, assembled from what was given ───────────────────────
      const bits = [];
      if (institution) bits.push('of ' + institution);
      if (programme) bits.push('offering ' + programme);
      const fromLine = bits.join(', ');

      y += 16;
      if (fromLine) {
        doc.fontSize(11).font('Helvetica-Oblique').fillColor('#555555')
          .text(fromLine, 60, y, { width: PW - 120, align: 'center' });
        y = doc.y + 8;
      }

      const period = options.startDate && options.endDate
        ? ` from ${options.startDate} to ${options.endDate}`
        : '';
      const where = department ? ` in our ${department} unit` : '';

      doc.fontSize(12).font('Helvetica').fillColor('#222222')
        .text(`has successfully completed ${kind.toLowerCase()}${where} with ${companyName}${period}.`,
          100, y, { width: PW - 200, align: 'center', lineGap: 3 });
      reset();

      // ── Signatures, pinned to the foot rather than following the text ─────
      const sy = PH - 118;
      const sigW = 200;
      const sigs = [
        { name: options.signatoryName, role: options.signatoryRole || 'Manager' },
        { name: options.secondSignatoryName, role: options.secondSignatoryRole || 'For the Company' },
      ];
      sigs.forEach((sig, i) => {
        const sx = i === 0 ? 110 : PW - 110 - sigW;
        doc.moveTo(sx, sy).lineTo(sx + sigW, sy).lineWidth(0.7).strokeColor('#888888').stroke();
        reset();
        if (sig.name) {
          doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#111111')
            .text(String(sig.name), sx, sy + 6, { width: sigW, align: 'center' });
          doc.fontSize(8.5).font('Helvetica').fillColor(LGRAY)
            .text(sig.role, sx, sy + 20, { width: sigW, align: 'center' });
        } else {
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor(LGRAY)
            .text(String(sig.role).toUpperCase(), sx, sy + 6, { width: sigW, align: 'center' });
        }
        reset();
      });

      // Date in the middle, between the two signatures.
      doc.fontSize(9).font('Helvetica').fillColor('#444444')
        .text('Issued on ' + awardDate, PW / 2 - 110, sy + 6, { width: 220, align: 'center' });
      if (certificateNo) {
        doc.fontSize(8).font('Helvetica').fillColor(LGRAY)
          .text('Certificate No: ' + certificateNo, PW / 2 - 110, sy + 20, { width: 220, align: 'center' });
      }
      reset();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};


module.exports = {
  generateReceipt, generateCreditAgreement, generateLayawayAgreement,
  generatePriceList, generateReport, generateBlankReceiptForm,
  generateInstallmentPlanSheet, generateInstallmentTable, generateTableReport,
  generateDayEndReport,
  generateFixedPriceList, generateAcceptanceLetter,
  generateCompletionLetter, generateInternshipCertificate,
  // The original name, kept so nothing that imports it breaks.
  generateFreezerOfferSheet: generateInstallmentPlanSheet,
};
