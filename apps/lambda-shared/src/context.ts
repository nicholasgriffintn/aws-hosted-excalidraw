import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyEventV2WithLambdaAuthorizer,
} from "aws-lambda";

type HttpEvent =
  | APIGatewayProxyEventV2
  | APIGatewayProxyEventV2WithLambdaAuthorizer<unknown>;

export function getTeamId(event: HttpEvent): string {
  const headerKey = Object.keys(event.headers ?? {}).find(
    (key) => key.toLowerCase() === "x-excalidraw-team-id"
  );
  if (headerKey) {
    const value = event.headers?.[headerKey];
    if (value) {
      return value;
    }
  }

  const query =
    event.queryStringParameters?.teamId ?? event.queryStringParameters?.team_id;
  if (query) {
    return query;
  }

  return "default";
}

export function getUserId(event: HttpEvent): string | undefined {
  const headerKey = Object.keys(event.headers ?? {}).find(
    (key) => key.toLowerCase() === "x-excalidraw-user-id"
  );
  return headerKey ? event.headers?.[headerKey] : undefined;
}

export function parseJsonBody<T>(event: HttpEvent): T | undefined {
  if (!event.body) {
    return undefined;
  }

  try {
    return JSON.parse(event.body) as T;
  } catch {
    return undefined;
  }
}
