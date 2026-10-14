/**
 * 새 기능 안내. 계정마다 최신 안내를 한 번만 띄운다.
 *
 * 사용처: 탭 레이아웃(로그인·온보딩을 마친 뒤의 모든 화면). 내용은 @leave/shared의
 * LATEST_WHATS_NEW, "봤다"는 기록은 서버 계정에 남아 웹에서 본 안내는 다시 뜨지 않는다.
 * 버튼으로 닫든 시트를 내려 닫든 본 것으로 친다.
 */

import { useMe } from "@leave/client/hooks/auth";
import { useMarkWhatsNewSeen } from "@leave/client/hooks/users";
import { LATEST_WHATS_NEW, shouldShowWhatsNew } from "@leave/shared/whats-new";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { FormSheet } from "@/components/form-sheet";
import { makeStyles, radius, spacing } from "@/theme";

export function WhatsNewSheet() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const markSeen = useMarkWhatsNewSeen();
  const user = me.data?.user;
  const visible = Boolean(user) && shouldShowWhatsNew(user?.seenWhatsNewId);

  const close = () => {
    if (!markSeen.isPending) markSeen.mutate(LATEST_WHATS_NEW.id);
  };

  return (
    <FormSheet isPresented={visible} onDismiss={close}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <Text style={styles.title} accessibilityRole="header">
          {LATEST_WHATS_NEW.title}
        </Text>
        <Text style={styles.body}>{LATEST_WHATS_NEW.intro}</Text>
        {LATEST_WHATS_NEW.features.map((feature, index) => (
          <View key={feature.title} style={styles.card}>
            <Text style={styles.cardTitle} accessibilityRole="header">
              {index + 1}. {feature.title}
            </Text>
            <Text style={styles.body}>{feature.pitch}</Text>
            {feature.steps.map((step, stepIndex) => (
              <Text key={step} style={styles.step}>
                {stepIndex + 1}) {step}
              </Text>
            ))}
          </View>
        ))}
        <Button title="확인했어요" onPress={close} />
      </ScrollView>
    </FormSheet>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  content: { padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: 26, fontWeight: "800", color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.body },
  card: {
    backgroundColor: colors.primaryPale,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: colors.ink },
  step: { fontSize: 15, lineHeight: 22, color: colors.ink },
}));
