/**
 * 정기외박 자동 적립 설정(네이티브).
 * 사용처: 보유 휴가 화면. 전 군종이 쓰고, 주기의 길이와 단위만 군마다 다르다.
 */

import { useState } from "react";
import { Switch, Text, View } from "react-native";
import type { LeaveGrantsPage } from "@leave/client";
import { useUpdateRegularOvernight } from "@leave/client";
import {
  REGULAR_OVERNIGHT_DEFAULTS,
  REGULAR_OVERNIGHT_INTERVAL_LIMITS,
  isRegularOvernightIntervalValid,
  isValidISODate,
  regularOvernightFirstGrantPreview,
  regularOvernightIntervalForm,
  regularOvernightIntervalPayload,
  type Branch,
} from "@leave/shared";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { DatePickerRow } from "@/components/date-picker";
import { Input } from "@/components/field";
import { notify } from "@/lib/dialog";
import { makeStyles, spacing, useColors } from "@/theme";

/**
 * 정기외박 자동 적립 설정. 전 군종이 쓴다 — 주기의 길이와 단위만 군마다 다르다
 * (육군 3개월 1박 2일, 해·공군 42일 2박 3일).
 * 예전에는 프로필 탭의 휴가 총량 편집기 안에 있었고, 보유 휴가 화면으로 옮겨 왔다.
 */
export function RegularOvernightSettings(props: {
  branch: Branch;
  config: LeaveGrantsPage["regularOvernight"];
}) {
  const styles = useStyles();
  const colors = useColors();
  const update = useUpdateRegularOvernight();
  const [enabled, setEnabled] = useState(props.config.enabled);
  const [carryOver, setCarryOver] = useState(props.config.carryOver);
  const [startDate, setStartDate] = useState(props.config.startDate ?? "");
  // 주기·회당은 숫자가 아니라 문자열로 들고 있다가 저장할 때 바꾼다. 숫자로
  // 강제하면 마지막 한 자를 지우는 순간 Number("")가 0이 되고 폴백이 걸려 1로
  // 튄다 — 42를 지우고 30을 넣으려던 사람이 130을 얻는다. 빈 칸이라는 중간
  // 상태를 허용해야 "다 지우고 새로 입력"이 성립한다.
  // 단위는 저장된 설정이 있으면 그쪽을, 없으면 군별 통상 운영을 따른다.
  const initialInterval = regularOvernightIntervalForm(
    props.branch,
    props.config,
  );
  const [intervalUnit] = useState(initialInterval.unit);
  const [interval, setInterval] = useState(String(initialInterval.value));
  const [daysPerGrant, setDaysPerGrant] = useState(
    String(
      props.config.daysPerGrant ??
        REGULAR_OVERNIGHT_DEFAULTS[props.branch].daysPerGrant,
    ),
  );

  const limits = REGULAR_OVERNIGHT_INTERVAL_LIMITS[intervalUnit];
  const intervalForm = { unit: intervalUnit, value: Number(interval) };
  const perGrant = Number(daysPerGrant);
  // 서버 스키마(regularOvernightConfigSchema)와 같은 범위를 미리 막아 준다.
  // 상태를 되돌리는 대신 저장을 잠그는 쪽이라 입력 도중에는 아무것도 건드리지 않는다.
  const intervalOk = isRegularOvernightIntervalValid(intervalForm);
  const perGrantOk =
    Number.isInteger(perGrant) && perGrant >= 1 && perGrant <= 30;
  // 저장이 잠긴 이유를 항상 한 줄로 남긴다. 버튼만 잠그면 왜 안 되는지 알 수 없다.
  const blocker = !enabled
    ? null
    : !intervalOk || !perGrantOk
      ? `주기는 ${limits.min}~${limits.max}${limits.unitLabel}, 회당 적립은 1~30일 사이로 입력해주세요.`
      : !isValidISODate(startDate)
        ? "주기 시작일을 선택해주세요."
        : null;
  const firstGrant = regularOvernightFirstGrantPreview(startDate, intervalForm);

  const save = async () => {
    try {
      await update.mutateAsync(
        enabled
          ? {
              enabled: true,
              startDate,
              ...regularOvernightIntervalPayload(intervalForm),
              daysPerGrant: perGrant,
              carryOver,
            }
          : { enabled: false },
      );
      notify("저장 완료", "정기외박 적립 설정을 저장했어요.");
    } catch (caught) {
      notify(
        "저장 실패",
        caught instanceof Error ? caught.message : "잠시 후 다시 시도해주세요",
      );
    }
  };

  return (
    <ContentPanel tone="accent" style={styles.card}>
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
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} selectable>
                주기가 끝나도 이월하기
              </Text>
              <Text style={styles.hint} selectable>
                부대가 정기외박을 쌓아두면 켜세요. 안 쓴 몫이 사라지지 않고 계속
                모여요.
              </Text>
            </View>
            <Switch
              value={carryOver}
              onValueChange={setCarryOver}
              trackColor={{ true: colors.primary, false: colors.hairline }}
            />
          </View>
          <DatePickerRow
            label="주기 시작일"
            value={startDate}
            onChange={setStartDate}
          />
          {/* 값이 비면 "이 날부터 일이 지난 날"이 되므로, 안내 문장은 두 값이 다
              성립할 때만 보여준다. 아닐 때는 같은 자리에 저장이 잠긴 이유를 적는다. */}
          {blocker ? (
            <Text style={styles.error} selectable>
              {blocker}
            </Text>
          ) : (
            <Text style={styles.hint} selectable>
              이 날부터 {interval}
              {limits.unitLabel}이 지난 {firstGrant}에 {perGrant}일이 처음
              적립되면서 1주기가 시작돼요.{" "}
              {carryOver
                ? "안 쓴 몫은 사라지지 않고 계속 쌓여요."
                : "한 주기 몫은 다음 적립 전날까지 쓰고 남으면 사라져요."}
              {props.config.nextGrantDate
                ? ` 다음 적립일은 ${props.config.nextGrantDate}이에요.`
                : ""}
            </Text>
          )}
          <View style={styles.numbers}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={styles.label}>{limits.label}</Text>
              <Input
                value={interval}
                onChangeText={setInterval}
                keyboardType="number-pad"
                accessibilityLabel={`정기외박 주기 ${limits.unitLabel}`}
              />
            </View>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={styles.label}>회당 적립 (일)</Text>
              <Input
                value={daysPerGrant}
                onChangeText={setDaysPerGrant}
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
        disabled={blocker !== null}
        onPress={() => void save()}
      />
    </ContentPanel>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  label: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  hint: { color: colors.mute, fontSize: 11 },
  // 힌트와 같은 자리에 서므로 크기는 맞추고 색·굵기만 다르게 한다(field.tsx와 동일).
  error: { color: colors.negativeDeep, fontSize: 11, fontWeight: "600" },
  numbers: { flexDirection: "row", gap: spacing.md },
}));
