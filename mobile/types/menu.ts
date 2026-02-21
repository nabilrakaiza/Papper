export type MenuItem = {
  id: number;
  name: string;
  sellingPrice: number; // in Rupiah
  cogs: number | null;  // in Rupiah, null = not yet calculated
};