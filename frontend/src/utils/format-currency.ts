export function formatIndianCurrency(value: number): string {
  if (!Number.isFinite(value)) return 'INR 0';
  if (Math.abs(value) >= 10_000_000) return `INR ${(value / 10_000_000).toFixed(2)} Cr`;
  if (Math.abs(value) >= 100_000) return `INR ${(value / 100_000).toFixed(2)} L`;
  return `INR ${value.toLocaleString('en-IN')}`;
}

/** Converts currency amounts into Indian English words (e.g. 87556 -> Eighty Seven Thousand Five Hundred and Fifty Six Only) */
export function numberToIndianWords(num: number): string {
  if (!Number.isFinite(num) || num === 0) return 'Zero Only';
  const a = [
    '', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ',
    'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n: number): string {
    if (n < 20) return a[n];
    const digit = n % 10;
    if (n < 100) return b[Math.floor(n / 10)] + (digit ? ' ' + a[digit] : ' ');
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 ? 'and ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 ? inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 ? inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 ? inWords(n % 10000000) : '');
  }

  const integerPart = Math.floor(Math.abs(num));
  const words = inWords(integerPart).trim();
  return words ? words + ' Only' : 'Zero Only';
}
