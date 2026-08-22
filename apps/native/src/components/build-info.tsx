/**
 * 지금 돌고 있는 게 어느 빌드이고 어느 OTA인지 보여주는 한 줄짜리 표시.
 *
 * 배포가 사용자에게 닿았는지 확인할 방법이 앱 안에 없었다. 확인하려면 매번
 * 번들 해시를 긁고 `eas build:list`를 뒤져야 했는데, 정작 손에 든 기기가
 * 무엇을 실행 중인지가 가장 확실한 답이라 그 답을 화면에 내놓는다.
 *
 * 런타임 해시를 같이 보여주는 이유: `runtimeVersion` 정책이 fingerprint라
 * 이 값이 네이티브 빌드를 유일하게 식별한다. OTA가 어느 빌드를 겨냥해 발행됐는지는
 * 이 값이 맞아야만 판단할 수 있고, iOS와 Android는 서로 다른 값을 갖는다.
 */

import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { Text, View } from "react-native";
import { makeStyles, spacing } from "@/theme";

/** 해시는 앞자리만으로 충분히 구별된다. 전부 적으면 읽을 수 없다. */
function short(value: string | null | undefined, length: number) {
  return value ? value.slice(0, length) : null;
}

/** `08-22 12:41`. 연도는 빼도 어느 배포인지 가려지지 않고, 한 줄에 들어가야 한다. */
function formatPublishedAt(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function BuildInfo() {
  const styles = useStyles();

  // 이 화면은 웹으로도 빌드된다. 웹에는 네이티브 빌드도 OTA도 없어서 표시할 게 없다.
  if (process.env.EXPO_OS === "web") return null;

  const version = Application.nativeApplicationVersion ?? "?";
  const build = Application.nativeBuildVersion;
  const runtime = short(Updates.runtimeVersion, 7);

  const appLine = [
    `앱 ${version}${build ? ` (${build})` : ""}`,
    runtime && `런타임 ${runtime}`,
  ]
    .filter(Boolean)
    .join(" · ");

  // 개발 빌드에서는 expo-updates가 꺼져 있어 updateId·createdAt이 없다. 내장 번들로
  // 실행 중일 때도 마찬가지라, 두 경우를 굳이 나누지 않고 "내장"으로 함께 적는다.
  const updateId = short(Updates.updateId, 8);
  const otaLine =
    !Updates.isEnabled || Updates.isEmbeddedLaunch || !updateId
      ? "OTA 없음 (내장)"
      : [
          `OTA ${updateId}`,
          Updates.createdAt && formatPublishedAt(Updates.createdAt),
          Updates.channel && `(${Updates.channel})`,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <View style={styles.root} testID="build-info">
      <Text selectable style={styles.line}>
        {appLine}
      </Text>
      <Text selectable style={styles.line}>
        {otaLine}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { gap: spacing.xs / 2, alignItems: "center" },
  // 고지(official-disclaimer의 compact)와 같은 급으로 눌러 둔다. 평소에는 읽히지
  // 않다가 확인이 필요할 때만 찾아보는 정보다.
  line: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.mute,
    textAlign: "center",
  },
}));
