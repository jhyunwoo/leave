/**
 * 친구 찾기 (네이티브) — 공개 사용자 이름으로 검색하고 보낸 요청을 관리한다.
 *
 * 사용처: 친구 탭의 `add` 라우트(app/(tabs)/(friends)/add.tsx).
 *
 * 예전에는 "정확한 가입 이메일"을 받아 요청을 보냈다(friend-add.tsx). 그 방식은
 * 요청 결과가 곧 "이 주소로 가입했는가"에 대한 답이라 친구 찾기가 이메일 열거
 * 수단이 됐고, 무엇보다 상대의 이메일을 이미 알고 있어야 했다.
 *
 * 결과에서 곧바로 요청을 보내지 않고 프로필로 넘긴다. 목록의 작은 버튼 하나로
 * 사람을 잘못 눌러 요청이 나가는 일을 막고, 보내기 전에 "이 사람이 맞나"를
 * 확인할 자리를 준다.
 */

import {
  useCancelFriendRequest,
  useOutgoingFriendRequests,
  useUserSearch,
  type UserProfile,
} from "@leave/client";
import {
  formatUsername,
  isUsernameQuery,
  normalizeUsernameQuery,
} from "@leave/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from "react-native";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { makeStyles, radius, spacing, useColors } from "@/theme";

const RELATIONSHIP_LABEL: Record<UserProfile["relationship"], string> = {
  self: "나",
  none: "",
  outgoing: "요청함",
  incoming: "요청 받음",
  friends: "친구",
};

function SearchResults(props: { query: string }) {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const search = useUserSearch(props.query);
  const normalized = normalizeUsernameQuery(props.query);

  if (!isUsernameQuery(normalized)) {
    return (
      <Text style={styles.caption}>
        @아이디로 찾아보세요. 영문·한글·숫자와 마침표(.), 밑줄(_)을 쓸 수
        있어요.
      </Text>
    );
  }
  if (search.isPending) return <ActivityIndicator color={colors.ink} />;
  if (search.isError) {
    return (
      <Text style={styles.error}>
        검색하지 못했어요. 잠시 후 다시 시도해주세요.
      </Text>
    );
  }
  if (!search.data?.results.length) {
    return (
      <Text accessibilityLiveRegion="polite" style={styles.body}>
        {formatUsername(normalized)} 와(과) 맞는 사용자가 없어요.
      </Text>
    );
  }
  return (
    <>
      {search.data.results.map((result) => (
        <Pressable
          key={result.userId}
          accessibilityRole="button"
          accessibilityLabel={`${result.name} ${formatUsername(result.username)} 프로필 열기`}
          onPress={() =>
            router.push({
              pathname: "/u/[username]",
              params: { username: result.username },
            })
          }
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          testID={`search-result-${result.username}`}
        >
          <Avatar name={result.name} size={36} />
          <View style={styles.who}>
            <Text style={styles.name}>{result.name}</Text>
            <Text style={styles.caption}>
              {formatUsername(result.username)}
            </Text>
          </View>
          <Text style={styles.relation}>
            {RELATIONSHIP_LABEL[result.relationship]}
          </Text>
        </Pressable>
      ))}
    </>
  );
}

export function FriendSearchScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const outgoing = useOutgoingFriendRequests();
  const cancel = useCancelFriendRequest();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 타이핑 도중 글자마다 서버에 묻지 않는다. 규칙 판정은 즉시, 요청만 늦춘다.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const run = async (promise: Promise<unknown>) => {
    try {
      await promise;
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "요청을 처리하지 못했어요",
      );
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      {process.env.EXPO_OS === "web" ? (
        <Text style={styles.title}>친구 찾기</Text>
      ) : null}
      <ContentPanel style={styles.card}>
        <Text style={styles.label} accessibilityRole="header">
          사용자 이름으로 찾기
        </Text>
        <View style={styles.inputRow}>
          <Text style={styles.at}>@</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="hyunwoo 또는 현우"
            placeholderTextColor={colors.mute}
            selectionColor={colors.brand}
            cursorColor={colors.brand}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            returnKeyType="search"
            accessibilityLabel="사용자 이름 검색"
            style={styles.input}
            testID="friend-search-input"
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {query.trim() ? <SearchResults query={debouncedQuery} /> : null}
      </ContentPanel>

      {(outgoing.data?.requests.length ?? 0) > 0 ? (
        <ContentPanel style={styles.card}>
          <Text style={styles.heading}>보낸 요청</Text>
          {outgoing.data!.requests.map((request) => (
            <View key={request.userId} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${request.name} 프로필 열기`}
                disabled={!request.username}
                onPress={() =>
                  router.push({
                    pathname: "/u/[username]",
                    params: { username: request.username! },
                  })
                }
                style={styles.who}
              >
                <Text style={styles.name}>{request.name}</Text>
                <Text style={styles.caption}>
                  {request.username
                    ? `${formatUsername(request.username)} · 수락 대기`
                    : "수락 대기"}
                </Text>
              </Pressable>
              <Button
                title="취소"
                size="sm"
                variant="secondary"
                disabled={cancel.isPending}
                onPress={() => void run(cancel.mutateAsync(request.userId))}
              />
            </View>
          ))}
        </ContentPanel>
      ) : null}
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
  title: { fontSize: 32, fontWeight: "900", color: colors.ink },
  card: { padding: spacing.lg, gap: spacing.md },
  heading: { fontSize: 20, fontWeight: "800", color: colors.ink },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  inputRow: { position: "relative", justifyContent: "center" },
  at: {
    position: "absolute",
    left: spacing.lg,
    fontSize: 16,
    fontWeight: "700",
    color: colors.mute,
  },
  input: {
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderCurve: "continuous",
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg + 18,
    paddingRight: spacing.lg,
    fontSize: 16,
    color: colors.ink,
    minHeight: 48,
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  pressed: { opacity: 0.7 },
  who: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: "700", color: colors.ink },
  caption: { fontSize: 12, color: colors.mute },
  relation: { fontSize: 12, fontWeight: "700", color: colors.brand },
  body: { color: colors.body, lineHeight: 21 },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
}));
