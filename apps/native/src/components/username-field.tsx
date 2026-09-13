/**
 * 공개 사용자 이름 입력 (네이티브) — 규칙 안내, 중복 확인, 프로필 주소 미리보기.
 *
 * 사용처: 온보딩의 이름 단계, 1회성 이름 설정 화면, 프로필의 이름 바꾸기.
 * 웹의 `components/UsernameField.tsx`와 짝이며, 규칙과 문구는 둘 다
 * `@leave/shared`의 `usernameProblem`에서 온다 — 두 앱이 서로 다른 이유를
 * 보여주면 사용자는 무엇이 맞는지 알 수 없다.
 *
 * 중복 확인은 **조언**이다. 확인과 저장 사이에 남이 같은 이름을 가져갈 수 있어
 * 최종 판정은 저장 요청의 409다.
 */

import { useUsernameAvailability } from "@leave/client";
import {
  isCanonicalUsername,
  normalizeUsername,
  usernameProblem,
  USERNAME_MAX_LENGTH,
} from "@leave/shared";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { UsernameInput } from "@/components/username-input";
import { makeStyles } from "@/theme";

/** 타이핑이 멎고 나서야 서버에 묻는다 — 글자마다 왕복하면 rate limit에 걸린다. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

export interface UsernameDraft {
  raw: string;
  setRaw: (value: string) => void;
  username: string;
  problem: string | null;
  valid: boolean;
  available: boolean | null;
  checking: boolean;
}

export function useUsernameDraft(initial = ""): UsernameDraft {
  const [raw, setRaw] = useState(initial);
  const username = normalizeUsername(raw);
  const valid = isCanonicalUsername(username);
  const debounced = useDebounced(valid ? username : "", 350);
  const availability = useUsernameAvailability(debounced);
  const fresh = availability.data?.username === username;
  // 중복 확인이 실패했을 때(오프라인·서버 오류) "확인 중…"에 영원히 머무르지 않는다.
  // 답을 못 받은 것뿐이므로 아무 말도 하지 않고, 판정은 저장 시점의 409에 맡긴다.
  const failed = availability.isError && debounced === username;
  return {
    raw,
    setRaw,
    username,
    problem: raw.trim() === "" ? null : usernameProblem(raw),
    valid,
    available: fresh ? (availability.data?.available ?? null) : null,
    checking: valid && !fresh && !failed,
  };
}

type StatusTone = "error" | "muted" | "ok";

function statusOf(
  draft: UsernameDraft,
  serverError: string | null | undefined,
): { tone: StatusTone; message: string } | null {
  if (serverError) return { tone: "error", message: serverError };
  if (draft.problem) return { tone: "error", message: draft.problem };
  if (!draft.valid) return null;
  if (draft.checking) return { tone: "muted", message: "확인 중…" };
  if (draft.available === false)
    return { tone: "error", message: "이미 사용 중인 이름이에요" };
  if (draft.available === true)
    return { tone: "ok", message: "사용할 수 있어요" };
  return null;
}

export function UsernameField(props: {
  draft: UsernameDraft;
  label?: string;
  /** 저장 시도가 돌려준 오류(중복 등). 규칙 위반 안내보다 우선한다. */
  serverError?: string | null;
  autoFocus?: boolean;
  onSubmit?: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  const { draft } = props;
  const status = statusOf(draft, props.serverError);

  return (
    <View style={styles.field}>
      <Text style={styles.label} accessibilityRole="header">
        {props.label ?? "사용자 이름"}
      </Text>
      <UsernameInput
        value={draft.raw}
        onChangeText={draft.setRaw}
        onSubmitEditing={props.onSubmit}
        placeholder="hyunwoo"
        maxLength={60}
        autoFocus={props.autoFocus}
        returnKeyType="done"
        accessibilityLabel={props.label ?? "사용자 이름"}
        accessibilityHint="친구가 나를 찾는 공개 이름이에요"
        testID={props.testID ?? "username-input"}
      />
      <Text
        accessibilityLiveRegion="polite"
        style={[
          styles.status,
          status?.tone === "error" && styles.statusError,
          status?.tone === "ok" && styles.statusOk,
        ]}
      >
        {status?.message ??
          (draft.valid
            ? `프로필 주소 · leave.moveto.kr/u/${draft.username}`
            : `영문·한글·숫자와 마침표(.), 밑줄(_)을 ${USERNAME_MAX_LENGTH}자까지. 이 이름은 공개돼요.`)}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  status: { fontSize: 12, color: colors.mute },
  statusError: { fontWeight: "600", color: colors.negativeDeep },
  statusOk: { fontWeight: "600", color: colors.brand },
}));
