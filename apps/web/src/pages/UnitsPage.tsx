import { unitCreateSchema } from "@leave/shared";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Me } from "../api/queries";
import {
  useCreateUnit,
  useJoinUnit,
  useLeaveUnit,
  useUnitSearch,
} from "../api/queries";
import { Field } from "../components/Field";
import { Modal } from "../components/Modal";

const RATIO_PRESETS = [
  { n: 1, d: 3 },
  { n: 1, d: 4 },
  { n: 1, d: 5 },
] as const;

export function UnitsPage(props: { me: Me }) {
  const myUnit = props.me.unit;
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const search = useUnitSearch(debounced);
  const join = useJoinUnit();
  const leaveUnit = useLeaveUnit();

  const doJoin = async (unitId: string) => {
    await join.mutateAsync(unitId);
    navigate("/", { replace: true });
  };

  return (
    <div
      className="anim-rise"
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "var(--sp-2xl) 0 var(--sp-3xl)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-xl)",
      }}
    >
      <header>
        <h1 className="display-md">부대 찾기</h1>
        <p className="body-lg text-body" style={{ marginTop: "var(--sp-sm)" }}>
          {myUnit
            ? "다른 부대로 옮기거나 부대에서 나갈 수 있어요."
            : "소속 부대에 들어가면 휴가 달력이 열려요."}
        </p>
      </header>

      {myUnit && (
        <div
          className="card-green"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--sp-lg)",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p className="eyebrow" style={{ color: "var(--positive-deep)" }}>
              내 부대
            </p>
            <p className="display-xs" style={{ marginTop: 4 }}>
              {myUnit.name}
            </p>
            <p className="caption text-body" style={{ marginTop: 4 }}>
              부대원 {myUnit.memberCount}명 · 최대 출타율{" "}
              {myUnit.maxLeaveNumerator}/{myUnit.maxLeaveDenominator}
            </p>
          </div>
          <div style={{ display: "flex", gap: "var(--sp-sm)" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => navigate("/")}
            >
              달력 보기
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={leaveUnit.isPending}
              onClick={() => {
                if (confirm(`${myUnit.name}에서 나갈까요?`)) {
                  void leaveUnit.mutateAsync();
                }
              }}
            >
              부대 나가기
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-lg)" }}>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="부대 이름으로 검색 (예: 제12보병사단)"
          aria-label="부대 검색"
        />

        {search.isPending ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "var(--sp-xl)" }}>
            <div className="spinner" aria-label="검색 중" />
          </div>
        ) : search.data && search.data.units.length > 0 ? (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {search.data.units.map((u) => (
              <li
                key={u.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "var(--sp-lg)",
                  padding: "var(--sp-md) 0",
                  borderBottom: "1px solid var(--canvas-soft)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p className="body-sm strong">{u.name}</p>
                  <p className="caption text-mute">
                    부대원 {u.memberCount}명 · 최대 출타율 {u.maxLeaveNumerator}/
                    {u.maxLeaveDenominator}
                    {u.description ? ` · ${u.description}` : ""}
                  </p>
                </div>
                {myUnit?.id === u.id ? (
                  <span className="badge badge-positive">소속됨</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-tertiary btn-sm"
                    disabled={join.isPending}
                    onClick={() => void doJoin(u.id)}
                  >
                    가입
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div
            className="card-sage"
            style={{ textAlign: "center", padding: "var(--sp-2xl)" }}
          >
            <p className="body-sm text-body">
              {debounced
                ? `"${debounced}"에 해당하는 부대가 없어요.`
                : "부대 이름을 검색해보세요."}
            </p>
            <p className="caption text-mute" style={{ marginTop: 4 }}>
              찾는 부대가 없다면 새로 만들 수 있어요.
            </p>
          </div>
        )}

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setCreateOpen(true)}
        >
          새 부대 만들기
        </button>
      </div>

      {createOpen && (
        <CreateUnitModal
          initialName={debounced}
          onClose={() => setCreateOpen(false)}
          onCreated={() => navigate("/", { replace: true })}
        />
      )}
    </div>
  );
}

function CreateUnitModal(props: {
  initialName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState(props.initialName);
  const [description, setDescription] = useState("");
  const [num, setNum] = useState(1);
  const [den, setDen] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateUnit();

  const submit = async () => {
    const input = {
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      maxLeaveNumerator: num,
      maxLeaveDenominator: den,
    };
    const parsed = unitCreateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    try {
      await create.mutateAsync(parsed.data);
      props.onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "부대를 만들지 못했습니다");
    }
  };

  const example = Math.floor((30 * num) / den);

  return (
    <Modal title="새 부대 만들기" onClose={props.onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: "var(--sp-lg)" }}
      >
        <Field label="부대 이름">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 제12보병사단 51연대 2대대"
            autoFocus
          />
        </Field>
        <Field label="소개 (선택)">
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="부대를 알아볼 수 있는 한 줄"
          />
        </Field>
        <Field
          label="최대 출타율"
          hint={`예: 부대원 30명이면 하루 최대 ${example}명까지 출타할 수 있어요`}
        >
          <div style={{ display: "flex", gap: "var(--sp-sm)", alignItems: "center" }}>
            {RATIO_PRESETS.map((p) => (
              <button
                key={`${p.n}/${p.d}`}
                type="button"
                className={`btn btn-sm ${num === p.n && den === p.d ? "btn-primary" : "btn-secondary"}`}
                aria-pressed={num === p.n && den === p.d}
                onClick={() => {
                  setNum(p.n);
                  setDen(p.d);
                }}
              >
                {p.n}/{p.d}
              </button>
            ))}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginLeft: "auto",
              }}
            >
              <input
                className="input"
                type="number"
                min={1}
                value={num}
                onChange={(e) => setNum(Number(e.target.value))}
                style={{ width: 64, textAlign: "center" }}
                aria-label="출타율 분자"
              />
              <span className="strong">/</span>
              <input
                className="input"
                type="number"
                min={1}
                value={den}
                onChange={(e) => setDen(Number(e.target.value))}
                style={{ width: 64, textAlign: "center" }}
                aria-label="출타율 분모"
              />
            </div>
          </div>
        </Field>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={create.isPending}>
          {create.isPending ? "만드는 중…" : "부대 만들고 가입하기"}
        </button>
      </form>
    </Modal>
  );
}
