/**
 * 새 기능 안내. 계정마다 최신 안내를 한 번만 띄운다.
 *
 * 사용처: 탭 레이아웃(로그인·온보딩을 마친 뒤의 모든 화면). 내용은 @leave/shared의
 * LATEST_WHATS_NEW, "봤다"는 기록은 서버 계정에 남아 웹에서 본 안내는 다시 뜨지 않는다.
 * 버튼으로 닫든 시트를 내려 닫든 본 것으로 친다.
 *
 * 기능마다 한 장씩 넘긴다. 그림은 온보딩 사용법 투어의 무대(TourStage)가 그대로
 * 그리고, 아래 글은 그림이 해 보이는 동작을 한두 문장으로 말한다.
 */

import { useMe } from "@leave/client/hooks/auth";
import { useMarkWhatsNewSeen } from "@leave/client/hooks/users";
import { LATEST_WHATS_NEW, shouldShowWhatsNew } from "@leave/shared/whats-new";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { FormSheet } from "@/components/form-sheet";
import { TourStage } from "@/screens/onboarding/tour-stage";
import { makeStyles, spacing } from "@/theme";

export function WhatsNewSheet() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const markSeen = useMarkWhatsNewSeen();
  const [index, setIndex] = useState(0);
  const user = me.data?.user;
  const visible = Boolean(user) && shouldShowWhatsNew(user?.seenWhatsNewId);

  const { scenes } = LATEST_WHATS_NEW;
  const last = scenes.length - 1;
  const scene = scenes[Math.min(index, last)];
  const go = (next: number) => setIndex(Math.min(Math.max(next, 0), last));
  const close = () => {
    if (!markSeen.isPending) markSeen.mutate(LATEST_WHATS_NEW.id);
  };

  return (
    <FormSheet isPresented={visible} onDismiss={close}>
      {/* RN Modal은 앱 루트 밖에 뜬다. 무대의 쓸기 제스처가 안드로이드에서도
          잡히려면 시트 안에 제스처 루트가 따로 있어야 한다. */}
      <GestureHandlerRootView style={styles.gestureRoot}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
        >
          <Text style={styles.title} accessibilityRole="header">
            {LATEST_WHATS_NEW.title}
          </Text>
          {scene ? (
            <>
              <TourStage
                scene={scene}
                onSwipe={(direction) => go(index + direction)}
              />
              <View style={styles.copy} accessibilityLiveRegion="polite">
                <Text style={styles.count}>
                  {index + 1} / {scenes.length} · {scene.label}
                </Text>
                <Text style={styles.sceneTitle} accessibilityRole="header">
                  {scene.title}
                </Text>
                <Text style={styles.body}>{scene.body}</Text>
              </View>
            </>
          ) : null}
          <View style={styles.actions}>
            {index > 0 ? (
              <Button
                title="이전"
                variant="secondary"
                onPress={() => go(index - 1)}
              />
            ) : null}
            <Button
              title={index < last ? "다음" : "확인했어요"}
              flexible
              style={styles.next}
              onPress={() => (index < last ? go(index + 1) : close())}
            />
          </View>
        </ScrollView>
      </GestureHandlerRootView>
    </FormSheet>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  gestureRoot: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: 26, fontWeight: "800", color: colors.ink },
  copy: { gap: spacing.xs },
  count: { fontSize: 13, fontWeight: "700", color: colors.mute },
  sceneTitle: { fontSize: 19, fontWeight: "800", color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.body },
  actions: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  next: { flex: 1 },
}));
