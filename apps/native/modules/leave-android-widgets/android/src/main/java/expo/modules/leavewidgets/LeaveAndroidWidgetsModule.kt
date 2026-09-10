package expo.modules.leavewidgets

import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * `Coroutine`을 중위 호출로 쓰면 인자 없는 블록에서 오버로드가 갈리지 않는다 — 인자를
 * 적지 않은 람다는 암묵 인자 `it`을 받을 수도 있어서 `suspend () -> R`과
 * `suspend (P0) -> R`이 둘 다 후보가 되고, Kotlin이 컴파일을 멈춘다. 그래서 타입 인자를
 * 직접 적는 점 호출로 어느 오버로드인지 못 박는다.
 */
class LeaveAndroidWidgetsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LeaveAndroidWidgets")
    AsyncFunction("setWidgetTimeline").Coroutine<Unit, String> { raw ->
      withContext(Dispatchers.IO) {
        val context = requireNotNull(appContext.reactContext).applicationContext
        WidgetStorage(context).replace(raw)
        WidgetRefresh.schedule(context)
        WidgetRefresh.update(context)
        WidgetPreviews.publish(context)
      }
    }
    AsyncFunction("clearWidgetData").Coroutine<Unit> {
      withContext(Dispatchers.IO) {
        val context = requireNotNull(appContext.reactContext).applicationContext
        WidgetStorage(context).clear()
        WidgetRefresh.update(context)
      }
    }
    AsyncFunction("refreshWidgets").Coroutine<Unit> {
      val context = requireNotNull(appContext.reactContext).applicationContext
      WidgetRefresh.update(context)
    }
  }
}
