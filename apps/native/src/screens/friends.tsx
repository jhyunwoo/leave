import { MAX_FRIEND_CALENDAR_SELECTION } from "@leave/shared";
import {
  useAcceptFriendRequest,
  useCancelFriendRequest,
  useDeclineFriendRequest,
  useFriends,
  useIncomingFriendRequests,
  useOutgoingFriendRequests,
  useRemoveFriend,
  useSendFriendRequest,
} from "@leave/client";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { Field, Input } from "@/components/field";
import { makeStyles, radius, spacing, useColors } from "@/theme";

export function FriendsScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const friends = useFriends();
  const incoming = useIncomingFriendRequests();
  const outgoing = useOutgoingFriendRequests();
  const send = useSendFriendRequest();
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const cancel = useCancelFriendRequest();
  const remove = useRemoveFriend();
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pending =
    send.isPending ||
    accept.isPending ||
    decline.isPending ||
    cancel.isPending ||
    remove.isPending;
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
  const compare = () =>
    router.push({
      pathname: "/(tabs)/(calendar)/friend-calendar",
      params: { friendIds: selected.join(",") },
    });
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      {process.env.EXPO_OS === "web" ? (
        <Text style={styles.title}>친구</Text>
      ) : null}
      <ContentPanel style={styles.card}>
        <Text style={styles.heading}>친구 추가</Text>
        <Field
          label="정확한 가입 이메일"
          hint="공개 사용자 검색 없이 정확히 일치하는 계정에만 요청해요."
          error={error}
        >
          <Input
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="friend@example.com"
          />
        </Field>
        <Button
          title="요청 보내기"
          loading={send.isPending}
          disabled={!email.trim()}
          onPress={() =>
            void run(send.mutateAsync({ email }).then(() => setEmail("")))
          }
          testID="friends-send-request"
        />
      </ContentPanel>
      {(incoming.data?.requests.length ?? 0) > 0 ? (
        <ContentPanel style={styles.card}>
          <Text style={styles.heading}>받은 요청</Text>
          {incoming.data!.requests.map((request) => (
            <View key={request.userId} style={styles.row}>
              <Text style={styles.name}>{request.name}</Text>
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
      {(outgoing.data?.requests.length ?? 0) > 0 ? (
        <ContentPanel style={styles.card}>
          <Text style={styles.heading}>보낸 요청</Text>
          {outgoing.data!.requests.map((request) => (
            <View key={request.userId} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{request.name}</Text>
                <Text style={styles.caption}>수락 대기</Text>
              </View>
              <Button
                title="취소"
                size="sm"
                variant="secondary"
                disabled={pending}
                onPress={() => void run(cancel.mutateAsync(request.userId))}
              />
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
            const disabled = selected.length >= 10 && !checked;
            return (
              <Pressable
                key={friend.userId}
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
                style={({ pressed }) => [
                  styles.friend,
                  checked && styles.friendSelected,
                  disabled && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <View
                  style={[styles.checkbox, checked && styles.checkboxChecked]}
                >
                  <Text style={styles.checkmark}>{checked ? "✓" : ""}</Text>
                </View>
                <Text style={styles.name}>{friend.name}</Text>
                <Button
                  title="삭제"
                  size="sm"
                  variant="danger"
                  onPress={() =>
                    Alert.alert(
                      "친구 삭제",
                      `${friend.name}님을 친구에서 삭제할까요?`,
                      [
                        { text: "취소", style: "cancel" },
                        {
                          text: "삭제",
                          style: "destructive",
                          onPress: () =>
                            void run(remove.mutateAsync(friend.userId)),
                        },
                      ],
                    )
                  }
                />
              </Pressable>
            );
          })
        ) : (
          <Text style={styles.body}>
            아직 친구가 없어요. 요청이 수락되면 여기에서 달력을 함께 볼 수
            있어요.
          </Text>
        )}
        {selected.length >= 10 ? (
          <Text style={styles.caption}>
            한 번에 최대 10명까지 비교할 수 있어요.
          </Text>
        ) : null}
        <Button
          title="선택한 친구와 달력 보기"
          disabled={selected.length === 0}
          onPress={compare}
          testID="friends-compare-calendar"
        />
      </ContentPanel>
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
  name: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.ink },
  body: { color: colors.body, lineHeight: 21 },
  caption: { fontSize: 12, color: colors.mute },
  count: { fontSize: 13, fontWeight: "700", color: colors.brand },
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
