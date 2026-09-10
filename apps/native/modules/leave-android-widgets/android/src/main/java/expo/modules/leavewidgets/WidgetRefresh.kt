package expo.modules.leavewidgets

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal object WidgetRefresh {
  private const val PERIODIC = "leave.widgets.hourly.v1"
  private val receivers =
    listOf(LeaveMetricWidgetReceiver::class.java, LeaveSummaryWidgetReceiver::class.java)

  fun active(context: Context): Boolean =
    receivers.any {
      AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, it)).isNotEmpty()
    }

  fun schedule(context: Context, resetClock: Boolean = false) {
    val manager = WorkManager.getInstance(context)
    if (!active(context)) {
      manager.cancelUniqueWork(PERIODIC)
      return
    }
    val request =
      PeriodicWorkRequestBuilder<WidgetRefreshWorker>(1, TimeUnit.HOURS)
        .setInitialDelay(
          WidgetClock.delayToNextHour(System.currentTimeMillis()),
          TimeUnit.MILLISECONDS,
        )
        .build()
    manager.enqueueUniquePeriodicWork(
      PERIODIC,
      if (resetClock) ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE
      else ExistingPeriodicWorkPolicy.KEEP,
      request,
    )
  }

  fun enqueue(context: Context, resetClock: Boolean = false) {
    schedule(context, resetClock)
    if (active(context))
      WorkManager.getInstance(context)
        .enqueueUniqueWork(
          "leave.widgets.refresh.v1",
          ExistingWorkPolicy.REPLACE,
          OneTimeWorkRequestBuilder<WidgetRefreshWorker>().build(),
        )
  }

  suspend fun update(context: Context) =
    withContext(Dispatchers.IO) {
      WidgetStorage(context).invalidate()
      val manager = GlanceAppWidgetManager(context)
      var failure: Exception? = null
      for (widget in
        listOf<GlanceAppWidget>(LeaveMetricGlanceWidget(), LeaveSummaryGlanceWidget())) {
        for (id in manager.getGlanceIds(widget.javaClass)) {
          try {
            widget.update(context, id)
          } catch (cancelled: CancellationException) {
            throw cancelled
          } catch (error: Exception) {
            failure = error
          }
        }
      }
      failure?.let { throw it }
    }
}

class WidgetRefreshWorker(context: Context, parameters: WorkerParameters) :
  CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result =
    try {
      WidgetRefresh.schedule(applicationContext)
      WidgetRefresh.update(applicationContext)
      Result.success()
    } catch (cancelled: CancellationException) {
      throw cancelled
    } catch (_: Exception) {
      if (runAttemptCount < 3) Result.retry() else Result.failure()
    }
}

/** Protected system broadcasts; never accepts payload data from an intent. */
class WidgetClockReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (
      intent.action !in
        setOf(
          Intent.ACTION_TIME_CHANGED,
          Intent.ACTION_TIMEZONE_CHANGED,
          Intent.ACTION_BOOT_COMPLETED,
          Intent.ACTION_MY_PACKAGE_REPLACED,
        )
    )
      return
    try {
      WidgetRefresh.enqueue(context, resetClock = true)
    } catch (_: Exception) {
      /* next provider update retries */
    }
  }
}
