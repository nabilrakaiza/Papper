// Helpers shared by every place that has to treat menu-backed and custom
// (off-menu) line items alike.
import { OrderItem } from "../types/order";
import { BAR_CATEGORIES, CATEGORIES } from "../data/menu";

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

/** Where a line belongs on paper: which station makes it, or off the menu. */
export type ItemSection = "kitchen" | "bar" | "custom";

export function itemSection(item: Pick<OrderItem, "menuId" | "category">): ItemSection {
  if (isCustomItem(item)) return "custom";
  // A menu item whose category is somehow unknown goes to the kitchen rather
  // than being dropped or shown as custom: it is still a real dish.
  return item.category && BAR_CATEGORIES.includes(item.category) ? "bar" : "kitchen";
}

const SECTION_ORDER: Record<ItemSection, number> = { kitchen: 0, bar: 1, custom: 2 };

/**
 * Items in the order they are printed: kitchen first, then bar, then custom
 * items, and within each station grouped by category in menu order.
 *
 * Stable, so lines in the same category keep the order they were entered in.
 * Returns a new array; the order's own items are left alone.
 */
export function sortByCategory<T extends Pick<OrderItem, "menuId" | "category">>(items: T[]): T[] {
  const rank = (item: T) => {
    const section = itemSection(item);
    const categoryIndex = item.category ? CATEGORIES.indexOf(item.category) : -1;
    // Unknown categories sort to the end of their section.
    return [SECTION_ORDER[section], categoryIndex === -1 ? CATEGORIES.length : categoryIndex];
  };

  return items
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.index - b.index)
    .map(({ item }) => item);
}
