/**
 * Shared invoice line item calculation logic.
 * Used by preview-invoices and create-invoices.
 */

export interface RateLookups {
  ratesByItemId: Record<string, number>;
  namesByItemId: Record<string, string>;
  itemIdByName: Record<string, string>;
}

export interface LineItemResult {
  DetailType: string;
  Amount: number;
  SalesItemLineDetail: {
    ItemRef: { value: string } | undefined;
    Qty: number;
    UnitPrice: number;
  };
  Description: string;
  _display?: {
    date: string;
    employee: string;
    service: string;
    hours: number;
    rate: number;
    amount: number;
    missingRate: boolean;
    timeDetail: string;
    entryId: number;
  };
}

/** Build rate/name lookup tables from service_items rows. */
export function buildRateLookups(serviceItems: any[]): RateLookups {
  const ratesByItemId: Record<string, number> = {};
  const namesByItemId: Record<string, string> = {};
  const itemIdByName: Record<string, string> = {};

  for (const item of serviceItems || []) {
    ratesByItemId[item.qb_item_id] = item.unit_price;
    namesByItemId[item.qb_item_id] = item.name;
    itemIdByName[item.name] = item.qb_item_id;
    itemIdByName[item.name.toLowerCase()] = item.qb_item_id;
  }

  return { ratesByItemId, namesByItemId, itemIdByName };
}

/**
 * Resolve a qb_item_id from an entry, handling hierarchical service item names.
 * Tries: direct ID → exact name → leaf after colon → parent before colon.
 */
export function resolveItemId(
  entry: { qb_item_id?: string | null; service_item_name?: string | null },
  itemIdByName: Record<string, string>
): string | null {
  if (entry.qb_item_id) return entry.qb_item_id;
  if (!entry.service_item_name) return null;

  const sName = entry.service_item_name;
  let resolved = itemIdByName[sName] || itemIdByName[sName.toLowerCase()];

  if (!resolved && sName.includes(':')) {
    const leafName = sName.split(':').pop()!.trim();
    resolved = itemIdByName[leafName] || itemIdByName[leafName.toLowerCase()];
    if (!resolved) {
      const parentName = sName.split(':')[0].trim();
      resolved = itemIdByName[parentName] || itemIdByName[parentName.toLowerCase()];
    }
  }

  return resolved || null;
}

/** Format time detail string from start/end times. */
function formatTimeDetail(entry: { start_time?: string | null; end_time?: string | null }): string {
  if (entry.start_time && entry.end_time) {
    const start = new Date(entry.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const end = new Date(entry.end_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${start} - ${end}`;
  }
  return 'Lump Sum';
}

/** Build invoice description from an entry. */
function buildDescription(entry: any, timeDetail: string): string {
  let description = `${entry.txn_date} | ${entry.employee_name} | ${timeDetail}`;
  if (entry.description) description += `\n${entry.description}`;
  if (entry.notes) description += `\nNotes: ${entry.notes}`;
  return description;
}

interface BuildLineItemsOptions {
  /** Include _display metadata for frontend preview (default false) */
  includeDisplay?: boolean;
}

interface BuildLineItemsResult {
  lineItems: LineItemResult[];
  totalHours: number;
  totalAmount: number;
  missingRateCount: number;
}

/**
 * Calculate invoice line items and totals for a set of time entries.
 */
export function buildLineItems(
  entries: any[],
  lookups: RateLookups,
  options: BuildLineItemsOptions = {}
): BuildLineItemsResult {
  const { includeDisplay = false } = options;
  let totalHours = 0;
  let totalAmount = 0;
  let missingRateCount = 0;

  const lineItems: LineItemResult[] = entries.map((entry: any) => {
    const hours = entry.hours + (entry.minutes / 60);
    const resolvedItemId = resolveItemId(entry, lookups.itemIdByName);
    const hasItem = resolvedItemId != null && lookups.ratesByItemId[resolvedItemId] !== undefined;
    const rate = hasItem ? lookups.ratesByItemId[resolvedItemId!] : 0;
    const amount = hours * rate;

    if (!hasItem) missingRateCount++;
    totalHours += hours;
    totalAmount += amount;

    const timeDetail = formatTimeDetail(entry);
    const description = buildDescription(entry, timeDetail);

    const item: LineItemResult = {
      DetailType: 'SalesItemLineDetail',
      Amount: parseFloat(amount.toFixed(2)),
      SalesItemLineDetail: {
        ItemRef: resolvedItemId ? { value: resolvedItemId } : undefined,
        Qty: parseFloat(hours.toFixed(2)),
        UnitPrice: rate,
      },
      Description: description,
    };

    if (includeDisplay) {
      item._display = {
        date: entry.txn_date,
        employee: entry.employee_name,
        service: hasItem ? lookups.namesByItemId[resolvedItemId!] : (entry.service_item_name || 'NOT ASSIGNED'),
        hours: parseFloat(hours.toFixed(2)),
        rate,
        amount: parseFloat(amount.toFixed(2)),
        missingRate: !hasItem,
        timeDetail,
        entryId: entry.id,
      };
    }

    return item;
  });

  return { lineItems, totalHours, totalAmount, missingRateCount };
}
