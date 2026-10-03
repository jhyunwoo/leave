import { describe, expect, it } from "vitest";
import {
  ONBOARDING_TOUR,
  TOUR_CANVAS,
  TOUR_ICONS,
  TOUR_PALETTE,
  sampleTourPose,
  tourAnimatedProps,
  type TourKey,
} from "../src";

describe("사용법 투어 장면", () => {
  it("앱의 핵심 기능을 실제로 밟는 순서대로 모두 보여준다", () => {
    // 어느 하나가 빠지면 처음 들어온 사람이 그 화면을 스스로 찾아야 한다.
    expect(ONBOARDING_TOUR.map((scene) => scene.id)).toEqual([
      "leave",
      "grants",
      "unit",
      "friends",
      "progress",
    ]);
  });

  it("장면마다 제목·설명·요점이 있다", () => {
    for (const scene of ONBOARDING_TOUR) {
      expect(scene.label.length).toBeGreaterThan(0);
      expect(scene.title.length).toBeGreaterThan(0);
      expect(scene.body.length).toBeGreaterThan(0);
      expect(scene.points.length).toBeGreaterThan(0);
      expect(scene.duration).toBeGreaterThanOrEqual(4000);
    }
  });

  it("친구 장면은 초대코드와 다른 기능임을 밝힌다", () => {
    // 초대코드로 부대원을 부르는 것을 친구 추가로 오해하는 사용자가 많았다.
    const friends = ONBOARDING_TOUR.find((scene) => scene.id === "friends");
    expect(friends?.body).toContain("@아이디");
    expect(friends?.body).toContain("초대코드");
    const unit = ONBOARDING_TOUR.find((scene) => scene.id === "unit");
    expect(unit?.body).toContain("초대코드");
  });

  it("노드 id는 장면 안에서 겹치지 않는다", () => {
    // 두 앱 모두 id를 React key로 쓴다. 겹치면 한쪽 노드가 사라진다.
    for (const scene of ONBOARDING_TOUR) {
      const ids = scene.nodes.map((node) => node.id);
      expect(new Set(ids).size, scene.id).toBe(ids.length);
    }
  });

  it("모든 노드가 캔버스 안에 놓인다", () => {
    for (const scene of ONBOARDING_TOUR)
      for (const node of scene.nodes) {
        expect(node.x, `${scene.id}/${node.id}`).toBeGreaterThanOrEqual(0);
        expect(node.y, `${scene.id}/${node.id}`).toBeGreaterThanOrEqual(0);
        expect(node.x + node.w, `${scene.id}/${node.id}`).toBeLessThanOrEqual(
          TOUR_CANVAS.width,
        );
        expect(node.y + node.h, `${scene.id}/${node.id}`).toBeLessThanOrEqual(
          TOUR_CANVAS.height,
        );
      }
  });

  it("키프레임 시점이 0~1 안에 있고 순서대로다", () => {
    for (const scene of ONBOARDING_TOUR)
      for (const node of scene.nodes) {
        const ats = (node.keys ?? []).map((key) => key.at);
        for (const at of ats) {
          expect(at).toBeGreaterThanOrEqual(0);
          expect(at).toBeLessThanOrEqual(1);
        }
        expect(ats, `${scene.id}/${node.id}`).toEqual(
          [...ats].sort((a, b) => a - b),
        );
      }
  });

  it("한 바퀴의 끝과 처음이 이어져 반복할 때 깜빡이지 않는다", () => {
    for (const scene of ONBOARDING_TOUR)
      for (const node of scene.nodes) {
        const start = sampleTourPose(node.keys, 0);
        const end = sampleTourPose(node.keys, 1);
        expect(
          Math.abs(start.opacity - end.opacity),
          `${scene.id}/${node.id}`,
        ).toBeLessThan(0.01);
        // 보이는 채로 넘어가는 노드는 자세까지 같아야 튀지 않는다.
        if (start.opacity > 0.01) {
          expect(end.x).toBeCloseTo(start.x);
          expect(end.y).toBeCloseTo(start.y);
          expect(end.scale * end.sx).toBeCloseTo(start.scale * start.sx);
        }
      }
  });

  it("멈춘 장면(동작 줄이기)에는 결과만 남고 손가락은 없다", () => {
    for (const scene of ONBOARDING_TOUR) {
      const visible = scene.nodes.filter(
        (node) => sampleTourPose(node.keys, scene.poster).opacity > 0.5,
      );
      expect(visible.length, scene.id).toBeGreaterThan(scene.nodes.length / 2);
      for (const node of scene.nodes)
        if (node.id.startsWith("finger"))
          expect(sampleTourPose(node.keys, scene.poster).opacity).toBe(0);
    }
  });

  it("쓰는 색과 아이콘이 모두 정의돼 있다", () => {
    for (const scene of ONBOARDING_TOUR)
      for (const node of scene.nodes) {
        const tones =
          node.kind === "box" ? [node.fill, node.stroke] : [node.color];
        for (const tone of tones)
          if (tone) {
            expect(TOUR_PALETTE.light[tone]).toBeDefined();
            expect(TOUR_PALETTE.dark[tone]).toBeDefined();
          }
        if (node.kind === "icon") expect(TOUR_ICONS[node.icon]).toBeDefined();
      }
  });
});

describe("키프레임 샘플링", () => {
  const keys: TourKey[] = [
    { at: 0.2, opacity: 0, y: 20 },
    { at: 0.4, opacity: 1, y: 0, ease: "linear" },
    { at: 0.6, x: 10 },
    { at: 0.8, x: 30, ease: "linear" },
  ];

  it("키프레임이 없으면 제자리에 그대로 보인다", () => {
    expect(sampleTourPose(undefined, 0.5)).toEqual({
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      sx: 1,
      sy: 1,
      rotate: 0,
    });
  });

  it("첫 키프레임 앞은 첫 값, 마지막 뒤는 마지막 값을 유지한다", () => {
    expect(sampleTourPose(keys, 0).opacity).toBe(0);
    expect(sampleTourPose(keys, 0).y).toBe(20);
    expect(sampleTourPose(keys, 1).opacity).toBe(1);
    expect(sampleTourPose(keys, 1).x).toBe(30);
  });

  it("구간 사이는 도착 키프레임의 곡선으로 보간한다", () => {
    expect(sampleTourPose(keys, 0.3).opacity).toBeCloseTo(0.5);
    expect(sampleTourPose(keys, 0.3).y).toBeCloseTo(10);
    expect(sampleTourPose(keys, 0.7).x).toBeCloseTo(20);
  });

  it("속성마다 따로 본다 — x를 적지 않은 키프레임은 x를 건드리지 않는다", () => {
    // 0.6 전까지 x는 첫 x 값(10)을 유지하고, 0.2~0.4의 opacity 키에 끌려가지 않는다.
    expect(sampleTourPose(keys, 0.3).x).toBe(10);
    expect(sampleTourPose(keys, 0.5).opacity).toBe(1);
  });

  it("기본 곡선(out)은 끝점을 정확히 지나고 앞쪽이 빠르다", () => {
    const out: TourKey[] = [
      { at: 0, x: 0 },
      { at: 1, x: 100 },
    ];
    expect(sampleTourPose(out, 0).x).toBe(0);
    expect(sampleTourPose(out, 1).x).toBe(100);
    expect(sampleTourPose(out, 0.5).x).toBeGreaterThan(50);
  });

  it("back 곡선은 목표를 살짝 지나쳤다가 돌아온다", () => {
    const back: TourKey[] = [
      { at: 0, scale: 0 },
      { at: 1, scale: 1, ease: "back" },
    ];
    const peak = Math.max(
      ...Array.from(
        { length: 50 },
        (_, i) => sampleTourPose(back, i / 49).scale,
      ),
    );
    expect(peak).toBeGreaterThan(1);
    expect(sampleTourPose(back, 1).scale).toBeCloseTo(1);
  });

  it("같은 시점의 두 키프레임은 순간 이동으로 읽는다", () => {
    const jump: TourKey[] = [
      { at: 0.5, sx: 1 },
      { at: 0.5, sx: 0 },
    ];
    expect(sampleTourPose(jump, 0.49).sx).toBe(1);
    expect(sampleTourPose(jump, 0.51).sx).toBe(0);
  });

  it("움직이는 속성만 골라낸다", () => {
    expect(tourAnimatedProps(keys).sort()).toEqual(["opacity", "x", "y"]);
    expect(tourAnimatedProps(undefined)).toEqual([]);
    expect(tourAnimatedProps([{ at: 0, opacity: 1, scale: 1 }])).toEqual([]);
  });
});
