const path = require("path");
const express = require("express");
const { randomUUID } = require("crypto");
const { createDb, initSchema } = require("./db");

function nowIso() {
  return new Date().toISOString();
}

function parseLikelySerial(rawValue) {
  if (!rawValue || typeof rawValue !== "string") {
    return null;
  }

  const normalized = rawValue.toUpperCase().trim();
  const compact = normalized.replace(/\s+/g, "");
  const candidates = compact.match(/[A-Z0-9-]{4,}/g) || [];
  const best = candidates.find((candidate) => /[A-Z]/.test(candidate) && /\d/.test(candidate));
  return best || candidates[0] || null;
}

function createApp(options = {}) {
  const db = options.db || createDb();
  if (options.db) {
    initSchema(db);
  }
  const app = express();

  app.use(express.json({ limit: "2mb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  function fail(res, status, message) {
    return res.status(status).json({ error: message });
  }

  function requireFields(res, body, fields) {
    for (const field of fields) {
      if (body[field] === undefined || body[field] === null || body[field] === "") {
        fail(res, 400, `Missing required field: ${field}`);
        return false;
      }
    }
    return true;
  }

  function getActingUserId(req) {
    return req.header("x-user-id") || req.body?.userId || req.query.userId;
  }

  const getUserByIdStmt = db.prepare(`SELECT * FROM users WHERE id = ?`);
  const getTerritoryByIdStmt = db.prepare(`SELECT * FROM territories WHERE id = ?`);
  const getLocationByIdStmt = db.prepare(`SELECT * FROM locations WHERE id = ?`);
  const getTrayByIdStmt = db.prepare(`SELECT * FROM trays WHERE id = ?`);

  const isTerritoryMemberStmt = db.prepare(`
    SELECT role
    FROM territory_members
    WHERE territory_id = ? AND user_id = ?
  `);

  function requireMembership(req, res, territoryId) {
    const userId = getActingUserId(req);
    if (!userId) {
      return { error: fail(res, 401, "Missing acting user. Pass x-user-id header.") };
    }
    const membership = isTerritoryMemberStmt.get(territoryId, userId);
    if (!membership) {
      return { error: fail(res, 403, "User is not a member of this territory.") };
    }
    return { userId, membership };
  }

  app.get("/api/health", (req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/users", (req, res) => {
    const users = db.prepare(`SELECT * FROM users ORDER BY name ASC`).all();
    res.json(users);
  });

  app.post("/api/users", (req, res) => {
    if (!requireFields(res, req.body, ["name", "email"])) {
      return;
    }
    const id = randomUUID();
    const createdAt = nowIso();
    try {
      db.prepare(`
        INSERT INTO users (id, name, email, created_at)
        VALUES (?, ?, ?, ?)
      `).run(id, req.body.name, req.body.email.toLowerCase(), createdAt);
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        fail(res, 409, "Email is already in use.");
        return;
      }
      throw error;
    }
    res.status(201).json(getUserByIdStmt.get(id));
  });

  app.get("/api/territories", (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      const territories = db.prepare(`
        SELECT t.*, COUNT(tm.user_id) AS member_count
        FROM territories t
        LEFT JOIN territory_members tm ON tm.territory_id = t.id
        GROUP BY t.id
        ORDER BY t.name ASC
      `).all();
      res.json(territories);
      return;
    }

    const territories = db.prepare(`
      SELECT t.*, COUNT(tm2.user_id) AS member_count
      FROM territory_members tm
      JOIN territories t ON t.id = tm.territory_id
      LEFT JOIN territory_members tm2 ON tm2.territory_id = t.id
      WHERE tm.user_id = ?
      GROUP BY t.id
      ORDER BY t.name ASC
    `).all(userId);
    res.json(territories);
  });

  app.post("/api/territories", (req, res) => {
    if (!requireFields(res, req.body, ["name", "createdByUserId"])) {
      return;
    }

    const creator = getUserByIdStmt.get(req.body.createdByUserId);
    if (!creator) {
      fail(res, 404, "Creating user does not exist.");
      return;
    }

    const id = randomUUID();
    const createdAt = nowIso();
    const insertTerritory = db.prepare(`
      INSERT INTO territories (id, name, state_region, created_at)
      VALUES (?, ?, ?, ?)
    `);
    const insertMember = db.prepare(`
      INSERT INTO territory_members (territory_id, user_id, role, created_at)
      VALUES (?, ?, ?, ?)
    `);

    try {
      db.transaction(() => {
        insertTerritory.run(id, req.body.name.trim(), req.body.stateRegion || null, createdAt);
        insertMember.run(id, creator.id, "owner", createdAt);
      })();
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        fail(res, 409, "Territory name already exists.");
        return;
      }
      throw error;
    }

    res.status(201).json(getTerritoryByIdStmt.get(id));
  });

  app.get("/api/territories/:territoryId/members", (req, res) => {
    const territoryId = req.params.territoryId;
    if (!getTerritoryByIdStmt.get(territoryId)) {
      fail(res, 404, "Territory not found.");
      return;
    }
    const membership = requireMembership(req, res, territoryId);
    if (membership.error) {
      return;
    }
    const rows = db.prepare(`
      SELECT tm.territory_id, tm.role, tm.created_at, u.id AS user_id, u.name, u.email
      FROM territory_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.territory_id = ?
      ORDER BY u.name ASC
    `).all(territoryId);
    res.json(rows);
  });

  app.post("/api/territories/:territoryId/members", (req, res) => {
    const territoryId = req.params.territoryId;
    if (!requireFields(res, req.body, ["userId", "role"])) {
      return;
    }
    const territory = getTerritoryByIdStmt.get(territoryId);
    if (!territory) {
      fail(res, 404, "Territory not found.");
      return;
    }
    const actor = requireMembership(req, res, territoryId);
    if (actor.error) {
      return;
    }

    const actorRole = actor.membership.role;
    if (!["owner", "admin"].includes(actorRole)) {
      fail(res, 403, "Only owner/admin can add members.");
      return;
    }

    const user = getUserByIdStmt.get(req.body.userId);
    if (!user) {
      fail(res, 404, "User not found.");
      return;
    }

    const role = String(req.body.role || "member").toLowerCase();
    if (!["owner", "admin", "member"].includes(role)) {
      fail(res, 400, "Invalid role.");
      return;
    }

    try {
      db.prepare(`
        INSERT INTO territory_members (territory_id, user_id, role, created_at)
        VALUES (?, ?, ?, ?)
      `).run(territoryId, user.id, role, nowIso());
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        fail(res, 409, "User is already a member.");
        return;
      }
      throw error;
    }
    const member = db.prepare(`
      SELECT tm.territory_id, tm.role, tm.created_at, u.id AS user_id, u.name, u.email
      FROM territory_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.territory_id = ? AND tm.user_id = ?
    `).get(territoryId, user.id);
    res.status(201).json(member);
  });

  app.get("/api/territories/:territoryId/locations", (req, res) => {
    const territoryId = req.params.territoryId;
    if (!getTerritoryByIdStmt.get(territoryId)) {
      fail(res, 404, "Territory not found.");
      return;
    }
    const membership = requireMembership(req, res, territoryId);
    if (membership.error) {
      return;
    }
    const rows = db.prepare(`
      SELECT *
      FROM locations
      WHERE territory_id = ?
      ORDER BY name ASC
    `).all(territoryId);
    res.json(rows);
  });

  app.post("/api/territories/:territoryId/locations", (req, res) => {
    const territoryId = req.params.territoryId;
    if (!requireFields(res, req.body, ["name"])) {
      return;
    }
    if (!getTerritoryByIdStmt.get(territoryId)) {
      fail(res, 404, "Territory not found.");
      return;
    }
    const membership = requireMembership(req, res, territoryId);
    if (membership.error) {
      return;
    }
    const id = randomUUID();
    const now = nowIso();
    db.prepare(`
      INSERT INTO locations (id, territory_id, name, address, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      territoryId,
      req.body.name.trim(),
      req.body.address || null,
      req.body.notes || null,
      now,
      now
    );
    res.status(201).json(getLocationByIdStmt.get(id));
  });

  app.put("/api/locations/:locationId", (req, res) => {
    const location = getLocationByIdStmt.get(req.params.locationId);
    if (!location) {
      fail(res, 404, "Location not found.");
      return;
    }
    const membership = requireMembership(req, res, location.territory_id);
    if (membership.error) {
      return;
    }
    db.prepare(`
      UPDATE locations
      SET
        name = COALESCE(?, name),
        address = COALESCE(?, address),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `).run(
      req.body.name || null,
      req.body.address || null,
      req.body.notes || null,
      nowIso(),
      location.id
    );
    res.json(getLocationByIdStmt.get(location.id));
  });

  app.get("/api/territories/:territoryId/trays", (req, res) => {
    const territoryId = req.params.territoryId;
    if (!getTerritoryByIdStmt.get(territoryId)) {
      fail(res, 404, "Territory not found.");
      return;
    }
    const membership = requireMembership(req, res, territoryId);
    if (membership.error) {
      return;
    }
    const rows = db.prepare(`
      SELECT
        t.*,
        l.name AS current_location_name,
        owner.name AS owner_territory_name,
        current.name AS current_territory_name
      FROM trays t
      LEFT JOIN locations l ON l.id = t.current_location_id
      LEFT JOIN territories owner ON owner.id = t.owner_territory_id
      LEFT JOIN territories current ON current.id = t.current_territory_id
      WHERE t.current_territory_id = ? OR t.owner_territory_id = ?
      ORDER BY t.updated_at DESC
    `).all(territoryId, territoryId);
    res.json(rows);
  });

  app.post("/api/trays", (req, res) => {
    if (!requireFields(res, req.body, ["name", "ownerTerritoryId"])) {
      return;
    }
    const ownerTerritory = getTerritoryByIdStmt.get(req.body.ownerTerritoryId);
    if (!ownerTerritory) {
      fail(res, 404, "Owner territory not found.");
      return;
    }
    const membership = requireMembership(req, res, ownerTerritory.id);
    if (membership.error) {
      return;
    }

    const currentTerritoryId = req.body.currentTerritoryId || ownerTerritory.id;
    if (!getTerritoryByIdStmt.get(currentTerritoryId)) {
      fail(res, 404, "Current territory not found.");
      return;
    }
    let currentLocationId = req.body.currentLocationId || null;
    if (currentLocationId) {
      const location = getLocationByIdStmt.get(currentLocationId);
      if (!location || location.territory_id !== currentTerritoryId) {
        fail(res, 400, "Current location must belong to current territory.");
        return;
      }
    }

    const id = randomUUID();
    const now = nowIso();
    const currentDiffersFromOwner = currentTerritoryId !== ownerTerritory.id;
    db.prepare(`
      INSERT INTO trays (
        id, name, serial_code, status, is_loaner,
        owner_territory_id, current_territory_id, current_location_id,
        loan_state, loan_counterparty_territory_id, notes, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.body.name.trim(),
      req.body.serialCode || null,
      req.body.status || "available",
      req.body.isLoaner ? 1 : 0,
      ownerTerritory.id,
      currentTerritoryId,
      currentLocationId,
      currentDiffersFromOwner ? "loaned_out" : "none",
      currentDiffersFromOwner ? currentTerritoryId : null,
      req.body.notes || null,
      now,
      now
    );

    res.status(201).json(getTrayByIdStmt.get(id));
  });

  app.put("/api/trays/:trayId", (req, res) => {
    const tray = getTrayByIdStmt.get(req.params.trayId);
    if (!tray) {
      fail(res, 404, "Tray not found.");
      return;
    }

    const inCurrent = isTerritoryMemberStmt.get(tray.current_territory_id, getActingUserId(req));
    const inOwner = isTerritoryMemberStmt.get(tray.owner_territory_id, getActingUserId(req));
    if (!inCurrent && !inOwner) {
      fail(res, 403, "User is not authorized to edit this tray.");
      return;
    }

    db.prepare(`
      UPDATE trays
      SET
        name = COALESCE(?, name),
        serial_code = COALESCE(?, serial_code),
        status = COALESCE(?, status),
        is_loaner = COALESCE(?, is_loaner),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `).run(
      req.body.name || null,
      req.body.serialCode || null,
      req.body.status || null,
      req.body.isLoaner === undefined ? null : req.body.isLoaner ? 1 : 0,
      req.body.notes || null,
      nowIso(),
      tray.id
    );
    res.json(getTrayByIdStmt.get(tray.id));
  });

  app.post("/api/trays/:trayId/assign-location", (req, res) => {
    if (!requireFields(res, req.body, ["territoryId", "locationId"])) {
      return;
    }
    const tray = getTrayByIdStmt.get(req.params.trayId);
    if (!tray) {
      fail(res, 404, "Tray not found.");
      return;
    }
    if (tray.current_territory_id !== req.body.territoryId) {
      fail(res, 400, "Tray is not currently in the provided territory.");
      return;
    }
    const membership = requireMembership(req, res, req.body.territoryId);
    if (membership.error) {
      return;
    }

    const targetLocation = getLocationByIdStmt.get(req.body.locationId);
    if (!targetLocation || targetLocation.territory_id !== req.body.territoryId) {
      fail(res, 400, "Location does not belong to territory.");
      return;
    }

    const transferId = randomUUID();
    const now = nowIso();
    db.transaction(() => {
      db.prepare(`
        UPDATE trays
        SET current_location_id = ?, updated_at = ?
        WHERE id = ?
      `).run(targetLocation.id, now, tray.id);

      db.prepare(`
        INSERT INTO transfers (
          id, tray_id, from_territory_id, to_territory_id,
          from_location_id, to_location_id, transfer_type, notes,
          created_by_user_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        transferId,
        tray.id,
        tray.current_territory_id,
        tray.current_territory_id,
        tray.current_location_id,
        targetLocation.id,
        "intra_territory",
        req.body.notes || "Location reassignment",
        membership.userId,
        now
      );
    })();

    res.json({
      tray: getTrayByIdStmt.get(tray.id),
      transfer: db.prepare(`SELECT * FROM transfers WHERE id = ?`).get(transferId),
    });
  });

  app.post("/api/trays/:trayId/transfer", (req, res) => {
    if (!requireFields(res, req.body, ["fromTerritoryId", "toTerritoryId"])) {
      return;
    }
    const tray = getTrayByIdStmt.get(req.params.trayId);
    if (!tray) {
      fail(res, 404, "Tray not found.");
      return;
    }
    if (tray.current_territory_id !== req.body.fromTerritoryId) {
      fail(res, 400, "Tray is not currently in fromTerritoryId.");
      return;
    }

    const fromTerritory = getTerritoryByIdStmt.get(req.body.fromTerritoryId);
    const toTerritory = getTerritoryByIdStmt.get(req.body.toTerritoryId);
    if (!fromTerritory || !toTerritory) {
      fail(res, 404, "From/to territory not found.");
      return;
    }

    const membership = requireMembership(req, res, fromTerritory.id);
    if (membership.error) {
      return;
    }

    let toLocationId = req.body.toLocationId || null;
    if (toLocationId) {
      const targetLocation = getLocationByIdStmt.get(toLocationId);
      if (!targetLocation || targetLocation.territory_id !== toTerritory.id) {
        fail(res, 400, "toLocationId must belong to toTerritoryId.");
        return;
      }
    }

    let transferType = "inter_territory";
    if (fromTerritory.id === toTerritory.id) {
      transferType = "intra_territory";
    } else if (tray.owner_territory_id === fromTerritory.id && toTerritory.id !== tray.owner_territory_id) {
      transferType = "loan_out";
    } else if (fromTerritory.id !== tray.owner_territory_id && toTerritory.id === tray.owner_territory_id) {
      transferType = "loan_return";
    }

    let nextLoanState = tray.loan_state;
    let nextCounterparty = tray.loan_counterparty_territory_id;
    if (toTerritory.id === tray.owner_territory_id) {
      nextLoanState = "none";
      nextCounterparty = null;
    } else if (toTerritory.id !== tray.owner_territory_id) {
      nextLoanState = "loaned_out";
      nextCounterparty = toTerritory.id;
    }

    const now = nowIso();
    const transferId = randomUUID();
    db.transaction(() => {
      db.prepare(`
        UPDATE trays
        SET
          current_territory_id = ?,
          current_location_id = ?,
          loan_state = ?,
          loan_counterparty_territory_id = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        toTerritory.id,
        toLocationId,
        nextLoanState,
        nextCounterparty,
        now,
        tray.id
      );

      db.prepare(`
        INSERT INTO transfers (
          id, tray_id, from_territory_id, to_territory_id,
          from_location_id, to_location_id, transfer_type, notes,
          created_by_user_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        transferId,
        tray.id,
        fromTerritory.id,
        toTerritory.id,
        tray.current_location_id,
        toLocationId,
        transferType,
        req.body.notes || null,
        membership.userId,
        now
      );
    })();

    res.json({
      tray: getTrayByIdStmt.get(tray.id),
      transfer: db.prepare(`SELECT * FROM transfers WHERE id = ?`).get(transferId),
    });
  });

  app.get("/api/territories/:territoryId/transfers", (req, res) => {
    const territoryId = req.params.territoryId;
    const territory = getTerritoryByIdStmt.get(territoryId);
    if (!territory) {
      fail(res, 404, "Territory not found.");
      return;
    }
    const membership = requireMembership(req, res, territoryId);
    if (membership.error) {
      return;
    }
    const rows = db.prepare(`
      SELECT tr.*, t.name AS tray_name
      FROM transfers tr
      JOIN trays t ON t.id = tr.tray_id
      WHERE tr.from_territory_id = ? OR tr.to_territory_id = ?
      ORDER BY tr.created_at DESC
    `).all(territoryId, territoryId);
    res.json(rows);
  });

  app.get("/api/territories/:territoryId/loaners", (req, res) => {
    const territoryId = req.params.territoryId;
    const territory = getTerritoryByIdStmt.get(territoryId);
    if (!territory) {
      fail(res, 404, "Territory not found.");
      return;
    }
    const membership = requireMembership(req, res, territoryId);
    if (membership.error) {
      return;
    }
    const scope = req.query.scope || "all";
    let whereClause = `t.is_loaner = 1 AND (t.owner_territory_id = @territoryId OR t.current_territory_id = @territoryId)`;
    if (scope === "owned") {
      whereClause = `t.is_loaner = 1 AND t.owner_territory_id = @territoryId`;
    } else if (scope === "borrowed") {
      whereClause = `t.is_loaner = 1 AND t.current_territory_id = @territoryId AND t.owner_territory_id <> @territoryId`;
    }
    const rows = db.prepare(`
      SELECT
        t.*,
        owner.name AS owner_territory_name,
        current.name AS current_territory_name,
        l.name AS current_location_name
      FROM trays t
      LEFT JOIN territories owner ON owner.id = t.owner_territory_id
      LEFT JOIN territories current ON current.id = t.current_territory_id
      LEFT JOIN locations l ON l.id = t.current_location_id
      WHERE ${whereClause}
      ORDER BY t.updated_at DESC
    `).all({ territoryId });
    res.json(rows);
  });

  app.post("/api/scan-events", (req, res) => {
    if (!requireFields(res, req.body, ["territoryId", "scanType", "rawValue"])) {
      return;
    }
    const territory = getTerritoryByIdStmt.get(req.body.territoryId);
    if (!territory) {
      fail(res, 404, "Territory not found.");
      return;
    }
    const membership = requireMembership(req, res, req.body.territoryId);
    if (membership.error) {
      return;
    }

    const scanType = String(req.body.scanType || "").toLowerCase();
    if (!["qr", "barcode", "text"].includes(scanType)) {
      fail(res, 400, "scanType must be one of qr, barcode, or text.");
      return;
    }

    const parsedSerial = parseLikelySerial(req.body.rawValue);
    let trayId = req.body.trayId || null;
    if (!trayId && parsedSerial) {
      const detectedTray = db.prepare(`
        SELECT *
        FROM trays
        WHERE serial_code = ?
          AND (current_territory_id = ? OR owner_territory_id = ?)
        LIMIT 1
      `).get(parsedSerial, req.body.territoryId, req.body.territoryId);
      if (detectedTray) {
        trayId = detectedTray.id;
      }
    }

    if (trayId && !getTrayByIdStmt.get(trayId)) {
      fail(res, 404, "Provided trayId does not exist.");
      return;
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO scan_events (
        id, tray_id, territory_id, user_id,
        scan_type, raw_value, parsed_serial, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      trayId,
      req.body.territoryId,
      membership.userId,
      scanType,
      req.body.rawValue,
      parsedSerial,
      nowIso()
    );
    res.status(201).json(db.prepare(`SELECT * FROM scan_events WHERE id = ?`).get(id));
  });

  app.get("/api/territories/:territoryId/scan-events", (req, res) => {
    const territoryId = req.params.territoryId;
    if (!getTerritoryByIdStmt.get(territoryId)) {
      fail(res, 404, "Territory not found.");
      return;
    }
    const membership = requireMembership(req, res, territoryId);
    if (membership.error) {
      return;
    }
    const rows = db.prepare(`
      SELECT
        se.*,
        t.name AS tray_name,
        u.name AS user_name
      FROM scan_events se
      LEFT JOIN trays t ON t.id = se.tray_id
      LEFT JOIN users u ON u.id = se.user_id
      WHERE se.territory_id = ?
      ORDER BY se.created_at DESC
    `).all(territoryId);
    res.json(rows);
  });

  app.get("/api/territories/:territoryId/summary", (req, res) => {
    const territoryId = req.params.territoryId;
    if (!getTerritoryByIdStmt.get(territoryId)) {
      fail(res, 404, "Territory not found.");
      return;
    }
    const membership = requireMembership(req, res, territoryId);
    if (membership.error) {
      return;
    }

    const counts = {
      locations: db.prepare(`SELECT COUNT(*) AS c FROM locations WHERE territory_id = ?`).get(territoryId).c,
      traysHere: db.prepare(`SELECT COUNT(*) AS c FROM trays WHERE current_territory_id = ?`).get(territoryId).c,
      traysOwned: db.prepare(`SELECT COUNT(*) AS c FROM trays WHERE owner_territory_id = ?`).get(territoryId).c,
      loanersBorrowed: db
        .prepare(`
          SELECT COUNT(*) AS c
          FROM trays
          WHERE is_loaner = 1 AND current_territory_id = ? AND owner_territory_id <> ?
        `)
        .get(territoryId, territoryId).c,
      loanersLoanedOut: db
        .prepare(`
          SELECT COUNT(*) AS c
          FROM trays
          WHERE is_loaner = 1 AND owner_territory_id = ? AND current_territory_id <> ?
        `)
        .get(territoryId, territoryId).c,
    };

    res.json(counts);
  });

  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });

  app.locals.db = db;
  return app;
}

module.exports = {
  createApp,
  parseLikelySerial,
};
