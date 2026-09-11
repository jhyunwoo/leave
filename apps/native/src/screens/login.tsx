/** 로그인 화면(네이티브). 성공하면 토큰이 SecureStore에 저장되고 탭으로 넘어간다. */

import { Link } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Image,
  ScrollView,
  Text,
  View,
} from "react-native";
import { KEYBOARD_AVOID_BEHAVIOR } from "@/components/keyboard-avoid";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLogin, usePasskeyLogin } from "@leave/client";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { Field, Input } from "@/components/field";
import { LegalLinks } from "@/components/legal-links";
import { makeStyles, spacing } from "@/theme";
import { getPasskey, passkeysSupported } from "@/lib/passkeys";

export function LoginScreen() {
  const styles = useStyles();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();
  const passkeyLogin = usePasskeyLogin();
  const insets = useSafeAreaInsets();

  const submit = async () => {
    setError(null);
    try {
      await login.mutateAsync({ email, password });
      // 토큰 설정 → Stack.Protected 가드가 자동으로 탭 화면으로 전환
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인하지 못했습니다");
    }
  };

  const submitPasskey = async () => {
    setError(null);
    try {
      await passkeyLogin.mutateAsync(getPasskey);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "패스키 로그인에 실패했습니다",
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={KEYBOARD_AVOID_BEHAVIOR}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Image
            accessibilityIgnoresInvertColors
            source={require("../../assets/images/leave-icon.png")}
            style={styles.logoMark}
          />
          <Text style={styles.logoText}>리브</Text>
          <Text style={styles.tagline}>
            휴가 계획, 겹치기 전에 참고로 미리 보기.
          </Text>
        </View>

        <ContentPanel tone="accent" style={styles.demoCard}>
          <Text selectable style={styles.demoEyebrow}>
            가입 전 미리보기
          </Text>
          <Text selectable style={styles.demoTitle}>
            날짜별 혼잡도를 신호로 확인해요
          </Text>
          <View style={styles.demoSignals}>
            {[
              ["8/14", "여유 25%"],
              ["8/15", "보통 60%"],
              ["8/16", "임박 85%"],
              ["8/17", "초과 110%"],
            ].map(([date, signal]) => (
              <View key={date} style={styles.demoSignal}>
                <Text selectable style={styles.demoDate}>
                  {date}
                </Text>
                <Text selectable style={styles.demoValue}>
                  {signal}
                </Text>
              </View>
            ))}
          </View>
        </ContentPanel>

        <ContentPanel style={styles.card}>
          <Text style={styles.cardTitle}>로그인</Text>
          <Field label="이메일">
            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              testID="login-email"
            />
          </Field>
          <Field label="비밀번호">
            <Input
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoComplete="current-password"
              testID="login-password"
            />
          </Field>
          {error && <Text style={styles.error}>{error}</Text>}
          <Button
            title={login.isPending ? "로그인 중…" : "로그인"}
            onPress={() => void submit()}
            disabled={!email || !password}
            loading={login.isPending}
            testID="login-submit"
          />
          {passkeysSupported ? (
            <Button
              title={
                passkeyLogin.isPending ? "패스키 확인 중…" : "패스키로 로그인"
              }
              variant="secondary"
              onPress={() => void submitPasskey()}
              loading={passkeyLogin.isPending}
              testID="passkey-login"
            />
          ) : null}
          <Text style={styles.footer}>
            처음이신가요?{" "}
            <Link href="/signup" style={styles.link}>
              가입하기
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
  content: { padding: spacing.xl, gap: spacing.xxl },
  brand: { alignItems: "center", gap: spacing.sm },
  logoMark: {
    width: 76,
    height: 76,
    borderRadius: 18,
    marginBottom: spacing.xs,
  },
  logoText: {
    fontSize: 56,
    fontWeight: "900",
    color: colors.ink,
    letterSpacing: -1,
  },
  tagline: { fontSize: 17, color: colors.body },
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
  },
  demoCard: {
    padding: spacing.xl,
    gap: spacing.md,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
  },
  demoEyebrow: { fontSize: 12, fontWeight: "700", color: colors.body },
  demoTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  demoSignals: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  demoSignal: {
    minWidth: 88,
    flexGrow: 1,
    padding: spacing.sm,
    gap: 2,
    backgroundColor: colors.surfaceCard,
    borderRadius: 12,
  },
  demoDate: { fontSize: 12, color: colors.body },
  demoValue: { fontSize: 13, fontWeight: "700", color: colors.ink },
  cardTitle: { fontSize: 24, fontWeight: "900", color: colors.ink },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
  footer: { textAlign: "center", fontSize: 14, color: colors.body },
  link: { fontWeight: "600", color: colors.ink },
}));
