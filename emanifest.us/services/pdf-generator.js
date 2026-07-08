// PDF generator for EPA Form 8700-22
const PDFDocument = require('pdfkit');

function generateManifestPDF(formData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 36 });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ─── HEADER ───
      doc
        .fontSize(7)
        .font('Helvetica')
        .text('Form Approved. OMB No. 2050-0039', 36, 36)
        .text('EPA Form 8700-22 (Rev. 12-17)', 432, 36, { align: 'right' });

      doc.moveDown(0.5);
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('UNIFORM HAZARDOUS WASTE MANIFEST', 36, 50, { align: 'center', width: 504 });

      // Horizontal rule
      doc.moveTo(36, 62).lineTo(540, 62).stroke();

      // ─── BLOCK 1 — Generator EPA ID ───
      drawBlockLabel(doc, 36, 66, '1.', 'Generator EPA ID Number');
      drawField(doc, 72, 66, 180, 18);
      drawBlockLabel(doc, 258, 66, '', 'Manifest Tracking Number');
      drawField(doc, 330, 66, 210, 18);

      // ─── BLOCK 2 — Generator Info (name + address inline) ───
      drawBlockLabel(doc, 36, 90, '2.', 'Generator Information');
      doc.font('Helvetica').fontSize(7).fillColor('#666').text('Name', 72, 90);
      drawField(doc, 72, 97, 210, 18);
      doc.font('Helvetica').fontSize(7).text('Site Address', 288, 90);
      drawField(doc, 288, 97, 252, 18);
      doc.font('Helvetica').fontSize(7).text('Mailing Address', 72, 120);
      drawField(doc, 72, 127, 468, 18);
      doc.font('Helvetica').fontSize(7).text('City/State/ZIP', 72, 149);
      drawField(doc, 72, 156, 468, 18);

      // ─── BLOCK 3 — Special Handling ───
      drawBlockLabel(doc, 36, 180, '3.', 'Special Handling Instructions');
      drawField(doc, 54, 180, 480, 32, true);

      // ─── BLOCK 4 — Transporter 1 ───
      drawBlockLabel(doc, 36, 222, '4.', 'Transporter 1');
      doc.font('Helvetica').fontSize(7).fillColor('#666').text('EPA ID No.', 72, 222);
      drawField(doc, 72, 229, 120, 18);
      doc.font('Helvetica').fontSize(7).text('Name', 198, 222);
      drawField(doc, 198, 229, 342, 18);
      doc.font('Helvetica').fontSize(7).text('City/State', 72, 252);
      drawField(doc, 72, 259, 468, 18);

      // ─── BLOCK 5 — Transporter 2 ───
      drawBlockLabel(doc, 36, 287, '5.', 'Transporter 2');
      doc.font('Helvetica').fontSize(7).fillColor('#666').text('EPA ID No.', 72, 287);
      drawField(doc, 72, 294, 120, 18);
      doc.font('Helvetica').fontSize(7).text('Name', 198, 287);
      drawField(doc, 198, 294, 342, 18);
      doc.font('Helvetica').fontSize(7).text('City/State', 72, 314);
      drawField(doc, 72, 321, 468, 18);

      // ─── BLOCK 6 — Designated Facility ───
      drawBlockLabel(doc, 36, 348, '6.', 'Designated Facility');
      doc.font('Helvetica').fontSize(7).fillColor('#666').text('EPA ID No.', 72, 348);
      drawField(doc, 72, 355, 120, 18);
      doc.font('Helvetica').fontSize(7).text('Name', 198, 348);
      drawField(doc, 198, 355, 342, 18);
      doc.font('Helvetica').fontSize(7).text('Site Address', 72, 375);
      drawField(doc, 72, 382, 468, 18);
      doc.font('Helvetica').fontSize(7).text('City/State/ZIP', 72, 400);
      drawField(doc, 72, 407, 468, 18);

      // ─── BLOCK 7 — DOT Description Table ───
      drawBlockLabel(doc, 36, 435, '7.', 'U.S. DOT Description');
      doc.fontSize(6).fillColor('#444')
        .text('HM', 36, 435)
        .text('Proper Shipping Name / Hazard Class / ID No. / Pkg Group', 60, 435)
        .text('Container Type', 378, 435)
        .text('No.', 450, 435)
        .text('Total Qty', 474, 435)
        .text('Unit', 534, 435);

      // Table header line
      doc.moveTo(36, 445).lineTo(558, 445).stroke();

      const { dot_info, materials } = formData.scan_data || {};
      const dotDesc = dot_info
        ? `${dot_info.shipping_name} | Class ${dot_info.hazard_class} | ${dot_info.un_number}${dot_info.packing_group ? ` | Pkg Grp ${dot_info.packing_group}` : ''}`
        : formData.dot_description || '';

      const qty = formData.total_quantity_lbs
        ? `${Math.round(formData.total_quantity_lbs)}`
        : (materials?.[0]?.estimated_weight_lbs ? `${Math.round(materials[0].estimated_weight_lbs)}` : '');
      const unit = qty ? 'LB' : '';

      const rowData = [dotDesc, 'DT', '1', qty, unit];
      const rowY = 448;
      doc.font('Helvetica').fontSize(7).fillColor('#000');
      doc.text('1', 36, rowY);
      doc.text(truncate(rowData[0], 72), 52, rowY, { width: 318 });
      doc.text(rowData[1], 378, rowY);
      doc.text(rowData[2], 450, rowY);
      doc.text(rowData[3], 470, rowY);
      doc.text(rowData[4], 536, rowY);

      for (let r = 1; r <= 4; r++) {
        const ry = rowY + r * 18;
        doc.moveTo(36, ry).lineTo(558, ry).stroke();
        doc.text(String(r + 1), 36, ry + 2);
      }

      // ─── BLOCK 8 — Waste Codes ───
      const wcY = rowY + 90 + 18;
      drawBlockLabel(doc, 36, wcY, '8.', 'Waste Codes');
      doc.fontSize(6).fillColor('#666').text('(EPA Codes — e.g. D001, F001, K061)', 54, wcY);
      const codes = (dot_info?.waste_codes || formData.waste_codes || []).join(', ');
      doc.font('Helvetica').fontSize(8).fillColor('#000').text(codes || formData.waste_codes || '', 54, wcY + 10, { width: 480 });

      // ─── BLOCK 9 — Generator Certification ───
      const certY = wcY + 40;
      doc.moveTo(36, certY).lineTo(558, certY).stroke();
      drawBlockLabel(doc, 36, certY + 4, '9.', 'Generator Certification');
      doc.font('Helvetica').fontSize(6).fillColor('#444')
        .text('I hereby declare that the contents of the consignment are fully and accurately described above by proper shipping name, classified, packaged, marked and labeled, and in all respects in proper condition for transport according to applicable international and national governmental regulations.', 54, certY + 14, { width: 490 });
      doc.fontSize(7).fillColor('#666')
        .text('Signature', 54, certY + 38)
        .text('Printed Name', 216, certY + 38)
        .text('Date', 432, certY + 38);
      drawField(doc, 54, certY + 46, 156, 18);
      drawField(doc, 216, certY + 46, 210, 18);
      drawField(doc, 432, certY + 46, 96, 18);

      // ─── BLOCK 10 — Transporter Acknowledgment ───
      const taY = certY + 72;
      doc.moveTo(36, taY).lineTo(558, taY).stroke();
      drawBlockLabel(doc, 36, taY + 4, '10.', 'Transporter Acknowledgment');
      doc.fontSize(7).fillColor('#666').text('Transporter 1', 54, taY + 14)
        .text('Signature', 54, taY + 30).text('Printed Name', 216, taY + 30).text('Date', 432, taY + 30);
      drawField(doc, 54, taY + 38, 156, 18);
      drawField(doc, 216, taY + 38, 210, 18);
      drawField(doc, 432, taY + 38, 96, 18);
      doc.fontSize(7).fillColor('#666').text('Transporter 2', 54, taY + 64)
        .text('Signature', 54, taY + 80).text('Printed Name', 216, taY + 80).text('Date', 432, taY + 80);
      drawField(doc, 54, taY + 88, 156, 18);
      drawField(doc, 216, taY + 88, 210, 18);
      drawField(doc, 432, taY + 88, 96, 18);

      // ─── BLOCK 11 — Discrepancy ───
      const discY = taY + 118;
      doc.moveTo(36, discY).lineTo(558, discY).stroke();
      drawBlockLabel(doc, 36, discY + 4, '11.', 'Discrepancy');
      doc.fontSize(6).fillColor('#666').text('Indication: Quantity ☐  Type ☐  Residue ☐  Partial Rejection ☐  Full Rejection ☐', 54, discY + 14);
      doc.fontSize(7).fillColor('#666').text('Manifest Reference #:', 54, discY + 30);
      drawField(doc, 162, discY + 28, 396, 18);

      // ─── BLOCK 12 — Management Method Codes ───
      const mmY = discY + 56;
      drawBlockLabel(doc, 36, mmY, '12.', 'Management Method Codes');
      doc.fontSize(7).fillColor('#666').text('(e.g. H061 — Fuel blending, H141 — Storage/pending, H132 — Landfill)', 54, mmY + 8);
      drawField(doc, 54, mmY + 22, 180, 18);
      drawField(doc, 240, mmY + 22, 180, 18);
      drawField(doc, 426, mmY + 22, 108, 18);

      // ─── BLOCK 13 — Designated Facility Certification ───
      const dfY = mmY + 50;
      doc.moveTo(36, dfY).lineTo(558, dfY).stroke();
      drawBlockLabel(doc, 36, dfY + 4, '13.', 'Designated Facility Certification');
      doc.fontSize(7).fillColor('#666').text('Signature', 54, dfY + 14).text('Printed Name', 216, dfY + 14).text('Date', 432, dfY + 14);
      drawField(doc, 54, dfY + 22, 156, 18);
      drawField(doc, 216, dfY + 22, 210, 18);
      drawField(doc, 432, dfY + 22, 96, 18);

      // Footer
      doc.fontSize(6).fillColor('#999')
        .text('EPA Form 8700-22 (Rev. 12-17) — Previous editions are obsolete.', 36, 742, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawBlockLabel(doc, x, y, blockNum, label) {
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#000');
  if (blockNum) doc.text(blockNum, x, y);
  doc.font('Helvetica').fontSize(7).fillColor('#555').text(label, x + (blockNum ? 14 : 0), y);
  return x + (blockNum ? 14 : 0) + 80;
}

function drawField(doc, x, y, w, h, multiline) {
  doc
    .rect(x, y, w, h)
    .stroke('#aaa');
  return { x, y, w, h };
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen - 2) + '…' : str;
}

module.exports = { generateManifestPDF };