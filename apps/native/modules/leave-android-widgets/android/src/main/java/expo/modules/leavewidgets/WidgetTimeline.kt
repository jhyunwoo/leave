package expo.modules.leavewidgets

import java.text.ParsePosition
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.json.JSONObject

/** Calendar/instant selection only. Military and leave calculations belong to TypeScript. */
internal object WidgetClock {
  private fun format() =
    SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply {
      timeZone = TimeZone.getTimeZone("Asia/Seoul")
      isLenient = false
    }

  fun date(at: Long): String = format().format(Date(at))

  fun validDate(value: String): Boolean {
    val position = ParsePosition(0)
    return value.length == 10 && format().parse(value, position) != null && position.index == 10
  }

  fun delayToNextHour(now: Long): Long {
    val calendar =
      Calendar.getInstance(TimeZone.getTimeZone("Asia/Seoul")).apply {
        timeInMillis = now
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
        add(Calendar.HOUR_OF_DAY, 1)
      }
    return calendar.timeInMillis - now
  }
}

internal data class RenderMetric(
  val label: String,
  val value: String,
  val spoken: String,
  val compact: String,
  val url: String,
  val caption: String?,
  val gauge: Float?,
)

internal data class RenderEntry(
  val validFrom: Long,
  val date: String,
  val asOf: String,
  val state: String,
  val updatedLabel: String,
  val message: String,
  val url: String,
  val metric: RenderMetric?,
  val summaryMetrics: List<RenderMetric>,
)

internal data class WidgetTimeline(val expiresAt: Long, val entries: List<RenderEntry>) {
  fun select(now: Long): RenderEntry? {
    // A signed-out/onboarding message remains meaningful after the timeline window.
    if (entries.last().state != "ready") return entries.last()
    if (now >= expiresAt) return null
    return entries.lastOrNull { it.validFrom <= now && it.date == WidgetClock.date(now) }
  }

  companion object {
    const val MAX_BYTES = 256 * 1024

    fun decode(raw: String?): WidgetTimeline? =
      try {
        if (raw == null || raw.toByteArray(Charsets.UTF_8).size > MAX_BYTES) null
        else {
          val root = JSONObject(raw)
          require(root.getInt("version") == 1)
          root.text("updatedAt")
          val expires = root.getLong("expiresAt")
          val array = root.getJSONArray("entries")
          require(array.length() in 1..128)
          val entries = (0 until array.length()).map { parseEntry(array.getJSONObject(it)) }
          require(entries.zipWithNext().all { (a, b) -> a.validFrom <= b.validFrom })
          require(expires > entries.last().validFrom)
          WidgetTimeline(expires, entries)
        }
      } catch (_: Exception) {
        null
      }

    private fun parseEntry(json: JSONObject): RenderEntry {
      val state = json.text("state")
      require(state in listOf("ready", "signedOut", "needsOnboarding"))
      val date = json.text("date")
      val validFrom = json.getLong("validFrom")
      require(WidgetClock.validDate(date) && WidgetClock.date(validFrom) == date)
      val metrics = json.getJSONArray("summaryMetrics")
      require(metrics.length() <= 6)
      return RenderEntry(
        validFrom,
        date,
        json.text("asOf"),
        state,
        json.text("updatedLabel"),
        json.text("message"),
        json.url(),
        if (state == "ready" && json.has("metric")) parseMetric(json.getJSONObject("metric"))
        else null,
        if (state == "ready")
          (0 until metrics.length()).map { parseMetric(metrics.getJSONObject(it)) }
        else emptyList(),
      )
    }

    private fun parseMetric(json: JSONObject): RenderMetric {
      val gauge =
        if (json.has("gauge"))
          json.getDouble("gauge").also { require(it.isFinite() && it in 0.0..1.0) }.toFloat()
        else null
      return RenderMetric(
        json.text("label"),
        json.text("value"),
        json.text("spoken"),
        json.text("compact"),
        json.url(),
        if (json.has("caption")) json.text("caption") else null,
        gauge,
      )
    }

    private fun JSONObject.text(key: String): String {
      val value = get(key)
      require(value is String && value.length <= 512)
      return value
    }

    private fun JSONObject.url(): String =
      text("url").also {
        // Explicit app intent below is the second boundary. No external schemes or hosts.
        require(it.startsWith("leave:///") && !it.contains('?') && !it.contains('#'))
      }
  }
}
