import { Tabs } from 'expo-router/js-tabs';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { GearIcon, HomeIcon, ListIcon } from '../../components/icons';
import { colors, fonts } from '../../components/ui';

/** Icon with a honey pill behind it when its tab is selected. */
function TabIcon({ focused, children }: { focused: boolean; children: ReactNode }) {
  return (
    <View
      style={{
        width: 52,
        height: 32,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? '#FFE7AE' : 'transparent',
      }}
    >
      {children}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, borderTopWidth: 2, height: 76, paddingTop: 8 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <HomeIcon color={focused ? colors.text : colors.muted} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <ListIcon color={focused ? colors.text : colors.muted} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <GearIcon color={focused ? colors.text : colors.muted} />
            </TabIcon>
          ),
        }}
      />
    </Tabs>
  );
}
