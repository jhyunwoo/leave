/**
 * 오류 화면(표시 전용).
 * 사용처: 루트 에러 경계(root-error-boundary.tsx)와 라우트 에러 경계(_layout.tsx).
 */

import { ScrollView, Text, View } from "react-native";
import { Button } from "@/components/button";
import type { FatalErrorRecord } from "@/lib/fatal-error";
import { makeStyles, radius, spacing } from "@/theme";

/**
 * 오류를 사용자에게 보여주는 마지막 화면. 루트 경계와 라우트 경계가 같이 쓴다.
 *
 * 원인 문자열을 그대로 노출하는 건 의도한 것이다. 프로덕션 크래시 리포트에는
 * JS 메시지가 남지 않아, 화면에 띄워 사용자가 그대로 전해주는 것 말고는
 * 무엇이 터졌는지 알 방법이 없다. selectable로 두어 복사할 수 있게 한다.
 *
 * `record`가 없는 호출도 있다 — 시작 시 서버에 닿지 못한 경우(루트 레이아웃의
 * `gate === "unreachable"`)는 터진 것이 아니라 기다려도 오지 않는 것이라
 * 보여줄 스택이 없다. 그 자리에 가짜 기록을 만들어 넣지 않는다.
 */
export function ErrorScreen(props: {
  title: string;
  body: string;
  record?: FatalErrorRecord;
  actionLabel: string;
  onAction: () => void;
}) {
  const styles = useStyles();
  const { record } = props;
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{props.title}</Text>
        <Text style={styles.body}>{props.body}</Text>

        {record ? (
          <View style={styles.detail}>
            <Text style={styles.detailText} selectable>
              {record.message}
            </Text>
            {record.stack ? (
              <Text style={styles.detailStack} selectable>
                {record.stack}
              </Text>
            ) : null}
            {record.componentStack ? (
              <Text style={styles.detailStack} selectable>
                {record.componentStack}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Button
          title={props.actionLabel}
          style={styles.button}
          onPress={props.onAction}
          testID="error-retry"
        />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvas },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  title: { fontSize: 24, fontWeight: "900", color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.body },
  detail: {
    gap: spacing.xs,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.md,
    borderCurve: "continuous",
    padding: spacing.md,
  },
  detailText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  detailStack: { fontSize: 11, lineHeight: 16, color: colors.mute },
  button: {
    alignSelf: "flex-start",
  },
}));
