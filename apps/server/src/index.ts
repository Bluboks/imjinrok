import cors from "@fastify/cors";
import Fastify from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { type CommandEnvelope, defaultMap, defaultSkirmishScenario } from "../../../packages/shared/src/index.js";
import type { WorldState } from "../../../packages/simulation/src/index.js";
import { config } from "./config.js";
import { GameSessionService } from "./game/GameSessionService.js";
import { registerRoutes } from "./http/registerRoutes.js";
import { MatchmakingService } from "./matchmaking/MatchmakingService.js";
import { RoomService } from "./rooms/RoomService.js";

interface ClientToServerEvents {
  "session:join": (sessionId: string) => void;
  "command:issue": (envelope: CommandEnvelope) => void;
}

interface ServerToClientEvents {
  "session:snapshot": (snapshot: WorldState) => void;
  "session:commandAccepted": (command: CommandEnvelope) => void;
}

async function bootstrap(): Promise<void> {
  const fastify = Fastify({ logger: true });
  await fastify.register(cors, { origin: true });

  const roomService = new RoomService();
  const gameSessionService = new GameSessionService(config.tickRate);
  const matchmakingService = new MatchmakingService((tickets) =>
    gameSessionService.createSession({
      entryMode: "matchmaking",
      connectionMode: "dedicated-server",
      scenario: defaultSkirmishScenario,
      map: defaultMap,
      playerIds: tickets.map((ticket) => ticket.playerId),
    }),
  );

  await registerRoutes(fastify, {
    roomService,
    matchmakingService,
    gameSessionService,
  });

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(fastify.server, {
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    socket.on("session:join", (sessionId: string) => {
      socket.join(sessionId);

      const snapshot = gameSessionService.getSnapshot(sessionId);

      if (snapshot) {
        socket.emit("session:snapshot", snapshot);
      }
    });

    socket.on("command:issue", (envelope: CommandEnvelope) => {
      const acceptedCommand = gameSessionService.issueCommand(envelope);

      if (!acceptedCommand) {
        return;
      }

      io.to(envelope.sessionId).emit("session:commandAccepted", acceptedCommand);

      const snapshot = gameSessionService.getSnapshot(envelope.sessionId);

      if (snapshot) {
        io.to(envelope.sessionId).emit("session:snapshot", snapshot);
      }
    });
  });

  fastify.addHook("onClose", async () => {
    gameSessionService.dispose();
    io.close();
  });

  await fastify.listen({
    host: config.host,
    port: config.port,
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
