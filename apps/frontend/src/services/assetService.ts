import { api } from './api';

export interface AssetSummary {
  key: string;
  boardId: string;
  lastModified?: string;
  size?: number;
}

export interface PresignUploadResponse {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
}

export interface PresignUploadRequest {
  boardId: string;
  fileName?: string;
  contentType?: string;
  expiresInSeconds?: number;
}

export interface PresignDownloadResponse {
  downloadUrl: string;
  expiresIn: number;
}

export const AssetService = {
  list: (boardId: string) =>
    api.get<AssetSummary[]>(`/assets?boardId=${encodeURIComponent(boardId)}`),

  createUploadUrl: (payload: PresignUploadRequest) =>
    api.post<PresignUploadResponse>('/assets', payload),

  createDownloadUrl: (boardId: string, objectKey: string) =>
    api.get<PresignDownloadResponse>(
      `/assets/presign-download?boardId=${encodeURIComponent(boardId)}&objectKey=${encodeURIComponent(objectKey)}`,
    ),

  delete: (boardId: string, objectKey: string) =>
    api.delete(
      `/assets?boardId=${encodeURIComponent(boardId)}&objectKey=${encodeURIComponent(objectKey)}`,
    ),
};
