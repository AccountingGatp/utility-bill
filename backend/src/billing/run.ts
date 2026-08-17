import { getProperty } from "../catalog.js";
import type { ProcessResult, RunOptions, UploadedFile } from "../types.js";
import { processGeneric } from "./generic.js";
import { processGreenOaks } from "./greenOaks.js";
import { processIstana } from "./istana.js";
import { processMila } from "./mila.js";
import { processValencia } from "./valencia.js";

export async function processProperty(
  propertyId: string,
  files: UploadedFile[],
  options: RunOptions,
): Promise<ProcessResult> {
  const property = getProperty(propertyId);
  if (!property) {
    throw new Error(`Unknown property: ${propertyId}`);
  }

  switch (propertyId) {
    case "green-oaks":
      return processGreenOaks(files, options);
    case "istana":
      return processIstana(files, options);
    case "mila":
      return processMila(files, options);
    case "valencia":
      return processValencia(property.name, files, options);
    case "university-cove":
    case "rio-springs":
      return processGeneric(propertyId, property.name, files, options);
    default:
      throw new Error(`No processor registered for ${property.name}.`);
  }
}
