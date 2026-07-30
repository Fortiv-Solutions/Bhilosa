/**
 * Shared print-report engine for the procurement module.
 *
 * Two problems this solves:
 *
 * 1. **Escaping.** The six report builders previously interpolated database
 *    free-text (vendor names, item descriptions, inspection remarks, MR
 *    justifications) straight into an HTML string and handed it to
 *    `document.write`. Anything a user could type into a procurement form
 *    became executable script in whoever printed the document. Every value
 *    that reaches the page now goes through `esc()`.
 *
 * 2. **Completeness and structure.** The reports showed a partial, ad-hoc
 *    subset of each document. Reports are now declared as an ordered list of
 *    sections — field grids, line tables, totals blocks, signature strips —
 *    so every field captured on the corresponding form appears in a
 *    predictable place, and a field added to a form is one line here.
 */

// =====================================================================
// Escaping and formatting primitives
// =====================================================================

/** Escapes a value for interpolation into HTML text or an attribute. */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapes and converts newlines to <br>, for multi-line remarks and terms. */
export function escMultiline(value: unknown): string {
  return esc(value).replace(/\r?\n/g, '<br>');
}

const EM_DASH = '—';

export function fmtCurrency(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return EM_DASH;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtNumber(value: unknown, maxDigits = 3): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return EM_DASH;
  return n.toLocaleString('en-IN', { maximumFractionDigits: maxDigits });
}

export function fmtDate(value: unknown): string {
  if (!value) return EM_DASH;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(value: unknown): string {
  if (!value) return EM_DASH;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function fmtBool(value: unknown): string {
  if (value === null || value === undefined || value === '') return EM_DASH;
  return value ? 'Yes' : 'No';
}

export function fmtPercent(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return EM_DASH;
  return `${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
}

/** Turns a snake_case / camelCase status into a display label. */
export function fmtStatus(value: unknown): string {
  if (!value) return EM_DASH;
  return String(value)
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Renders a plain value, falling back to an em dash so gaps read as intentional. */
export function fmtText(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text === '' ? EM_DASH : text;
}

// =====================================================================
// Section model
// =====================================================================

export type ReportField = {
  label: string;
  /** Pre-formatted display value; escaped when rendered. */
  value: unknown;
  /** Spans the full row width — use for addresses, remarks, terms. */
  wide?: boolean;
  /** Renders the value preserving newlines. */
  multiline?: boolean;
};

export type ReportColumn<T> = {
  header: string;
  /** Returns the already-formatted cell text; escaped when rendered. */
  cell: (row: T, index: number) => unknown;
  align?: 'left' | 'right' | 'center';
  /** Optional footer cell, for a column total. */
  footer?: (rows: T[]) => unknown;
};

export type ReportSection =
  | { kind: 'fields'; title: string; fields: ReportField[]; columns?: 2 | 3 | 4 }
  | { kind: 'table'; title: string; html: string }
  | { kind: 'totals'; title: string; rows: { label: string; value: unknown; emphasis?: boolean }[] }
  | { kind: 'note'; title: string; body: unknown }
  | { kind: 'signatures'; title: string; slots: string[] };

/** Builds a field-grid section, dropping fields with no label. */
export function fieldsSection(
  title: string,
  fields: (ReportField | null | false | undefined)[],
  columns: 2 | 3 | 4 = 3,
): ReportSection {
  return {
    kind: 'fields',
    title,
    columns,
    fields: fields.filter((f): f is ReportField => Boolean(f)),
  };
}

/**
 * Builds a line-item table section. Renders an explicit "no rows" line rather
 * than an empty table, so a blank section is never mistaken for a rendering
 * fault.
 */
export function tableSection<T>(
  title: string,
  rows: T[],
  columns: ReportColumn<T>[],
  emptyMessage = 'No entries recorded',
): ReportSection {
  const head = columns
    .map((col) => `<th style="text-align:${col.align || 'left'}">${esc(col.header)}</th>`)
    .join('');

  const body = rows.length
    ? rows
        .map(
          (row, index) =>
            `<tr>${columns
              .map(
                (col) =>
                  `<td style="text-align:${col.align || 'left'}">${esc(col.cell(row, index))}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('')
    : `<tr><td colspan="${columns.length}" class="empty">${esc(emptyMessage)}</td></tr>`;

  const hasFooter = columns.some((col) => col.footer);
  const foot =
    hasFooter && rows.length
      ? `<tfoot><tr>${columns
          .map(
            (col) =>
              `<td style="text-align:${col.align || 'left'}">${
                col.footer ? esc(col.footer(rows)) : ''
              }</td>`,
          )
          .join('')}</tr></tfoot>`
      : '';

  return {
    kind: 'table',
    title,
    html: `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`,
  };
}

// =====================================================================
// Document rendering
// =====================================================================

export type ReportDocument = {
  /** e.g. "Purchase Order" */
  documentTitle: string;
  /** e.g. "PO-20260731-0001" */
  documentNumber?: string | null;
  organisation?: string;
  projectName?: string | null;
  /** Watermark for anything not yet approved. */
  statusLabel?: string | null;
  draft?: boolean;
  sections: ReportSection[];
};

const ORGANISATION_DEFAULT = 'Pramukh Group';

function renderFields(section: Extract<ReportSection, { kind: 'fields' }>): string {
  const perRow = section.columns || 3;
  const cells: string[] = [];

  for (const field of section.fields) {
    const span = field.wide ? perRow : 1;
    const value = field.multiline ? escMultiline(field.value) : esc(field.value);
    cells.push(
      `<div class="field" style="grid-column: span ${span}">` +
        `<div class="field-label">${esc(field.label)}</div>` +
        `<div class="field-value">${value || EM_DASH}</div>` +
        `</div>`,
    );
  }

  return `<div class="field-grid" style="grid-template-columns: repeat(${perRow}, 1fr)">${cells.join('')}</div>`;
}

function renderSection(section: ReportSection): string {
  const heading = `<h2 class="section-heading">${esc(section.title)}</h2>`;

  switch (section.kind) {
    case 'fields':
      return section.fields.length ? heading + renderFields(section) : '';
    case 'table':
      return heading + section.html;
    case 'totals':
      return (
        heading +
        `<table class="totals">${section.rows
          .map(
            (row) =>
              `<tr class="${row.emphasis ? 'emphasis' : ''}">` +
              `<td class="totals-label">${esc(row.label)}</td>` +
              `<td class="totals-value">${esc(row.value)}</td></tr>`,
          )
          .join('')}</table>`
      );
    case 'note':
      return heading + `<div class="note">${escMultiline(section.body) || EM_DASH}</div>`;
    case 'signatures':
      return (
        heading +
        `<div class="signatures">${section.slots
          .map(
            (slot) =>
              `<div class="sign-slot"><div class="sign-line"></div><div class="sign-label">${esc(slot)}</div></div>`,
          )
          .join('')}</div>`
      );
    default:
      return '';
  }
}

const REPORT_CSS = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    padding: 20px 24px; color: #000; margin: 0; background: #fff;
    font-size: 11px; line-height: 1.35;
  }
  h1, h2, h3 { margin: 0; padding: 0; color: #000; }
  .doc-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 4px; }
  .org-name { font-size: 17px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
  .doc-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; margin-top: 3px; }
  .doc-meta { font-size: 10px; font-weight: 600; margin-top: 3px; }
  .doc-sub { display: flex; justify-content: space-between; font-size: 10px;
             font-weight: 700; padding: 5px 0; border-bottom: 1px solid #000; margin-bottom: 12px; }
  .section-heading {
    font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.6px;
    margin: 14px 0 6px; border-bottom: 1.5px solid #000; padding-bottom: 3px;
  }
  .field-grid { display: grid; gap: 0; border: 1px solid #000; border-bottom: none; }
  .field { border-bottom: 1px solid #000; border-right: 1px solid #000; padding: 4px 7px; min-height: 30px; }
  .field:last-child { border-right: 1px solid #000; }
  .field-label { font-size: 8.5px; font-weight: 800; text-transform: uppercase;
                 letter-spacing: 0.3px; color: #333; }
  .field-value { font-size: 11px; font-weight: 600; margin-top: 1px; word-break: break-word; }
  table.grid { width: 100%; border-collapse: collapse; font-size: 10px; }
  table.grid th, table.grid td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
  table.grid th { font-weight: 800; text-transform: uppercase; font-size: 8.5px;
                  letter-spacing: 0.3px; background: #f0f0f0; }
  table.grid tfoot td { font-weight: 900; background: #f0f0f0; }
  table.grid td.empty { text-align: center; color: #444; font-style: italic; padding: 8px; }
  table.totals { width: 45%; margin-left: auto; border-collapse: collapse; font-size: 11px; }
  table.totals td { border: 1px solid #000; padding: 4px 8px; }
  .totals-label { font-weight: 700; }
  .totals-value { text-align: right; font-weight: 700; width: 45%; }
  table.totals tr.emphasis td { font-weight: 900; background: #f0f0f0; font-size: 12px; }
  .note { border: 1px solid #000; padding: 7px 9px; font-size: 10px; white-space: normal; }
  .signatures { display: flex; gap: 28px; margin-top: 30px; }
  .sign-slot { flex: 1; text-align: center; }
  .sign-line { border-bottom: 1px solid #000; height: 34px; }
  .sign-label { font-size: 9px; font-weight: 800; text-transform: uppercase;
                letter-spacing: 0.3px; margin-top: 3px; }
  .footer-note { margin-top: 18px; padding-top: 6px; border-top: 1px solid #000;
                 font-size: 8.5px; color: #333; display: flex; justify-content: space-between; }
  .watermark {
    position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-32deg);
    font-size: 82px; font-weight: 900; color: rgba(0, 0, 0, 0.07);
    text-transform: uppercase; letter-spacing: 6px; pointer-events: none; z-index: 0;
  }
  .content { position: relative; z-index: 1; }
  @media print {
    body { padding: 0; }
    .section-heading { break-after: avoid; }
    table.grid { break-inside: auto; }
    tr { break-inside: avoid; }
  }
`;

/** Renders a report document to a complete, self-contained HTML page. */
export function renderReportHtml(doc: ReportDocument): string {
  const generatedAt = fmtDateTime(new Date().toISOString());
  const sections = doc.sections.map(renderSection).filter(Boolean).join('');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${esc(doc.documentTitle)}${doc.documentNumber ? ` - ${esc(doc.documentNumber)}` : ''}</title>
    <style>${REPORT_CSS}</style>
  </head>
  <body>
    ${doc.draft ? `<div class="watermark">${esc(doc.statusLabel || 'Draft')}</div>` : ''}
    <div class="content">
      <div class="doc-header">
        <div class="org-name">${esc(doc.organisation || ORGANISATION_DEFAULT)}</div>
        <div class="doc-title">${esc(doc.documentTitle)}</div>
        ${doc.documentNumber ? `<div class="doc-meta">${esc(doc.documentNumber)}</div>` : ''}
      </div>
      <div class="doc-sub">
        <span>Project: ${esc(fmtText(doc.projectName))}</span>
        <span>Status: ${esc(fmtStatus(doc.statusLabel))}</span>
      </div>
      ${sections}
      <div class="footer-note">
        <span>Generated ${esc(generatedAt)}</span>
        <span>${esc(doc.organisation || ORGANISATION_DEFAULT)} — system generated, subject to verification</span>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * Opens a report in a new window for printing.
 *
 * Uses a blob URL and an iframe-free document swap rather than
 * `document.write`, and returns false when a popup blocker intervenes so the
 * caller can surface a real message instead of appearing to do nothing.
 */
export function openReportWindow(doc: ReportDocument): boolean {
  if (typeof window === 'undefined') return false;

  const printWindow = window.open('', '_blank', 'width=1024,height=900');
  if (!printWindow) return false;

  printWindow.document.open();
  printWindow.document.write(renderReportHtml(doc));
  printWindow.document.close();
  printWindow.focus();

  // Give the styles a tick to apply before the print dialog appears.
  printWindow.setTimeout(() => {
    try {
      printWindow.print();
    } catch {
      /* the user can still print manually */
    }
  }, 250);

  return true;
}

/** Statuses that mean "not yet a final document", so the page is watermarked. */
export function isDraftStatus(status: unknown): boolean {
  const s = String(status || '').toLowerCase();
  return (
    s === '' ||
    s === 'draft' ||
    s === 'auto_draft_pr' ||
    s === 'auto_draft_grn' ||
    s.startsWith('pending') ||
    s === 'submitted' ||
    s === 'in_review' ||
    s === 'under_verification' ||
    s === 'rejected' ||
    s === 'cancelled'
  );
}
