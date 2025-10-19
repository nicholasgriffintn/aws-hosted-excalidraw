import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

interface JsonBody<T> {
  success: boolean;
  data?: T;
  message?: string;
  errorCode?: string;
}

const defaultHeaders = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

export function jsonResponse<T>(
  statusCode: number,
  body: JsonBody<T>
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: defaultHeaders,
    body: JSON.stringify(body),
  };
}

export function ok<T>(data: T): APIGatewayProxyStructuredResultV2 {
  return jsonResponse(200, { success: true, data });
}

export function noContent(): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 204,
    headers: defaultHeaders,
  };
}

export function badRequest(
  message: string,
  errorCode = "BAD_REQUEST"
): APIGatewayProxyStructuredResultV2 {
  return jsonResponse(400, { success: false, message, errorCode });
}

export function notFound(
  message: string,
  errorCode = "NOT_FOUND"
): APIGatewayProxyStructuredResultV2 {
  return jsonResponse(404, { success: false, message, errorCode });
}

export function internalError(
  message = "Internal server error"
): APIGatewayProxyStructuredResultV2 {
  return jsonResponse(500, {
    success: false,
    message,
    errorCode: "INTERNAL_ERROR",
  });
}

export function methodNotAllowed(
  method: string
): APIGatewayProxyStructuredResultV2 {
  return jsonResponse(405, {
    success: false,
    message: `Method ${method} is not allowed`,
    errorCode: "METHOD_NOT_ALLOWED",
  });
}
