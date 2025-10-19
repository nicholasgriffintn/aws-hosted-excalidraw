import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { randomUUID } from "crypto";

import {
  ok,
  badRequest,
  notFound,
  internalError,
  methodNotAllowed,
  parseJsonBody,
  getTeamId,
  getUserId,
  docClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
  teamPk,
  boardSk,
  boardTrashSk,
  boardElementsPk,
  gsi3Pk,
} from "../../lambda-shared/src";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

type Event = APIGatewayProxyEventV2 & {
  requestContext: {
    http: {
      method: HttpMethod;
      path: string;
    };
  };
};

interface UpdateBoardPayload {
  name?: string;
}

interface CreateBoardPayload {
  name?: string;
}

const TABLE_NAME = process.env.TABLE_NAME ?? "";

const isConditionalCheckFailed = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  error.name === "ConditionalCheckFailedException";

const DEFAULT_BOARD_NAME = "Untitled board";
const MAX_BOARD_NAME_LENGTH = 120;

type NormalizedNameResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

function normalizeBoardName(name: unknown): NormalizedNameResult {
  if (typeof name !== "string") {
    return { ok: false, message: "Board name must be a string" };
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: "Board name cannot be empty" };
  }

  if (trimmed.length > MAX_BOARD_NAME_LENGTH) {
    return {
      ok: false,
      message: `Board name must be ${MAX_BOARD_NAME_LENGTH} characters or fewer`,
    };
  }

  return { ok: true, value: trimmed };
}

function normalizePath(path: string | undefined): string {
  if (!path) {
    return "/";
  }
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export const handler = async (
  event: Event
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    if (!TABLE_NAME) {
      throw new Error("TABLE_NAME environment variable is not set");
    }

    const teamId = getTeamId(event);
    const httpMethod = event.requestContext.http.method;
    const path = normalizePath(event.rawPath ?? event.requestContext.http.path);
    const segments = path.split("/").filter(Boolean);

    if (segments[0] !== "boards") {
      return notFound("Unsupported route");
    }

    switch (segments.length) {
      case 1: {
        if (httpMethod === "GET") {
          return listBoards(teamId);
        }
        if (httpMethod === "POST") {
          const payload = parseJsonBody<CreateBoardPayload>(event);
          return createBoard(teamId, getUserId(event), payload);
        }
        return methodNotAllowed(httpMethod);
      }
      case 2: {
        const segment = segments[1];

        if (segment === "trash") {
          if (httpMethod === "GET") {
            return listTrashedBoards(teamId);
          }
          return methodNotAllowed(httpMethod);
        }

        const boardId = segment;
        if (!boardId) {
          return badRequest("Board id is required");
        }

        if (httpMethod === "GET") {
          return getBoard(teamId, boardId);
        }

        if (httpMethod === "PUT") {
          const payload = parseJsonBody<UpdateBoardPayload>(event);
          const validation = normalizeBoardName(payload?.name);
          if (!validation.ok) {
            return badRequest(validation.message);
          }
          return updateBoard(teamId, boardId, validation.value);
        }

        if (httpMethod === "DELETE") {
          return moveBoardToTrash(teamId, boardId);
        }

        return methodNotAllowed(httpMethod);
      }
      case 3: {
        const boardId = segments[1];
        const action = segments[2];

        if (httpMethod === "POST" && action === "restore") {
          return restoreBoard(teamId, boardId);
        }

        if (httpMethod === "DELETE" && action === "permanent") {
          return permanentlyDeleteBoard(teamId, boardId);
        }

        return methodNotAllowed(httpMethod);
      }
      default:
        return notFound("Unsupported path");
    }
  } catch (error) {
    console.error("Unhandled error in boards handler", error);
    return internalError();
  }
};

async function listBoards(teamId: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":pk": teamPk(teamId),
        ":sk": "BOARD#",
        ":active": "ACTIVE",
      },
      FilterExpression: "#status = :active",
      ExpressionAttributeNames: {
        "#status": "status",
      },
    })
  );

  const boards = (result.Items ?? []).map((item) => ({
    id: item.boardId,
    name: item.name,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));

  return ok(boards);
}

async function getBoard(teamId: string, boardId: string) {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: teamPk(teamId),
        sk: boardSk(boardId),
      },
    })
  );

  if (!result.Item) {
    return notFound("Board not found");
  }

  return ok({
    id: result.Item.boardId,
    name: result.Item.name,
    status: result.Item.status,
    createdAt: result.Item.createdAt,
    updatedAt: result.Item.updatedAt,
    ownerUserId: result.Item.ownerUserId,
  });
}

async function createBoard(
  teamId: string,
  userId: string | undefined,
  payload?: CreateBoardPayload
): Promise<APIGatewayProxyStructuredResultV2> {
  const now = new Date().toISOString();
  const boardId = randomUUID();

  let boardName = DEFAULT_BOARD_NAME;
  if (payload?.name !== undefined) {
    const validation = normalizeBoardName(payload.name);
    if (!validation.ok) {
      return badRequest(validation.message);
    }
    boardName = validation.value;
  }

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: teamPk(teamId),
        sk: boardSk(boardId),
        boardId,
        name: boardName,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
        ownerUserId: userId,
      },
      ConditionExpression:
        "attribute_not_exists(pk) AND attribute_not_exists(sk)",
    })
  );

  return ok({
    id: boardId,
    name: boardName,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });
}

async function updateBoard(teamId: string, boardId: string, name: string) {
  const now = new Date().toISOString();

  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: teamPk(teamId),
          sk: boardSk(boardId),
        },
        UpdateExpression: "SET #name = :name, updatedAt = :updatedAt",
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
        ExpressionAttributeValues: {
          ":name": name,
          ":updatedAt": now,
        },
        ExpressionAttributeNames: {
          "#name": "name",
        },
        ReturnValues: "ALL_NEW",
      })
    );

    if (!result.Attributes) {
      return notFound("Board not found");
    }

    return ok({
      id: result.Attributes.boardId,
      name: result.Attributes.name,
      status: result.Attributes.status,
      createdAt: result.Attributes.createdAt,
      updatedAt: result.Attributes.updatedAt,
    });
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      return notFound("Board not found");
    }
    throw error;
  }
}

async function listTrashedBoards(teamId: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI3",
      KeyConditionExpression: "gsi3pk = :pk",
      ExpressionAttributeValues: {
        ":pk": gsi3Pk(teamId),
      },
      ScanIndexForward: false,
    })
  );

  const trashed = (result.Items ?? []).map((item) => ({
    id: item.boardId,
    name: item.name ?? "Untitled board",
    status: "DELETED" as const,
    createdAt: item.createdAt ?? item.deletedAt,
    updatedAt: item.updatedAt ?? item.deletedAt,
    deletedAt: item.deletedAt,
  }));

  return ok(trashed);
}

async function moveBoardToTrash(teamId: string, boardId: string) {
  const now = new Date().toISOString();

  try {
    const updateResult = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: teamPk(teamId),
          sk: boardSk(boardId),
        },
        UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
        ExpressionAttributeValues: {
          ":status": "DELETED",
          ":updatedAt": now,
        },
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ReturnValues: "ALL_NEW",
      })
    );

    if (!updateResult.Attributes) {
      return notFound("Board not found");
    }

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: teamPk(teamId),
          sk: boardTrashSk(boardId),
          boardId,
          name: updateResult.Attributes.name,
          deletedAt: now,
          createdAt: updateResult.Attributes.createdAt,
          updatedAt: now,
          gsi3pk: gsi3Pk(teamId),
          gsi3sk: boardId,
        },
      })
    );

    return ok({
      id: boardId,
      status: "DELETED",
      updatedAt: now,
    });
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      return notFound("Board not found");
    }
    throw error;
  }
}

async function restoreBoard(teamId: string, boardId: string) {
  const now = new Date().toISOString();

  try {
    const updateResult = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: teamPk(teamId),
          sk: boardSk(boardId),
        },
        UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
        ExpressionAttributeValues: {
          ":status": "ACTIVE",
          ":updatedAt": now,
        },
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ReturnValues: "ALL_NEW",
      })
    );

    if (!updateResult.Attributes) {
      return notFound("Board not found");
    }

    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: teamPk(teamId),
          sk: boardTrashSk(boardId),
        },
      })
    );

    return ok({
      id: boardId,
      status: "ACTIVE",
      updatedAt: now,
    });
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      return notFound("Board not found");
    }
    throw error;
  }
}

async function permanentlyDeleteBoard(teamId: string, boardId: string) {
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: teamPk(teamId),
          sk: boardSk(boardId),
        },
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
      })
    );

    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: teamPk(teamId),
          sk: boardTrashSk(boardId),
        },
      })
    );

    await purgeBoardItems(boardId);

    return ok({ id: boardId, deleted: true });
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      return notFound("Board not found");
    }
    throw error;
  }
}

async function purgeBoardItems(boardId: string): Promise<void> {
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const page = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": boardElementsPk(boardId),
        },
        ProjectionExpression: "pk, sk",
        ExclusiveStartKey: exclusiveStartKey,
        Limit: 25,
      })
    );

    const items = page.Items ?? [];
    if (items.length > 0) {
      let pendingRequests = items.map((item) => ({
        DeleteRequest: {
          Key: {
            pk: item.pk,
            sk: item.sk,
          },
        },
      }));

      do {
        const response = await docClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [TABLE_NAME]: pendingRequests.slice(0, 25),
            },
          })
        );

        const unprocessed = response.UnprocessedItems?.[TABLE_NAME] ?? [];
        // @ts-ignore - TODO: CBA to properly type this right now
        pendingRequests = unprocessed.map((request) => request);
      } while (pendingRequests.length > 0);
    }

    exclusiveStartKey = page.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);
}
