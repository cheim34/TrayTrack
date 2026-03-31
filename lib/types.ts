export const locationTypes = [
  "HOSPITAL",
  "ASC",
  "REP_HOME",
  "WAREHOUSE",
  "STERILE_PROCESSING",
  "IN_TRANSIT",
  "OTHER",
] as const;

export const trayStatuses = [
  "AVAILABLE",
  "AT_CASE",
  "CLEANING",
  "LOANED_OUT",
  "BORROWED_IN",
  "MAINTENANCE",
  "LOST",
] as const;

export const trayConditions = [
  "READY",
  "MISSING_ITEMS",
  "IN_REPAIR",
  "QUARANTINED",
] as const;

export const collaboratorRoles = ["REP", "MANAGER", "OPERATIONS", "ADMIN"] as const;

export const loanDirections = ["INTERNAL", "EXTERNAL_IN", "EXTERNAL_OUT"] as const;

export const loanStatuses = ["ACTIVE", "RETURNED", "OVERDUE"] as const;

export type LocationType = (typeof locationTypes)[number];
export type TrayStatus = (typeof trayStatuses)[number];
export type TrayCondition = (typeof trayConditions)[number];
export type CollaboratorRole = (typeof collaboratorRoles)[number];
export type LoanDirection = (typeof loanDirections)[number];
export type LoanStatus = (typeof loanStatuses)[number];
