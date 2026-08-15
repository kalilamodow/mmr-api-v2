import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrap } from "./bootstrapper.js";
import { loadConfig } from "./config.js";
import { EOSAuth } from "./egs-auth/index.js";
import {
  RocketLeague,
  type PlayerProfileResult,
  type PlayerSkillData,
} from "./rl/index.js";
import logger from "./session-logger.js";
import { VersionConfiguration } from "./rl/versionconfig.js";

async function initializeAuth() {
  const auth = new EOSAuth();

  auth.onRefreshTokenUpdate((refresh) => {
    fs.writeFileSync(
      CREDENTIAL_FILE,
      JSON.stringify({
        refreshToken: refresh,
      }),
      {
        encoding: "utf-8",
      },
    );
  });

  if (fs.existsSync(CREDENTIAL_FILE)) {
    logger.log("initializeAuth", "Using refresh token from credential file");
    const current = fs.readFileSync(CREDENTIAL_FILE, { encoding: "utf-8" });
    const json = JSON.parse(current);
    if (typeof json.refreshToken === "string") {
      await auth.refresh(json.refreshToken);
    }
  } else {
    logger.log("initializeAuth", "Auth bootstrap required");
  }

  setInterval(
    () => {
      if (auth.exists()) {
        logger.log("authentication", "Automatic authentication refresh");
        auth.refresh();
      }
    },
    60 * 60 * 1000,
  );

  return auth;
}

const CREDENTIAL_FILE = path.join(process.cwd(), "./saved-credentials.json");
const { port, password, rlVersion } = loadConfig();
console.log({ rlVersion });

const auth = await initializeAuth();
const versioning = new VersionConfiguration(rlVersion);
const rocketLeague = new RocketLeague(auth, versioning);

const app = new Hono();
app.get("/", (c) =>
  c.html(
    `<h1>mmr-api-v2</h1><p>check out the <a href="//github.com/Kalilamodow/mmr-api-v2">github</a></p>`,
  ),
);

app.get(
  "/webadmin/*",
  serveStatic({
    root: fileURLToPath(new URL("./", import.meta.url)),
    rewriteRequestPath: (p) => p.replace("/webadmin/", "/webadmin/dist/"),
  }),
);

const passwordHeaderCheck = `Basic ${btoa(`:${password}`)}`;

app.use(
  "/webadmin/api/*",
  createMiddleware(async (c, next) => {
    if (c.req.header("Authorization") != passwordHeaderCheck) {
      c.status(403);
      return c.text("forbidden");
    }

    await next();
    return;
  }),
);

app.get("/webadmin/api/stats", (c) => {
  return c.json({
    bootstrapped: auth.exists(),
  });
});

app.get("/webadmin/api/currentauth", (c) => {
  if (!auth.exists()) {
    return c.json({ auth: null });
  }

  const current = auth.get();
  return c.json({
    auth: current,
  });
});

app.get("/webadmin/api/refreshAuth", async (c) => {
  logger.log("admin api", "Manual authentication refresh requested");
  await auth.refresh();
  return c.text("");
});

app.get("/webadmin/api/bootstrap", (c) => {
  return bootstrap(auth);
});

app.get("/webadmin/api/logs", (c) => {
  return c.json({ logs: logger.getLogs() });
});

function muToMMR(mu: number) {
  return Math.ceil(mu * 20 + 100);
}

// makes it a bit more easy to use
function skillResponse(skill: PlayerSkillData | null) {
  if (skill === null) return { playlists: null };

  return {
    playlists: skill.Skills.map((sk) => ({
      id: sk.Playlist,
      mmr: muToMMR(sk.Mu),
      tier: sk.Tier,
      division: sk.Division,
    })),
  };
}

app.get("/get-skills", async (c) => {
  const playerId = c.req.query("playerId");
  if (playerId === undefined)
    return c.json({ error: "No player id specified" });

  try {
    const skill = await rocketLeague.getPlayerSkill(playerId);
    return c.json(skillResponse(skill));
  } catch (error) {
    return c.json({ error: (error as Error).message });
  }
});

function profileResponse(profile: PlayerProfileResult | null) {
  if (profile === null) return null;

  const player = profile.PlayerData[0];
  return {
    id: player.PlayerID,
    name: player.PlayerName,
    state: player.PresenceState,
  };
}

app.get("/get-profile", async (c) => {
  const playerId = c.req.query("playerId");
  if (playerId === undefined)
    return c.json({ error: "No player id specified" });

  try {
    const profile = await rocketLeague.getPlayerProfile(playerId);
    return c.json(profileResponse(profile));
  } catch (error) {
    return c.json({ error: (error as Error).message });
  }
});

app.get("/player-id-to-epic-name", async (c) => {
  const playerId = c.req.query("playerId");
  if (playerId === undefined)
    return c.json({ error: "No player id specified" });

  try {
    const club = await rocketLeague.getPlayerClubDetails(playerId);
    if (club === null) return c.json({ name: null });
    if (club.ClubDetails === undefined) return c.json({ name: null });

    const foundPlayer = club.ClubDetails.Members.find(
      (m) => m.PlayerID === playerId,
    );
    if (foundPlayer === undefined) {
      throw new Error(
        "player is not part of their own club. " + JSON.stringify(club),
      );
    }

    return c.json({ name: foundPlayer.EpicPlayerName });
  } catch (error) {
    return c.json({ error: (error as Error).message });
  }
});

serve(
  {
    fetch: app.fetch,
    port: port,
  },
  (info) => {
    console.log(`Running on ${info.address}:${info.port}`);
  },
);
