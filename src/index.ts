import express from "express";
import { MATCH_STATE, RWG_EVENT, RwgGame } from "@OlliePugh/rwg-game";
import { Server as SocketServer } from "socket.io";
import cors from "cors";
import http from "http";
import generateConfig from "./game-config";
import { stopCars } from "./serial-handler";
import { EVENTS, eventEmitter } from "./event-listener";
import { lapCounter, speedBans } from "./globals";
import "./control-handler";

const app = express();

app.use(
  cors({
    origin: "https://play.ollieq.co.uk",
  })
);

const httpServer = http.createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: "https://play.ollieq.co.uk",
  },
});

const gameServer = new RwgGame(generateConfig(), httpServer, app, io);
const emitLapUpdate = (playerIndex: number) => {
  const player = gameServer.currentMatch.getPlayers()[playerIndex];

  player?.updateUserInterface({
    "lap-counter": {
      extraData: {
        message: `Lap ${++lapCounter[playerIndex]}`,
      },
    },
  });
};

const emitSpeedViolationMessage = (
  playerIndex: number,
  secondsRemaining: number
) => {
  const message =
    secondsRemaining === 0
      ? ""
      : `VIRTUAL SPIN OFF!\nRegain controls in ${secondsRemaining}`;

  gameServer.currentMatch.getPlayers()[playerIndex]?.updateUserInterface({
    "speed-violation-text": {
      extraData: {
        message,
      },
    },
  });

  if (secondsRemaining-- > 0) {
    speedBans[playerIndex].currentTimeout = setTimeout(() => {
      emitSpeedViolationMessage(playerIndex, secondsRemaining); // recursively call this function until timer ends
    }, 1000);
  }

  if (secondsRemaining == -1) {
    eventEmitter.emit(EVENTS.VIOLATED_CLEARED, playerIndex);
  }
};

gameServer.on(RWG_EVENT.MATCH_STATE_CHANGE, (newState, match) => {
  if (newState === MATCH_STATE.COUNTDOWN) {
    lapCounter[0] = 1;
    lapCounter[1] = 1;
    match.getPlayers().forEach((player, index) =>
      player.updateUserInterface({
        "car-determined-text": {
          extraData: {
            message: `You are the ${index === 0 ? "Yellow" : "Black"} car`,
          },
        },
      })
    );
  }
  if (
    newState === MATCH_STATE.COMPLETED ||
    newState === MATCH_STATE.WAITING_FOR_PLAYERS
  ) {
    stopCars();
  }
});

httpServer.listen(80, () => {
  console.log("Server Started");
});

eventEmitter.on(EVENTS.LAP_UPDATE, emitLapUpdate);
eventEmitter.on(EVENTS.SPEEDING_VIOLATION, emitSpeedViolationMessage);
