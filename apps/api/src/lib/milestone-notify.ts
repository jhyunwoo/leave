/**
 * 복무 기념일 알림 — 전역 D-n(600·500·…·10일 전, 하루 전)과 진급(일병·상병·병장).
 *
 * 사용처: `src/index.ts`의 `scheduled` 핸들러(매일 09:00 KST, 12:10 KST 두 번).
 *
 * 하는 일은 순서대로 넷이다.
 *  1) 오늘 기념일일 수 있는 사람을 SQL로 좁힌다(전역일이 D-n 목록에 있는 사람,
 *     매월 1일이면 아직 복무 중인 사람). 실제 판정은 `milestonesOn` 하나가 한다 —
 *     SQL은 후보만 줄이고, 계급 하한 같은 규칙을 SQL에 다시 적지 않는다.
 *  2) `milestone_deliveries`에 "보냈다"를 먼저 적는다. 넣는 데 성공한 행만 알린다.
 *     cron이 하루 두 번 돌아도, 둘이 겹쳐도 한 번만 간다. 적은 뒤 알림을 넣다
 *     실패하면 그 기념일은 빠진다 — 축하 알림이 두 번 가는 것보다 낫다고 봤다.
 *  3) 본인에게 알린다(종류별 수신 설정을 끈 사람 제외).
 *  4) 친구들에게 알린다. 고르는 규칙은 새 휴가 알림(`social-notify.ts`)과 같다 —
 *     수락된 관계만, 어느 방향이든 차단이 있으면 제외, 그 종류를 끈 사람 제외.
 *     더해서 **복무율을 공유하지 않는 사람의 기념일은 친구에게 알리지 않는다.**
 *     D-n과 진급일은 곧 전역일·입대일이라, 공유를 끈 정보가 알림으로 새면 안 된다.
 *
 * 하루에 수백 명이 한꺼번에 걸릴 수 있다(매월 1일 진급). 사람마다 친구를 따로
 * 조회하면 D1 질의 수가 사람 수에 비례해 워커의 호출당 질의 상한에 닿는다. 그래서
 * 친구·차단·공유 설정·수신 설정을 사람 묶음 단위로 한 batch에 모아 읽는다.
 */

import {
  addMonthsClamped,
  countdownDischargeDates,
  friendMilestoneNotificationText,
  milestoneKey,
  milestoneNotificationText,
  milestonesOn,
  type ISODate,
  type Rank,
  type ServiceMilestone,
} from "@leave/shared";
import { and, eq, gt, gte, inArray, isNotNull, lt, or } from "drizzle-orm";
import {
  friendships,
  milestoneDeliveries,
  userBlocks,
  userFriendSharing,
  userNotificationPrefs,
  users,
} from "../db/schema";
import { chunkForParams, type BatchItem } from "./d1";
import type { Db } from "./db";
import { friendSharingColumns, resolveFriendSharing } from "./friend-sharing";
import {
  deliverEach,
  type DeliveryItem,
  type Recipient,
} from "./social-notify";

export type MilestoneSummary = {
  today: ISODate;
  /** 오늘 기념일인 사람 수(이미 보낸 것 포함). */
  due: number;
  /** 이번 실행에서 새로 알린 기념일 수. */
  claimed: number;
  selfNotifications: number;
  friendNotifications: number;
};

type Candidate = {
  id: string;
  name: string;
  enlistedAt: string;
  dischargeAt: string;
  signupRank: Rank;
  expoPushToken: string | null;
  dischargeCountdown: boolean | null;
  promotion: boolean | null;
};

type Due = { user: Candidate; milestone: ServiceMilestone };

type FriendRecipient = Recipient & {
  friendDischargeCountdown: boolean | null;
  friendPromotion: boolean | null;
};

/** 진급 후보를 좁히는 하한. 병장 진급(14개월)에 진급일 보정(최대 한 달)을 더한 것보다 넉넉하다. */
const PROMOTION_LOOKBACK_MONTHS = 16;

/**
 * 기념일을 맞은 사람 id를 한 문장에 몇 개씩 넣는가. 친구 관계 질의가 두 열
 * (`user_a_id`, `user_b_id`)에 같은 목록을 넣고 상태값 하나를 더 바인드하므로
 * 100의 절반보다 조금 작게 잡는다.
 */
const ID_CHUNK = 45;

function candidateQuery(db: Db) {
  return db
    .select({
      id: users.id,
      name: users.name,
      enlistedAt: users.enlistedAt,
      dischargeAt: users.dischargeAt,
      signupRank: users.signupRank,
      expoPushToken: users.expoPushToken,
      dischargeCountdown: userNotificationPrefs.dischargeCountdown,
      promotion: userNotificationPrefs.promotion,
    })
    .from(users)
    .leftJoin(
      userNotificationPrefs,
      eq(userNotificationPrefs.userId, users.id),
    );
}

/** 오늘 기념일인 사람과 그 기념일. */
async function findDue(db: Db, today: ISODate): Promise<Due[]> {
  // 온보딩을 마치지 않은 계정은 복무 정보가 아직 확정되지 않았다.
  const onboarded = isNotNull(users.onboardingCompletedAt);
  const countdown = candidateQuery(db).where(
    and(onboarded, inArray(users.dischargeAt, countdownDischargeDates(today))),
  );
  // 표준 진급일은 언제나 매월 1일이다(`standardPromotionDate`). 다른 날에는 볼 필요가 없다.
  const rows = today.endsWith("-01")
    ? (
        await db.batch([
          countdown,
          candidateQuery(db).where(
            and(
              onboarded,
              gt(users.dischargeAt, today),
              lt(users.enlistedAt, today),
              gte(
                users.enlistedAt,
                addMonthsClamped(today, -PROMOTION_LOOKBACK_MONTHS),
              ),
            ),
          ),
        ])
      ).flat()
    : await countdown;

  const seen = new Set<string>();
  const due: Due[] = [];
  for (const user of rows) {
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    for (const milestone of milestonesOn({
      enlistedAt: user.enlistedAt,
      dischargeAt: user.dischargeAt,
      signupRank: user.signupRank,
      on: today,
    })) {
      due.push({ user, milestone });
    }
  }
  return due;
}

/** 장부에 먼저 적고, 이번에 새로 적힌 것만 돌려준다. */
async function claim(db: Db, today: ISODate, due: Due[]): Promise<Due[]> {
  if (due.length === 0) return [];
  const now = new Date().toISOString();
  const statements = chunkForParams(due, 4).map((chunk) =>
    db
      .insert(milestoneDeliveries)
      .values(
        chunk.map(({ user, milestone }) => ({
          userId: user.id,
          milestoneKey: milestoneKey(milestone),
          occurredOn: today,
          createdAt: now,
        })),
      )
      .onConflictDoNothing()
      .returning({
        userId: milestoneDeliveries.userId,
        milestoneKey: milestoneDeliveries.milestoneKey,
      }),
  );
  const results = await db.batch(
    statements as unknown as [BatchItem, ...BatchItem[]],
  );
  const inserted = new Set(
    (results as { userId: string; milestoneKey: string }[][])
      .flat()
      .map((row) => `${row.userId}|${row.milestoneKey}`),
  );
  return due.filter(({ user, milestone }) =>
    inserted.has(`${user.id}|${milestoneKey(milestone)}`),
  );
}

function selfEnabled({ user, milestone }: Due): boolean {
  // 설정 행이 없으면(null) 켜진 것으로 본다.
  return milestone.kind === "discharge_countdown"
    ? user.dischargeCountdown !== false
    : user.promotion !== false;
}

/**
 * 기념일을 맞은 사람들의 친구 중 알림을 받을 사람을 사람별로 모은다.
 *
 * 친구·차단·공유 설정을 사람 묶음 단위로 한 batch에 읽고, 그다음 받을 사람들의
 * 수신 설정을 한 batch에 읽는다. 왕복은 사람 수와 무관하게 두 번이다.
 */
async function friendsBySubject(
  db: Db,
  subjectIds: string[],
): Promise<{
  friendsOf: Map<string, string[]>;
  recipients: Map<string, FriendRecipient>;
}> {
  const friendsOf = new Map<string, string[]>();
  const recipients = new Map<string, FriendRecipient>();
  if (subjectIds.length === 0) return { friendsOf, recipients };

  const statements: BatchItem[] = [];
  for (let start = 0; start < subjectIds.length; start += ID_CHUNK) {
    const chunk = subjectIds.slice(start, start + ID_CHUNK);
    statements.push(
      db
        .select({ userAId: friendships.userAId, userBId: friendships.userBId })
        .from(friendships)
        .where(
          and(
            eq(friendships.status, "accepted"),
            or(
              inArray(friendships.userAId, chunk),
              inArray(friendships.userBId, chunk),
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
            inArray(userBlocks.userId, chunk),
            inArray(userBlocks.blockedUserId, chunk),
          ),
        ),
      db
        .select({ userId: userFriendSharing.userId, ...friendSharingColumns })
        .from(userFriendSharing)
        .where(inArray(userFriendSharing.userId, chunk)),
    );
  }
  const results = (await db.batch(
    statements as [BatchItem, ...BatchItem[]],
  )) as unknown[][];

  const relations: { userAId: string; userBId: string }[] = [];
  const blocks = new Set<string>();
  const hidden = new Set<string>();
  for (let index = 0; index < results.length; index += 3) {
    relations.push(...(results[index] as typeof relations));
    for (const row of results[index + 1] as {
      userId: string;
      blockedUserId: string;
    }[]) {
      blocks.add(`${row.userId}|${row.blockedUserId}`);
      blocks.add(`${row.blockedUserId}|${row.userId}`);
    }
    for (const row of results[index + 2] as ({ userId: string } & Parameters<
      typeof resolveFriendSharing
    >[0])[]) {
      if (!resolveFriendSharing(row).serviceProgress) hidden.add(row.userId);
    }
  }

  const subjects = new Set(subjectIds);
  for (const { userAId, userBId } of relations) {
    for (const [subject, friend] of [
      [userAId, userBId],
      [userBId, userAId],
    ] as const) {
      if (!subjects.has(subject) || hidden.has(subject)) continue;
      if (blocks.has(`${subject}|${friend}`)) continue;
      const list = friendsOf.get(subject) ?? [];
      list.push(friend);
      friendsOf.set(subject, list);
    }
  }

  const friendIds = [...new Set([...friendsOf.values()].flat())];
  if (friendIds.length === 0) return { friendsOf, recipients };
  const prefRows = await db.batch(
    chunkForParams(friendIds, 1).map((chunk) =>
      db
        .select({
          id: users.id,
          expoPushToken: users.expoPushToken,
          friendDischargeCountdown:
            userNotificationPrefs.friendDischargeCountdown,
          friendPromotion: userNotificationPrefs.friendPromotion,
        })
        .from(users)
        .leftJoin(
          userNotificationPrefs,
          eq(userNotificationPrefs.userId, users.id),
        )
        .where(inArray(users.id, chunk)),
    ) as unknown as [BatchItem, ...BatchItem[]],
  );
  for (const row of (prefRows as unknown[][]).flat() as FriendRecipient[]) {
    recipients.set(row.id, row);
  }
  return { friendsOf, recipients };
}

/**
 * 오늘의 복무 기념일을 본인과 친구들에게 알린다.
 *
 * @param today 한국 시간 기준 오늘. 테스트와 재실행을 위해 밖에서 받는다.
 */
export async function notifyServiceMilestones(
  db: Db,
  input: { today: ISODate; waitUntil: (promise: Promise<unknown>) => void },
): Promise<MilestoneSummary> {
  const due = await findDue(db, input.today);
  const claimed = await claim(db, input.today, due);

  const items: DeliveryItem[] = [];
  for (const entry of claimed) {
    if (!selfEnabled(entry)) continue;
    items.push({
      recipient: { id: entry.user.id, expoPushToken: entry.user.expoPushToken },
      ...milestoneNotificationText(entry.milestone),
      milestone: { ...entry.milestone, userId: null },
    });
  }
  const selfNotifications = items.length;

  const { friendsOf, recipients } = await friendsBySubject(db, [
    ...new Set(claimed.map((entry) => entry.user.id)),
  ]);
  for (const { user, milestone } of claimed) {
    for (const friendId of friendsOf.get(user.id) ?? []) {
      const recipient = recipients.get(friendId);
      if (!recipient) continue;
      const enabled =
        milestone.kind === "discharge_countdown"
          ? recipient.friendDischargeCountdown !== false
          : recipient.friendPromotion !== false;
      if (!enabled) continue;
      items.push({
        recipient: { id: recipient.id, expoPushToken: recipient.expoPushToken },
        ...friendMilestoneNotificationText(milestone, user.name),
        milestone: { ...milestone, userId: user.id },
      });
    }
  }

  await deliverEach(db, items, input.waitUntil);
  return {
    today: input.today,
    due: due.length,
    claimed: claimed.length,
    selfNotifications,
    friendNotifications: items.length - selfNotifications,
  };
}
