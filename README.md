# TrayTrack

TrayTrack is a collaborative territory operations app for medical device sales teams to manage instrument trays, current locations, transfers, loaners, and scan-based tray intake.

## MVP features

- Create and edit territories
- Invite collaborators to a territory workspace
- Create, edit, and assign trays to a location
- Create and edit locations such as hospitals, ASCs, rep homes, depots, and field inventory
- Transfer trays between locations with a complete movement history
- Track loaner trays within a territory and across territory boundaries
- Capture tray metadata with:
  - QR code scanning
  - Barcode scanning
  - OCR serial/text capture from the tray side using the phone camera

## Tech stack

- Next.js App Router
- Prisma ORM
- SQLite for local development
- Browser camera APIs for scanning
- Tesseract.js for OCR

## Getting started

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

Open http://localhost:3000

## Product model

TrayTrack is organized around territories.

- A territory has many collaborators
- A territory has many locations
- A territory has many trays
- Trays can be moved between locations
- Trays can be marked as loaners
- Loaners can be tracked as internal territory borrows or external cross-territory loans

The first MVP stores collaboration as shared territory membership and records all transfer and loan events in the database. This provides the core collaborative workflow while keeping the project ready for a later auth provider or real-time layer.
