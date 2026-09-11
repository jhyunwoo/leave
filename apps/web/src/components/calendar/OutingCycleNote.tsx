/**
 * 고른 날짜의 외출 주기 안내(웹).
 *
 * 사용처: 달력 화면의 날짜 상세 칸.
 *
 * `DayPanel`이 아니라 따로 있는 이유가 있다. DayPanel은 부대 달력 응답을 받아야
 * 그려지는데(출타율·명단), 외출 주기는 부대와 무관하게 내 설정에서만 나온다.
 * 안에 넣으면 부대에 가입하지 않은 사람에게는 이 안내가 통째로 사라진다.
 *
 * 달력 칸의 마커는 주기가 **열리는 날**에만 찍힌다. 여기서는 주기 **안의** 날에도
 * 어느 주기인지와 남은 횟수를 알린다 — 마커가 없는 날에 "이번 달 외출이 몇 번
 * 남았나"를 답할 자리가 여기뿐이다.
 */

import {
  BALANCE_LABELS,
  fmtRangeTiny,
  outingBalanceKey,
  outingCycleNoteFor,
  outingRemainingDays,
  OUTING_KINDS,
  type OutingConfig,
  type OutingKind,
  type SegmentLike,
} from "@leave/shared";

export function OutingCycleNote(props: {
  date: string;
  /** 갈래별 외출 설정. 꺼진 갈래는 주기가 없어 저절로 빠진다. */
  outing: Map<OutingKind, OutingConfig>;
  /** 잔여를 깎는 내 구간 전부. 남은 횟수를 세는 데 쓴다. */
  segments: readonly SegmentLike[];
  dischargeAt?: string | null;
}) {
  const notes = OUTING_KINDS.map((kind) =>
    outingCycleNoteFor(
      kind,
      props.outing.get(kind),
      props.date,
      props.dischargeAt,
    ),
  ).filter((note) => note !== null);

  if (!notes.length) return null;

  return (
    <div className="card" style={{ padding: "var(--sp-md)" }}>
      <h3 className="body-sm strong" style={{ marginBottom: "var(--sp-xs)" }}>
        외출 주기
      </h3>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gap: "var(--sp-xs)",
        }}
      >
        {notes.map((note) => {
          const key = outingBalanceKey(note.kind);
          const remaining = outingRemainingDays(
            note.kind,
            note.cycle,
            props.segments,
          );
          return (
            <li key={note.kind} className="caption text-body">
              <span className="cal-outing-start" data-balance={key}>
                {BALANCE_LABELS[key]}
              </span>{" "}
              {note.isStart ? (
                <>
                  이 날 <strong>{note.cycle.index}주기가 시작</strong>돼요 ·{" "}
                  {note.cycle.grantDays}회 적립
                </>
              ) : (
                <>
                  {note.cycle.index}주기{" "}
                  {fmtRangeTiny(note.cycle.start, note.cycle.end)} 안에 속한
                  날이에요
                </>
              )}{" "}
              · 잔여 {Math.max(remaining, 0)}회
            </li>
          );
        })}
      </ul>
    </div>
  );
}
