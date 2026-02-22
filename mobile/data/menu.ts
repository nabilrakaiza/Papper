import { MenuItem, MenuCategory } from "../types/order";

export const DUMMY_MENU: MenuItem[] = [
  // Ayam
  { id: 1, name: "Ayam Goreng", price: 35000, category: "Ayam", available: true },
  { id: 2, name: "Chicken Rice", price: 30000, category: "Ayam", available: true },
  { id: 3, name: "Gulai Ayam", price: 32000, category: "Ayam", available: true },
  // Nasi
  { id: 4, name: "Nasi Goreng", price: 25000, category: "Nasi", available: true },
  { id: 5, name: "Nasi Bakar", price: 28000, category: "Nasi", available: true },
  { id: 6, name: "Nasi Uduk", price: 20000, category: "Nasi", available: true },
  // Sapi
  { id: 7, name: "Rendang", price: 40000, category: "Sapi", available: true },
  { id: 8, name: "Sop Sapi", price: 35000, category: "Sapi", available: true },
  // Minuman
  { id: 9, name: "Es Teh", price: 8000, category: "Minuman", available: true },
  { id: 10, name: "Jus Alpukat", price: 15000, category: "Minuman", available: true },
  { id: 11, name: "Air Mineral", price: 5000, category: "Minuman", available: true },
  // Lainnya
  { id: 12, name: "Kerupuk", price: 3000, category: "Lainnya", available: true },
  { id: 13, name: "Sambal Extra", price: 2000, category: "Lainnya", available: true },
];

export const CATEGORIES: MenuCategory[] = ["Ayam", "Nasi", "Sapi", "Minuman", "Lainnya"];