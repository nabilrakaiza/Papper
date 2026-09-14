import { MenuCategory } from "../types/order";

/** Made in the kitchen. Printed first on every ticket and receipt. */
export const KITCHEN_CATEGORIES: MenuCategory[] = ["Nasi", "Ayam", "Sapi", "Udang",
    "Ikan", "Steak", "Burger", "Pasta", "Additions", "Snacks"];

/** Made at the bar. Printed after the kitchen's items. */
export const BAR_CATEGORIES: MenuCategory[] = ["Coffee", "Drinks", "Milkshake", "Juice",
    "Dessert", "Pastry"];

/**
 * Every category, in the order the menu screens page through them and the
 * printouts list items. Built from the two stations so the screens and the
 * paper cannot drift apart.
 */
export const CATEGORIES: MenuCategory[] = [...KITCHEN_CATEGORIES, ...BAR_CATEGORIES];
