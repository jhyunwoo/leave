import {
  BALANCE_KEYS,
  BALANCE_LABELS,
  type BalanceKey,
  type Branch,
} from "@leave/shared";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import {
  type LeaveBalanceSummary,
  useLeaveBalances,
  useUpdateLeaveBalances,
  useUpdateRegularOvernight,
} from "@/api/queries";
import { Button } from "@/components/button";
import { DatePickerRow } from "@/components/date-picker";
import { Input } from "@/components/field";
import { colors, radius, spacing } from "@/theme";

export function LeaveBalanceSettings(props: { branch: Branch }) {
  const query = useLeaveBalances();
  if (query.isPending || !query.data) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  return (
    <SettingsForm
      branch={props.branch}
      summary={query.data}
    />
  );
}

function SettingsForm(props: { branch: Branch; summary: LeaveBalanceSummary }) {
  const updateBalances = useUpdateLeaveBalances();
  const updateRegular = useUpdateRegularOvernight();
  const [totals, setTotals] = useState(
    Object.fromEntries(
      props.summary.balances.map((item) => [item.key, item.totalDays]),
    ) as Record<BalanceKey, number>,
  );
  const config = props.summary.regularOvernight;
  const [regularEnabled, setRegularEnabled] = useState(config.enabled);
  const [nextGrantDate, setNextGrantDate] = useState(
    config.nextGrantDate ?? "",
  );
  const [intervalDays, setIntervalDays] = useState(config.intervalDays ?? 42);
  const [daysPerGrant, setDaysPerGrant] = useState(config.daysPerGrant ?? 3);

  const saveTotals = async () => {
    try {
      await updateBalances.mutateAsync({ totals });
      Alert.alert("저장 완료", "휴가 총량을 저장했어요.");
    } catch (caught) {
      Alert.alert(
        "저장 실패",
        caught instanceof Error ? caught.message : "잠시 후 다시 시도해주세요",
      );
    }
  };

  const saveRegular = async () => {
    try {
      await updateRegular.mutateAsync(
        regularEnabled
          ? { enabled: true, nextGrantDate, intervalDays, daysPerGrant }
          : { enabled: false },
      );
      Alert.alert("저장 완료", "정기외박 적립 설정을 저장했어요.");
    } catch (caught) {
      Alert.alert(
        "저장 실패",
        caught instanceof Error ? caught.message : "잠시 후 다시 시도해주세요",
      );
    }
  };

  return (
    <View style={styles.card}>
      <View style={{ gap: spacing.xs }}>
        <Text style={styles.eyebrow} selectable>
          휴가 관리
        </Text>
        <Text style={styles.title} selectable>
          보유 휴가 일수
        </Text>
        <Text style={styles.description} selectable>
          규정값은 기본 제안이에요. 실제 부대에서 받은 일수로 모두 수정할 수
          있습니다.
        </Text>
      </View>

      <View style={styles.balanceGrid}>
        {BALANCE_KEYS.map((key) => {
          const balance = props.summary.balances.find(
            (item) => item.key === key,
          );
          return (
            <View key={key} style={styles.balanceField}>
              <Text style={styles.balanceLabel} selectable>
                {BALANCE_LABELS[key]}
              </Text>
              <Text style={styles.usedLabel} selectable>
                사용 {balance?.usedDays ?? 0}일
              </Text>
              <Input
                value={String(totals[key])}
                onChangeText={(value) =>
                  setTotals((current) => ({
                    ...current,
                    [key]: Math.max(0, Number(value) || 0),
                  }))
                }
                keyboardType="number-pad"
                accessibilityLabel={`${BALANCE_LABELS[key]} 총 보유일수`}
                style={styles.balanceInput}
              />
            </View>
          );
        })}
      </View>
      <Button
        title="휴가 일수 저장"
        variant="secondary"
        loading={updateBalances.isPending}
        onPress={() => void saveTotals()}
      />

      {props.branch !== "army" && (
        <View style={styles.regularCard}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.regularTitle} selectable>
                정기외박 자동 적립
              </Text>
              <Text style={styles.usedLabel} selectable>
                6주는 42일 · 회당 3일 또는 4일처럼 설정
              </Text>
            </View>
            <Switch
              value={regularEnabled}
              onValueChange={setRegularEnabled}
              trackColor={{ true: colors.primary, false: colors.hairline }}
            />
          </View>
          {regularEnabled && (
            <>
              <DatePickerRow
                label="다음 적립일"
                value={nextGrantDate}
                onChange={setNextGrantDate}
              />
              <View style={styles.regularNumbers}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Text style={styles.balanceLabel}>주기 (일)</Text>
                  <Input
                    value={String(intervalDays)}
                    onChangeText={(value) =>
                      setIntervalDays(Math.max(1, Number(value) || 1))
                    }
                    keyboardType="number-pad"
                  />
                </View>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Text style={styles.balanceLabel}>회당 적립 (일)</Text>
                  <Input
                    value={String(daysPerGrant)}
                    onChangeText={(value) =>
                      setDaysPerGrant(Math.max(1, Number(value) || 1))
                    }
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            </>
          )}
          <Button
            title="정기외박 설정 저장"
            variant="tertiary"
            loading={updateRegular.isPending}
            onPress={() => void saveRegular()}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  title: { color: colors.ink, fontSize: 22, fontWeight: "700" },
  description: { color: colors.body, fontSize: 13, lineHeight: 19 },
  balanceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  balanceField: { width: "47%", gap: spacing.xs },
  balanceLabel: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  usedLabel: { color: colors.mute, fontSize: 11 },
  balanceInput: {
    minHeight: 42,
    paddingVertical: spacing.sm,
    fontVariant: ["tabular-nums"],
  },
  regularCard: {
    backgroundColor: colors.primaryPale,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: spacing.lg,
    gap: spacing.md,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  regularTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  regularNumbers: { flexDirection: "row", gap: spacing.md },
});
