import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

import {
  badRequest,
  internalError,
  docClient,
  PutCommand,
  GetCommand,
  boardElementsPk,
  boardSessionSk,
  gsi2PkConnection,
  gsi2SkConnection,
  getTeamId,
  getUserId,
  teamPk,
  boardSk,
} from "../../lambda-shared/src";

const TABLE_NAME = process.env.TABLE_NAME ?? "";
const SESSION_TTL_SECONDS = 60 * 60;

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    if (!TABLE_NAME) {
      throw new Error("TABLE_NAME environment variable is not set");
    }

    // @ts-ignore - TODO: CBA to properly type this right now
    const connectionId = event.requestContext.connectionId;
    const boardId = event.queryStringParameters?.boardId;
    if (!boardId) {
      return badRequest("boardId is required in query string");
    }

    const teamId = getTeamId(event);
    const userId = event.queryStringParameters?.userId ?? getUserId(event);
    const now = new Date();

    const boardRecord = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: teamPk(teamId),
          sk: boardSk(boardId),
        },
      })
    );

    if (!boardRecord.Item) {
      return badRequest("Board not found");
    }

    if (boardRecord.Item.status === "DELETED") {
      return badRequest("Board is deleted");
    }

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: boardElementsPk(boardId),
          sk: boardSessionSk(connectionId),
          teamId,
          boardId,
          connectionId,
          userId,
          connectedAt: now.toISOString(),
          ttl: Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS,
          gsi2pk: gsi2PkConnection(connectionId),
          gsi2sk: gsi2SkConnection(boardId),
        },
      })
    );

    return {
      statusCode: 200,
      body: "Connected",
    };
  } catch (error) {
    console.error("WebSocket connect failed", error);
    return internalError("Failed to establish connection");
  }
};
