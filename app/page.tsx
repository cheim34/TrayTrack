import { format } from "date-fns";

import {
  createCollaborator,
  createLocation,
  createTerritory,
  createTray,
  transferTray,
  updateLocation,
  updateTray,
  upsertLoan,
} from "./actions";
import { ScannerPanel } from "@/components/scanner-panel";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import {
  loanDirections,
  loanStatuses,
  locationTypes,
  type LoanDirection,
  type LoanStatus,
  type LocationType,
  type TrayCondition,
  trayConditions,
  trayStatuses,
  type TrayStatus,
} from "@/lib/types";

export const dynamic = "force-dynamic";

function getLocationTypeLabel(type: LocationType) {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusTone(status: TrayStatus | LoanStatus) {
  switch (status) {
    case "AVAILABLE":
    case "RETURNED":
      return "success";
    case "AT_CASE":
    case "ACTIVE":
      return "info";
    case "LOANED_OUT":
    case "BORROWED_IN":
      return "warning";
    case "OVERDUE":
    case "LOST":
      return "danger";
    default:
      return "neutral";
  }
}

export default async function HomePage() {
  const territories = await prisma.territory.findMany({
    include: {
      collaborators: {
        orderBy: {
          createdAt: "asc",
        },
      },
      locations: {
        orderBy: {
          createdAt: "asc",
        },
      },
      trays: {
        include: {
          location: true,
          loan: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
      },
      transfers: {
        include: {
          tray: true,
          fromLocation: true,
          toLocation: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 8,
      },
      loans: {
        include: {
          tray: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const totalTrays = territories.reduce((sum, territory) => sum + territory.trays.length, 0);
  const activeLoans = territories.reduce(
    (sum, territory) => sum + territory.loans.filter((loan) => loan.status === "ACTIVE").length,
    0,
  );
  const transferEvents = territories.reduce((sum, territory) => sum + territory.transfers.length, 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Collaborative territory operations"
        title="TrayTrack"
        description="Manage instrument trays, collaborate across territory teammates, track transfers and loaners, and capture tray identity with QR, barcode, and OCR scanning from a phone camera."
      />

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Territories" value={territories.length.toString()} helper="Shared workspaces for each geography" />
        <StatCard label="Tracked trays" value={totalTrays.toString()} helper="Includes local and loaner inventory" />
        <StatCard label="Active loans" value={activeLoans.toString()} helper="Internal borrows and cross-territory loans" />
        <StatCard label="Transfer history" value={transferEvents.toString()} helper="Permanent chain of custody" />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <SectionTitle
            title="Create territory workspace"
            description="Spin up a workspace for a sales territory and designate the primary coordinator."
          />
          <form action={createTerritory} className="grid gap-4 md:grid-cols-2">
            <label className="field">
              Territory name
              <input name="name" required placeholder="Midwest Spine" />
            </label>
            <label className="field">
              Region
              <input name="region" required placeholder="Central" />
            </label>
            <label className="field md:col-span-2">
              Coverage summary
              <input
                name="coverage"
                required
                placeholder="Chicago, Milwaukee, Madison, and surrounding ASCs"
              />
            </label>
            <label className="field">
              Coordinator name
              <input name="ownerName" required placeholder="Jamie Rep" />
            </label>
            <label className="field">
              Coordinator email
              <input name="ownerEmail" type="email" required placeholder="jamie@traytrack.dev" />
            </label>
            <button type="submit" className="button-primary md:col-span-2">
              Create territory
            </button>
          </form>
        </Card>

        <ScannerPanel territories={territories.map((territory) => ({ id: territory.id, name: territory.name }))} />
      </section>

      {territories.length === 0 ? (
        <EmptyState
          title="No territories yet"
          description="Create your first territory workspace to start tracking trays, locations, and collaborative handoffs."
        />
      ) : (
        <div className="grid gap-8">
          {territories.map((territory) => {
            const availableCount = territory.trays.filter((tray) => tray.status === "AVAILABLE").length;
            const missingLocationCount = territory.trays.filter((tray) => !tray.locationId).length;

            return (
              <section key={territory.id} className="grid gap-6">
                <Card className="space-y-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-semibold text-slate-950">{territory.name}</h2>
                        <Badge tone="info">{territory.region}</Badge>
                      </div>
                      <p className="max-w-3xl text-sm text-slate-600">{territory.coverage}</p>
                    </div>
                    <div className="grid min-w-[280px] gap-3 sm:grid-cols-3">
                      <StatCard label="Collaborators" value={territory.collaborators.length.toString()} />
                      <StatCard label="Available trays" value={availableCount.toString()} />
                      <StatCard label="Needs assignment" value={missingLocationCount.toString()} />
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-3">
                    <Card className="bg-slate-50/80">
                      <SectionTitle
                        title="Collaborators"
                        description="Everyone assigned to this territory can work from the same tray map."
                      />
                      <div className="space-y-3">
                        {territory.collaborators.map((collaborator) => (
                          <div key={collaborator.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="font-medium text-slate-900">{collaborator.name}</p>
                                <p className="text-sm text-slate-500">{collaborator.email}</p>
                              </div>
                              <Badge>{collaborator.role}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                      <form action={createCollaborator} className="mt-4 grid gap-3">
                        <input type="hidden" name="territoryId" value={territory.id} />
                        <label className="field">
                          Add teammate
                          <input name="name" required placeholder="Rep or logistics user" />
                        </label>
                        <label className="field">
                          Email
                          <input name="email" type="email" required placeholder="teammate@traytrack.dev" />
                        </label>
                        <label className="field">
                          Role
                          <select name="role" defaultValue="REP">
                            <option value="REP">Rep</option>
                            <option value="MANAGER">Manager</option>
                            <option value="OPERATIONS">Operations</option>
                            <option value="ADMIN">Admin</option>
                          </select>
                        </label>
                        <button type="submit" className="button-secondary">
                          Add collaborator
                        </button>
                      </form>
                    </Card>

                    <Card className="bg-slate-50/80">
                      <SectionTitle
                        title="Locations"
                        description="Hospitals, ASCs, homes, depots, and sterile processing sites for this territory."
                      />
                      <div className="space-y-3">
                        {territory.locations.length === 0 ? (
                          <p className="text-sm text-slate-500">No locations yet.</p>
                        ) : (
                          territory.locations.map((location) => (
                            <details
                              key={location.id}
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                            >
                              <summary className="cursor-pointer list-none">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="font-medium text-slate-900">{location.name}</p>
                                    <p className="text-sm text-slate-500">{location.city}, {location.state}</p>
                                  </div>
                                  <Badge>{getLocationTypeLabel(location.type as LocationType)}</Badge>
                                </div>
                              </summary>
                              <form action={updateLocation} className="mt-4 grid gap-3">
                                <input type="hidden" name="territoryId" value={territory.id} />
                                <input type="hidden" name="locationId" value={location.id} />
                                <label className="field">
                                  Name
                                  <input name="name" defaultValue={location.name} required />
                                </label>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <label className="field">
                                    City
                                    <input name="city" defaultValue={location.city} required />
                                  </label>
                                  <label className="field">
                                    State
                                    <input name="state" defaultValue={location.state} required />
                                  </label>
                                </div>
                                <label className="field">
                                  Location type
                                  <select name="type" defaultValue={location.type}>
                                    {locationTypes.map((type) => (
                                      <option key={type} value={type}>
                                        {getLocationTypeLabel(type)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="field">
                                  Notes
                                  <textarea name="notes" defaultValue={location.notes ?? ""} rows={3} />
                                </label>
                                <button type="submit" className="button-secondary">
                                  Save location
                                </button>
                              </form>
                            </details>
                          ))
                        )}
                      </div>

                      <form action={createLocation} className="mt-4 grid gap-3">
                        <input type="hidden" name="territoryId" value={territory.id} />
                        <label className="field">
                          New location
                          <input name="name" required placeholder="St. Mary Hospital" />
                        </label>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="field">
                            City
                            <input name="city" required placeholder="Denver" />
                          </label>
                          <label className="field">
                            State
                            <input name="state" required placeholder="CO" />
                          </label>
                        </div>
                        <label className="field">
                          Location type
                          <select name="type" defaultValue="HOSPITAL">
                            {locationTypes.map((type) => (
                              <option key={type} value={type}>
                                {getLocationTypeLabel(type)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          Notes
                          <textarea
                            name="notes"
                            rows={3}
                            placeholder="OR manager, SPD dock info, or access instructions"
                          />
                        </label>
                        <button type="submit" className="button-secondary">
                          Add location
                        </button>
                      </form>
                    </Card>

                    <Card className="bg-slate-50/80">
                      <SectionTitle
                        title="Transfers"
                        description="Move a tray between locations and maintain a movement history."
                      />
                      <form action={transferTray} className="grid gap-3">
                        <input type="hidden" name="territoryId" value={territory.id} />
                        <label className="field">
                          Tray
                          <select name="trayId" required defaultValue="">
                            <option value="" disabled>
                              Select tray
                            </option>
                            {territory.trays.map((tray) => (
                              <option key={tray.id} value={tray.id}>
                                {tray.name} ({tray.serialCode || tray.trayCode})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          Destination
                          <select name="toLocationId" required defaultValue="">
                            <option value="" disabled>
                              Select location
                            </option>
                            {territory.locations.map((location) => (
                              <option key={location.id} value={location.id}>
                                {location.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          Transfer note
                          <textarea
                            name="note"
                            rows={3}
                            placeholder="Set, surgeon, or courier details"
                          />
                        </label>
                        <button type="submit" className="button-secondary">
                          Transfer tray
                        </button>
                      </form>

                      <div className="mt-4 space-y-3">
                        {territory.transfers.length === 0 ? (
                          <p className="text-sm text-slate-500">No transfer history yet.</p>
                        ) : (
                          territory.transfers.map((transfer) => (
                            <div key={transfer.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <p className="font-medium text-slate-900">{transfer.tray.name}</p>
                                  <p className="text-sm text-slate-500">
                                    {transfer.fromLocation?.name ?? "Unassigned"} to {transfer.toLocation.name}
                                  </p>
                                </div>
                                <p className="text-sm text-slate-500">
                                  {format(transfer.createdAt, "MMM d, yyyy h:mm a")}
                                </p>
                              </div>
                              {transfer.note ? <p className="mt-2 text-sm text-slate-600">{transfer.note}</p> : null}
                            </div>
                          ))
                        )}
                      </div>
                    </Card>
                  </div>
                </Card>

                <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
                  <Card>
                    <SectionTitle
                      title="Trays"
                      description="Each tray stores assignment, status, condition, scanning identifiers, and loaner state."
                    />
                    <div className="space-y-4">
                      {territory.trays.length === 0 ? (
                        <EmptyState
                          title="No trays yet"
                          description="Create a tray below and use the scan station to capture a serial, barcode, or QR code."
                        />
                      ) : (
                        territory.trays.map((tray) => (
                          <details
                            key={tray.id}
                            className="rounded-3xl border border-slate-200 bg-slate-50/70 px-5 py-4"
                          >
                            <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-lg font-semibold text-slate-950">{tray.name}</h3>
                                  <Badge tone={getStatusTone(tray.status as TrayStatus)}>
                                    {tray.status.replaceAll("_", " ")}
                                  </Badge>
                                  {tray.isLoaner ? <Badge tone="warning">Loaner</Badge> : null}
                                </div>
                                <p className="text-sm text-slate-600">
                                  {tray.location?.name ?? "Unassigned"} • {tray.serialCode || "No serial yet"} •{" "}
                                  {tray.barcode || "No barcode yet"}
                                </p>
                              </div>
                              <div className="text-right text-sm text-slate-500">
                                <p>{tray.trayCode}</p>
                                <p>{tray.condition.replaceAll("_", " ")}</p>
                              </div>
                            </summary>

                            <form action={updateTray} className="mt-5 grid gap-4">
                              <input type="hidden" name="territoryId" value={territory.id} />
                              <input type="hidden" name="trayId" value={tray.id} />
                              <div className="grid gap-4 md:grid-cols-2">
                                <label className="field">
                                  Tray name
                                  <input name="name" defaultValue={tray.name} required />
                                </label>
                                <label className="field">
                                  Tray code
                                  <input name="trayCode" defaultValue={tray.trayCode} required />
                                </label>
                              </div>
                              <div className="grid gap-4 md:grid-cols-3">
                                <label className="field">
                                  Serial code
                                  <input name="serialCode" defaultValue={tray.serialCode ?? ""} />
                                </label>
                                <label className="field">
                                  Barcode
                                  <input name="barcode" defaultValue={tray.barcode ?? ""} />
                                </label>
                                <label className="field">
                                  QR code
                                  <input name="qrCode" defaultValue={tray.qrCode ?? ""} />
                                </label>
                              </div>
                              <div className="grid gap-4 md:grid-cols-4">
                                <label className="field">
                                  Status
                                  <select name="status" defaultValue={tray.status}>
                                    {trayStatuses.map((status) => (
                                      <option key={status} value={status}>
                                        {status.replaceAll("_", " ")}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="field">
                                  Condition
                                  <select name="condition" defaultValue={tray.condition}>
                                    {trayConditions.map((condition) => (
                                      <option key={condition} value={condition}>
                                        {condition.replaceAll("_", " ")}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="field">
                                  Current location
                                  <select name="locationId" defaultValue={tray.locationId ?? ""}>
                                    <option value="">Unassigned</option>
                                    {territory.locations.map((location) => (
                                      <option key={location.id} value={location.id}>
                                        {location.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="field">
                                  Loaner tray
                                  <select name="isLoaner" defaultValue={tray.isLoaner ? "true" : "false"}>
                                    <option value="false">No</option>
                                    <option value="true">Yes</option>
                                  </select>
                                </label>
                              </div>
                              <label className="field">
                                Tray notes
                                <textarea name="notes" defaultValue={tray.notes ?? ""} rows={3} />
                              </label>
                              <button type="submit" className="button-secondary">
                                Save tray
                              </button>
                            </form>
                          </details>
                        ))
                      )}
                    </div>

                    <form action={createTray} className="mt-6 grid gap-4 border-t border-slate-200 pt-6">
                      <input type="hidden" name="territoryId" value={territory.id} />
                      <SectionTitle
                        title="Add tray"
                        description="Create a tray manually, then use the scan station to capture barcode, QR, or OCR text into these fields."
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="field">
                          Tray name
                          <input name="name" required placeholder="Primary Knee Set 01" />
                        </label>
                        <label className="field">
                          Tray code
                          <input name="trayCode" required placeholder="KNEE-01" />
                        </label>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <label className="field">
                          Serial code
                          <input name="serialCode" placeholder="SN-2026-1002" />
                        </label>
                        <label className="field">
                          Barcode
                          <input name="barcode" placeholder="012345678905" />
                        </label>
                        <label className="field">
                          QR code
                          <input name="qrCode" placeholder="TRAYTRACK:KNEE-01" />
                        </label>
                      </div>
                      <div className="grid gap-4 md:grid-cols-4">
                        <label className="field">
                          Status
                          <select name="status" defaultValue="AVAILABLE">
                            {trayStatuses.map((status) => (
                              <option key={status} value={status}>
                                {status.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          Condition
                          <select name="condition" defaultValue="READY">
                            {trayConditions.map((condition) => (
                              <option key={condition} value={condition}>
                                {condition.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          Initial location
                          <select name="locationId" defaultValue="">
                            <option value="">Unassigned</option>
                            {territory.locations.map((location) => (
                              <option key={location.id} value={location.id}>
                                {location.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          Loaner tray
                          <select name="isLoaner" defaultValue="false">
                            <option value="false">No</option>
                            <option value="true">Yes</option>
                          </select>
                        </label>
                      </div>
                      <label className="field">
                        Notes
                        <textarea
                          name="notes"
                          rows={3}
                          placeholder="Set contents, service notes, or territory handling details"
                        />
                      </label>
                      <button type="submit" className="button-primary">
                        Create tray
                      </button>
                    </form>
                  </Card>

                  <Card>
                    <SectionTitle
                      title="Loaners"
                      description="Track trays that are borrowed inside the territory or loaned across territory boundaries."
                    />
                    <div className="space-y-4">
                      {territory.loans.length === 0 ? (
                        <p className="text-sm text-slate-500">No active or historical loaners yet.</p>
                      ) : (
                        territory.loans.map((loan) => (
                          <div key={loan.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className="font-semibold text-slate-900">{loan.tray.name}</h3>
                              <div className="flex gap-2">
                                <Badge tone={getStatusTone(loan.status as LoanStatus)}>
                                  {loan.status.replaceAll("_", " ")}
                                </Badge>
                                <Badge>
                                  {loan.direction.replaceAll("_", " ")}
                                </Badge>
                              </div>
                            </div>
                            <p className="mt-2 text-sm text-slate-600">
                              {loan.partnerName} {loan.partnerTerritory ? `• ${loan.partnerTerritory}` : ""}
                            </p>
                            <p className="text-xs text-slate-500">
                              Started {format(loan.startDate, "MMM d, yyyy")}
                              {loan.dueDate ? ` • Due ${format(loan.dueDate, "MMM d, yyyy")}` : ""}
                            </p>
                            {loan.notes ? <p className="mt-2 text-sm text-slate-600">{loan.notes}</p> : null}
                          </div>
                        ))
                      )}
                    </div>

                    <form action={upsertLoan} className="mt-6 grid gap-3 border-t border-slate-200 pt-6">
                      <input type="hidden" name="territoryId" value={territory.id} />
                      <SectionTitle
                        title="Create or update loan"
                        description="Attach a loan workflow to any tray in this territory."
                      />
                      <label className="field">
                        Tray
                        <select name="trayId" required defaultValue="">
                          <option value="" disabled>
                            Select tray
                          </option>
                          {territory.trays.map((tray) => (
                            <option key={tray.id} value={tray.id}>
                              {tray.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="field">
                          Loan direction
                          <select name="direction" defaultValue="INTERNAL">
                            {loanDirections.map((direction) => (
                              <option key={direction} value={direction}>
                                {direction.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          Status
                          <select name="status" defaultValue="ACTIVE">
                            {loanStatuses.map((status) => (
                              <option key={status} value={status}>
                                {status.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="field">
                        Partner name
                        <input
                          name="partnerName"
                          required
                          placeholder="Borrowing rep, territory, hospital, or depot"
                        />
                      </label>
                      <label className="field">
                        Partner territory
                        <input name="partnerTerritory" placeholder="Texas Gulf Coast" />
                      </label>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="field">
                          Start date
                          <input name="startDate" type="date" required />
                        </label>
                        <label className="field">
                          Due date
                          <input name="dueDate" type="date" />
                        </label>
                      </div>
                      <label className="field">
                        Notes
                        <textarea name="notes" rows={3} placeholder="Case, courier, or territory handoff notes" />
                      </label>
                      <button type="submit" className="button-primary">
                        Save loan status
                      </button>
                    </form>
                  </Card>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
