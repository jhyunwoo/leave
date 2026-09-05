/**
 * 그룹 참여·생성 화면(네이티브).
 *
 * 그룹 검색은 일부러 없다. 부대를 검색으로 찾을 수 있으면 그 자체가 부대 목록이
 * 되기 때문이다. 초대코드로만 들어올 수 있고, 새로 만들면 코드가 한 번 노출된다.
 *
 * 이 화면은 폼 시트로 뜬다. 태블릿에서도 가운데 뜨는 폼 시트가 맞는 표현이라
 * 표현 방식은 그대로 두고, 안쪽 폭만 폼 기준으로 묶는다 — 초대코드 입력칸이
 * 700px로 늘어나 봐야 읽기만 어려워진다.
 */

import {
  fmtDateTimeFull,
  inviteLink,
  LEGACY_INVITE_CODE_MIN_LENGTH,
  unitCreateSchema,
  unitJoinSchema,
  type UnitCreateInput,
} from "@leave/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import {
  type IssuedUnitInvite,
  useCreateUnit,
  useJoinUnit,
  useLeaveUnit,
  useMe,
} from "@leave/client";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { Field, Input } from "@/components/field";
import { LeaveLimitFields } from "@/components/leave-limit-fields";
import { FormSheet } from "@/components/form-sheet";
import { OfficialDisclaimer } from "@/components/official-disclaimer";
import { SheetScaffold } from "@/components/sheet-scaffold";
import { confirmAction, notify } from "@/lib/dialog";
import { layout, makeStyles, radius, spacing } from "@/theme";

/**
 * 초대 링크를 먼저 주고 코드를 함께 적는다.
 *
 * 링크는 앱이 깔려 있으면 앱으로, 아니면 웹으로 떨어진다 — 받는 사람이 앱을
 * 깔았는지 보낸 사람이 알 수 없으므로 이쪽이 기본이다. 코드를 함께 적는 이유는
 * 링크를 열 수 없는 자리(구두 전달, 링크가 잘리는 메신저)가 남아 있어서다.
 */
async function shareInvite(invite: IssuedUnitInvite) {
  await Share.share({
    title: "리브 공유 그룹 초대",
    message: [
      "리브에서 함께 휴가를 관리해요. 아래 링크로 참여할 수 있어요.",
      inviteLink(invite.code),
      `앱에서 코드로 참여하려면: ${invite.code}`,
      `만료: ${fmtDateTimeFull(invite.expiresAt)}`,
      "실제 부대명·부대번호·주소·병력 현황은 입력하지 마세요.",
    ].join("\n\n"),
  });
}

export function UnitsScreen() {
  const styles = useStyles();
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
      notify("참여했어요", "공유 그룹의 휴가 계획 달력이 열렸습니다.");
    } catch (error) {
      setJoinError(
        error instanceof Error ? error.message : "그룹에 참여하지 못했습니다",
      );
    }
  };

  const doLeave = async () => {
    if (!myUnit) return;
    const confirmed = await confirmAction({
      title: "공유 그룹 나가기",
      message: "이 그룹에서 나갈까요?",
      confirmLabel: "나가기",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await leaveUnit.mutateAsync();
    } catch (error) {
      notify(
        "나가기 실패",
        error instanceof Error
          ? error.message
          : "관리자라면 먼저 다른 참여자에게 권한을 넘겨주세요.",
      );
    }
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
              onPress={() => void doLeave()}
            />
          </View>
        </ContentPanel>
      ) : (
        <>
          <ContentPanel style={styles.card}>
            <Text style={styles.sectionTitle}>초대코드로 참여</Text>
            <Field
              label="초대코드 6자리"
              hint="코드는 만료되거나 사용 횟수가 소진되면 사용할 수 없습니다."
            >
              <Input
                value={inviteCode}
                onChangeText={setInviteCode}
                // 코드는 대문자 사전이고, 소문자·공백·혼동 글자는 서버로 보내기
                // 전에 정규화가 흡수한다(`normalizeInviteCode`).
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                // 옛 32자 코드가 아직 유효할 수 있어 6으로 자르지 않는다.
                maxLength={LEGACY_INVITE_CODE_MIN_LENGTH + 8}
                placeholder="예: A2C4D5"
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
  const styles = useStyles();
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
        {fmtDateTimeFull(props.invite.expiresAt)}까지 · 최대{" "}
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
  const styles = useStyles();
  const [name, setName] = useState("");
  const [referenceTotal, setReferenceTotal] = useState("");
  const [maxCount, setMaxCount] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateUnit();

  // 시트를 닫으면 지난 오류를 비워 다음에 열 때 남아 있지 않게 한다.
  // RN Modal은 닫혀도 자식을 언마운트하지 않아 상태가 그대로 살아 있다.
  // 이펙트 대신 렌더 중에 맞추는 React 권장 방식이라 렌더가 연쇄되지 않는다.
  const [wasVisible, setWasVisible] = useState(props.visible);
  if (wasVisible !== props.visible) {
    setWasVisible(props.visible);
    if (!props.visible) setError(null);
  }

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

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  createSheet: { flex: 1 },
  content: {
    width: "100%",
    // 폼 기준 폭. 넓은 창에서도 입력칸이 늘어지지 않는다.
    maxWidth: layout.formContent,
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
}));
