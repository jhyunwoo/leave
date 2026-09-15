// 복귀일이 지난 계획을 "복귀 완료"로 굳히는 cron에 대한 테스트.
//
// 응답 직렬화가 같은 규칙을 이미 적용하므로 HTTP로만 보면 굳히기가 돌았는지
// 알 수 없다 — 파생된 값과 저장된 값이 똑같이 보인다. 그래서 여기서는 D1 파일을
// 직접 열어 **저장된 값**을 본다. 확인하려는 것은 셋이다: 옛 행이 실제로 고쳐지는가,
// 고치면 안 되는 행이 남는가, 두 번 돌려도 같은가.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  isoDaysFromToday,
  openTestDb,
  req,
  runScheduled,
  signup,
} from "./helpers.mjs";

/**
 * 종료일이 이미 지난 행을 D1에 직접 넣는다.
 *
 * API로는 만들 수 없다 — 쓰기 경로가 같은 규칙으로 먼저 굳히기 때문이다. 굳히기
 * cron이 실제로 상대하는 것은 "종료일이 지나기 **전에** 저장된 행"이고, 그 모양은
 * 이렇게 넣어야만 재현된다. 옛 데이터가 정확히 이 모양이다.
 */
function insertLegacyLeave(db, userId, { status, startDate, endDate }) {
  const id = randomUUID();
  db.prepare(
    `insert into leaves (id, user_id, title, start_date, end_date, return_time, reason, status, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    `옛 행 ${status}`,
    startDate,
    endDate,
    "21:00",
    null,
    status,
    new Date().toISOString(),
  );
  return id;
}

function statusOf(db, id) {
  return db.prepare("select status from leaves where id = ?").get(id)?.status;
}

test("굳히기는 복귀일이 지난 계획만 복귀 완료로 바꾼다", async () => {
  const { data } = await signup();
  const userId = data.user.id;
  const past = isoDaysFromToday(-3);
  const today = isoDaysFromToday(0);

  const db = openTestDb();
  try {
    const ids = {
      shared: insertLegacyLeave(db, userId, {
        status: "shared",
        startDate: past,
        endDate: past,
      }),
      requested: insertLegacyLeave(db, userId, {
        status: "requested",
        startDate: past,
        endDate: past,
      }),
      approved: insertLegacyLeave(db, userId, {
        status: "approved",
        startDate: past,
        endDate: past,
      }),
      draft: insertLegacyLeave(db, userId, {
        status: "draft",
        startDate: past,
        endDate: past,
      }),
      cancelled: insertLegacyLeave(db, userId, {
        status: "cancelled",
        startDate: past,
        endDate: past,
      }),
      rejected: insertLegacyLeave(db, userId, {
        status: "rejected",
        startDate: past,
        endDate: past,
      }),
      // 경계 — 오늘 끝나는 휴가는 아직 복귀 전이다.
      endingToday: insertLegacyLeave(db, userId, {
        status: "approved",
        startDate: past,
        endDate: today,
      }),
    };

    await runScheduled();

    assert.equal(statusOf(db, ids.shared), "completed");
    assert.equal(statusOf(db, ids.requested), "completed");
    assert.equal(statusOf(db, ids.approved), "completed");

    // 나만 보는 계획이 출타 집계 상태로 넘어가면 이름·계급이 그룹 명단에 뜬다.
    assert.equal(statusOf(db, ids.draft), "draft");
    // 실제로 나가지 않았으니 복귀할 것도 없다.
    assert.equal(statusOf(db, ids.cancelled), "cancelled");
    assert.equal(statusOf(db, ids.rejected), "rejected");
    assert.equal(statusOf(db, ids.endingToday), "approved");

    // 두 번 돌려도 같은 답이어야 한다 — 자기가 쓴 행을 다시 읽기 때문이다.
    await runScheduled();
    assert.equal(statusOf(db, ids.approved), "completed");
    assert.equal(statusOf(db, ids.draft), "draft");
    assert.equal(statusOf(db, ids.endingToday), "approved");
  } finally {
    db.close();
  }
});

/**
 * 이 전환이 잔여·남은 일과일에 대해 중립이라는 것이 전제다 — `completed`가
 * 출타 집계와 잔여 차감 목록 **양쪽에** `approved`와 함께 들어 있어서 성립한다.
 * 이 전제가 깨지면 아무도 건드리지 않은 사용자의 남은 휴가가 하룻밤 사이에 변한다.
 */
test("굳히기는 잔여와 남은 일과일을 바꾸지 않는다", async () => {
  const { token, data } = await signup();
  const userId = data.user.id;
  const past = isoDaysFromToday(-6);

  const db = openTestDb();
  try {
    insertLegacyLeave(db, userId, {
      status: "approved",
      startDate: past,
      endDate: past,
    });

    const before = await req("GET", "/leaves/balances", { token });
    assert.equal(before.status, 200);

    await runScheduled();

    const after = await req("GET", "/leaves/balances", { token });
    assert.deepEqual(after.data.balances, before.data.balances);
  } finally {
    db.close();
  }
});
