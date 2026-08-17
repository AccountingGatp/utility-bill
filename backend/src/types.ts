export type FileField = {
  key: string;
  label: string;
  accept: string;
  required: boolean;
  multiple?: boolean;
  hint?: string;
};

export type PropertyConfig = {
  id: string;
  name: string;
  utilities: string;
  method: string;
  fields: FileField[];
};

export type UploadedFile = {
  field: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
};

export type RunOptions = {
  increasePercent?: number;
  recaptureRate?: number;
};

export type OccupantRow = {
  unit: string;
  resident: string;
  sqft: number;
  occupants: number;
  leaseStart: Date | null;
  leaseEnd: Date | null;
};

export type RentRollRow = {
  unit: string;
  type: string;
  sqft: number;
  resident: string;
  status: string;
  account: string;
  moveIn: Date | null;
  leaseStart: Date | null;
  leaseEnd: Date | null;
  moveOut: Date | null;
};

export type PreviousCharge = {
  unit: string;
  resident: string;
  account: string;
  water: number;
  sewer: number;
  waterBase: number;
  sewerBase: number;
  cap: number;
  electric: number;
  gas: number;
  total: number;
  occupants: number;
  combinedIncludesBases?: boolean;
  moveIn?: Date | null;
};

export type SawsBill = {
  total: number;
  days: number;
  start: Date | null;
  end: Date | null;
  gallons: number | null;
  account: string;
  rawText: string;
};

export type RosterUnit = {
  unit: string;
  displayUnit: string;
  resident: string;
  type: string;
  sqft: number;
  occupants: number;
  status: string;
  account: string;
  moveIn: Date | null;
  leaseStart: Date | null;
  leaseEnd: Date | null;
  moveOut: Date | null;
};

export type OutputFile = {
  filename: string;
  contentType: string;
  buffer: Buffer;
};

export type ProcessResult = {
  files: OutputFile[];
  zipName: string;
  summary: Record<string, string | number>;
};
