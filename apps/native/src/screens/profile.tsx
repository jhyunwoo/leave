/**
 * 프로필 화면(네이티브) — 내 정보와 복무 진행률, 정보 수정, 로그아웃·회원 탈퇴.
 *
 * 표시 계급은 서버가 입대일에서 계산해 내려준다(getRankInfo). 그래서 "계급"을
 * 고치는 건 사실 진급 하한(signupRank)을 고치는 것이고, 입대일을 고치면 계급도
 * 따라 움직인다. 수정 시트의 안내 문구가 이 관계를 설명한다.
 *
 * 넓은 창에서는 카드를 두 열로 나눈다. 신원·복무 진행률과 계정·그룹 설정은 서로
 * 다른 관심사라, 좁은 열 하나에 세로로 쌓으면 설정을 찾으려고 프로필을 지나쳐
 * 스크롤해야 한다. 수정은 그대로 폼 시트에서 한다 — iPad에서도 가운데 뜨는
 * 폼 시트가 맞는 표현이고, 안쪽 폼 폭만 SheetScaffold가 묶어 준다.
 */

import {
  BRANCH_LABELS,
  BRANCHES,
  fmtDateK,
  profileUpdateSchema,
  RANK_LABELS,
  RANKS,
  standardDischargeDate,
  type Branch,
  type ISODate,
  type ProfileUpdateInput,
  type Rank,
} from "@leave/shared";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  useChangePassword,
  useDeleteAccount,
  useLogout,
  useMe,
  useUpdateProfile,
  type Me,
} from "@leave/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { DatePickerRow } from "@/components/date-picker";
import { Field, Input } from "@/components/field";
import { FormSheet } from "@/components/form-sheet";
import { LegalLinks } from "@/components/legal-links";
import { OfficialDisclaimer } from "@/components/official-disclaimer";
import { NativeSegmentedControl } from "@/components/segmented-control";
import { ServiceProgress } from "@/components/service-progress";
import { SheetScaffold } from "@/components/sheet-scaffold";
import { WebScreenActions } from "@/components/web-screen-actions";
import { confirmAction, notify } from "@/lib/dialog";
import { ResponsiveGrid, useWindowSizeClass } from "@/adaptive";
import { layout, makeStyles, spacing, useColors } from "@/theme";

export function ProfileScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { sizeClass, isCompact } = useWindowSizeClass();
  const me = useMe();
  const logout = useLogout();
  const deleteAccount = useDeleteAccount();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  if (me.isPending || !me.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} size="large" />
      </View>
    );
  }

  const { user, unit } = me.data;

  const confirmLogout = async () => {
    const confirmed = await confirmAction({
      title: "로그아웃",
      message: "로그아웃할까요?",
      confirmLabel: "로그아웃",
      destructive: true,
    });
    if (confirmed) await logout.mutateAsync();
  };

  const confirmDeleteAccount = async () => {
    const confirmed = await confirmAction({
      title: "계정과 데이터 영구 삭제",
      message:
        "계정, 휴가 계획, 알림, 그룹 소속 데이터가 삭제됩니다. 되돌릴 수 없어요.",
      confirmLabel: "영구 삭제",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteAccount.mutateAsync();
    } catch (caught) {
      notify(
        "삭제 실패",
        caught instanceof Error ? caught.message : "잠시 후 다시 시도해주세요",
      );
    }
  };

  return (
    <>
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          {
            maxWidth: isCompact
              ? layout.readableContent
              : layout.workspaceContent,
          },
        ]}
      >
        {process.env.EXPO_OS === "web" ? (
          <View style={styles.webHeader}>
            <Text selectable style={styles.webTitle}>
              설정
            </Text>
            {/* 웹에는 툴바가 없으므로 로그아웃도 여기서 연다. */}
            <WebScreenActions
              actions={[
                {
                  id: "logout",
                  title: "로그아웃",
                  variant: "danger",
                  disabled: logout.isPending,
                  onPress: () => void confirmLogout(),
                  testID: "profile-logout",
                },
              ]}
            />
          </View>
        ) : null}

        <ResponsiveGrid
          sizeClass={sizeClass}
          // 카드 안의 글이 짧아 두 열에서도 줄이 어색해지지 않는다.
          columns={{ compact: 1, medium: 2 }}
        >
          <ContentPanel style={styles.card}>
            <View style={styles.profileRow}>
              <Avatar name={user.name} size={64} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text selectable style={styles.alias}>
                  {user.name}
                </Text>
                <Text selectable style={styles.email}>
                  {user.email}
                </Text>
              </View>
            </View>
            <Text selectable style={styles.privacyHint}>
              별칭만 표시합니다. 실명·군번·기수는 넣지 마세요. 프로필 사진은
              올릴 수 없고 부대 화면에도 이니셜만 나갑니다.
            </Text>

            <View style={styles.divider} />
            <View style={styles.infoGrid}>
              <InfoItem label="군 종류" value={user.branchLabel} />
              <InfoItem label="계급" value={user.rankLabel} />
              <InfoItem label="입대일" value={fmtDateK(user.enlistedAt)} />
              <InfoItem
                label="전역 예정일"
                value={fmtDateK(user.dischargeAt)}
                caption={`D-${user.daysUntilDischarge}`}
              />
            </View>
            <Button
              title="내 정보 수정"
              variant="secondary"
              onPress={() => setEditing(true)}
              testID="edit-profile"
            />
          </ContentPanel>

          <ContentPanel style={styles.card}>
            <ServiceProgress
              enlistedAt={user.enlistedAt as ISODate}
              dischargeAt={user.dischargeAt as ISODate}
              daysLeft={user.daysUntilDischarge}
              caption={
                user.nextPromotionDate
                  ? `다음 진급 ${fmtDateK(user.nextPromotionDate)}`
                  : "더 이상 예정된 진급이 없어요"
              }
            />
          </ContentPanel>

          <ContentPanel style={styles.card}>
            <InfoItem label="공유 그룹" value={unit?.name ?? "참여 전"} />
            <Button
              title="그룹 참여·관리"
              variant="secondary"
              onPress={() => router.push("/units")}
            />
          </ContentPanel>

          <ContentPanel style={styles.card}>
            <Text selectable style={styles.sectionTitle}>
              개인정보와 계정
            </Text>
            <Text selectable style={styles.sectionBody}>
              앱을 삭제한 뒤에도 공개 삭제 요청 페이지에서 계정 삭제 방법을
              확인할 수 있어요. 앱 안에서는 아래 버튼으로 바로 요청할 수
              있습니다.
            </Text>
            <Button
              title="비밀번호 변경"
              variant="secondary"
              onPress={() => setChangingPassword(true)}
              testID="change-password"
            />
            <LegalLinks />
            <Button
              title={
                deleteAccount.isPending ? "삭제 중…" : "계정과 데이터 삭제"
              }
              variant="danger"
              loading={deleteAccount.isPending}
              onPress={() => void confirmDeleteAccount()}
              testID="delete-account"
            />
          </ContentPanel>
        </ResponsiveGrid>

        {/* 고지는 카드가 아니라 화면 전체에 걸리는 문장이라 열 밖에 둔다. */}
        <OfficialDisclaimer />
      </ScrollView>

      {editing && (
        <EditProfileSheet user={user} onClose={() => setEditing(false)} />
      )}
      {changingPassword && (
        <ChangePasswordSheet onClose={() => setChangingPassword(false)} />
      )}

      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="rectangle.portrait.and.arrow.right"
          onPress={() => void confirmLogout()}
        >
          로그아웃
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
    </>
  );
}

/** 별칭·군 종류·입대일·전역예정일·계급 수정 시트. */
function EditProfileSheet(props: { user: Me["user"]; onClose: () => void }) {
  const styles = useStyles();
  const update = useUpdateProfile();
  const [name, setName] = useState(props.user.name);
  const [branch, setBranch] = useState<Branch>(props.user.branch);
  const [enlistedAt, setEnlistedAt] = useState(props.user.enlistedAt);
  const [dischargeAt, setDischargeAt] = useState(props.user.dischargeAt);
  const [rank, setRank] = useState<Rank>(props.user.rank);
  const [error, setError] = useState<string | null>(null);

  /**
   * 군 종류·입대일이 바뀌면 표준 전역일도 달라진다(육 18 / 해 20 / 공 21개월).
   * 사용자가 손으로 고친 값을 덮어쓰지 않도록, 바꾸기 전 값이 여전히 그 조합의
   * 표준값일 때만 따라 움직인다.
   */
  const retargetDischarge = (nextBranch: Branch, nextEnlistedAt: string) => {
    const wasStandard =
      dischargeAt ===
      standardDischargeDate(enlistedAt as ISODate, branch as Branch);
    if (wasStandard) {
      setDischargeAt(
        standardDischargeDate(nextEnlistedAt as ISODate, nextBranch),
      );
    }
  };

  const submit = async () => {
    setError(null);
    const input = {
      name: name.trim(),
      branch,
      enlistedAt,
      dischargeAt,
      rank,
    } satisfies ProfileUpdateInput;
    const parsed = profileUpdateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    if (enlistedAt >= dischargeAt) {
      setError("전역 예정일은 입대일보다 뒤여야 합니다");
      return;
    }
    try {
      await update.mutateAsync(parsed.data);
      props.onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "잠시 후 다시 시도해주세요",
      );
    }
  };

  return (
    <FormSheet
      isPresented
      onDismiss={props.onClose}
      testID="edit-profile-sheet"
    >
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        style={styles.sheet}
      >
        <SheetScaffold
          title="내 정보 수정"
          onClose={props.onClose}
          closeTestID="edit-profile-close"
          footer={
            <Button
              title="저장"
              loading={update.isPending}
              onPress={() => void submit()}
              testID="edit-profile-submit"
            />
          }
        >
          <Field
            label="별칭"
            hint="부대원에게 보이는 이름이에요. 실명은 넣지 마세요."
          >
            <Input
              value={name}
              onChangeText={setName}
              autoCapitalize="none"
              accessibilityLabel="별칭"
              testID="edit-profile-name"
            />
          </Field>

          <Field
            label="군 종류"
            hint="복무 기간이 달라 전역 예정일이 바뀌어요."
          >
            <NativeSegmentedControl
              values={BRANCHES}
              labels={BRANCH_LABELS}
              value={branch}
              onValueChange={(next) => {
                retargetDischarge(next, enlistedAt);
                setBranch(next);
              }}
              testID="edit-profile-branch"
            />
          </Field>

          <DatePickerRow
            label="입대일"
            value={enlistedAt as ISODate}
            onChange={(next) => {
              retargetDischarge(branch, next);
              setEnlistedAt(next);
            }}
            testID="edit-profile-enlisted"
          />

          <DatePickerRow
            label="전역 예정일"
            value={dischargeAt as ISODate}
            min={enlistedAt as ISODate}
            onChange={setDischargeAt}
            testID="edit-profile-discharge"
          />

          <Field
            label="가입 시 계급"
            hint="표시되는 계급은 입대일로 계산해요. 이 값은 그 계산의 하한이라, 입대일을 바꾸면 계급도 함께 바뀔 수 있어요."
          >
            <NativeSegmentedControl
              values={RANKS}
              labels={RANK_LABELS}
              value={rank}
              onValueChange={setRank}
              testID="edit-profile-rank"
            />
          </Field>

          {error ? (
            <Text selectable style={styles.error}>
              {error}
            </Text>
          ) : null}
        </SheetScaffold>
      </KeyboardAvoidingView>
    </FormSheet>
  );
}

/** 비밀번호 변경 시트. 성공하면 다른 기기의 세션이 모두 끊긴다. */
function ChangePasswordSheet(props: { onClose: () => void }) {
  const styles = useStyles();
  const change = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호가 서로 달라요");
      return;
    }
    if (newPassword.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다");
      return;
    }
    try {
      await change.mutateAsync({ currentPassword, newPassword });
      props.onClose();
      notify(
        "비밀번호를 바꿨어요",
        "이 기기는 그대로 쓸 수 있고, 다른 기기는 다시 로그인해야 해요.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "잠시 후 다시 시도해주세요",
      );
    }
  };

  return (
    <FormSheet
      isPresented
      onDismiss={props.onClose}
      testID="change-password-sheet"
    >
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        style={styles.sheet}
      >
        <SheetScaffold
          title="비밀번호 변경"
          onClose={props.onClose}
          closeTestID="change-password-close"
          footer={
            <Button
              title="비밀번호 변경"
              loading={change.isPending}
              onPress={() => void submit()}
              testID="change-password-submit"
            />
          }
        >
          <Field label="현재 비밀번호">
            <Input
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
              accessibilityLabel="현재 비밀번호"
              testID="current-password"
            />
          </Field>

          <Field label="새 비밀번호" hint="8자 이상">
            <Input
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
              accessibilityLabel="새 비밀번호"
              testID="new-password"
            />
          </Field>

          <Field label="새 비밀번호 확인">
            <Input
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
              accessibilityLabel="새 비밀번호 확인"
              testID="confirm-password"
            />
          </Field>

          <Text selectable style={styles.sectionBody}>
            비밀번호를 바꾸면 다른 기기의 로그인이 모두 끊겨요.
          </Text>

          {error ? (
            <Text selectable style={styles.error}>
              {error}
            </Text>
          ) : null}
        </SheetScaffold>
      </KeyboardAvoidingView>
    </FormSheet>
  );
}

function InfoItem(props: { label: string; value: string; caption?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.infoItem}>
      <Text selectable style={styles.infoLabel}>
        {props.label}
      </Text>
      <Text selectable style={styles.infoValue}>
        {props.value}
      </Text>
      {props.caption ? (
        <Text selectable style={styles.infoCaption}>
          {props.caption}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  center: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    alignSelf: "center",
    padding: spacing.lg,
    paddingTop: process.env.EXPO_OS === "web" ? 80 : spacing.lg,
    gap: spacing.lg,
    paddingBottom: 120,
  },
  webHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  webTitle: { fontSize: 28, fontWeight: "800", color: colors.ink },
  card: { padding: spacing.xl, gap: spacing.lg },
  sheet: { flex: 1 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  alias: { fontSize: 22, fontWeight: "700", color: colors.ink },
  email: { fontSize: 12, color: colors.mute, marginTop: 2 },
  privacyHint: { fontSize: 13, lineHeight: 19, color: colors.body },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.lg,
    columnGap: spacing.lg,
  },
  infoItem: { gap: 2, minWidth: 120, flexGrow: 1, flexBasis: "40%" },
  infoLabel: { fontSize: 12, color: colors.mute },
  infoValue: { fontSize: 15, fontWeight: "600", color: colors.ink },
  infoCaption: { fontSize: 12, color: colors.brand, fontWeight: "600" },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  sectionBody: { fontSize: 14, lineHeight: 21, color: colors.body },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
}));
