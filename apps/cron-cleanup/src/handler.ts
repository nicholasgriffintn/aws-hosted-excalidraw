import type { ScheduledEvent } from "aws-lambda";

import {
  docClient,
  ScanCommand,
  DeleteCommand,
  boardElementsPk,
  boardSessionSk,
} from "../../lambda-shared/src";

const TABLE_NAME = process.env.TABLE_NAME ?? "";

export const handler = async (_event: ScheduledEvent): Promise<void> => {
  if (!TABLE_NAME) {
    throw new Error("TABLE_NAME environment variable is not set");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  const expiredSessions = await docClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression:
        "attribute_exists(ttl) AND ttl < :now AND begins_with(sk, :session)",
      ExpressionAttributeValues: {
        ":now": nowSeconds,
        ":session": "SESSION#",
      },
      ProjectionExpression: "pk, sk",
    })
  );

  for (const item of expiredSessions.Items ?? []) {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: item.pk,
          sk: item.sk,
        },
      })
    );
  }
};
