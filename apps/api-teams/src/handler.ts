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
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  teamPk,
  teamMetadataSk,
  teamUserSk,
  gsi2PkUser,
  gsi2SkTeam,
} from "../../lambda-shared/src";

interface CreateTeamPayload {
  name: string;
}

interface CreateMemberPayload {
  userId: string;
  role?: "owner" | "member";
}

const TABLE_NAME = process.env.TABLE_NAME ?? "";
const isConditionalCheckFailed = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  error.name === "ConditionalCheckFailedException";

const MAX_TEAM_NAME_LENGTH = 80;
const ALLOWED_ROLES = new Set(["owner", "member"]);

type NormalizedTeamName =
  | { ok: true; value: string }
  | { ok: false; message: string };

function normalizeTeamName(name: unknown): NormalizedTeamName {
  if (typeof name !== "string") {
    return { ok: false, message: "Team name must be a string" };
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: "Team name cannot be empty" };
  }

  if (trimmed.length > MAX_TEAM_NAME_LENGTH) {
    return {
      ok: false,
      message: `Team name must be ${MAX_TEAM_NAME_LENGTH} characters or fewer`,
    };
  }

  return { ok: true, value: trimmed };
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    if (!TABLE_NAME) {
      throw new Error("TABLE_NAME environment variable is not set");
    }

    const teamId = getTeamId(event);
    const method = event.requestContext.http.method;
    const path = normalizePath(event.rawPath ?? event.requestContext.http.path);
    const segments = path.split("/").filter(Boolean);

    if (segments.length === 1 && segments[0] === "teams") {
      if (method === "GET") {
        return getTeam(teamId);
      }
      if (method === "POST") {
        const payload = parseJsonBody<CreateTeamPayload>(event);
        const validation = normalizeTeamName(payload?.name);
        if (!validation.ok) {
          return badRequest(validation.message);
        }
        return createTeam(teamId, validation.value);
      }
      return methodNotAllowed(method);
    }

    if (segments.length === 2 && segments[1] === "members") {
      if (method === "GET") {
        return listMembers(teamId);
      }
      if (method === "POST") {
        const payload = parseJsonBody<CreateMemberPayload>(event);
        if (!payload?.userId) {
          return badRequest("userId is required");
        }
        return addMember(teamId, payload.userId, payload.role ?? "member");
      }
      return methodNotAllowed(method);
    }

    if (
      segments.length === 3 &&
      segments[1] === "members" &&
      method === "DELETE"
    ) {
      const userId = segments[2];
      return removeMember(teamId, userId);
    }

    return notFound("Unsupported path");
  } catch (error) {
    console.error("Unhandled error in teams handler", error);
    return internalError();
  }
};

function normalizePath(path?: string): string {
  if (!path) {
    return "/";
  }
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

async function getTeam(teamId: string) {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: teamPk(teamId),
        sk: teamMetadataSk,
      },
    })
  );

  if (!result.Item) {
    return notFound("Team not found");
  }

  return ok({
    id: teamId,
    name: result.Item.name,
    createdAt: result.Item.createdAt,
    updatedAt: result.Item.updatedAt,
  });
}

async function createTeam(teamId: string, name: string) {
  const now = new Date().toISOString();

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: teamPk(teamId),
          sk: teamMetadataSk,
          name,
          createdAt: now,
          updatedAt: now,
        },
        ConditionExpression:
          "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      })
    );
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      return badRequest("Team already exists");
    }
    throw error;
  }

  return ok({ id: teamId, name, createdAt: now, updatedAt: now });
}

async function listMembers(teamId: string) {
  const teamCheck = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: teamPk(teamId),
        sk: teamMetadataSk,
      },
    })
  );

  if (!teamCheck.Item) {
    return notFound("Team not found");
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":pk": teamPk(teamId),
        ":sk": "USER#",
      },
    })
  );

  const members = (result.Items ?? []).map((item) => ({
    userId: item.userId,
    role: item.role,
    joinedAt: item.joinedAt,
  }));

  members.sort((a, b) => {
    const aTime = a.joinedAt ? Date.parse(a.joinedAt) : 0;
    const bTime = b.joinedAt ? Date.parse(b.joinedAt) : 0;
    return bTime - aTime;
  });

  return ok(members);
}

async function addMember(
  teamId: string,
  userId: string,
  role: "owner" | "member"
) {
  const now = new Date().toISOString();

  if (!ALLOWED_ROLES.has(role)) {
    return badRequest(`Unsupported role: ${role}`);
  }

  const teamExists = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: teamPk(teamId),
        sk: teamMetadataSk,
      },
    })
  );

  if (!teamExists.Item) {
    return notFound("Team not found");
  }

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: teamPk(teamId),
          sk: teamUserSk(userId),
          userId,
          role,
          joinedAt: now,
          gsi2pk: gsi2PkUser(userId),
          gsi2sk: gsi2SkTeam(teamId),
        },
        ConditionExpression:
          "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      })
    );
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      return badRequest("Member already exists");
    }
    throw error;
  }

  return ok({ userId, role, joinedAt: now });
}

async function removeMember(teamId: string, userId: string) {
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: teamPk(teamId),
          sk: teamUserSk(userId),
        },
        ConditionExpression:
          "attribute_exists(pk) AND attribute_exists(sk)",
      })
    );
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      return notFound("Member not found");
    }
    throw error;
  }

  return ok({ userId, removed: true });
}
