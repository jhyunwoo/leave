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
 * 이름을 누르면 프로필로 간다. 삭제·비교는 목록에 남긴다 — 이미 친구인 사람에게
 * 자주 하는 일이라 한 번 더 들어갔다 나오게 할 이유가 없다.
 */

import { formatUsername, MAX_FRIEND_CALENDAR_SELECTION } from "@leave/shared";
import {
  useAcceptFriendRequest,
  useDeclineFriendRequest,
  useFriends,
  useIncomingFriendRequests,
  useOutgoingFriendRequests,
  useRemoveFriend,
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
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { WebScreenActions } from "@/components/web-screen-actions";
import { confirmAction } from "@/lib/dialog";
import { useRefresh } from "@/lib/use-refresh";
import { makeStyles, radius, spacing, useColors } from "@/theme";

export function FriendsScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const friends = useFriends();
  const incoming = useIncomingFriendRequests();
  const outgoing = useOutgoingFriendRequests();
  const refresh = useRefresh(friends, incoming, outgoing);
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const remove = useRemoveFriend();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pending = accept.isPending || decline.isPending || remove.isPending;
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
  const openProfile = (username: string | null) => {
    if (!username) return;
    router.push({ pathname: "/u/[username]", params: { username } });
  };
  const compare = () =>
    router.push({
      pathname: "/(tabs)/(calendar)/friend-calendar",
      params: { friendIds: selected.join(",") },
    });
  const removeFriend = async (userId: string, name: string) => {
    const confirmed = await confirmAction({
      title: "친구 삭제",
      message: `${name}님을 친구에서 삭제할까요?`,
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!confirmed) return;
    await run(remove.mutateAsync(userId));
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
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
            id: "add-friend",
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
                  title="수락"
                  size="sm"
                  disabled={pending}
                  onPress={() => void run(accept.mutateAsync(request.userId))}
                />
                <Button
                  title="거절"
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onPress={() => void run(decline.mutateAsync(request.userId))}
                />
              </View>
            </View>
          ))}
        </ContentPanel>
      ) : null}
      <ContentPanel style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.heading}>내 친구</Text>
          <Text accessibilityLiveRegion="polite" style={styles.count}>
            {selected.length} / {MAX_FRIEND_CALENDAR_SELECTION} 선택
          </Text>
        </View>
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
                  style={[styles.checkbox, checked && styles.checkboxChecked]}
                >
                  <Text style={styles.checkmark}>{checked ? "✓" : ""}</Text>
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
                </Pressable>
                <Button
                  title="삭제"
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onPress={() => void removeFriend(friend.userId, friend.name)}
                />
              </View>
            );
          })
        ) : (
          <View style={styles.empty}>
            <Text style={styles.body}>
              아직 친구가 없어요. @아이디로 찾아 요청을 보내고, 상대가 수락하면
              여기에서 달력을 함께 볼 수 있어요.
            </Text>
            <Button
              title="친구 추가"
              onPress={openAdd}
              testID="friends-empty-add"
            />
          </View>
        )}
        {selected.length >= MAX_FRIEND_CALENDAR_SELECTION ? (
          <Text style={styles.caption}>
            한 번에 최대 {MAX_FRIEND_CALENDAR_SELECTION}명까지 비교할 수 있어요.
          </Text>
        ) : null}
        {friends.data?.friends.length ? (
          <Button
            title="선택한 친구와 달력 보기"
            disabled={selected.length === 0}
            onPress={compare}
            testID="friends-compare-calendar"
          />
        ) : null}
      </ContentPanel>
      {outgoingCount > 0 ? (
        <ContentPanel style={styles.card}>
          <Text style={styles.heading}>보낸 요청 {outgoingCount}건</Text>
          <Text style={styles.caption}>
            상대가 수락하면 내 친구 목록에 들어와요.
          </Text>
          <Button
            title="보낸 요청 보기"
            variant="secondary"
            onPress={openAdd}
            testID="friends-open-outgoing"
          />
        </ContentPanel>
      ) : null}
    </ScrollView>
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
  friend: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
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
}));
