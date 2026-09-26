/**
 * 친구 탭의 첫 화면 — 친구 목록.
 *
 * 사용처: 친구 탭(app/(tabs)/(friends)/index.tsx).
 *
 * 이 화면이 하는 일은 두 가지다. 이미 맺은 친구 중에서 달력을 함께 볼 사람을
 * 고르는 것, 그리고 받은 요청에 답하는 것. 둘 다 "지금 여기 있는 사람"에 대한
 * 일이다. 반대로 새 친구를 찾는 일은 이름을 입력하고 결과를 훑는 별개의 흐름이라
 * 화면을 나눴다(friend-search.tsx). 목록이 늘어날수록 매번 입력칸을 지나쳐
 * 스크롤해야 하는 값이 커지기 때문이다.
 *
 * 카드마다 전역·다음 휴가 D-day를 보여준다. 친구 목록을 여는 이유가 대개 "이 친구
 * 언제 나오지"이기 때문이다. 이름을 누르면 프로필로 가고, 친구 삭제는 거기서 한다 —
 * 자주 하지 않고 되돌릴 수 없는 일이라 목록마다 빨간 버튼을 두면 잘못 누르기 쉽다.
 *
 * 내가 친구에게 보여줄 항목은 툴바의 "공유 설정"이 여는 화면에서 고른다
 * (friend-sharing.tsx). 한 번 정하면 잘 바꾸지 않는 값이라 목록 사이에 두지 않았다.
 */

import {
  formatUsername,
  MAX_FRIEND_CALENDAR_SELECTION,
  todayInSeoul,
} from "@leave/shared";
import {
  friendDischargeDday,
  friendNextLeaveDday,
  useAcceptFriendRequest,
  useDeclineFriendRequest,
  useFriends,
  useIncomingFriendRequests,
  useMe,
  useOutgoingFriendRequests,
  type Friend,
} from "@leave/client";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { sideColumnWidth, useWindowSizeClass } from "@/adaptive";
import { FriendServiceProgress } from "@/components/friend-service-progress";
import { useActiveGate, useServiceTicker } from "@/lib/service-progress-clock";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { WebScreenActions } from "@/components/web-screen-actions";
import { useRefresh } from "@/lib/use-refresh";
import { layout, makeStyles, radius, spacing, useColors } from "@/theme";

export function FriendsScreen() {
  const styles = useStyles();
  const active = useActiveGate();
  const now = useServiceTicker(active);
  const { isCompact, sizeClass } = useWindowSizeClass();
  const colors = useColors();
  const router = useRouter();
  const me = useMe();
  const friends = useFriends();
  const incoming = useIncomingFriendRequests();
  const outgoing = useOutgoingFriendRequests();
  const refresh = useRefresh(friends, incoming, outgoing);
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pending = accept.isPending || decline.isPending;
  const today = todayInSeoul(new Date(now));
  const outgoingCount = outgoing.data?.requests.length ?? 0;
  const run = async (promise: Promise<unknown>) => {
    try {
      await promise;
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "요청을 처리하지 못했어요",
      );
    }
  };
  const openAdd = () => router.push("/(tabs)/(friends)/add");
  const openSharing = () => router.push("/(tabs)/(friends)/sharing");
  const openProfile = (username: string | null) => {
    if (!username) return;
    router.push({ pathname: "/u/[username]", params: { username } });
  };
  /**
   * 내 공개 프로필 — 친구 목록의 이름을 누를 때와 **같은 화면**으로 간다.
   * 프로필 탭은 내 계정 설정이고, 여기서 보고 싶은 것은 "친구에게 이렇게 보인다"
   * 쪽이다. 그 화면이 링크 공유까지 들고 있어 @아이디를 건네는 자리이기도 하다.
   *
   * 이름이 없으면 열 주소가 없다. 탭에 들어온 이상 이름은 이미 있지만
   * (루트 레이아웃의 hasUsername 관문), 아직 `me`를 받지 못한 첫 프레임에는
   * 비어 있다 — 그동안은 버튼을 감춘다.
   */
  const myUsername = me.data?.user.username ?? null;
  const openMyProfile = () => openProfile(myUsername);
  const compare = () =>
    router.push({
      pathname: "/(tabs)/(calendar)/friend-calendar",
      params: { friendIds: selected.join(",") },
    });

  const outgoingPanel = (
    <>
      {outgoingCount > 0 ? (
        <ContentPanel style={styles.card}>
          <Text style={styles.heading}>보낸 요청 {outgoingCount}건</Text>
          <Text style={styles.caption}>
            상대가 수락하면 내 친구 목록에 들어와요.
          </Text>
          <Button
            icon="users"
            title="보낸 요청 보기"
            variant="secondary"
            onPress={openAdd}
            testID="friends-open-outgoing"
          />
        </ContentPanel>
      ) : null}
    </>
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, !isCompact && styles.wideContent]}
      refreshControl={
        <RefreshControl
          refreshing={refresh.refreshing}
          onRefresh={refresh.onRefresh}
          tintColor={colors.mute}
        />
      }
    >
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="person.crop.circle"
          hidden={!myUsername}
          onPress={openMyProfile}
        >
          내 프로필
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Button icon="eye" onPress={openSharing}>
          공유 설정
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Button
          icon="person.badge.plus"
          variant="prominent"
          tintColor={colors.brand}
          onPress={openAdd}
        >
          친구 찾기
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      {process.env.EXPO_OS === "web" ? (
        <Text style={styles.title}>친구</Text>
      ) : null}
      <WebScreenActions
        actions={[
          {
            id: "my-profile",
            icon: "users" as const,
            title: "내 프로필",
            onPress: openMyProfile,
            disabled: !myUsername,
            testID: "friends-open-my-profile",
          },
          {
            id: "sharing",
            icon: "settings" as const,
            title: "공유 설정",
            onPress: openSharing,
            testID: "friends-open-sharing",
          },
          {
            id: "add-friend",
            icon: "userAdd" as const,
            title: "친구 찾기",
            variant: "primary",
            onPress: openAdd,
            testID: "friends-open-add",
          },
        ]}
      />
      {error ? (
        <ContentPanel tone="danger" style={styles.card}>
          <Text style={styles.error}>{error}</Text>
        </ContentPanel>
      ) : null}
      <View style={[styles.workspace, !isCompact && styles.workspaceWide]}>
        <View
          style={[
            styles.sidebar,
            isCompact && !incoming.data?.requests.length && { display: "none" },
            !isCompact && { width: sideColumnWidth(sizeClass) },
          ]}
        >
          {!isCompact && (
            <ContentPanel style={styles.card}>
              <Text style={styles.heading}>함께 보는 휴가</Text>
              <Text style={styles.body}>
                친구를 선택하면 최대 10명의 휴가를 달력에서 비교할 수 있어요.
              </Text>
              <Button icon="userAdd" title="친구 찾기" onPress={openAdd} />
              <Text style={styles.caption}>
                받은 요청 {incoming.data?.requests.length ?? 0}건 · 보낸 요청{" "}
                {outgoingCount}건
              </Text>
            </ContentPanel>
          )}
          {(incoming.data?.requests.length ?? 0) > 0 ? (
            <ContentPanel style={styles.card}>
              <Text style={styles.heading}>받은 요청</Text>
              {incoming.data!.requests.map((request) => (
                <View key={request.userId} style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${request.name} 프로필 열기`}
                    disabled={!request.username}
                    onPress={() => openProfile(request.username)}
                    style={styles.who}
                  >
                    <Text style={styles.name}>{request.name}</Text>
                    {request.username ? (
                      <Text style={styles.caption}>
                        {formatUsername(request.username)}
                      </Text>
                    ) : null}
                  </Pressable>
                  <View style={styles.actions}>
                    <Button
                      icon="check"
                      title="수락"
                      size="sm"
                      disabled={pending}
                      onPress={() =>
                        void run(accept.mutateAsync(request.userId))
                      }
                    />
                    <Button
                      icon="close"
                      title="거절"
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onPress={() =>
                        void run(decline.mutateAsync(request.userId))
                      }
                    />
                  </View>
                </View>
              ))}
            </ContentPanel>
          ) : null}
          {!isCompact && outgoingPanel}
        </View>
        <View style={styles.friendList}>
          <ContentPanel style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.heading}>
                내 친구{friends.data ? ` ${friends.data.friends.length}명` : ""}
              </Text>
              <Text accessibilityLiveRegion="polite" style={styles.count}>
                {selected.length} / {MAX_FRIEND_CALENDAR_SELECTION} 선택
              </Text>
            </View>
            {friends.data?.friends.length ? (
              <Button
                icon="calendar"
                title="선택한 친구와 달력 보기"
                disabled={selected.length === 0}
                onPress={compare}
                testID="friends-compare-calendar"
              />
            ) : null}
            {friends.isPending ? (
              <ActivityIndicator color={colors.ink} />
            ) : friends.data?.friends.length ? (
              friends.data.friends.map((friend) => {
                const checked = selected.includes(friend.userId);
                const disabled =
                  selected.length >= MAX_FRIEND_CALENDAR_SELECTION && !checked;
                return (
                  <View
                    key={friend.userId}
                    style={[
                      styles.friend,
                      checked && styles.friendSelected,
                      disabled && styles.disabled,
                    ]}
                  >
                    <View style={styles.friendHeader}>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked, disabled }}
                        accessibilityLabel={`${friend.name} 달력 비교 선택`}
                        disabled={disabled}
                        onPress={() =>
                          setSelected((current) =>
                            checked
                              ? current.filter((id) => id !== friend.userId)
                              : [...current, friend.userId],
                          )
                        }
                        hitSlop={8}
                        style={[
                          styles.checkbox,
                          checked && styles.checkboxChecked,
                        ]}
                      >
                        <Text style={styles.checkmark}>
                          {checked ? "✓" : ""}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${friend.name} 프로필 열기`}
                        disabled={!friend.username}
                        onPress={() => openProfile(friend.username)}
                        style={({ pressed }) => [
                          styles.friendMain,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Avatar name={friend.name} size={36} />
                        <View style={styles.who}>
                          <Text style={styles.name}>{friend.name}</Text>
                          {friend.username ? (
                            <Text style={styles.caption}>
                              {formatUsername(friend.username)}
                            </Text>
                          ) : null}
                        </View>
                        {friend.username ? (
                          <Text style={styles.chevron} aria-hidden>
                            ›
                          </Text>
                        ) : null}
                      </Pressable>
                    </View>
                    <FriendDdays friend={friend} today={today} />
                    <FriendServiceProgress
                      friend={friend}
                      active={active}
                      now={now}
                    />
                  </View>
                );
              })
            ) : (
              <View style={styles.empty}>
                <Text style={styles.body}>
                  아직 친구가 없어요. @아이디로 찾아 요청을 보내고, 상대가
                  수락하면 여기에서 달력을 함께 볼 수 있어요.
                </Text>
                <Button
                  icon="userAdd"
                  title="친구 추가"
                  onPress={openAdd}
                  testID="friends-empty-add"
                />
              </View>
            )}
            {selected.length >= MAX_FRIEND_CALENDAR_SELECTION ? (
              <Text style={styles.caption}>
                한 번에 최대 {MAX_FRIEND_CALENDAR_SELECTION}명까지 비교할 수
                있어요.
              </Text>
            ) : null}
          </ContentPanel>
        </View>
      </View>
      {isCompact && outgoingPanel}
    </ScrollView>
  );
}

/**
 * 전역·다음 휴가 D-day 두 칸. 문구와 비공개·없음의 구분은 `@leave/client`가
 * 정한다 — 웹 친구 화면과 같은 말을 해야 한다.
 */
function FriendDdays({ friend, today }: { friend: Friend; today: string }) {
  const styles = useStyles();
  const items = [
    ["discharge", friendDischargeDday(friend, today)],
    ["leave", friendNextLeaveDday(friend, today)],
  ] as const;
  return (
    <View style={styles.ddays}>
      {items.map(([key, item]) => (
        <View
          key={key}
          style={styles.dday}
          accessible
          accessibilityLabel={`${friend.name} ${item.spoken}`}
          testID={`friend-dday-${key}`}
        >
          <Text style={styles.ddayLabel}>{item.label}</Text>
          <Text
            style={[styles.ddayValue, item.muted && styles.ddayMuted]}
            numberOfLines={1}
          >
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
    gap: spacing.lg,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  wideContent: { maxWidth: layout.workspaceContent },
  workspace: { gap: spacing.lg },
  workspaceWide: { flexDirection: "row", alignItems: "flex-start" },
  sidebar: { gap: spacing.lg },
  friendList: { flex: 1, minWidth: 0 },
  title: { fontSize: 32, fontWeight: "900", color: colors.ink },
  card: { padding: spacing.lg, gap: spacing.lg },
  heading: { flex: 1, fontSize: 20, fontWeight: "800", color: colors.ink },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  who: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: "700", color: colors.ink },
  friendMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
  },
  body: { color: colors.body, lineHeight: 21 },
  caption: { fontSize: 12, color: colors.mute },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
  count: { fontSize: 13, fontWeight: "700", color: colors.brand },
  empty: { gap: spacing.md },
  friendHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  friend: {
    minHeight: 56,
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  friendSelected: {
    backgroundColor: colors.primaryPale,
    borderColor: colors.brand,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkmark: { color: colors.onBrand, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.98 }] },
  chevron: { fontSize: 22, color: colors.mute },
  ddays: { flexDirection: "row", gap: spacing.sm },
  dday: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceCard,
  },
  ddayLabel: { fontSize: 12, fontWeight: "600", color: colors.mute },
  ddayValue: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  ddayMuted: { fontSize: 15, color: colors.mute },
}));
