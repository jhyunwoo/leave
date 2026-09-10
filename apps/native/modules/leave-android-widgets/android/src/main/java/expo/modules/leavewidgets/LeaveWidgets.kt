package expo.modules.leavewidgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.*
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val accent = ColorProvider(Color(0xff9fe870))
private val secondary = ColorProvider(Color(0xffc5edab))
private val white = ColorProvider(Color.White)

internal fun appIntent(context: Context, url: String): Intent =
  requireNotNull(context.packageManager.getLaunchIntentForPackage(context.packageName)).apply {
    action = Intent.ACTION_VIEW
    data = Uri.parse(url)
    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
  }

abstract class LeaveGlanceWidget(private val summary: Boolean) :
  GlanceAppWidget(R.layout.leave_widget_loading) {
  override val sizeMode = SizeMode.Exact
  override val previewSizeMode =
    SizeMode.Responsive(setOf(DpSize(160.dp, 160.dp), DpSize(320.dp, 280.dp)))
  override val stateDefinition = null

  override suspend fun provideGlance(context: Context, id: GlanceId) {
    val storage = WidgetStorage(context)
    val initial = withContext(Dispatchers.IO) { storage.snapshot() }
    provideContent {
      val snapshots = remember { storage.snapshots() }
      val snapshot by snapshots.collectAsState(initial)
      WidgetContent(snapshot, summary)
    }
  }

  override suspend fun providePreview(context: Context, widgetCategory: Int) {
    provideContent { WidgetContent(WidgetSnapshot(WidgetPreviews.entry, false), summary) }
  }

  override fun onCompositionError(
    context: Context,
    glanceId: GlanceId,
    appWidgetId: Int,
    throwable: Throwable,
  ) {
    // A small, tappable recovery layout; never rethrow a rendering failure.
    try {
      val views = RemoteViews(context.packageName, R.layout.leave_widget_loading)
      views.setOnClickPendingIntent(
        R.id.leave_widget_root,
        PendingIntent.getActivity(
          context,
          appWidgetId,
          appIntent(context, "leave:///"),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )
      AppWidgetManager.getInstance(context).updateAppWidget(appWidgetId, views)
    } catch (_: Exception) {
      /* Host or app may be disappearing. */
    }
  }
}

class LeaveMetricGlanceWidget : LeaveGlanceWidget(false)

class LeaveSummaryGlanceWidget : LeaveGlanceWidget(true)

abstract class LeaveWidgetReceiver : GlanceAppWidgetReceiver() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    super.onUpdate(context, manager, ids)
    try {
      WidgetRefresh.enqueue(context)
    } catch (_: Exception) {
      /* Provider interval retries. */
    }
  }

  override fun onDisabled(context: Context) {
    super.onDisabled(context)
    try {
      WidgetRefresh.schedule(context)
    } catch (_: Exception) {
      /* Best effort cancellation. */
    }
  }
}

class LeaveMetricWidgetReceiver : LeaveWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = LeaveMetricGlanceWidget()
}

class LeaveSummaryWidgetReceiver : LeaveWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = LeaveSummaryGlanceWidget()
}

@Composable
private fun WidgetContent(snapshot: WidgetSnapshot, summary: Boolean) {
  val context = LocalContext.current
  val size = LocalSize.current
  val scale = context.resources.configuration.fontScale.coerceAtLeast(1f)
  val entry = snapshot.entry
  val columns = if (size.width.value >= 280 * scale) 2 else 1
  val compactText = scale >= 1.5f && size.height.value < 190 * scale
  val rows = ((size.height.value - 62 * scale) / (80 * scale)).toInt().coerceIn(1, 3)
  val shown =
    if (summary) entry?.summaryMetrics.orEmpty().take(if (compactText) 1 else columns * rows)
    else listOfNotNull(entry?.metric)
  val message = entry?.message ?: if (snapshot.missing) "로그인하고 확인하세요" else "앱을 열어 최신 정보를 확인하세요"
  val placeholder = entry?.state != "ready" || shown.isEmpty()
  val url = if (summary || placeholder) entry?.url ?: "leave:///" else shown.first().url
  val description = if (placeholder) "리브. $message" else shown.joinToString(" ") { it.spoken }
  Column(
    GlanceModifier.fillMaxSize()
      .appWidgetBackground()
      .background(ImageProvider(R.drawable.leave_widget_background))
      .cornerRadius(R.dimen.leave_widget_radius)
      .clickable(actionStartActivity(appIntent(context, url)))
      .semantics { contentDescription = description }
      .padding(if (size.width.value >= 280) 20.dp else 14.dp),
    verticalAlignment = Alignment.Vertical.CenterVertically,
  ) {
    if (placeholder) {
      Text("리브", style = TextStyle(color = accent, fontSize = 16.sp, fontWeight = FontWeight.Bold))
      Spacer(GlanceModifier.height(8.dp))
      Text(message, style = TextStyle(color = white, fontSize = 16.sp), maxLines = 3)
    } else if (compactText) {
      // At large accessibility font sizes, spend the small surface on meaningful content.
      Text(
        shown.first().compact,
        style = TextStyle(color = white, fontSize = 16.sp, fontWeight = FontWeight.Bold),
        maxLines = 3,
      )
    } else if (!summary) {
      val metric = shown.first()
      val expanded = size.height.value >= 240 * scale && size.width.value >= 220
      val medium = size.width.value >= 250
      Text(
        metric.label,
        style =
          TextStyle(
            color = accent,
            fontSize = (if (expanded) 20 else 16).sp,
            fontWeight = FontWeight.Bold,
          ),
        maxLines = 2,
      )
      Spacer(GlanceModifier.height(4.dp))
      MetricValue(metric, size.width.value - 40, if (expanded) 64f else if (medium) 48f else 36f)
      if (size.height.value >= 145 * scale) {
        metric.caption?.let {
          Spacer(GlanceModifier.height(6.dp))
          Text(
            it,
            style = TextStyle(color = secondary, fontSize = (if (expanded) 17 else 14).sp),
            maxLines = 2,
          )
        }
      }
      if (expanded && metric.gauge != null) {
        Spacer(GlanceModifier.height(16.dp))
        androidx.glance.appwidget.LinearProgressIndicator(
          metric.gauge,
          GlanceModifier.fillMaxWidth(),
          color = accent,
          backgroundColor = secondary,
        )
      }
      if (size.height.value >= 190 * scale) {
        Spacer(GlanceModifier.height(12.dp))
        Text(
          entry!!.updatedLabel,
          style = TextStyle(color = secondary, fontSize = 12.sp),
          maxLines = 1,
        )
      }
    } else {
      Text(
        "리브 요약",
        style = TextStyle(color = accent, fontSize = 16.sp, fontWeight = FontWeight.Bold),
        maxLines = 1,
      )
      Spacer(GlanceModifier.height(10.dp))
      for (row in shown.chunked(columns)) {
        Row(GlanceModifier.fillMaxWidth().defaultWeight()) {
          for (metric in row) {
            Column(GlanceModifier.defaultWeight().padding(end = 6.dp)) {
              Text(
                metric.label,
                style = TextStyle(color = secondary, fontSize = 14.sp),
                maxLines = 1,
              )
              MetricValue(
                metric,
                (size.width.value - 40) / columns - 6,
                if (size.height.value >= 260) 32f else 26f,
              )
            }
          }
          if (row.size < columns) Spacer(GlanceModifier.defaultWeight())
        }
      }
      if (size.height.value >= 230 * scale) {
        Text(
          entry!!.updatedLabel,
          style = TextStyle(color = secondary, fontSize = 12.sp),
          maxLines = 1,
        )
      }
    }
  }
}

@Composable
private fun MetricValue(metric: RenderMetric, widthDp: Float, preferredSp: Float) {
  val context = LocalContext.current
  val density = context.resources.displayMetrics.density
  val scale = context.resources.configuration.fontScale
  // Measure Korean/long values with Android's system font, not a character-count heuristic.
  val paint =
    android.graphics.Paint().apply {
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      textSize = preferredSp * density * scale
    }
  val ratio =
    (widthDp * density / paint.measureText(metric.value).coerceAtLeast(1f)).coerceAtMost(1f)
  Text(
    metric.value,
    style =
      TextStyle(
        color = white,
        fontSize = (preferredSp * ratio).coerceAtLeast(20f).sp,
        fontWeight = FontWeight.Bold,
      ),
    maxLines = 2,
  )
}
