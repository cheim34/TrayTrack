import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const payloadSchema = z.object({
  territoryId: z.string().min(1),
  trayTag: z.string().min(1),
  serialCode: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = payloadSchema.parse(json);

    const territory = await prisma.territory.findUnique({
      where: { id: payload.territoryId },
      select: { id: true },
    });

    if (!territory) {
      return NextResponse.json({ error: "Territory not found." }, { status: 404 });
    }

    const normalizedTrayCode = payload.trayTag.trim();
    const serialCode = payload.serialCode?.trim() || null;
    const notes = payload.notes?.trim() || null;

    const existingTray = await prisma.tray.findUnique({
      where: {
        territoryId_trayCode: {
          territoryId: territory.id,
          trayCode: normalizedTrayCode,
        },
      },
      select: { id: true },
    });

    const tray = existingTray
      ? await prisma.tray.update({
          where: { id: existingTray.id },
          data: {
            serialCode: serialCode ?? undefined,
            qrCode: normalizedTrayCode,
            notes: notes ?? undefined,
          },
          select: {
            name: true,
          },
        })
      : await prisma.tray.create({
          data: {
            territoryId: territory.id,
            name: `Scanned Tray ${normalizedTrayCode}`,
            trayCode: normalizedTrayCode,
            serialCode,
            qrCode: normalizedTrayCode,
            notes,
          },
          select: {
            name: true,
          },
        });

    revalidatePath("/");
    return NextResponse.json({ trayName: tray.name });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to save scan intake." }, { status: 500 });
  }
}
