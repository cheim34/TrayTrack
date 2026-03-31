# TrayTrack

TrayTrack is a collaborative territory-based instrument tray management app for medical device sales teams.
It supports tray/location CRUD, transfers across locations and territories, loaner tray tracking, and mobile-friendly
camera scanning for QR, barcodes, and OCR text (serial markings on trays).

## MVP Capabilities

- Multi-user collaboration with territory membership and roles (`owner`, `admin`, `member`)
- Territory-specific dashboards and counts
- Create/edit locations inside a territory
- Create/edit trays with ownership and current territory/location assignment
- Assign trays to locations in-territory
- Transfer trays between territories
- Loaner workflows:
  - Borrowed within territory
  - Loaned to another territory
  - Returned to owner territory
- Scan events:
  - QR code scanning
  - Barcode scanning
  - OCR text capture for serial strings
- Scan event history by territory

## Tech Stack

- Backend: Node.js + Express
- Database: SQLite (`better-sqlite3`)
- Frontend: Vanilla HTML/CSS/JS
- Client scanning libraries:
  - Native `BarcodeDetector` when available
  - `jsQR` fallback for QR
  - `Quagga2` fallback for barcodes
  - `Tesseract.js` for OCR text serial capture

## Run Locally

```bash
npm install
npm run dev
```

Open: `http://localhost:3000`

## API Highlights

- `POST /api/users`
- `POST /api/territories`
- `POST /api/territories/:territoryId/members`
- `POST /api/territories/:territoryId/locations`
- `PUT /api/locations/:locationId`
- `POST /api/trays`
- `PUT /api/trays/:trayId`
- `POST /api/trays/:trayId/assign-location`
- `POST /api/trays/:trayId/transfer`
- `GET /api/territories/:territoryId/loaners?scope=all|owned|borrowed`
- `POST /api/scan-events`

All protected operations require an acting user via header:

`x-user-id: <user-id>`

## Testing

```bash
npm test
```
