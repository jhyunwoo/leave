import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { XML } from "expo/config-plugins";
import { describe, expect, it } from "vitest";
import app from "../app.json";
import moduleConfig from "../modules/leave-android-widgets/expo-module.config.json";

const android = resolve(
  import.meta.dirname,
  "../modules/leave-android-widgets/android",
);
const read = (path: string) => readFileSync(resolve(android, path), "utf8");

type Attributes = Record<string, string>;
type MetaData = { $: Attributes };
type Receiver = { $: Attributes; "meta-data"?: MetaData[] };
type WidgetReceiver = Receiver & { "meta-data": MetaData[] };

/** xml2js의 느슨한 반환 타입을 이 테스트가 읽는 모양으로 좁힌다. */
const parse = async <T>(xml: string): Promise<T> =>
  (await XML.parseXMLAsync(xml)) as T;

describe("CNG Android widget library integration", () => {
  it("autolinks an Android-only module without touching iOS or the application ID", () => {
    expect(moduleConfig.platforms).toEqual(["android"]);
    expect(moduleConfig.android.modules).toEqual([
      "expo.modules.leavewidgets.LeaveAndroidWidgetsModule",
    ]);
    expect(app.expo.android.package).toBe("app.leave.mobile");
  });

  it("declares both private home-screen providers exactly once, with existing metadata and previews", async () => {
    const manifest = await parse<{
      manifest: { application: { receiver: Receiver[] }[] };
    }>(read("src/main/AndroidManifest.xml"));
    const receivers = manifest.manifest.application[0].receiver;
    const widgetReceivers = receivers.filter(
      (receiver): receiver is WidgetReceiver =>
        receiver["meta-data"] !== undefined,
    );
    expect(
      widgetReceivers.map((receiver) => receiver.$["android:name"]),
    ).toEqual([".LeaveMetricWidgetReceiver", ".LeaveSummaryWidgetReceiver"]);
    for (const receiver of widgetReceivers) {
      expect(receiver.$["android:exported"]).toBe("false");
      const resource = receiver["meta-data"][0].$["android:resource"].replace(
        "@xml/",
        "",
      );
      const provider = (
        await parse<{ "appwidget-provider": { $: Attributes } }>(
          read(`src/main/res/xml/${resource}.xml`),
        )
      )["appwidget-provider"].$;
      expect(provider["android:widgetCategory"]).toBe("home_screen");
      expect(provider["android:resizeMode"]).toBe("horizontal|vertical");
      expect(
        Number(provider["android:updatePeriodMillis"]),
      ).toBeGreaterThanOrEqual(3600000);
      const preview = provider["android:previewImage"].replace(
        "@drawable/",
        "",
      );
      expect(
        existsSync(resolve(android, `src/main/res/drawable/${preview}.png`)),
      ).toBe(true);
      expect(
        existsSync(
          resolve(android, "src/main/res/layout/leave_widget_loading.xml"),
        ),
      ).toBe(true);
    }
    expect(read("src/main/AndroidManifest.xml")).not.toContain(
      "SCHEDULE_EXACT_ALARM",
    );
  });

  it("pins stable Glance and WorkManager in the library, with the host Compose compiler", () => {
    const gradle = read("build.gradle");
    expect(gradle).toContain("androidx.glance:glance:1.2.0");
    expect(gradle).toContain("androidx.glance:glance-appwidget:1.2.0");
    expect(gradle).toContain("androidx.work:work-runtime-ktx:2.11.2");
    expect(gradle).toContain("${kotlinVersion}");
    expect(gradle).not.toMatch(/implementation[^\n]*(?:alpha|rc\d|\+)/);
  });
});
