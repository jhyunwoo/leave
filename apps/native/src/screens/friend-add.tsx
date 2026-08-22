/**
 * 친구 추가 화면 — 가입 이메일로 요청을 보내고, 보낸 요청을 관리한다.
 *
 * 사용처: 친구 탭의 `add` 라우트(app/(tabs)/(friends)/add.tsx).
 *
 * 목록(friends.tsx)과 나눈 이유는 그쪽 주석에 있다. 보낸 요청을 여기에 같이 둔
 * 것은, 요청을 보낸 직후 "갔다"는 확인을 같은 화면에서 받게 하려는 것이다.
 * 수락 전까지는 친구가 아니므로 목록에 낄 자리도 없다.
 */

import {
  useCancelFriendRequest,
  useOutgoingFriendRequests,
  useSendFriendRequest,
} from "@leave/client";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { Field, Input } from "@/components/field";
import { makeStyles, spacing } from "@/theme";

export function FriendAddScreen() {
  const styles = useStyles();
  const outgoing = useOutgoingFriendRequests();
  const send = useSendFriendRequest();
  const cancel = useCancelFriendRequest();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const pending = send.isPending || cancel.isPending;
  const run = async (promise: Promise<unknown>) => {
    try {
      await promise;
      setError(null);
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "요청을 처리하지 못했어요",
      );
      return false;
    }
  };
  const sendRequest = async () => {
    const target = email.trim();
    const ok = await run(send.mutateAsync({ email: target }));
    if (!ok) return;
    setEmail("");
    setSentTo(target);
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      {process.env.EXPO_OS === "web" ? (
        <Text style={styles.title}>친구 추가</Text>
      ) : null}
      <ContentPanel style={styles.card}>
        <Field
          label="정확한 가입 이메일"
          hint="공개 사용자 검색 없이 정확히 일치하는 계정에만 요청해요."
          error={error}
        >
          <Input
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setSentTo(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="friend@example.com"
            testID="friends-email-input"
          />
        </Field>
        {sentTo ? (
          <Text accessibilityLiveRegion="polite" style={styles.sent}>
            {sentTo}로 요청을 보냈어요. 상대가 수락하면 친구 목록에 들어와요.
          </Text>
        ) : null}
        <Button
          title="요청 보내기"
          loading={send.isPending}
          disabled={!email.trim()}
          onPress={() => void sendRequest()}
          testID="friends-send-request"
        />
      </ContentPanel>
      {(outgoing.data?.requests.length ?? 0) > 0 ? (
        <ContentPanel style={styles.card}>
          <Text style={styles.heading}>보낸 요청</Text>
          {outgoing.data!.requests.map((request) => (
            <View key={request.userId} style={styles.row}>
              <View style={styles.who}>
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
  heading: { fontSize: 20, fontWeight: "800", color: colors.ink },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  who: { flex: 1 },
  name: { fontSize: 16, fontWeight: "700", color: colors.ink },
  caption: { fontSize: 12, color: colors.mute },
  sent: { fontSize: 13, fontWeight: "600", color: colors.brand },
}));
