import {
  BRANCH_LABELS,
  BRANCHES,
  RANK_LABELS,
  RANKS,
  SERVICE_MONTHS,
  signupSchema,
  standardDischargeDate,
  type Branch,
  type Rank,
} from "@leave/shared";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_URL, getAuthToken } from "@/api/client";
import { useSignup } from "@/api/queries";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { DatePickerRow } from "@/components/date-picker";
import { Field, Input } from "@/components/field";
import { NativeSegmentedControl } from "@/components/segmented-control";
import { NativeCheckbox } from "@/components/native-checkbox";
import { colors, radius, spacing } from "@/theme";

const STEPS = ["계정", "군 정보", "프로필"] as const;

export function SignupScreen() {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState<Branch>("army");
  const [enlistedAt, setEnlistedAt] = useState("");
  const [dischargeAt, setDischargeAt] = useState("");
  const [dischargeTouched, setDischargeTouched] = useState(false);
  const [rank, setRank] = useState<Rank>("private");
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  // 개인정보(접속 기록·푸시 로그) 수집·이용 동의
  const [dataConsent, setDataConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signup = useSignup();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const goToStep = (nextStep: number) => {
    Keyboard.dismiss();
    setStep(nextStep);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  };

  const suggestDischarge = (b: Branch, enlisted: string) => {
    if (enlisted && !dischargeTouched) {
      setDischargeAt(standardDischargeDate(enlisted, b));
    }
  };

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!email.includes("@")) return "올바른 이메일 주소를 입력해주세요";
      if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다";
      if (password !== passwordConfirm) return "비밀번호가 서로 달라요";
      if (!name.trim()) return "이름을 입력해주세요";
    }
    if (step === 1) {
      if (!enlistedAt) return "입대일을 선택해주세요";
      if (!dischargeAt) return "전역 예정일을 선택해주세요";
      if (enlistedAt >= dischargeAt)
        return "전역 예정일은 입대일보다 뒤여야 합니다";
    }
    return null;
  };

  const next = () => {
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    goToStep(step + 1);
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0]);
  };

  const submit = async () => {
    const input = {
      email,
      password,
      name: name.trim(),
      branch,
      enlistedAt,
      dischargeAt,
      rank,
      dataConsent,
    };
    const parsed = signupSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    setError(null);
    try {
      await signup.mutateAsync(parsed.data);
      if (photo?.uri) {
        // 사진 업로드 실패는 가입을 막지 않는다
        try {
          const blob = await (await fetch(photo.uri)).blob();
          await fetch(`${API_URL}/images/profile`, {
            method: "PUT",
            headers: {
              "content-type": photo.mimeType ?? "image/jpeg",
              Authorization: `Bearer ${getAuthToken() ?? ""}`,
            },
            body: blob,
          });
        } catch {
          // ignore
        }
      }
      // 토큰 설정 → 가드 전환
    } catch (err) {
      setError(err instanceof Error ? err.message : "가입하지 못했습니다");
      if (err instanceof Error && err.message.includes("이메일")) setStep(0);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>가입하기</Text>
        <View style={styles.steps}>
          {STEPS.map((label, i) => (
            <View
              key={label}
              style={[styles.stepPill, i === step && styles.stepPillActive]}
            >
              <Text
                style={[styles.stepText, i === step && styles.stepTextActive]}
              >
                {i + 1} {label}
              </Text>
            </View>
          ))}
        </View>

        <ContentPanel style={styles.card}>
          {step === 0 && (
            <>
              <Field label="이메일">
                <Input
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  testID="signup-email"
                />
              </Field>
              <Field label="비밀번호" hint="8자 이상">
                <Input
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  testID="signup-password"
                />
              </Field>
              <Field label="비밀번호 확인">
                <Input
                  value={passwordConfirm}
                  onChangeText={setPasswordConfirm}
                  secureTextEntry
                  testID="signup-password-confirm"
                />
              </Field>
              <Field label="이름">
                <Input
                  value={name}
                  onChangeText={setName}
                  placeholder="홍길동"
                  testID="signup-name"
                />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="군 종류">
                <NativeSegmentedControl
                  values={BRANCHES}
                  labels={BRANCH_LABELS}
                  value={branch}
                  onValueChange={(next) => {
                    setBranch(next);
                    suggestDischarge(next, enlistedAt);
                  }}
                  testID="signup-branch"
                />
              </Field>
              <DatePickerRow
                label="입대일"
                value={enlistedAt}
                testID="signup-enlisted-at"
                onChange={(d) => {
                  setEnlistedAt(d);
                  suggestDischarge(branch, d);
                }}
              />
              <DatePickerRow
                label="전역 예정일"
                value={dischargeAt}
                testID="signup-discharge-at"
                onChange={(d) => {
                  setDischargeAt(d);
                  setDischargeTouched(true);
                }}
              />
              <Text style={styles.hint}>
                {`${BRANCH_LABELS[branch]} 복무기간 ${SERVICE_MONTHS[branch]}개월의 마지막 날로 전역일이 자동 입력돼요`}
              </Text>
              <Field label="현재 계급" hint="표준 진급일은 매월 1일이에요">
                <NativeSegmentedControl
                  values={RANKS}
                  labels={RANK_LABELS}
                  value={rank}
                  onValueChange={setRank}
                  testID="signup-rank"
                />
              </Field>
            </>
          )}

          {step === 2 && (
            <View style={{ alignItems: "center", gap: spacing.lg }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="프로필 사진 선택"
                onPress={() => void pickPhoto()}
                style={styles.photoCircle}
              >
                {photo?.uri ? (
                  <Image
                    source={{ uri: photo.uri }}
                    style={styles.photoImage}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={styles.photoText}>사진 선택</Text>
                )}
              </Pressable>
              <Text style={styles.hint}>
                프로필 사진은 선택이에요. 나중에 바꿀 수 있어요.
              </Text>
              <View style={styles.summary}>
                <Text style={styles.summaryName}>{name}</Text>
                <Text style={styles.summaryDetail}>
                  {BRANCH_LABELS[branch]} · {RANK_LABELS[rank]} · 입대{" "}
                  {enlistedAt} · 전역 {dischargeAt}
                </Text>
              </View>

              {/* 개인정보 수집·이용 동의 (접속 기록·푸시 로그) */}
              <NativeCheckbox
                value={dataConsent}
                onValueChange={setDataConsent}
                label="서비스 운영·보안을 위해 접속 기록과 푸시 알림 발송·수신 기록을 수집·이용하는 데 동의합니다. 수집된 내 기록은 앱에서 언제든 열람할 수 있습니다."
                testID="signup-data-consent"
              />
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            {step > 0 && (
              <Button
                title="이전"
                variant="secondary"
                onPress={() => {
                  setError(null);
                  goToStep(step - 1);
                }}
                style={{ flex: 1 }}
                testID="signup-previous"
              />
            )}
            <Button
              title={
                step < 2 ? "다음" : signup.isPending ? "가입 중…" : "가입 완료"
              }
              onPress={() => (step < 2 ? next() : void submit())}
              loading={signup.isPending}
              disabled={step === 2 && !dataConsent}
              style={{ flex: 2 }}
              testID="signup-next"
            />
          </View>

          <Text style={styles.footer}>
            이미 계정이 있나요?{" "}
            <Link href="/login" style={styles.link}>
              로그인
            </Link>
          </Text>
        </ContentPanel>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  title: {
    fontSize: 40,
    fontWeight: "900",
    color: colors.ink,
    textAlign: "center",
  },
  steps: {
    flexDirection: "row",
    alignSelf: "center",
    padding: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceCard,
  },
  stepPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: "transparent",
  },
  stepPillActive: { backgroundColor: colors.canvas },
  stepText: { fontSize: 12, fontWeight: "600", color: colors.mute },
  stepTextActive: { color: colors.ink },
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  hint: { fontSize: 12, color: colors.mute },
  photoCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(14, 15, 12, 0.25)",
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoImage: { width: "100%", height: "100%" },
  photoText: { fontSize: 13, fontWeight: "600", color: colors.mute },
  summary: {
    backgroundColor: colors.canvasSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignSelf: "stretch",
    gap: 4,
  },
  summaryName: { fontSize: 15, fontWeight: "600", color: colors.ink },
  summaryDetail: { fontSize: 12, color: colors.body },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
  actions: { flexDirection: "row", gap: spacing.md },
  footer: { textAlign: "center", fontSize: 14, color: colors.body },
  link: { fontWeight: "600", color: colors.ink },
});
