import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { randomUUID } from "crypto";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  ok,
  badRequest,
  internalError,
  methodNotAllowed,
  getTeamId,
  parseJsonBody,
} from "../../lambda-shared/src";

const bucketName = process.env.ASSET_BUCKET_NAME ?? "";
const region = process.env.AWS_REGION ?? "eu-west-1";

if (!bucketName) {
  throw new Error("ASSET_BUCKET_NAME environment variable is not set");
}

const s3Client = new S3Client({ region });

interface PresignUploadPayload {
  boardId: string;
  fileName?: string;
  contentType?: string;
  expiresInSeconds?: number;
}

interface DeleteAssetPayload {
  boardId: string;
  objectKey: string;
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const teamId = getTeamId(event);
    const method = event.requestContext.http.method;
    const path = normalizePath(event.rawPath ?? event.requestContext.http.path);
    const segments = path.split("/").filter(Boolean);

    if (segments.length === 1 && segments[0] === "assets") {
      if (method === "GET") {
        const boardId = event.queryStringParameters?.boardId;
        if (!boardId) {
          return badRequest("boardId is required");
        }
        return listAssets(teamId, boardId);
      }

      if (method === "POST") {
        const payload = parseJsonBody<PresignUploadPayload>(event);
        if (!payload?.boardId) {
          return badRequest("boardId is required");
        }
        return createUploadUrl(teamId, payload);
      }

      if (method === "DELETE") {
        const payload = parseJsonBody<DeleteAssetPayload>(event);
        const boardId =
          payload?.boardId ?? event.queryStringParameters?.boardId;
        const objectKey =
          payload?.objectKey ?? event.queryStringParameters?.objectKey;
        if (!boardId || !objectKey) {
          return badRequest("boardId and objectKey are required");
        }
        return deleteAsset(teamId, { boardId, objectKey });
      }

      return methodNotAllowed(method);
    }

    if (
      segments.length === 2 &&
      segments[0] === "assets" &&
      segments[1] === "presign-download"
    ) {
      if (method !== "GET") {
        return methodNotAllowed(method);
      }

      const boardId = event.queryStringParameters?.boardId;
      const objectKey = event.queryStringParameters?.objectKey;
      if (!boardId || !objectKey) {
        return badRequest("boardId and objectKey are required");
      }

      return createDownloadUrl(teamId, boardId, objectKey);
    }

    return methodNotAllowed(method);
  } catch (error) {
    console.error("Unhandled error in assets handler", error);
    return internalError();
  }
};

function normalizePath(path?: string): string {
  if (!path) {
    return "/";
  }
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function buildAssetPrefix(teamId: string, boardId: string): string {
  return `teams/${teamId}/boards/${boardId}`;
}

function buildAssetKey(
  teamId: string,
  boardId: string,
  fileName?: string
): string {
  const baseDirectory = buildAssetPrefix(teamId, boardId);
  if (!fileName || !fileName.trim()) {
    return `${baseDirectory}/${randomUUID()}`;
  }

  const candidate = fileName.split(/[\\/]/).filter(Boolean).pop()!.trim();

  const sanitized = candidate.replace(/[^a-zA-Z0-9_.-]/g, "-");
  return `${baseDirectory}/${sanitized || randomUUID()}`;
}

async function createUploadUrl(teamId: string, payload: PresignUploadPayload) {
  const key = buildAssetKey(teamId, payload.boardId, payload.fileName);
  const expiresIn = Math.min(
    Math.max(payload.expiresInSeconds ?? 900, 60),
    3600
  );

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: payload.contentType ?? "application/octet-stream",
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn,
  });

  return ok({
    uploadUrl,
    objectKey: key,
    expiresIn,
  });
}

async function createDownloadUrl(
  teamId: string,
  boardId: string,
  objectKey: string
) {
  if (!objectKey.startsWith(buildAssetPrefix(teamId, boardId))) {
    return badRequest("objectKey is not within the team board namespace");
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
  });

  const downloadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 900,
  });

  return ok({ downloadUrl, expiresIn: 900 });
}

async function listAssets(teamId: string, boardId: string) {
  const prefix = buildAssetPrefix(teamId, boardId) + "/";

  const command = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix,
  });

  const result = await s3Client.send(command);

  const assets = (result.Contents ?? [])
    .filter((item) => item.Key)
    .map((item) => ({
      key: item.Key!,
      boardId,
      lastModified: item.LastModified?.toISOString(),
      size: item.Size,
    }));

  return ok(assets);
}

async function deleteAsset(teamId: string, payload: DeleteAssetPayload) {
  if (
    !payload.objectKey.startsWith(buildAssetPrefix(teamId, payload.boardId))
  ) {
    return badRequest("objectKey is not within the team board namespace");
  }

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: payload.objectKey,
    })
  );

  return ok({ objectKey: payload.objectKey, deleted: true });
}
