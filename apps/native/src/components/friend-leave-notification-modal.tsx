import {
  useNotificationLeaveDetails,
  type FriendLeaveNotification,
} from "@leave/client";
import { fmtRange, isConfirmedLeaveStatus } from "@leave/shared";
import { ActivityIndicator, Text, View } from "react-native";
import { makeStyles, spacing } from "@/theme";
import { Button } from "./button";
import { ContentPanel } from "./content-panel";
import { FormSheet } from "./form-sheet";
import { SheetScaffold } from "./sheet-scaffold";

export function FriendLeaveNotificationModal(props: {
  target: FriendLeaveNotification;
  date?: string;
  onClose: () => void;
}) {
  const styles = useStyles();
  const detail = useNotificationLeaveDetails(props.target, props.date);
  return (
    <FormSheet isPresented onDismiss={props.onClose}>
      <SheetScaffold title="친구 휴가 일정" onClose={props.onClose}>
        <Text style={styles.body}>
          {fmtRange(props.target.startDate, props.target.endDate)}
        </Text>
        <View style={styles.navigation}>
          <Button
            icon="left"
            title="이전 날짜"
            variant="secondary"
            size="sm"
            disabled={!detail.canPrevious}
            onPress={detail.previous}
          />
          <Text style={styles.title}>{detail.date}</Text>
          <Button
            icon="right"
            title="다음 날짜"
            variant="secondary"
            size="sm"
            disabled={!detail.canNext}
            onPress={detail.next}
          />
        </View>
        {detail.loading ? (
          <ActivityIndicator />
        ) : detail.message ? (
          <View style={styles.panel}>
            <Text style={styles.body}>{detail.message}</Text>
            <Button
              icon="refresh"
              title="다시 시도"
              onPress={() => void detail.retry()}
            />
          </View>
        ) : (
          <>
            <ContentPanel style={styles.panel}>
              <Text style={styles.title}>{detail.friendName}님의 휴가</Text>
              {detail.friendLeaves.length ? (
                detail.friendLeaves.map((leave) => (
                  <Text key={leave.leaveId} style={styles.body}>
                    {fmtRange(leave.startDate, leave.endDate)} ·{" "}
                    {isConfirmedLeaveStatus(leave.status)
                      ? "확정 휴가"
                      : "공유 휴가"}
                  </Text>
                ))
              ) : (
                <Text style={styles.body}>
                  이 날짜에는 친구의 공유 휴가가 없어요.
                </Text>
              )}
            </ContentPanel>
            <ContentPanel style={styles.panel}>
              <Text style={styles.title}>나의 휴가</Text>
              {detail.myLeaves.length ? (
                detail.myLeaves.map((leave) => (
                  <View key={leave.id}>
                    <Text style={styles.title}>{leave.title}</Text>
                    <Text style={styles.body}>
                      {fmtRange(leave.startDate, leave.endDate)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.body}>이 날짜에는 내 휴가가 없어요.</Text>
              )}
            </ContentPanel>
          </>
        )}
      </SheetScaffold>
    </FormSheet>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  navigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
    marginVertical: spacing.lg,
  },
  panel: { padding: spacing.lg, gap: spacing.md, marginBottom: spacing.md },
  title: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  body: { color: colors.body, fontSize: 14 },
}));
