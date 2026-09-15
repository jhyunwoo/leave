/**
 * 알림함 화면(네이티브).
 * 열면 전부 읽음 처리되고, 초과 알림은 해당 휴가 상세로 이어진다.
 *
 * ## 창 폭에 따라 읽는 방식이 달라진다
 *
 *   compact  : 최근 알림을 큰 카드로 떼어 놓고 그 아래에 이전 알림을 쌓는다.
 *              좁은 화면에서는 "가장 최근 것"이 곧 위계라 이게 가장 빠르다.
 *   medium+  : 왼쪽 목록 · 오른쪽 상세의 받은편지함. 알림 하나를 확인하려고
 *              화면을 떠났다가 뒤로 돌아오는 왕복이 사라지고, 목록에서 위아래로
 *              훑으며 어떤 날짜가 걸렸는지 비교할 수 있다. 위계는 카드 크기 대신
 *              선택 상태와 안 읽음 표시가 진다.
 *
 * 친구 휴가 알림은 비교 모달로, 초과 알림은 해당 날짜의 내 휴가로 연결한다.
 */

import { fmtDateTimeShort, fmtDateShort } from "@leave/shared/calendar";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Text,
  View,
} from "react-native";
import {
  useDeleteNotification,
  useMarkNotificationsRead,
  useMyLeaves,
  useNotifications,
  type MyLeave,
  type NotificationList,
} from "@leave/client";
import { inspectorWidth, useWindowSizeClass } from "@/adaptive";
import { ActionMenu } from "@/components/action-menu";
import { ContentPanel } from "@/components/content-panel";
import { WebScreenActions } from "@/components/web-screen-actions";
import { FriendLeaveNotificationModal } from "@/components/friend-leave-notification-modal";
import { notify } from "@/lib/dialog";
import { useRefresh } from "@/lib/use-refresh";
import { layout, makeStyles, radius, spacing, useColors } from "@/theme";

type Notification = NotificationList["notifications"][number];

export function NotificationsScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { sizeClass, isCompact } = useWindowSizeClass();
  const list = useNotifications();
  const refresh = useRefresh(list);
  // 열이 여럿인 레이아웃에서는 어디를 당겨도 되도록 각 열에 같은 컨트롤을 단다.
  const refreshControl = (
    <RefreshControl
      refreshing={refresh.refreshing}
      onRefresh={refresh.onRefresh}
      tintColor={colors.mute}
    />
  );
  const markRead = useMarkNotificationsRead();
  const del = useDeleteNotification();
  const myLeaves = useMyLeaves();
  const [friendDetail, setFriendDetail] = useState<{
    notification: Notification;
    date?: string;
  } | null>(null);
  const router = useRouter();

  const [pickedId, setPickedId] = useState<string | null>(null);

  /**
   * 초과일에 걸린 내 휴가를 되짚는다.
   *
   * 알림의 leaveId는 초과를 유발한 "남의" 휴가라 이동에 쓸 수 없다. 알림을 받은
   * 사람은 정의상 초과일에 자기 휴가가 있으므로 여기서 되짚을 수 있다 —
   * 다만 알림을 받은 뒤 그 휴가를 지웠거나 기간을 바꿨으면 못 찾을 수 있다.
   */
  const resolveDate = (date: string): MyLeave | null =>
    myLeaves.data?.leaves.find(
      (leave) => leave.startDate <= date && date <= leave.endDate,
    ) ?? null;

  const resolveTarget = (dates: string[]) => {
    for (const date of [...dates].sort()) {
      const mine = resolveDate(date);
      if (mine) return { leaveId: mine.id, date };
    }
    return null;
  };

  const openDates = (dates: string[]) => {
    const target = resolveTarget(dates);
    if (!target) {
      notify(
        "휴가를 찾을 수 없어요",
        "이미 삭제하거나 기간을 바꾼 계획일 수 있어요.",
      );
      return;
    }
    router.push({
      pathname: "/leave/[leaveId]",
      params: { leaveId: target.leaveId, date: target.date },
    });
  };

  const openNotification = (
    notification: Notification,
    dates = notification.dates,
  ) => {
    if (notification.friendLeave) {
      setFriendDetail({ notification, date: dates[0] });
      return;
    }
    if (dates.length === 0) {
      notify(
        "연결 정보가 없는 알림이에요",
        "이전 알림은 친구 탭에서 일정을 확인해주세요.",
      );
      return;
    }
    openDates(dates);
  };

  /**
   * 알림 한 건을 지운다. 확인을 묻지 않는다 — 메일함처럼, 알림을 지워도 잃는 것이
   * 없고 되짚을 휴가는 캘린더에 그대로 남는다.
   */
  const remove = (notification: Notification) => {
    void del.mutateAsync(notification.id).then(
      // 넓은 창에서 고른 알림을 지웠으면 선택을 놓는다. selected는 매 렌더에 다시
      // 계산되므로 화면은 알아서 최신 알림으로 떨어지고, 여기서는 죽은 id만 치운다.
      () =>
        setPickedId((current) =>
          current === notification.id ? null : current,
        ),
      () => notify("삭제하지 못했어요", "잠시 후 다시 시도해주세요."),
    );
  };

  /** 알림 하나의 부가 동작. 행 전체 탭(휴가 이동)과 섞이지 않게 메뉴 뒤에 둔다. */
  const renderMenu = (notification: Notification) => (
    <ActionMenu
      label={`${notification.title} 알림 작업`}
      buttonLabel="관리"
      testID={`notification-actions-${notification.id}`}
      actions={[
        {
          id: "delete",
          title: "삭제",
          systemImage: "trash",
          destructive: true,
          disabled: del.isPending,
          onPress: () => remove(notification),
        },
      ]}
    />
  );

  /** 날짜 배지 줄. 배지 하나하나가 그 날짜의 상세로 가는 입구다. */
  const renderDates = (notification: Notification) =>
    notification.dates.length > 0 ? (
      <View style={styles.dateRow}>
        {notification.dates.map((date) => (
          <Pressable
            key={date}
            accessibilityRole="button"
            accessibilityLabel={`${fmtDateShort(date)} 휴가 상세 보기`}
            onPress={() => openNotification(notification, [date])}
            style={styles.dateChip}
          >
            <Text style={styles.dateChipText}>{fmtDateShort(date)}</Text>
          </Pressable>
        ))}
      </View>
    ) : null;

  const notifications = list.data?.notifications ?? [];
  const [latest, ...earlier] = notifications;

  // 넓은 창에서는 아무것도 고르지 않았으면 가장 최근 알림을 편다. 상태를 이펙트로
  // 맞추지 않고 읽을 때 대신 고르므로, 목록이 바뀌어도 어긋나지 않는다.
  const selected =
    notifications.find((item) => item.id === pickedId) ?? latest ?? null;

  const webHeader =
    process.env.EXPO_OS === "web" ? (
      <View style={styles.webHeader}>
        <Text style={styles.webTitle}>알림</Text>
        {/* 웹에는 툴바가 없으므로 툴바에 있던 동작을 여기서 연다. */}
        <WebScreenActions
          actions={[
            {
              id: "settings",
              icon: "settings" as const,
              title: "설정",
              onPress: () => router.push("/notifications/settings"),
              testID: "notifications-settings",
            },
            // 읽지 않은 알림이 없으면 툴바에서도 숨는 버튼이다.
            ...(list.data && list.data.unreadCount > 0
              ? [
                  {
                    id: "read-all",
                    icon: "check" as const,
                    title: markRead.isPending ? "처리 중…" : "모두 읽음",
                    variant: "primary" as const,
                    disabled: markRead.isPending,
                    onPress: () => void markRead.mutateAsync(),
                    testID: "notifications-read-all",
                  },
                ]
              : []),
          ]}
        />
      </View>
    ) : null;

  const emptyPanel = (
    <ContentPanel style={styles.empty}>
      <Text style={styles.emptyTitle}>아직 알림이 없어요</Text>
      <Text style={styles.emptyCaption}>
        내 휴가 기간에 최대 출타 인원이 초과되면 알려드릴게요.
      </Text>
    </ContentPanel>
  );

  if (list.isPending) {
    return (
      <>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.ink} />
        </View>
        {/* 아직 개수를 모르므로 "모두 읽음"은 숨겨 둔다. */}
        <NotificationsToolbar
          hasUnread={false}
          pending={markRead.isPending}
          onSettings={() => router.push("/notifications/settings")}
          onReadAll={() => void markRead.mutateAsync()}
        />
      </>
    );
  }

  return (
    <>
      {friendDetail?.notification.friendLeave && (
        <FriendLeaveNotificationModal
          target={friendDetail.notification.friendLeave}
          date={friendDetail.date}
          onClose={() => setFriendDetail(null)}
        />
      )}
      {isCompact ? (
        <ScrollView
          style={styles.root}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          refreshControl={refreshControl}
        >
          {webHeader}
          {!latest ? (
            emptyPanel
          ) : (
            <>
              {/* 최근 알림은 목록에서 떼어내 가장 먼저, 가장 크게 보여준다.
                  카드 전체가 아니라 제목·본문만 탭 대상이다 — 관리 메뉴가 카드
                  안에 들어오면서, 누르는 곳마다 다른 일이 일어나면 안 된다. */}
              <ContentPanel
                tone={latest.read ? "plain" : "danger"}
                style={styles.latestCard}
              >
                <View style={styles.latestHeader}>
                  <Text style={styles.eyebrow}>최근 알림</Text>
                  {!latest.read && <View style={styles.unreadDot} />}
                  <View style={styles.headerSpacer} />
                  {renderMenu(latest)}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`최근 알림: ${latest.title}. 휴가 상세 보기`}
                  testID="latest-notification"
                  onPress={() => openNotification(latest)}
                  style={styles.latestTap}
                >
                  <Text style={styles.latestTitle} selectable>
                    {latest.title}
                  </Text>
                  <Text style={styles.latestBody} selectable>
                    {latest.body}
                  </Text>
                </Pressable>
                {renderDates(latest)}
                <View style={styles.latestFooter}>
                  <Text style={styles.time}>
                    {fmtDateTimeShort(latest.createdAt)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${latest.title} 휴가 상세 보기`}
                    onPress={() => openNotification(latest)}
                    style={styles.detailButton}
                  >
                    <Text style={styles.detailLink}>자세히</Text>
                  </Pressable>
                </View>
              </ContentPanel>

              {earlier.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>이전 알림</Text>
                  <ContentPanel style={styles.list}>
                    {earlier.map((n, index) => (
                      <NotificationRow
                        key={n.id}
                        notification={n}
                        divider={index > 0}
                        onPress={() => openNotification(n)}
                        dates={renderDates(n)}
                        menu={renderMenu(n)}
                      />
                    ))}
                  </ContentPanel>
                </>
              )}
            </>
          )}
        </ScrollView>
      ) : (
        <View style={styles.root}>
          <View style={styles.columns}>
            {/* 고정 폭은 ScrollView가 아니라 감싸는 View에 준다 — RN Web은
                ScrollView 바깥 컨테이너에 flex-grow:1을 강제로 붙여, style로
                준 width가 growth에 밀려 다른 값으로 자란다. View는 그 규칙이
                없어 폭이 그대로 지켜진다. */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <ScrollView
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={styles.columnContent}
                refreshControl={refreshControl}
              >
                {webHeader}
                {!latest ? (
                  emptyPanel
                ) : (
                  <ContentPanel style={styles.list}>
                    {notifications.map((n, index) => (
                      <NotificationRow
                        key={n.id}
                        notification={n}
                        divider={index > 0}
                        selected={n.id === selected?.id}
                        onPress={() => setPickedId(n.id)}
                        menu={renderMenu(n)}
                      />
                    ))}
                  </ContentPanel>
                )}
              </ScrollView>
            </View>

            <View style={{ width: inspectorWidth(sizeClass) }}>
              <ScrollView
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={styles.columnContent}
                showsVerticalScrollIndicator={false}
              >
                {selected ? (
                  <ContentPanel
                    tone={selected.read ? "plain" : "danger"}
                    style={styles.latestCard}
                    testID="notification-detail"
                  >
                    <View style={styles.latestHeader}>
                      <Text style={styles.eyebrow}>
                        {selected.read ? "알림" : "안 읽음"}
                      </Text>
                      {!selected.read && <View style={styles.unreadDot} />}
                      <View style={styles.headerSpacer} />
                      {renderMenu(selected)}
                    </View>
                    <Text style={styles.latestTitle} selectable>
                      {selected.title}
                    </Text>
                    <Text style={styles.latestBody} selectable>
                      {selected.body}
                    </Text>
                    <Text style={styles.time}>
                      {fmtDateTimeShort(selected.createdAt)}
                    </Text>

                    {selected.friendLeave && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => openNotification(selected)}
                        style={styles.detailButton}
                      >
                        <Text style={styles.detailLink}>자세히</Text>
                      </Pressable>
                    )}
                    {selected.dates.length > 0 ? (
                      <View style={styles.affected}>
                        <Text style={styles.sectionTitle}>걸린 날짜</Text>
                        {selected.dates.map((date) => {
                          const mine = resolveDate(date);
                          return (
                            <Pressable
                              key={date}
                              accessibilityRole="button"
                              accessibilityLabel={
                                mine
                                  ? `${fmtDateShort(date)}, ${mine.title} 상세 보기`
                                  : `${fmtDateShort(date)}, 연결된 내 휴가 없음`
                              }
                              disabled={!mine}
                              onPress={() => openNotification(selected, [date])}
                              style={styles.affectedRow}
                            >
                              <Text style={styles.affectedDate}>
                                {fmtDateShort(date)}
                              </Text>
                              <Text
                                style={styles.affectedLeave}
                                numberOfLines={1}
                              >
                                {mine ? mine.title : "연결된 계획 없음"}
                              </Text>
                              {mine ? (
                                <Text style={styles.detailLink}>열기</Text>
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </ContentPanel>
                ) : (
                  emptyPanel
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      )}

      <NotificationsToolbar
        hasUnread={Boolean(list.data && list.data.unreadCount > 0)}
        pending={markRead.isPending}
        onSettings={() => router.push("/notifications/settings")}
        onReadAll={() => void markRead.mutateAsync()}
      />
    </>
  );
}

function NotificationsToolbar(props: {
  hasUnread: boolean;
  pending: boolean;
  onSettings: () => void;
  onReadAll: () => void;
}) {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button icon="gearshape" onPress={props.onSettings}>
        설정
      </Stack.Toolbar.Button>
      <Stack.Toolbar.Button
        hidden={!props.hasUnread}
        disabled={props.pending}
        onPress={props.onReadAll}
      >
        {props.pending ? "처리 중…" : "모두 읽음"}
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}

/**
 * 목록 한 줄. 좁은 창에서는 눌러서 휴가 상세로 가고, 넓은 창에서는 눌러서
 * 오른쪽 상세를 바꾼다 — 그래서 동작은 호출자가 준다.
 */
function NotificationRow(props: {
  notification: Notification;
  divider: boolean;
  selected?: boolean;
  onPress: () => void;
  /** 좁은 창에서만 줄 안에 날짜 배지를 함께 그린다. */
  dates?: React.ReactNode;
  /** 삭제 등 부가 동작 메뉴. 탭 대상 바깥에 두어 눌러야 열린다. */
  menu?: React.ReactNode;
}) {
  const styles = useStyles();
  const colors = useColors();
  const n = props.notification;
  return (
    // 배경·구분선·선택 표시는 껍데기가 진다. 안쪽 Pressable은 탭 범위만 맡아,
    // 메뉴 버튼이 "행 전체 누르기"에 먹히지 않는다.
    <View
      style={[
        styles.rowShell,
        props.divider && styles.rowDivider,
        !n.read && styles.unreadRow,
        props.selected && styles.selectedRow,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={
          props.selected === undefined
            ? undefined
            : { selected: props.selected }
        }
        accessibilityLabel={`${n.title}${n.read ? "" : ", 안 읽음"}`}
        onPress={props.onPress}
        style={styles.rowTap}
      >
        <View
          style={[
            styles.dot,
            { backgroundColor: n.read ? colors.hairline : colors.negative },
          ]}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={[styles.cardTitle, n.read && styles.readText]}>
            {n.title}
          </Text>
          <Text
            style={[styles.cardBody, n.read && styles.readText]}
            numberOfLines={props.selected === undefined ? undefined : 2}
          >
            {n.body}
          </Text>
          {props.dates}
          <Text style={styles.time}>{fmtDateTimeShort(n.createdAt)}</Text>
        </View>
      </Pressable>
      {props.menu}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  loading: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    maxWidth: layout.readableContent,
    alignSelf: "center",
    padding: spacing.lg,
    paddingTop: process.env.EXPO_OS === "web" ? 80 : spacing.lg,
    gap: spacing.lg,
    paddingBottom: 120,
  },
  columns: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.lg,
    width: "100%",
    maxWidth: layout.workspaceContent,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
  },
  columnContent: {
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
  empty: {
    padding: spacing.xxxl,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: colors.ink },
  emptyCaption: { fontSize: 13, color: colors.body, textAlign: "center" },
  latestCard: { padding: spacing.xl, gap: spacing.sm },
  latestHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  // 머리글 왼쪽 표시들과 오른쪽 관리 메뉴를 갈라 놓는다.
  headerSpacer: { flex: 1 },
  latestTap: { gap: spacing.sm },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: colors.brand,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.negative,
  },
  latestTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  latestBody: { fontSize: 14, lineHeight: 20, color: colors.body },
  latestFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  detailLink: { fontSize: 13, fontWeight: "700", color: colors.brand },
  /**
   * 혼자 서 있는 "자세히"에만 붙인다. 글자만 있을 때는 카드 안의 다른 brand 색
   * 문구와 구분되지 않아 누를 수 있다는 것이 드러나지 않았다.
   *
   * 걸린 날짜 줄의 "열기"에는 붙이지 않는다 — 거기서는 줄 전체가 이미 버튼이고,
   * 그 안의 글자는 눌린다는 신호일 뿐이라 껍데기를 씌우면 버튼 속 버튼이 된다.
   */
  detailButton: {
    alignSelf: "flex-start",
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.mute,
    paddingHorizontal: spacing.sm,
    marginBottom: -spacing.sm,
  },
  affected: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  affectedRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderCurve: "continuous",
    backgroundColor: colors.canvas,
  },
  affectedDate: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.negativeDeep,
    fontVariant: ["tabular-nums"],
  },
  affectedLeave: { flex: 1, minWidth: 0, fontSize: 13, color: colors.body },
  list: { paddingHorizontal: spacing.lg, overflow: "hidden" },
  rowShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingRight: spacing.sm,
    // 선택 표시선 자리를 미리 비워 둬 고를 때 줄이 흔들리지 않게 한다.
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  rowTap: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    gap: spacing.md,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  unreadRow: { backgroundColor: colors.negativeTint },
  selectedRow: {
    borderLeftColor: colors.brand,
    backgroundColor: colors.primaryPale,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  cardTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
  cardBody: { fontSize: 14, color: colors.body, lineHeight: 20 },
  readText: { color: colors.mute },
  dateRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  // 안 읽은 카드는 배경이 negativeTint라 같은 톤 배지는 묻힌다. 테두리로 세운다.
  dateChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.negative,
  },
  dateChipText: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
  time: { fontSize: 12, color: colors.mute, marginTop: 2 },
}));
