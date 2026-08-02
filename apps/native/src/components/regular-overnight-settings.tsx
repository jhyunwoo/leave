import { useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import type { LeaveGrantsPage } from "@/api/queries";
import { useUpdateRegularOvernight } from "@/api/queries";
import { Button } from "@/components/button";
import { DatePickerRow } from "@/components/date-picker";
import { Input } from "@/components/field";
import { colors, radius, spacing } from "@/theme";

/**
 * 정기외박 자동 적립 설정. 잔여량이 이 설정에서 파생하므로 육군에서는 쓰지 않는다.
 * 예전에는 프로필 탭의 휴가 총량 편집기 안에 있었고, 보유 휴가 화면으로 옮겨 왔다.
 */
export function RegularOvernightSettings(props: {
  config: LeaveGrantsPage["regularOvernight"];
}) {
  const update = useUpdateRegularOvernight();
  const [enabled, setEnabled] = useState(props.config.enabled);
  const [startDate, setStartDate] = useState(props.config.startDate ?? "");
  const [intervalDays, setIntervalDays] = useState(
    props.config.intervalDays ?? 42,
  );
  const [daysPerGrant, setDaysPerGrant] = useState(
    props.config.daysPerGrant ?? 3,
  );

  const save = async () => {
    try {
      await update.mutateAsync(
        enabled
          ? { enabled: true, startDate, intervalDays, daysPerGrant }
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
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} selectable>
            정기외박 자동 적립
          </Text>
          <Text style={styles.hint} selectable>
            한 주기를 채울 때마다 자동으로 쌓여요
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ true: colors.primary, false: colors.hairline }}
        />
      </View>

      {enabled && (
        <>
          <DatePickerRow
            label="주기 시작일"
            value={startDate}
            onChange={setStartDate}
          />
          <Text style={styles.hint} selectable>
            이 날부터 {intervalDays}일이 지나면 {daysPerGrant}일이 처음 적립되고,
            이후 {intervalDays}일마다 반복돼요.
            {props.config.nextGrantDate
              ? ` 다음 적립일은 ${props.config.nextGrantDate}이에요.`
              : ""}
          </Text>
          <View style={styles.numbers}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={styles.label}>주기 (일)</Text>
              <Input
                value={String(intervalDays)}
                onChangeText={(value) =>
                  setIntervalDays(Math.max(1, Number(value) || 1))
                }
                keyboardType="number-pad"
                accessibilityLabel="정기외박 주기 일수"
              />
            </View>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={styles.label}>회당 적립 (일)</Text>
              <Input
                value={String(daysPerGrant)}
                onChangeText={(value) =>
                  setDaysPerGrant(Math.max(1, Number(value) || 1))
                }
                keyboardType="number-pad"
                accessibilityLabel="정기외박 회당 적립 일수"
              />
            </View>
          </View>
        </>
      )}

      <Button
        title="정기외박 설정 저장"
        variant="tertiary"
        loading={update.isPending}
        onPress={() => void save()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primaryPale,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: spacing.lg,
    gap: spacing.md,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  label: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  hint: { color: colors.mute, fontSize: 11 },
  numbers: { flexDirection: "row", gap: spacing.md },
});
