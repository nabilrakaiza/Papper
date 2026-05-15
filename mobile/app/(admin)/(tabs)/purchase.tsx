import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar, ShoppingCart, TrendingUp } from "lucide-react-native";
import { supabase } from "@/lib/supabase"; // Make sure this path matches your project

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpenseItem = {
  id: number;
  name: string;
  quantity: number;
  price_per_unit: number;
  total_cost: number;
  expense_date: string;
  created_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function isBackdated(expenseDate: string, createdAt: string): boolean {
  const diff = new Date(createdAt).getTime() - new Date(expenseDate).getTime();
  return diff > 1000 * 60 * 60 * 24; // more than 1 day apart
}

// Helper to get ISO date strings for our Supabase filters
function getDateRange(filter: string) {
  const now = new Date();
  let start = new Date();
  let end = new Date();

  if (filter === "This Week") {
    const day = now.getDay() || 7; // Get current day number, converting Sun. to 7
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day - 1));
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (filter === "This Month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else if (filter === "Last Month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    start.setHours(0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), 0);
    end.setHours(23, 59, 59, 999);
  }

  return { start: start.toISOString(), end: end.toISOString() };
}

const FILTER_OPTIONS = ["This Week", "This Month", "Last Month"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ expenses, filter }: { expenses: ExpenseItem[], filter: string }) {
  const total = expenses.reduce((s, p) => s + Number(p.total_cost), 0);
  const count = expenses.length;
  
  // Group expenses by item name to find the biggest expense drain
  const groupedByName = expenses.reduce((acc, item) => {
    acc[item.name] = (acc[item.name] || 0) + Number(item.total_cost);
    return acc;
  }, {} as Record<string, number>);

  // Sort to find the highest spending category
  const sortedExpenses = Object.entries(groupedByName).sort((a, b) => b[1] - a[1]);
  const topExpenseName = sortedExpenses.length > 0 ? sortedExpenses[0][0] : "None";
  const topExpenseAmount = sortedExpenses.length > 0 ? sortedExpenses[0][1] : 0;

  return (
    <View className="bg-yellow-100 rounded-2xl px-4 py-4 mb-3 shadow-sm shadow-yellow-300/30">
      <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-3">
        {filter} Insights
      </Text>
      <View className="bg-cyan-100 rounded-xl px-4 py-3 gap-3">
        <View className="flex-row justify-between items-center">
          <Text className="text-xs font-bold text-gray-500">Total Spent</Text>
          <Text className="text-lg font-black text-gray-800">{formatRupiah(total)}</Text>
        </View>
        <View className="h-px bg-cyan-200" />
        
        {/* New Insight: Top Spending Item */}
        <View className="flex-row justify-between items-center">
          <View className="flex-row items-center gap-1.5">
            <TrendingUp size={14} color="#ef4444" />
            <Text className="text-xs font-bold text-gray-500">Top Expense</Text>
          </View>
          <View className="items-end">
            <Text className="text-sm font-extrabold text-gray-800">{topExpenseName}</Text>
            <Text className="text-[10px] font-bold text-gray-500">{formatRupiah(topExpenseAmount)}</Text>
          </View>
        </View>
        
        <View className="h-px bg-cyan-200" />
        <View className="flex-row justify-between">
          <Text className="text-xs font-bold text-gray-500">Transactions Logged</Text>
          <Text className="text-sm font-extrabold text-gray-800">{count} items</Text>
        </View>
      </View>
    </View>
  );
}

function ExpenseCard({ item }: { item: ExpenseItem }) {
  const [expanded, setExpanded] = useState(false);
  const backdated = isBackdated(item.expense_date, item.created_at);

  return (
    <TouchableOpacity
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.9}
      className="bg-white rounded-2xl px-4 py-4 mb-3 shadow-sm border border-gray-100"
    >
      {/* Header row */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-1 pr-2">
          <Text className="text-base font-black text-gray-900">{item.name}</Text>
          <View className="flex-row items-center gap-1 mt-0.5">
            <Calendar size={10} color="#9ca3af" />
            <Text className="text-[11px] font-bold text-gray-400">
              {formatDate(item.expense_date)}
            </Text>
            {/* {backdated && (
              <View className="bg-orange-100 px-1.5 py-0.5 rounded-md ml-1">
                <Text className="text-[9px] font-extrabold text-orange-500">BACKDATED</Text>
              </View>
            )} */}
          </View>
        </View>
        <View className="items-end">
          <Text className="text-base font-black text-red-500">-{formatRupiah(item.total_cost)}</Text>
          <View className="bg-gray-100 px-2 py-0.5 rounded-lg mt-0.5">
            <Text className="text-[10px] font-extrabold text-gray-400">
              Qty: {item.quantity}
            </Text>
          </View>
        </View>
      </View>

      {/* Expanded details */}
      {expanded && (
        <View className="mt-1">
          <View className="bg-gray-50 rounded-xl px-4 py-3 gap-2 border border-gray-100">
            <View className="flex-row justify-between">
              <Text className="text-xs font-bold text-gray-500">Price per Unit</Text>
              <Text className="text-sm font-extrabold text-gray-800">{formatRupiah(item.price_per_unit)}</Text>
            </View>
            <View className="h-px bg-gray-200" />
            <View className="flex-row justify-between">
              <Text className="text-xs font-bold text-gray-500">System Entry Date</Text>
              <Text className="text-xs font-extrabold text-gray-700">{formatDate(item.created_at)}</Text>
            </View>
          </View>
        </View>
      )}

      <Text className="text-[10px] font-bold text-gray-400 text-center mt-2">
        {expanded ? "▲ hide details" : "▼ show details"}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("This Week");

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    const { start, end } = getDateRange(activeFilter);

    // Fetch from the expenses table, filtered by our date range, sorted newest first
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .gte("expense_date", start)
      .lte("expense_date", end)
      .order("expense_date", { ascending: false });

    if (!error && data) {
      setExpenses(data);
    }
    setLoading(false);
  }, [activeFilter]);

  // Refetch whenever the active filter changes
  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <Text className="text-2xl font-black text-gray-900">Expenses</Text>
      </View>

      {/* Filter chips */}
      <View className="h-[50px] flex-none mb-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center'}}
        >
          {FILTER_OPTIONS.map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setActiveFilter(f)}
              className={`px-4 py-2.5 rounded-xl border ${
                activeFilter === f
                  ? "bg-gray-900 border-gray-900"
                  : "bg-white border-gray-200"
              }`}
            >
              <Text
                className={`text-xs font-extrabold ${
                  activeFilter === f ? "text-white" : "text-gray-500"
                }`}
              >
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#111827" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24}}
          showsVerticalScrollIndicator={false}
        >
          {/* Advanced Summary card */}
          <SummaryCard expenses={expenses} filter={activeFilter} />

          {/* Empty state */}
          {expenses.length === 0 && (
            <View className="items-center mt-16">
              <ShoppingCart size={32} color="#d1d5db" />
              <Text className="text-gray-400 font-bold text-sm mt-3">
                No expenses recorded for {activeFilter.toLowerCase()}.
              </Text>
            </View>
          )}

          {/* List */}
          {expenses.map((item) => (
            <ExpenseCard key={item.id} item={item} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}