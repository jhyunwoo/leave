/**
 * 휴가 상세 화면(네이티브) — 라우트 껍데기.
 *
 * 본문은 `leave-detail-content.tsx`에 있다. 이 파일이 맡는 건 라우트에 딸린
 * 일들뿐이다 — 파라미터 읽기, 없는 휴가 처리, 툴바, 삭제 후 뒤로가기.
 * 넓은 창의 내 휴가 화면은 같은 본문을 오른쪽 패널에 그대로 그린다.
 */

import type { ISODate } from "@leave/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useDeleteLeave, useMyLeaves } from "@leave/client";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { LeaveFormModal } from "@/components/leave-form-modal";
import { WebScreenActions } from "@/components/web-screen-actions";
import { confirmAction, notify } from "@/lib/dialog";
import { layout, makeStyles, spacing, useColors } from "@/theme";
import { LeaveDetailContent } from "./leave-detail-content";

/**
 * 내 휴가 한 건의 상세.
 *
 * 알림에서 들어오면 `date`로 어느 초과일 때문에 왔는지가 함께 넘어온다.
 * 알림이 들고 있는 leaveId는 초과를 유발한 "남의" 휴가라 이동에 쓸 수 없다 —
 * 알림 화면이 초과일을 덮는 내 휴가를 먼저 찾아 이 화면으로 넘긴다.
 */
export function LeaveDetailScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { leaveId, date } = useLocalSearchParams<{
    leaveId: string;
    date?: string;
  }>();
  const router = useRouter();
  const myLeaves = useMyLeaves();
  const del = useDeleteLeave();
  const [editing, setEditing] = useState(false);

  const leave = myLeaves.data?.leaves.find((l) => l.id === leaveId) ?? null;

  if (myLeaves.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} size="large" />
      </View>
    );
  }

  // 알림을 받은 뒤 계획을 지웠거나 기간을 바꾼 경우.
  if (!leave) {
    return (
      <View style={[styles.center, { padding: spacing.xl }]}>
        <ContentPanel style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>휴가를 찾을 수 없어요</Text>
          <Text style={styles.emptyBody}>
            이미 삭제했거나 기간을 바꾼 계획일 수 있어요.
          </Text>
          <Button icon="left" title="돌아가기" onPress={() => router.back()} />
        </ContentPanel>
      </View>
    );
  }

  const confirmDelete = async () => {
    const confirmed = await confirmAction({
      title: "휴가 삭제",
      message: `"${leave.title}" 휴가를 삭제할까요?`,
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await del.mutateAsync(leave.id);
      // 삭제하면 이 화면이 가리킬 대상이 사라지므로 목록으로 되돌아간다.
      router.back();
    } catch {
      notify("삭제하지 못했어요", "잠시 후 다시 시도해주세요.");
    }
  };

  return (
    <>
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          // 상세는 읽는 화면이라 넓은 창에서도 줄 길이를 묶어 둔다.
          { maxWidth: layout.readableContent },
        ]}
      >
        <LeaveDetailContent
          leave={leave}
          focusDate={(date as ISODate | undefined) ?? null}
          header={
            /* 웹에는 툴바가 없으므로 수정·삭제를 본문 맨 위에서 연다. */
            <WebScreenActions
              actions={[
                {
                  id: "edit",
                  icon: "edit" as const,
                  title: "수정",
                  variant: "primary",
                  onPress: () => setEditing(true),
                  testID: "leave-detail-edit",
                },
                {
                  id: "delete",
                  icon: "trash" as const,
                  title: "삭제",
                  variant: "danger",
                  disabled: del.isPending,
                  onPress: () => void confirmDelete(),
                  testID: "leave-detail-delete",
                },
              ]}
            />
          }
        />
      </ScrollView>

      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="pencil" onPress={() => setEditing(true)}>
          수정
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Button
          icon="trash"
          disabled={del.isPending}
          onPress={() => void confirmDelete()}
        >
          삭제
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      {editing && (
        <LeaveFormModal
          visible
          editing={leave}
          onClose={() => setEditing(false)}
          onSaved={(result) => {
            // 앞 휴가에 흡수되면 이 화면이 가리키던 휴가가 사라진다. 합쳐진 쪽으로 옮긴다.
            if (result.leave.id !== leaveId) {
              router.replace({
                pathname: "/leave/[leaveId]",
                params: { leaveId: result.leave.id },
              });
            }
          }}
        />
      )}
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    width: "100%",
    alignSelf: "center",
    padding: spacing.lg,
    paddingTop: process.env.EXPO_OS === "web" ? 80 : spacing.lg,
    gap: spacing.lg,
    paddingBottom: 120,
  },
  center: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    padding: spacing.xxl,
    gap: spacing.lg,
    maxWidth: 420,
    width: "100%",
  },
  emptyTitle: { fontSize: 24, fontWeight: "900", color: colors.ink },
  emptyBody: { fontSize: 15, lineHeight: 22, color: colors.body },
}));
