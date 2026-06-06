import { MAX_CLIENT_MESSAGE_BYTES, parseClientMessage, parseJsonMessage, type ClientMessage, type MessageParseResult } from "../../src/core/multiplayer";

function rawMessageToString(rawMessage: string | ArrayBuffer | Uint8Array): MessageParseResult<string> {
  if (typeof rawMessage === "string") {
    if (new TextEncoder().encode(rawMessage).byteLength > MAX_CLIENT_MESSAGE_BYTES) return { ok: false, code: "message-too-large", message: "Message is too large." };
    return { ok: true, message: rawMessage };
  }

  const byteLength = rawMessage instanceof ArrayBuffer ? rawMessage.byteLength : rawMessage.byteLength;
  if (byteLength > MAX_CLIENT_MESSAGE_BYTES) return { ok: false, code: "message-too-large", message: "Message is too large." };
  return { ok: true, message: new TextDecoder().decode(rawMessage) };
}

export function parseRawClientMessage(rawMessage: string | ArrayBuffer | Uint8Array): MessageParseResult<ClientMessage> {
  const text = rawMessageToString(rawMessage);
  if (!text.ok) return text;

  const json = parseJsonMessage(text.message);
  if (!json.ok) return json;

  return parseClientMessage(json.message);
}
