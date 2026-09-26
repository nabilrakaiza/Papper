import { Slot, router, usePathname } from "expo-router";
import { View, Text, TouchableOpacity, ScrollView, useWindowDimensions, ActivityIndicator } from "react-native";
import { LayoutDashboard, UtensilsCrossed, Wallet, ReceiptText, ShoppingBasket, LogOut, RefreshCw } from "lucide-react-native";
import { useAuth } from "@/context/AuthContext";
import { OwnerReportProvider, useOwnerReport } from "@/context/OwnerReportContext";
import DateRangePicker from "@/components/owner/DateRangePicker";
import { ACCENT } from "@/components/owner/ui";

/**
 * The owner dashboard: read-only money figures, for a desktop browser.
 *
 * A sidebar rather than the tab bar the other roles use — five report pages
 * read side by side with a wide screen, and the date range in the header
 * scopes every one of them, so it sits above the content, never inside a card.
 * Below 900px the sidebar folds into a row of links across the top.
 */

const NAV = [
  { path: "/ringkasan", href: "/(owner)/ringkasan", label: "Ringkasan", Icon: LayoutDashboard },
  { path: "/menu", href: "/(owner)/menu", label: "Menu", Icon: UtensilsCrossed },
  { path: "/pembayaran", href: "/(owner)/pembayaran", label: "Pembayaran", Icon: Wallet },
  { path: "/pesanan", href: "/(owner)/pesanan", label: "Pesanan", Icon: ReceiptText },
  { path: "/pembelian", href: "/(owner)/pembelian", label: "Pembelian", Icon: ShoppingBasket },
] as const;

function Header() {
  const pathname = usePathname();
  const { range, setRange, salesLoading, refresh } = useOwnerReport();
  const title = NAV.find((n) => n.path === pathname)?.label ?? "";

  return (
    <View className="flex-row flex-wrap items-center justify-between gap-3 mb-5">
      <Text className="text-2xl font-black text-gray-900">{title}</Text>
      <View className="flex-row items-center gap-2">
        <DateRangePicker value={range} onChange={setRange} />
        <TouchableOpacity
          onPress={refresh}
          className="w-10 h-10 bg-white rounded-2xl items-center justify-center"
          accessibilityLabel="Muat ulang"
        >
          {salesLoading ? <ActivityIndicator size="small" color={ACCENT} /> : <RefreshCw size={16} color="#374151" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function NavLinks({ vertical }: { vertical: boolean }) {
  const pathname = usePathname();
  return (
    <View className={vertical ? "gap-1" : "flex-row gap-1"}>
      {NAV.map(({ path, href, label, Icon }) => {
        const active = pathname === path;
        return (
          <TouchableOpacity
            key={path}
            onPress={() => router.navigate(href)}
            className={`flex-row items-center gap-3 rounded-2xl px-3 py-2.5 ${active ? "bg-blue-50" : ""}`}
          >
            <Icon size={18} color={active ? ACCENT : "#6b7280"} />
            <Text className={`text-sm font-extrabold ${active ? "text-blue-600" : "text-gray-600"}`}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Account() {
  const { profile, signOut } = useAuth();
  return (
    <View className="flex-row items-center justify-between gap-2">
      <View className="flex-1">
        <Text className="text-sm font-extrabold text-gray-900" numberOfLines={1}>{profile?.name ?? "Owner"}</Text>
        <Text className="text-xs font-bold text-gray-400">Owner</Text>
      </View>
      <TouchableOpacity onPress={signOut} className="flex-row items-center gap-1.5 rounded-xl px-2.5 py-2" accessibilityLabel="Keluar">
        <LogOut size={16} color="#6b7280" />
        <Text className="text-xs font-extrabold text-gray-500">Keluar</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function OwnerLayout() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  return (
    <OwnerReportProvider>
      <View className={`flex-1 bg-gray-100 ${wide ? "flex-row" : ""}`}>
        {wide ? (
          <View className="bg-white px-4 py-6 justify-between" style={{ width: 232 }}>
            <View>
              <View className="flex-row items-center gap-2 px-3 mb-8">
                <Text className="text-blue-500 text-xl font-black">✛</Text>
                <Text className="text-2xl font-black text-gray-900">Papper</Text>
              </View>
              <NavLinks vertical />
            </View>
            <Account />
          </View>
        ) : (
          <View className="bg-white px-4 pt-4 pb-2 gap-3">
            <Account />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <NavLinks vertical={false} />
            </ScrollView>
          </View>
        )}

        <ScrollView className="flex-1" contentContainerStyle={{ padding: wide ? 32 : 16, paddingBottom: 48 }}>
          <View style={{ width: "100%", maxWidth: 1200, alignSelf: "center" }}>
            <Header />
            <Slot />
          </View>
        </ScrollView>
      </View>
    </OwnerReportProvider>
  );
}
