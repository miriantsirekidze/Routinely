import { Tabs } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { colors, typography } from "../../src/constants/theme";
import {
  TodayIcon,
  HistoryIcon,
  ScheduleIcon,
  SettingsIcon,
  JournalIcon,
} from "../../src/components/TabIcon";

function TabBarButton(props: any) {
  return (
    <Pressable
      {...props}
      android_ripple={null}
      style={props.style}
    />
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.neutralDarkLightest,
        tabBarLabelStyle: styles.tabLabel,
        tabBarButton: (props) => <TabBarButton {...props} />,
        lazy: false,
        animation: "shift",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarIcon: ({ color }) => <TodayIcon color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color }) => <HistoryIcon color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="templates"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: "Journal",
          tabBarIcon: ({ color }) => <JournalIcon color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Plan",
          tabBarIcon: ({ color }) => <ScheduleIcon color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <SettingsIcon color={color as string} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.white,
    borderTopColor: colors.neutralLight,
    borderTopWidth: 1,
    height: 72,
    paddingBottom: 12,
    paddingTop: 8,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabLabel: {
    ...typography.actionS,
    marginTop: 2,
  },
});
