"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2Icon,
  FileSpreadsheetIcon,
  Loader2Icon,
  ShieldCheckIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  fetchProperties,
  processProperty,
  type FileField,
  type PropertyConfig,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const MAX_BYTES = 25 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function FileSlot({
  field,
  files,
  onChange,
}: {
  field: FileField;
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const [dragging, setDragging] = useState(false);

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const oversized = incoming.find((file) => file.size > MAX_BYTES);
    if (oversized) {
      toast.error(`${oversized.name} is larger than 25 MB.`);
      return;
    }
    onChange(field.multiple ? [...files, ...incoming] : incoming.slice(0, 1));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {field.label}
          {field.required ? <span className="text-destructive"> *</span> : (
            <span className="text-muted-foreground"> (optional)</span>
          )}
        </p>
        <Badge variant="outline">{field.accept.replaceAll(".", "").toUpperCase()}</Badge>
      </div>
      {field.hint ? (
        <p className="text-xs text-muted-foreground">{field.hint}</p>
      ) : null}
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition-colors",
          dragging ? "border-primary bg-muted/60" : "border-border bg-muted/30 hover:bg-muted/50",
        )}
      >
        <UploadIcon className="size-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Drop or click to add {field.multiple ? "file(s)" : "a file"}
        </span>
        <input
          type="file"
          accept={field.accept}
          multiple={field.multiple}
          className="sr-only"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((file) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5"
            >
              <FileSpreadsheetIcon className="size-3.5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-xs">{file.name}</span>
              <span className="text-[11px] text-muted-foreground">{formatBytes(file.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${file.name}`}
                onClick={() => onChange(files.filter((item) => item !== file))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function BillingForm() {
  const [properties, setProperties] = useState<PropertyConfig[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [uploads, setUploads] = useState<Record<string, File[]>>({});
  const [increasePercent, setIncreasePercent] = useState("10");
  const [recaptureRate, setRecaptureRate] = useState("95");
  const [busy, setBusy] = useState(false);
  const [resultName, setResultName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchProperties()
      .then((list) => {
        setProperties(list);
        setPropertyId((current) => current || list[0]?.id || "");
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Failed to load properties.");
      });
  }, []);

  const property = useMemo(
    () => properties.find((item) => item.id === propertyId),
    [properties, propertyId],
  );

  useEffect(() => {
    setUploads({});
    setResultName(null);
    if (propertyId === "valencia") setRecaptureRate("65");
    else if (propertyId) setRecaptureRate("95");
  }, [propertyId]);

  const ready =
    !!property &&
    property.fields
      .filter((field) => field.required)
      .every((field) => (uploads[field.key]?.length ?? 0) > 0);

  async function onProcess() {
    if (!property || !ready) return;
    setBusy(true);
    setResultName(null);
    try {
      const result = await processProperty({
        propertyId: property.id,
        files: uploads,
        increasePercent: property.id === "green-oaks" ? Number(increasePercent) : undefined,
        recaptureRate:
          property.id === "green-oaks" ? undefined : Number(recaptureRate) / 100,
      });
      downloadBlob(result.blob, result.filename);
      setResultName(result.filename);
      toast.success("Billing files downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Processing failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Generate property billing</CardTitle>
            <CardDescription>
              Choose a property and upload that folder’s input files. Last month’s
              billing workbook is required. Skip Import and Utility Billing August —
              those are generated outputs.
            </CardDescription>
          </div>
          <Badge variant="outline">
            <ShieldCheckIcon />
            In memory
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {loadError ? (
          <Alert variant="destructive">
            <AlertTitle>Backend unavailable</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="property">
            Property
          </label>
          <select
            id="property"
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {properties.length === 0 ? <option value="">Loading…</option> : null}
            {properties.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {property ? (
            <p className="text-xs text-muted-foreground">
              {property.utilities} · {property.method}
            </p>
          ) : null}
        </div>

        {property ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {property.id === "green-oaks" ? (
              <label className="space-y-1 text-sm">
                <span className="font-medium">Increase over last month (%)</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  value={increasePercent}
                  onChange={(event) => setIncreasePercent(event.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </label>
            ) : (
              <label className="space-y-1 text-sm">
                <span className="font-medium">Recapture rate (%)</span>
                <input
                  type="number"
                  min={50}
                  max={110}
                  step={1}
                  value={recaptureRate}
                  onChange={(event) => setRecaptureRate(event.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </label>
            )}
          </div>
        ) : null}

        {property ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {property.fields.map((field) => (
              <FileSlot
                key={field.key}
                field={field}
                files={uploads[field.key] ?? []}
                onChange={(next) =>
                  setUploads((current) => ({ ...current, [field.key]: next }))
                }
              />
            ))}
          </div>
        ) : null}

        {busy ? <Progress value={70} className="h-1.5" /> : null}

        {resultName ? (
          <Alert>
            <CheckCircle2Icon />
            <AlertTitle>Ready</AlertTitle>
            <AlertDescription>
              Downloaded <span className="font-medium text-foreground">{resultName}</span>.
              Uploads were discarded after the response.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>

      <Separator />

      <CardFooter className="justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Inputs are the property folders. Import and Utility Billing August are
          outputs and should not be uploaded.
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setUploads({});
              setResultName(null);
            }}
            disabled={busy}
          >
            Clear
          </Button>
          <Button type="button" onClick={onProcess} disabled={!ready || busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
            {busy ? "Processing" : "Generate files"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
