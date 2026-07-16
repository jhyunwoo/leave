import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useNotifications } from "@/api/queries";
import { colors } from "@/theme";

/**
 * 네이티브 시스템 탭바 — iOS 26에서는 Liquid Glass(글래스모피즘)가
 * 자동 적용되고, Android는 머티리얼 탭바로 렌더링된다.
 */
export default function TabLayout() {
  const notifications = useNotifications();
  const unread = notifications.data?.unreadCount ?? 0;

  return (
    <NativeTabs tintColor={colors.inkDeep}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>달력</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "calendar", selected: "calendar" }}
          md="calendar_month"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="leaves">
        <NativeTabs.Trigger.Label>내 휴가</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "airplane", selected: "airplane" }}
          md="luggage"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="notifications">
        <NativeTabs.Trigger.Label>알림</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "bell", selected: "bell.fill" }}
          md="notifications"
        />
        {unread > 0 && (
          <NativeTabs.Trigger.Badge>
            {unread > 99 ? "99+" : String(unread)}
          </NativeTabs.Trigger.Badge>
        )}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>프로필</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person", selected: "person.fill" }}
          md="person"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
