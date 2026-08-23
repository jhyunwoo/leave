/**
 * 공개 프로필 (네이티브) — `/u/{username}`.
 *
 * 사용처: `app/u/[username].tsx`. 친구 탭의 검색·목록에서 들어오고,
 * 공유된 HTTPS 링크(Universal Link / App Link)와 `leave://u/{username}`도
 * 같은 화면으로 떨어진다.
 *
 * 화면이 관계를 스스로 추론하지 않는다. 서버가 `relationship` 하나를 주고 그
 * 값으로 버튼이 정해진다 — 화면이 친구 목록을 뒤져 관계를 계산하면 목록 캐시가
 * 낡은 동안 이미 친구인 사람에게 "친구 추가"를 누르게 된다.
 *
 * 친구가 아닐 때는 일정 섹션을 아예 그리지 않는다. 서버도 403을 주지만, 빈 일정
 * 카드가 한 프레임이라도 뜨면 "이 사람은 휴가가 없다"는 잘못된 정보가 된다.
 */

import {
  useAcceptFriendRequest,
  useCancelFriendRequest,
  useDeclineFriendRequest,
  useFriendSchedule,
  useRemoveFriend,
  useSendFriendRequest,
  useUserProfile,
  type UserProfile,
} from "@leave/client";
import {
  fmtRange,
  formatUsername,
  LEAVE_STATUS_LABELS,
  monthBounds,
  profileLink,
  shiftMonth,
  todayInSeoul,
} from "@leave/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Share, Text, View } from "react-native";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { confirmAction } from "@/lib/dialog";
import { makeStyles, radius, spacing, useColors } from "@/theme";

/**
 * 공유하는 것은 커스텀 스킴이 아니라 언제나 HTTPS 정본 주소다.
 * 받는 사람이 앱을 깔았는지 보낸 사람이 알 수 없으므로, 앱이 있으면 앱에서 열리고
 * 없으면 웹에서 열리는 주소여야 한다.
 */
async function shareProfile(username: string) {
  const url = profileLink(username);
  await Share.share(
    process.env.EXPO_OS === "ios"
      ? { url, message: `@${username}` }
      : { message: `@${username}\n${url}` },
  );
}

function SharedSchedule(props: { userId: string }) {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const current = todayInSeoul().slice(0, 7);
  const schedule = useFriendSchedule(
    props.userId,
    monthBounds(shiftMonth(current, -1)).start,
    monthBounds(shiftMonth(current, 5)).end,
  );

  return (
    <ContentPanel style={styles.card}>
      <Text style={styles.heading}>공유된 휴가 일정</Text>
      {schedule.isPending ? (
        <ActivityIndicator color={colors.ink} />
      ) : schedule.isError ? (
        /* 재조회가 403이면 캐시에 남아 있던 본문도 함께 지워진다
           (@leave/client의 watchFriendAccessRevocation). 여기서 data를 먼저
           보지 않는 것이 그 정리와 짝을 이룬다. */
        <Text style={styles.error}>
          일정을 볼 수 없어요. 친구 관계나 차단 상태를 확인해주세요.
        </Text>
      ) : schedule.data?.leaves.length ? (
        <>
          {schedule.data.leaves.map((leave) => (
            <View key={leave.leaveId} style={styles.leave}>
              <Text style={styles.leaveRange}>
                {fmtRange(leave.startDate, leave.endDate)}
              </Text>
              <Text style={styles.caption}>
                {LEAVE_STATUS_LABELS[leave.status]}
              </Text>
            </View>
          ))}
          <Button
            title="내 달력과 비교"
            onPress={() =>
              router.push({
                pathname: "/(tabs)/(calendar)/friend-calendar",
                params: { friendIds: props.userId },
              })
            }
            testID="profile-compare"
          />
        </>
      ) : (
        <Text style={styles.body}>이 기간에 공유된 휴가가 없어요.</Text>
      )}
    </ContentPanel>
  );
}

function RelationshipActions(props: {
  profile: UserProfile;
  onMessage: (message: string | null) => void;
}) {
  const styles = useStyles();
  const router = useRouter();
  const { profile } = props;
  const send = useSendFriendRequest();
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const cancel = useCancelFriendRequest();
  const remove = useRemoveFriend();
  const pending =
    send.isPending ||
    accept.isPending ||
    decline.isPending ||
    cancel.isPending ||
    remove.isPending;

  const run = async (work: Promise<unknown>, success: string) => {
    try {
      await work;
      props.onMessage(success);
    } catch (reason) {
      props.onMessage(
        reason instanceof Error ? reason.message : "요청을 처리하지 못했어요",
      );
    }
  };

  const removeFriend = async () => {
    const confirmed = await confirmAction({
      title: "친구 삭제",
      message: `${profile.name}님을 친구에서 삭제할까요?`,
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!confirmed) return;
    await run(remove.mutateAsync(profile.userId), "친구를 삭제했어요.");
  };

  if (profile.relationship === "self") {
    return (
      <View style={styles.actions}>
        <Text style={styles.body}>내 프로필이에요.</Text>
        <Button
          title="프로필 관리"
          variant="secondary"
          onPress={() => router.push("/(tabs)/profile")}
        />
        <Button
          title="프로필 링크 공유"
          variant="secondary"
          onPress={() => void shareProfile(profile.username)}
          testID="profile-share"
        />
      </View>
    );
  }

  return (
    <View style={styles.actions}>
      {profile.relationship === "none" ? (
        <Button
          title="친구 추가"
          disabled={pending}
          onPress={() =>
            void run(
              send.mutateAsync({ username: profile.username }),
              "친구 요청을 보냈어요.",
            )
          }
          testID="profile-add-friend"
        />
      ) : null}
      {profile.relationship === "outgoing" ? (
        <>
          <Text style={styles.pendingLabel}>요청함 · 수락 대기</Text>
          <Button
            title="요청 취소"
            variant="secondary"
            disabled={pending}
            onPress={() =>
              void run(cancel.mutateAsync(profile.userId), "요청을 취소했어요.")
            }
            testID="profile-cancel-request"
          />
        </>
      ) : null}
      {profile.relationship === "incoming" ? (
        <>
          <Button
            title="수락"
            disabled={pending}
            onPress={() =>
              void run(accept.mutateAsync(profile.userId), "친구가 되었어요.")
            }
            testID="profile-accept"
          />
          <Button
            title="거절"
            variant="secondary"
            disabled={pending}
            onPress={() =>
              void run(
                decline.mutateAsync(profile.userId),
                "요청을 거절했어요.",
              )
            }
            testID="profile-decline"
          />
        </>
      ) : null}
      {profile.relationship === "friends" ? (
        <Button
          title="친구 삭제"
          variant="danger"
          disabled={pending}
          onPress={() => void removeFriend()}
          testID="profile-remove-friend"
        />
      ) : null}
      <Button
        title="프로필 링크 공유"
        variant="secondary"
        onPress={() => void shareProfile(profile.username)}
        testID="profile-share"
      />
    </View>
  );
}

export function UserProfileScreen() {
  const styles = useStyles();
  const colors = useColors();
  const params = useLocalSearchParams<{ username?: string }>();
  const username = params.username ?? "";
  const profile = useUserProfile(username);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      <Stack.Screen
        options={{
          title: profile.data ? `@${profile.data.username}` : "프로필",
        }}
      />
      {profile.isPending ? (
        <ActivityIndicator color={colors.ink} />
      ) : profile.isError || !profile.data ? (
        <ContentPanel style={styles.card}>
          <Text style={styles.heading}>사용자를 찾을 수 없어요</Text>
          <Text style={styles.body}>이름이 바뀌었거나 없는 계정이에요.</Text>
        </ContentPanel>
      ) : (
        <>
          <View style={styles.identity}>
            <Avatar name={profile.data.name} size={64} />
            <View style={styles.identityText}>
              <Text style={styles.name}>{profile.data.name}</Text>
              <Text style={styles.handle}>
                {formatUsername(profile.data.username)}
              </Text>
            </View>
          </View>
          {message ? (
            <ContentPanel style={styles.card}>
              <Text accessibilityLiveRegion="polite" style={styles.body}>
                {message}
              </Text>
            </ContentPanel>
          ) : null}
          <ContentPanel style={styles.card}>
            <RelationshipActions
              profile={profile.data}
              onMessage={setMessage}
            />
          </ContentPanel>
          {profile.data.relationship === "friends" ? (
            <SharedSchedule userId={profile.data.userId} />
          ) : profile.data.relationship === "self" ? null : (
            <Text style={styles.caption}>
              친구가 되면 서로의 공유된 휴가 날짜를 볼 수 있어요.
            </Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
    gap: spacing.lg,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  identityText: { flex: 1, minWidth: 0 },
  name: { fontSize: 24, fontWeight: "900", color: colors.ink },
  handle: { fontSize: 14, color: colors.mute },
  card: { padding: spacing.lg, gap: spacing.md },
  heading: { fontSize: 20, fontWeight: "800", color: colors.ink },
  body: { color: colors.body, lineHeight: 21 },
  caption: { fontSize: 12, color: colors.mute },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
  actions: { gap: spacing.sm },
  pendingLabel: { fontSize: 13, fontWeight: "700", color: colors.brand },
  leave: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    gap: 2,
  },
  leaveRange: { fontSize: 15, fontWeight: "700", color: colors.ink },
}));
