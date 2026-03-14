/**
 * Structured Notes — shared formatting helpers.
 *
 * Workforce custom fields (5 required questions) are stored as separate columns
 * on time_entries. This module provides centralised formatting for every output
 * context: emails, invoices, plain-text, HTML.
 *
 * Field mapping (Workforce → DB column):
 *   5680924  "1.Work-what you did"        → activity_performed
 *   5680960  "2.Complications-time consuming" → complications
 *   5680934  "3.Purpose-why necessary"     → why_necessary
 *   5680936  "4.Resources Utilized"        → resources_used
 *   5680962  "5.Client Benefit"            → client_benefit
 */

// ── Workforce custom-field IDs ─────────────────────────────────────────
export const WORKFORCE_FIELD_IDS = {
  ACTIVITY_PERFORMED: '5680924',
  COMPLICATIONS:      '5680960',
  WHY_NECESSARY:      '5680934',
  RESOURCES_USED:     '5680936',
  CLIENT_BENEFIT:     '5680962',
} as const;

// ── Core interface ─────────────────────────────────────────────────────
export interface StructuredNotes {
  activityPerformed?: string | null;
  complications?:     string | null;
  whyNecessary?:      string | null;
  resourcesUsed?:     string | null;
  clientBenefit?:     string | null;
}

// ── Labels (single source of truth — change here, changes everywhere) ─
export const FIELD_LABELS = {
  activityPerformed: 'Activity Performed',
  complications:     'Complications / Difficulty',
  whyNecessary:      'Why Activity Necessary',
  resourcesUsed:     'Resources / Documents Used',
  clientBenefit:     'Client Benefit',
} as const;

/** Fields shown to clients (excludes Complications). */
const CLIENT_FIELDS: (keyof StructuredNotes)[] = [
  'activityPerformed', 'whyNecessary', 'resourcesUsed', 'clientBenefit',
];

/** All fields in display order. */
const ALL_FIELDS: (keyof StructuredNotes)[] = [
  'activityPerformed', 'complications', 'whyNecessary', 'resourcesUsed', 'clientBenefit',
];

// Short labels for compact contexts (invoices, single-line)
const SHORT_LABELS: Record<keyof StructuredNotes, string> = {
  activityPerformed: 'Activity',
  complications:     'Complications',
  whyNecessary:      'Why Necessary',
  resourcesUsed:     'Resources',
  clientBenefit:     'Client Benefit',
};

// ── Detection ──────────────────────────────────────────────────────────

/** Check whether a DB row has any structured note fields populated. */
export function hasStructuredNotes(entry: Record<string, unknown>): boolean {
  return !!(
    entry.activity_performed ||
    entry.complications ||
    entry.why_necessary ||
    entry.resources_used ||
    entry.client_benefit
  );
}

/** Pull structured fields from a DB row (snake_case) into camelCase interface. */
export function extractStructuredFields(entry: Record<string, unknown>): StructuredNotes | null {
  if (!hasStructuredNotes(entry)) return null;
  return {
    activityPerformed: (entry.activity_performed as string) || null,
    complications:     (entry.complications as string) || null,
    whyNecessary:      (entry.why_necessary as string) || null,
    resourcesUsed:     (entry.resources_used as string) || null,
    clientBenefit:     (entry.client_benefit as string) || null,
  };
}

/** Convert Workforce API customfields map → StructuredNotes. */
export function fromWorkforceCustomFields(cf: Record<string, string> | undefined): StructuredNotes | null {
  if (!cf) return null;
  const sn: StructuredNotes = {
    activityPerformed: cf[WORKFORCE_FIELD_IDS.ACTIVITY_PERFORMED] || null,
    complications:     cf[WORKFORCE_FIELD_IDS.COMPLICATIONS] || null,
    whyNecessary:      cf[WORKFORCE_FIELD_IDS.WHY_NECESSARY] || null,
    resourcesUsed:     cf[WORKFORCE_FIELD_IDS.RESOURCES_USED] || null,
    clientBenefit:     cf[WORKFORCE_FIELD_IDS.CLIENT_BENEFIT] || null,
  };
  // Return null if nothing was actually filled in
  if (!sn.activityPerformed && !sn.complications && !sn.whyNecessary && !sn.resourcesUsed && !sn.clientBenefit) {
    return null;
  }
  return sn;
}

/** Convert StructuredNotes → DB column map (snake_case) for upsert. */
export function toDbColumns(sn: StructuredNotes | null): Record<string, string | null> {
  if (!sn) return {
    activity_performed: null,
    complications: null,
    why_necessary: null,
    resources_used: null,
    client_benefit: null,
  };
  return {
    activity_performed: sn.activityPerformed || null,
    complications:      sn.complications || null,
    why_necessary:      sn.whyNecessary || null,
    resources_used:     sn.resourcesUsed || null,
    client_benefit:     sn.clientBenefit || null,
  };
}

// ── Plain-text formatting ──────────────────────────────────────────────

/** Multi-line plain text with labels. */
export function formatPlainText(sn: StructuredNotes, internal = false): string {
  const fields = internal ? ALL_FIELDS : CLIENT_FIELDS;
  return fields
    .filter(k => sn[k])
    .map(k => `${SHORT_LABELS[k]}: ${sn[k]}`)
    .join('\n');
}

/** Single-line compact (pipe-separated) for invoice descriptions. */
export function formatForInvoice(sn: StructuredNotes): string {
  return CLIENT_FIELDS
    .filter(k => sn[k])
    .map(k => `${SHORT_LABELS[k]}: ${sn[k]}`)
    .join(' | ');
}

// ── HTML formatting (for emails) ───────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** HTML block with bold labels and line breaks — fits inside an email <td>. */
export function formatForEmail(sn: StructuredNotes, internal = false): string {
  const fields = internal ? ALL_FIELDS : CLIENT_FIELDS;
  return fields
    .filter(k => sn[k])
    .map(k => `<strong>${SHORT_LABELS[k]}:</strong> ${esc(sn[k]!)}`)
    .join('<br>');
}

// ── Fallback logic ─────────────────────────────────────────────────────

/**
 * Get the best description for display, with structured-notes priority.
 * Returns HTML string for email contexts, plain string otherwise.
 *
 * Priority: structured fields → description → non-junk notes → empty flag.
 */
export function bestDescription(
  entry: Record<string, unknown>,
  opts: { html?: boolean; internal?: boolean } = {},
): string {
  const { html = false, internal = false } = opts;
  const sn = extractStructuredFields(entry);

  if (sn) {
    return html ? formatForEmail(sn, internal) : formatPlainText(sn, internal);
  }

  // Fall back to legacy fields
  const desc = entry.description as string | null;
  if (desc) return html ? esc(desc) : desc;

  const notes = entry.notes as string | null;
  if (notes && !isJunkNote(notes)) return html ? esc(notes) : notes;

  if (html) return '<span style="color:#dc2626; font-style:italic;">No description entered</span>';
  return '';
}

// ── Junk-note filter (reused from email-templates) ─────────────────────
const JUNK_NOTES = new Set([
  'clock', 'clocked', 'clocked in', 'clocked out',
  'test', 'n/a', 'na', '.', '-',
]);

export function isJunkNote(note?: string | null): boolean {
  return !note || JUNK_NOTES.has(note.trim().toLowerCase());
}
