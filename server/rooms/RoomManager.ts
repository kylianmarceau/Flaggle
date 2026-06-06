import { rawCountries, indexCountries, type CountryIndex } from "../../src/core/countries";
import { MAX_ANSWER_LENGTH, parseClientMessage, type ClientMessage, type MessageParseResult, type RoomCode, type ServerMessage } from "../../src/core/multiplayer";
import { parseRawClientMessage } from "../protocol/parseMessage";
import { DEFAULT_MAX_PLAYERS_PER_ROOM, DEFAULT_RESULT_DISPLAY_MS, Room, type RoomResult } from "./Room";
import { selectableModes } from "../../src/core/modes";

export interface MultiplayerConnection {
  readonly send: (message: string) => unknown;
  readonly close?: (code?: number, reason?: string) => void;
}

export interface PlayerSession {
  readonly playerId: string;
  readonly roomCode: RoomCode;
  readonly answerWindowStartedAt: number;
  readonly answerCount: number;
}

export interface RoomManagerOptions {
  readonly countryIndex?: CountryIndex;
  readonly maxRooms?: number;
  readonly maxPlayersPerRoom?: number;
  readonly roomTtlMs?: number;
  readonly emptyRoomTtlMs?: number;
  readonly answerRateLimitPerSecond?: number;
  readonly resultDisplayMs?: number;
}

export interface RoomManagerStats {
  readonly rooms: number;
  readonly connections: number;
}

const DEFAULT_MAX_ROOMS = 500;
const DEFAULT_ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_EMPTY_ROOM_TTL_MS = 30_000;
const DEFAULT_ANSWER_RATE_LIMIT_PER_SECOND = 5;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function createRoomCode(existingCodes: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    let code = "";
    for (let index = 0; index < 5; index += 1) code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)] ?? "X";
    if (!existingCodes.has(code)) return code;
  }
  return createId("ROOM").slice(-8).toUpperCase();
}

function send(connection: MultiplayerConnection, message: ServerMessage): void {
  connection.send(JSON.stringify(message));
}

function sendError(connection: MultiplayerConnection, code: string, message: string): void {
  send(connection, { type: "ERROR", code, message });
}

function defaultCountryIndex(): CountryIndex {
  return indexCountries(rawCountries);
}

function isSupportedMode(modeId: string): boolean {
  return selectableModes.some((mode) => mode.id === modeId);
}

export class RoomManager {
  private readonly countryIndex: CountryIndex;
  private readonly maxRooms: number;
  private readonly maxPlayersPerRoom: number;
  private readonly roomTtlMs: number;
  private readonly emptyRoomTtlMs: number;
  private readonly answerRateLimitPerSecond: number;
  private readonly resultDisplayMs: number;
  private readonly rooms = new Map<RoomCode, Room>();
  private readonly sessionByConnection = new WeakMap<MultiplayerConnection, PlayerSession>();
  private readonly connectionByPlayerId = new Map<string, MultiplayerConnection>();

  constructor(options: RoomManagerOptions = {}) {
    this.countryIndex = options.countryIndex ?? defaultCountryIndex();
    this.maxRooms = options.maxRooms ?? DEFAULT_MAX_ROOMS;
    this.maxPlayersPerRoom = options.maxPlayersPerRoom ?? DEFAULT_MAX_PLAYERS_PER_ROOM;
    this.roomTtlMs = options.roomTtlMs ?? DEFAULT_ROOM_TTL_MS;
    this.emptyRoomTtlMs = options.emptyRoomTtlMs ?? DEFAULT_EMPTY_ROOM_TTL_MS;
    this.answerRateLimitPerSecond = options.answerRateLimitPerSecond ?? DEFAULT_ANSWER_RATE_LIMIT_PER_SECOND;
    this.resultDisplayMs = options.resultDisplayMs ?? DEFAULT_RESULT_DISPLAY_MS;
  }

  stats(): RoomManagerStats {
    return { rooms: this.rooms.size, connections: this.connectionByPlayerId.size };
  }

  attach(_connection: MultiplayerConnection): void {}

  detach(connection: MultiplayerConnection, now = Date.now()): void {
    const session = this.sessionByConnection.get(connection);
    if (!session) return;
    this.connectionByPlayerId.delete(session.playerId);
    this.sessionByConnection.delete(connection);
    const room = this.rooms.get(session.roomCode);
    if (room) {
      const result = room.disconnectPlayer(session.playerId, now);
      this.broadcastResult(room, result);
      if (room.isEmpty) this.rooms.delete(room.code);
    }
  }

  handleRawMessage(connection: MultiplayerConnection, rawMessage: string | ArrayBuffer | Uint8Array, now = Date.now()): void {
    const parsed = parseRawClientMessage(rawMessage);
    if (!parsed.ok) {
      sendError(connection, parsed.code, parsed.message);
      return;
    }
    this.handleClientMessage(connection, parsed.message, now);
  }

  handleMessage(connection: MultiplayerConnection, value: unknown, now = Date.now()): void {
    const parsed = parseClientMessage(value);
    if (!parsed.ok) {
      sendError(connection, parsed.code, parsed.message);
      return;
    }
    this.handleClientMessage(connection, parsed.message, now);
  }

  sweep(now = Date.now()): void {
    for (const room of this.rooms.values()) {
      const round = room.publicRound;
      if (room.state === "playing" && round?.endsAt !== null && round?.endsAt !== undefined && round.endsAt <= now) {
        this.broadcastResult(room, room.endRound(now));
      }

      if (room.state === "round-result" && room.updatedAt + this.resultDisplayMs <= now) {
        this.broadcastResult(room, room.advanceAfterResult(now));
      }

      const ttl = room.isEmpty ? this.emptyRoomTtlMs : this.roomTtlMs;
      if (room.updatedAt + ttl <= now) this.deleteRoom(room.code);
    }
  }

  private handleClientMessage(connection: MultiplayerConnection, message: ClientMessage, now: number): void {
    switch (message.type) {
      case "CREATE_ROOM":
        this.createRoom(connection, message.playerName, message.modeId, now);
        return;
      case "JOIN_ROOM":
        this.joinRoom(connection, message.roomCode, message.playerName, now);
        return;
      case "LEAVE_ROOM":
        this.leaveRoom(connection, now);
        return;
      case "SET_READY":
        this.withSessionRoom(connection, (room, session) => this.sendRoomResult(connection, room, room.setReady(session.playerId, message.ready, now)));
        return;
      case "START_GAME":
        this.withSessionRoom(connection, (room, session) => this.sendRoomResult(connection, room, room.startGame(session.playerId, now)));
        return;
      case "SUBMIT_ANSWER":
        if (message.answer.length > MAX_ANSWER_LENGTH) {
          sendError(connection, "invalid-answer", "Answer is too long.");
          return;
        }
        this.withSessionRoom(connection, (room, session) => {
          const limited = this.rateLimitAnswer(connection, session, now);
          if (!limited.ok) {
            sendError(connection, limited.code, limited.message);
            return;
          }
          this.sendRoomResult(connection, room, room.submitAnswer(session.playerId, message.answer, now));
        });
        return;
      case "REQUEST_HINT":
        sendError(connection, "hints-disabled", "Multiplayer hints are not enabled.");
        return;
    }
  }

  private createRoom(connection: MultiplayerConnection, playerName: string, modeId: string, now: number): void {
    if (this.rooms.size >= this.maxRooms) {
      sendError(connection, "too-many-rooms", "The server is at room capacity.");
      return;
    }

    if (!isSupportedMode(modeId)) {
      sendError(connection, "invalid-mode", "Unsupported multiplayer mode.");
      return;
    }

    this.detach(connection, now);
    const roomCode = createRoomCode(new Set(this.rooms.keys()));
    const playerId = createId("player");
    const room = new Room({
      code: roomCode,
      hostPlayerId: playerId,
      hostName: playerName,
      countryIndex: this.countryIndex,
      modeId,
      seed: createId("seed"),
      now,
      maxPlayers: this.maxPlayersPerRoom,
    });
    this.rooms.set(roomCode, room);
    this.assignSession(connection, { playerId, roomCode, answerWindowStartedAt: now, answerCount: 0 });
    send(connection, { type: "SESSION_ASSIGNED", playerId, roomCode });
    send(connection, { type: "ROOM_SNAPSHOT", room: room.snapshot() });
  }

  private joinRoom(connection: MultiplayerConnection, roomCode: RoomCode, playerName: string, now: number): void {
    const room = this.rooms.get(roomCode);
    if (!room) {
      sendError(connection, "room-not-found", "No room exists with that code.");
      return;
    }

    this.detach(connection, now);
    const playerId = createId("player");
    const result = room.addPlayer(playerId, playerName, now);
    if (!result.ok) {
      sendError(connection, result.code, result.message);
      return;
    }

    this.assignSession(connection, { playerId, roomCode, answerWindowStartedAt: now, answerCount: 0 });
    send(connection, { type: "SESSION_ASSIGNED", playerId, roomCode });
    this.broadcastMessages(room, result.messages);
  }

  private leaveRoom(connection: MultiplayerConnection, now: number): void {
    const session = this.sessionByConnection.get(connection);
    if (!session) return;
    const room = this.rooms.get(session.roomCode);
    this.connectionByPlayerId.delete(session.playerId);
    this.sessionByConnection.delete(connection);
    if (room) {
      this.broadcastResult(room, room.removePlayer(session.playerId, now));
      if (room.isEmpty) this.rooms.delete(room.code);
    }
  }

  private assignSession(connection: MultiplayerConnection, session: PlayerSession): void {
    this.sessionByConnection.set(connection, session);
    this.connectionByPlayerId.set(session.playerId, connection);
  }

  private withSessionRoom(connection: MultiplayerConnection, action: (room: Room, session: PlayerSession) => void): void {
    const session = this.sessionByConnection.get(connection);
    if (!session) {
      sendError(connection, "not-in-room", "Join or create a room first.");
      return;
    }

    const room = this.rooms.get(session.roomCode);
    if (!room) {
      sendError(connection, "room-not-found", "The room no longer exists.");
      return;
    }

    action(room, session);
  }

  private rateLimitAnswer(connection: MultiplayerConnection, session: PlayerSession, now: number): MessageParseResult<PlayerSession> {
    const elapsed = now - session.answerWindowStartedAt;
    const nextSession = elapsed >= 1000
      ? { ...session, answerWindowStartedAt: now, answerCount: 1 }
      : { ...session, answerCount: session.answerCount + 1 };
    this.assignSession(connection, nextSession);

    if (nextSession.answerCount > this.answerRateLimitPerSecond) return { ok: false, code: "answer-rate-limited", message: "Too many answers. Slow down." };
    return { ok: true, message: nextSession };
  }

  private sendRoomResult(connection: MultiplayerConnection, room: Room, result: RoomResult): void {
    if (!result.ok) {
      sendError(connection, result.code, result.message);
      return;
    }
    this.broadcastMessages(room, result.messages);
  }

  private broadcastResult(room: Room, result: RoomResult): void {
    if (!result.ok) return;
    this.broadcastMessages(room, result.messages);
  }

  private broadcastMessages(room: Room, messages: readonly ServerMessage[]): void {
    for (const message of messages) {
      for (const player of room.snapshot().players) {
        const connection = this.connectionByPlayerId.get(player.id);
        if (connection) send(connection, message);
      }
    }
  }

  private deleteRoom(roomCode: RoomCode): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    for (const player of room.snapshot().players) this.connectionByPlayerId.delete(player.id);
    this.rooms.delete(roomCode);
  }
}
