export type Profile = {
  id: string;
  role: 'cashier' | 'admin' | 'superadmin' | 'owner';
  name: string;
}