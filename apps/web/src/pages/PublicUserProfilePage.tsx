/**
 * 로그인 없이 보는 최소 공개 프로필 — `/u/{username}`의 웹 fallback.
 *
 * 앱이 설치된 기기에서는 운영체제의 Universal Link/App Link가 같은 주소를 앱으로
 * 연다. 웹에 남은 방문자에게는 별칭과 사용자 이름만 보여주며, 관계·일정·내부 id는
 * 인증 프로필 API와 화면에서만 다룬다.
 */

import { usePublicUserProfile } from "@leave/client";
import {
  ApiError,
  formatUsername,
  isCanonicalUsername,
  normalizeUsername,
} from "@leave/shared";
import { Link, useParams } from "react-router";
import { Avatar } from "../components/Avatar";
import { BrandLockup } from "../components/BrandLockup";
import { LegalLinks } from "../components/LegalLinks";
import { withNext } from "../state/next-destination";
import "./public-user-profile.css";

function ProfileMessage(props: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="card public-profile-message">
      <h1 className="display-xs">{props.title}</h1>
      <p className="text-body">{props.description}</p>
      {props.action}
    </section>
  );
}

export function PublicUserProfilePage() {
  const { username: rawUsername } = useParams<{ username: string }>();
  const profile = usePublicUserProfile(rawUsername);
  const username = rawUsername ? normalizeUsername(rawUsername) : "";
  const next = username ? `/u/${username}` : "/";
  const loginPath = withNext("/login", next);
  const isInvalidUsername = !isCanonicalUsername(username);
  const isMissing =
    profile.error instanceof ApiError && profile.error.status === 404;

  return (
    <div className="public-profile-page">
      <nav className="public-profile-nav" aria-label="공개 프로필 메뉴">
        <div className="container public-profile-nav-inner">
          <Link to="/" className="public-profile-brand" aria-label="리브 홈">
            <BrandLockup iconSize={30} />
          </Link>
          <Link to={loginPath} className="btn btn-secondary btn-sm">
            로그인
          </Link>
        </div>
      </nav>

      <main className="container public-profile-main">
        {isInvalidUsername || isMissing ? (
          <ProfileMessage
            title="사용자를 찾을 수 없어요"
            description="사용자 이름이 바뀌었거나 공개 프로필이 없는 계정이에요."
            action={
              <Link to="/" className="btn btn-secondary">
                리브 홈으로
              </Link>
            }
          />
        ) : profile.isPending ? (
          <div
            className="spinner"
            role="status"
            aria-label="프로필 불러오는 중"
          />
        ) : profile.isError || !profile.data ? (
          <ProfileMessage
            title="프로필을 불러오지 못했어요"
            description="잠시 후 다시 시도해주세요."
            action={
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void profile.refetch()}
              >
                다시 시도
              </button>
            }
          />
        ) : (
          <article
            className="card public-profile-card anim-rise"
            data-testid="public-profile"
          >
            <div className="public-profile-identity">
              <Avatar name={profile.data.name} size={80} />
              <div>
                <p className="eyebrow">리브 공개 프로필</p>
                <h1 className="display-sm">{profile.data.name}</h1>
                <p className="body-lg text-mute">
                  {formatUsername(profile.data.username)}
                </p>
              </div>
            </div>

            <div className="public-profile-action">
              <p className="text-body">
                로그인하면 친구를 맺고 서로 공유한 휴가 일정을 볼 수 있어요.
              </p>
              <Link
                to={withNext("/login", `/u/${profile.data.username}`)}
                className="btn btn-primary"
                data-testid="public-profile-login"
              >
                로그인하고 친구 추가
              </Link>
              <p className="caption text-mute">
                공개 프로필에는 이름과 사용자 이름만 표시돼요.
              </p>
            </div>
          </article>
        )}
      </main>

      <footer className="public-profile-footer">
        <LegalLinks />
      </footer>
    </div>
  );
}
