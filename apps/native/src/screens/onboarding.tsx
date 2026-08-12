import {
  BRANCHES,
  BRANCH_LABELS,
  RANKS,
  RANK_LABELS,
  REGULAR_OVERNIGHT_DEFAULTS,
  REGULAR_OVERNIGHT_SOURCES,
  REGULAR_OVERNIGHT_VERIFIED_AT,
  addDays,
  isValidISODate,
  onboardingProfileSchema,
  regularOvernightGuidance,
  standardDischargeDate,
  unitCreateSchema,
  unitJoinSchema,
  type Branch,
  type ISODate,
  type Rank,
} from "@leave/shared";
import {
  useCompleteOnboarding,
  useCreateUnit,
  useJoinUnit,
  useOnboardingStatus,
  useSaveOnboardingProfile,
  useSaveOnboardingRegularOvernight,
  type IssuedUnitInvite,
  type OnboardingStatus,
} from "@leave/client";
import * as Linking from "expo-linking";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { Field, Input } from "@/components/field";
import { NativeSegmentedControl } from "@/components/segmented-control";
import { makeStyles, spacing } from "@/theme";

export function OnboardingScreen() {
  const query = useOnboardingStatus();
  if (!query.data) return null;
  return <OnboardingContent status={query.data} />;
}

function OnboardingContent({ status }: { status: OnboardingStatus }) {
  const styles = useStyles();
  const profile = status.profile;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState(profile?.name ?? "");
  const [branch, setBranch] = useState<Branch>(profile?.branch ?? "army");
  const [enlistedAt, setEnlistedAt] = useState(profile?.enlistedAt ?? "");
  const [dischargeAt, setDischargeAt] = useState(profile?.dischargeAt ?? "");
  const [rank, setRank] = useState<Rank>(profile?.rank ?? "private");
  const [startDate, setStartDate] = useState(
    status.regularOvernight?.startDate ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const saveProfile = useSaveOnboardingProfile();
  const saveRegular = useSaveOnboardingRegularOvernight();
  const complete = useCompleteOnboarding();
  const submitProfile = async () => {
    const parsed = onboardingProfileSchema.safeParse({
      name,
      branch,
      enlistedAt,
      dischargeAt,
      rank,
    });
    if (!parsed.success)
      return setError(
        parsed.error.issues[0]?.message ?? "입력값을 확인해주세요",
      );
    try {
      await saveProfile.mutateAsync(parsed.data);
      setError(null);
      setStep(branch === "army" ? 3 : 2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다");
    }
  };
  const submitRegular = async (skip = false) => {
    try {
      await saveRegular.mutateAsync(
        skip || !startDate
          ? { enabled: false }
          : { enabled: true, startDate, ...REGULAR_OVERNIGHT_DEFAULTS },
      );
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다");
    }
  };
  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.progress}>
          <Text style={styles.brand}>리브</Text>
          <Text style={styles.muted}>{step} / 3</Text>
        </View>
        {step === 1 ? (
          <>
            <Text style={styles.title}>내 복무 정보</Text>
            <Text style={styles.subtitle}>
              휴가 계산에 필요한 정보만 입력해요.
            </Text>
            <Field
              label="그룹에서 쓸 별칭"
              hint="실명·군번·기수는 입력하지 마세요."
            >
              <Input
                value={name}
                onChangeText={setName}
                placeholder="예: 라임고래"
              />
            </Field>
            <Field label="군종">
              <NativeSegmentedControl
                values={BRANCHES}
                labels={BRANCH_LABELS}
                value={branch}
                onValueChange={(next) => {
                  setBranch(next);
                  if (isValidISODate(enlistedAt))
                    setDischargeAt(
                      standardDischargeDate(enlistedAt as ISODate, next),
                    );
                }}
              />
            </Field>
            <Field label="입대일">
              <Input
                value={enlistedAt}
                onChangeText={(next) => {
                  setEnlistedAt(next);
                  if (isValidISODate(next))
                    setDischargeAt(
                      standardDischargeDate(next as ISODate, branch),
                    );
                }}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
              />
            </Field>
            <Field
              label="전역 예정일"
              hint="입대일과 군종으로 자동 계산했어요."
            >
              <Input
                value={dischargeAt}
                onChangeText={setDischargeAt}
                placeholder="YYYY-MM-DD"
              />
            </Field>
            <Field label="현재 계급">
              <NativeSegmentedControl
                values={RANKS}
                labels={RANK_LABELS}
                value={rank}
                onValueChange={setRank}
              />
            </Field>
            <ContentPanel>
              <Text style={styles.note}>
                🔒 실명·군번·기수·실제 부대명은 입력하지 마세요.
              </Text>
            </ContentPanel>
            {error && <Text style={styles.error}>{error}</Text>}
            <Button
              title="다음"
              loading={saveProfile.isPending}
              onPress={() => void submitProfile()}
            />
          </>
        ) : step === 2 ? (
          <Overnight
            branch={branch}
            startDate={startDate}
            setStartDate={setStartDate}
            onBack={() => setStep(1)}
            onSave={() => void submitRegular()}
            onSkip={() => void submitRegular(true)}
          />
        ) : (
          <ShareStep
            unitId={status.unitId}
            onBack={() => setStep(branch === "army" ? 1 : 2)}
            onComplete={() => complete.mutateAsync()}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Overnight(props: {
  branch: Branch;
  startDate: string;
  setStartDate: (v: string) => void;
  onBack: () => void;
  onSave: () => void;
  onSkip: () => void;
}) {
  const styles = useStyles();
  const guide = regularOvernightGuidance(props.branch)!;
  return (
    <>
      <Text style={styles.title}>정기외박 설정</Text>
      <Text style={styles.subtitle}>{guide.summary}</Text>
      <Field
        label="주기 기준일"
        hint="부대에서 안내받은 실제 기준일을 입력하세요."
      >
        <Input
          value={props.startDate}
          onChangeText={props.setStartDate}
          placeholder="YYYY-MM-DD"
        />
      </Field>
      {isValidISODate(props.startDate) && (
        <Text style={styles.note}>
          첫 사용 가능 주기는 {addDays(props.startDate as ISODate, 42)}부터예요.
        </Text>
      )}
      <View style={styles.metrics}>
        <ContentPanel style={styles.metric}>
          <Text>주기</Text>
          <Text style={styles.metricValue}>42일</Text>
        </ContentPanel>
        <ContentPanel style={styles.metric}>
          <Text>회당</Text>
          <Text style={styles.metricValue}>3일</Text>
        </ContentPanel>
      </View>
      <ContentPanel>
        <Text style={styles.sectionTitle}>규정과 실제 운영</Text>
        <Text style={styles.note}>
          {guide.disclaimer}
          {"\n\n"}
          {guide.detail}
        </Text>
        {REGULAR_OVERNIGHT_SOURCES.map((s) => (
          <Button
            key={s.url}
            title={s.label}
            variant="ghost"
            size="sm"
            onPress={() => void Linking.openURL(s.url)}
          />
        ))}
        <Text style={styles.muted}>
          공개 자료 확인 {REGULAR_OVERNIGHT_VERIFIED_AT} · 소속 부대 지침이
          우선합니다.
        </Text>
      </ContentPanel>
      <View style={styles.row}>
        <Button
          title="이전"
          variant="secondary"
          style={styles.flex}
          onPress={props.onBack}
        />
        <Button
          title="설정 저장"
          disabled={!props.startDate}
          style={styles.flex}
          onPress={props.onSave}
        />
      </View>
      <Button
        title="기준일을 몰라요 · 나중에 설정"
        variant="ghost"
        onPress={props.onSkip}
      />
    </>
  );
}

function ShareStep(props: {
  unitId: string | null;
  onBack: () => void;
  onComplete: () => Promise<unknown>;
}) {
  const styles = useStyles();
  const [mode, setMode] = useState<"choice" | "join" | "create">("choice");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [max, setMax] = useState("1");
  const [invite, setInvite] = useState<IssuedUnitInvite | null>(null);
  const create = useCreateUnit();
  const join = useJoinUnit();
  const finish = () => void props.onComplete();
  const doJoin = async () => {
    const p = unitJoinSchema.safeParse({ code });
    if (!p.success) return Alert.alert("코드 확인", p.error.issues[0]?.message);
    try {
      await join.mutateAsync(p.data);
      finish();
    } catch (e) {
      Alert.alert(
        "참여 실패",
        e instanceof Error ? e.message : "다시 시도해주세요",
      );
    }
  };
  const doCreate = async () => {
    const p = unitCreateSchema.safeParse({ name, maxLeaveCount: Number(max) });
    if (!p.success) return Alert.alert("입력 확인", p.error.issues[0]?.message);
    try {
      setInvite((await create.mutateAsync(p.data)).invite);
    } catch (e) {
      Alert.alert(
        "생성 실패",
        e instanceof Error ? e.message : "다시 시도해주세요",
      );
    }
  };
  const share = () =>
    invite &&
    Share.share({
      title: "리브 공유 그룹 초대",
      message: `리브에서 함께 휴가를 관리해요.\nhttps://leave.moveto.kr/invite#${invite.code}\n초대코드: ${invite.code}`,
    });
  if (invite)
    return (
      <>
        <Text style={styles.title}>동료를 초대해보세요</Text>
        <Text style={styles.subtitle}>
          초대코드는 이 화면에서 한 번만 보여요.
        </Text>
        <ContentPanel>
          <Text selectable style={styles.code}>
            {invite.code}
          </Text>
          <Text style={styles.note}>
            {new Date(invite.expiresAt).toLocaleString("ko-KR")}까지 · 최대{" "}
            {invite.maxUses}회
          </Text>
        </ContentPanel>
        <Button title="안전하게 공유" onPress={() => void share()} />
        <Button title="온보딩 완료" variant="ghost" onPress={finish} />
        <Text style={styles.muted}>
          서버에는 초대코드의 해시값만 저장됩니다.
        </Text>
      </>
    );
  if (props.unitId)
    return (
      <>
        <Text style={styles.title}>이미 함께 관리 중이에요</Text>
        <Text style={styles.subtitle}>
          현재 공유 그룹의 휴가 계획을 바로 이어서 관리할 수 있어요.
        </Text>
        <Button title="온보딩 완료" onPress={finish} />
      </>
    );
  return (
    <>
      <Text style={styles.title}>함께 관리하면 더 정확해요</Text>
      <Text style={styles.subtitle}>
        같은 그룹의 계획이 모일수록 날짜별 출타 현황을 제대로 볼 수 있어요.
      </Text>
      {mode === "choice" ? (
        <>
          <Text style={styles.visual}>
            ○ ─┐{"\n"}○ ─┼─ ▦{"\n"}○ ─┘
          </Text>
          <Button
            title="새 공유 그룹 만들기"
            onPress={() => setMode("create")}
          />
          <Button
            title="초대코드로 참여"
            variant="secondary"
            onPress={() => setMode("join")}
          />
        </>
      ) : mode === "join" ? (
        <>
          <Field label="초대코드">
            <Input value={code} onChangeText={setCode} autoCapitalize="none" />
          </Field>
          <Button title="그룹 참여" onPress={() => void doJoin()} />
        </>
      ) : (
        <>
          <Field label="공유 그룹 이름">
            <Input
              value={name}
              onChangeText={setName}
              placeholder="예: 여름 휴가방"
            />
          </Field>
          <Field label="하루 최대 출타 인원">
            <Input
              value={max}
              onChangeText={setMax}
              keyboardType="number-pad"
            />
          </Field>
          <Button title="그룹 만들기" onPress={() => void doCreate()} />
        </>
      )}
      <Button title="나중에 하기" variant="ghost" onPress={finish} />
      <ContentPanel>
        <Text style={styles.note}>
          실제 부대명·부대번호·주소·병력 현황은 공유하지 마세요.
        </Text>
      </ContentPanel>
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvas },
  content: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    padding: spacing.xl,
    paddingTop: spacing.xxxl,
    gap: spacing.lg,
    paddingBottom: 80,
  },
  progress: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: { fontSize: 26, fontWeight: "900", color: colors.ink },
  title: {
    fontSize: 36,
    fontWeight: "900",
    color: colors.ink,
    marginTop: spacing.lg,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.body,
    marginBottom: spacing.md,
  },
  muted: { fontSize: 12, color: colors.mute },
  note: { fontSize: 13, lineHeight: 20, color: colors.body },
  error: { fontSize: 13, color: colors.negativeDeep, fontWeight: "600" },
  metrics: { flexDirection: "row", gap: spacing.md },
  metric: { flex: 1, padding: spacing.lg },
  metricValue: { fontSize: 24, fontWeight: "800", color: colors.ink },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: "row", gap: spacing.md },
  flex: { flex: 1 },
  visual: {
    fontSize: 32,
    lineHeight: 52,
    textAlign: "center",
    color: colors.positiveDeep,
    padding: spacing.xl,
  },
  code: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.ink,
    textAlign: "center",
    padding: spacing.md,
  },
}));
