import { createHmac } from "node:crypto";

const PSY_KEY = "c338bd36fb8c42b1a431d30add939fc7";

export function generatePsySig(body: string) {
  return createHmac("sha256", PSY_KEY).update(`-${body}`).digest("base64");
}
