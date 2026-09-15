/**
 * 외출 자동 적립 설정(네이티브) — 평일·주말 갈래마다 한 벌.
 * 사용처: 보유 휴가 화면.
 *
 * 정기외박 설정과 나란히 놓이지만 입력이 하나 적다. 외출은 어느 군이든 "한 달에
 * 몇 번"으로 운영돼 주기 단위가 언제나 달이고, 일 단위를 고를 이유가 없다.
 * 대신 회당 값의 뜻이 다르다 — 외출은 당일 복귀라 **일수가 아니라 횟수**다.
 */

import { useState } from "react";
import { Switch, Text, View } from "react-native";
import type { LeaveGrantsPage } from "@leave/client";
import { useUpdateOuting } from "@leave/client";
import {
  BALANCE_LABELS,
  fmtDateShort,
  fmtRangeTiny,
  isValidISODate,
  OUTING_DEFAULTS,
  outingBalanceKey,
  outingGuidance,
  type Branch,
  type OutingKind,
} from "@leave/shared";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { DatePickerRow } from "@/components/date-picker";
import { Input } from "@/components/field";
import { notify } from "@/lib/dialog";
import { makeStyles, spacing, useColors } from "@/theme";

type OutingFund = LeaveGrantsPage["outing"][number];

/** 서버 스키마(outingConfigSchema)와 같은 범위. */
const INTERVAL_LIMITS = { min: 1, max: 12 } as const;
const COUNT_LIMITS = { min: 1, max: 30 } as const;

export function OutingSettings(props: {
  branch: Branch;
  funds: readonly OutingFund[];
}) {
  const styles = useStyles();
  const guidance = outingGuidance(props.branch);
  return (
    <ContentPanel tone="accent" style={styles.card}>
      <View>
        <Text style={styles.title} selectable>
          외출 자동 적립
        </Text>
        <Text style={styles.hint} selectable>
          {guidance.summary} {guidance.detail}
        </Text>
      </View>

      {props.funds.map((fund) => (
        <OutingKindFields key={fund.kind} branch={props.branch} fund={fund} />
      ))}

      <Text style={styles.hint} selectable>
        {guidance.disclaimer}
      </Text>
    </ContentPanel>
  );
}

function OutingKindFields(props: { branch: Branch; fund: OutingFund }) {
  const styles = useStyles();
  const colors = useColors();
  const { fund } = props;
  const kind: OutingKind = fund.kind;
  const label = BALANCE_LABELS[outingBalanceKey(kind)];
  const preset = OUTING_DEFAULTS[props.branch][kind];
  const update = useUpdateOuting();

  const [enabled, setEnabled] = useState(fund.enabled);
  const [carryOver, setCarryOver] = useState(fund.carryOver);
  const [startDate, setStartDate] = useState(fund.startDate ?? "");
  // 숫자가 아니라 문자열로 들고 있다가 저장할 때 바꾼다(regular-overnight-settings
  // 주석과 같은 이유 — 마지막 한 자를 지우는 순간 0으로 접히면 안 된다).
  const [interval, setInterval] = useState(
    String(fund.intervalMonths ?? preset.intervalMonths),
  );
  const [count, setCount] = useState(
    String(fund.daysPerGrant ?? preset.countPerGrant),
  );

  const intervalValue = Number(interval);
  const countValue = Number(count);
  const intervalOk =
    Number.isInteger(intervalValue) &&
    intervalValue >= INTERVAL_LIMITS.min &&
    intervalValue <= INTERVAL_LIMITS.max;
  const countOk =
    Number.isInteger(countValue) &&
    countValue >= COUNT_LIMITS.min &&
    countValue <= COUNT_LIMITS.max;
  // 저장이 잠긴 이유를 항상 한 줄로 남긴다. 버튼만 잠그면 왜 안 되는지 알 수 없다.
  const blocker = !enabled
    ? null
    : !intervalOk || !countOk
      ? `주기는 ${INTERVAL_LIMITS.min}~${INTERVAL_LIMITS.max}개월, 회당 횟수는 ${COUNT_LIMITS.min}~${COUNT_LIMITS.max}회 사이로 입력해주세요.`
      : !isValidISODate(startDate)
        ? "주기 시작일을 선택해주세요."
        : null;

  const current = fund.cycles.find((cycle) => cycle.state === "current");

  const save = async () => {
    try {
      await update.mutateAsync(
        enabled
          ? {
              kind,
              enabled: true,
              startDate,
              // 외출은 언제나 달 단위다 — 일 단위 칸을 두지 않으므로 비워 보낸다.
              intervalDays: null,
              intervalMonths: intervalValue,
              daysPerGrant: countValue,
              carryOver,
            }
          : { kind, enabled: false },
      );
      notify("저장 완료", `${label} 적립 설정을 저장했어요.`);
    } catch (caught) {
      notify(
        "저장 실패",
        caught instanceof Error ? caught.message : "잠시 후 다시 시도해주세요",
      );
    }
  };

  return (
    <View style={styles.kind}>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} selectable>
            {label}
          </Text>
          <Text style={styles.hint} selectable>
            {current
              ? `이번 주기 ${fmtRangeTiny(current.start, current.end)} · ${current.usedDays}/${current.grantDays}회 사용`
              : "한 주기를 채울 때마다 자동으로 쌓여요"}
            {fund.nextGrantDate
              ? ` · 다음 적립 ${fmtDateShort(fund.nextGrantDate)}`
              : ""}
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
                부대가 안 쓴 외출을 다음 달로 넘겨주면 켜세요.
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
          {blocker ? (
            <Text style={styles.error} selectable>
              {blocker}
            </Text>
          ) : null}
          <View style={styles.numbers}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={styles.label}>주기 (개월)</Text>
              <Input
                value={interval}
                onChangeText={setInterval}
                keyboardType="number-pad"
                accessibilityLabel={`${label} 주기 개월`}
              />
            </View>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={styles.label}>회당 횟수</Text>
              <Input
                value={count}
                onChangeText={setCount}
                keyboardType="number-pad"
                accessibilityLabel={`${label} 회당 횟수`}
              />
            </View>
          </View>
        </>
      )}

      <Button
        icon="save"
        title={`${label} 설정 저장`}
        variant="tertiary"
        loading={update.isPending}
        disabled={blocker !== null}
        onPress={() => void save()}
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: { padding: spacing.lg, gap: spacing.lg },
  kind: { gap: spacing.md },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  label: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  hint: { color: colors.mute, fontSize: 11 },
  // 힌트와 같은 자리에 서므로 크기는 맞추고 색·굵기만 다르게 한다(field.tsx와 동일).
  error: { color: colors.negativeDeep, fontSize: 11, fontWeight: "600" },
  numbers: { flexDirection: "row", gap: spacing.md },
}));
