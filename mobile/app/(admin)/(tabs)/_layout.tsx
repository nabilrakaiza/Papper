import { Tabs } from "expo-router";
import { Package, TrendingDown, BarChart2, UserCircle, BookText } from "lucide-react-native";

export default function AdminTabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#3a7bd5",
        tabBarInactiveTintColor: "#aaa", 
        tabBarStyle: {
          backgroundColor: "#f0f2f7",
          borderTopColor: "rgba(0,0,0,0.06)",
          height: 64,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontFamily: "Nunito_700Bold",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Stok",
          tabBarIcon: ({ color, size }) => <Package size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cogs/index"
        options={{
          title: "HPP",
          tabBarIcon: ({ color, size }) => <TrendingDown size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="purchase"
        options={{
          title: "Pembelian",
          tabBarIcon: ({ color, size }) => <BookText size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: "Penjualan",
          tabBarIcon: ({ color, size }) => <BarChart2 size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => <UserCircle size={size} color={color} />,
        }}
      />

      <Tabs.Screen
        name="cogs/[id]"
        options={{
          href: null, // hides this route from the tab bar entirely
        }}
      />

      {/* Superadmin reports. Hidden from the tab bar — five tabs is already the
          limit of what fits — and reached from a button on the screen each one
          belongs to: Stok for usage, Pembelian for the comparison. */}
      <Tabs.Screen name="stock-usage" options={{ href: null }} />
      <Tabs.Screen name="comparison" options={{ href: null }} />

      {/* Per-order drill-down, reached from Penjualan. Admin and superadmin. */}
      <Tabs.Screen name="orders" options={{ href: null }} />
    </Tabs>
  );
}