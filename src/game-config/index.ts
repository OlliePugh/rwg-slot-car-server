import { CONTROL_TYPE, ELEMENT_TYPE, RwgConfig } from "@OlliePugh/rwg-game";
import { EVENTS, eventEmitter } from "../event-listener";
import { autonomousToggle, writeSpeed } from "../serial-handler";

const generateConfig = (): RwgConfig => ({
  id: "slot-cars",
  queueServer: "https://queue.ollieq.co.uk",
  description: "Race slot cars from anywhere in the world!",
  name: "Slot Car Racing",
  authenticationRequired: false,
  gamePreparator: (done) => {
    autonomousToggle({ enabled: true, car: 1 });
    autonomousToggle({ enabled: true, car: 2 });

    const backAtStart = [false, false];
    const listener = (playerIndex: number) => {
      autonomousToggle({ enabled: false, car: playerIndex + 1 });
      writeSpeed(0, playerIndex == 0); // stop the car
      backAtStart[playerIndex] = true;
      if (backAtStart.every((x) => x)) {
        eventEmitter.off(EVENTS.LAP_UPDATE, listener); // Remove the listener
        done();
      }
    };
    eventEmitter.on(EVENTS.LAP_UPDATE, listener);
  },
  // timeLimit: 60,
  userInterface: [
    {
      id: "control-slider",
      type: CONTROL_TYPE.SLIDER,
      control: [
        {
          id: "control-slider",
          inputMap: [],
        },
      ],
      rateLimit: 10,
      position: {
        x: 0.5,
        y: 0.8,
      },
      displayOnDesktop: true,
      size: 0.5,
    },
    {
      id: "speed-violation-text",
      type: ELEMENT_TYPE.TEXT,
      position: {
        x: 0.1,
        y: 0.1,
      },
      displayOnDesktop: true,
      size: 1,
      extraData: { message: "" },
    },
    {
      id: "car-determined-text",
      type: ELEMENT_TYPE.TEXT,
      position: {
        x: 0.5,
        y: 0.1,
      },
      displayOnDesktop: true,
      size: 1,
      extraData: { message: "Loading..." },
    },
    {
      id: "lap-counter",
      type: ELEMENT_TYPE.TEXT,
      position: {
        x: 0.8,
        y: 0.1,
      },
      displayOnDesktop: true,
      size: 1,
      extraData: { message: "Lap: 1" },
    },
  ],
  countdownSeconds: 0,
  controllables: [
    {
      id: "car1",
      onControl: (eventData) => {
        eventEmitter.emit(EVENTS.CONTROL, eventData, true);
      },
      stream: {
        address: "stream.ollieq.co.uk",
        id: 1,
        port: 8004,
      },
    },
    {
      id: "car2",
      onControl: (eventData) => {
        eventEmitter.emit(EVENTS.CONTROL, eventData, false);
      },
      stream: {
        address: "stream.ollieq.co.uk",
        id: 1,
        port: 8004,
      },
    },
  ],
});

export default generateConfig;
