/**
 * 공개 프로필 링크 공유 버튼.
 *
 * 공유 시트만 열면 사용자가 시트를 닫은 뒤 주소를 다시 찾을 수 없다. 그래서
 * 정본 HTTPS 주소를 먼저 클립보드에 넣고, 그 다음 시스템 공유 시트를 연다.
 * 커스텀 스킴은 앱이 없는 기기에서 막히므로 공유하지 않는다.
 *
 * **나가는 것은 주소 하나뿐이다.** 예전에는 `@아이디`를 함께 실었는데, 받는 쪽에
 * 붙는 결과가 `@hyunwoo https://leave.moveto.kr/u/hyunwoo`가 되어 그대로 주소창에
 * 넣거나 다시 옮겨 붙일 수 없었다. 누가 보냈는지는 대화창이 이미 말해 준다.
 * 안드로이드의 `title`도 같은 이유로 비운다 — 메일 앱이 제목으로 가져가고, 일부
 * 앱은 본문에 덧붙인다.
 */

import * as Clipboard from "expo-clipboard";
import { profileLink } from "@leave/shared";
import { useState } from "react";
import { Share, Text, View } from "react-native";
import { Button } from "@/components/button";
import { spacing, useColors } from "@/theme";

export function ProfileShareButton(props: {
  username: string;
  own?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const url = profileLink(props.username);

  const share = async () => {
    if (sharing) return;
    setSharing(true);

    let copied = false;
    try {
      copied = await Clipboard.setStringAsync(url);
      setStatus(
        copied
          ? "링크를 복사했어요. 공유할 앱을 선택해주세요."
          : "링크를 복사하지 못했지만 바로 공유할 수 있어요.",
      );
    } catch {
      setStatus("링크를 복사하지 못했지만 바로 공유할 수 있어요.");
    }

    try {
      await Share.share(
        // 안드로이드는 `url`을 보지 않는다. 주소를 `message`에 실어야 나간다.
        process.env.EXPO_OS === "ios" ? { url } : { message: url },
        process.env.EXPO_OS === "android"
          ? { dialogTitle: "프로필 링크 공유" }
          : undefined,
      );
    } catch {
      setStatus(
        copied
          ? "링크는 복사했지만 공유 시트를 열지 못했어요."
          : "링크를 복사하거나 공유하지 못했어요.",
      );
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <Button
        icon="share"
        title={props.own ? "내 프로필 링크 공유" : "프로필 링크 공유"}
        variant="secondary"
        loading={sharing}
        onPress={() => void share()}
        testID={props.testID ?? "profile-share"}
      />
      {status ? (
        <Text
          selectable
          accessibilityLiveRegion="polite"
          style={{ fontSize: 12, color: colors.mute }}
          testID={`${props.testID ?? "profile-share"}-status`}
        >
          {status}
        </Text>
      ) : null}
    </View>
  );
}
