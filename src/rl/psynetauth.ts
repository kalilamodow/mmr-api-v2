import type { EOSAuth } from "../egs-auth/index.js";
import logger from "../session-logger.js";
import { generatePsySig } from "./psysig.js";
import type { VersionConfiguration } from "./versionconfig.js";

export type PsynetAuth = {
  IsLastChanceAuthBan: boolean;
  SessionID: string;
  VerifiedPlayerName: string;
  UseWebSocket: true;
  PerConURL: "wss://ws.rlpp.psynet.gg/ws/gc?PsyConnectionType=Player";
  PerConURLv2: "wss://ws.rlpp.psynet.gg/ws/gc2";
  PsyToken: string;
};

export async function loginToPsynet(
  auth: EOSAuth,
  versioning: VersionConfiguration,
): Promise<PsynetAuth> {
  const credentials = auth.get();
  const body = {
    Platform: "Epic",
    PlayerName: "",
    PlayerID: credentials.accountId,
    Language: "INT",
    AuthTicket: credentials.accessToken,
    BuildRegion: "",
    FeatureSet: versioning.get().featureSet,
    Device: "PC",
    bSkipAuth: false,
    bSetAsPrimaryAccount: true,
    EpicAuthTicket: credentials.accessToken,
    EpicAccountID: credentials.accountId,
    LocalFirstPlayerID: `Epic|${credentials.accountId}|0`,
  };

  const response = await fetch(
    "https://api.rlpp.psynet.gg/rpc/Auth/AuthPlayer/v2",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        PsyBuildID: versioning.get().buildId,
        PsyRequestID: "PsyNetMessage_X_1",
        PsySig: generatePsySig(JSON.stringify(body)),
        PsyEnvironment: "Prod",
        "User-Agent":
          "RL Win/260602.75104.519749 gzip (x86_64-pc-win32) curl-7.67.0 Schannel",
      },
      body: JSON.stringify(body),
    },
  );

  const json:
    { Result: PsynetAuth } | { Error: { Type: string; Message: string } } =
    await response.json();

  if ("Result" in json) {
    return json.Result;
  }

  if (json.Error.Type === "ThirdPartyError") {
    logger.log("loginToPsynet", "got third party error. refreshing.", "warn");
    auth.refresh();
    return loginToPsynet(auth, versioning);
  }

  logger.log("loginToPsynet", "psynet error:" + JSON.stringify(json), "error");
  throw new Error("psynet error:" + JSON.stringify(json));
}
