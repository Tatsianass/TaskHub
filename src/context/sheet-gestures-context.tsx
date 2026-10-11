import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const SHEET_GESTURES_KEY = "settings:sheetGestures";

type SheetGesturesContextValue = {
  /** When on, sheets close by tapping outside or swiping down; when off, only the ✕ closes them. */
  sheetGestures: boolean;
  setSheetGestures: (enabled: boolean) => void;
};

const SheetGesturesContext = createContext<SheetGesturesContextValue | null>(
  null,
);

export function SheetGesturesProvider({ children }: { children: ReactNode }) {
  const [sheetGestures, setSheetGesturesState] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(SHEET_GESTURES_KEY)
      .then((saved) => {
        if (saved !== null) setSheetGesturesState(saved === "true");
      })
      .catch(() => {});
  }, []);

  const setSheetGestures = useCallback((enabled: boolean) => {
    setSheetGesturesState(enabled);
    AsyncStorage.setItem(SHEET_GESTURES_KEY, String(enabled)).catch(() => {});
  }, []);

  return (
    <SheetGesturesContext.Provider value={{ sheetGestures, setSheetGestures }}>
      {children}
    </SheetGesturesContext.Provider>
  );
}

export function useSheetGestures() {
  const context = useContext(SheetGesturesContext);
  if (!context)
    throw new Error(
      "useSheetGestures must be used within a SheetGesturesProvider",
    );
  return context;
}
