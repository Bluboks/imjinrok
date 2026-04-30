export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 5174),
  tickRate: Number(process.env.TICK_RATE ?? 10),
};
