import { config } from "../config";
import logger from "../utils/logger";
import { getOrCreateUserId } from "../utils/identity";

export interface RealtimeConnection {
  socket: WebSocket;
  close: () => void;
  send: (payload: Record<string, unknown>) => void;
}

export type RealtimeMessageHandler = (payload: Record<string, unknown>) => void;

export async function openRealtimeConnection(
  boardId: string,
  onMessage: RealtimeMessageHandler,
): Promise<RealtimeConnection | null> {
  try {
    const userId = getOrCreateUserId();
    const params = new URLSearchParams({
      boardId,
      teamId: config.teamId,
      userId,
    });

    const response = await fetch(`/ws/presign?${params.toString()}`, {
      headers: {
        "x-excalidraw-team-id": config.teamId,
        "x-excalidraw-user-id": userId,
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Failed to presign websocket URL (${message})`);
    }

    const { url } = (await response.json()) as { url?: string };
    if (!url) {
      throw new Error("Presigned websocket response missing URL");
    }

    const socket = new WebSocket(url);

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data as string) as Record<string, unknown>;
        onMessage(payload);
      } catch (error) {
        logger.error("Failed to parse realtime payload", error, true);
      }
    });

    socket.addEventListener("error", (event) => {
      logger.error("Realtime socket error", event, true);
    });

    return {
      socket,
      close: () => {
        try {
          socket.close();
        } catch (error) {
          logger.warn("Error while closing websocket connection", true);
        }
      },
      send: (payload: Record<string, unknown>) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(payload));
        }
      },
    };
  } catch (error) {
    logger.error("Unable to open realtime connection", error, true);
    return null;
  }
}
