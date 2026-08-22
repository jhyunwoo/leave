/**
 * 하단 탭 구성 — 달력·내 휴가·알림·프로필.
 * 알림 탭에는 안 읽은 개수를 배지로 붙인다.
 */

import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useNotifications } from "@leave/client";
import { useColors } from "@/theme";

/**
 * 네이티브 시스템 탭바 — 플랫폼 관례를 유지하고 선택 상태만 딥 그린으로 통일한다.
 *
 * iPad에서는 `sidebarAdaptable`로 UIKit의 사이드바 적응 모드를 켠다. 탭을
 * 흉내 낸 자체 내비게이션을 만들지 않고 시스템에 맡기는 방법이라, 사이드바 ↔
 * 탭바 전환·Split View·Stage Manager를 OS가 알아서 처리한다. iPhone에는 효과가
 * 없고(문서), 안드로이드·웹에는 아예 내려가지 않는다. iOS 18 미만에서는
 * react-native-screens가 `@available` 검사로 걸러 경고만 남기고 무시한다.
 */
export default function TabLayout() {
  const colors = useColors();
  const notifications = useNotifications();
  const unread = notifications.data?.unreadCount ?? 0;

  return (
    <NativeTabs
      tintColor={colors.brand}
      // iOS 26의 탭바 축소를 끈다. 스크롤할 때 탭바가 왼쪽 알약으로 접히면
      // 탭 이름이 사라져 지금 어디에 있는지, 어디로 갈 수 있는지가 함께 사라진다.
      // 달력·목록처럼 계속 스크롤하는 화면이 대부분이라 접힌 상태가 기본이 된다.
      minimizeBehavior={process.env.EXPO_OS === "ios" ? "never" : undefined}
      sidebarAdaptable={process.env.EXPO_OS === "ios" ? true : undefined}
    >
      <NativeTabs.Trigger name="(calendar)">
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

      <NativeTabs.Trigger name="(friends)">
        <NativeTabs.Trigger.Label>친구</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person.2", selected: "person.2.fill" }}
          md="group"
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
