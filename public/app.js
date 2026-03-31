const state = {
  users: [],
  territories: [],
  locations: [],
  trays: [],
  transfers: [],
  loaners: [],
  scans: [],
  stream: null,
  barcodeDetector: null,
};

const els = {};

function byId(id) {
  return document.getElementById(id);
}

function showStatus(message, isError = false) {
  els.statusMessage.textContent = message;
  els.statusMessage.style.color = isError ? "#dc2626" : "#0f766e";
}

function getActiveUserId() {
  return els.userSelect.value || null;
}

function getActiveTerritoryId() {
  return els.territorySelect.value || null;
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const activeUserId = getActiveUserId();
  if (activeUserId) {
    headers["x-user-id"] = activeUserId;
  }
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function setSelectOptions(select, rows, { valueKey = "id", label } = {}) {
  const prev = select.value;
  select.innerHTML = "";
  for (const row of rows) {
    const option = document.createElement("option");
    option.value = row[valueKey];
    option.textContent = label ? label(row) : row.name || row[valueKey];
    select.appendChild(option);
  }
  if (prev && rows.some((r) => String(r[valueKey]) === prev)) {
    select.value = prev;
  }
}

function renderSummary(summary) {
  els.summaryCards.innerHTML = "";
  const labels = [
    ["Locations", summary.locations],
    ["Trays here", summary.traysHere],
    ["Trays owned", summary.traysOwned],
    ["Loaners borrowed", summary.loanersBorrowed],
    ["Loaners loaned out", summary.loanersLoanedOut],
  ];
  for (const [label, value] of labels) {
    const card = document.createElement("div");
    card.className = "summary-card";
    card.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    els.summaryCards.appendChild(card);
  }
}

function territoryName(id) {
  const territory = state.territories.find((t) => t.id === id);
  return territory ? territory.name : id;
}

function renderLocations() {
  els.locationList.innerHTML = "";
  for (const location of state.locations) {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <div>
        <strong>${location.name}</strong>
        <div class="muted">${location.address || "No address"}</div>
      </div>
      <button type="button" data-location-edit="${location.id}">Edit</button>
    `;
    els.locationList.appendChild(li);
  }
}

function renderTrays() {
  els.trayList.innerHTML = "";
  for (const tray of state.trays) {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <div>
        <strong>${tray.name}</strong>
        <div class="muted">
          serial: ${tray.serial_code || "n/a"} | status: ${tray.status} | location: ${tray.current_location_name || "unassigned"}
        </div>
        <div class="muted">
          owner: ${tray.owner_territory_name || tray.owner_territory_id} | current: ${tray.current_territory_name || tray.current_territory_id}
          ${tray.is_loaner ? "| loaner" : ""}
        </div>
      </div>
      <button type="button" data-tray-edit="${tray.id}">Edit</button>
    `;
    els.trayList.appendChild(li);
  }
}

function renderMembers(members) {
  els.memberList.innerHTML = "";
  for (const member of members) {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <div>
        <strong>${member.name}</strong>
        <div class="muted">${member.email}</div>
      </div>
      <span class="pill">${member.role}</span>
    `;
    els.memberList.appendChild(li);
  }
}

function renderTransfers() {
  els.transferList.innerHTML = "";
  for (const transfer of state.transfers) {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <div>
        <strong>${transfer.tray_name || transfer.tray_id}</strong>
        <div class="muted">
          ${territoryName(transfer.from_territory_id)} -> ${territoryName(transfer.to_territory_id)} (${transfer.transfer_type})
        </div>
      </div>
      <span class="muted">${new Date(transfer.created_at).toLocaleString()}</span>
    `;
    els.transferList.appendChild(li);
  }
}

function renderLoaners() {
  els.loanerList.innerHTML = "";
  for (const tray of state.loaners) {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <div>
        <strong>${tray.name}</strong>
        <div class="muted">
          owner: ${tray.owner_territory_name || tray.owner_territory_id} | current: ${tray.current_territory_name || tray.current_territory_id}
        </div>
      </div>
      <span class="pill">${tray.loan_state}</span>
    `;
    els.loanerList.appendChild(li);
  }
}

function renderScans() {
  els.scanList.innerHTML = "";
  for (const scan of state.scans) {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <div>
        <strong>${scan.scan_type.toUpperCase()}</strong>
        <div class="muted">${scan.raw_value}</div>
      </div>
      <span class="muted">${scan.parsed_serial || "unparsed"}</span>
    `;
    els.scanList.appendChild(li);
  }
}

async function refreshUsers() {
  state.users = await api("/api/users");
  setSelectOptions(els.userSelect, state.users, {
    label: (u) => `${u.name} (${u.email})`,
  });
  setSelectOptions(els.memberUserId, state.users, {
    label: (u) => `${u.name} (${u.email})`,
  });
}

async function refreshTerritories() {
  const userId = getActiveUserId();
  if (!userId) {
    state.territories = [];
    setSelectOptions(els.territorySelect, []);
    return;
  }
  state.territories = await api(`/api/territories?userId=${encodeURIComponent(userId)}`);
  setSelectOptions(els.territorySelect, state.territories, {
    label: (t) => `${t.name}${t.state_region ? ` (${t.state_region})` : ""}`,
  });
  setSelectOptions(els.trayOwnerTerritory, state.territories);
  setSelectOptions(els.trayCurrentTerritory, state.territories);
  setSelectOptions(
    els.transferToTerritoryId,
    state.territories.filter((t) => t.id !== getActiveTerritoryId())
  );
}

async function refreshTerritoryData() {
  const territoryId = getActiveTerritoryId();
  if (!territoryId) {
    return;
  }
  const [summary, members, locations, trays, transfers, loaners, scans] = await Promise.all([
    api(`/api/territories/${territoryId}/summary`),
    api(`/api/territories/${territoryId}/members`),
    api(`/api/territories/${territoryId}/locations`),
    api(`/api/territories/${territoryId}/trays`),
    api(`/api/territories/${territoryId}/transfers`),
    api(`/api/territories/${territoryId}/loaners?scope=${encodeURIComponent(els.loanerScope.value)}`),
    api(`/api/territories/${territoryId}/scan-events`),
  ]);

  state.locations = locations;
  state.trays = trays;
  state.transfers = transfers;
  state.loaners = loaners;
  state.scans = scans;

  renderSummary(summary);
  renderMembers(members);
  renderLocations();
  renderTrays();
  renderTransfers();
  renderLoaners();
  renderScans();

  setSelectOptions(els.assignLocationId, state.locations);
  setSelectOptions(els.assignTrayId, state.trays);
  setSelectOptions(els.transferTrayId, state.trays);

  const locationsWithOptional = [{ id: "", name: "unassigned" }, ...state.locations];
  setSelectOptions(els.trayCurrentLocation, locationsWithOptional, {
    label: (l) => l.name,
  });
}

async function initializeData() {
  await refreshUsers();
  await refreshTerritories();
  await refreshTerritoryData();
}

function promptLocationEdit(locationId) {
  const location = state.locations.find((l) => l.id === locationId);
  if (!location) {
    return;
  }
  const name = window.prompt("Location name", location.name);
  if (!name) {
    return;
  }
  const address = window.prompt("Location address", location.address || "") ?? location.address;
  const notes = window.prompt("Location notes", location.notes || "") ?? location.notes;
  api(`/api/locations/${locationId}`, {
    method: "PUT",
    body: JSON.stringify({ name, address, notes }),
  })
    .then(async () => {
      await refreshTerritoryData();
      showStatus("Location updated.");
    })
    .catch((error) => showStatus(error.message, true));
}

function promptTrayEdit(trayId) {
  const tray = state.trays.find((t) => t.id === trayId);
  if (!tray) {
    return;
  }
  const name = window.prompt("Tray name", tray.name);
  if (!name) {
    return;
  }
  const serialCode = window.prompt("Serial code", tray.serial_code || "") ?? tray.serial_code;
  const status = window.prompt("Status (available, in_use, maintenance)", tray.status) || tray.status;
  const notes = window.prompt("Notes", tray.notes || "") ?? tray.notes;
  const isLoaner = window.confirm("Mark as loaner? (OK = yes, Cancel = no)");
  api(`/api/trays/${trayId}`, {
    method: "PUT",
    body: JSON.stringify({ name, serialCode, status, notes, isLoaner }),
  })
    .then(async () => {
      await refreshTerritoryData();
      showStatus("Tray updated.");
    })
    .catch((error) => showStatus(error.message, true));
}

async function startCamera() {
  if (state.stream) {
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });
  state.stream = stream;
  els.cameraFeed.srcObject = stream;
  await els.cameraFeed.play();

  if ("BarcodeDetector" in window) {
    const formats = ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a"];
    state.barcodeDetector = new window.BarcodeDetector({ formats });
  }
}

function stopCamera() {
  if (!state.stream) {
    return;
  }
  state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  state.barcodeDetector = null;
  els.cameraFeed.srcObject = null;
}

function drawCurrentFrameToCanvas() {
  const video = els.cameraFeed;
  const canvas = els.scanCanvas;
  if (!video.videoWidth || !video.videoHeight) {
    return false;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return true;
}

async function detectQRCodeFromCanvas() {
  const ctx = els.scanCanvas.getContext("2d");
  const image = ctx.getImageData(0, 0, els.scanCanvas.width, els.scanCanvas.height);
  if (!window.jsQR) {
    return null;
  }
  const result = window.jsQR(image.data, image.width, image.height);
  return result ? result.data : null;
}

async function detectBarcodeFromCanvas() {
  if (state.barcodeDetector) {
    const results = await state.barcodeDetector.detect(els.scanCanvas);
    if (results.length > 0) {
      return results[0].rawValue || null;
    }
  }

  if (!window.Quagga || !window.Quagga.decodeSingle) {
    return null;
  }

  const dataUrl = els.scanCanvas.toDataURL("image/png");
  return new Promise((resolve) => {
    window.Quagga.decodeSingle(
      {
        src: dataUrl,
        numOfWorkers: 0,
        inputStream: { size: 800 },
        decoder: {
          readers: ["code_128_reader", "ean_reader", "ean_8_reader", "upc_reader", "code_39_reader"],
        },
      },
      (result) => {
        resolve(result && result.codeResult ? result.codeResult.code : null);
      }
    );
  });
}

async function detectTextFromCanvas() {
  if (!window.Tesseract) {
    return null;
  }
  const {
    data: { text },
  } = await window.Tesseract.recognize(els.scanCanvas, "eng");
  return (text || "").trim() || null;
}

async function captureAndDetect() {
  if (!state.stream) {
    await startCamera();
  }
  const ok = drawCurrentFrameToCanvas();
  if (!ok) {
    throw new Error("Camera frame unavailable. Wait a moment and try again.");
  }

  const mode = els.scanMode.value;
  let value = null;
  if (mode === "qr") {
    value = await detectQRCodeFromCanvas();
  } else if (mode === "barcode") {
    value = await detectBarcodeFromCanvas();
  } else {
    value = await detectTextFromCanvas();
  }

  if (!value) {
    throw new Error(`No ${mode} value detected from current frame.`);
  }

  els.scanRawValue.value = value;
  showStatus(`Detected ${mode.toUpperCase()} value: ${value}`);
  if (els.autoSubmitScan.checked) {
    await submitScanEvent();
  }
}

async function submitScanEvent() {
  const territoryId = getActiveTerritoryId();
  if (!territoryId) {
    throw new Error("Select a territory before saving scans.");
  }
  const payload = await api("/api/scan-events", {
    method: "POST",
    body: JSON.stringify({
      territoryId,
      scanType: els.scanMode.value,
      rawValue: els.scanRawValue.value,
    }),
  });
  showStatus(`Scan saved. Parsed serial: ${payload.parsed_serial || "none"}`);
  await refreshTerritoryData();
}

function bindEvents() {
  els.userSelect.addEventListener("change", async () => {
    try {
      await refreshTerritories();
      await refreshTerritoryData();
      showStatus("Active user switched.");
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  els.territorySelect.addEventListener("change", async () => {
    try {
      setSelectOptions(
        els.transferToTerritoryId,
        state.territories.filter((t) => t.id !== getActiveTerritoryId())
      );
      await refreshTerritoryData();
      showStatus("Active territory switched.");
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  els.createUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: els.newUserName.value,
          email: els.newUserEmail.value,
        }),
      });
      els.createUserForm.reset();
      await refreshUsers();
      await refreshTerritories();
      await refreshTerritoryData();
      showStatus("User created.");
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  els.createTerritoryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const activeUserId = getActiveUserId();
      if (!activeUserId) {
        throw new Error("Create/select a user first.");
      }
      await api("/api/territories", {
        method: "POST",
        body: JSON.stringify({
          name: els.newTerritoryName.value,
          stateRegion: els.newTerritoryState.value,
          createdByUserId: activeUserId,
        }),
      });
      els.createTerritoryForm.reset();
      await refreshTerritories();
      await refreshTerritoryData();
      showStatus("Territory created.");
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  els.addMemberForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const territoryId = getActiveTerritoryId();
      if (!territoryId) {
        throw new Error("Select a territory first.");
      }
      await api(`/api/territories/${territoryId}/members`, {
        method: "POST",
        body: JSON.stringify({
          userId: els.memberUserId.value,
          role: els.memberRole.value,
        }),
      });
      await refreshTerritoryData();
      showStatus("Collaborator added.");
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  els.createLocationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const territoryId = getActiveTerritoryId();
      if (!territoryId) {
        throw new Error("Select a territory first.");
      }
      await api(`/api/territories/${territoryId}/locations`, {
        method: "POST",
        body: JSON.stringify({
          name: els.locationName.value,
          address: els.locationAddress.value,
          notes: els.locationNotes.value,
        }),
      });
      els.createLocationForm.reset();
      await refreshTerritoryData();
      showStatus("Location created.");
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  els.createTrayForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/trays", {
        method: "POST",
        body: JSON.stringify({
          name: els.trayName.value,
          serialCode: els.traySerial.value || null,
          ownerTerritoryId: els.trayOwnerTerritory.value,
          currentTerritoryId: els.trayCurrentTerritory.value,
          currentLocationId: els.trayCurrentLocation.value || null,
          status: els.trayStatus.value,
          isLoaner: els.trayIsLoaner.checked,
          notes: els.trayNotes.value || null,
        }),
      });
      els.createTrayForm.reset();
      await refreshTerritoryData();
      showStatus("Tray created.");
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  els.assignLocationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const territoryId = getActiveTerritoryId();
      if (!territoryId) {
        throw new Error("Select a territory first.");
      }
      await api(`/api/trays/${els.assignTrayId.value}/assign-location`, {
        method: "POST",
        body: JSON.stringify({
          territoryId,
          locationId: els.assignLocationId.value,
          notes: els.assignNotes.value || null,
        }),
      });
      els.assignNotes.value = "";
      await refreshTerritoryData();
      showStatus("Tray location assigned.");
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  els.transferTrayForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const fromTerritoryId = getActiveTerritoryId();
      if (!fromTerritoryId) {
        throw new Error("Select a territory first.");
      }
      await api(`/api/trays/${els.transferTrayId.value}/transfer`, {
        method: "POST",
        body: JSON.stringify({
          fromTerritoryId,
          toTerritoryId: els.transferToTerritoryId.value,
          toLocationId: els.transferToLocationId.value || null,
          notes: els.transferNotes.value || null,
        }),
      });
      els.transferToLocationId.value = "";
      els.transferNotes.value = "";
      await refreshTerritoryData();
      showStatus("Tray transferred.");
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  els.refreshLoanersButton.addEventListener("click", async () => {
    try {
      await refreshTerritoryData();
      showStatus("Loaners refreshed.");
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  els.loanerScope.addEventListener("change", async () => {
    try {
      await refreshTerritoryData();
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  els.locationList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-location-edit]");
    if (!target) {
      return;
    }
    promptLocationEdit(target.getAttribute("data-location-edit"));
  });

  els.trayList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-tray-edit]");
    if (!target) {
      return;
    }
    promptTrayEdit(target.getAttribute("data-tray-edit"));
  });

  els.startCameraButton.addEventListener("click", async () => {
    try {
      await startCamera();
      showStatus("Camera started.");
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  els.stopCameraButton.addEventListener("click", () => {
    stopCamera();
    showStatus("Camera stopped.");
  });

  els.captureScanButton.addEventListener("click", async () => {
    try {
      await captureAndDetect();
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  els.scanEventForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await submitScanEvent();
    } catch (error) {
      showStatus(error.message, true);
    }
  });
}

function wireElements() {
  [
    "userSelect",
    "createUserForm",
    "newUserName",
    "newUserEmail",
    "territorySelect",
    "createTerritoryForm",
    "newTerritoryName",
    "newTerritoryState",
    "addMemberForm",
    "memberUserId",
    "memberRole",
    "memberList",
    "summaryCards",
    "createLocationForm",
    "locationName",
    "locationAddress",
    "locationNotes",
    "locationList",
    "createTrayForm",
    "trayName",
    "traySerial",
    "trayOwnerTerritory",
    "trayCurrentTerritory",
    "trayCurrentLocation",
    "trayStatus",
    "trayIsLoaner",
    "trayNotes",
    "trayList",
    "assignLocationForm",
    "assignTrayId",
    "assignLocationId",
    "assignNotes",
    "transferTrayForm",
    "transferTrayId",
    "transferToTerritoryId",
    "transferToLocationId",
    "transferNotes",
    "loanerScope",
    "refreshLoanersButton",
    "loanerList",
    "scanMode",
    "startCameraButton",
    "stopCameraButton",
    "captureScanButton",
    "cameraFeed",
    "scanCanvas",
    "scanEventForm",
    "scanRawValue",
    "autoSubmitScan",
    "scanList",
    "transferList",
    "statusMessage",
  ].forEach((id) => {
    els[id] = byId(id);
  });
}

async function main() {
  wireElements();
  bindEvents();
  try {
    await initializeData();
    showStatus("Ready.");
  } catch (error) {
    showStatus(error.message, true);
  }
}

window.addEventListener("beforeunload", () => {
  stopCamera();
});

main();
