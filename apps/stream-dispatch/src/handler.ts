import type { DynamoDBStreamEvent } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";

import {
  docClient,
  QueryCommand,
  DeleteCommand,
  boardElementsPk,
  boardSessionSk,
} from "../../lambda-shared/src";

const TABLE_NAME = process.env.TABLE_NAME ?? "";
const WEBSOCKET_API_ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT ?? "";

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  if (!TABLE_NAME || !WEBSOCKET_API_ENDPOINT) {
    throw new Error("TABLE_NAME and WEBSOCKET_API_ENDPOINT must be provided");
  }

  const client = new ApiGatewayManagementApiClient({
    endpoint: WEBSOCKET_API_ENDPOINT,
  });

  for (const record of event.Records) {
    const newImage = record.dynamodb?.NewImage as
      | Record<string, AttributeValue>
      | undefined;

    if (!newImage) {
      continue;
    }

    const item = unmarshall(newImage);
    const pk = item.pk as string | undefined;
    const sk = item.sk as string | undefined;

    if (!pk || !sk || !pk.startsWith("BOARD#")) {
      continue;
    }

    const boardId = pk.replace("BOARD#", "");

    if (sk.startsWith("ELEMENT#")) {
      await broadcast(client, boardId, {
        type: "elementUpdate",
        boardId,
        elementId: item.elementId,
        eventName: record.eventName,
        updatedAt: item.updatedAt,
        teamId: item.teamId,
      });
    }
  }
};

async function broadcast(
  client: ApiGatewayManagementApiClient,
  boardId: string,
  payload: Record<string, unknown>
): Promise<void> {
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

  for (const session of sessions.Items ?? []) {
    const connectionId = session.connectionId as string;
    try {
      await client.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(JSON.stringify(payload)),
        })
      );
    } catch (error) {
      if (isGoneError(error)) {
        await docClient.send(
          new DeleteCommand({
            TableName: TABLE_NAME,
            Key: {
              pk: boardElementsPk(boardId),
              sk: boardSessionSk(connectionId),
            },
          })
        );
      } else {
        console.error("Failed to deliver stream update", {
          connectionId,
          error,
        });
      }
    }
  }
}

function isGoneError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "GoneException"
  );
}
