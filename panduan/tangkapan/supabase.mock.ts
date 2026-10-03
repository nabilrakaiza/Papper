// @ts-nocheck
// An in-memory stand-in for lib/supabase.ts, used only to take the screenshots
// for the user guides (panduan/). It is copied over lib/supabase.ts for the
// duration of a capture run and the real file is restored afterwards.
//
// Every name and figure here is made up. The clock is pinned to a fixed
// Saturday afternoon so every screenshot shows the same "today".
//
// The account shown is chosen by localStorage.mockRole:
//   none | cashier | admin | superadmin | owner

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------
const NOW = Date.parse("2026-10-03T14:32:00+07:00");
const RealDate = Date;
const OFFSET = NOW - RealDate.now();
class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + OFFSET);
    else super(...args);
  }
  static now() {
    return RealDate.now() + OFFSET;
  }
}
FakeDate.parse = RealDate.parse;
FakeDate.UTC = RealDate.UTC;
globalThis.Date = FakeDate;
(globalThis as any).__PAPPER_MOCK__ = true;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let seed = 20261003;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const WIB = 7 * 3600 * 1000;
const DAY = 86400000;

/** "YYYY-MM-DD" of the Jakarta day `offset` days from the pinned today. */
function day(offset) {
  return new RealDate(NOW + WIB + offset * DAY).toISOString().slice(0, 10);
}
function at(dayStr, h, m) {
  return new RealDate(`${dayStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`).toISOString();
}
function jakartaDay(iso) {
  return new RealDate(RealDate.parse(iso) + WIB).toISOString().slice(0, 10);
}
function jakartaHour(iso) {
  return new RealDate(RealDate.parse(iso) + WIB).getUTCHours();
}
function orderTotal(subtotal, d, t) {
  return Math.round(subtotal * (1 - d / 100) * (1 + t / 100));
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
const db = {
  profiles: [
    { id: "u-cashier", role: "cashier", name: "Rina" },
    { id: "u-admin", role: "admin", name: "Dimas" },
    { id: "u-superadmin", role: "superadmin", name: "Sari" },
    { id: "u-owner", role: "owner", name: "Hendra" },
  ],
  stock: [],
  menus: [],
  menu_ingredients: [],
  orders: [],
  order_items: [],
  order_payments: [],
  expenses: [],
};
const EMAILS = {
  cashier: "kasir@papper.id",
  admin: "admin@papper.id",
  superadmin: "superadmin@papper.id",
  owner: "owner@papper.id",
};

const STOCK = [
  // name, unit, price per unit, quantity on hand
  ["Ayam Fillet", "kg", 52000, 8.5],
  ["Daging Sapi", "kg", 135000, 7.2],
  ["Udang", "kg", 98000, 6.4],
  ["Ikan Dory", "kg", 64000, 8.1],
  ["Beras", "kg", 14500, 22],
  ["Telur", "butir", 2200, 64],
  ["Minyak Goreng", "liter", 18500, 9],
  ["Spaghetti", "kg", 38000, 8.5],
  ["Roti Burger", "pcs", 4500, 18],
  ["Kentang Beku", "kg", 36000, 6],
  ["Kopi Arabika", "gram", 280, 1850],
  ["Susu Segar", "liter", 21000, 7],
  ["Gula Aren Cair", "liter", 32000, 5.5],
  ["Teh Celup", "pcs", 350, 140],
  ["Gula Pasir", "kg", 17500, 11],
  ["Coklat Bubuk", "gram", 140, 900],
  ["Alpukat", "buah", 6500, 0],
  ["Jeruk Peras", "kg", 24000, 9],
  ["Pisang Kepok", "buah", 1500, 26],
  ["Tepung Terigu", "kg", 13000, 7],
  ["Cabai Rawit", "kg", 60000, 1.2],
  ["Bawang Merah", "kg", 42000, 6.8],
  ["Keju Cheddar", "gram", 120, 1500],
  ["Air Mineral", "botol", 3000, 48],
];
STOCK.forEach(([name, unit, price, qty], i) =>
  db.stock.push({
    id: i + 1,
    name,
    unit,
    price_per_unit: price,
    quantity: qty,
    is_active: true,
    updated_at: at(day(-1), 9, 0),
    last_purchase_date: at(day(-2), 9, 0),
  })
);
db.stock.push({
  id: db.stock.length + 1, name: "Sirup Leci", unit: "liter", price_per_unit: 45000, quantity: 1,
  is_active: false, updated_at: at(day(-20), 9, 0), last_purchase_date: at(day(-40), 9, 0),
});
const S = Object.fromEntries(db.stock.map((s) => [s.name, s.id]));

const MENUS = [
  // name, category, price, recipe [[stock, qty]] | "manual:<cogs>" | null
  ["Nasi Goreng Papper", "Nasi", 28000, [["Beras", 0.15], ["Telur", 1], ["Ayam Fillet", 0.05], ["Minyak Goreng", 0.02], ["Bawang Merah", 0.01]]],
  ["Nasi Goreng Seafood", "Nasi", 35000, [["Beras", 0.15], ["Telur", 1], ["Udang", 0.06], ["Minyak Goreng", 0.02]]],
  ["Ayam Geprek", "Ayam", 25000, [["Ayam Fillet", 0.15], ["Tepung Terigu", 0.04], ["Cabai Rawit", 0.02], ["Minyak Goreng", 0.04], ["Beras", 0.12]]],
  ["Ayam Bakar Madu", "Ayam", 32000, [["Ayam Fillet", 0.2], ["Beras", 0.12], ["Gula Aren Cair", 0.02]]],
  ["Sapi Lada Hitam", "Sapi", 45000, [["Daging Sapi", 0.12], ["Beras", 0.12], ["Bawang Merah", 0.01]]],
  ["Udang Saus Padang", "Udang", 42000, [["Udang", 0.15], ["Beras", 0.12], ["Cabai Rawit", 0.01]]],
  ["Dory Sambal Matah", "Ikan", 38000, [["Ikan Dory", 0.15], ["Beras", 0.12], ["Cabai Rawit", 0.01], ["Bawang Merah", 0.02]]],
  ["Chicken Steak", "Steak", 48000, [["Ayam Fillet", 0.2], ["Kentang Beku", 0.1], ["Tepung Terigu", 0.03]]],
  ["Sirloin Steak", "Steak", 85000, [["Daging Sapi", 0.2], ["Kentang Beku", 0.1]]],
  ["Beef Burger", "Burger", 45000, [["Roti Burger", 1], ["Daging Sapi", 0.12], ["Keju Cheddar", 20], ["Kentang Beku", 0.08]]],
  ["Spaghetti Carbonara", "Pasta", 40000, [["Spaghetti", 0.12], ["Susu Segar", 0.1], ["Keju Cheddar", 25], ["Telur", 1]]],
  ["Aglio Olio", "Pasta", 35000, [["Spaghetti", 0.12], ["Cabai Rawit", 0.01], ["Minyak Goreng", 0.02]]],
  ["Paket Hemat Ayam", "Paketan", 30000, [["Ayam Fillet", 0.12], ["Beras", 0.12], ["Teh Celup", 1], ["Gula Pasir", 0.02]]],
  ["Telur Mata Sapi", "Additions", 6000, [["Telur", 1], ["Minyak Goreng", 0.01]]],
  ["Nasi Putih", "Additions", 6000, [["Beras", 0.12]]],
  ["French Fries", "Snacks", 22000, [["Kentang Beku", 0.15], ["Minyak Goreng", 0.03]]],
  ["Pisang Goreng", "Snacks", 18000, [["Pisang Kepok", 3], ["Tepung Terigu", 0.05], ["Minyak Goreng", 0.03]]],
  ["Es Kopi Susu Papper", "Coffee", 22000, [["Kopi Arabika", 18], ["Susu Segar", 0.12], ["Gula Aren Cair", 0.02]]],
  ["Americano", "Coffee", 20000, [["Kopi Arabika", 18]]],
  ["Cappuccino", "Coffee", 25000, [["Kopi Arabika", 18], ["Susu Segar", 0.15]]],
  ["Kopi Tubruk", "Coffee", 15000, [["Kopi Arabika", 15], ["Gula Pasir", 0.015]]],
  ["Es Teh Manis", "Drinks", 8000, [["Teh Celup", 1], ["Gula Pasir", 0.025]]],
  ["Lemon Tea", "Drinks", 15000, [["Teh Celup", 1], ["Gula Pasir", 0.02]]],
  ["Milkshake Coklat", "Milkshake", 28000, [["Susu Segar", 0.2], ["Coklat Bubuk", 25], ["Gula Pasir", 0.02]]],
  ["Jus Alpukat", "Juice", 22000, [["Alpukat", 1], ["Susu Segar", 0.05], ["Gula Pasir", 0.02]]],
  ["Jus Jeruk", "Juice", 18000, [["Jeruk Peras", 0.3], ["Gula Pasir", 0.015]]],
  ["Pancake Madu", "Dessert", 25000, null],
  ["Croissant", "Pastry", 22000, "manual:9000"],
  ["Air Mineral", "Lain Lain", 6000, [["Air Mineral", 1]]],
];
let miId = 1;
MENUS.forEach(([name, category, price, recipe], i) => {
  const manual = typeof recipe === "string" ? Number(recipe.split(":")[1]) : null;
  db.menus.push({
    id: i + 1,
    name,
    category,
    price,
    available: name !== "Jus Alpukat",
    is_active: true,
    cogs_mode: manual != null ? "manual" : "ingredients",
    manual_cogs: manual,
    created_at: at(day(-120), 9, 0),
  });
  if (Array.isArray(recipe)) {
    for (const [stock, qty] of recipe) {
      db.menu_ingredients.push({ id: miId++, menu_id: i + 1, stock_id: S[stock], quantity: qty });
    }
  }
});
db.menus.push({
  id: db.menus.length + 1, name: "Es Leci Yakult", category: "Drinks", price: 20000, available: true,
  is_active: false, cogs_mode: "ingredients", manual_cogs: null, created_at: at(day(-120), 9, 0),
});
const M = Object.fromEntries(db.menus.map((m) => [m.name, m]));

const FOOD = MENUS.filter((m) => ["Nasi", "Ayam", "Sapi", "Udang", "Ikan", "Steak", "Burger", "Pasta", "Paketan"].includes(m[1])).map((m) => m[0]);
const SIDES = ["Telur Mata Sapi", "Nasi Putih", "French Fries", "Pisang Goreng", "Pancake Madu", "Croissant"];
const DRINKS = ["Es Kopi Susu Papper", "Es Kopi Susu Papper", "Americano", "Cappuccino", "Kopi Tubruk", "Es Teh Manis", "Es Teh Manis", "Lemon Tea", "Milkshake Coklat", "Jus Alpukat", "Jus Jeruk", "Air Mineral"];
const NAMES = ["Andi", "Budi", "Citra", "Dewi", "Eka", "Fajar", "Gita", "Hana", "Indra", "Joko", "Kiki", "Lina", "Maya", "Nanda", "Oki", "Putri", "Rizky", "Sinta", "Tono", "Umi", "Vina", "Wahyu", "Yoga", "Zahra", "Bu Ani", "Pak Agus", "Mbak Tari", "Mas Dani"];
const NOTES = ["tidak pedas", "pedas sekali", "es sedikit", "tanpa gula", "saus dipisah"];
const METHODS = ["Cash", "Cash", "Cash", "Cash", "QRIS", "QRIS", "QRIS", "QRIS", "Debit", "Bank Transfer"];

let orderId = 1;
let itemId = 1;
let payId = 1;

function addOrder({ created, name, seat, dineIn, status = "paid", discount = 0, tax = 10, reopen = 0, lines, payments }) {
  const o = {
    id: orderId++,
    customer_name: name,
    seat,
    is_dine_in: dineIn,
    discount,
    tax,
    status,
    created_at: created,
    reopen_seq: reopen,
    daily_number: null,
    method_of_payment: null,
    payment_amount: null,
  };
  db.orders.push(o);
  for (const l of lines) {
    const menu = l.menu ? M[l.menu] : null;
    db.order_items.push({
      id: itemId++,
      order_id: o.id,
      menu_id: menu ? menu.id : null,
      name: menu ? menu.name : l.name,
      price: menu ? menu.price : l.price,
      quantity: l.qty ?? 1,
      is_sent: l.sent ?? true,
      is_cancelled: false,
      print_batch: l.batch ?? 1,
      notes: l.note ?? null,
      is_stock_deducted: true,
      stock_deducted_qty: menu ? l.qty ?? 1 : 0,
      customer_num: l.payer ?? 1,
    });
  }
  for (const p of payments ?? []) {
    db.order_payments.push({
      id: payId++,
      order_id: o.id,
      customer_num: p.payer ?? 1,
      customer_label: p.label ?? null,
      amount: p.amount,
      amount_tendered: p.tendered ?? null,
      method_of_payment: p.method,
      reopen_seq: p.round ?? 0,
      approved_by: p.round ? "u-superadmin" : null,
      created_at: p.at ?? created,
    });
  }
  return o;
}

function subtotalOf(lines, payer) {
  return lines
    .filter((l) => payer == null || (l.payer ?? 1) === payer)
    .reduce((s, l) => s + (l.menu ? M[l.menu].price : l.price) * (l.qty ?? 1), 0);
}

function tendered(amount) {
  const steps = [20000, 50000, 100000];
  for (const s of steps) if (amount <= s) return s;
  return Math.ceil(amount / 50000) * 50000;
}

function randomLines() {
  const lines = [];
  const people = rand() < 0.55 ? 1 : randint(2, 4);
  for (let p = 0; p < people; p++) {
    if (rand() < 0.85) lines.push({ menu: pick(FOOD), note: rand() < 0.12 ? pick(NOTES) : undefined });
    if (rand() < 0.25) lines.push({ menu: pick(SIDES) });
    lines.push({ menu: pick(DRINKS), note: rand() < 0.08 ? "es sedikit" : undefined });
  }
  if (rand() < 0.03) lines.push({ name: "Sambal Extra", price: 3000 });
  // Merge repeats into quantities.
  const merged = [];
  for (const l of lines) {
    const same = merged.find((m) => m.menu && m.menu === l.menu && !l.note && !m.note);
    if (same) same.qty = (same.qty ?? 1) + 1;
    else merged.push({ ...l });
  }
  return merged;
}

function randomOrder(dayStr, h, m) {
  const lines = randomLines();
  const dineIn = rand() < 0.7;
  const discount = rand() < 0.08 ? 10 : 0;
  const created = at(dayStr, h, m);
  if (rand() < 0.03) {
    return addOrder({ created, name: pick(NAMES), seat: dineIn ? `${pick("ABC")}${randint(1, 8)}` : "-", dineIn, status: "cancelled", lines, payments: [] });
  }
  const payAt = new RealDate(RealDate.parse(created) + randint(20, 70) * 60000).toISOString();
  let payments;
  if (lines.length >= 3 && rand() < 0.12) {
    const payers = randint(2, 3);
    lines.forEach((l, i) => (l.payer = (i % payers) + 1));
    payments = [];
    for (let p = 1; p <= payers; p++) {
      const amount = orderTotal(subtotalOf(lines, p), discount, 10);
      const method = pick(METHODS);
      payments.push({ payer: p, amount, method, tendered: method === "Cash" ? tendered(amount) : null, at: payAt });
    }
  } else {
    const amount = orderTotal(subtotalOf(lines), discount, 10);
    const method = pick(METHODS);
    payments = [{ amount, method, tendered: method === "Cash" ? tendered(amount) : null, at: payAt }];
  }
  return addOrder({ created, name: pick(NAMES), seat: dineIn ? `${pick("ABC")}${randint(1, 8)}` : "-", dineIn, discount, lines, payments });
}

const HOURS = [10, 11, 11, 12, 12, 12, 13, 13, 14, 15, 16, 17, 18, 18, 19, 19, 19, 20, 20, 21];

// About ten weeks of trading, then this morning.
for (let d = -70; d <= -1; d++) {
  const dayStr = day(d);
  const dow = new RealDate(`${dayStr}T00:00:00Z`).getUTCDay();
  const n = (dow === 0 || dow === 6 ? 34 : 24) + randint(-4, 6);
  const times = Array.from({ length: n }, () => [pick(HOURS), randint(0, 59)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [h, m] of times) randomOrder(dayStr, h, m);
}

// The two corrected orders the cashier guide shows. Wulan's was settled today
// with money handed back; Yusuf's is open right now, mid-correction.
const wulanLines = [
  { menu: "Sapi Lada Hitam" },
  { menu: "Dory Sambal Matah" },
  { menu: "Cappuccino", qty: 2 },
];
const wulanOriginal = orderTotal(subtotalOf([...wulanLines, { menu: "French Fries" }]), 0, 10);
const wulanNow = orderTotal(subtotalOf(wulanLines), 0, 10);
addOrder({
  created: at(day(-3), 19, 12), name: "Ibu Wulan", seat: "A2", dineIn: true, status: "paid", reopen: 1,
  lines: wulanLines,
  payments: [
    { amount: wulanOriginal, method: "QRIS", at: at(day(-3), 20, 5) },
    { amount: wulanNow - wulanOriginal, method: "Cash", round: 1, at: at(day(0), 11, 15) },
  ],
});
const yusufLines = [
  { menu: "Chicken Steak" },
  { menu: "Spaghetti Carbonara" },
  { menu: "Es Teh Manis", qty: 2 },
];
const yusufOriginal = orderTotal(subtotalOf([...yusufLines, { menu: "Milkshake Coklat" }]), 0, 10);
addOrder({
  created: at(day(-5), 18, 40), name: "Pak Yusuf", seat: "A5", dineIn: true, status: "unpaid", reopen: 1,
  lines: yusufLines,
  payments: [{ amount: yusufOriginal, method: "Cash", tendered: 200000, at: at(day(-5), 19, 30) }],
});

// Today until the pinned 14:32.
{
  const today = day(0);
  const times = [[10, 4], [10, 26], [10, 51], [11, 9], [11, 33], [11, 48], [12, 2], [12, 11], [12, 20], [12, 37], [12, 49], [13, 3], [13, 16], [13, 29]];
  for (const [h, m] of times) randomOrder(today, h, m);

  // A bill split three ways; one share paid.
  const rakaLines = [
    { menu: "Beef Burger", payer: 1 },
    { menu: "Es Kopi Susu Papper", payer: 1 },
    { menu: "Ayam Bakar Madu", payer: 2 },
    { menu: "Lemon Tea", payer: 2 },
    { menu: "Aglio Olio", payer: 3 },
    { menu: "Americano", payer: 3 },
  ];
  addOrder({
    created: at(today, 13, 48), name: "Raka", seat: "B2", dineIn: true, status: "unpaid",
    lines: rakaLines,
    payments: [{ payer: 1, label: "Raka", amount: orderTotal(subtotalOf(rakaLines, 1), 0, 10), method: "QRIS", at: at(today, 14, 25) }],
  });

  addOrder({
    created: at(today, 14, 6), name: "Bu Aliyah", seat: "A3", dineIn: true, status: "unpaid",
    lines: [
      { menu: "Nasi Goreng Papper", qty: 2, note: "tidak pedas" },
      { menu: "Ayam Geprek" },
      { menu: "Es Teh Manis", qty: 3 },
    ],
  });
  addOrder({
    created: at(today, 14, 21), name: "Kak Nadia", seat: "-", dineIn: false, status: "unpaid",
    lines: [{ menu: "Es Kopi Susu Papper", qty: 2 }, { menu: "Croissant" }],
  });
  addOrder({
    created: at(today, 12, 58), name: "Dodi", seat: "C4", dineIn: true, status: "cancelled",
    lines: [{ menu: "Sirloin Steak" }, { menu: "Americano" }],
  });
}

// Daily numbers, per Jakarta day in order of creation.
{
  const byDay = new Map();
  for (const o of [...db.orders].sort((a, b) => RealDate.parse(a.created_at) - RealDate.parse(b.created_at))) {
    const d = jakartaDay(o.created_at);
    const n = (byDay.get(d) ?? 0) + 1;
    byDay.set(d, n);
    o.daily_number = n;
  }
}

// Restocks: each item every few days, prices drifting.
{
  let id = 1;
  for (const s of db.stock.filter((x) => x.is_active)) {
    const every = s.unit === "kg" || s.unit === "liter" ? randint(3, 5) : randint(5, 9);
    let price = s.price_per_unit * (0.9 + rand() * 0.06);
    for (let d = -70 + randint(0, every); d <= 0; d += every) {
      price = price * (1 + (rand() - 0.4) * 0.04);
      const step = price >= 10000 ? 500 : price >= 1000 ? 100 : 10;
      const rounded = Math.round(price / step) * step;
      const qty = s.unit === "gram" ? randint(5, 10) * 250 : s.unit === "butir" || s.unit === "pcs" || s.unit === "buah" || s.unit === "botol" ? randint(2, 6) * 12 : randint(3, 12);
      const expenseDate = at(day(d), 8, randint(0, 50));
      const late = rand() < 0.1 && d < 0;
      db.expenses.push({
        id: id++,
        name: s.name,
        quantity: qty,
        price_per_unit: d >= -1 ? s.price_per_unit : rounded,
        total_cost: qty * (d >= -1 ? s.price_per_unit : rounded),
        expense_date: expenseDate,
        created_at: late ? at(day(d + 1), 10, 12) : at(day(d), 8, 55),
        stock_id: s.id,
      });
    }
  }
}

const OVERRIDES = [
  { id: 1, order_id: db.orders.find((o) => o.customer_name === "Pak Yusuf").id, action: "reopen", success: true, created_at: at(day(0), 14, 10), cashier_name: "Rina", admin_name: "Sari" },
  { id: 2, order_id: db.orders.find((o) => o.customer_name === "Dodi").id, action: "cancel", success: true, created_at: at(day(0), 13, 2), cashier_name: "Rina", admin_name: "Sari" },
  { id: 3, order_id: db.orders.find((o) => o.customer_name === "Ibu Wulan").id, action: "reopen", success: true, created_at: at(day(0), 11, 8), cashier_name: "Rina", admin_name: "Sari" },
  { id: 4, order_id: db.orders.find((o) => o.customer_name === "Ibu Wulan").id, action: "reopen", success: false, created_at: at(day(0), 11, 7), cashier_name: "Rina", admin_name: null },
  { id: 5, order_id: 410, action: "cancel", success: true, created_at: at(day(-2), 20, 31), cashier_name: "Bayu", admin_name: "Sari" },
  { id: 6, order_id: 220, action: "cancel_blocked", success: false, created_at: at(day(-9), 19, 2), cashier_name: "Bayu", admin_name: null },
];

// ---------------------------------------------------------------------------
// Query builder: the PostgREST subset the app uses
// ---------------------------------------------------------------------------
const FK = {
  order_items: { order_id: "orders", menu_id: "menus" },
  order_payments: { order_id: "orders" },
  menu_ingredients: { menu_id: "menus", stock_id: "stock" },
  expenses: { stock_id: "stock" },
};

function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseSelect(s) {
  return splitTop(s || "*").map((part) => {
    const open = part.indexOf("(");
    if (open === -1) {
      const [alias, col] = part.includes(":") ? part.split(":") : [part, part];
      return { kind: "col", alias: alias.trim(), name: col.trim() };
    }
    let head = part.slice(0, open).trim();
    const inner = part.slice(open + 1, part.lastIndexOf(")"));
    let alias = null;
    if (head.includes(":")) [alias, head] = head.split(":");
    const innerJoin = head.includes("!inner");
    head = head.replace(/!.*/, "");
    return { kind: "embed", alias: alias ?? head, target: head, inner: innerJoin, children: parseSelect(inner) };
  });
}

function project(row, nodes, table) {
  const out = {};
  for (const n of nodes) {
    if (n.kind === "col") {
      if (n.name === "*") Object.assign(out, row);
      else out[n.alias] = row[n.name];
      continue;
    }
    const fks = FK[table] ?? {};
    if (fks[n.target]) {
      // alias:fk_column(...) — many-to-one through that column
      const parent = db[fks[n.target]].find((r) => r.id === row[n.target]);
      out[n.alias] = parent ? project(parent, n.children, fks[n.target]) : null;
    } else {
      const col = Object.keys(fks).find((c) => fks[c] === n.target);
      if (col) {
        const parent = db[n.target].find((r) => r.id === row[col]);
        out[n.alias] = parent ? project(parent, n.children, n.target) : null;
      } else {
        const childCol = Object.keys(FK[n.target] ?? {}).find((c) => FK[n.target][c] === table);
        out[n.alias] = db[n.target].filter((r) => r[childCol] === row.id).map((r) => project(r, n.children, n.target));
      }
    }
  }
  return out;
}

function cmp(a, b) {
  const dateLike = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
  if (dateLike(a) && dateLike(b)) return RealDate.parse(a) - RealDate.parse(b);
  if (typeof a === "number" || typeof b === "number") return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}

function getPath(row, path) {
  return path.split(".").reduce((v, k) => (v == null ? v : v[k]), row);
}

class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.orders = [];
    this.mode = "select";
    this.nodes = parseSelect("*");
    this.returning = false;
  }
  select(s) {
    if (this.mode === "select") this.nodes = parseSelect(s);
    else this.returning = true;
    if (s && this.mode !== "select") this.nodes = parseSelect(s);
    return this;
  }
  insert(v) { this.mode = "insert"; this.payload = Array.isArray(v) ? v : [v]; return this; }
  update(v) { this.mode = "update"; this.payload = v; return this; }
  upsert(v) { return this.insert(v); }
  delete() { this.mode = "delete"; return this; }
  eq(c, v) { this.filters.push([c, (x) => x === v || cmp(x, v) === 0]); return this; }
  neq(c, v) { this.filters.push([c, (x) => x !== v]); return this; }
  gt(c, v) { this.filters.push([c, (x) => x != null && cmp(x, v) > 0]); return this; }
  gte(c, v) { this.filters.push([c, (x) => x != null && cmp(x, v) >= 0]); return this; }
  lt(c, v) { this.filters.push([c, (x) => x != null && cmp(x, v) < 0]); return this; }
  lte(c, v) { this.filters.push([c, (x) => x != null && cmp(x, v) <= 0]); return this; }
  in(c, vs) { this.filters.push([c, (x) => vs.includes(x)]); return this; }
  is(c, v) { this.filters.push([c, (x) => x === v]); return this; }
  order(c, opts = {}) { this.orders.push([c, opts.ascending !== false]); return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }

  run() {
    const rows = db[this.table];
    const plain = this.filters.filter(([c]) => !c.includes("."));
    const dotted = this.filters.filter(([c]) => c.includes("."));
    const matches = (r) => plain.every(([c, f]) => f(r[c]));

    if (this.mode === "insert") {
      const made = this.payload.map((p) => {
        const id = Math.max(0, ...rows.map((r) => r.id)) + 1;
        const r = { id, created_at: new Date().toISOString(), ...p };
        rows.push(r);
        return r;
      });
      return this.finish(made);
    }
    if (this.mode === "update") {
      const hit = rows.filter(matches);
      hit.forEach((r) => Object.assign(r, this.payload));
      return this.finish(hit);
    }
    if (this.mode === "delete") {
      const keep = rows.filter((r) => !matches(r));
      db[this.table] = keep;
      return { data: null, error: null };
    }

    let out = rows.filter(matches);
    for (const [c, asc] of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => (asc ? 1 : -1) * cmp(a[c], b[c]));
    }
    let projected = out.map((r) => project(r, this.nodes, this.table));
    if (dotted.length) projected = projected.filter((r) => dotted.every(([c, f]) => f(getPath(r, c))));
    for (const n of this.nodes) {
      if (n.kind === "embed" && n.inner) projected = projected.filter((r) => r[n.alias] != null);
    }
    if (this.rng) projected = projected.slice(this.rng[0], this.rng[1] + 1);
    if (this.lim != null) projected = projected.slice(0, this.lim);
    return this.finish(projected, true);
  }

  finish(rows, isSelect = false) {
    if (!isSelect && !this.returning && !this.one) return { data: null, error: null };
    const data = isSelect ? rows : rows.map((r) => project(r, this.nodes, this.table));
    if (this.one === "single") {
      return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: "not single", code: "PGRST116" } };
    }
    if (this.one === "maybe") return { data: data[0] ?? null, error: null };
    return { data, error: null, count: data.length };
  }

  then(resolve, reject) {
    try {
      return Promise.resolve(this.run()).then(resolve, reject);
    } catch (e) {
      return Promise.reject(e).then(resolve, reject);
    }
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
function unitCogs(menuId) {
  const m = db.menus.find((x) => x.id === menuId);
  if (!m) return null;
  if (m.cogs_mode === "manual") return m.manual_cogs == null ? null : m.manual_cogs * 1.1;
  const ing = db.menu_ingredients.filter((i) => i.menu_id === menuId);
  if (!ing.length) return null;
  return ing.reduce((s, i) => s + i.quantity * db.stock.find((x) => x.id === i.stock_id).price_per_unit, 0) * 1.1;
}

function salesReport(from, to, withCost) {
  const paid = db.orders.filter((o) => o.status === "paid" && jakartaDay(o.created_at) >= from && jakartaDay(o.created_at) <= to);
  const summary = { transactions: paid.length, gross: 0, net: 0, discount: 0, tax: 0, collected: 0 };
  const costing = { cogs: 0, costed_net: 0, uncosted_net: 0 };
  const items = new Map();
  const daily = new Map();
  const weekday = Array.from({ length: 7 }, (_, dow) => ({ dow, gross: 0, orders: 0 }));
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, gross: 0, orders: 0 }));
  const payments = new Map();

  for (const o of paid) {
    const lines = db.order_items.filter((i) => i.order_id === o.id);
    const gross = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    const net = Math.round(gross * (1 - o.discount / 100));
    const collected = orderTotal(gross, o.discount, o.tax);
    summary.gross += gross;
    summary.net += net;
    summary.collected += collected;
    const d = jakartaDay(o.created_at);
    const dd = daily.get(d) ?? { date: d, gross: 0, net: 0, orders: 0 };
    dd.gross += gross; dd.net += net; dd.orders++;
    daily.set(d, dd);
    const dow = new RealDate(`${d}T00:00:00Z`).getUTCDay();
    weekday[dow].gross += gross; weekday[dow].orders++;
    const h = jakartaHour(o.created_at);
    hourly[h].gross += gross; hourly[h].orders++;

    for (const l of lines) {
      const key = l.menu_id ?? `c:${l.name.toLowerCase()}`;
      const menu = db.menus.find((m) => m.id === l.menu_id);
      const lineNet = l.price * l.quantity * (1 - o.discount / 100);
      const uc = l.menu_id ? unitCogs(l.menu_id) : null;
      const it = items.get(key) ?? { menu_id: l.menu_id, name: menu ? menu.name : l.name, category: menu ? menu.category : "Custom", qty: 0, gross: 0, net: 0, cogs: uc == null ? null : 0 };
      it.qty += l.quantity; it.gross += l.price * l.quantity; it.net += lineNet;
      if (uc != null) { it.cogs += uc * l.quantity; costing.cogs += uc * l.quantity; costing.costed_net += lineNet; }
      else costing.uncosted_net += lineNet;
      items.set(key, it);
    }

    const ps = db.order_payments.filter((p) => p.order_id === o.id);
    if (!ps.length) {
      const e = payments.get(null) ?? { method: null, count: 0, amount: 0 };
      e.count++; e.amount += collected; payments.set(null, e);
    }
    for (const p of ps) {
      const e = payments.get(p.method_of_payment) ?? { method: p.method_of_payment, count: 0, amount: 0 };
      if (p.reopen_seq === 0) e.count++;
      e.amount += p.amount;
      payments.set(p.method_of_payment, e);
    }
  }
  summary.discount = summary.gross - summary.net;
  summary.tax = summary.collected - summary.net;
  costing.cogs = Math.round(costing.cogs);
  costing.costed_net = Math.round(costing.costed_net);
  costing.uncosted_net = Math.round(costing.uncosted_net);

  const dailyArr = [];
  for (let d = from; d <= to; d = new RealDate(RealDate.parse(`${d}T00:00:00Z`) + DAY).toISOString().slice(0, 10)) {
    dailyArr.push(daily.get(d) ?? { date: d, gross: 0, net: 0, orders: 0 });
  }
  const itemsArr = [...items.values()]
    .map((i) => ({ ...i, net: Math.round(i.net), cogs: i.cogs == null ? null : Math.round(i.cogs) }))
    .sort((a, b) => b.qty - a.qty || b.gross - a.gross);
  const paymentsArr = [...payments.values()].sort((a, b) => b.amount - a.amount);

  if (!withCost) {
    return { summary, hourly, items: itemsArr.map(({ cogs, ...rest }) => rest), payments: paymentsArr };
  }
  return { summary, costing, daily: dailyArr, weekday, hourly, items: itemsArr, payments: paymentsArr };
}

function ownerOrders({ p_from, p_to, p_status, p_search, p_limit, p_offset }) {
  let rows = db.orders.filter((o) => jakartaDay(o.created_at) >= p_from && jakartaDay(o.created_at) <= p_to);
  if (p_status) rows = rows.filter((o) => o.status === p_status);
  if (p_search) {
    const q = p_search.toLowerCase();
    rows = rows.filter((o) => o.customer_name.toLowerCase().includes(q) || String(o.daily_number) === q);
  }
  rows.sort((a, b) => cmp(b.created_at, a.created_at) || b.id - a.id);
  const page = rows.slice(p_offset, p_offset + p_limit).map((o) => {
    const lines = db.order_items.filter((i) => i.order_id === o.id);
    const sub = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    return {
      ...o,
      item_count: lines.reduce((s, l) => s + l.quantity, 0),
      total: orderTotal(sub, o.discount, o.tax),
      methods: [...new Set(db.order_payments.filter((p) => p.order_id === o.id).map((p) => p.method_of_payment))],
    };
  });
  return { total_count: rows.length, rows: page };
}

function purchaseReport({ p_from, p_to }) {
  const rows = db.expenses.filter((e) => jakartaDay(e.expense_date) >= p_from && jakartaDay(e.expense_date) <= p_to)
    .sort((a, b) => cmp(a.expense_date, b.expense_date));
  const items = new Map();
  const daily = new Map();
  for (const e of rows) {
    const s = db.stock.find((x) => x.id === e.stock_id);
    const it = items.get(e.stock_id) ?? { stock_id: e.stock_id, name: e.name, unit: s?.unit ?? null, purchases: 0, quantity: 0, spend: 0, min_price: Infinity, max_price: 0, first_price: e.price_per_unit, last_price: 0, last_bought: "" };
    it.purchases++; it.quantity += e.quantity; it.spend += e.total_cost;
    it.min_price = Math.min(it.min_price, e.price_per_unit); it.max_price = Math.max(it.max_price, e.price_per_unit);
    it.last_price = e.price_per_unit; it.last_bought = e.expense_date;
    items.set(e.stock_id, it);
    const d = jakartaDay(e.expense_date);
    const dd = daily.get(d) ?? { date: d, spend: 0, purchases: 0 };
    dd.spend += e.total_cost; dd.purchases++;
    daily.set(d, dd);
  }
  const dailyArr = [];
  for (let d = p_from; d <= p_to; d = new RealDate(RealDate.parse(`${d}T00:00:00Z`) + DAY).toISOString().slice(0, 10)) {
    dailyArr.push(daily.get(d) ?? { date: d, spend: 0, purchases: 0 });
  }
  const list = [...items.values()].sort((a, b) => b.spend - a.spend);
  return {
    summary: { spend: list.reduce((s, i) => s + i.spend, 0), purchases: rows.length, items: list.length },
    items: list,
    daily: dailyArr,
  };
}

function stockUsage({ p_from, p_to }) {
  const orders = db.orders.filter((o) => o.status !== "unpaid" && cmp(o.created_at, p_from) >= 0 && cmp(o.created_at, p_to) < 0);
  const used = new Map();
  let custom = 0;
  let recipeless = 0;
  for (const o of orders) {
    for (const l of db.order_items.filter((i) => i.order_id === o.id)) {
      if (!l.menu_id) { custom++; continue; }
      const ing = db.menu_ingredients.filter((i) => i.menu_id === l.menu_id);
      if (!ing.length) { recipeless++; continue; }
      for (const i of ing) used.set(i.stock_id, (used.get(i.stock_id) ?? 0) + i.quantity * l.quantity);
    }
  }
  const items = [...used.entries()].map(([id, q]) => {
    const s = db.stock.find((x) => x.id === id);
    return { stock_id: id, stock_name: s.name, unit: s.unit, quantity_used: Math.round(q * 100) / 100, price_per_unit: s.price_per_unit, value_used: Math.round(q * s.price_per_unit) };
  }).sort((a, b) => b.value_used - a.value_used);
  return { items, unmapped: { custom_lines: custom, recipeless_lines: recipeless } };
}

const RPC = {
  daily_sales_report: (a) => salesReport(a.p_date, a.p_date, false),
  owner_sales_report: (a) => salesReport(a.p_from, a.p_to, true),
  owner_orders: ownerOrders,
  owner_purchase_report: purchaseReport,
  stock_usage_report: stockUsage,
  override_log_report: (a) => OVERRIDES.filter((r) => cmp(r.created_at, a.p_from) >= 0 && cmp(r.created_at, a.p_to) < 0)
    .sort((x, y) => cmp(y.created_at, x.created_at)),
  check_stock_for_order: () => [],
  deduct_stock_for_order: () => null,
  save_order_items: () => null,
  toggle_menu_availability: ({ p_menu_id }) => {
    const m = db.menus.find((x) => x.id === p_menu_id);
    if (m) m.available = !m.available;
    return null;
  },
  reopen_order_with_pin: () => ({ ok: false, reason: "wrong_pin", attempts_left: 4 }),
  cancel_order_with_pin_v2: () => ({ ok: false, reason: "wrong_pin", attempts_left: 4 }),
  correct_stock: () => null,
  delete_expense_entry: () => null,
};

// ---------------------------------------------------------------------------
// Auth and realtime
// ---------------------------------------------------------------------------
function currentRole() {
  try {
    return globalThis.localStorage?.getItem("mockRole") ?? "none";
  } catch {
    return "none";
  }
}
let session = null;
{
  const role = currentRole();
  if (role !== "none") {
    session = {
      access_token: "mock",
      user: { id: `u-${role}`, email: EMAILS[role] },
    };
  }
}
const listeners = new Set();

export const supabase = {
  from: (table) => new Query(table),
  rpc: async (name, args = {}) => {
    const fn = RPC[name];
    if (!fn) return { data: null, error: { message: `no mock for ${name}`, code: "PGRST202" } };
    return { data: fn(args), error: null };
  },
  channel: () => {
    const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} };
    return ch;
  },
  removeChannel: () => {},
  auth: {
    onAuthStateChange(cb) {
      listeners.add(cb);
      setTimeout(() => cb("INITIAL_SESSION", session), 0);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    },
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async () => ({ data: { user: session?.user ?? null }, error: null }),
    signInWithPassword: async () => ({ data: { session: null }, error: { message: "Invalid login credentials", status: 400 } }),
    signOut: async () => {
      session = null;
      listeners.forEach((cb) => cb("SIGNED_OUT", null));
      return { error: null };
    },
    startAutoRefresh() {},
    stopAutoRefresh() {},
  },
};
