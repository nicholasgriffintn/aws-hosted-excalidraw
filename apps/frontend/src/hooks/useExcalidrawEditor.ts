import { useState, useCallback, useEffect, useRef } from 'react';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { ElementService } from '../services/elementService';
import Utils from '../utils';
import logger from '../utils/logger';
import { openRealtimeConnection, RealtimeConnection } from '../services/realtimeService';

const debouncedSave = Utils.debounce((boardId: string, elements: ExcalidrawElement[]) => {
  if (boardId && elements) {
    ElementService.replaceAllElements(boardId, elements).catch(error =>
      logger.error('Error saving elements:', error, true)
    );
  }
}, 500);

export const useExcalidrawEditor = (boardId: string | undefined) => {
  const [elements, setElements] = useState<ExcalidrawElement[]>([]);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const realtimeRef = useRef<RealtimeConnection | null>(null);
  const onRealtimeUpdateRef = useRef<((elements: ExcalidrawElement[]) => Promise<void>) | null>(null);

  const refreshElements = useCallback(async () => {
    if (!boardId) {
      setElements([]);
      return [] as ExcalidrawElement[];
    }

    const fetched = await ElementService.getBoardElements(boardId);
    const safeElements = fetched ?? [];

    setElements(currentElements => {
      if (JSON.stringify(safeElements) !== JSON.stringify(currentElements)) {
        return safeElements;
      }
      return currentElements;
    });

    return safeElements;
  }, [boardId]);

  const handleRealtimeUpdate = useCallback(async (newElements: ExcalidrawElement[]): Promise<void> => {
    setElements(currentElements => {
      if (JSON.stringify(newElements) !== JSON.stringify(currentElements)) {
        return newElements;
      }
      return currentElements;
    });
  }, []);

  // Store the handler for use in the realtime message callback
  onRealtimeUpdateRef.current = handleRealtimeUpdate;

  const handleChange = useCallback(
    (excalidrawElements: readonly ExcalidrawElement[]) => {
      const elementsArray = [...excalidrawElements];

      setElements(currentElements => {
        if (JSON.stringify(elementsArray) !== JSON.stringify(currentElements)) {
          if (boardId) {
            debouncedSave(boardId, elementsArray);
          }
          return elementsArray;
        }
        return currentElements;
      });
    },
    [boardId]
  );

  useEffect(() => {
    if (!boardId) {
      realtimeRef.current?.close();
      realtimeRef.current = null;
      return;
    }

    let cancelled = false;

    openRealtimeConnection(boardId, payload => {
      if (cancelled || !payload) {
        return;
      }

      const messageType = payload['type'];
      if (messageType === 'elementUpdate' && payload['boardId'] === boardId) {
        logger.debug('Received realtime element update, refreshing board');
        const newElements = payload['elements'] as ExcalidrawElement[];
        if (newElements && onRealtimeUpdateRef.current) {
          onRealtimeUpdateRef.current(newElements).catch((error: unknown) => {
            logger.error('Failed to handle realtime element update', error, true);
          });
        }
      }
    }).then(connection => {
      if (cancelled) {
        connection?.close();
        return;
      }
      realtimeRef.current = connection;
    });

    return () => {
      cancelled = true;
      realtimeRef.current?.close();
      realtimeRef.current = null;
      onRealtimeUpdateRef.current = null;
    };
  }, [boardId]);

  return {
    elements,
    setElements,
    excalidrawAPI,
    setExcalidrawAPI,
    handleChange,
    refreshElements,
    handleRealtimeUpdate,
  };
};
