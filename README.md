# mmr-api-v2

This is an api that talks to Rocket League's own websocket API to provide an
http interface for skill data (mmrs, ranks) and profile data. It was made to
provide [rlbuddy](https://github.com/kalilamodow/rlbuddy) with an interface to
talk to psynet without having to deal with client-side authentication.

It is written in javascript with Node to be used as a webserver.

## setup

Run `npm build`, and create a config.json in the project root. The `password`
field is required, and the `port` field is optional (defaults to 3000). You can
run it with `node dist/index.js` then.

To authenticate to rocket league servers, go to `/bootstrap?pw={password}`.
This will give you a link which you can open in your own device that's signed
in to the target account to authorize. Note: you should use an alt account
because rocket league only allows one connection at a time per account.

## routes

All routes take a "playerId" argument (eg.
`Epic|856219b10c04432babaf183d19ecca8f|0`)

### `/get-skills`

Gets the skill data in each playlist of the given player.

example: `https://mmr.kmdw.dev/get-skills?playerId=Steam|76561198144145654|0`

```json
{
  "playlists": [
    // 2s: ssl, 2187 mmr
    {
      "id": 11,
      "mmr": 2187,
      "tier": 22,
      "division": 0
    },
    // 3s: gc1, 1541 mmr
    {
      "id": 13,
      "mmr": 1541,
      "tier": 19,
      "division": 3
    },
    // 4s: champ 2 div 2, 995 mmr
    {
      "id": 61,
      "mmr": 995,
      "tier": 0,
      "division": 0
    },
    ...
  ]
}
```

### `/get-profile`

Gets the profile info for a given player

example: `https://mmr.kmdw.dev/get-profile?playerId=Steam|76561198144145654|0`

```json
{
  "id": "Steam|76561198144145654|0",
  "name": "zen",
  "state": "Offline"
}
```

### `/player-id-to-epic-name`

Converts a normal player id to the player's connected Epic account name

This only works if the player is in a club because it uses club details

example: `https://mmr.kmdw.dev/get?playerId=XboxOne|2535426630902234|0` -> name: DefNotHackingFr
but `https://mmr.kmdw.dev/player-id-to-epic-name?playerId=XboxOne|2535426630902234|0` gives

```json
{
  "name": "j0hnd00d1e12344_"
}
```
