/**
 * 1회성 사용자 이름 설정 (네이티브) — 0023 이전에 가입한 계정만 보는 화면.
 *
 * 사용처: `app/username-setup.tsx`. 루트 레이아웃의 Stack.Protected가
 * "온보딩은 마쳤는데 공개 이름이 없는" 상태에서만 이 화면을 띄운다.
 *
 * 서버가 이름을 대신 지어 주지 않기 때문에 이 화면이 필요하다 — 이메일·별칭에서
 * 뽑으면 비공개 정보가 공개 식별자가 된다(migrations/0023 주석).
 * 건너뛰기를 두지 않은 이유는 웹의 같은 화면 주석에 있다.
 */

import { useSetUsername } from "@leave/client";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, Text, View } from "react-native";
import { KEYBOARD_AVOID_BEHAVIOR } from "@/components/keyboard-avoid";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { UsernameField, useUsernameDraft } from "@/components/username-field";
import { makeStyles, spacing } from "@/theme";

export function UsernameSetupScreen() {
  const styles = useStyles();
  const draft = useUsernameDraft();
  const setUsername = useSetUsername();
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!draft.valid) return;
    setError(null);
    try {
      await setUsername.mutateAsync({ username: draft.username });
      // 성공하면 온보딩 상태가 무효화되고 루트 레이아웃이 스스로 탭으로 넘어간다.
      // 여기서 직접 이동하지 않는 이유: 딥링크로 들어온 사람은 원래 가려던
      // 프로필로 돌아가야 하고, 그 복원은 루트 레이아웃이 맡는다.
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "저장하지 못했습니다",
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={KEYBOARD_AVOID_BEHAVIOR}
      style={styles.flex}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            사용자 이름을 정해주세요
          </Text>
          <Text style={styles.lead}>
            친구가 나를 찾는 공개 이름이에요. 실명·군번·부대명은 쓰지 마세요.
          </Text>
        </View>
        <ContentPanel style={styles.card}>
          <UsernameField
            draft={draft}
            serverError={error}
            autoFocus
            onSubmit={() => void submit()}
            testID="username-setup-input"
          />
          <Button
            title="이 이름으로 시작하기"
            disabled={!draft.valid}
            loading={setUsername.isPending}
            onPress={() => void submit()}
            testID="username-setup-submit"
          />
        </ContentPanel>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
    gap: spacing.lg,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  header: { gap: spacing.sm },
  title: {
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.7,
    color: colors.ink,
  },
  lead: { fontSize: 16, lineHeight: 24, color: colors.body },
  card: { padding: spacing.lg, gap: spacing.lg },
}));
