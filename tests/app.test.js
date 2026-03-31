const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const Database = require("better-sqlite3");
const { createApp, parseLikelySerial } = require("../src/app");

function buildApp() {
  const db = new Database(":memory:");
  return createApp({ db });
}

test("parseLikelySerial parses normalized serial", () => {
  assert.equal(parseLikelySerial("Serial: ab-1234 "), "SERIAL:AB-1234".match(/[A-Z0-9-]{4,}/g)[0]);
});

test("user, territory, location, tray transfer workflow works", async () => {
  const app = buildApp();

  const aliceRes = await request(app).post("/api/users").send({
    name: "Alice",
    email: "alice@example.com",
  });
  assert.equal(aliceRes.status, 201);
  const alice = aliceRes.body;

  const bobRes = await request(app).post("/api/users").send({
    name: "Bob",
    email: "bob@example.com",
  });
  assert.equal(bobRes.status, 201);
  const bob = bobRes.body;

  const terrARes = await request(app).post("/api/territories").send({
    name: "West Coast",
    stateRegion: "CA/NV",
    createdByUserId: alice.id,
  });
  assert.equal(terrARes.status, 201);
  const terrA = terrARes.body;

  const terrBRes = await request(app).post("/api/territories").send({
    name: "South",
    stateRegion: "TX/OK",
    createdByUserId: bob.id,
  });
  assert.equal(terrBRes.status, 201);
  const terrB = terrBRes.body;

  const addMemberRes = await request(app)
    .post(`/api/territories/${terrA.id}/members`)
    .set("x-user-id", alice.id)
    .send({
      userId: bob.id,
      role: "member",
    });
  assert.equal(addMemberRes.status, 201);

  const locationRes = await request(app)
    .post(`/api/territories/${terrA.id}/locations`)
    .set("x-user-id", alice.id)
    .send({
      name: "General Hospital",
      address: "123 Main St",
    });
  assert.equal(locationRes.status, 201);
  const location = locationRes.body;

  const trayRes = await request(app)
    .post("/api/trays")
    .set("x-user-id", alice.id)
    .send({
      name: "Knee Set A",
      serialCode: "KS-A-9001",
      ownerTerritoryId: terrA.id,
      currentLocationId: location.id,
      isLoaner: true,
    });
  assert.equal(trayRes.status, 201);
  const tray = trayRes.body;

  const transferRes = await request(app)
    .post(`/api/trays/${tray.id}/transfer`)
    .set("x-user-id", alice.id)
    .send({
      fromTerritoryId: terrA.id,
      toTerritoryId: terrB.id,
      notes: "Loan to south region",
    });
  assert.equal(transferRes.status, 200);
  assert.equal(transferRes.body.transfer.transfer_type, "loan_out");
  assert.equal(transferRes.body.tray.current_territory_id, terrB.id);

  const scanRes = await request(app)
    .post("/api/scan-events")
    .set("x-user-id", alice.id)
    .send({
      territoryId: terrA.id,
      scanType: "text",
      rawValue: "ks-a-9001",
    });
  assert.equal(scanRes.status, 201);
  assert.equal(scanRes.body.parsed_serial, "KS-A-9001");
});
