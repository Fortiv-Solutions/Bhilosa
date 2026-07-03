// Formats construction ERP monetary values using Indian lakh and crore units.
export function formatIndianCurrency(value: number): string {
  if (!Number.isFinite(value)) return 'INR 0';
  if (Math.abs(value) >= 10_000_000) return `INR ${(value / 10_000_000).toFixed(2)} Cr`;
  if (Math.abs(value) >= 100_000) return `INR ${(value / 100_000).toFixed(2)} L`;
  return `INR ${value.toLocaleString('en-IN')}`;
}
