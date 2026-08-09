/**
 * 회원가입 화면(네이티브).
 * 입대일과 군 종류를 넣으면 전역 예정일과 현재 계급이 자동 계산된다
 * (@leave/shared의 rank 규칙).
 */

import { signupSchema } from "@leave/shared";
import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSignup } from "@leave/client";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { Field, Input } from "@/components/field";
import { LegalLinks } from "@/components/legal-links";
import { NativeCheckbox } from "@/components/native-checkbox";
import { OfficialDisclaimer } from "@/components/official-disclaimer";
import { makeStyles, spacing } from "@/theme";

/**
 * 출시 전 최소수집 가입 화면.
 *
 * 현재 서버의 구버전 입력 계약에 남아 있는 군종·입대/전역일·계급에는 사용자에게서
 * 받은 값이 아니라 무의미한 고정값을 보낸다. 서버 마이그레이션 뒤에는 이 호환 필드도
 * 함께 제거한다. 따라서 앱은 군 복무 정보나 사진 권한을 사용자에게 요청하지 않는다.
 */
export function SignupScreen() {
  const styles = useStyles();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [alias, setAlias] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [notificationOptIn, setNotificationOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signup = useSignup();
  const insets = useSafeAreaInsets();

  const submit = async () => {
    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 달라요");
      return;
    }
    if (!termsAccepted || !privacyAccepted || !ageConfirmed) {
      setError("필수 동의와 만 14세 이상 확인이 필요해요");
      return;
    }

    const input = {
      email: email.trim(),
      password,
      name: alias.trim(),
      // 구 API 호환 전용 고정값: 실제 군 복무 정보를 수집하지 않는다.
      branch: "army" as const,
      enlistedAt: "2000-01-01",
      dischargeAt: "2000-01-02",
      rank: "private" as const,
      dataConsent: privacyAccepted,
    };
    const parsed = signupSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }

    setError(null);
    try {
      await signup.mutateAsync(parsed.data);
      // 알림 선택은 가입을 막거나 즉시 시스템 권한을 요청하지 않는다.
      // 로그인 후 사용자가 알림의 가치를 확인한 설정 화면에서 다시 선택한다.
      void notificationOptIn;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "가입하지 못했습니다",
      );
    }
  };

  const canSubmit =
    email.includes("@") &&
    password.length >= 8 &&
    password === passwordConfirm &&
    alias.trim().length > 0 &&
    termsAccepted &&
    privacyAccepted &&
    ageConfirmed;

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text selectable style={styles.title}>
          60초 안에 시작하기
        </Text>
        <Text selectable style={styles.subtitle}>
          실제 이름·군번·계급·부대명·사진은 받지 않아요.
        </Text>

        <ContentPanel style={styles.card}>
          <OfficialDisclaimer />

          <Field label="이메일" hint="로그인과 계정 복구에만 사용해요">
            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              testID="signup-email"
            />
          </Field>
          <Field label="비밀번호" hint="8자 이상">
            <Input
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              testID="signup-password"
            />
          </Field>
          <Field label="비밀번호 확인">
            <Input
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              secureTextEntry
              autoComplete="new-password"
              testID="signup-password-confirm"
            />
          </Field>
          <Field
            label="그룹에서 쓸 별칭"
            hint="실명·군번·계급·기수는 입력하지 마세요"
          >
            <Input
              value={alias}
              onChangeText={setAlias}
              placeholder="예: 라임고래"
              maxLength={24}
              testID="signup-name"
            />
          </Field>

          <View style={styles.consentGroup}>
            <NativeCheckbox
              value={termsAccepted}
              onValueChange={setTermsAccepted}
              label="[필수] 이용약관과 금지행위(공식 문서·병력·작전 정보 입력 금지)에 동의합니다."
              testID="signup-terms-consent"
            />
            <NativeCheckbox
              value={privacyAccepted}
              onValueChange={setPrivacyAccepted}
              label="[필수] 이메일·별칭·그룹 소속·휴가 날짜 처리에 동의합니다. 거부하면 핵심 기능을 제공할 수 없습니다."
              testID="signup-data-consent"
            />
            <NativeCheckbox
              value={ageConfirmed}
              onValueChange={setAgeConfirmed}
              label="[필수] 만 14세 이상이며 소속 부대의 휴대전화·보안 지침을 우선하겠습니다."
              testID="signup-age-confirmation"
            />
            <NativeCheckbox
              value={notificationOptIn}
              onValueChange={setNotificationOptIn}
              label="[선택] 내 계획 날짜의 상태 변동 알림을 받고 싶습니다. 미동의해도 앱을 이용할 수 있습니다."
              testID="signup-notification-consent"
            />
          </View>

          {error ? (
            <Text
              selectable
              accessibilityLiveRegion="assertive"
              style={styles.error}
            >
              {error}
            </Text>
          ) : null}

          <Button
            title={signup.isPending ? "가입 중…" : "가입하고 시작"}
            onPress={() => void submit()}
            loading={signup.isPending}
            disabled={!canSubmit}
            testID="signup-next"
          />

          <Text style={styles.footer}>
            이미 계정이 있나요?{" "}
            <Link href="/login" style={styles.link}>
              로그인
            </Link>
          </Text>
        </ContentPanel>

        <LegalLinks />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    color: colors.ink,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.body,
    textAlign: "center",
  },
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  consentGroup: { gap: spacing.md },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
  footer: { textAlign: "center", fontSize: 14, color: colors.body },
  link: { fontWeight: "600", color: colors.ink },
}));
