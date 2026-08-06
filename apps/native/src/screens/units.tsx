import {
  unitCreateSchema,
  unitJoinSchema,
  type UnitCreateInput,
} from "@leave/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  type IssuedUnitInvite,
  useCreateUnit,
  useJoinUnit,
  useLeaveUnit,
  useMe,
} from "@/api/queries";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { Field, Input } from "@/components/field";
import { LeaveLimitFields } from "@/components/leave-limit-fields";
import { FormSheet } from "@/components/form-sheet";
import { OfficialDisclaimer } from "@/components/official-disclaimer";
import { SheetScaffold } from "@/components/sheet-scaffold";
import { colors, layout, radius, spacing } from "@/theme";

async function shareInvite(invite: IssuedUnitInvite) {
  await Share.share({
    title: "리브 공유 그룹 초대",
    message: [
      "리브 앱에서 아래 초대코드를 입력하세요.",
      invite.code,
      `만료: ${new Date(invite.expiresAt).toLocaleString("ko-KR")}`,
      "실제 부대명·부대번호·주소·병력 현황은 입력하지 마세요.",
    ].join("\n\n"),
  });
}

export function UnitsScreen() {
  const me = useMe();
  const join = useJoinUnit();
  const leaveUnit = useLeaveUnit();
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [issuedInvite, setIssuedInvite] = useState<IssuedUnitInvite | null>(
    null,
  );

  const myUnit = me.data?.unit ?? null;
  const isAdmin = myUnit != null && me.data?.user.id === myUnit.adminId;
  const participation =
    myUnit?.referenceMemberTotal && myUnit.referenceMemberTotal > 0
      ? Math.min(
          100,
          Math.round((myUnit.memberCount / myUnit.referenceMemberTotal) * 100),
        )
      : null;

  const doJoin = async () => {
    setJoinError(null);
    const parsed = unitJoinSchema.safeParse({ code: inviteCode });
    if (!parsed.success) {
      setJoinError(
        parsed.error.issues[0]?.message ?? "초대코드를 확인해주세요",
      );
      return;
    }
    try {
      await join.mutateAsync(parsed.data);
      setInviteCode("");
      Alert.alert("참여했어요", "공유 그룹의 휴가 계획 달력이 열렸습니다.");
    } catch (error) {
      setJoinError(
        error instanceof Error ? error.message : "그룹에 참여하지 못했습니다",
      );
    }
  };

  const doLeave = () => {
    if (!myUnit) return;
    Alert.alert("공유 그룹 나가기", "이 그룹에서 나갈까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "나가기",
        style: "destructive",
        onPress: () =>
          void leaveUnit
            .mutateAsync()
            .catch((error) =>
              Alert.alert(
                "나가기 실패",
                error instanceof Error
                  ? error.message
                  : "관리자라면 먼저 다른 참여자에게 권한을 넘겨주세요.",
              ),
            ),
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.subtitle}>
        그룹은 검색되지 않습니다. 관리자에게 받은 초대코드로만 참여할 수 있어요.
      </Text>
      <OfficialDisclaimer compact />

      {myUnit ? (
        <ContentPanel tone="accent" style={styles.myUnitCard}>
          <Text style={styles.myUnitEyebrow}>내 공유 그룹</Text>
          <Text style={styles.myUnitName}>{myUnit.name}</Text>
          <Text style={styles.myUnitMeta}>
            참여율 {participation === null ? "미설정" : `${participation}%`}
            {participation !== null && participation < 70
              ? " · 실제 출타율은 더 높을 수 있어요"
              : ""}
          </Text>
          <Text style={styles.securityNote}>
            그룹 이름에 실제 부대명·부대번호·주소·위치를 넣지 마세요.
          </Text>
          <View style={styles.myUnitActions}>
            {isAdmin ? (
              <Button
                title="그룹 관리·초대"
                variant="secondary"
                size="sm"
                onPress={() => router.push("/unit-manage")}
              />
            ) : null}
            <Button
              title="그룹 나가기"
              variant="danger"
              size="sm"
              loading={leaveUnit.isPending}
              onPress={doLeave}
            />
          </View>
        </ContentPanel>
      ) : (
        <>
          <ContentPanel style={styles.card}>
            <Text style={styles.sectionTitle}>초대코드로 참여</Text>
            <Field
              label="초대코드"
              hint="코드는 만료되거나 사용 횟수가 소진되면 사용할 수 없습니다."
            >
              <Input
                value={inviteCode}
                onChangeText={setInviteCode}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="관리자에게 받은 긴 초대코드"
                accessibilityLabel="공유 그룹 초대코드"
                testID="unit-invite-code"
              />
            </Field>
            {joinError ? (
              <Text style={styles.errorText}>{joinError}</Text>
            ) : null}
            <Button
              title={join.isPending ? "확인 중…" : "그룹 참여"}
              loading={join.isPending}
              onPress={() => void doJoin()}
              testID="unit-join-submit"
            />
          </ContentPanel>

          <ContentPanel style={styles.card}>
            <Text style={styles.sectionTitle}>관리자가 아직 없나요?</Text>
            <Text style={styles.body}>
              식별 정보가 없는 공유 그룹을 만든 뒤, 한 번만 보이는 초대코드를
              직접 전달하세요.
            </Text>
            <Button
              title="새 공유 그룹 만들기"
              variant="secondary"
              onPress={() => setCreateOpen(true)}
              testID="create-unit-open"
            />
          </ContentPanel>
        </>
      )}

      {issuedInvite ? (
        <InvitePanel
          invite={issuedInvite}
          onShare={() => void shareInvite(issuedInvite)}
        />
      ) : null}

      <CreateUnitModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(invite) => {
          setIssuedInvite(invite);
          setCreateOpen(false);
        }}
      />
    </ScrollView>
  );
}

function InvitePanel(props: { invite: IssuedUnitInvite; onShare: () => void }) {
  return (
    <ContentPanel style={styles.inviteCard}>
      <Text style={styles.sectionTitle}>지금 초대코드를 보관하세요</Text>
      <Text style={styles.body}>
        원문은 서버에 저장되지 않아 이 화면을 떠나면 다시 볼 수 없습니다.
      </Text>
      <Text selectable accessibilityLabel="발급된 초대코드" style={styles.code}>
        {props.invite.code}
      </Text>
      <Text style={styles.myUnitMeta}>
        {new Date(props.invite.expiresAt).toLocaleString("ko-KR")}까지 · 최대{" "}
        {props.invite.maxUses}회
      </Text>
      <Button title="안전하게 공유" onPress={props.onShare} />
    </ContentPanel>
  );
}

function CreateUnitModal(props: {
  visible: boolean;
  onClose: () => void;
  onCreated: (invite: IssuedUnitInvite) => void;
}) {
  const [name, setName] = useState("");
  const [referenceTotal, setReferenceTotal] = useState("");
  const [maxCount, setMaxCount] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateUnit();

  useEffect(() => {
    if (!props.visible) setError(null);
  }, [props.visible]);

  const submit = async () => {
    const input = {
      name: name.trim(),
      referenceMemberTotal:
        referenceTotal.trim() === "" ? null : Number(referenceTotal),
      maxLeaveCount: maxCount.trim() === "" ? Number.NaN : Number(maxCount),
    } satisfies UnitCreateInput;
    const parsed = unitCreateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    try {
      const result = await create.mutateAsync(parsed.data);
      props.onCreated(result.invite);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "그룹을 만들지 못했습니다",
      );
    }
  };

  return (
    <FormSheet
      isPresented={props.visible}
      onDismiss={props.onClose}
      testID="create-unit-sheet"
    >
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        style={styles.createSheet}
      >
        <SheetScaffold
          title="새 공유 그룹"
          onClose={props.onClose}
          closeTestID="create-unit-close"
          footer={
            <Button
              title={create.isPending ? "만드는 중…" : "그룹 만들기"}
              onPress={() => void submit()}
              loading={create.isPending}
              testID="create-unit-submit"
            />
          }
        >
          <ContentPanel style={styles.warningBox}>
            <Text style={styles.warningText}>
              실제 부대명·고유번호·주소·위치·병력 현황·작전/훈련 정보를 입력하지
              마세요. 이름은 서버 검색에 사용되지 않습니다.
            </Text>
          </ContentPanel>
          <Field label="그룹 안에서만 보이는 별칭">
            <Input
              value={name}
              onChangeText={setName}
              placeholder="예: 여름 휴가방"
              maxLength={80}
              testID="create-unit-name"
            />
          </Field>
          <Field
            label="계산 기준 인원 (선택)"
            hint="실제 편제·정원이 아닌 관리자가 정한 참고값입니다. 마지막 변경 시각이 함께 표시됩니다."
          >
            <Input
              value={referenceTotal}
              onChangeText={setReferenceTotal}
              keyboardType="number-pad"
              placeholder="예: 50"
              accessibilityLabel="계산 기준 인원"
              testID="create-unit-reference-total"
            />
          </Field>
          <LeaveLimitFields
            count={maxCount}
            onCountChange={setMaxCount}
            testID="create-unit-max-out"
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </SheetScaffold>
      </KeyboardAvoidingView>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  createSheet: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: layout.readableContent,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.body },
  myUnitCard: { padding: spacing.xl, gap: spacing.xs },
  myUnitEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.positiveDeep,
  },
  myUnitName: { fontSize: 22, fontWeight: "700", color: colors.ink },
  myUnitMeta: { fontSize: 13, lineHeight: 19, color: colors.body },
  securityNote: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.warningContent,
    marginTop: spacing.xs,
  },
  myUnitActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },
  card: { padding: spacing.xl, gap: spacing.lg },
  inviteCard: {
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  sectionTitle: { fontSize: 19, fontWeight: "700", color: colors.ink },
  body: { fontSize: 14, lineHeight: 21, color: colors.body },
  code: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.canvasSoft,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  warningBox: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  warningText: {
    color: colors.warningContent,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  errorText: {
    color: colors.negativeDeep,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
});
