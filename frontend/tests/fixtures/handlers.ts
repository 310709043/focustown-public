/**
 * Default MSW handlers — minimal, deterministic responses for the
 * endpoints touched by component + integration tests. Each test can
 * override a specific route via `server.use(...)` for that test only.
 */
import { http, HttpResponse } from "msw";

import { makeFocusSession, makeMatch, makeUser, makeWallet } from "./factories";

const BASE = "http://localhost:8000";

export const handlers = [
  // auth
  http.post(`${BASE}/api/v1/auth/signin`, async () =>
    HttpResponse.json({
      user: makeUser(),
      tokens: { access_token: "a", refresh_token: "r" },
    }),
  ),
  http.post(`${BASE}/api/v1/auth/signup`, async () =>
    HttpResponse.json({
      user: makeUser(),
      tokens: { access_token: "a", refresh_token: "r" },
    }),
  ),
  http.get(`${BASE}/api/v1/auth/me`, async () => HttpResponse.json(makeUser())),

  // sessions
  http.post(`${BASE}/api/v1/sessions`, async () =>
    HttpResponse.json(makeFocusSession()),
  ),
  http.post(`${BASE}/api/v1/sessions/:id/complete`, async () =>
    HttpResponse.json(makeFocusSession({ status: "completed" })),
  ),

  // matches
  http.post(`${BASE}/api/v1/matches`, async () =>
    HttpResponse.json(makeMatch()),
  ),
  http.post(`${BASE}/api/v1/matches/:id/accept`, async () =>
    HttpResponse.json(makeMatch({ status: "accepted" })),
  ),
  http.post(`${BASE}/api/v1/matches/:id/skip`, async () =>
    HttpResponse.json(makeMatch({ status: "skipped" })),
  ),

  // leaderboard
  http.get(`${BASE}/api/v1/leaderboard/today`, async () => HttpResponse.json([])),

  // wallet
  http.get(`${BASE}/api/v1/me/wallet`, async () => HttpResponse.json([makeWallet()])),

  // shop
  http.get(`${BASE}/api/v1/shop`, async () => HttpResponse.json([])),

  // user items (inventory)
  http.get(`${BASE}/api/v1/me/items`, async () => HttpResponse.json([])),
];
