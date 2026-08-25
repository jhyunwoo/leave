/**
 * 내 휴가 목록의 빠른 상태 변경.
 *
 * 각 행이 자기 mutation을 소유해 한 휴가를 저장하는 동안에도 다른 휴가는 바로
 * 바꿀 수 있다. 반려·취소·복귀 완료는 서버·관리 흐름의 종료 상태라 읽기만 한다.
 */

import * as Haptics from "expo-haptics";
import { ActivityIndicator, Text, View } from "react-native";
import type { MyLeave } from "@leave/client";
import { useUpdateLeaveStatus } from "@leave/client";
import {
  isUserEditableLeaveStatus,
  LEAVE_STATUS_LABELS,
  USER_EDITABLE_LEAVE_STATUSES,
  type UserEditableLeaveStatus,
} from "@leave/shared";
import { notify } from "@/lib/dialog";
import { makeStyles, radius, spacing, useColors } from "@/theme";
import { NativeSegmentedControl } from "./segmented-control";

const QUICK_STATUS_LABELS: Record<UserEditableLeaveStatus, string> = {
  draft: "초안",
  shared: "희망",
  requested: "신청함",
  approved: "확정",
};

export function LeaveStatusControl(props: { leave: MyLeave }) {
  const styles = useStyles();
  const colors = useColors();
  const updateStatus = useUpdateLeaveStatus();
  const { leave } = props;
  const editableStatus = isUserEditableLeaveStatus(leave.status)
    ? leave.status
    : null;

  const changeStatus = async (status: UserEditableLeaveStatus) => {
    if (
      editableStatus === null ||
      updateStatus.isPending ||
      status === editableStatus
    )
      return;
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
    try {
      await updateStatus.mutateAsync({ id: leave.id, status });
    } catch (error) {
      notify(
        "상태 변경 실패",
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
      );
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text
          selectable
          accessibilityLiveRegion="polite"
          testID={`leave-status-current-${leave.id}`}
          style={styles.current}
        >
          상태 · {LEAVE_STATUS_LABELS[leave.status]}
        </Text>
        {updateStatus.isPending ? (
          <ActivityIndicator size="small" color={colors.brand} />
        ) : null}
      </View>

      {editableStatus !== null ? (
        <NativeSegmentedControl
          values={USER_EDITABLE_LEAVE_STATUSES}
          labels={QUICK_STATUS_LABELS}
          value={editableStatus}
          enabled={!updateStatus.isPending}
          onValueChange={(status) => void changeStatus(status)}
          testID={`leave-status-control-${leave.id}`}
        />
      ) : (
        <Text selectable style={styles.readOnlyHint}>
          종료된 상태예요. 수정에서 다시 변경할 수 있어요.
        </Text>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderCurve: "continuous",
    backgroundColor: colors.surfaceCard,
  },
  header: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  current: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: colors.ink,
  },
  readOnlyHint: { fontSize: 12, lineHeight: 18, color: colors.mute },
}));
