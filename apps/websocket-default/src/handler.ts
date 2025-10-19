import type {
  APIGatewayProxyEventV2WithRequestContext,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";

import {
  docClient,
  QueryCommand,
  DeleteCommand,
  gsi2PkConnection,
  boardElementsPk,
  boardSessionSk,
  internalError,
  badRequest,
  ok,
} from "../../lambda-shared/src";

interface WebSocketPayload {
  action: string;
  boardId?: string;
  payload?: unknown;
}

type WebSocketEvent = APIGatewayProxyEventV2WithRequestContext<{
  stage: string;
}>;

const TABLE_NAME = process.env.TABLE_NAME ?? "";

export const handler = async (
  event: WebSocketEvent
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    if (!TABLE_NAME) {
      throw new Error("TABLE_NAME environment variable is not set");
    }

    // @ts-ignore - TODO: CBA to properly type this right now
    const connectionId = event.requestContext.connectionId;
    const body = event.body
      ? (JSON.parse(event.body) as WebSocketPayload)
      : undefined;
    if (!body) {
      return badRequest("Message body is required");
    }

    if (!body.action) {
      return badRequest("action is required");
    }

    const sessionLookup = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI2",
        KeyConditionExpression: "gsi2pk = :pk",
        ExpressionAttributeValues: {
          ":pk": gsi2PkConnection(connectionId),
        },
        Limit: 1,
      })
    );

    const session = sessionLookup.Items?.[0];
    if (!session) {
      return badRequest("Unknown websocket session");
    }

    const boardId = session.boardId as string | undefined;
    if (!boardId) {
      return badRequest("Session is missing board context");
    }

    if (body.boardId && body.boardId !== boardId) {
      return badRequest("boardId does not match active session");
    }

    if (body.action === "ping") {
      return ok({ pong: true });
    }

    const sessions = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: {
          ":pk": boardElementsPk(boardId),
          ":sk": "SESSION#",
        },
      })
    );

    // @ts-ignore - TODO: CBA to properly type this right now
    const endpoint = `https://${event.requestContext.domainName}/${event.requestContext.stage}`;
    const apiClient = new ApiGatewayManagementApiClient({ endpoint });

    for (const session of sessions.Items ?? []) {
      const targetConnectionId = session.connectionId as string;
      if (targetConnectionId === connectionId) {
        continue;
      }

      try {
        await apiClient.send(
          new PostToConnectionCommand({
            ConnectionId: targetConnectionId,
            Data: Buffer.from(
              JSON.stringify({ ...body, boardId, connectionId })
            ),
          })
        );
      } catch (error) {
        if (isGoneError(error)) {
          await docClient.send(
            new DeleteCommand({
              TableName: TABLE_NAME,
              Key: {
                pk: boardElementsPk(boardId),
                sk: boardSessionSk(targetConnectionId),
              },
            })
          );
        } else {
          console.error(
            "Failed to post to connection",
            targetConnectionId,
            error
          );
        }
      }
    }

    return ok({ delivered: (sessions.Items ?? []).length });
  } catch (error) {
    console.error("WebSocket default handler error", error);
    return internalError("Failed to process message");
  }
};

function isGoneError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "GoneException"
  );
}
