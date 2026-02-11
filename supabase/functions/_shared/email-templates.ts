/**
 * Shared email template components for MIT Consulting
 *
 * All components use 100% inline CSS for Outlook desktop compatibility.
 * VML fallbacks for buttons (Outlook renders Word engine, not HTML).
 * Pattern extracted from invite-user (the only Outlook-safe template).
 */

// MIT favicon as base64 PNG (32x32, 191 bytes)
const MIT_LOGO_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAhklEQVR42u2WSw6AMAhE5zKezON7iLpyU+OAfCZGJd1BeC2UD5Z1az34AbWAcUglYFiSAhBHTgby0eCWKIk1sWeAQP5dAO6dq85a3L27qZ0MXglIVjIDmOn1FNekjQOuekYZIPKC9hzEarj4mz4ekGG4epGimyrmQftEU8xk0Vah2Is+v5vuGba66UdGBNoAAAAASUVORK5CYII=';

// Color constants
export const COLORS = {
  blue: '#2563eb',
  blueDark: '#1e40af',
  blueLight: '#dbeafe',
  blueBg: '#eff6ff',
  orange: '#e67e22',
  orangeLight: '#fef3c7',
  red: '#dc2626',
  redLight: '#fef2f2',
  green: '#16a34a',
  greenDark: '#166534',
  greenLight: '#dcfce7',
  greenBg: '#f0fdf4',
  amber: '#fbbf24',
  amberDark: '#92400e',
  amberBg: '#fefce8',
  gray: '#6b7280',
  grayLight: '#f9fafb',
  grayBorder: '#e5e7eb',
  text: '#333333',
  textDark: '#1f2937',
  textMuted: '#374151',
  white: '#ffffff',
} as const;

// Service category color map
const SERVICE_COLORS: Record<string, { bg: string; text: string }> = {
  'Expert Analysis': { bg: '#ede9fe', text: '#5b21b6' },
  'Site Inspection': { bg: '#dbeafe', text: '#1e40af' },
  'Travel': { bg: '#fef3c7', text: '#92400e' },
  'Report Writing': { bg: '#fce7f3', text: '#9d174d' },
  'Consultation': { bg: '#d1fae5', text: '#065f46' },
  'Project Management': { bg: '#e0e7ff', text: '#3730a3' },
  'Administrative': { bg: '#f3f4f6', text: '#374151' },
};

export interface HeaderOptions {
  color?: string;
  title: string;
  subtitle?: string;
  reportNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  customerName?: string;
  claimNumber?: string;
  generatedDate?: string;
}

export interface EntryRow {
  date: string;
  employee: string;
  costCode?: string;
  description?: string;
  hours: string;
  billable?: string;
  startTime?: string;
  endTime?: string;
  isNew?: boolean;
  isUpdated?: boolean;
  changeNote?: string;
}

export interface TableOptions {
  showBadges?: boolean;       // Show NEW/UPD badges (supplemental reports)
  showChangeNotes?: boolean;  // Show inline change explanations
  showBillable?: boolean;     // Show billable column
  showTime?: boolean;         // Show time in/out column
}

export interface NotificationRecord {
  label: string;
  sentAt: string;
  delivered: boolean;
  deliveredAt?: string;
  opened: boolean;
  openedAt?: string;
}

/**
 * Full HTML email wrapper — Outlook-safe structure
 */
export function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; color: ${COLORS.text}; background-color: #f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="1020" cellpadding="0" cellspacing="0" style="max-width: 1020px; width: 100%;">
${content}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Email header with MIT logo, title, and optional period/report info
 */
export function emailHeader(options: HeaderOptions): string {
  const color = options.color || COLORS.blue;
  const lightColor = color === COLORS.red ? '#fecaca'
    : color === COLORS.orange ? '#fed7aa'
    : color === COLORS.green ? '#bbf7d0'
    : COLORS.blueLight;

  // Period banner (dark sub-header)
  let periodBanner = '';
  if (options.periodStart && options.periodEnd) {
    const bannerBg = color === COLORS.red ? '#991b1b'
      : color === COLORS.orange ? '#c2410c'
      : color === COLORS.green ? '#15803d'
      : COLORS.blueDark;
    periodBanner = `
          <tr>
            <td style="background-color: ${bannerBg}; padding: 14px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color: ${COLORS.white}; font-size: 14px; font-family: Arial, sans-serif;"><strong>Report Period:</strong> ${options.periodStart} &ndash; ${options.periodEnd}</td>
                  ${options.reportNumber ? `<td align="right" style="color: ${lightColor}; font-size: 13px; font-family: Arial, sans-serif;">${options.reportNumber}</td>` : ''}
                </tr>
              </table>
            </td>
          </tr>`;
  }

  // Customer info block
  let customerInfo = '';
  if (options.customerName) {
    customerInfo = `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 25px 40px 15px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family: Arial, sans-serif;">
                    <p style="margin: 0; font-size: 13px; color: ${COLORS.gray};">Prepared for:</p>
                    <p style="margin: 4px 0 0; font-size: 16px; font-weight: bold; color: #111111;">${options.customerName}</p>
                    ${options.claimNumber ? `<p style="margin: 2px 0 0; font-size: 13px; color: ${COLORS.gray};">Claim #: ${options.claimNumber}</p>` : ''}
                  </td>
                  ${options.generatedDate ? `
                  <td align="right" style="font-family: Arial, sans-serif;">
                    <p style="margin: 0; font-size: 13px; color: ${COLORS.gray};">Generated:</p>
                    <p style="margin: 4px 0 0; font-size: 14px; color: #111111;">${options.generatedDate}</p>
                  </td>` : ''}
                </tr>
              </table>
            </td>
          </tr>`;
  }

  return `
          <!-- Header -->
          <tr>
            <td style="background-color: ${color}; padding: 30px 40px; border-radius: 8px 8px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="40" valign="middle" style="padding-right: 14px;">
                    <img src="data:image/png;base64,${MIT_LOGO_BASE64}" width="32" height="32" alt="MIT" style="display: block; border: 0;" />
                  </td>
                  <td valign="middle" style="font-family: Arial, sans-serif;">
                    <h1 style="margin: 0; font-size: 22px; font-weight: bold; color: ${COLORS.white};">${options.title}</h1>
                    <p style="margin: 4px 0 0; font-size: 14px; color: ${lightColor};">${options.subtitle || 'Mitigation Inspection &amp; Testing &mdash; MIT Consulting'}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>${periodBanner}${customerInfo}`;
}

/**
 * Email footer with company info and optional DO NOT PAY disclaimer
 */
export function emailFooter(options?: { internal?: boolean }): string {
  const doNotPay = options?.internal ? '' : `<em>DO NOT PAY &mdash; This is a time record, not an invoice.</em> | `;

  return `
          <!-- Footer -->
          <tr>
            <td style="background-color: ${COLORS.grayLight}; padding: 20px 40px; border: 1px solid ${COLORS.grayBorder}; border-top: none; border-radius: 0 0 8px 8px; font-size: 12px; color: ${COLORS.gray}; font-family: Arial, sans-serif;">
              <p style="margin: 0;">Questions? Reply to this email or contact <a href="mailto:accounting@mitigationconsulting.com" style="color: ${COLORS.blue};">accounting@mitigationconsulting.com</a> | 813-962-6855</p>
              <p style="margin: 8px 0 0;"><strong>MIT Consulting</strong> | ${doNotPay}Mitigation Inspection &amp; Testing</p>
            </td>
          </tr>`;
}

/**
 * 3-day review notice — yellow warning box
 */
export function reviewNotice(): string {
  return `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 10px 40px 25px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.amberBg}; border: 2px solid ${COLORS.amber}; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px; font-family: Arial, sans-serif;">
                    <h3 style="margin: 0 0 10px; color: ${COLORS.amberDark}; font-size: 14px;">&#9888; IMPORTANT &mdash; Please Review</h3>
                    <p style="margin: 0; font-size: 13px; color: #78350f; line-height: 1.7;">
                      We kindly request that you review the time entries and detailed notes above and indicate any and all concerns you may have <strong>immediately</strong>.
                      If we do not receive a response within <strong>three (3) business days</strong> of this report, we will presume the time is accepted as reported and will confirm it as billable.
                    </p>
                    <p style="margin: 10px 0 0; font-size: 12px; color: ${COLORS.amberDark};">
                      To report discrepancies or request adjustments, please reply directly to this email or use the review link provided.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

/**
 * CTA button with VML fallback for Outlook
 */
export function emailButton(url: string, label: string, color?: string): string {
  const btnColor = color || COLORS.blue;
  return `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 0 40px 25px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder}; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="16%" stroke="f" fillcolor="${btnColor}">
                      <w:anchorlock/>
                      <center style="color:${COLORS.white};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${label}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${url}" style="display: inline-block; padding: 13px 36px; background-color: ${btnColor}; color: ${COLORS.white}; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; font-family: Arial, sans-serif;">${label}</a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

/**
 * Summary stats box — green metrics (Total Hours, Entries, Days Active)
 */
export function summaryStats(totalHours: number, entryCount: number, daysActive: number): string {
  return `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 10px 40px 20px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.greenBg}; border: 1px solid #bbf7d0; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px 20px; text-align: center; border-right: 1px solid #bbf7d0; font-family: Arial, sans-serif;">
                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: ${COLORS.greenDark};">${totalHours.toFixed(2)}</p>
                    <p style="margin: 2px 0 0; font-size: 11px; color: ${COLORS.greenDark}; text-transform: uppercase;">Total Hours</p>
                  </td>
                  <td style="padding: 16px 20px; text-align: center; border-right: 1px solid #bbf7d0; font-family: Arial, sans-serif;">
                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: ${COLORS.greenDark};">${entryCount}</p>
                    <p style="margin: 2px 0 0; font-size: 11px; color: ${COLORS.greenDark}; text-transform: uppercase;">Entries</p>
                  </td>
                  <td style="padding: 16px 20px; text-align: center; font-family: Arial, sans-serif;">
                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: ${COLORS.greenDark};">${daysActive}</p>
                    <p style="margin: 2px 0 0; font-size: 11px; color: ${COLORS.greenDark}; text-transform: uppercase;">Days Active</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

/**
 * Activity detail table — time entries with service category badges
 */
export function activityTable(entries: EntryRow[], totalHours: number, options?: TableOptions): string {
  const showBadges = options?.showBadges ?? false;
  const showChangeNotes = options?.showChangeNotes ?? false;

  const rows = entries.map((entry, i) => {
    const bgColor = entry.isNew ? '#fff8e1' : entry.isUpdated ? '#f3e5f5' : (i % 2 === 1 ? COLORS.grayLight : COLORS.white);

    // NEW / UPD badge
    let badge = '';
    if (showBadges && entry.isNew) {
      badge = ' <span style="background-color: #16a34a; color: white; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: bold;">NEW</span>';
    } else if (showBadges && entry.isUpdated) {
      badge = ' <span style="background-color: #d97706; color: white; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: bold;">UPD</span>';
    }

    // Service category badge
    const serviceColors = SERVICE_COLORS[entry.costCode || ''] || { bg: '#f3f4f6', text: '#374151' };
    const serviceBadge = entry.costCode
      ? `<span style="background-color: ${serviceColors.bg}; color: ${serviceColors.text}; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${entry.costCode}</span>`
      : 'General';

    // Change note row (shown below the entry row for supplemental reports)
    let changeNoteRow = '';
    if (showChangeNotes && entry.changeNote) {
      changeNoteRow = `
              <tr style="background-color: ${bgColor};">
                <td colspan="5" style="padding: 0 8px 10px; border-left: 2px solid #d1d5db; border-right: 2px solid #d1d5db; border-bottom: 2px solid #d1d5db; font-size: 12px; color: ${COLORS.gray}; font-style: italic; font-family: Arial, sans-serif;">
                  &#8627; ${entry.changeNote}
                </td>
              </tr>`;
    }

    return `
              <tr style="background-color: ${bgColor};">
                <td style="padding: 10px 8px; border: 2px solid #d1d5db; white-space: nowrap; font-family: Arial, sans-serif; vertical-align: top;">${entry.date}${badge}</td>
                <td style="padding: 10px 8px; border: 2px solid #d1d5db; font-family: Arial, sans-serif; vertical-align: top;">${entry.employee}</td>
                <td style="padding: 10px 8px; border: 2px solid #d1d5db; font-family: Arial, sans-serif; vertical-align: top;">${serviceBadge}</td>
                <td style="padding: 10px 8px; border: 2px solid #d1d5db; font-family: Arial, sans-serif; width: 65%;">${entry.description || '-'}</td>
                <td style="padding: 10px 8px; border: 2px solid #d1d5db; text-align: right; font-weight: bold; font-family: Arial, sans-serif; vertical-align: top;">${entry.hours}</td>
              </tr>${changeNoteRow}`;
  }).join('');

  return `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 10px 40px 20px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <h3 style="margin: 0 0 12px; color: ${COLORS.textDark}; font-size: 15px; font-family: Arial, sans-serif;">Activity Detail</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background-color: ${COLORS.grayLight};">
                    <th style="padding: 10px 8px; text-align: left; border: 2px solid #d1d5db; color: ${COLORS.textMuted}; font-size: 11px; text-transform: uppercase; font-family: Arial, sans-serif;">Date</th>
                    <th style="padding: 10px 8px; text-align: left; border: 2px solid #d1d5db; color: ${COLORS.textMuted}; font-size: 11px; text-transform: uppercase; font-family: Arial, sans-serif;">Professional</th>
                    <th style="padding: 10px 8px; text-align: left; border: 2px solid #d1d5db; color: ${COLORS.textMuted}; font-size: 11px; text-transform: uppercase; font-family: Arial, sans-serif;">Service</th>
                    <th style="padding: 10px 8px; text-align: left; border: 2px solid #d1d5db; color: ${COLORS.textMuted}; font-size: 11px; text-transform: uppercase; font-family: Arial, sans-serif; width: 65%;">Description of Services</th>
                    <th style="padding: 10px 8px; text-align: right; border: 2px solid #d1d5db; color: ${COLORS.textMuted}; font-size: 11px; text-transform: uppercase; font-family: Arial, sans-serif;">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
                <tfoot>
                  <tr style="background-color: ${COLORS.greenBg};">
                    <td colspan="4" style="padding: 12px 8px; border: 2px solid #d1d5db; text-align: right; font-weight: bold; color: ${COLORS.greenDark}; font-family: Arial, sans-serif;">Week Total:</td>
                    <td style="padding: 12px 8px; border: 2px solid #d1d5db; text-align: right; font-weight: bold; font-size: 16px; color: ${COLORS.greenDark}; font-family: Arial, sans-serif;">${totalHours.toFixed(2)} hrs</td>
                  </tr>
                </tfoot>
              </table>
            </td>
          </tr>`;
}

/**
 * Content section — white background block for paragraphs
 */
export function contentSection(html: string): string {
  return `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 15px 40px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 14px; color: ${COLORS.textMuted};">
              ${html}
            </td>
          </tr>`;
}

/**
 * Supplemental report "Why You're Receiving This" orange banner
 */
export function supplementalBanner(originalSentDate: string, originalReportNumber?: string): string {
  return `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 15px 40px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #fff7ed; border: 2px solid #fb923c; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px; font-family: Arial, sans-serif;">
                    <h3 style="margin: 0 0 8px; color: #c2410c; font-size: 14px;">Why You&rsquo;re Receiving This</h3>
                    <p style="margin: 0; font-size: 13px; color: #9a3412; line-height: 1.6;">
                      We are providing this supplemental report because there has been a change in the time categorization or details within a previously provided activity record${originalReportNumber ? ` (${originalReportNumber})` : ''}, originally sent on ${originalSentDate}. Please review the updated entries below.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

/**
 * Before/After summary for supplemental reports
 */
export function changeSummary(originalHours: number, updatedHours: number, originalCount: number, updatedCount: number, changes: string[]): string {
  const diff = updatedHours - originalHours;
  const diffColor = diff > 0 ? COLORS.red : diff < 0 ? COLORS.green : COLORS.textMuted;
  const diffSign = diff > 0 ? '+' : '';

  return `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 10px 40px 20px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px; font-family: Arial, sans-serif;">
                    <h3 style="margin: 0 0 10px; color: #0c4a6e; font-size: 14px;">What Changed</h3>
                    <ul style="color: #0c4a6e; margin: 0 0 12px; padding-left: 20px; font-size: 13px;">
                      ${changes.map(c => `<li style="margin-bottom: 4px;">${c}</li>`).join('')}
                    </ul>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.white}; border-radius: 4px; font-size: 14px;">
                      <tr>
                        <td style="padding: 6px 12px; font-family: Arial, sans-serif;">Previously reported:</td>
                        <td style="padding: 6px 12px; text-align: right; font-weight: bold; font-family: Arial, sans-serif;">${originalHours.toFixed(2)} hours (${originalCount} entries)</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 12px; font-family: Arial, sans-serif;">Updated total:</td>
                        <td style="padding: 6px 12px; text-align: right; font-weight: bold; font-family: Arial, sans-serif;">${updatedHours.toFixed(2)} hours (${updatedCount} entries)</td>
                      </tr>
                      ${diff !== 0 ? `
                      <tr>
                        <td style="padding: 6px 12px; font-family: Arial, sans-serif;">Net change:</td>
                        <td style="padding: 6px 12px; text-align: right; font-weight: bold; color: ${diffColor}; font-family: Arial, sans-serif;">${diffSign}${diff.toFixed(2)} hours</td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

/**
 * Notification proof table — shows delivery attempts with sent/delivered/opened
 */
export function notificationProofTable(records: NotificationRecord[]): string {
  const rows = records.map((r, i) => {
    const bg = i % 2 === 1 ? COLORS.grayLight : COLORS.white;
    const deliveredCell = r.delivered
      ? `<span style="color: ${COLORS.greenDark};">Yes${r.deliveredAt ? `, ${r.deliveredAt}` : ''}</span>`
      : `<span style="color: ${COLORS.gray};">Pending</span>`;
    const openedCell = r.opened
      ? `<span style="color: ${COLORS.greenDark};">Yes, ${r.openedAt || ''}</span>`
      : `<span style="color: ${COLORS.gray};">No</span>`;

    return `
                  <tr style="background-color: ${bg};">
                    <td style="padding: 8px 12px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px;">${r.label}</td>
                    <td style="padding: 8px 12px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px;">${r.sentAt}</td>
                    <td style="padding: 8px 12px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px;">${deliveredCell}</td>
                    <td style="padding: 8px 12px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px;">${openedCell}</td>
                  </tr>`;
  }).join('');

  return `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 10px 40px 20px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <h3 style="margin: 0 0 12px; color: ${COLORS.textDark}; font-size: 14px; font-family: Arial, sans-serif;">Notification History</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background-color: ${COLORS.grayLight};">
                    <th style="padding: 8px 12px; text-align: left; border: 1px solid ${COLORS.grayBorder}; font-size: 11px; text-transform: uppercase; color: ${COLORS.textMuted}; font-family: Arial, sans-serif;">Notification</th>
                    <th style="padding: 8px 12px; text-align: left; border: 1px solid ${COLORS.grayBorder}; font-size: 11px; text-transform: uppercase; color: ${COLORS.textMuted}; font-family: Arial, sans-serif;">Date Sent</th>
                    <th style="padding: 8px 12px; text-align: left; border: 1px solid ${COLORS.grayBorder}; font-size: 11px; text-transform: uppercase; color: ${COLORS.textMuted}; font-family: Arial, sans-serif;">Delivered</th>
                    <th style="padding: 8px 12px; text-align: left; border: 1px solid ${COLORS.grayBorder}; font-size: 11px; text-transform: uppercase; color: ${COLORS.textMuted}; font-family: Arial, sans-serif;">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </td>
          </tr>`;
}

/**
 * Convenience: build a complete weekly report email
 */
export function weeklyReportEmail(options: {
  customerName: string;
  claimNumber?: string;
  reportNumber: string;
  periodStart: string;
  periodEnd: string;
  generatedDate: string;
  entries: EntryRow[];
  totalHours: number;
  entryCount: number;
  daysActive: number;
  reviewUrl?: string;
}): string {
  const header = emailHeader({
    color: COLORS.blue,
    title: 'Weekly Time &amp; Activity Report',
    reportNumber: options.reportNumber,
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    customerName: options.customerName,
    claimNumber: options.claimNumber,
    generatedDate: options.generatedDate,
  });

  const stats = summaryStats(options.totalHours, options.entryCount, options.daysActive);
  const table = activityTable(options.entries, options.totalHours);
  const notice = reviewNotice();
  const button = options.reviewUrl
    ? emailButton(options.reviewUrl, 'Review &amp; Accept Time Entries')
    : '';
  const footer = emailFooter();

  return emailWrapper(`${header}${stats}${table}${notice}${button}${footer}`);
}

/**
 * Convenience: build a complete supplemental report email
 */
export function supplementalReportEmail(options: {
  customerName: string;
  claimNumber?: string;
  reportNumber: string;
  periodStart: string;
  periodEnd: string;
  generatedDate: string;
  originalSentDate: string;
  originalReportNumber?: string;
  originalHours: number;
  originalCount: number;
  entries: EntryRow[];
  totalHours: number;
  entryCount: number;
  daysActive: number;
  changes: string[];
  reviewUrl?: string;
}): string {
  const header = emailHeader({
    color: COLORS.orange,
    title: 'Supplemental Time &amp; Activity Report',
    reportNumber: options.reportNumber,
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    customerName: options.customerName,
    claimNumber: options.claimNumber,
    generatedDate: options.generatedDate,
  });

  const banner = supplementalBanner(options.originalSentDate, options.originalReportNumber);
  const summary = changeSummary(options.originalHours, options.totalHours, options.originalCount, options.entryCount, options.changes);
  const table = activityTable(options.entries, options.totalHours, { showBadges: true, showChangeNotes: true });
  const notice = reviewNotice();
  const button = options.reviewUrl
    ? emailButton(options.reviewUrl, 'Review &amp; Accept Time Entries')
    : '';
  const footer = emailFooter();

  return emailWrapper(`${header}${banner}${summary}${table}${notice}${button}${footer}`);
}

/**
 * Convenience: build the "Accepted as Accurate" confirmation email
 */
export function acceptedEmail(options: {
  customerName: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  notifications: NotificationRecord[];
}): string {
  const header = emailHeader({
    color: COLORS.green,
    title: 'Time Entries Confirmed as Accurate',
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    customerName: options.customerName,
  });

  const body = contentSection(`
    <p style="margin: 0 0 16px;">Dear ${options.customerName},</p>
    <p style="margin: 0 0 16px;">This notice confirms that the time entries reported for the week of <strong>${options.periodStart} &ndash; ${options.periodEnd}</strong> have been <strong>accepted as accurate</strong>. No response was received from you regarding any notes, clarifications, or exceptions you may have had.</p>
    <p style="margin: 0;">Per our prior correspondence, a three (3) business day review period was provided. The following notifications were sent:</p>
  `);

  const proof = notificationProofTable(options.notifications);

  const total = contentSection(`
    <p style="margin: 0 0 8px; font-size: 16px; font-weight: bold; color: ${COLORS.greenDark};">Total Hours Confirmed: ${options.totalHours.toFixed(2)} hours</p>
    <p style="margin: 0; font-size: 13px;">These hours will be included on your next billing statement. If you believe there is an error, please contact us immediately at <a href="mailto:accounting@mitigationconsulting.com" style="color: ${COLORS.blue};">accounting@mitigationconsulting.com</a>.</p>
  `);

  const footer = emailFooter();

  return emailWrapper(`${header}${body}${proof}${total}${footer}`);
}

// ─── Internal Clarification Email Templates ─────────────────────────

export interface ClarificationEntry {
  date: string;
  employee: string;
  customer: string;
  costCode?: string;
  description?: string;
  hours: string;
}

/**
 * Clarification request email — sent to assignee (field tech)
 * Amber header, entry detail table, question box, VML button
 */
export function clarificationRequestEmail(options: {
  assigneeName: string;
  adminName: string;
  question: string;
  entries: ClarificationEntry[];
  clarifyUrl: string;
}): string {
  const header = emailHeader({
    color: '#d97706',
    title: 'Clarification Requested',
    subtitle: 'MIT Consulting &mdash; Internal Time Entry Review',
  });

  const greeting = contentSection(`
    <p style="margin: 0 0 16px;">Hi ${escapeHtmlTemplate(options.assigneeName)},</p>
    <p style="margin: 0;">${escapeHtmlTemplate(options.adminName)} needs additional detail on the following time ${options.entries.length === 1 ? 'entry' : 'entries'}. Please review and respond at your earliest convenience.</p>
  `);

  // Question box
  const questionBox = `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 10px 40px 20px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #fffbeb; border: 2px solid #f59e0b; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px; font-family: Arial, sans-serif;">
                    <h3 style="margin: 0 0 10px; color: #92400e; font-size: 14px;">&#128172; Question from ${escapeHtmlTemplate(options.adminName)}</h3>
                    <p style="margin: 0; font-size: 14px; color: #78350f; line-height: 1.6; white-space: pre-wrap;">${escapeHtmlTemplate(options.question)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;

  // Entry table
  const entryRows = options.entries.map((e, i) => {
    const bg = i % 2 === 1 ? COLORS.grayLight : COLORS.white;
    return `
              <tr style="background-color: ${bg};">
                <td style="padding: 10px 8px; border: 2px solid #d1d5db; white-space: nowrap; font-family: Arial, sans-serif; vertical-align: top;">${e.date}</td>
                <td style="padding: 10px 8px; border: 2px solid #d1d5db; font-family: Arial, sans-serif; vertical-align: top;">${escapeHtmlTemplate(e.employee)}</td>
                <td style="padding: 10px 8px; border: 2px solid #d1d5db; font-family: Arial, sans-serif; vertical-align: top;">${escapeHtmlTemplate(e.customer)}</td>
                <td style="padding: 10px 8px; border: 2px solid #d1d5db; font-family: Arial, sans-serif; vertical-align: top;">${escapeHtmlTemplate(e.costCode || 'General')}</td>
                <td style="padding: 10px 8px; border: 2px solid #d1d5db; font-family: Arial, sans-serif; width: 40%;">${escapeHtmlTemplate(e.description || '-')}</td>
                <td style="padding: 10px 8px; border: 2px solid #d1d5db; text-align: right; font-weight: bold; font-family: Arial, sans-serif; vertical-align: top;">${e.hours}</td>
              </tr>`;
  }).join('');

  const entryTable = `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 10px 40px 20px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <h3 style="margin: 0 0 12px; color: ${COLORS.textDark}; font-size: 15px; font-family: Arial, sans-serif;">Time ${options.entries.length === 1 ? 'Entry' : 'Entries'} Requiring Clarification</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background-color: ${COLORS.grayLight};">
                    <th style="padding: 10px 8px; text-align: left; border: 2px solid #d1d5db; color: ${COLORS.textMuted}; font-size: 11px; text-transform: uppercase; font-family: Arial, sans-serif;">Date</th>
                    <th style="padding: 10px 8px; text-align: left; border: 2px solid #d1d5db; color: ${COLORS.textMuted}; font-size: 11px; text-transform: uppercase; font-family: Arial, sans-serif;">Employee</th>
                    <th style="padding: 10px 8px; text-align: left; border: 2px solid #d1d5db; color: ${COLORS.textMuted}; font-size: 11px; text-transform: uppercase; font-family: Arial, sans-serif;">Customer</th>
                    <th style="padding: 10px 8px; text-align: left; border: 2px solid #d1d5db; color: ${COLORS.textMuted}; font-size: 11px; text-transform: uppercase; font-family: Arial, sans-serif;">Service</th>
                    <th style="padding: 10px 8px; text-align: left; border: 2px solid #d1d5db; color: ${COLORS.textMuted}; font-size: 11px; text-transform: uppercase; font-family: Arial, sans-serif; width: 40%;">Current Description</th>
                    <th style="padding: 10px 8px; text-align: right; border: 2px solid #d1d5db; color: ${COLORS.textMuted}; font-size: 11px; text-transform: uppercase; font-family: Arial, sans-serif;">Hours</th>
                  </tr>
                </thead>
                <tbody>${entryRows}</tbody>
              </table>
            </td>
          </tr>`;

  const button = emailButton(options.clarifyUrl, 'View &amp; Respond', '#d97706');
  const footer = emailFooter({ internal: true });

  return emailWrapper(`${header}${greeting}${questionBox}${entryTable}${button}${footer}`);
}

/**
 * Clarification response email — sent to Sharon when assignee responds
 * Green header, response text, suggested description if any
 */
export function clarificationResponseEmail(options: {
  adminName: string;
  assigneeName: string;
  message: string;
  suggestedDescription?: string;
  entryDate: string;
  entryEmployee: string;
  entryCustomer: string;
  entryHours: string;
  dashboardUrl: string;
}): string {
  const header = emailHeader({
    color: COLORS.green,
    title: 'Clarification Response Received',
    subtitle: `Response from ${escapeHtmlTemplate(options.assigneeName)}`,
  });

  const body = contentSection(`
    <p style="margin: 0 0 16px;">Hi ${escapeHtmlTemplate(options.adminName)},</p>
    <p style="margin: 0 0 16px;"><strong>${escapeHtmlTemplate(options.assigneeName)}</strong> has responded to your clarification request for the time entry:</p>
    <p style="margin: 0 0 4px; font-size: 13px; color: ${COLORS.gray};">${escapeHtmlTemplate(options.entryDate)} &middot; ${escapeHtmlTemplate(options.entryEmployee)} &middot; ${escapeHtmlTemplate(options.entryCustomer)} &middot; ${options.entryHours} hrs</p>
  `);

  // Response box
  const responseBox = `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 10px 40px 20px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.greenBg}; border: 2px solid ${COLORS.green}; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px; font-family: Arial, sans-serif;">
                    <h3 style="margin: 0 0 10px; color: ${COLORS.greenDark}; font-size: 14px;">&#128172; Response</h3>
                    <p style="margin: 0; font-size: 14px; color: #333; line-height: 1.6; white-space: pre-wrap;">${escapeHtmlTemplate(options.message)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;

  // Suggested description (if provided)
  let suggestedSection = '';
  if (options.suggestedDescription) {
    suggestedSection = `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 0 40px 20px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px 20px; font-family: Arial, sans-serif;">
                    <h4 style="margin: 0 0 8px; color: ${COLORS.blueDark}; font-size: 13px;">Suggested Description</h4>
                    <p style="margin: 0; font-size: 14px; color: #333; line-height: 1.5;">${escapeHtmlTemplate(options.suggestedDescription)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
  }

  const button = emailButton(options.dashboardUrl, 'View in Dashboard', COLORS.green);
  const footer = emailFooter({ internal: true });

  return emailWrapper(`${header}${body}${responseBox}${suggestedSection}${button}${footer}`);
}

/**
 * Clarification follow-up email — sent to assignee when Sharon replies
 * Blue header, follow-up message, VML button
 */
export function clarificationFollowUpEmail(options: {
  assigneeName: string;
  adminName: string;
  message: string;
  entryDate: string;
  entryEmployee: string;
  entryCustomer: string;
  entryHours: string;
  clarifyUrl: string;
}): string {
  const header = emailHeader({
    color: COLORS.blue,
    title: 'Follow-Up on Clarification Request',
    subtitle: `From ${escapeHtmlTemplate(options.adminName)}`,
  });

  const body = contentSection(`
    <p style="margin: 0 0 16px;">Hi ${escapeHtmlTemplate(options.assigneeName)},</p>
    <p style="margin: 0 0 16px;">${escapeHtmlTemplate(options.adminName)} has a follow-up regarding the time entry:</p>
    <p style="margin: 0 0 4px; font-size: 13px; color: ${COLORS.gray};">${escapeHtmlTemplate(options.entryDate)} &middot; ${escapeHtmlTemplate(options.entryEmployee)} &middot; ${escapeHtmlTemplate(options.entryCustomer)} &middot; ${options.entryHours} hrs</p>
  `);

  const followUpBox = `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 10px 40px 20px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #eff6ff; border: 2px solid ${COLORS.blue}; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px; font-family: Arial, sans-serif;">
                    <h3 style="margin: 0 0 10px; color: ${COLORS.blueDark}; font-size: 14px;">&#128172; Follow-Up from ${escapeHtmlTemplate(options.adminName)}</h3>
                    <p style="margin: 0; font-size: 14px; color: #333; line-height: 1.6; white-space: pre-wrap;">${escapeHtmlTemplate(options.message)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;

  const button = emailButton(options.clarifyUrl, 'View &amp; Respond', COLORS.blue);
  const footer = emailFooter({ internal: true });

  return emailWrapper(`${header}${body}${followUpBox}${button}${footer}`);
}

// ─── Profitability Report Email Template ─────────────────────────

export interface ProfitabilityEmployeeRow {
  totalHours: number;
  billableHours: number;
  overheadHours: number;
  laborCost: number;
  revenue: number;
}

export interface ProfitabilityUnbilledEntry {
  date: string;
  employee: string;
  customer: string;
  hours: number;
  serviceItemName: string;
}

/**
 * Convenience: build a complete weekly profitability report email
 * Purple gradient header, executive summary, overhead breakdown, employee table, unbilled alert
 */
export function profitabilityReportEmail(options: {
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  billableHours: number;
  overheadHours: number;
  utilizationPercent: number;
  billableRevenue: number;
  laborCost: number;
  grossMargin: number;
  marginPercent: number;
  categoryBreakdown: Record<string, { hours: number; cost: number }>;
  employeeBreakdown: Record<string, ProfitabilityEmployeeRow>;
  unbilledEntryCount: number;
  unbilledHours: number;
  unbilledEntries: ProfitabilityUnbilledEntry[];
  unbilledTimeUrl: string;
}): string {
  const purple = '#7c3aed';
  const purpleDark = '#5b21b6';

  const header = emailHeader({
    color: purple,
    title: 'Weekly Profitability Report',
    subtitle: 'MIT Consulting &mdash; Internal Financial Summary',
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
  });

  // Executive Summary — 4 metric cards
  const fmtMoney = (v: number) => v < 0 ? `-$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const marginColor = options.grossMargin >= 0 ? COLORS.greenDark : COLORS.red;

  const executiveSummary = `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 20px 40px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <h3 style="margin: 0 0 16px; color: ${COLORS.textDark}; font-size: 15px; font-family: Arial, sans-serif;">Executive Summary</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${COLORS.grayBorder}; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px 20px; text-align: center; border-right: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; width: 25%;">
                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: ${purpleDark};">${options.totalHours.toFixed(1)}</p>
                    <p style="margin: 2px 0 0; font-size: 11px; color: ${COLORS.gray}; text-transform: uppercase;">Total Hours</p>
                  </td>
                  <td style="padding: 16px 20px; text-align: center; border-right: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; width: 25%;">
                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: ${COLORS.blue};">${options.utilizationPercent.toFixed(0)}%</p>
                    <p style="margin: 2px 0 0; font-size: 11px; color: ${COLORS.gray}; text-transform: uppercase;">Utilization</p>
                  </td>
                  <td style="padding: 16px 20px; text-align: center; border-right: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; width: 25%;">
                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: ${marginColor};">${fmtMoney(options.grossMargin)}</p>
                    <p style="margin: 2px 0 0; font-size: 11px; color: ${COLORS.gray}; text-transform: uppercase;">Gross Margin</p>
                  </td>
                  <td style="padding: 16px 20px; text-align: center; font-family: Arial, sans-serif; width: 25%;">
                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: ${marginColor};">${options.marginPercent.toFixed(0)}%</p>
                    <p style="margin: 2px 0 0; font-size: 11px; color: ${COLORS.gray}; text-transform: uppercase;">Margin %</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;

  // Overhead Breakdown
  const categories = ['admin', 'marketing', 'training', 'events'];
  const categoryLabels: Record<string, string> = { admin: 'Admin', marketing: 'Marketing', training: 'Training', events: 'Events' };
  const categoryColors: Record<string, string> = { admin: '#6b7280', marketing: '#2563eb', training: '#d97706', events: '#059669' };

  let totalOverheadHours = 0;
  let totalOverheadCost = 0;
  const catRows = categories.map((cat, i) => {
    const data = options.categoryBreakdown[cat] || { hours: 0, cost: 0 };
    totalOverheadHours += data.hours;
    totalOverheadCost += data.cost;
    const bg = i % 2 === 1 ? COLORS.grayLight : COLORS.white;
    const barWidth = options.totalHours > 0 ? Math.max(2, (data.hours / options.totalHours) * 100) : 0;
    return `
                  <tr style="background-color: ${bg};">
                    <td style="padding: 10px 12px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px;">
                      <span style="display: inline-block; width: 10px; height: 10px; background-color: ${categoryColors[cat]}; border-radius: 2px; margin-right: 6px; vertical-align: middle;"></span>
                      ${categoryLabels[cat]}
                    </td>
                    <td style="padding: 10px 12px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px; text-align: right;">${data.hours.toFixed(1)} hrs</td>
                    <td style="padding: 10px 12px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px; text-align: right;">${fmtMoney(data.cost)}</td>
                    <td style="padding: 10px 12px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px;">
                      <div style="background-color: #e5e7eb; border-radius: 4px; height: 8px; width: 100%;">
                        <div style="background-color: ${categoryColors[cat]}; border-radius: 4px; height: 8px; width: ${barWidth}%;"></div>
                      </div>
                    </td>
                  </tr>`;
  }).join('');

  const overheadPct = options.totalHours > 0 ? ((totalOverheadHours / options.totalHours) * 100).toFixed(0) : '0';

  const overheadSection = `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 10px 40px 20px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <h3 style="margin: 0 0 12px; color: ${COLORS.textDark}; font-size: 15px; font-family: Arial, sans-serif;">Overhead Breakdown</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background-color: ${COLORS.grayLight};">
                    <th style="padding: 10px 12px; text-align: left; border: 1px solid ${COLORS.grayBorder}; font-size: 11px; text-transform: uppercase; color: ${COLORS.textMuted}; font-family: Arial, sans-serif;">Category</th>
                    <th style="padding: 10px 12px; text-align: right; border: 1px solid ${COLORS.grayBorder}; font-size: 11px; text-transform: uppercase; color: ${COLORS.textMuted}; font-family: Arial, sans-serif;">Hours</th>
                    <th style="padding: 10px 12px; text-align: right; border: 1px solid ${COLORS.grayBorder}; font-size: 11px; text-transform: uppercase; color: ${COLORS.textMuted}; font-family: Arial, sans-serif;">Cost</th>
                    <th style="padding: 10px 12px; text-align: left; border: 1px solid ${COLORS.grayBorder}; font-size: 11px; text-transform: uppercase; color: ${COLORS.textMuted}; font-family: Arial, sans-serif;">% of Total</th>
                  </tr>
                </thead>
                <tbody>${catRows}</tbody>
                <tfoot>
                  <tr style="background-color: #f5f3ff;">
                    <td style="padding: 10px 12px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px; font-weight: bold; color: ${purpleDark};">Total Overhead</td>
                    <td style="padding: 10px 12px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px; text-align: right; font-weight: bold; color: ${purpleDark};">${totalOverheadHours.toFixed(1)} hrs</td>
                    <td style="padding: 10px 12px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px; text-align: right; font-weight: bold; color: ${purpleDark};">${fmtMoney(totalOverheadCost)}</td>
                    <td style="padding: 10px 12px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px; font-weight: bold; color: ${purpleDark};">${overheadPct}% of total time</td>
                  </tr>
                </tfoot>
              </table>
            </td>
          </tr>`;

  // Billable Summary
  const billableSummary = `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 10px 40px 20px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <h3 style="margin: 0 0 12px; color: ${COLORS.textDark}; font-size: 15px; font-family: Arial, sans-serif;">Billable Summary</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.greenBg}; border: 1px solid #bbf7d0; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px 20px; text-align: center; border-right: 1px solid #bbf7d0; font-family: Arial, sans-serif;">
                    <p style="margin: 0; font-size: 20px; font-weight: bold; color: ${COLORS.greenDark};">${options.billableHours.toFixed(1)} hrs</p>
                    <p style="margin: 2px 0 0; font-size: 11px; color: ${COLORS.greenDark}; text-transform: uppercase;">Billable Hours</p>
                  </td>
                  <td style="padding: 16px 20px; text-align: center; border-right: 1px solid #bbf7d0; font-family: Arial, sans-serif;">
                    <p style="margin: 0; font-size: 20px; font-weight: bold; color: ${COLORS.greenDark};">${fmtMoney(options.billableRevenue)}</p>
                    <p style="margin: 2px 0 0; font-size: 11px; color: ${COLORS.greenDark}; text-transform: uppercase;">Revenue</p>
                  </td>
                  <td style="padding: 16px 20px; text-align: center; border-right: 1px solid #bbf7d0; font-family: Arial, sans-serif;">
                    <p style="margin: 0; font-size: 20px; font-weight: bold; color: ${COLORS.greenDark};">${fmtMoney(options.laborCost)}</p>
                    <p style="margin: 2px 0 0; font-size: 11px; color: ${COLORS.greenDark}; text-transform: uppercase;">Labor Cost</p>
                  </td>
                  <td style="padding: 16px 20px; text-align: center; font-family: Arial, sans-serif;">
                    <p style="margin: 0; font-size: 20px; font-weight: bold; color: ${marginColor};">${fmtMoney(options.grossMargin)}</p>
                    <p style="margin: 2px 0 0; font-size: 11px; color: ${COLORS.greenDark}; text-transform: uppercase;">Gross Margin</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;

  // Per-Employee Table
  const employeeNames = Object.keys(options.employeeBreakdown).sort();
  const empRows = employeeNames.map((name, i) => {
    const emp = options.employeeBreakdown[name];
    const utilization = emp.totalHours > 0 ? ((emp.billableHours / emp.totalHours) * 100).toFixed(0) : '0';
    const bg = i % 2 === 1 ? COLORS.grayLight : COLORS.white;
    return `
                  <tr style="background-color: ${bg};">
                    <td style="padding: 10px 8px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px; font-weight: bold;">${escapeHtmlTemplate(name)}</td>
                    <td style="padding: 10px 8px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px; text-align: right;">${emp.totalHours.toFixed(1)}</td>
                    <td style="padding: 10px 8px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px; text-align: right;">${emp.billableHours.toFixed(1)}</td>
                    <td style="padding: 10px 8px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px; text-align: right;">${emp.overheadHours.toFixed(1)}</td>
                    <td style="padding: 10px 8px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px; text-align: center;">${utilization}%</td>
                    <td style="padding: 10px 8px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px; text-align: right;">${fmtMoney(emp.laborCost)}</td>
                    <td style="padding: 10px 8px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 13px; text-align: right;">${fmtMoney(emp.revenue)}</td>
                  </tr>`;
  }).join('');

  const employeeTable = `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 10px 40px 20px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <h3 style="margin: 0 0 12px; color: ${COLORS.textDark}; font-size: 15px; font-family: Arial, sans-serif;">Per-Employee Breakdown</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background-color: ${COLORS.grayLight};">
                    <th style="padding: 10px 8px; text-align: left; border: 1px solid ${COLORS.grayBorder}; font-size: 11px; text-transform: uppercase; color: ${COLORS.textMuted}; font-family: Arial, sans-serif;">Employee</th>
                    <th style="padding: 10px 8px; text-align: right; border: 1px solid ${COLORS.grayBorder}; font-size: 11px; text-transform: uppercase; color: ${COLORS.textMuted}; font-family: Arial, sans-serif;">Total Hrs</th>
                    <th style="padding: 10px 8px; text-align: right; border: 1px solid ${COLORS.grayBorder}; font-size: 11px; text-transform: uppercase; color: ${COLORS.textMuted}; font-family: Arial, sans-serif;">Billable</th>
                    <th style="padding: 10px 8px; text-align: right; border: 1px solid ${COLORS.grayBorder}; font-size: 11px; text-transform: uppercase; color: ${COLORS.textMuted}; font-family: Arial, sans-serif;">Overhead</th>
                    <th style="padding: 10px 8px; text-align: center; border: 1px solid ${COLORS.grayBorder}; font-size: 11px; text-transform: uppercase; color: ${COLORS.textMuted}; font-family: Arial, sans-serif;">Util %</th>
                    <th style="padding: 10px 8px; text-align: right; border: 1px solid ${COLORS.grayBorder}; font-size: 11px; text-transform: uppercase; color: ${COLORS.textMuted}; font-family: Arial, sans-serif;">Labor Cost</th>
                    <th style="padding: 10px 8px; text-align: right; border: 1px solid ${COLORS.grayBorder}; font-size: 11px; text-transform: uppercase; color: ${COLORS.textMuted}; font-family: Arial, sans-serif;">Revenue</th>
                  </tr>
                </thead>
                <tbody>${empRows}</tbody>
              </table>
            </td>
          </tr>`;

  // Unbilled Time Alert
  let unbilledAlert = '';
  if (options.unbilledEntryCount > 0) {
    const topEntries = options.unbilledEntries.map((e, i) => {
      const bg = i % 2 === 1 ? COLORS.grayLight : COLORS.white;
      return `
                    <tr style="background-color: ${bg};">
                      <td style="padding: 6px 10px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 12px;">${escapeHtmlTemplate(e.date)}</td>
                      <td style="padding: 6px 10px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 12px;">${escapeHtmlTemplate(e.employee)}</td>
                      <td style="padding: 6px 10px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 12px;">${escapeHtmlTemplate(e.customer)}</td>
                      <td style="padding: 6px 10px; border: 1px solid ${COLORS.grayBorder}; font-family: Arial, sans-serif; font-size: 12px; text-align: right;">${e.hours.toFixed(2)}</td>
                    </tr>`;
    }).join('');

    unbilledAlert = `
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 10px 40px 20px; border-left: 1px solid ${COLORS.grayBorder}; border-right: 1px solid ${COLORS.grayBorder};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.redLight}; border: 2px solid ${COLORS.red}; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px; font-family: Arial, sans-serif;">
                    <h3 style="margin: 0 0 10px; color: ${COLORS.red}; font-size: 14px;">&#9888; Unbilled Time Alert</h3>
                    <p style="margin: 0 0 12px; font-size: 13px; color: #991b1b; line-height: 1.6;">
                      <strong>${options.unbilledEntryCount} entries (${options.unbilledHours.toFixed(1)} hours)</strong> are missing item codes and billing at $0.
                    </p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 12px; margin-bottom: 12px;">
                      <thead>
                        <tr style="background-color: #fecaca;">
                          <th style="padding: 6px 10px; text-align: left; border: 1px solid ${COLORS.grayBorder}; font-size: 10px; text-transform: uppercase; color: #991b1b; font-family: Arial, sans-serif;">Date</th>
                          <th style="padding: 6px 10px; text-align: left; border: 1px solid ${COLORS.grayBorder}; font-size: 10px; text-transform: uppercase; color: #991b1b; font-family: Arial, sans-serif;">Employee</th>
                          <th style="padding: 6px 10px; text-align: left; border: 1px solid ${COLORS.grayBorder}; font-size: 10px; text-transform: uppercase; color: #991b1b; font-family: Arial, sans-serif;">Customer</th>
                          <th style="padding: 6px 10px; text-align: right; border: 1px solid ${COLORS.grayBorder}; font-size: 10px; text-transform: uppercase; color: #991b1b; font-family: Arial, sans-serif;">Hours</th>
                        </tr>
                      </thead>
                      <tbody>${topEntries}</tbody>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` + emailButton(options.unbilledTimeUrl, 'View All Unbilled Time', COLORS.red);
  }

  const footer = emailFooter({ internal: true });

  return emailWrapper(`${header}${executiveSummary}${overheadSection}${billableSummary}${employeeTable}${unbilledAlert}${footer}`);
}

/** HTML-escape for use in email templates */
function escapeHtmlTemplate(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
