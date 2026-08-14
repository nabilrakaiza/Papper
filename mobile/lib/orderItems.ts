// Helpers shared by every place that has to treat menu-backed and custom
// (off-menu) line items alike.
import { OrderItem } from "../types/order";

export function isCustomItem(item: Pick<OrderItem, "menuId">): boolean {
  return item.menuId == null;
}

/**
 * A stable identity for a line item, for grouping and for React keys.
 *
 * Menu items collapse by menu id, so the same dish added in two print batches
 * shows as one row. Custom items have no id, so they collapse by name+price
 * instead — two "Nasi Goreng Spesial" at 35.000 merge, but a 35.000 one and a
 * 40.000 one stay apart. Keying them all on a null menu id would fold every
 * unrelated custom item in the order into a single row.
 */
export function itemKey(item: Pick<OrderItem, "menuId" | "name" | "price">): string {
  return isCustomItem(item)
    ? `custom:${item.name}:${item.price}`
    : `menu:${item.menuId}`;
}

/** Sums quantities of items that share an itemKey, preserving first-seen order. */
export function groupItems<T extends Pick<OrderItem, "menuId" | "name" | "price" | "quantity">>(
  items: T[]
): (T & { key: string })[] {
  const grouped = new Map<string, T & { key: string }>();

  for (const item of items) {
    const key = itemKey(item);
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      grouped.set(key, { ...item, key });
    }
  }

  return [...grouped.values()];
}
