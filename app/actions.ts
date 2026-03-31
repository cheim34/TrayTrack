"use server";

import { revalidatePath } from "next/cache";
import { LoanDirection, LoanStatus, LocationType, TrayCondition, TrayStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const territorySchema = z.object({
  name: z.string().trim().min(2),
  region: z.string().trim().min(2),
  coverage: z.string().trim().min(2),
  ownerName: z.string().trim().min(2),
  ownerEmail: z.string().email(),
});

const collaboratorSchema = z.object({
  territoryId: z.string().min(1),
  name: z.string().trim().min(2),
  email: z.string().email(),
  role: z.string().trim().min(2),
});

const locationSchema = z.object({
  territoryId: z.string().min(1),
  locationId: z.string().optional(),
  name: z.string().trim().min(2),
  city: z.string().trim().min(2),
  state: z.string().trim().min(2),
  type: z.nativeEnum(LocationType),
  notes: z.string().optional(),
});

const traySchema = z.object({
  territoryId: z.string().min(1),
  trayId: z.string().optional(),
  name: z.string().trim().min(2),
  trayCode: z.string().trim().min(2),
  serialCode: z.string().optional(),
  barcode: z.string().optional(),
  qrCode: z.string().optional(),
  status: z.nativeEnum(TrayStatus),
  condition: z.nativeEnum(TrayCondition),
  locationId: z.string().optional(),
  isLoaner: z.coerce.boolean().default(false),
  notes: z.string().optional(),
});

const transferSchema = z.object({
  territoryId: z.string().min(1),
  trayId: z.string().min(1),
  toLocationId: z.string().min(1),
  note: z.string().optional(),
});

const loanSchema = z.object({
  territoryId: z.string().min(1),
  trayId: z.string().min(1),
  direction: z.nativeEnum(LoanDirection),
  status: z.nativeEnum(LoanStatus),
  partnerName: z.string().trim().min(2),
  partnerTerritory: z.string().optional(),
  startDate: z.string().min(1),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

function toBoolean(value: FormDataEntryValue | null) {
  return value?.toString() === "true";
}

function toOptionalString(value: FormDataEntryValue | null) {
  const normalized = value?.toString().trim();
  return normalized ? normalized : undefined;
}

function parseForm<T>(schema: z.ZodSchema<T>, formData: FormData) {
  return schema.parse({
    ...Object.fromEntries(formData.entries()),
  });
}

export async function createTerritory(formData: FormData) {
  const parsed = parseForm(territorySchema, formData);

  await prisma.territory.create({
    data: {
      name: parsed.name,
      region: parsed.region,
      coverage: parsed.coverage,
      collaborators: {
        create: {
          name: parsed.ownerName,
          email: parsed.ownerEmail,
          role: "OWNER",
        },
      },
    },
  });

  revalidatePath("/");
}

export async function createCollaborator(formData: FormData) {
  const parsed = parseForm(collaboratorSchema, formData);

  await prisma.collaborator.create({
    data: parsed,
  });

  revalidatePath("/");
}

export async function createLocation(formData: FormData) {
  const parsed = locationSchema.parse({
    ...Object.fromEntries(formData.entries()),
    notes: toOptionalString(formData.get("notes")),
  });

  await prisma.location.create({
    data: parsed,
  });

  revalidatePath("/");
}

export async function updateLocation(formData: FormData) {
  const parsed = locationSchema.parse({
    ...Object.fromEntries(formData.entries()),
    locationId: toOptionalString(formData.get("locationId")),
    notes: toOptionalString(formData.get("notes")),
  });

  await prisma.location.update({
    where: { id: parsed.locationId },
    data: {
      name: parsed.name,
      city: parsed.city,
      state: parsed.state,
      type: parsed.type,
      notes: parsed.notes,
    },
  });

  revalidatePath("/");
}

export async function createTray(formData: FormData) {
  const parsed = traySchema.parse({
    ...Object.fromEntries(formData.entries()),
    serialCode: toOptionalString(formData.get("serialCode")),
    barcode: toOptionalString(formData.get("barcode")),
    qrCode: toOptionalString(formData.get("qrCode")),
    locationId: toOptionalString(formData.get("locationId")),
    isLoaner: toBoolean(formData.get("isLoaner")),
    notes: toOptionalString(formData.get("notes")),
  });

  await prisma.tray.create({
    data: {
      territoryId: parsed.territoryId,
      name: parsed.name,
      trayCode: parsed.trayCode,
      serialCode: parsed.serialCode,
      barcode: parsed.barcode,
      qrCode: parsed.qrCode,
      status: parsed.status,
      condition: parsed.condition,
      locationId: parsed.locationId,
      isLoaner: parsed.isLoaner,
      notes: parsed.notes,
    },
  });

  revalidatePath("/");
}

export async function updateTray(formData: FormData) {
  const parsed = traySchema.parse({
    ...Object.fromEntries(formData.entries()),
    trayId: toOptionalString(formData.get("trayId")),
    serialCode: toOptionalString(formData.get("serialCode")),
    barcode: toOptionalString(formData.get("barcode")),
    qrCode: toOptionalString(formData.get("qrCode")),
    locationId: toOptionalString(formData.get("locationId")),
    isLoaner: toBoolean(formData.get("isLoaner")),
    notes: toOptionalString(formData.get("notes")),
  });

  await prisma.tray.update({
    where: { id: parsed.trayId },
    data: {
      name: parsed.name,
      trayCode: parsed.trayCode,
      serialCode: parsed.serialCode,
      barcode: parsed.barcode,
      qrCode: parsed.qrCode,
      status: parsed.status,
      condition: parsed.condition,
      locationId: parsed.locationId,
      isLoaner: parsed.isLoaner,
      notes: parsed.notes,
    },
  });

  revalidatePath("/");
}

export async function transferTray(formData: FormData) {
  const parsed = transferSchema.parse({
    ...Object.fromEntries(formData.entries()),
    note: toOptionalString(formData.get("note")),
  });

  const tray = await prisma.tray.findUnique({
    where: { id: parsed.trayId },
    select: { locationId: true },
  });

  await prisma.$transaction([
    prisma.transferEvent.create({
      data: {
        territoryId: parsed.territoryId,
        trayId: parsed.trayId,
        fromLocationId: tray?.locationId ?? null,
        toLocationId: parsed.toLocationId,
        note: parsed.note,
      },
    }),
    prisma.tray.update({
      where: { id: parsed.trayId },
      data: {
        locationId: parsed.toLocationId,
      },
    }),
  ]);

  revalidatePath("/");
}

export async function upsertLoan(formData: FormData) {
  const parsed = loanSchema.parse({
    ...Object.fromEntries(formData.entries()),
    partnerTerritory: toOptionalString(formData.get("partnerTerritory")),
    dueDate: toOptionalString(formData.get("dueDate")),
    notes: toOptionalString(formData.get("notes")),
  });

  await prisma.$transaction(async (tx) => {
    await tx.loanEvent.upsert({
      where: { trayId: parsed.trayId },
      update: {
        direction: parsed.direction,
        status: parsed.status,
        partnerName: parsed.partnerName,
        partnerTerritory: parsed.partnerTerritory,
        startDate: new Date(parsed.startDate),
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
        notes: parsed.notes,
      },
      create: {
        territoryId: parsed.territoryId,
        trayId: parsed.trayId,
        direction: parsed.direction,
        status: parsed.status,
        partnerName: parsed.partnerName,
        partnerTerritory: parsed.partnerTerritory,
        startDate: new Date(parsed.startDate),
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
        notes: parsed.notes,
      },
    });

    await tx.tray.update({
      where: { id: parsed.trayId },
      data: {
        isLoaner: true,
        status:
          parsed.status === LoanStatus.RETURNED
            ? TrayStatus.AVAILABLE
            : parsed.direction === LoanDirection.INTERNAL
              ? TrayStatus.BORROWED_IN
              : TrayStatus.LOANED_OUT,
      },
    });
  });

  revalidatePath("/");
}
