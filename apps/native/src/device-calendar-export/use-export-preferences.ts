import { useEffect, useSyncExternalStore } from "react";
import {
  getExportPreferences,
  loadExportPreferences,
  subscribeExportPreferences,
  type ExportPreferences,
} from "./preferences";

export function useExportPreferences(): ExportPreferences {
  useEffect(() => {
    void loadExportPreferences();
  }, []);

  return useSyncExternalStore(
    subscribeExportPreferences,
    getExportPreferences,
    getExportPreferences,
  );
}
