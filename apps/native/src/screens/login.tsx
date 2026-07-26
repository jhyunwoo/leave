import { Link } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLogin } from "@/api/queries";
import { Button } from "@/components/button";
import { Field, Input } from "@/components/field";
import { colors, radius, spacing } from "@/theme";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
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
          <Text style={styles.tagline}>부대 휴가, 겹치기 전에 미리 보기.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>로그인</Text>
          <Field label="이메일">
            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </Field>
          <Field label="비밀번호">
            <Input
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoComplete="current-password"
            />
          </Field>
          {error && <Text style={styles.error}>{error}</Text>}
          <Button
            title={login.isPending ? "로그인 중…" : "로그인"}
            onPress={() => void submit()}
            disabled={!email || !password}
            loading={login.isPending}
          />
          <Text style={styles.footer}>
            처음이신가요?{" "}
            <Link href="/signup" style={styles.link}>
              가입하기
            </Link>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
  },
  cardTitle: { fontSize: 24, fontWeight: "900", color: colors.ink },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
  footer: { textAlign: "center", fontSize: 14, color: colors.body },
  link: { fontWeight: "600", color: colors.ink },
});
