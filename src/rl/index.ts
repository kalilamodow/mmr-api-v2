import { WebSocket } from "ws";
import type { EOSAuth } from "../egs-auth/index.js";
import { loginToPsynet } from "./psynetauth.js";
import { generatePsySig } from "./psysig.js";
import logger from "../session-logger.js";
import type { VersionConfiguration } from "./versionconfig.js";

type TimeoutId = ReturnType<typeof setTimeout>;
function parseHttpResponse(raw: string) {
  const sepMatch = raw.match(/\r?\n\r?\n/);

  if (!sepMatch) {
    throw "invalid http response";
  }

  const separatorIndex = sepMatch.index!;
  const separatorLength = sepMatch[0].length;

  const headerText = raw.slice(0, separatorIndex);
  const body = raw.slice(separatorIndex + separatorLength);

  const headers = new Headers();

  for (const line of headerText.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx == -1) continue;

    const name = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();

    headers.append(name, value);
  }

  return new Response(body, {
    headers,
  });
}

export type PlayerSkillData = {
  Skills: {
    Playlist: number;
    Mu: number;
    Sigma: number;
    Tier: number;
    Division: number;
    MMR: number;
    WinStreak: number;
    MatchesPlayed: number;
  }[];
  RewardLevels: {
    SeasonLevel: number;
    SeasonLevelWins: number;
  };
};

export type PlayerProfileResult = {
  PlayerData: {
    PlayerID: string;
    PlayerName: string;
    PresenceState: string;
    PresenceInfo: string;
  }[];
};

export type ClubDetailsResult = {
  ClubDetails: {
    ClubID: number;
    ClubName: string;
    ClubTag: string;
    EquippedTitle: string;
    OwnerPlayerID: string;
    Members: {
      PlayerID: string;
      PlayerName: string;
      EpicPlayerID: string;
      EpicPlayerName: string;
      RoleID: number;
    }[];
  };
};

export class RocketLeague {
  private socket: WebSocket | null;
  private autoDisconnectTimeout: TimeoutId | null;
  private requestId: number;
  private auth: EOSAuth;
  private versioning: VersionConfiguration;

  private handlers: {
    requestId: number;
    handler: (data: any) => void;
  }[];

  constructor(auth: EOSAuth, versioning: VersionConfiguration) {
    this.socket = null;
    this.auth = auth;
    this.versioning = versioning;
    this.autoDisconnectTimeout = null;
    this.handlers = [];
    this.requestId = 1;
  }

  public async getPlayerSkill(playerId: string) {
    return this.send<PlayerSkillData>(
      this.auth,
      "Skills/GetPlayerSkill v1",
      JSON.stringify({
        PlayerID: playerId,
      }),
    );
  }

  public async getPlayerProfile(playerId: string) {
    return this.send<PlayerProfileResult>(
      this.auth,
      "Players/GetProfile v1",
      JSON.stringify({
        PlayerIDs: [playerId],
      }),
    );
  }

  public async getPlayerClubDetails(playerId: string) {
    return this.send<ClubDetailsResult>(
      this.auth,
      "Clubs/GetPlayerClubDetails v2",
      JSON.stringify({
        PlayerID: playerId,
      }),
    );
  }

  private async send<T>(auth: EOSAuth, service: string, body: string) {
    if (this.socket === null) {
      await this.activate(auth);
    }

    this.requestId++;

    const headers = [
      `PsyService: ${service}`,
      `PsyRequestID: PsyNetMessage_X_${this.requestId}`,
      `PsySig: ${generatePsySig(body)}`,
    ].join("\r\n");

    this.socket!.send(`${headers}\r\n\r\n${body}`);
    return new Promise<T | null>((resolve, reject) => {
      this.handlers.push({
        requestId: this.requestId,
        handler: resolve,
      });

      setTimeout(() => reject(), 1000);
    });
  }

  private currentActivationPromise: Promise<void> | null = null;
  private activate(credentials: EOSAuth) {
    if (this.currentActivationPromise !== null)
      return this.currentActivationPromise;

    this.currentActivationPromise = (async () => {
      const psynet = await loginToPsynet(credentials, this.versioning);
      this.socket = new WebSocket(psynet.PerConURLv2, {
        headers: {
          PsyToken: psynet.PsyToken,
          PsySessionID: psynet.SessionID,
          PsyBuildID: this.versioning.get().buildId,
          PsyEnvironment: "Prod",
        },
      });

      this.socket.addEventListener("message", (msg) => {
        const resp = parseHttpResponse(msg.data.toString());
        this.resetAutoDisconnectTimer();

        const requestId = Number(resp.headers.get("PsyResponseID")!.slice(16));
        resp.json().then((json: any) => {
          for (const handler of this.handlers) {
            if (handler.requestId === requestId)
              handler.handler(json.Result || null);
          }
          this.handlers = this.handlers.filter(
            (h) => h.requestId !== requestId,
          );
        });
      });

      this.socket.on("error", (err) => {
        logger.log("RocketLeague.activate", JSON.stringify(err), "error");
      });

      this.socket.on("close", () => {
        this.resetAutoDisconnectTimer(false);
      });

      await new Promise<void>((resolve) => {
        this.socket!.addEventListener("open", async () => {
          this.resetAutoDisconnectTimer();
          this.requestId = 1;
          resolve();
        });
      });

      this.currentActivationPromise = null;
    })();
    return this.currentActivationPromise;
  }

  private deactivate() {
    this.socket?.close();
    this.socket = null;
  }

  private resetAutoDisconnectTimer(restart = true) {
    if (this.autoDisconnectTimeout) clearTimeout(this.autoDisconnectTimeout);
    if (restart) {
      this.autoDisconnectTimeout = setTimeout(() => {
        this.deactivate();
      }, 5000);
    } else {
      this.autoDisconnectTimeout = null;
    }
  }
}
