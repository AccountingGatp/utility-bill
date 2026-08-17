const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://utility-bill-api.vercel.app";

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

export type ProcessResult = {
  blob: Blob;
  filename: string;
  summary: Record<string, string | number> | null;
};

export async function fetchProperties(): Promise<PropertyConfig[]> {
  const response = await fetch(`${API_URL}/properties`);
  if (!response.ok) {
    throw new Error("Could not load properties from the API. Is the backend running?");
  }
  const payload = (await response.json()) as { properties: PropertyConfig[] };
  return payload.properties;
}

export async function processProperty(input: {
  propertyId: string;
  files: Record<string, File[]>;
  increasePercent?: number;
  recaptureRate?: number;
}): Promise<ProcessResult> {
  const form = new FormData();
  form.append("property", input.propertyId);
  if (input.increasePercent != null) {
    form.append("increasePercent", String(input.increasePercent));
  }
  if (input.recaptureRate != null) {
    form.append("recaptureRate", String(input.recaptureRate));
  }
  for (const [field, list] of Object.entries(input.files)) {
    for (const file of list) {
      form.append(field, file);
    }
  }

  const response = await fetch(`${API_URL}/process`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Keep the status fallback when the body is not JSON.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const filename = response.headers.get("X-Processed-Filename") ?? "billing.zip";
  let summary: Record<string, string | number> | null = null;
  const encoded = response.headers.get("X-Process-Summary");
  if (encoded) {
    try {
      summary = JSON.parse(decodeURIComponent(encoded)) as Record<string, string | number>;
    } catch {
      summary = null;
    }
  }

  return { blob, filename, summary };
}
