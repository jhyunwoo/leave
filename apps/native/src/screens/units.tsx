import { unitCreateSchema } from "@leave/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  useCreateUnit,
  useJoinUnit,
  useLeaveUnit,
  useMe,
  useUnitSearch,
} from "@/api/queries";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Field, Input } from "@/components/field";
import { colors, radius, spacing } from "@/theme";

const RATIO_PRESETS = [
  { n: 1, d: 3 },
  { n: 1, d: 4 },
  { n: 1, d: 5 },
] as const;

export function UnitsScreen() {
  const me = useMe();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const search = useUnitSearch(debounced);
  const join = useJoinUnit();
  const leaveUnit = useLeaveUnit();
  const myUnit = me.data?.unit ?? null;

  const doJoin = async (unitId: string, unitName: string) => {
    try {
      await join.mutateAsync(unitId);
      router.back();
    } catch (err) {
      Alert.alert(
        "가입 실패",
        err instanceof Error ? err.message : `${unitName}에 가입하지 못했습니다`,
      );
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.subtitle}>
        {myUnit
          ? "다른 부대로 옮기거나 부대에서 나갈 수 있어요."
          : "소속 부대에 들어가면 휴가 달력이 열려요."}
      </Text>

      {myUnit && (
        <View style={styles.myUnitCard}>
          <Text style={styles.myUnitEyebrow}>내 부대</Text>
          <Text style={styles.myUnitName}>{myUnit.name}</Text>
          <Text style={styles.myUnitMeta}>
            부대원 {myUnit.memberCount}명 · 최대 출타율 {myUnit.maxLeaveNumerator}
            /{myUnit.maxLeaveDenominator}
          </Text>
          <Button
            title="부대 나가기"
            variant="danger"
            size="sm"
            loading={leaveUnit.isPending}
            onPress={() =>
              Alert.alert("부대 나가기", `${myUnit.name}에서 나갈까요?`, [
                { text: "취소", style: "cancel" },
                {
                  text: "나가기",
                  style: "destructive",
                  onPress: () => void leaveUnit.mutateAsync(),
                },
              ])
            }
            style={{ alignSelf: "flex-start", marginTop: spacing.sm }}
          />
        </View>
      )}

      <View style={styles.card}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="부대 이름으로 검색 (예: 제12보병사단)"
          accessibilityLabel="부대 검색"
        />

        {search.isPending ? (
          <View style={{ padding: spacing.xl, alignItems: "center" }}>
            <ActivityIndicator color={colors.ink} />
          </View>
        ) : search.data && search.data.units.length > 0 ? (
          <View>
            {search.data.units.map((u) => (
              <View key={u.id} style={styles.unitRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.unitName}>{u.name}</Text>
                  <Text style={styles.unitMeta}>
                    부대원 {u.memberCount}명 · 최대 출타율 {u.maxLeaveNumerator}/
                    {u.maxLeaveDenominator}
                  </Text>
                  {u.description ? (
                    <Text style={styles.unitMeta}>{u.description}</Text>
                  ) : null}
                </View>
                {myUnit?.id === u.id ? (
                  <Badge text="소속됨" kind="positive" />
                ) : (
                  <Button
                    title="가입"
                    variant="tertiary"
                    size="sm"
                    disabled={join.isPending}
                    onPress={() => void doJoin(u.id, u.name)}
                  />
                )}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {debounced
                ? `"${debounced}"에 해당하는 부대가 없어요.`
                : "부대 이름을 검색해보세요."}
            </Text>
            <Text style={styles.emptyCaption}>
              찾는 부대가 없다면 새로 만들 수 있어요.
            </Text>
          </View>
        )}

        <Button
          title="새 부대 만들기"
          variant="secondary"
          onPress={() => setCreateOpen(true)}
        />
      </View>

      <CreateUnitModal
        visible={createOpen}
        initialName={debounced}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          router.back();
        }}
      />
    </ScrollView>
  );
}

function CreateUnitModal(props: {
  visible: boolean;
  initialName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState(props.initialName);
  const [description, setDescription] = useState("");
  const [num, setNum] = useState(1);
  const [den, setDen] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateUnit();

  useEffect(() => {
    if (props.visible) setName((n) => n || props.initialName);
  }, [props.visible, props.initialName]);

  const submit = async () => {
    const input = {
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      maxLeaveNumerator: num,
      maxLeaveDenominator: den,
    };
    const parsed = unitCreateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    try {
      await create.mutateAsync(parsed.data);
      props.onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "부대를 만들지 못했습니다");
    }
  };

  const example = Math.floor((30 * num) / den);

  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: colors.canvas }}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>새 부대 만들기</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="닫기"
              onPress={props.onClose}
              style={styles.closeBtn}
            >
              <Text style={{ fontSize: 15, color: colors.ink }}>✕</Text>
            </Pressable>
          </View>

          <Field label="부대 이름">
            <Input
              value={name}
              onChangeText={setName}
              placeholder="예: 제12보병사단 51연대 2대대"
            />
          </Field>
          <Field label="소개 (선택)">
            <Input
              value={description}
              onChangeText={setDescription}
              placeholder="부대를 알아볼 수 있는 한 줄"
            />
          </Field>
          <Field
            label="최대 출타율"
            hint={`예: 부대원 30명이면 하루 최대 ${example}명까지 출타할 수 있어요`}
          >
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
              {RATIO_PRESETS.map((p) => {
                const active = num === p.n && den === p.d;
                return (
                  <Pressable
                    key={`${p.n}/${p.d}`}
                    accessibilityRole="button"
                    onPress={() => {
                      setNum(p.n);
                      setDen(p.d);
                    }}
                    style={[styles.ratioBtn, active && { backgroundColor: colors.primary }]}
                  >
                    <Text
                      style={[
                        styles.ratioText,
                        active && { color: colors.onPrimary },
                      ]}
                    >
                      {p.n}/{p.d}
                    </Text>
                  </Pressable>
                );
              })}
              <View style={styles.ratioInputs}>
                <Input
                  value={String(num)}
                  onChangeText={(v) => setNum(Number(v) || 0)}
                  keyboardType="number-pad"
                  style={styles.ratioInput}
                  accessibilityLabel="출타율 분자"
                />
                <Text style={{ fontWeight: "600" }}>/</Text>
                <Input
                  value={String(den)}
                  onChangeText={(v) => setDen(Number(v) || 0)}
                  keyboardType="number-pad"
                  style={styles.ratioInput}
                  accessibilityLabel="출타율 분모"
                />
              </View>
            </View>
          </Field>

          {error && (
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.negativeDeep }}>
              {error}
            </Text>
          )}

          <Button
            title={create.isPending ? "만드는 중…" : "부대 만들고 가입하기"}
            onPress={() => void submit()}
            loading={create.isPending}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  subtitle: { fontSize: 16, color: colors.body },
  myUnitCard: {
    backgroundColor: colors.primaryPale,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: 4,
  },
  myUnitEyebrow: { fontSize: 12, fontWeight: "600", color: colors.positiveDeep },
  myUnitName: { fontSize: 22, fontWeight: "600", color: colors.ink },
  myUnitMeta: { fontSize: 13, color: colors.body },
  card: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  unitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.canvasSoft,
  },
  unitName: { fontSize: 15, fontWeight: "600", color: colors.ink },
  unitMeta: { fontSize: 12, color: colors.mute, marginTop: 1 },
  empty: {
    backgroundColor: colors.canvasSoft,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: 4,
  },
  emptyText: { fontSize: 14, color: colors.body, textAlign: "center" },
  emptyCaption: { fontSize: 12, color: colors.mute },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontSize: 24, fontWeight: "900", color: colors.ink },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
  },
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
});
