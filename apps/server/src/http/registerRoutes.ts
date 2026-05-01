import type { FastifyInstance } from "fastify";
import {
  defaultMap,
  defaultSkirmishScenario,
  type CommandEnvelope,
  type CreateLobbyRequest,
  type JoinLobbyRequest,
  type MatchmakingJoinRequest,
} from "../shared.js";
import type { GameSessionService } from "../game/GameSessionService.js";
import type { MatchmakingService } from "../matchmaking/MatchmakingService.js";
import type { RoomService } from "../rooms/RoomService.js";

interface RegisterRoutesOptions {
  roomService: RoomService;
  matchmakingService: MatchmakingService;
  gameSessionService: GameSessionService;
}

export async function registerRoutes(
  fastify: FastifyInstance,
  { roomService, matchmakingService, gameSessionService }: RegisterRoutesOptions,
): Promise<void> {
  fastify.get("/health", async () => ({
    status: "ok",
    service: "isorts-server",
  }));

  fastify.get("/api/maps/default", async () => defaultMap);

  fastify.get("/api/lobbies", async () => roomService.listOpenLobbies());

  fastify.post("/api/lobbies", async (request, reply) => {
    const body = request.body as CreateLobbyRequest;
    const lobby = roomService.createLobby(body);

    reply.code(201);
    return lobby;
  });

  fastify.post("/api/lobbies/:lobbyId/join", async (request, reply) => {
    const params = request.params as { lobbyId: string };
    const body = request.body as JoinLobbyRequest;
    const lobby = roomService.joinLobby(params.lobbyId, body.playerId);

    if (!lobby) {
      reply.code(404);
      return { message: "Lobby not found or already full." };
    }

    return lobby;
  });

  fastify.post("/api/lobbies/:lobbyId/start", async (request, reply) => {
    const params = request.params as { lobbyId: string };
    const lobby = roomService.startLobby(params.lobbyId);

    if (!lobby) {
      reply.code(404);
      return { message: "Lobby not found." };
    }

    const session = gameSessionService.createSession({
      entryMode: "custom-lobby",
      connectionMode: "hosted",
      scenario: defaultSkirmishScenario,
      map: defaultMap,
      playerIds: lobby.playerIds,
    });

    return {
      lobby,
      session,
    };
  });

  fastify.post("/api/matchmaking/join", async (request, reply) => {
    const body = request.body as MatchmakingJoinRequest;
    const result = matchmakingService.join(body);

    reply.code(result.session ? 201 : 202);
    return result;
  });

  fastify.get("/api/matchmaking/queue", async () => matchmakingService.listQueue());
  fastify.get("/api/sessions", async () => gameSessionService.listSessions());

  fastify.get("/api/sessions/:sessionId/snapshot", async (request, reply) => {
    const params = request.params as { sessionId: string };
    const snapshot = gameSessionService.getSnapshot(params.sessionId);

    if (!snapshot) {
      reply.code(404);
      return { message: "Session not found." };
    }

    return snapshot;
  });

  fastify.post("/api/sessions/:sessionId/commands", async (request, reply) => {
    const params = request.params as { sessionId: string };
    const envelope = request.body as CommandEnvelope;

    if (envelope.sessionId !== params.sessionId) {
      reply.code(400);
      return { message: "Command sessionId does not match route sessionId." };
    }

    const result = gameSessionService.issueCommand(envelope);

    if (result.status === "not-found") {
      reply.code(404);
      return { message: "Session not found." };
    }

    if (result.status === "rejected") {
      reply.code(400);
      return { message: "Command rejected.", reason: result.reason };
    }

    return result.command;
  });
}
