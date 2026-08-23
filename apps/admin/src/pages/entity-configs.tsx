/**
 * 관리자 목록 화면의 리소스별 설정표.
 *
 * 사용처: apps/admin/src/pages/EntityPage.tsx.
 *
 * 관리자 화면 열두 개는 "제목 / 설명 / 어떤 열을 보여줄지 / 생성·삭제가 되는지"만
 * 다르고 나머지(검색·페이지·상세 서랍·확인 대화상자)는 완전히 같다. 그래서
 * 화면마다 컴포넌트를 만들지 않고, 이 표에 한 줄 추가하는 방식으로 확장한다.
 *
 * 새 리소스를 붙이려면: `EntityResource`에 이름을 넣고 이 표에 항목을 더하면 된다.
 * 편집까지 필요하면 RecordForm의 `EditableResource`에도 넣어야 한다.
 */
import {
  BALANCE_LABELS,
  fmtRangeTiny,
  REPORT_REASON_LABELS,
  segmentBalanceKey,
  type LeaveSegment,
} from "@leave/shared";
import type { ReactNode } from "react";
import { StatusBadge, type Column } from "../components/ui";
import type { EditableResource } from "../components/RecordForm";
import { formatDateTime, text } from "../lib/format";

/** 관리자 화면이 다루는 모든 리소스. 읽기 전용 로그류도 포함한다. */
export type EntityResource =
  | EditableResource
  | "unit-invites"
  | "content-reports"
  | "access-logs"
  | "push-logs"
  | "sessions"
  | "admin-sessions"
  | "audit-logs";

/** 서버가 주는 행. 리소스마다 모양이 달라 열 정의에서 필요한 키만 꺼내 쓴다. */
export type Entity = Record<string, unknown> & { id: string };

export type ResourceConfig = {
  title: string;
  description: string;
  /** 지정하면 헤더에 생성 버튼이 생긴다. */
  createLabel?: string;
  /** 상세 서랍에서 편집할 수 있는가(= RecordForm이 이 리소스를 안다). */
  editable?: boolean;
  deletable?: boolean;
  /** 지정하면 CSV 내보내기 버튼이 생긴다. */
  exportPath?: string;
  columns: Column<Entity>[];
  emptyLabel?: string;
};

const REPORT_STATUS_LABELS: Record<string, string> = {
  open: "미처리",
  reviewing: "확인 중",
  resolved: "처리 완료",
};

/** 초대코드는 폐기·만료·소진 중 어느 이유로 못 쓰는지가 운영에서 중요하다. */
function inviteStatusLabel(item: Entity): string {
  if (item.revokedAt) return "폐기";
  if (
    typeof item.expiresAt === "string" &&
    item.expiresAt <= new Date().toISOString()
  ) {
    return "만료";
  }
  const used = Number(item.usedCount ?? 0);
  const max = Number(item.maxUses ?? 0);
  if (max > 0 && used >= max) return "소진";
  return "유효";
}

/** 이름 + 부가 식별자(이메일·id)를 두 줄로 보여주는 공용 셀. */
function twoLineCell(primary: unknown, secondary: unknown): ReactNode {
  return (
    <span className="person-cell">
      <strong>{text(primary)}</strong>
      <small>{text(secondary)}</small>
    </span>
  );
}

/** 리소스마다 사용자 정보를 담는 키가 달라(userName/name 등) 여기서 흡수한다. */
function person(item: Entity): ReactNode {
  return twoLineCell(
    item.userName ?? item.name,
    item.userEmail ?? item.email ?? item.userId,
  );
}

/** 자주 쓰는 열 정의 생성기 — 같은 모양을 열두 번 적지 않기 위해. */
const col = {
  time: (key: string, label: string, field: string): Column<Entity> => ({
    key,
    label,
    render: (item) => formatDateTime(item[field]),
  }),
  plain: (key: string, label: string, field: string): Column<Entity> => ({
    key,
    label,
    render: (item) => text(item[field]),
  }),
  mono: (key: string, label: string, field: string): Column<Entity> => ({
    key,
    label,
    className: "mono-cell",
    render: (item) => text(item[field]),
  }),
  badge: (key: string, label: string, field: string): Column<Entity> => ({
    key,
    label,
    render: (item) => <StatusBadge value={item[field] as string} />,
  }),
  person: (key = "user", label = "사용자"): Column<Entity> => ({
    key,
    label,
    render: person,
  }),
};

/** 휴가 구간을 "재원 이름 + 기간" 목록으로 요약한다. */
function segmentsCell(item: Entity): ReactNode {
  const segments = Array.isArray(item.segments)
    ? (item.segments as LeaveSegment[])
    : [];
  if (!segments.length) return "—";
  return (
    <span className="person-cell">
      {segments.map((segment) => (
        <small key={`${segment.category}-${segment.startDate}`}>
          {BALANCE_LABELS[segmentBalanceKey(segment)]}{" "}
          {fmtRangeTiny(segment.startDate, segment.endDate)}
        </small>
      ))}
    </span>
  );
}

export const entityConfigs: Record<EntityResource, ResourceConfig> = {
  users: {
    title: "사용자",
    description: "전체 사용자 계정과 소속, 복무 정보, 동의 상태를 관리합니다.",
    createLabel: "사용자 추가",
    editable: true,
    deletable: true,
    columns: [
      col.person("name"),
      // 지원 문의는 대개 "@아이디로 찾아 주세요"로 들어온다.
      col.plain("username", "@아이디", "username"),
      col.plain("branch", "군 종류", "branch"),
      col.plain("unit", "부대", "unitName"),
      {
        key: "service",
        label: "복무 기간",
        render: (item) =>
          `${text(item.enlistedAt)} – ${text(item.dischargeAt)}`,
      },
      {
        key: "consent",
        label: "수집 동의",
        render: (item) => (
          <StatusBadge value={item.consentedAt ? "동의" : "미동의"} />
        ),
      },
      col.time("created", "가입일", "createdAt"),
    ],
  },

  units: {
    title: "부대",
    description: "모든 부대와 관리자, 인원 및 최대 출타 기준을 관리합니다.",
    createLabel: "부대 추가",
    editable: true,
    deletable: true,
    columns: [
      {
        key: "name",
        label: "부대",
        render: (item) => twoLineCell(item.name, item.id),
      },
      col.plain("members", "가입 인원", "memberCount"),
      col.plain("admin", "관리자 ID", "adminId"),
      {
        key: "maxLeaveCount",
        label: "하루 최대 출타",
        render: (item) => `${text(item.maxLeaveCount)}명`,
      },
      col.time("created", "생성일", "createdAt"),
    ],
  },

  leaves: {
    title: "휴가",
    description:
      "전체 사용자의 휴가 일정을 조회하고 대신 생성·수정할 수 있습니다.",
    createLabel: "휴가 추가",
    editable: true,
    deletable: true,
    columns: [
      col.person(),
      {
        key: "title",
        label: "휴가",
        render: (item) => twoLineCell(item.title, item.reason),
      },
      col.plain("unit", "부대", "unitName"),
      {
        key: "period",
        label: "기간",
        render: (item) => `${text(item.startDate)} – ${text(item.endDate)}`,
      },
      { key: "segments", label: "구간", render: segmentsCell },
      col.time("created", "등록일", "createdAt"),
    ],
  },

  "unit-invites": {
    title: "초대코드",
    description:
      "발급된 그룹 초대코드의 유효 상태를 확인하고 폐기합니다. 코드 원문은 저장하지 않아 조회할 수 없습니다.",
    deletable: true,
    columns: [
      col.plain("unit", "그룹", "unitName"),
      col.plain("unitId", "그룹 ID", "unitId"),
      {
        key: "uses",
        label: "사용",
        render: (item) =>
          `${text(item.usedCount ?? 0)} / ${text(item.maxUses ?? 0)}`,
      },
      col.time("expires", "만료", "expiresAt"),
      {
        key: "status",
        label: "상태",
        render: (item) => <StatusBadge value={inviteStatusLabel(item)} />,
      },
      col.time("created", "발급일", "createdAt"),
    ],
  },

  "content-reports": {
    title: "신고",
    description:
      "그룹 이름·설명과 참여자 별칭 신고를 처리합니다. 미처리 건이 위로 옵니다. 접수 후 24시간 안에 조치해야 합니다.",
    columns: [
      {
        key: "status",
        label: "상태",
        render: (item) => (
          <StatusBadge
            value={REPORT_STATUS_LABELS[String(item.status)] ?? "—"}
          />
        ),
      },
      {
        key: "target",
        label: "대상",
        render: (item) =>
          twoLineCell(
            item.targetType === "unit" ? "그룹" : "참여자",
            item.targetId,
          ),
      },
      {
        key: "reason",
        label: "사유",
        render: (item) =>
          REPORT_REASON_LABELS[
            String(item.reason) as keyof typeof REPORT_REASON_LABELS
          ] ?? text(item.reason),
      },
      col.plain("detail", "내용", "detail"),
      col.time("created", "접수", "createdAt"),
    ],
  },

  notifications: {
    title: "알림",
    description: "인앱 알림을 관리하고 확인 후 Expo 푸시를 발송합니다.",
    createLabel: "알림 발송",
    editable: true,
    deletable: true,
    columns: [
      col.person(),
      {
        key: "title",
        label: "알림",
        render: (item) => twoLineCell(item.title, item.body),
      },
      {
        key: "read",
        label: "열람",
        render: (item) => <StatusBadge value={item.read ? "읽음" : "미열람"} />,
      },
      col.time("created", "생성일", "createdAt"),
    ],
  },

  "access-logs": {
    title: "접속 로그",
    description:
      "접속 시각·경로·상태·앱 플랫폼/버전만 남깁니다. IP·국가·User-Agent는 저장하지 않습니다.",
    exportPath: "/access-logs/export",
    columns: [
      col.time("time", "시각", "createdAt"),
      col.person(),
      col.mono("path", "경로", "path"),
      col.badge("status", "상태", "status"),
      col.plain("platform", "플랫폼", "platform"),
      col.plain("appVersion", "앱 버전", "appVersion"),
      {
        key: "duration",
        label: "응답 시간",
        // 느린 응답을 눈에 띄게 해 성능 회귀를 표에서 바로 잡아낸다.
        render: (item) => (
          <span
            className={Number(item.durationMs) >= 500 ? "text-negative" : ""}
          >
            {item.durationMs == null ? "—" : `${text(item.durationMs)}ms`}
          </span>
        ),
      },
    ],
  },

  "push-logs": {
    title: "푸시 로그",
    description:
      "푸시 발송·수신·열람 이벤트와 결과만 남깁니다. 메시지 원문과 데이터는 저장하지 않습니다.",
    exportPath: "/push-logs/export",
    columns: [
      col.time("time", "시각", "createdAt"),
      col.person(),
      col.badge("direction", "방향", "direction"),
      col.mono("notificationId", "알림 ID", "notificationId"),
      col.badge("status", "결과", "status"),
    ],
  },

  sessions: {
    title: "사용자 세션",
    description: "활성 사용자 세션을 조회하고 즉시 강제 만료할 수 있습니다.",
    columns: [
      col.person(),
      col.mono("id", "세션 ID", "id"),
      col.time("created", "생성일", "createdAt"),
      col.time("expires", "만료일", "expiresAt"),
      {
        key: "state",
        label: "상태",
        render: (item) => (
          <StatusBadge
            value={
              new Date(String(item.expiresAt)) > new Date() ? "활성" : "만료"
            }
          />
        ),
      },
    ],
  },

  "admin-sessions": {
    title: "관리자 세션",
    description: "관리자 로그인 세션과 접속 환경을 확인하고 강제 만료합니다.",
    columns: [
      {
        key: "admin",
        label: "관리자",
        render: (item) => twoLineCell(item.adminName, item.adminEmail),
      },
      col.plain("ip", "IP", "ip"),
      col.plain("userAgent", "사용 환경", "userAgent"),
      col.time("lastSeen", "최근 활동", "lastSeenAt"),
      col.time("expires", "만료일", "expiresAt"),
    ],
  },

  "audit-logs": {
    title: "관리자 감사 로그",
    description:
      "관리자가 수행한 모든 데이터 변경 이력을 읽기 전용으로 확인합니다.",
    exportPath: "/audit-logs/export",
    columns: [
      col.time("time", "시각", "createdAt"),
      col.plain("admin", "관리자", "adminEmail"),
      col.badge("action", "작업", "action"),
      col.plain("entity", "대상", "entityType"),
      col.mono("entityId", "대상 ID", "entityId"),
      col.plain("ip", "IP", "ip"),
    ],
  },

  admins: {
    title: "관리자 계정",
    description: "관리자 계정과 역할, 활성 상태를 owner 권한으로 관리합니다.",
    createLabel: "관리자 추가",
    editable: true,
    columns: [
      {
        key: "admin",
        label: "관리자",
        render: (item) => twoLineCell(item.name, item.email),
      },
      col.badge("role", "역할", "role"),
      {
        key: "active",
        label: "상태",
        render: (item) => <StatusBadge value={Boolean(item.active)} />,
      },
      {
        key: "password",
        label: "비밀번호",
        render: (item) => (
          <StatusBadge value={item.mustChangePassword ? "변경 필요" : "정상"} />
        ),
      },
      col.time("created", "생성일", "createdAt"),
    ],
  },
};
