export const CLOCK_PORT = 'CLOCK_PORT';

export interface ServerClock {
  now(): Date;
}

export const systemServerClock: ServerClock = {
  now: () => new Date(),
};
