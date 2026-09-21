import { MenuCategory } from "../types/order";

/** Made in the kitchen. Printed first on every ticket and receipt. */
export const KITCHEN_CATEGORIES: MenuCategory[] = ["Nasi", "Ayam", "Sapi", "Udang",
    "Ikan", "Steak", "Burger", "Pasta", "Paketan", "Additions", "Snacks"];

/** Made at the bar. Printed after the kitchen's items. */
export const BAR_CATEGORIES: MenuCategory[] = ["Coffee", "Drinks", "Milkshake", "Juice",
    "Dessert", "Pastry"];

/**
 * Belongs to no station. "Lain Lain" is the catch-all for a menu item that
 * fits nowhere else, so it prints under CUSTOM MENU with the off-menu lines
 * rather than being guessed into the kitchen — see `itemSection`.
 */
export const OTHER_CATEGORIES: MenuCategory[] = ["Lain Lain"];

/**
 * Every category, in the order the menu screens page through them and the
 * printouts list items. Built from the stations so the screens and the
 * paper cannot drift apart.
 */
export const CATEGORIES: MenuCategory[] = [
    ...KITCHEN_CATEGORIES,
    ...BAR_CATEGORIES,
    ...OTHER_CATEGORIES,
];
