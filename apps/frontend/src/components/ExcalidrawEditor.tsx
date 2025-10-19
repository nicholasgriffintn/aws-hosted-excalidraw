import { useState, useEffect, useCallback } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI, AppState } from '@excalidraw/excalidraw/types';
import { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { useExcalidrawEditor } from "../hooks/useExcalidrawEditor";
import Loader from "./Loader";
import { useTheme } from "../contexts/ThemeProvider";
import logger from "../utils/logger";
import Utils from "../utils";

interface ExcalidrawEditorProps {
  boardId: string;
}

const debouncedHandleChange = Utils.debounce((f: () => void) => {
  f();
}, 500);

const ExcalidrawEditor = ({ boardId }: ExcalidrawEditorProps) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { theme: currentAppTheme, setTheme: setAppTheme } = useTheme();

  const {
    excalidrawAPI,
    elements,
    setExcalidrawAPI,
    handleChange: originalHandleChange,
    refreshElements,
  } = useExcalidrawEditor(boardId);

  const handleExcalidrawAPI = useCallback(
    (api: ExcalidrawImperativeAPI) => setExcalidrawAPI(api),
    [setExcalidrawAPI]
  );

  const handleChange = useCallback(
    (updatedElements: readonly ExcalidrawElement[], appState: AppState) => {
      if (updatedElements.length === 0) {
        return;
      }

      const currentElements = elements;
      if (JSON.stringify(updatedElements) !== JSON.stringify(currentElements)) {
        debouncedHandleChange(() => {
          originalHandleChange(updatedElements);
        });
      }

      if (appState?.theme && appState.theme !== currentAppTheme) {
        setAppTheme(appState.theme);
      }
    },
    [originalHandleChange, currentAppTheme, setAppTheme, elements]
  );

  useEffect(() => {
    if (excalidrawAPI) {
      const currentExcalidrawTheme = excalidrawAPI.getAppState().theme;
      if (currentExcalidrawTheme !== currentAppTheme) {
        excalidrawAPI.updateScene({ appState: { theme: currentAppTheme } });
      }
      const updatedExcalidrawTheme = excalidrawAPI.getAppState().theme;
      if (updatedExcalidrawTheme !== currentAppTheme) {
        setAppTheme(updatedExcalidrawTheme);
      }
    }
  }, [excalidrawAPI, currentAppTheme]);

  const fetchBoardElements = useCallback(async () => {
    try {
      setIsLoading(true);
      await refreshElements();
    } catch (error) {
      logger.error("Error fetching board elements:", error, true);
    } finally {
      setIsLoading(false);
    }
  }, [refreshElements]);

  useEffect(() => {
    fetchBoardElements();
  }, [fetchBoardElements]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/40">
        <Loader message="Loading board elements..." />
      </div>
    );
  }

  if (!boardId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/40">
        <p className="text-sm text-muted-foreground">
          Please select or create a board.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="relative flex h-full w-full overflow-hidden bg-background">
        <Excalidraw
          key={boardId}
          initialData={{
            elements: elements,
            appState: {
              theme: currentAppTheme,
            },
          }}
          onChange={handleChange}
          name={`Board: ${boardId}`}
          excalidrawAPI={handleExcalidrawAPI}
          UIOptions={{
            canvasActions: {
              saveToActiveFile: false,
              saveAsImage: true,
              export: false,
              loadScene: false,
            },
          }}
        />
      </div>
    </div>
  );
};

export default ExcalidrawEditor;
