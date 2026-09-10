package expo.modules.leavewidgets

import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class LeaveAndroidWidgetsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LeaveAndroidWidgets")
    AsyncFunction("setWidgetTimeline") Coroutine
      { raw: String ->
        withContext(Dispatchers.IO) {
          val context = requireNotNull(appContext.reactContext).applicationContext
          WidgetStorage(context).replace(raw)
          WidgetRefresh.schedule(context)
          WidgetRefresh.update(context)
          WidgetPreviews.publish(context)
        }
      }
    AsyncFunction("clearWidgetData") Coroutine
      {
        withContext(Dispatchers.IO) {
          val context = requireNotNull(appContext.reactContext).applicationContext
          WidgetStorage(context).clear()
          WidgetRefresh.update(context)
        }
      }
    AsyncFunction("refreshWidgets") Coroutine
      {
        val context = requireNotNull(appContext.reactContext).applicationContext
        WidgetRefresh.update(context)
      }
  }
}
