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
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
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
import { DatePickerRow } from "@/components/date-picker";
import { Field, Input } from "@/components/field";
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
    setStep((s) => s + 1);
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
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScrollView
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

        <View style={styles.card}>
          {step === 0 && (
            <>
              <Field label="이메일">
                <Input
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </Field>
              <Field label="비밀번호" hint="8자 이상">
                <Input
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </Field>
              <Field label="비밀번호 확인">
                <Input
                  value={passwordConfirm}
                  onChangeText={setPasswordConfirm}
                  secureTextEntry
                />
              </Field>
              <Field label="이름">
                <Input
                  value={name}
                  onChangeText={setName}
                  placeholder="홍길동"
                />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="군 종류">
                <View style={styles.segment}>
                  {BRANCHES.map((b) => (
                    <Pressable
                      key={b}
                      accessibilityRole="button"
                      onPress={() => {
                        setBranch(b);
                        suggestDischarge(b, enlistedAt);
                      }}
                      style={[
                        styles.segmentBtn,
                        branch === b && styles.segmentBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          branch === b && { color: colors.onPrimary },
                        ]}
                      >
                        {BRANCH_LABELS[b]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Field>
              <DatePickerRow
                label="입대일"
                value={enlistedAt}
                onChange={(d) => {
                  setEnlistedAt(d);
                  suggestDischarge(branch, d);
                }}
              />
              <DatePickerRow
                label="전역 예정일"
                value={dischargeAt}
                onChange={(d) => {
                  setDischargeAt(d);
                  setDischargeTouched(true);
                }}
              />
              <Text style={styles.hint}>
                {`${BRANCH_LABELS[branch]} 복무기간 ${SERVICE_MONTHS[branch]}개월의 마지막 날로 전역일이 자동 입력돼요`}
              </Text>
              <Field label="현재 계급" hint="표준 진급일은 매월 1일이에요">
                <View style={styles.segment}>
                  {RANKS.map((r) => (
                    <Pressable
                      key={r}
                      accessibilityRole="button"
                      onPress={() => setRank(r)}
                      style={[
                        styles.segmentBtn,
                        rank === r && styles.segmentBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          rank === r && { color: colors.onPrimary },
                        ]}
                      >
                        {RANK_LABELS[r]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
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
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: dataConsent }}
                onPress={() => setDataConsent((v) => !v)}
                style={styles.consentRow}
              >
                <View
                  style={[styles.checkbox, dataConsent && styles.checkboxOn]}
                >
                  {dataConsent && <Text style={styles.checkboxMark}>✓</Text>}
                </View>
                <Text style={styles.consentText}>
                  서비스 운영·보안을 위해 접속 기록(접속 시각·기기 플랫폼·앱
                  버전 등)과 이 앱의 푸시 알림 발송·수신 기록을 수집·이용하는 데
                  동의합니다. 수집된 내 기록은 앱에서 언제든 열람할 수 있습니다.
                </Text>
              </Pressable>
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
                  setStep((s) => s - 1);
                }}
                style={{ flex: 1 }}
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
            />
          </View>

          <Text style={styles.footer}>
            이미 계정이 있나요?{" "}
            <Link href="/login" style={styles.link}>
              로그인
            </Link>
          </Text>
        </View>
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
  steps: { flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  stepPill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
  },
  stepPillActive: { backgroundColor: colors.primary },
  stepText: { fontSize: 12, fontWeight: "600", color: colors.mute },
  stepTextActive: { color: colors.onPrimary },
  card: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  segment: { flexDirection: "row", gap: spacing.sm },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    minHeight: 38,
    justifyContent: "center",
  },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: 14, fontWeight: "600", color: colors.ink },
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
  consentRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignSelf: "stretch",
    alignItems: "flex-start",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.mute,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxMark: { color: colors.onPrimary, fontSize: 14, fontWeight: "600" },
  consentText: { flex: 1, fontSize: 12, color: colors.body, lineHeight: 18 },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
  actions: { flexDirection: "row", gap: spacing.md },
  footer: { textAlign: "center", fontSize: 14, color: colors.body },
  link: { fontWeight: "600", color: colors.ink },
});
