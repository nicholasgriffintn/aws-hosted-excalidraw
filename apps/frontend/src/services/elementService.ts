import { api } from './api';
import { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';

export const ElementService = {
  getBoardElements: (boardId: string) =>
    api.get<ExcalidrawElement[]>(`/boards/${boardId}/elements`),

  replaceAllElements: (boardId: string, elements: ExcalidrawElement[]) =>
    api.put<void>(`/boards/${boardId}/elements`, elements),
};
