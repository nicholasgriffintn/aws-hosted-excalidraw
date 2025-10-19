import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

import {
  ok,
  badRequest,
  notFound,
  internalError,
  methodNotAllowed,
  parseJsonBody,
  getTeamId,
  docClient,
  QueryCommand,
  BatchWriteCommand,
  GetCommand,
  UpdateCommand,
  teamPk,
  boardSk,
  boardElementsPk,
  boardElementSk,
  gsi1Pk,
  gsi1Sk,
} from "../../lambda-shared/src";

interface ExcalidrawElement {
  id: string;
  [key: string]: unknown;
}

const TABLE_NAME = process.env.TABLE_NAME ?? "";
const MAX_ELEMENTS_PER_BOARD = 5000;

const isConditionalCheckFailed = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  error.name === "ConditionalCheckFailedException";

function normalizePath(path?: string): string {
  if (!path) {
    return "/";
  }
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    if (!TABLE_NAME) {
      throw new Error("TABLE_NAME environment variable is not set");
    }

    const httpMethod = event.requestContext.http.method;
    const path = normalizePath(event.rawPath ?? event.requestContext.http.path);
    const segments = path.split("/").filter(Boolean);

    if (
      segments.length !== 3 ||
      segments[0] !== "boards" ||
      segments[2] !== "elements"
    ) {
      return notFound("Unsupported path");
    }

    const boardId = segments[1];
    const teamId = getTeamId(event);

    if (httpMethod === "GET") {
      return getElements(teamId, boardId);
    }

    if (httpMethod === "PUT") {
      const payload = parseJsonBody<ExcalidrawElement[]>(event);
      if (!Array.isArray(payload)) {
        return badRequest("Request body must be an array of elements");
      }
      return replaceElements(teamId, boardId, payload);
    }

    return methodNotAllowed(httpMethod);
  } catch (error) {
    console.error("Unhandled error in elements handler", error);
    return internalError();
  }
};

async function getElements(teamId: string, boardId: string) {
  const boardMeta = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: teamPk(teamId),
        sk: boardSk(boardId),
      },
    })
  );

  if (!boardMeta.Item) {
    return notFound("Board not found");
  }

  if (boardMeta.Item.status === "DELETED") {
    return badRequest("Board is deleted");
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":pk": boardElementsPk(boardId),
        ":sk": "ELEMENT#",
      },
      ScanIndexForward: true,
    })
  );

  const elements = (result.Items ?? []).map(
    (item) => item.elementData as ExcalidrawElement
  );
  return ok(elements);
}

async function replaceElements(
  teamId: string,
  boardId: string,
  elements: ExcalidrawElement[]
) {
  try {
    const boardMeta = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: teamPk(teamId),
          sk: boardSk(boardId),
        },
      })
    );

    if (!boardMeta.Item) {
      return notFound("Board not found");
    }

    if (boardMeta.Item.status === "DELETED") {
      return badRequest("Board is deleted");
    }

    if (elements.length > MAX_ELEMENTS_PER_BOARD) {
      return badRequest(
        `Board element limit exceeded (max ${MAX_ELEMENTS_PER_BOARD})`,
      );
    }

    for (const element of elements) {
      if (!element || typeof element.id !== "string" || element.id.trim() === "") {
        return badRequest("Each element must include a non-empty string id");
      }
    }

    const now = new Date().toISOString();

    const existing = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: {
          ":pk": boardElementsPk(boardId),
          ":sk": "ELEMENT#",
        },
      })
    );

    const deleteRequests = (existing.Items ?? []).map((item) => ({
      DeleteRequest: {
        Key: {
          pk: item.pk,
          sk: item.sk,
        },
      },
    }));

    await batchWrite(deleteRequests);

    const putRequests = elements.map((element, index) => ({
      PutRequest: {
        Item: {
          pk: boardElementsPk(boardId),
          sk: boardElementSk(element.id),
          elementId: element.id,
          elementIndex: index,
          elementData: element,
          gsi1pk: gsi1Pk(boardId),
          gsi1sk: gsi1Sk(index),
          updatedAt: now,
          teamId,
        },
      },
    }));

    await batchWrite(putRequests);

    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: teamPk(teamId),
          sk: boardSk(boardId),
        },
        UpdateExpression: "SET updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":updatedAt": now,
        },
      })
    );

    return ok({ count: elements.length });
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      return notFound("Board not found");
    }
    throw error;
  }
}

async function batchWrite(
  requests: {
    DeleteRequest?: { Key: { pk: string; sk: string } };
    PutRequest?: { Item: Record<string, unknown> };
  }[]
) {
  if (requests.length === 0) {
    return;
  }

  const chunks: (typeof requests)[] = [];
  for (let i = 0; i < requests.length; i += 25) {
    chunks.push(requests.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    let unprocessed = chunk;
    do {
      const result = await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: unprocessed,
          },
        })
      );
      unprocessed = Object.values(result.UnprocessedItems ?? {})
        .flat()
        .filter(
          (
            req
          ): req is {
            DeleteRequest?: { Key: { pk: string; sk: string } };
            PutRequest?: { Item: Record<string, unknown> };
          } =>
            (req.DeleteRequest?.Key?.pk && req.DeleteRequest?.Key?.sk) ||
            req.PutRequest?.Item
        )
        .map((req) => {
          if (req.DeleteRequest) {
            return {
              DeleteRequest: {
                Key: {
                  pk: req.DeleteRequest.Key.pk,
                  sk: req.DeleteRequest.Key.sk,
                },
              },
            };
          }
          if (req.PutRequest) {
            return {
              PutRequest: {
                Item: req.PutRequest.Item,
              },
            };
          }
          return req;
        });
    } while (unprocessed.length > 0);
  }
}
