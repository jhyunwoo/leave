package expo.modules.leavewidgets

import java.util.TimeZone
import org.junit.Assert.*
import org.junit.Test

class WidgetTimelineTest {
  private val first = 1781535540000L // 2026-06-15 23:59 KST
  private val midnight = 1781535600000L

  private fun entry(at: Long, date: String, value: String = "D-12") =
    """
    {"validFrom":$at,"date":"$date","asOf":"2026-06-15T14:59:00.000Z","state":"ready",
     "updatedLabel":"2026-06-15 업데이트","message":"아직 보여줄 값이 없어요","url":"leave:///","summaryMetrics":[],
     "metric":{"key":"discharge","label":"전역","value":"$value","spoken":"전역까지 12일 남았어요","compact":"전역 $value","url":"leave:///service-progress"}}
  """
      .trimIndent()

  private fun payload(
    entries: String = "${entry(first, "2026-06-15")},${entry(midnight, "2026-06-16", "D-11")}",
    version: Int = 1,
  ) =
    """
    {"version":$version,"updatedAt":"2026-06-15T14:59:00.000Z","expiresAt":${midnight + 86400000},"entries":[$entries]}
  """
      .trimIndent()

  @Test
  fun consumesTheTypescriptContractFixture() {
    val raw = requireNotNull(javaClass.getResource("/android-contract.json")).readText()
    val timeline = requireNotNull(WidgetTimeline.decode(raw))
    assertEquals(14, timeline.entries.size)
    assertEquals("전역", timeline.select(first)?.metric?.label)
    assertEquals(
      listOf("진급", "복무율", "전역"),
      timeline.select(first)?.summaryMetrics?.map { it.label },
    )
    assertEquals("2026-06-28", timeline.entries.last().date)
  }

  @Test
  fun selectsKoreanDateRegardlessOfDeviceZone() {
    val original = TimeZone.getDefault()
    try {
      TimeZone.setDefault(TimeZone.getTimeZone("America/Los_Angeles"))
      val timeline = WidgetTimeline.decode(payload())!!
      assertEquals("D-12", timeline.select(midnight - 1)?.metric?.value)
      assertEquals("D-11", timeline.select(midnight)?.metric?.value)
      assertEquals("2026-06-16", WidgetClock.date(midnight))
    } finally {
      TimeZone.setDefault(original)
    }
  }

  @Test
  fun handlesIntradayTransition() {
    val timeline =
      WidgetTimeline.decode(
        payload("${entry(first, "2026-06-15")},${entry(first + 1000, "2026-06-15", "D-9")}")
      )!!
    assertEquals("D-12", timeline.select(first)?.metric?.value)
    assertEquals("D-9", timeline.select(first + 1000)?.metric?.value)
  }

  @Test
  fun refusesExpiredFutureOrMissingDayInsteadOfInventingMetrics() {
    val timeline = WidgetTimeline.decode(payload())!!
    assertNull(timeline.select(first - 1))
    assertNull(timeline.select(midnight + 86400000))
    val gap = WidgetTimeline.decode(payload(entry(first, "2026-06-15")))!!
    assertNull(gap.select(midnight))
  }

  @Test
  fun corruptAndUnknownSchemasFallBack() {
    for (raw in
      listOf(
        null,
        "",
        "{",
        "[]",
        payload(version = 2),
        payload(""),
        payload().replace("leave:///service-progress", "https://evil.example"),
        payload().replace("2026-06-16", "2026-99-99"),
      )) {
      assertNull(raw, WidgetTimeline.decode(raw))
    }
  }

  @Test
  fun rejectsUnsortedEntriesAndOversizedStorage() {
    assertNull(
      WidgetTimeline.decode(
        payload("${entry(midnight, "2026-06-16")},${entry(first, "2026-06-15")}")
      )
    )
    assertNull(WidgetTimeline.decode(" ".repeat(WidgetTimeline.MAX_BYTES + 1)))
  }

  @Test
  fun placeholderNeverRestoresMetricsAndDoesNotExpireIntoAnotherState() {
    val raw = payload().replace("\"ready\"", "\"signedOut\"")
    val selected = WidgetTimeline.decode(raw)!!.select(midnight + 86400000)!!
    assertEquals("signedOut", selected.state)
    assertNull(selected.metric)
    assertTrue(selected.summaryMetrics.isEmpty())
  }

  @Test
  fun nextRefreshIsAnHourBoundaryInKorea() {
    assertEquals(60000L, WidgetClock.delayToNextHour(first))
    assertEquals(3600000L, WidgetClock.delayToNextHour(midnight))
  }
}
