// 실제 앱(theme.ts / DESIGN.md)의 디자인 토큰을 반영한 스토어 스크린샷용 화면 컴포넌트.
// 각 화면은 고정 논리 크기(폰 430x930, 태블릿 1180x1480)로 그린 뒤, 렌더 시 transform:scale로 프레임에 맞춘다.

export const C = {
  primary: "#9fe870",
  onPrimary: "#0e0f0c",
  primaryPale: "#e2f6d5",
  ink: "#0e0f0c",
  inkDeep: "#163300",
  body: "#454745",
  mute: "#868685",
  canvas: "#ffffff",
  canvasSoft: "#e8ebe6",
  positive: "#2ead4b",
  warning: "#ffd11a",
  negative: "#d03238",
  negativeDeep: "#a72027",
  negativeTint: "rgba(208,50,56,0.10)",
};

// 군 관련 식별 정보가 전혀 없는 스토어용 가상 데이터
const members = [
  { name: "민트01", label: "공유 일정", c: "#9fe870" },
  { name: "라임02", label: "공유 일정", c: "#ffd11a" },
  { name: "하늘03", label: "공유 일정", c: "#7cc0ff" },
  { name: "코랄04", label: "공유 일정", c: "#ff9db1" },
  { name: "보라05", label: "공유 일정", c: "#c3a6ff" },
];

function avatar(m, size = 54) {
  const init = m.name.slice(1, 2);
  return `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${m.c};display:flex;align-items:center;justify-content:center;font-weight:800;color:#0e0f0c;font-size:${size*0.42}px;flex:none">${init}</div>`;
}

const statusBar = (dark = false) => {
  const fg = dark ? "#fff" : C.ink;
  const bar = (h) => `<i style="width:5px;height:${h}px;background:${fg};border-radius:1px;display:block"></i>`;
  return `
<div style="height:54px;display:flex;align-items:center;justify-content:space-between;padding:0 34px 0 40px;font-weight:700;font-size:26px;color:${fg}">
  <span>9:41</span>
  <span style="display:flex;gap:11px;align-items:center">
    <span style="display:flex;gap:3px;align-items:flex-end">${bar(8)}${bar(12)}${bar(16)}${bar(20)}</span>
    <span style="width:26px;height:20px;position:relative;display:inline-block">
      <span style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:7px;height:7px;border-radius:999px;background:${fg}"></span>
      <span style="position:absolute;bottom:5px;left:50%;transform:translateX(-50%);width:16px;height:16px;border:3px solid ${fg};border-bottom-color:transparent;border-left-color:transparent;border-radius:999px;rotate:-45deg"></span>
      <span style="position:absolute;bottom:9px;left:50%;transform:translateX(-50%);width:26px;height:26px;border:3px solid ${fg};border-bottom-color:transparent;border-left-color:transparent;border-radius:999px;rotate:-45deg"></span>
    </span>
    <span style="width:38px;height:20px;border:2px solid ${fg};border-radius:5px;position:relative;display:inline-block;opacity:.95">
      <span style="position:absolute;top:3px;left:3px;bottom:3px;width:24px;background:${fg};border-radius:2px"></span>
      <span style="position:absolute;top:6px;right:-4px;width:3px;height:8px;background:${fg};border-radius:1px"></span>
    </span>
  </span>
</div>`;
};

// ── 1) 부대 달력 ────────────────────────────────────────────────
function calendarScreen() {
  // 7월 달력: 별칭과 혼잡 신호만 표시
  const leaveDays = {
    3: { signal: "여유", names: ["민트01", "라임02"] },
    4: { signal: "여유", names: ["민트01", "라임02"] },
    11: { signal: "보통", names: ["하늘03", "코랄04"] },
    14: { signal: "초과", over: true, names: ["민트01", "라임02"] },
    15: { signal: "초과", over: true, names: ["민트01", "하늘03"] },
    16: { signal: "초과", over: true, names: ["하늘03", "코랄04"] },
    22: { signal: "여유", names: ["보라05"] },
    23: { signal: "임박", names: ["민트01", "하늘03"] },
  };
  const first = 2; // 2026-07-01 수요일(0=일)
  const days = 31;
  let cells = "";
  for (let i = 0; i < first; i++) cells += `<div class="cell empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const info = leaveDays[d];
    const dow = (first + d - 1) % 7;
    const today = d === 11;
    const over = info?.over;
    cells += `<div class="cell ${over ? "over" : ""}">
      <div class="dnum ${today ? "today" : ""}" style="${dow === 0 && !today ? `color:${C.negative}` : ""}">${d}</div>
      ${info ? `<div class="chips">${info.names.slice(0,2).map(n=>`<span class="chip ${over?"over":""}">${n}</span>`).join("")}</div>
      <div class="cnt ${over?"over":""}">${info.signal}</div>` : ""}
    </div>`;
  }
  return `
  <div class="screen-root" style="background:${C.canvasSoft}">
    ${statusBar()}
    <div style="padding:8px 28px 0">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:26px;color:${C.mute};font-weight:700">초록 그룹 · 가상 샘플</div>
          <div style="font-size:44px;font-weight:800;color:${C.ink};letter-spacing:-1px;margin-top:2px">2026년 7월</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:6px">
          <div class="rbtn">‹</div><div class="rbtn">›</div>
        </div>
      </div>
    </div>
    <div style="padding:18px 22px 0">
      <div class="wk">${["일","월","화","수","목","금","토"].map((w,i)=>`<div style="${i===0?`color:${C.negative}`:`color:${C.mute}`}">${w}</div>`).join("")}</div>
      <div class="grid">${cells}</div>
    </div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:150px;background:linear-gradient(to top,${C.canvasSoft} 40%,transparent);pointer-events:none"></div>
    <div class="fab">＋ 휴가 등록</div>
    <style>
      .rbtn{width:56px;height:56px;border-radius:999px;background:${C.canvas};display:flex;align-items:center;justify-content:center;font-size:32px;color:${C.ink};font-weight:700}
      .wk{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-weight:700;font-size:22px;padding-bottom:8px}
      .grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
      .cell{min-height:112px;border-radius:12px;background:${C.canvas};padding:8px 6px;display:flex;flex-direction:column;align-items:center;gap:5px}
      .cell.empty{background:transparent}
      .cell.over{background:${C.negativeTint}}
      .dnum{font-size:24px;font-weight:700;color:${C.ink};width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:999px}
      .dnum.today{background:${C.primary};color:${C.onPrimary}}
      .cell.over .dnum{color:${C.negativeDeep}}
      .chips{display:flex;flex-direction:column;gap:3px;width:100%;align-items:center}
      .chip{font-size:16px;font-weight:700;background:${C.primaryPale};color:${C.inkDeep};border-radius:6px;padding:2px 8px;max-width:92%;overflow:hidden;white-space:nowrap}
      .chip.over{background:#f6d5d7;color:${C.negativeDeep}}
      .cnt{font-size:18px;font-weight:800;color:${C.mute};margin-top:auto}
      .cnt.over{color:#fff;background:${C.negative};border-radius:999px;padding:1px 12px}
      .fab{position:absolute;bottom:56px;left:50%;transform:translateX(-50%);background:${C.primary};color:${C.onPrimary};font-weight:800;font-size:30px;padding:24px 44px;border-radius:999px;box-shadow:0 14px 30px rgba(22,51,0,.28);white-space:nowrap}
    </style>
  </div>`;
}

// ── 2) 날짜 상세 패널(출타율 초과) ──────────────────────────────
function dayPanelScreen() {
  const on = [members[0], members[1], members[2], members[3], members[4]];
  const titles = ["포상휴가", "정기휴가", "청원휴가", "위로휴가", "연가"];
  return `
  <div class="screen-root" style="background:${C.canvasSoft}">
    ${statusBar()}
    <div style="padding:14px 34px 0">
      <div style="font-size:26px;color:${C.mute};font-weight:700">2026년 7월</div>
      <div style="font-size:46px;font-weight:800;color:${C.ink};letter-spacing:-1px">7월 15일 (화)</div>
    </div>
    <div style="margin:20px 26px 0;background:${C.negative};border-radius:20px;padding:26px 28px;display:flex;align-items:center;gap:18px">
      <div style="font-size:40px">⚠️</div>
      <div>
        <div style="color:#fff;font-weight:800;font-size:30px">출타율 초과</div>
        <div style="color:#ffe3e4;font-weight:600;font-size:24px;margin-top:2px">입력 일정 기준 · 공식 승인 아님</div>
      </div>
    </div>
    <div style="padding:26px 30px 0;font-weight:800;font-size:28px;color:${C.ink}">이 날 공유된 일정</div>
    <div style="padding:14px 26px 0;display:flex;flex-direction:column;gap:14px">
      ${on.map((m,i)=>`
      <div style="background:${C.canvas};border-radius:18px;padding:20px 22px;display:flex;align-items:center;gap:18px">
        ${avatar(m,64)}
        <div style="flex:1">
          <div style="font-weight:800;font-size:28px;color:${C.ink}">${m.name} <span style="color:${C.mute};font-weight:700;font-size:22px">· ${m.label}</span></div>
          <div style="color:${C.body};font-size:23px;margin-top:2px">${titles[i]}</div>
        </div>
        ${i<3?`<div style="background:${C.negativeTint};color:${C.negativeDeep};font-weight:800;font-size:20px;padding:6px 14px;border-radius:999px">겹침</div>`:""}
      </div>`).join("")}
    </div>
  </div>`;
}

// ── 3) 휴가 등록 폼 ─────────────────────────────────────────────
function leaveFormScreen() {
  const field = (label, val, hint, ph=false) => `
    <div style="margin-top:26px">
      <div style="font-weight:700;font-size:24px;color:${C.body};margin-bottom:10px">${label}${hint?` <span style="color:${C.mute};font-weight:600">${hint}</span>`:""}</div>
      <div style="background:${C.canvasSoft};border-radius:16px;padding:24px 24px;font-size:28px;font-weight:${ph?600:700};color:${ph?C.mute:C.ink}">${val}</div>
    </div>`;
  return `
  <div class="screen-root" style="background:${C.canvas}">
    ${statusBar()}
    <div style="height:24px"></div>
    <div style="width:64px;height:6px;border-radius:999px;background:#d8dcd6;margin:0 auto 8px"></div>
    <div style="padding:8px 34px 0">
      <div style="font-size:44px;font-weight:800;color:${C.ink};letter-spacing:-1px">휴가 등록</div>
      ${field("제목", "포상휴가")}
      <div style="display:flex;gap:16px">
        <div style="flex:1">${field("시작일", "2026-07-14")}</div>
        <div style="flex:1">${field("종료일", "2026-07-16")}</div>
      </div>
      ${field("메모", "개인 메모는 최소한으로", "(선택)")}
    </div>
    <div style="position:absolute;left:34px;right:34px;bottom:60px">
      <div style="background:${C.primary};color:${C.onPrimary};font-weight:800;font-size:32px;text-align:center;padding:28px;border-radius:999px">등록하기</div>
    </div>
  </div>`;
}

// ── 4) 부대 만들기 / 검색 ───────────────────────────────────────
function unitScreen() {
  const units = [
    { n: "초록 그룹", p: "참여율 74% · 기준값 설정됨" },
    { n: "파랑 그룹", p: "참여율 81% · 기준값 설정됨" },
    { n: "노랑 그룹", p: "참여율 68% · 확인 필요" },
  ];
  return `
  <div class="screen-root" style="background:${C.canvasSoft}">
    ${statusBar()}
    <div style="padding:14px 34px 0">
      <div style="font-size:44px;font-weight:800;color:${C.ink};letter-spacing:-1px">그룹 찾기</div>
    </div>
    <div style="padding:20px 30px 0">
      <div style="background:${C.canvas};border-radius:16px;padding:24px 26px;display:flex;align-items:center;gap:16px;font-size:27px;color:${C.mute};font-weight:600">
        <span style="font-size:28px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" style="vertical-align:-5px"><circle cx="10.5" cy="10.5" r="6.5" stroke="${C.mute}" stroke-width="2.4"/><line x1="15.5" y1="15.5" x2="21" y2="21" stroke="${C.mute}" stroke-width="2.6" stroke-linecap="round"/></svg></span> 그룹 이름 검색…
      </div>
    </div>
    <div style="padding:22px 30px 0;display:flex;flex-direction:column;gap:14px">
      ${units.map((u,i)=>`
      <div style="background:${C.canvas};border-radius:18px;padding:24px 24px;display:flex;align-items:center;gap:16px;${i===0?`outline:3px solid ${C.primary}`:""}">
        <div style="width:60px;height:60px;border-radius:14px;background:${C.primaryPale};display:flex;align-items:center;justify-content:center;font-size:30px">○</div>
        <div style="flex:1">
          <div style="font-weight:800;font-size:27px;color:${C.ink}">${u.n}</div>
          <div style="color:${C.mute};font-size:22px;margin-top:2px">${u.p}</div>
        </div>
        ${i===0?`<div style="background:${C.primary};color:${C.onPrimary};font-weight:800;font-size:22px;padding:10px 20px;border-radius:999px">가입</div>`:`<div style="color:${C.mute};font-size:34px">›</div>`}
      </div>`).join("")}
    </div>
    <div style="padding:26px 30px 0">
      <div style="border:3px dashed #c4cabf;border-radius:18px;padding:28px;text-align:center;color:${C.body}">
        <div style="font-weight:800;font-size:27px;color:${C.ink}">＋ 새 그룹 만들기</div>
        <div style="font-size:22px;margin-top:6px">실제 부대 식별 정보는 입력하지 마세요</div>
      </div>
    </div>
  </div>`;
}

// ── 5) 알림 ─────────────────────────────────────────────────────
function notifScreen() {
  const items = [
    { t: "혼잡 신호 변경", b: "초록 그룹의 7월 15일 신호가 초과로 바뀌었습니다.", time: "방금", unread: true },
    { t: "출타율 초과 알림", b: "7월 16일 외 1일에 출타율이 초과되었습니다. 일정을 확인해주세요.", time: "1시간 전", unread: true },
    { t: "출타율 초과 알림", b: "7월 14일에 최대 출타 인원을 초과했습니다.", time: "어제", unread: false },
  ];
  return `
  <div class="screen-root" style="background:${C.canvasSoft}">
    ${statusBar()}
    <div style="padding:14px 34px 0">
      <div style="font-size:44px;font-weight:800;color:${C.ink};letter-spacing:-1px">알림</div>
    </div>
    <div style="padding:22px 26px 0;display:flex;flex-direction:column;gap:14px">
      ${items.map(n=>`
      <div style="background:${C.canvas};border-radius:18px;padding:24px 24px;display:flex;gap:18px;${n.unread?`border-left:8px solid ${C.negative}`:""}">
        <div style="width:60px;height:60px;border-radius:14px;background:${C.negativeTint};display:flex;align-items:center;justify-content:center;font-size:30px;flex:none">🔔</div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <div style="font-weight:800;font-size:26px;color:${C.ink}">${n.t}</div>
            <div style="font-size:20px;color:${C.mute}">${n.time}</div>
          </div>
          <div style="color:${C.body};font-size:23px;margin-top:6px;line-height:1.4">${n.b}</div>
        </div>
      </div>`).join("")}
    </div>
  </div>`;
}

// ── 6) 프로필 ───────────────────────────────────────────────────
function profileScreen() {
  return `
  <div class="screen-root" style="background:${C.canvasSoft}">
    ${statusBar()}
    <div style="padding:40px 34px 0;display:flex;flex-direction:column;align-items:center">
      <div style="width:150px;height:150px;border-radius:999px;background:${C.primary};display:flex;align-items:center;justify-content:center;font-size:64px;font-weight:800;color:${C.onPrimary}">민</div>
      <div style="font-size:40px;font-weight:800;color:${C.ink};margin-top:20px">민트01</div>
      <div style="font-size:26px;color:${C.body};margin-top:4px">별칭으로 표시</div>
    </div>
    <div style="padding:34px 30px 0">
      <div style="background:${C.canvas};border-radius:20px;padding:28px 28px">
        <div style="display:flex;justify-content:space-between;font-size:24px;font-weight:700;color:${C.body}">
          <span>이번 달 휴가 계획</span><span style="color:${C.inkDeep};font-weight:800">2건</span>
        </div>
        <div style="height:20px;border-radius:999px;background:${C.canvasSoft};margin-top:14px;overflow:hidden">
          <div style="width:46%;height:100%;background:${C.primary};border-radius:999px"></div>
        </div>
        <div style="display:flex;gap:16px;margin-top:26px">
          <div style="flex:1;background:${C.primaryPale};border-radius:16px;padding:22px;text-align:center">
            <div style="font-size:22px;color:${C.inkDeep};font-weight:700">공유 계획</div>
            <div style="font-size:38px;font-weight:800;color:${C.inkDeep};margin-top:6px">2건</div>
          </div>
          <div style="flex:1;background:${C.primaryPale};border-radius:16px;padding:22px;text-align:center">
            <div style="font-size:22px;color:${C.inkDeep};font-weight:700">잔여 계획</div>
            <div style="font-size:38px;font-weight:800;color:${C.inkDeep};margin-top:6px">8일</div>
          </div>
        </div>
      </div>
      <div style="background:${C.canvas};border-radius:20px;padding:8px 28px;margin-top:16px">
        ${[["휴가 계획","이번 달 2건"],["알림","필요한 항목만 켜기"],["소속 그룹","초록 그룹"]].map((r,i)=>`
        <div style="display:flex;justify-content:space-between;padding:22px 0;${i<2?"border-bottom:2px solid "+C.canvasSoft:""};font-size:25px">
          <span style="color:${C.mute};font-weight:600">${r[0]}</span><span style="color:${C.ink};font-weight:700">${r[1]}</span>
        </div>`).join("")}
      </div>
    </div>
  </div>`;
}

// ── 태블릿(iPad): 넓은 화면에서 달력 + 상세 패널 나란히 ─────────
// 논리 크기 1200x1600 (iPad 13" 세로 0.75 비율에 근접)
function tabletCalendarScreen() {
  const leaveDays = {
    3:{signal:"여유",nm:["민트01","라임02"]},4:{signal:"여유",nm:["민트01","라임02"]},
    11:{signal:"보통",nm:["하늘03","코랄04"]},
    14:{signal:"초과",over:1,nm:["민트01","라임02"]},15:{signal:"초과",over:1,nm:["민트01","하늘03"]},16:{signal:"초과",over:1,nm:["하늘03","코랄04"]},
    22:{signal:"여유",nm:["보라05"]},23:{signal:"임박",nm:["민트01","하늘03"]},
  };
  const first=2,days=31;
  let cells="";
  for(let i=0;i<first;i++)cells+=`<div class="tc empty"></div>`;
  for(let d=1;d<=days;d++){const info=leaveDays[d];const today=d===11;const over=info?.over;const dow=(first+d-1)%7;
    cells+=`<div class="tc ${over?"tover":""}"><div class="tdn ${today?"ttoday":""}" style="${dow===0&&!today?`color:${C.negative}`:""}">${d}</div>
      ${info?`${info.nm.slice(0,2).map(n=>`<span class="tchip ${over?"tcover":""}">${n}</span>`).join("")}<div class="tcnt ${over?"tcntover":""}">${info.signal}</div>`:""}</div>`;}
  const on=[members[0],members[1],members[2],members[3],members[4]];
  const titles=["포상휴가","정기휴가","청원휴가","위로휴가","연가"];
  return `
  <div class="screen-root" style="background:${C.canvasSoft};flex-direction:row;padding:0">
    <div style="flex:1.55;padding:48px 44px;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div><div style="font-size:26px;color:${C.mute};font-weight:700">초록 그룹 · 가상 샘플</div>
        <div style="font-size:56px;font-weight:800;color:${C.ink};letter-spacing:-1px">2026년 7월</div></div>
        <div style="display:flex;gap:12px"><div class="trb">‹</div><div class="trb">›</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-weight:700;font-size:24px;margin-top:24px">
        ${["일","월","화","수","목","금","토"].map((w,i)=>`<div style="padding-bottom:10px;${i===0?`color:${C.negative}`:`color:${C.mute}`}">${w}</div>`).join("")}</div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;flex:1">${cells}</div>
    </div>
    <div style="flex:1;background:${C.canvas};padding:48px 40px;display:flex;flex-direction:column;gap:0">
      <div style="font-size:26px;color:${C.mute};font-weight:700">2026년 7월</div>
      <div style="font-size:46px;font-weight:800;color:${C.ink};letter-spacing:-1px">7월 15일 (화)</div>
      <div style="margin-top:22px;background:${C.negative};border-radius:20px;padding:26px;display:flex;align-items:center;gap:16px">
        <div style="font-size:38px">⚠️</div>
        <div><div style="color:#fff;font-weight:800;font-size:30px">출타율 초과</div>
        <div style="color:#ffe3e4;font-weight:600;font-size:23px">입력 일정 기준 · 공식 승인 아님</div></div>
      </div>
      <div style="font-weight:800;font-size:28px;color:${C.ink};margin:28px 0 4px">이 날 공유된 일정</div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px">
        ${on.map((m,i)=>`<div style="background:${C.canvasSoft};border-radius:16px;padding:18px 20px;display:flex;align-items:center;gap:16px">
          ${avatar(m,58)}<div style="flex:1"><div style="font-weight:800;font-size:26px;color:${C.ink}">${m.name} <span style="color:${C.mute};font-weight:700;font-size:20px">· ${m.label}</span></div>
          <div style="color:${C.body};font-size:21px">${titles[i]}</div></div></div>`).join("")}
      </div>
    </div>
    <style>
      .trb{width:56px;height:56px;border-radius:999px;background:${C.canvas};display:flex;align-items:center;justify-content:center;font-size:32px;color:${C.ink};font-weight:700}
      .tc{background:${C.canvas};border-radius:14px;padding:12px 8px;display:flex;flex-direction:column;align-items:center;gap:6px}
      .tc.empty{background:transparent}.tc.tover{background:${C.negativeTint}}
      .tdn{font-size:26px;font-weight:700;color:${C.ink};width:46px;height:46px;display:flex;align-items:center;justify-content:center;border-radius:999px}
      .tdn.ttoday{background:${C.primary};color:${C.onPrimary}}.tc.tover .tdn{color:${C.negativeDeep}}
      .tchip{font-size:17px;font-weight:700;background:${C.primaryPale};color:${C.inkDeep};border-radius:6px;padding:2px 10px}
      .tchip.tcover{background:#f6d5d7;color:${C.negativeDeep}}
      .tcnt{font-size:19px;font-weight:800;color:${C.mute};margin-top:auto}
      .tcnt.tcntover{color:#fff;background:${C.negative};border-radius:999px;padding:1px 12px}
    </style>
  </div>`;
}
function tabletUnitScreen() {
  const units=[{n:"초록 그룹",p:"참여율 74% · 기준값 설정됨"},{n:"파랑 그룹",p:"참여율 81% · 기준값 설정됨"},{n:"노랑 그룹",p:"참여율 68% · 확인 필요"}];
  const field=(label,val,hint,ph=false)=>`<div style="margin-top:24px"><div style="font-weight:700;font-size:23px;color:${C.body};margin-bottom:10px">${label}${hint?` <span style="color:${C.mute};font-weight:600">${hint}</span>`:""}</div>
    <div style="background:${C.canvasSoft};border-radius:16px;padding:22px;font-size:27px;font-weight:${ph?600:700};color:${ph?C.mute:C.ink}">${val}</div></div>`;
  return `
  <div class="screen-root" style="background:${C.canvasSoft};flex-direction:row;padding:0">
    <div style="flex:1;padding:48px 40px">
      <div style="font-size:52px;font-weight:800;color:${C.ink};letter-spacing:-1px">그룹 찾기</div>
      <div style="background:${C.canvas};border-radius:16px;padding:22px 24px;margin-top:22px;color:${C.mute};font-size:26px;font-weight:600"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" style="vertical-align:-5px"><circle cx="10.5" cy="10.5" r="6.5" stroke="${C.mute}" stroke-width="2.4"/><line x1="15.5" y1="15.5" x2="21" y2="21" stroke="${C.mute}" stroke-width="2.6" stroke-linecap="round"/></svg> 그룹 이름 검색…</div>
      <div style="display:flex;flex-direction:column;gap:14px;margin-top:22px">
        ${units.map((u,i)=>`<div style="background:${C.canvas};border-radius:18px;padding:22px;display:flex;align-items:center;gap:16px;${i===0?`outline:3px solid ${C.primary}`:""}">
          <div style="width:58px;height:58px;border-radius:14px;background:${C.primaryPale};display:flex;align-items:center;justify-content:center;font-size:28px">○</div>
          <div style="flex:1"><div style="font-weight:800;font-size:26px;color:${C.ink}">${u.n}</div>
          <div style="color:${C.mute};font-size:21px">${u.p}</div></div>
          ${i===0?`<div style="background:${C.primary};color:${C.onPrimary};font-weight:800;font-size:21px;padding:10px 20px;border-radius:999px">가입</div>`:`<div style="color:${C.mute};font-size:32px">›</div>`}</div>`).join("")}
      </div>
    </div>
    <div style="flex:1;background:${C.canvas};padding:48px 40px;display:flex;flex-direction:column">
      <div style="font-size:44px;font-weight:800;color:${C.ink};letter-spacing:-1px">휴가 등록</div>
      ${field("제목","포상휴가")}
      <div style="display:flex;gap:16px"><div style="flex:1">${field("시작일","2026-07-14")}</div><div style="flex:1">${field("종료일","2026-07-16")}</div></div>
      ${field("메모","개인 메모는 최소한으로","(선택)")}
      <div style="margin-top:auto"><div style="background:${C.primary};color:${C.onPrimary};font-weight:800;font-size:30px;text-align:center;padding:26px;border-radius:999px">등록하기</div></div>
    </div>
  </div>`;
}

export const SCREENS = {
  calendar: calendarScreen,
  dayPanel: dayPanelScreen,
  leaveForm: leaveFormScreen,
  unit: unitScreen,
  notif: notifScreen,
  profile: profileScreen,
  tabletCalendar: tabletCalendarScreen,
  tabletUnit: tabletUnitScreen,
};
