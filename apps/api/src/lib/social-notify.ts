/**
 * 친구 관계에서 생기는 알림 — 요청이 왔을 때, 친구가 휴가를 등록했을 때.
 *
 * 사용처: `POST /friends/requests`, `POST /leaves` (routes/friends.ts, routes/leaves.ts).
 *
 * `lib/`에 있는 이유는 여러 표를 순서대로 바꾸기 때문이다 — 수신자를 고르고
 * (친구 관계 + 차단 + 종류별 수신 설정), 인앱 알림을 넣고, 푸시를 보내고,
 * 발송 로그를 남긴다. 그 순서와 D1 상한 처리가 HTTP 상태 코드를 고르는 코드와
 * 섞이면 읽다가 놓친다. 초과 알림(`overage.ts`)이 같은 구조다.
 *
 * ## 두 가지 규칙을 여기서 지킨다
 *
 * **한 문장에 100개.** 친구 알림은 사람 수만큼 행을 넣으므로 D1 바인드 상한에
 * 정면으로 부딪힌다. `insertStatements`로
 * 나눠 담고 한 `batch`로 묶어 "일부에게만 알림이 간" 상태를 만들지 않는다.
 *
 * **내 휴가 상세와 친구 일정 연결을 구분한다.** `notifications.leaveId`는 받는 사람이
 * 열 수 있는 휴가를 가리킬 때만 뜻이 있다. 친구의 휴가는 `/leaves/{id}`로 열
 * 수 없으므로 비워 둔다. 친구 휴가는 별도 연결 정보로 저장하고 친구 일정 API에서
 * 현재 권한을 다시 확인한다.
 */

import { fmtRange, type ISODate } from "@leave/shared";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  friendships,
  notifications,
  pushLogs,
  userBlocks,
  userNotificationPrefs,
  users,
} from "../db/schema";
import { insertStatements, runBatch } from "./d1";
import type { Db } from "./db";
import { buildNotificationPushMessage, sendExpoPushMessages } from "./push";

type Recipient = { id: string; expoPushToken: string | null };

/** 인앱 알림을 넣고, 응답을 막지 않는 백그라운드에서 푸시와 발송 로그를 처리한다. */
async function deliver(
  db: Db,
  input: {
    recipients: Recipient[];
    title: string;
    body: string;
    friendLeave?: {
      userId: string;
      leaveId: string;
      startDate: ISODate;
      endDate: ISODate;
    };
    waitUntil: (promise: Promise<unknown>) => void;
  },
): Promise<void> {
  if (input.recipients.length === 0) return;

  const now = new Date().toISOString();
  // 사용자별 인앱 알림 id를 미리 만들어 두면 푸시 발송 로그와 연결할 수 있다.
  const notificationIdByUser = new Map(
    input.recipients.map((recipient) => [recipient.id, crypto.randomUUID()]),
  );

  await runBatch(
    db,
    insertStatements(
      db,
      notifications,
      input.recipients.map((recipient) => ({
        id: notificationIdByUser.get(recipient.id)!,
        userId: recipient.id,
        title: input.title,
        body: input.body,
        // 내 휴가 상세 링크와 친구 일정 조회 정보를 구분한다.
        leaveId: null,
        datesJson: null,
        friendLeaveJson: input.friendLeave
          ? JSON.stringify(input.friendLeave)
          : null,
        read: false,
        createdAt: now,
      })),
    ),
  );

  input.waitUntil(
    (async () => {
      const results = await sendExpoPushMessages(
        input.recipients.map((recipient) => ({
          token: recipient.expoPushToken,
          message: buildNotificationPushMessage({
            id: notificationIdByUser.get(recipient.id)!,
            title: input.title,
            body: input.body,
          }),
        })),
      );
      const resultByToken = new Map(results.map((r) => [r.token, r]));
      const logRows = input.recipients.map((recipient) => {
        const token = recipient.expoPushToken;
        const result =
          token && token.startsWith("ExponentPushToken")
            ? resultByToken.get(token)
            : undefined;
        return {
          id: crypto.randomUUID(),
          userId: recipient.id,
          notificationId: notificationIdByUser.get(recipient.id) ?? null,
          direction: "send" as const,
          // 유효 토큰이 없으면 skipped, 있으면 발송 결과(ok/error)
          status: result ? result.status : ("skipped" as const),
          createdAt: new Date().toISOString(),
        };
      });
      await runBatch(db, insertStatements(db, pushLogs, logRows));
    })(),
  );
}

/**
 * 친구 요청이 도착했음을 받는 사람에게 알린다.
 *
 * `createFriendRequest`가 실제로 새 요청을 만든 경우에만 부른다 — 이미 친구이거나
 * 같은 요청을 다시 보낸 경우까지 알리면, 보낸 쪽이 버튼을 여러 번 눌러 받는 쪽
 * 알림함을 채울 수 있다.
 */
export async function notifyFriendRequest(
  db: Db,
  input: {
    requester: { name: string };
    recipientId: string;
    waitUntil: (promise: Promise<unknown>) => void;
  },
): Promise<void> {
  const recipient = await db
    .select({
      id: users.id,
      expoPushToken: users.expoPushToken,
      friendRequest: userNotificationPrefs.friendRequest,
    })
    .from(users)
    .leftJoin(userNotificationPrefs, eq(userNotificationPrefs.userId, users.id))
    .where(eq(users.id, input.recipientId))
    .get();
  // 설정 행이 없으면 전부 켜진 것으로 본다(기존 세 종류와 같은 기본값).
  if (!recipient || recipient.friendRequest === false) return;

  await deliver(db, {
    recipients: [{ id: recipient.id, expoPushToken: recipient.expoPushToken }],
    title: "새 친구 요청",
    body: `${input.requester.name}님이 친구 요청을 보냈어요. 친구 탭에서 확인해주세요.`,
    waitUntil: input.waitUntil,
  });
}

/**
 * 새로 등록한 휴가를 수락된 친구들에게 알린다.
 *
 * 초안(draft)에는 부르지 않는다 — 초안은 나만 보는 비공개 계획이라 그 존재를
 * 알리는 것 자체가 설계를 어기는 일이다(docs/architecture.md).
 *
 * 대상은 **수락된** 친구뿐이고, 어느 방향으로든 차단이 있으면 뺀다. 친구 달력이
 * 매 요청마다 같은 두 가지를 다시 확인하는 것과 같은 판단이다.
 */
export async function notifyFriendsOfLeave(
  db: Db,
  input: {
    actor: { id: string; name: string };
    leave: { id: string; startDate: ISODate; endDate: ISODate };
    waitUntil: (promise: Promise<unknown>) => void;
  },
): Promise<void> {
  const [relations, blockedRows] = await db.batch([
    db
      .select({
        userAId: friendships.userAId,
        userBId: friendships.userBId,
      })
      .from(friendships)
      .where(
        and(
          eq(friendships.status, "accepted"),
          or(
            eq(friendships.userAId, input.actor.id),
            eq(friendships.userBId, input.actor.id),
          ),
        ),
      ),
    db
      .select({
        userId: userBlocks.userId,
        blockedUserId: userBlocks.blockedUserId,
      })
      .from(userBlocks)
      .where(
        or(
          eq(userBlocks.userId, input.actor.id),
          eq(userBlocks.blockedUserId, input.actor.id),
        ),
      ),
  ]);

  const blocked = new Set(
    blockedRows.map((row) =>
      row.userId === input.actor.id ? row.blockedUserId : row.userId,
    ),
  );
  const friendIds = relations
    .map((row) => (row.userAId === input.actor.id ? row.userBId : row.userAId))
    .filter((id) => !blocked.has(id));
  if (friendIds.length === 0) return;

  /*
   * 친구는 부대와 달리 조인으로 좁힐 공통 컬럼이 없어 id 목록으로 조회할 수밖에
   * 없다. 친구 100명이면 바인드 파라미터가 100개라 그대로 벽에 부딪히므로,
   * `lib/leave-balances.ts`의 `segmentsForLeaves`처럼 끊어서 보낸다.
   */
  const CHUNK = 90;
  const recipients: Recipient[] = [];
  for (let index = 0; index < friendIds.length; index += CHUNK) {
    const rows = await db
      .select({
        id: users.id,
        expoPushToken: users.expoPushToken,
        friendLeave: userNotificationPrefs.friendLeave,
      })
      .from(users)
      .leftJoin(
        userNotificationPrefs,
        eq(userNotificationPrefs.userId, users.id),
      )
      .where(inArray(users.id, friendIds.slice(index, index + CHUNK)));
    for (const row of rows) {
      if (row.friendLeave === false) continue;
      recipients.push({ id: row.id, expoPushToken: row.expoPushToken });
    }
  }

  await deliver(db, {
    recipients,
    title: "친구의 새 휴가",
    friendLeave: {
      userId: input.actor.id,
      leaveId: input.leave.id,
      startDate: input.leave.startDate,
      endDate: input.leave.endDate,
    },
    body: `${input.actor.name}님이 ${fmtRange(input.leave.startDate, input.leave.endDate)} 휴가를 등록했어요.`,
    waitUntil: input.waitUntil,
  });
}
