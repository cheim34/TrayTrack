import {
  LoanDirection,
  LoanStatus,
  LocationType,
  TrayCondition,
  TrayStatus,
} from "../generated/prisma/client.ts";

import { prisma } from "../lib/prisma";

async function main() {
  await prisma.loanEvent.deleteMany();
  await prisma.transferEvent.deleteMany();
  await prisma.tray.deleteMany();
  await prisma.location.deleteMany();
  await prisma.collaborator.deleteMany();
  await prisma.territory.deleteMany();

  const territory = await prisma.territory.create({
    data: {
      name: "Chicago North",
      region: "Midwest",
      coverage: "North suburbs, downtown accounts, and regional ASC coverage",
      collaborators: {
        create: [
          {
            name: "Alex Morgan",
            email: "alex@traytrack.local",
            role: "MANAGER",
          },
          {
            name: "Jordan Lee",
            email: "jordan@traytrack.local",
            role: "REP",
          },
        ],
      },
      locations: {
        create: [
          {
            name: "North Shore Hospital",
            type: LocationType.HOSPITAL,
            city: "Evanston",
            state: "IL",
            notes: "Main total joint account",
          },
          {
            name: "Field Depot - Alex",
            type: LocationType.WAREHOUSE,
            city: "Glenview",
            state: "IL",
            notes: "Rep-held backup trays",
          },
          {
            name: "Sterile Processing",
            type: LocationType.STERILE_PROCESSING,
            city: "Chicago",
            state: "IL",
            notes: "Cleaning and turnaround queue",
          },
        ],
      },
    },
    include: {
      locations: true,
    },
  });

  const hospital = territory.locations.find((location) => location.name === "North Shore Hospital");
  const depot = territory.locations.find((location) => location.name === "Field Depot - Alex");

  const primaryTray = await prisma.tray.create({
    data: {
      territoryId: territory.id,
      locationId: hospital?.id,
      name: "Primary Total Knee Tray",
      trayCode: "TT-1001",
      serialCode: "SN-KNEE-4412",
      notes: "Standard total knee instrument tray",
      status: TrayStatus.AT_CASE,
      condition: TrayCondition.READY,
      isLoaner: false,
      qrCode: "QR-TT-1001",
      barcode: "0123456789012",
    },
  });

  const loanerTray = await prisma.tray.create({
    data: {
      territoryId: territory.id,
      locationId: depot?.id,
      name: "Revision Loaner Tray",
      trayCode: "TT-2007",
      serialCode: "SN-REV-1290",
      notes: "Revision instruments held as cross-territory loaner",
      status: TrayStatus.LOANED_OUT,
      condition: TrayCondition.READY,
      isLoaner: true,
    },
  });

  await prisma.transferEvent.create({
    data: {
      territoryId: territory.id,
      trayId: primaryTray.id,
      fromLocationId: depot?.id,
      toLocationId: hospital?.id,
      note: "Moved for scheduled orthopedic block",
    },
  });

  await prisma.loanEvent.create({
    data: {
      territoryId: territory.id,
      trayId: loanerTray.id,
      direction: LoanDirection.EXTERNAL_OUT,
      partnerName: "Denver West Territory",
      partnerTerritory: "Denver West",
      status: LoanStatus.ACTIVE,
      startDate: new Date(),
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      notes: "Requested for revision backup set",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
