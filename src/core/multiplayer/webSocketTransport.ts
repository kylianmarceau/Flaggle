import { parseJsonMessage, parseServerMessage } from "./messageValidation";
import type { ClientMessage, MultiplayerTransport, ServerMessage, TransportStatus } from "./protocol";

export function resolveDefaultWebSocketUrl(location: Pick<Location, "host" | "protocol">): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}

export function createWebSocketMultiplayerTransport(url: string): MultiplayerTransport {
  let socket: WebSocket | null = null;
  let status: TransportStatus = "idle";
  const messageHandlers = new Set<(message: ServerMessage) => void>();
  const statusHandlers = new Set<(status: TransportStatus) => void>();

  function setStatus(nextStatus: TransportStatus): void {
    if (status === nextStatus) return;
    status = nextStatus;
    for (const handler of statusHandlers) handler(status);
  }

  function emit(message: ServerMessage): void {
    for (const handler of messageHandlers) handler(message);
  }

  function emitProtocolError(code: string, message: string): void {
    emit({ type: "ERROR", code, message });
  }

  return {
    connect: () => {
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return Promise.resolve();

      setStatus("connecting");
      return new Promise<void>((resolve, reject) => {
        const nextSocket = new WebSocket(url);
        socket = nextSocket;

        nextSocket.addEventListener(
          "open",
          () => {
            setStatus("connected");
            resolve();
          },
          { once: true },
        );

        nextSocket.addEventListener("message", (event) => {
          if (typeof event.data !== "string") {
            emitProtocolError("invalid-frame", "Server sent a non-text message.");
            return;
          }

          const json = parseJsonMessage(event.data);
          if (!json.ok) {
            emitProtocolError(json.code, json.message);
            return;
          }

          const parsed = parseServerMessage(json.message);
          if (!parsed.ok) {
            emitProtocolError(parsed.code, parsed.message);
            return;
          }

          emit(parsed.message);
        });

        nextSocket.addEventListener(
          "error",
          () => {
            setStatus("error");
            reject(new Error("Unable to connect to multiplayer server."));
          },
          { once: true },
        );

        nextSocket.addEventListener("close", () => {
          if (socket === nextSocket) socket = null;
          setStatus("disconnected");
        });
      });
    },
    disconnect: () => {
      const activeSocket = socket;
      socket = null;
      if (activeSocket && activeSocket.readyState !== WebSocket.CLOSED) activeSocket.close(1000, "Client disconnected");
      setStatus("disconnected");
    },
    send: (message: ClientMessage) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        emitProtocolError("not-connected", "Connect to multiplayer before sending messages.");
        return;
      }
      socket.send(JSON.stringify(message));
    },
    onMessage: (handler) => {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },
    onStatusChange: (handler) => {
      statusHandlers.add(handler);
      handler(status);
      return () => statusHandlers.delete(handler);
    },
  };
}
