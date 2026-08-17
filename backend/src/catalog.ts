import type { PropertyConfig } from "./types.js";

const SHEETS = ".xlsx,.xls,.csv";
const PDF = ".pdf";
const SHEETS_OR_PDF = ".xlsx,.xls,.csv,.pdf";

const PREVIOUS_HINT =
  "Last cycle billing workbook from the property folder. Do not use Import or Utility Billing August — those are outputs.";

export const PROPERTIES: PropertyConfig[] = [
  {
    id: "green-oaks",
    name: "Green Oaks at Medical",
    utilities: "Water, Sewer",
    method: "Previous-month anchor + size caps ($60 1BR / $120 2–3BR)",
    fields: [
      { key: "occupantCount", label: "Occupant Count", accept: SHEETS, required: true },
      { key: "rentRoll", label: "Rent Roll", accept: SHEETS, required: true },
      {
        key: "sawsBill",
        label: "SAWS water/sewer bill",
        accept: PDF,
        required: true,
        multiple: true,
        hint: "Upload every SAWS PDF for this cycle. Totals are summed.",
      },
      {
        key: "previousBilling",
        label: "Previous month billing file",
        accept: SHEETS,
        required: true,
        hint: PREVIOUS_HINT,
      },
    ],
  },
  {
    id: "istana",
    name: "Istana at Wurzbach",
    utilities: "Water, Sewer",
    method: "95% recapture of domestic SAWS; irrigation absorbed by property",
    fields: [
      { key: "occupantCount", label: "Occupant Count", accept: SHEETS_OR_PDF, required: true },
      { key: "rentRoll", label: "Rent Roll", accept: SHEETS, required: true },
      { key: "sawsDomestic", label: "SAWS domestic bill", accept: PDF, required: true },
      {
        key: "sawsIrrigation",
        label: "SAWS irrigation bill",
        accept: PDF,
        required: false,
        hint: "Optional. Property absorbs this; used in the summary only.",
      },
      {
        key: "previousBilling",
        label: "Previous month billing file",
        accept: SHEETS,
        required: true,
        hint: PREVIOUS_HINT,
      },
    ],
  },
  {
    id: "university-cove",
    name: "University Cove",
    utilities: "Water, Sewer",
    method: "Scale last month at 95% recapture",
    fields: [
      { key: "occupantCount", label: "Occupant Count", accept: SHEETS, required: true },
      { key: "rentRoll", label: "Rent Roll", accept: SHEETS, required: true },
      {
        key: "sawsBill",
        label: "SAWS water/sewer bill",
        accept: PDF,
        required: true,
        multiple: true,
        hint: "Upload every SAWS PDF for this cycle. Totals are summed.",
      },
      {
        key: "previousBilling",
        label: "Previous month billing file",
        accept: SHEETS,
        required: true,
        hint: PREVIOUS_HINT,
      },
    ],
  },
  {
    id: "valencia",
    name: "Valencia at Medical",
    utilities: "Water, Sewer",
    method: "65% recapture with $50 1BR / $80 2BR / $120 3BR caps",
    fields: [
      { key: "occupantCount", label: "Occupant Count", accept: SHEETS, required: true },
      { key: "rentRoll", label: "Rent Roll", accept: SHEETS, required: true },
      {
        key: "sawsBill",
        label: "SAWS water/sewer bill(s)",
        accept: PDF,
        required: true,
        multiple: true,
        hint: "Upload every SAWS PDF for this cycle. Totals are summed.",
      },
      {
        key: "previousBilling",
        label: "Previous month billing file",
        accept: SHEETS,
        required: true,
        hint: PREVIOUS_HINT,
      },
    ],
  },
  {
    id: "rio-springs",
    name: "Rio Springs",
    utilities: "Water, Sewer",
    method: "Occupancy rates scaled to 95% of SAWS",
    fields: [
      { key: "occupantCount", label: "Occupant Count", accept: SHEETS, required: true },
      { key: "rentRoll", label: "Rent Roll", accept: SHEETS, required: true },
      {
        key: "sawsBill",
        label: "SAWS water/sewer bill",
        accept: PDF,
        required: true,
        multiple: true,
        hint: "Upload every SAWS PDF for this cycle. Totals are summed.",
      },
      {
        key: "previousBilling",
        label: "Previous month billing file",
        accept: SHEETS,
        required: true,
        hint: PREVIOUS_HINT,
      },
    ],
  },
  {
    id: "mila",
    name: "Mila Apartments",
    utilities: "Water, Sewer, Gas, Electric",
    method: "Water/sewer last-month +0%; gas/electric from bills or prior file",
    fields: [
      { key: "occupantCount", label: "Occupant Count", accept: SHEETS, required: true },
      { key: "rentRoll", label: "Rent Roll", accept: SHEETS, required: true },
      {
        key: "sawsBill",
        label: "SAWS water/sewer bill(s)",
        accept: PDF,
        required: true,
        multiple: true,
        hint: "Upload every SAWS PDF for this cycle. Totals are summed.",
      },
      {
        key: "gasBill",
        label: "Gas bill",
        accept: PDF,
        required: false,
        hint: "If omitted, prior-month gas amounts are reused.",
      },
      {
        key: "electricBill",
        label: "Electric bill",
        accept: PDF,
        required: false,
        hint: "If omitted, prior-month electric amounts are reused.",
      },
      {
        key: "previousBilling",
        label: "Previous month billing file",
        accept: SHEETS,
        required: true,
        hint: PREVIOUS_HINT,
      },
    ],
  },
];

export function getProperty(id: string) {
  return PROPERTIES.find((property) => property.id === id);
}
