import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, StatusBar } from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { Dropdown } from 'react-native-element-dropdown';

const data = [
    { label : "Daily", value: "1" },
    { label : "Weekly", value: "2" },
    { label : "Monthly", value: "3" },
    { label : "Yearly", value: "4" },
]

export default function App() {
    const [graphPeriod, setGraphPeriod] = useState("1");
    const [menuPeriod, setMenuPeriod] = useState("1");

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <MaterialCommunityIcons name="human-male-board" size={32} color="black" />
          <Text style={styles.headerTitle}>Papper</Text>
        </View>
        <TouchableOpacity>
          <Ionicons name="person-circle" size={40} color="#2D2D2D" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Card 1: Total Sales Graph */}
        <View style={styles.cardContainer}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.pillContainer}>
              <Dropdown 
                style={{ marginLeft: 10, width: 100, height: 24, backgroundColor: 'E6D9FA' }}
                data={data}
                labelField="label"
                valueField="value"
                placeholder="Select"
                value="1"
                containerStyle={{ backgroundColor: 'E6D9FA' }}
                selectedTextStyle={{ color: '#333', fontSize: 13 }}
                placeholderStyle={{ color: '#333', fontSize: 13 }}
                activeColor="E6D9FA"
                dropdownPosition="bottom"
                onChange={item => {
                    setGraphPeriod(item.value);
                }}
              />
            </View>
            <Text style={styles.cardTitle}>Total Sales Graph</Text>
          </View>

          <View style={styles.cyanBox}>
            {/* Date Controls */}
            <View style={styles.dateControlRow}>
              <TouchableOpacity>
                <Ionicons name="arrow-back" size={20} color="#333" />
              </TouchableOpacity>
              <View style={styles.datePill}>
                <Text style={styles.dateText}>Current Date</Text>
              </View>
              <TouchableOpacity>
                <Ionicons name="arrow-forward" size={20} color="#333" />
              </TouchableOpacity>
            </View>

            {/* Spacer for where the graph would be */}
            <View style={{ flex: 1 }} />

            {/* Total Sales Pill */}
            <View style={styles.totalSalesPill}>
              <Text style={styles.totalSalesText}>Total Sales : Rp20.000.000</Text>
            </View>
          </View>
        </View>

        {/* Card 2: Top Selling Menu */}
        <View style={styles.cardContainer}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.pillContainer}>
              <Dropdown 
                style={{ marginLeft: 10, width: 100, height: 24, backgroundColor: 'E6D9FA' }}
                data={data}
                labelField="label"
                valueField="value"
                placeholder="Select"
                value="1"
                containerStyle={{ backgroundColor: 'E6D9FA' }}
                selectedTextStyle={{ color: '#333', fontSize: 13 }}
                placeholderStyle={{ color: '#333', fontSize: 13 }}
                activeColor="E6D9FA"
                dropdownPosition="bottom"
                onChange={item => {
                    setMenuPeriod(item.value);
                }}
              />
            </View>
            <Text style={styles.cardTitle}>Top Selling Menu</Text>
          </View>

          <View style={[styles.cyanBox, styles.menuListContainer]}>
            <MenuItem name="Ayam Goreng" count="23 pcs" />
            <MenuItem name="Chicken Rice" count="22 pcs" />
            <MenuItem name="Laksa Mana" count="21 pcs" />
            <MenuItem name="Rendang" count="20 pcs" />
            <MenuItem name="Gulai Ayam" count="19 pcs" />
          </View>
        </View>

        {/* Bottom spacer to prevent content being hidden by nav */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItemActive}>
          <View style={styles.navIconContainerActive}>
            <Ionicons name="star" size={20} color="#333" />
          </View>
          <Text style={styles.navTextActive}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="star-outline" size={24} color="#555" />
          <Text style={styles.navText}>Orders</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="star-outline" size={24} color="#555" />
          <Text style={styles.navText}>People</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface MenuItemProps {
  name: string;
  count: string;
}

// Helper Component for List Items
const MenuItem = ({ name, count } : MenuItemProps) => (
  <View style={styles.menuItemRow}>
    <View style={styles.menuItemLeft}>
      <Ionicons name="add-circle-outline" size={24} color="#333" />
      <Text style={styles.menuItemName}>{name}</Text>
    </View>
    <Text style={styles.menuItemCount}>{count}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6', // Light grey background
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#F3F4F6',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '500',
    marginLeft: 10,
    color: '#000',
  },
  scrollContent: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  cardContainer: {
    backgroundColor: '#FAFAC8', // The light yellow card color
    borderRadius: 25,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6D9FA', // Light purple pill
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  pillIconCircle: {
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 14,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#000',
  },
  cyanBox: {
    backgroundColor: '#BCF8F2', // Cyan/Aqua inner box
    borderRadius: 20,
    padding: 20,
    minHeight: 200, // Fixed height for graph box
  },
  // Graph Card Specifics
  dateControlRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  datePill: {
    borderWidth: 1,
    borderColor: '#A0DED8',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginHorizontal: 15,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dateText: {
    fontSize: 13,
    color: '#333',
  },
  totalSalesPill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderWidth: 1,
    borderColor: '#A0DED8',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 'auto', // Pushes to bottom
  },
  totalSalesText: {
    fontWeight: '500',
    fontSize: 14,
  },
  // Menu List Specifics
  menuListContainer: {
    justifyContent: 'center',
    paddingVertical: 10,
  },
  menuItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0, // No dividers in image
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemName: {
    marginLeft: 15,
    fontSize: 16,
    color: '#111',
    fontWeight: '400',
  },
  menuItemCount: {
    fontSize: 14,
    color: '#444',
  },
  // Bottom Navigation
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 15,
    paddingBottom: 25, // For iPhone home bar area
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 10,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6D9FA',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  navIconContainerActive: {
    marginRight: 8,
  },
  navTextActive: {
    fontWeight: '600',
    color: '#333',
  },
  navText: {
    fontSize: 12,
    marginTop: 4,
    color: '#555',
  },
});