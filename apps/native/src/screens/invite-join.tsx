/**
 * 초대 링크로 들어왔을 때의 화면 — 코드를 확인하고 바로 참여시킨다.
 *
 * 사용처: `app/invite/[code].tsx`(딥링크 착지점).
 *
 * 링크를 눌러 여기까지 온 사람은 이미 "참여하겠다"고 답한 것이다. 그래서 코드를
 * 다시 입력받지 않고, 어느 그룹인지 확인만 시켜 준 뒤 한 번의 탭으로 끝낸다.
 * 자동으로 참여시키지 않는 이유는 그룹 참여가 내 휴가 일정을 그룹에 공개하는
 * 일이기 때문이다 — 링크를 잘못 눌렀을 때 되돌릴 틈이 있어야 한다.
 *
 * 인증 전에 도착한 링크는 이 화면에 닿지 못한다(`Stack.Protected`). 그 경우는
 * `lib/pending-invite-link.ts`가 담아 뒀다가 온보딩이 끝난 뒤 꺼낸다.
 */

import { useJoinUnit, useMe } from "@leave/client";
import { unitJoinSchema } from "@leave/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { layout, makeStyles, spacing } from "@/theme";

export function InviteJoinScreen() {
  const styles = useStyles();
  const router = useRouter();
  const me = useMe();
  const join = useJoinUnit();
  const { code } = useLocalSearchParams<{ code: string }>();
  const [error, setError] = useState<string | null>(null);

  const myUnit = me.data?.unit ?? null;

  const doJoin = async () => {
    setError(null);
    const parsed = unitJoinSchema.safeParse({ code: code ?? "" });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "초대코드를 확인해주세요");
      return;
    }
    try {
      await join.mutateAsync(parsed.data);
      // 참여 결과(그룹 이름·인원)는 그룹 화면이 이미 그린다. 뒤로 돌아왔을 때
      // 이 화면이 남아 있지 않도록 교체한다.
      router.replace("/units");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "그룹에 참여하지 못했어요",
      );
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <ContentPanel style={styles.card}>
        <Text style={styles.title} selectable>
          공유 그룹 초대
        </Text>
        <Text style={styles.code} selectable accessibilityLabel="초대코드">
          {code}
        </Text>

        {myUnit ? (
          <>
            {/* 한 사람은 한 그룹에만 속한다. 서버도 409로 막지만, 눌러 보고
                거절당하는 것보다 먼저 말해 주는 편이 낫다. */}
            <Text style={styles.body} selectable>
              이미 &lsquo;{myUnit.name}&rsquo; 그룹에 참여하고 있어요. 다른
              그룹에 들어가려면 먼저 지금 그룹에서 나가야 해요.
            </Text>
            <Button
              title="내 그룹 보기"
              onPress={() => router.replace("/units")}
            />
          </>
        ) : (
          <>
            <Text style={styles.body} selectable>
              참여하면 내 휴가 일정이 이 그룹의 달력에 공유돼요. 초안으로 저장한
              계획은 공유되지 않습니다.
            </Text>
            {error ? (
              <Text
                style={styles.error}
                selectable
                accessibilityLiveRegion="assertive"
              >
                {error}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <Button
                title={join.isPending ? "참여하는 중…" : "그룹 참여"}
                loading={join.isPending}
                onPress={() => void doJoin()}
                testID="invite-join-submit"
              />
              <Button
                title="나중에"
                variant="secondary"
                onPress={() => router.replace("/(tabs)/(calendar)")}
              />
            </View>
          </>
        )}
      </ContentPanel>
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    width: "100%",
    maxWidth: layout.readableContent,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.lg,
  },
  card: { padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  code: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 4,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  body: { fontSize: 13, lineHeight: 20, color: colors.body },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
  actions: { gap: spacing.sm },
}));
