package expo.modules.leavewidgets

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map

internal data class WidgetSnapshot(val entry: RenderEntry?, val missing: Boolean)

internal class WidgetStorage(context: Context) {
  private val preferences =
    context.getSharedPreferences("leave_android_widgets", Context.MODE_PRIVATE)

  // Call from IO. commit acknowledges a whole durable write before the JS promise resolves.
  fun replace(raw: String) {
    require(WidgetTimeline.decode(raw) != null) { "Invalid Leave widget timeline" }
    check(preferences.edit().putString("timeline", raw).commit()) { "Widget storage write failed" }
  }

  fun clear() {
    check(preferences.edit().remove("timeline").commit()) { "Widget storage clear failed" }
  }

  fun invalidate() {
    check(preferences.edit().putString("revision", UUID.randomUUID().toString()).commit())
  }

  fun snapshot(): WidgetSnapshot {
    val raw =
      try {
        preferences.getString("timeline", null)
      } catch (_: Exception) {
        ""
      }
    return WidgetSnapshot(
      WidgetTimeline.decode(raw)?.select(System.currentTimeMillis()),
      raw == null,
    )
  }

  // Glance update() does not restart an active composition. Observe disk changes too,
  // otherwise a logout or a second write during its ~45s session can retain old data.
  fun snapshots() =
    callbackFlow {
        // SharedPreferences invokes listeners on main even when commit happened on IO.
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> trySend(Unit) }
        preferences.registerOnSharedPreferenceChangeListener(listener)
        trySend(Unit)
        awaitClose { preferences.unregisterOnSharedPreferenceChangeListener(listener) }
      }
      .conflate()
      .map { snapshot() }
      .flowOn(Dispatchers.IO)
}
