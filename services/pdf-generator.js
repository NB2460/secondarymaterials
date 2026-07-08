/**
 * PDF generation for EPA Form 8700-22.
 * Uses PDFKit to render a form matching the official EPA layout.
 */
const PDFDocument = require('pdfkit');

function generateManifestPDF(formData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 36 });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const dot = formData.scan_data?.dot_info || {};
      const dotDesc = dot.shipping_name
        ? `${dot.shipping_name} | Class ${dot.hazard_class} | ${dot.un_number}${dot.packing_group ? ` | Pkg Grp ${dot.packing_group}` : ''}`
        : formData.dot_description || '';
      const qty = formData.total_quantity_lbs ? String(Math.round(formData.total_quantity_lbs)) : '';
      const unit = qty ? 'LB' : '';
      const codes = (dot.waste_codes || formData.waste_codes || []).join(', ') || '—';

      // ── HEADER ──────────────────────────────────────────────────────────
      doc.fontSize(7).font('Helvetica')
        .text('Form Approved. OMB No. 2050-0039', 36, 36)
        .text('EPA Form 8700-22 (Rev. 12-17)', 432, 36, { align: 'right' });

      doc.fontSize(9).font('Helvetica-Bold')
        .text('UNIFORM HAZARDOUS WASTE MANIFEST', 36, 50, { align: 'center', width: 504 });

      doc.moveTo(36, 62).lineTo(540, 62).stroke();

      // ── BLOCK 1 — Generator EPA ID + Manifest Tracking Number ────────────
      fieldLabel(doc, 36, 66, '1. Generator EPA ID Number');
      field(doc, 126, 64, 180, 18, formData.generator_epa_id);
      fieldLabel(doc, 312, 66, 'Manifest Tracking Number');
      field(doc, 432, 64, 108, 18, formData.manifest_tracking_number);

      // ── BLOCK 2 — Generator Info ──────────────────────────────────────────
      fieldLabel(doc, 36, 88, '2. Generator Information');
      inlineLabel(doc, 72, 88, 'Name');
      field(doc, 72, 95, 210, 18, formData.generator_name);
      inlineLabel(doc, 288, 88, 'Site Address');
      field(doc, 288, 95, 252, 18, formData.generator_address);
      inlineLabel(doc, 72, 118, 'Mailing Address');
      field(doc, 72, 125, 468, 18, formData.generator_address);
      inlineLabel(doc, 72, 148, 'City / State / ZIP');
      field(doc, 72, 155, 468, 18, '');

      // ── BLOCK 3 — Special Handling ───────────────────────────────────────
      fieldLabel(doc, 36, 179, '3. Special Handling Instructions and Additional Information');
      field(doc, 54, 178, 480, 32, formData.special_handling, true);

      // ── BLOCK 4 — Transporter 1 ───────────────────────────────────────────
      fieldLabel(doc, 36, 220, '4. Transporter 1 Company Information');
      inlineLabel(doc, 72, 220, 'EPA ID No.');
      field(doc, 72, 227, 120, 18, formData.transporter1_epa_id);
      inlineLabel(doc, 198, 220, 'Name');
      field(doc, 198, 227, 342, 18, formData.transporter1_name);
      inlineLabel(doc, 72, 250, 'City / State');
      field(doc, 72, 257, 468, 18, '');

      // ── BLOCK 5 — Transporter 2 ───────────────────────────────────────────
      fieldLabel(doc, 36, 285, '5. Transporter 2 Company Information');
      inlineLabel(doc, 72, 285, 'EPA ID No.');
      field(doc, 72, 292, 120, 18, formData.transporter2_epa_id);
      inlineLabel(doc, 198, 285, 'Name');
      field(doc, 198, 292, 342, 18, formData.transporter2_name);
      inlineLabel(doc, 72, 315, 'City / State');
      field(doc, 72, 322, 468, 18, '');

      // ── BLOCK 6 — Designated Facility ─────────────────────────────────────
      fieldLabel(doc, 36, 350, '6. Designated Facility Information');
      inlineLabel(doc, 72, 350, 'EPA ID No.');
      field(doc, 72, 357, 120, 18, formData.designated_facility_id);
      inlineLabel(doc, 198, 350, 'Name');
      field(doc, 198, 357, 342, 18, formData.designated_facility_name);
      inlineLabel(doc, 72, 378, 'Site Address');
      field(doc, 72, 385, 468, 18, formData.designated_facility_address);
      inlineLabel(doc, 72, 403, 'City / State / ZIP');
      field(doc, 72, 410, 468, 18, '');

      // ── BLOCK 7 — U.S. DOT Description (the big table) ───────────────────
      fieldLabel(doc, 36, 438, '7. U.S. DOT Description (including Proper Shipping Name, Hazard Class, ID Number, and Packing Group)');

      doc.fontSize(5.5).fillColor('#555')
        .text('HM', 36, 438)
        .text('Proper Shipping Name / Hazard Class / ID No. / Pkg Grp', 54, 438)
        .text('Container Type', 378, 438)
        .text('No.', 450, 438)
        .text('Total Qty', 472, 438)
        .text('Unit', 534, 438);

      doc.moveTo(36, 447).lineTo(558, 447).stroke();

      const rowY = 450;
      doc.font('Helvetica').fontSize(7.5).fillColor('#000');
      doc.text('1', 36, rowY);
      doc.text(truncate(dotDesc, 80), 52, rowY, { width: 320 });
      doc.text(formData.container_type || 'DT', 378, rowY);
      doc.text('1', 450, rowY);
      doc.text(qty, 468, rowY);
      doc.text(unit, 536, rowY);

      for (let r = 1; r <= 4; r++) {
        const ry = rowY + r * 18;
        doc.moveTo(36, ry).lineTo(558, ry).stroke();
        doc.text(String(r + 1), 36, ry + 2);
      }

      // ── BLOCK 8 — Waste Codes ─────────────────────────────────────────────
      const wcY = rowY + 108;
      fieldLabel(doc, 36, wcY, '8. Waste Codes');
      doc.fontSize(6).fillColor('#666')
        .text('(EPA codes — e.g. D001 Ignitable, F001 Solvent, K061 Electric Arc Furnace)', 54, wcY + 8);
      doc.font('Helvetica').fontSize(8.5).fillColor('#000')
        .text(codes, 54, wcY + 20, { width: 480 });

      // ── BLOCK 9 — Generator Certification ──────────────────────────────────
      const certY = wcY + 52;
      doc.moveTo(36, certY).lineTo(558, certY).stroke();
      fieldLabel(doc, 36, certY + 4, '9. Generator Certification');
      doc.fontSize(6).fillColor('#444')
        .text('I hereby declare that the contents of the consignment are fully and accurately described above by proper shipping name, classified, packaged, marked and labeled, and are in proper condition for transport per applicable regulations.', 54, certY + 14, { width: 490 });
      doc.fontSize(7).fillColor('#555')
        .text('Signature', 54, certY + 36).text('Printed Name', 216, certY + 36).text('Date', 432, certY + 36);
      field(doc, 54, certY + 44, 156, 18, '');
      field(doc, 216, certY + 44, 210, 18, '');
      field(doc, 432, certY + 44, 96, 18, '');

      // ── BLOCK 10 — Transporter Acknowledgment ─────────────────────────────
      const taY = certY + 72;
      doc.moveTo(36, taY).lineTo(558, taY).stroke();
      fieldLabel(doc, 36, taY + 4, '10. Transporter Acknowledgment of Receipt of Materials');
      doc.fontSize(7).fillColor('#555')
        .text('Transporter 1', 54, taY + 14)
        .text('Signature', 54, taY + 30).text('Printed Name', 216, taY + 30).text('Date', 432, taY + 30);
      field(doc, 54, taY + 38, 156, 18, '');
      field(doc, 216, taY + 38, 210, 18, '');
      field(doc, 432, taY + 38, 96, 18, '');
      doc.fillColor('#555')
        .text('Transporter 2', 54, taY + 64)
        .text('Signature', 54, taY + 80).text('Printed Name', 216, taY + 80).text('Date', 432, taY + 80);
      field(doc, 54, taY + 88, 156, 18, '');
      field(doc, 216, taY + 88, 210, 18, '');
      field(doc, 432, taY + 88, 96, 18, '');

      // ── BLOCK 11 — Discrepancy ─────────────────────────────────────────────
      const discY = taY + 118;
      doc.moveTo(36, discY).lineTo(558, discY).stroke();
      fieldLabel(doc, 36, discY + 4, '11. Discrepancy');
      doc.fontSize(6).fillColor('#666')
        .text('Indication: ☐ Quantity  ☐ Type  ☐ Residue  ☐ Partial Rejection  ☐ Full Rejection', 54, discY + 14);
      doc.fontSize(7).fillColor('#666').text('Manifest Reference #:', 54, discY + 30);
      field(doc, 168, discY + 28, 390, 18, '');

      // ── BLOCK 12 — Management Method Codes ────────────────────────────────
      const mmY = discY + 56;
      fieldLabel(doc, 36, mmY, '12. Management Method Codes');
      doc.fontSize(6.5).fillColor('#666')
        .text('(e.g. H061 Fuel blending | H141 Storage/pending | H132 Landfill | H040 Incineration)', 54, mmY + 8);
      field(doc, 54, mmY + 20, 170, 18, formData.management_method || 'H141');
      field(doc, 230, mmY + 20, 170, 18, '');
      field(doc, 406, mmY + 20, 116, 18, '');

      // ── BLOCK 13 — Designated Facility Certification ───────────────────────
      const dfY = mmY + 48;
      doc.moveTo(36, dfY).lineTo(558, dfY).stroke();
      fieldLabel(doc, 36, dfY + 4, '13. Designated Facility Owner or Operator Certification of Receipt');
      doc.fontSize(7).fillColor('#555')
        .text('Signature', 54, dfY + 14).text('Printed Name', 216, dfY + 14).text('Date', 432, dfY + 14);
      field(doc, 54, dfY + 22, 156, 18, '');
      field(doc, 216, dfY + 22, 210, 18, '');
      field(doc, 432, dfY + 22, 96, 18, '');

      // ── FOOTER ────────────────────────────────────────────────────────────
      doc.fontSize(5.5).fillColor('#aaa')
        .text('EPA Form 8700-22 (Rev. 12-17) — Previous editions are obsolete.', 36, 742, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function fieldLabel(doc, x, y, text) {
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#000').text(text, x, y);
}

function inlineLabel(doc, x, y, text) {
  doc.font('Helvetica').fontSize(6.5).fillColor('#666').text(text, x, y);
}

// Draw field border and write value text inside
function field(doc, x, y, w, h, text, multiline) {
  doc.rect(x, y, w, h).stroke('#aaa');
  if (text) {
    doc.font('Helvetica').fontSize(7.5).fillColor('#111');
    if (multiline) {
      doc.text(text, x + 3, y + 3, { width: w - 6, height: h - 6, lineGap: 1 });
    } else {
      const maxChars = Math.floor(w / 5.5);
      doc.text(truncate(text, maxChars), x + 3, y + (h - 8) / 2, { width: w - 6 });
    }
  }
}

function truncate(str, maxChars) {
  if (!str) return '';
  return str.length > maxChars ? str.substring(0, maxChars - 1) + '…' : str;
}

module.exports = { generateManifestPDF };