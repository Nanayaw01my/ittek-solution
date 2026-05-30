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

/**
 * Generate a thermal receipt PDF for a sale.
 * @param {Object} saleData - Sale document with items populated
 * @returns {Promise<Buffer>}
 */
const generateReceipt = (saleData) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [226, 600], // 80mm thermal paper width approx
        margins: { top: 10, bottom: 10, left: 10, right: 10 },
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { invoice_no, customer_name, customer_phone, items, subtotal, discount, discount_type, total_amount, payment_method, payment_status, sale_date } = saleData;

      // Header
      doc.fontSize(10).font('Helvetica-Bold').text('DAN & DOR SOLAR COMPANY LIMITED', { align: 'center' });
      doc.fontSize(7).font('Helvetica').text('Solar Energy Solutions', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(7).text('--------------------------------', { align: 'center' });
      doc.fontSize(8).font('Helvetica-Bold').text('SALES RECEIPT', { align: 'center' });
      doc.fontSize(7).font('Helvetica').text('--------------------------------', { align: 'center' });

      // Invoice info
      doc.fontSize(7).text(`Invoice: ${invoice_no}`);
      doc.text(`Date: ${new Date(sale_date || Date.now()).toLocaleString('en-GH')}`);
      if (customer_name) doc.text(`Customer: ${customer_name}`);
      if (customer_phone) doc.text(`Phone: ${customer_phone}`);

      doc.fontSize(7).text('--------------------------------', { align: 'center' });

      // Items
      doc.fontSize(7).font('Helvetica-Bold');
      doc.text('Item                     Qty  Price    Total');
      doc.font('Helvetica');
      doc.fontSize(7).text('--------------------------------', { align: 'center' });

      (items || []).forEach((item) => {
        const name = (item.product_name || '').substring(0, 20).padEnd(20);
        const qty = String(item.quantity).padStart(4);
        const price = `GHC${Number(item.unit_price).toFixed(2)}`.padStart(8);
        const total = `GHC${Number(item.total).toFixed(2)}`.padStart(8);
        doc.text(`${name} ${qty} ${price} ${total}`);
      });

      doc.fontSize(7).text('--------------------------------', { align: 'center' });

      // Totals
      doc.fontSize(7);
      doc.text(`Subtotal:                  GHC${Number(subtotal || 0).toFixed(2)}`);
      if (discount && discount > 0) {
        const discStr = discount_type === 'percentage' ? `${discount}%` : `GHC${Number(discount).toFixed(2)}`;
        doc.text(`Discount (${discStr}):`);
      }
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text(`TOTAL:                     GHC${Number(total_amount || 0).toFixed(2)}`);
      doc.fontSize(7).font('Helvetica');
      doc.text(`Payment: ${(payment_method || '').toUpperCase()}`);
      doc.text(`Status: ${(payment_status || '').toUpperCase()}`);

      doc.fontSize(7).text('--------------------------------', { align: 'center' });
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
        doc.fontSize(9).font('Helvetica-Bold').fillColor(ORANGE).text(text, ML, y, { width: W });
        const lineY = y + 13;
        doc.moveTo(ML, lineY).lineTo(ML + W, lineY).lineWidth(0.8).strokeColor(ORANGE).stroke();
        resetColors();
        return lineY + 6;
      };

      const drawField = (label, value, x, y, width) => {
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor(LGRAY).text(label, x, y, { width, lineBreak: false });
        doc.fontSize(8.5).font('Helvetica').fillColor('#111111').text(String(value || '—'), x, y + 9, { width, lineBreak: false });
        doc.moveTo(x, y + 21).lineTo(x + width, y + 21).lineWidth(0.3).strokeColor('#cccccc').stroke();
        resetColors();
      };

      const drawPhotoBox = (x, y, buf, topLabel) => {
        const PW = 65; const PH = 80;
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

      // ── Watermark ─────────────────────────────────────────────────────────────
      if (logoBuf) {
        try {
          doc.save();
          doc.opacity(0.55);
          doc.image(logoBuf, ML + (W - 320) / 2, 240, { width: 320 });
          doc.restore();
        } catch {}
      }

      // ── Header: passport photos + company info ─────────────────────────────
      const H_Y = 42;
      const PHOTO_W = 65;
      const PHOTO_H = 80;

      drawPhotoBox(ML, H_Y, customerPhotoBuf, 'CUSTOMER');
      drawPhotoBox(ML + W - PHOTO_W, H_Y, guarantorPhotoBuf, 'GUARANTOR');

      const cX = ML + PHOTO_W + 5;
      const cW = W - PHOTO_W * 2 - 10;
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#111111')
        .text('DAN & DOR SOLAR COMPANY LIMITED', cX, H_Y + 8, { width: cW, align: 'center' });
      doc.fontSize(8).font('Helvetica').fillColor(LGRAY)
        .text('Accra, Ghana  |  Tel: +233 XXX XXX XXX', cX, H_Y + 28, { width: cW, align: 'center' });
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor(ORANGE)
        .text('CREDIT SALE AGREEMENT', cX, H_Y + 46, { width: cW, align: 'center' });
      resetColors();

      let y = H_Y + PHOTO_H + 18;

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
      y += 32;
      drawField('Date', start ? start.toLocaleDateString('en-GH') : '—', ML, y, c3 - 4);
      drawField('Location', customer_address, ML + c3, y, c3 - 4);
      drawField('Phone / Tel', customer_phone, ML + c3 * 2, y, c3 - 4);
      y += 36;

      // ── Product & Payment Terms ────────────────────────────────────────────────
      y = sectionTitle('PRODUCT AND PAYMENT TERMS', y);
      drawField('Product Type', product_type, ML, y, c3 - 4);
      drawField('Serial Number', serial_number || '—', ML + c3, y, c3 - 4);
      drawField('Down Payment (GHC)', 'GHC ' + Number(down_payment).toFixed(2), ML + c3 * 2, y, c3 - 4);
      y += 32;

      const c2 = (W - 6) / 2;
      drawField('Payment Plan', (planLabel[payment_plan] || 'Week') + 'ly', ML, y, c2 - 3);
      drawField('Loan Total Amount (GHC)', 'GHC ' + Number(total_amount).toFixed(2), ML + c2 + 6, y, c2 - 3);
      y += 32;

      // Balance display
      doc.fontSize(7).font('Helvetica-Bold').fillColor(LGRAY).text('Balance (Loan Total - Down Payment)', ML, y);
      doc.fontSize(12).font('Helvetica-Bold').fillColor(ORANGE)
        .text('GHC ' + balance.toFixed(2), ML, y + 9);
      resetColors();
      y += 32;

      // Payment schedule table
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#111').text('Payment Schedule (3 equal instalments):', ML, y);
      y += 14;

      const TH = 18;
      const tCols = [W * 0.22, W * 0.44, W * 0.34];
      const tX = ML;

      // Table header
      doc.fillColor(ORANGE).rect(tX, y, W, TH).fill();
      ['Period', 'Due Date', 'Amount (GHC)'].forEach((h, i) => {
        const cx = tX + tCols.slice(0, i).reduce((a, b) => a + b, 0);
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#fff')
          .text(h, cx + 3, y + 5, { width: tCols[i] - 6, align: 'center', lineBreak: false });
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
          doc.fontSize(8).font('Helvetica').fillColor('#111')
            .text(cell, cx + 3, y + 5, { width: tCols[ci] - 6, align: 'center', lineBreak: false });
        });
        y += TH;
      });

      // Total row
      doc.fillColor('#fff3e0').rect(tX, y, W, TH).fill();
      doc.strokeColor(ORANGE).lineWidth(0.8).rect(tX, y, W, TH).stroke();
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(ORANGE)
        .text('TOTAL BALANCE', tX + 3, y + 5, { width: tCols[0] + tCols[1] - 6, align: 'right', lineBreak: false });
      doc.text('GHC ' + balance.toFixed(2), tX + tCols[0] + tCols[1] + 3, y + 5, { width: tCols[2] - 6, align: 'center', lineBreak: false });
      resetColors();
      y += TH + 10;

      // ── Guarantor Details ─────────────────────────────────────────────────────
      y = sectionTitle('GUARANTOR DETAILS', y);
      const c4 = (W - 12) / 4;
      drawField('Guarantor Name', guarantor_name, ML, y, c4 - 3);
      drawField('Ghana Card No.', guarantor_ghana_card || '—', ML + c4 + 4, y, c4 - 3);
      drawField('Location', guarantor_address, ML + (c4 + 4) * 2, y, c4 - 3);
      drawField('Phone Number', guarantor_phone, ML + (c4 + 4) * 3, y, c4 - 3);
      y += 36;

      // ── Agreement Text ────────────────────────────────────────────────────────
      y = sectionTitle('CUSTOMER AGREEMENT', y);
      const custText =
        'I (' + customer_name + ') have agreed to the terms and conditions of DAN AND DOR SOLAR COMPANY LIMITED. ' +
        'I understand and agree that I am entering into a legally binding contract with DAN AND DOR SOLAR COMPANY LIMITED, ' +
        'and that I will be bound by the terms and conditions of the contract.\n\n' +
        'I have agreed that the company can repossess the devices when I (' + customer_name + ') fail(s) to pay on time, ' +
        'by the way the company wants me to pay.\n\n' +
        'I agree that one third (1/3) of the down payment should be paid back to me when I am not able to pay on time.';
      doc.fontSize(8).font('Helvetica').fillColor('#222222').text(custText, ML, y, { width: W, lineGap: 1.5 });
      y = doc.y + 10;

      // ── Guarantor Section ─────────────────────────────────────────────────────
      y = sectionTitle('GUARANTOR SECTION', y);
      const guarText =
        'I (' + guarantor_name + ') have agreed to witness for (' + customer_name + ') in case he/she does not pay on time. ' +
        'And I stand to pay his/her debt.';
      doc.fontSize(8).font('Helvetica').fillColor('#222222').text(guarText, ML, y, { width: W, lineGap: 1.5 });
      y = doc.y + 14;

      // ── Signatories ───────────────────────────────────────────────────────────
      if (y > 680) { doc.addPage(); y = 50; }

      y = sectionTitle('SIGNATORIES', y);

      const sigLabels = ['CEO', 'MANAGER', 'CUSTOMER', 'GUARANTOR'];
      const sigSubNames = ['', '', customer_name, guarantor_name];
      const sigW = (W - 12) / 4;

      sigLabels.forEach((label, i) => {
        const sx = ML + i * (sigW + 4);
        doc.rect(sx, y, sigW, 48).lineWidth(0.5).strokeColor('#cccccc').stroke();
        doc.fontSize(6).fillColor('#bbbbbb').text('Signature', sx + 2, y + 4, { width: sigW - 4, align: 'center', lineBreak: false });
        doc.moveTo(sx + 6, y + 40).lineTo(sx + sigW - 6, y + 40).lineWidth(0.5).strokeColor('#999999').stroke();
        resetColors();
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#111').text(label, sx, y + 52, { width: sigW, align: 'center', lineBreak: false });
        if (sigSubNames[i]) {
          doc.fontSize(6.5).font('Helvetica').fillColor(LGRAY).text(sigSubNames[i], sx, y + 63, { width: sigW, align: 'center', lineBreak: false });
        }
        resetColors();
      });

      y += 78;
      doc.fontSize(7.5).font('Helvetica').fillColor(LGRAY)
        .text('Date: ___________________________', ML + W / 2 - 60, y);
      resetColors();

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
const generateReport = (reportData, title = 'Report') => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 60, right: 60 } });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

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

module.exports = { generateReceipt, generateCreditAgreement, generateReport };
