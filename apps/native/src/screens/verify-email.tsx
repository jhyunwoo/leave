import { Alert, KeyboardAvoidingView, ScrollView, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useDeleteAccount,
  useEmailVerification,
  useLogout,
  useOnboardingStatus,
} from "@leave/client";
import { KEYBOARD_AVOID_BEHAVIOR } from "@/components/keyboard-avoid";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { Field, Input } from "@/components/field";
import { makeStyles, spacing } from "@/theme";

export default function VerifyEmailScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const onboarding = useOnboardingStatus();
  const form = useEmailVerification();
  const logout = useLogout();
  const deleteAccount = useDeleteAccount();
  return (
    <KeyboardAvoidingView
      behavior={KEYBOARD_AVOID_BEHAVIOR}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.xxxl,
            paddingBottom: insets.bottom + spacing.xl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <ContentPanel style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>
            이메일 인증
          </Text>
          <Text style={styles.body}>
            {onboarding.data?.email} 주소로 인증 코드를 받아주세요. 인증을
            마치면 리브를 시작할 수 있어요.
          </Text>
          <Button
            title={
              form.remaining > 0
                ? `${form.remaining}초 후 재발송 가능`
                : form.sent
                  ? "인증 코드 다시 보내기"
                  : "인증 코드 보내기"
            }
            variant="secondary"
            disabled={form.busy || form.remaining > 0}
            onPress={() => void form.send()}
            testID="email-send"
          />
          {form.message && (
            <Text accessibilityLiveRegion="polite" style={styles.body}>
              {form.message}
            </Text>
          )}
          <Field label="인증 코드" hint="메일에 적힌 숫자 6자리를 입력해주세요">
            <Input
              value={form.code}
              onChangeText={form.setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              placeholder="000000"
              accessibilityLabel="인증 코드"
              testID="email-code"
            />
          </Field>
          {form.error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {form.error}
            </Text>
          )}
          <Button
            title="인증 완료"
            disabled={!form.canVerify}
            onPress={() => void form.verify()}
            testID="email-verify"
          />
          <Button
            title="로그아웃"
            variant="secondary"
            loading={logout.isPending}
            onPress={() => logout.mutate()}
          />
          <Text style={styles.body}>
            이메일을 잘못 입력했다면 계정을 삭제한 뒤 다시 가입할 수 있어요.
          </Text>
          <Button
            title="계정 삭제 후 다시 가입"
            variant="danger"
            disabled={form.busy}
            loading={deleteAccount.isPending}
            onPress={() =>
              Alert.alert(
                "계정을 삭제할까요?",
                "삭제한 계정은 복구할 수 없어요. 다시 가입할 때 이메일을 확인해주세요.",
                [
                  { text: "취소", style: "cancel" },
                  {
                    text: "삭제",
                    style: "destructive",
                    onPress: () => deleteAccount.mutate(),
                  },
                ],
              )
            }
          />
          {deleteAccount.error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {deleteAccount.error.message}
            </Text>
          )}
        </ContentPanel>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.xl, flexGrow: 1, justifyContent: "center" },
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
  },
  title: { fontSize: 24, fontWeight: "900", color: colors.ink },
  body: { fontSize: 15, color: colors.body, lineHeight: 23 },
  error: { fontSize: 13, color: colors.negativeDeep },
}));
