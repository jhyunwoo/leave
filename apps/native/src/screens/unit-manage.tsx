import { unitUpdateSchema, type UnitUpdateInput } from "@leave/shared";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { imageUrl } from "@/api/client";
import type { Me } from "@/api/queries";
import {
  useApproveJoinRequest,
  useJoinRequests,
  useMe,
  useRejectJoinRequest,
  useRemoveMember,
  useTransferAdmin,
  useUnitMembers,
  useUpdateUnit,
  useUploadUnitImage,
} from "@/api/queries";
import { Avatar } from "@/components/avatar";
import { ActionMenu } from "@/components/action-menu";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { Field, Input } from "@/components/field";
import { LeaveLimitFields } from "@/components/leave-limit-fields";
import { colors, layout, radius, spacing } from "@/theme";

type Unit = NonNullable<Me["unit"]>;

export function UnitManageScreen() {
  const me = useMe();
  const insets = useSafeAreaInsets();
  const unit = me.data?.unit ?? null;
  const isAdmin = unit != null && me.data?.user.id === unit.adminId;

  if (me.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} size="large" />
      </View>
    );
  }

  if (!me.data || !unit || !isAdmin) {
    return (
      <View style={[styles.center, { padding: spacing.xl }]}>
        <Text style={styles.forbidden}>관리자만 볼 수 있는 화면이에요.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        width: "100%",
        maxWidth: layout.readableContent,
        alignSelf: "center",
        padding: spacing.lg,
        paddingBottom: insets.bottom + spacing.xxxl,
        gap: spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.lead}>
        {unit.name} · 관리자만 이 화면을 볼 수 있어요.
      </Text>
      <EditUnitSection unit={unit} />
      <JoinRequestsSection unitId={unit.id} />
      <MembersSection me={me.data} unit={unit} />
    </ScrollView>
  );
}

function EditUnitSection(props: { unit: Unit }) {
  const { unit } = props;
  const update = useUpdateUnit(unit.id);
  const uploadImage = useUploadUnitImage(unit.id);

  const [name, setName] = useState(unit.name);
  const [description, setDescription] = useState(unit.description ?? "");
  const [maxCount, setMaxCount] = useState(String(unit.maxLeaveCount));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const url = imageUrl(unit.imageKey);

  const changePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    setError(null);
    try {
      await uploadImage.mutateAsync({
        uri: asset.uri,
        mimeType: asset.mimeType,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지를 올리지 못했어요");
    }
  };

  const submit = async () => {
    setError(null);
    setSaved(false);
    const input = {
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      maxLeaveCount: maxCount.trim() === "" ? Number.NaN : Number(maxCount),
    } satisfies UnitUpdateInput;
    const parsed = unitUpdateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    try {
      await update.mutateAsync(parsed.data);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했어요");
    }
  };

  return (
    <ContentPanel style={styles.card}>
      <Text style={styles.sectionTitle}>부대 정보</Text>

      <View style={styles.imageRow}>
        <View style={styles.imageBox}>
          {url ? (
            <Image source={{ uri: url }} style={styles.image} />
          ) : (
            <Text style={styles.imagePlaceholder}>이미지</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={uploadImage.isPending ? "올리는 중…" : "대표 이미지 바꾸기"}
            variant="secondary"
            size="sm"
            loading={uploadImage.isPending}
            onPress={() => void changePhoto()}
          />
          <Text style={styles.hint}>정사각형 이미지를 권장해요.</Text>
        </View>
      </View>

      <Field label="부대 이름">
        <Input value={name} onChangeText={setName} />
      </Field>

      <Field label="소개 (선택)">
        <Input
          value={description}
          onChangeText={setDescription}
          placeholder="부대를 알아볼 수 있는 한 줄"
        />
      </Field>

      <LeaveLimitFields count={maxCount} onCountChange={setMaxCount} />

      {error && <Text style={styles.error}>{error}</Text>}
      {saved && <Text style={styles.saved}>저장했어요.</Text>}

      <Button
        title={update.isPending ? "저장 중…" : "변경사항 저장"}
        loading={update.isPending}
        onPress={() => void submit()}
        style={{ alignSelf: "flex-start" }}
      />
    </ContentPanel>
  );
}

function JoinRequestsSection(props: { unitId: string }) {
  const requests = useJoinRequests(props.unitId);
  const approve = useApproveJoinRequest(props.unitId);
  const reject = useRejectJoinRequest(props.unitId);
  const list = requests.data?.requests ?? [];

  return (
    <ContentPanel style={styles.card}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>가입 신청</Text>
        {list.length > 0 && (
          <Badge text={String(list.length)} kind="negative" />
        )}
      </View>

      {requests.isPending ? (
        <View style={{ padding: spacing.xl, alignItems: "center" }}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>대기 중인 가입 신청이 없어요.</Text>
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {list.map((r) => (
            <View key={r.userId} style={styles.personRow}>
              <Avatar name={r.name} imageKey={r.profileImageKey} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.personName}>
                  {r.rankLabel} {r.name}
                </Text>
                <Text style={styles.personMeta}>{r.branchLabel}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Button
                  title="승인"
                  size="sm"
                  disabled={approve.isPending}
                  onPress={() => void approve.mutateAsync(r.userId)}
                />
                <Button
                  title="거절"
                  variant="tertiary"
                  size="sm"
                  disabled={reject.isPending}
                  onPress={() => void reject.mutateAsync(r.userId)}
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </ContentPanel>
  );
}

function MembersSection(props: { me: Me; unit: Unit }) {
  const { me, unit } = props;
  const members = useUnitMembers(unit.id);
  const transfer = useTransferAdmin(unit.id);
  const remove = useRemoveMember(unit.id);
  const list = members.data?.members ?? [];

  const doTransfer = (userId: string, name: string) => {
    Alert.alert(
      "관리자 위임",
      `${name}님에게 관리자를 넘길까요? 넘기고 나면 이 화면을 더 이상 볼 수 없어요.`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "위임",
          onPress: () => void transfer.mutateAsync({ userId }),
        },
      ],
    );
  };
  const doRemove = (userId: string, name: string) => {
    Alert.alert("부대원 내보내기", `${name}님을 부대에서 내보낼까요?`, [
      { text: "취소", style: "cancel" },
      {
        text: "내보내기",
        style: "destructive",
        onPress: () => void remove.mutateAsync(userId),
      },
    ]);
  };

  return (
    <ContentPanel style={styles.card}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>부대원</Text>
        <Text style={styles.personMeta}>{list.length}명</Text>
      </View>

      {members.isPending ? (
        <View style={{ padding: spacing.xl, alignItems: "center" }}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {list.map((m) => {
            const isSelf = m.id === me.user.id;
            const isUnitAdmin = m.id === unit.adminId;
            return (
              <View key={m.id} style={styles.personRow}>
                <Avatar name={m.name} imageKey={m.profileImageKey} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.personName}>
                    {m.rankLabel} {m.name}
                    {isSelf ? " (나)" : ""}
                  </Text>
                  <Text style={styles.personMeta}>{m.branchLabel}</Text>
                </View>
                {isUnitAdmin ? (
                  <Badge text="관리자" kind="positive" />
                ) : (
                  <ActionMenu
                    label={`${m.name} 부대원 작업`}
                    buttonLabel="부대원 관리"
                    actions={[
                      {
                        id: "transfer",
                        title: "관리자 위임",
                        systemImage: "person.badge.key",
                        disabled: transfer.isPending,
                        onPress: () => doTransfer(m.id, m.name),
                      },
                      {
                        id: "remove",
                        title: "부대에서 내보내기",
                        systemImage: "person.crop.circle.badge.minus",
                        destructive: true,
                        disabled: remove.isPending,
                        onPress: () => doRemove(m.id, m.name),
                      },
                    ]}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}
    </ContentPanel>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  center: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  forbidden: { fontSize: 16, color: colors.body, textAlign: "center" },
  lead: { fontSize: 14, color: colors.body },
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  sectionTitle: { fontSize: 20, fontWeight: "600", color: colors.ink },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  imageRow: { flexDirection: "row", gap: spacing.lg, alignItems: "center" },
  imageBox: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { fontSize: 12, color: colors.mute },
  hint: { fontSize: 12, color: colors.mute, marginTop: 6 },
  ratioBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.canvasSoft,
  },
  ratioText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  ratioInputs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
  },
  ratioInput: {
    width: 56,
    textAlign: "center",
    paddingHorizontal: spacing.sm,
    minHeight: 42,
  },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
  saved: { fontSize: 13, fontWeight: "600", color: colors.positiveDeep },
  empty: {
    backgroundColor: colors.canvasSoft,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyText: { fontSize: 14, color: colors.body, textAlign: "center" },
  personRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  personName: { fontSize: 15, fontWeight: "600", color: colors.ink },
  personMeta: { fontSize: 12, color: colors.mute, marginTop: 1 },
});
