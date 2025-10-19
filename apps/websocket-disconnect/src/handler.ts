import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

import {
  docClient,
  QueryCommand,
  DeleteCommand,
  boardElementsPk,
  boardSessionSk,
  gsi2PkConnection,
  internalError,
} from "../../lambda-shared/src";

const TABLE_NAME = process.env.TABLE_NAME ?? "";

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    if (!TABLE_NAME) {
      throw new Error("TABLE_NAME environment variable is not set");
    }

    const connectionId = event.requestContext.connectionId;

    const sessions = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI2",
        KeyConditionExpression: "gsi2pk = :pk",
        ExpressionAttributeValues: {
          ":pk": gsi2PkConnection(connectionId),
        },
      })
    );

    if ((sessions.Items ?? []).length === 0) {
      return {
        statusCode: 200,
        body: "Disconnected",
      };
    }

    for (const item of sessions.Items ?? []) {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: boardElementsPk(item.boardId as string),
            sk: boardSessionSk(connectionId),
          },
        })
      );
    }

    return {
      statusCode: 200,
      body: "Disconnected",
    };
  } catch (error) {
    console.error("WebSocket disconnect failed", error);
    return internalError("Failed to disconnect");
  }
};
