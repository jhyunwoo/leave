package expo.modules.leavewidgets

import android.appwidget.AppWidgetProviderInfo
import android.content.Context
import android.os.Build
import androidx.collection.intSetOf
import androidx.glance.appwidget.GlanceAppWidgetManager
import kotlinx.coroutines.CancellationException

internal object WidgetPreviews {
  // Fictional display-only examples; previews never read the user's storage.
  private val discharge =
    RenderMetric("전역", "D-421", "전역까지 421일 남았어요", "전역 D-421", "leave:///", "2027. 7. 1.", null)
  val entry =
    RenderEntry(
      0,
      "2026-05-06",
      "2026-05-06T00:00:00Z",
      "ready",
      "2026-05-06 업데이트",
      "",
      "leave:///",
      discharge,
      listOf(
        discharge,
        RenderMetric("남은 휴가", "12일", "남은 휴가 12일이에요", "휴가 12일", "leave:///", null, null),
        RenderMetric("복무율", "68%", "복무율 68 퍼센트예요", "복무 68%", "leave:///", null, 0.68f),
        RenderMetric("일과", "84일", "남은 일과일 84일이에요", "일과 84일", "leave:///", null, null),
      ),
    )

  suspend fun publish(context: Context) {
    if (Build.VERSION.SDK_INT < 35) return
    val preferences =
      context.getSharedPreferences("leave_android_widget_previews", Context.MODE_PRIVATE)
    val version = "1"
    if (preferences.getString("published", null) == version) return
    try {
      val manager = GlanceAppWidgetManager(context)
      val categories = intSetOf(AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN)
      val metric = manager.setWidgetPreviews(LeaveMetricWidgetReceiver::class, categories)
      val summary = manager.setWidgetPreviews(LeaveSummaryWidgetReceiver::class, categories)
      if (
        metric == GlanceAppWidgetManager.SET_WIDGET_PREVIEWS_RESULT_SUCCESS &&
          summary == GlanceAppWidgetManager.SET_WIDGET_PREVIEWS_RESULT_SUCCESS
      ) {
        preferences.edit().putString("published", version).apply()
      }
    } catch (cancelled: CancellationException) {
      throw cancelled
    } catch (_: Exception) {
      /* Static preview is always available; retry on a later app write. */
    }
  }
}
