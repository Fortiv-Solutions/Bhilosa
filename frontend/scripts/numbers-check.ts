/** Sanity checks for the parsing/repair layer.  npx tsx scripts/numbers-check.ts */
import {
  applyDiscountCascade, checkGstin, checkPan, normaliseHsn, normaliseUnit,
  normaliseVehicleNumber, parseAmount, parseCreditDays, parseDiscountCascade,
  parseInvoiceDate, parseInvoiceDateTime, repairGstin, splitQuantityUnit,
  wordsToNumberIndian, extractIfsc, isUnitLikeHeader,
} from '../src/lib/ocr/numbers';

let pass = 0;
let fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(46)} got=${JSON.stringify(got)}${ok ? '' : `  want=${JSON.stringify(want)}`}`);
}

console.log('--- amounts ---');
eq('plain', parseAmount('467365.74'), 467365.74);
eq('rupee + western group', parseAmount('₹8,319.00'), 8319);
eq('indian lakh grouping', parseAmount('21,08,663.00'), 2108663);
eq('scanner yen artefact', parseAmount('¥21,08,663.00'), 2108663);
eq('negative roundoff', parseAmount('-0.07'), -0.07);
eq('trailing minus (ERP)', parseAmount('1,234.00-'), -1234);
eq('parenthesised', parseAmount('(1,234.00)'), -1234);
eq('Rs prefix + slash suffix', parseAmount('Rs. 45750.00/-'), 45750);
eq('zero with 3dp', parseAmount('0.000'), 0);
eq('OCR letter-for-digit', parseAmount('551492.OO'), 551492);
eq('OCR spaces', parseAmount('38 771 . 25'), 38771.25);
eq('blank', parseAmount('-'), null);
eq('three dp rate', parseAmount('305.000'), 305);

console.log('\n--- dates (day-first always) ---');
eq('dd/mm/yyyy', parseInvoiceDate('11/07/2026'), '2026-07-11');
eq('dd Mon yyyy', parseInvoiceDate('16 Jul 2026'), '2026-07-16');
eq('dd-mm-yyyy', parseInvoiceDate('20-07-2026'), '2026-07-20');
eq('ack datetime', parseInvoiceDateTime('20-07-2026 13:28:00'), '2026-07-20T13:28:00');
eq('due-date prose', parseInvoiceDate('PAYMENT DUE IN 30 DAYS ON 10/08/2026'), '2026-08-10');
eq('credit days prose', parseCreditDays('PAYMENT DUE IN 30 DAYS ON 10/08/2026'), 30);
eq('credit days zero', parseCreditDays('Payment within 0 days'), 0);
eq('rejects nonsense', parseInvoiceDate('26-27/499'), null);

console.log('\n--- amount in words (Indian) ---');
eq('AJIT', wordsToNumberIndian('Five lakh fifty one thousand four hundred ninety two only'), 551492);
eq('BHAGAVAT', wordsToNumberIndian('INR Eight Thousand, Three Hundred And Nineteen Rupees Only. E & O.E'), 8319);
eq('ARCHIT', wordsToNumberIndian('Rupees. Forty Five Thousand Seven Hundred Fifty Only.'), 45750);
eq('crore scale', wordsToNumberIndian('One crore twenty lakh five thousand'), 12005000);

console.log('\n--- discount cascade ---');
eq('AJIT cascade', parseDiscountCascade('55.00 + 15.25'), [55, 15.25]);
eq('cascade no spaces', parseDiscountCascade('65.00+15.25'), [65, 15.25]);
eq('nil dash', parseDiscountCascade('-'), []);
eq('explicit zero', parseDiscountCascade('0.00'), [0]);
eq('AJIT line1 math', Math.round(applyDiscountCascade(88 * 4840, [55, 15.25]) * 100) / 100, 162435.24);
eq('AJIT line2 math', Math.round(applyDiscountCascade(50 * 14750, [65, 15.25]) * 100) / 100, 218760.94);
eq('AJIT line3 math', Math.round(applyDiscountCascade(50 * 5810, [65, 15.25]) * 100) / 100, 86169.56);

console.log('\n--- qty / unit ---');
eq('fused qty+unit', splitQuantityUnit('150 PKTS'), { quantity: 150, unit: 'PKTS' });
eq('bare qty', splitQuantityUnit('88'), { quantity: 88, unit: null });
eq('BAGES typo -> BAGS', normaliseUnit('BAGES'), 'BAGS');
eq('pcs lowercase', normaliseUnit('pcs'), 'PCS');
eq('BAGES is unit-like header', isUnitLikeHeader('BAGES'), true);
eq('Description is not unit-like', isUnitLikeHeader('Description'), false);

console.log('\n--- GSTIN checksum + repair ---');
for (const g of ['24AVOPS6752N2ZN', '24ABYFA3137F1ZE', '24AUHPK6558N1Z1', '24ABZFA6800G1ZB',
                 '24ACIPS4047H1ZI', '24ABDFP8234D1ZG']) {
  const c = checkGstin(g);
  console.log(`     ${g}  format=${c.formatOk}  checksum=${c.checksumOk}  pan=${c.pan}`);
}
eq('repair Z->2 (BHAGAVAT vendor)', repairGstin('24AUHPK6558N121')?.value, '24AUHPK6558N1Z1');
eq('repair 2->Z (ARCHIT buyer)', repairGstin('24ABDFP8234D12G')?.value, '24ABDFP8234D1ZG');
eq('valid passes through, 0 edits', repairGstin('24ABZFA6800G1ZB')?.edits, 0);
eq('PAN from GSTIN', checkGstin('24AUHPK6558N1Z1').pan, 'AUHPK6558N');
eq('PAN valid', checkPan('AUHPK6558N').valid, true);

console.log('\n--- misc identifiers ---');
eq('HSN 8-digit', normaliseHsn('69109000'), '69109000');
eq('vehicle clean', normaliseVehicleNumber('GJ19Z3519'), 'GJ19Z3519');
eq('IFSC extract', extractIfsc('Rtgs/Neft/Ifsc KKBK0000871'), 'KKBK0000871');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
