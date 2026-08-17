import "./parse/pdf-dom-polyfill.js";
import express from "express";
import multer from "multer";

import { processProperty } from "./billing/run.js";
import { PROPERTIES } from "./catalog.js";
import { zipOutputs } from "./output.js";
import type { UploadedFile } from "./types.js";

const PORT = Number(process.env.PORT ?? 4000);
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Disposition, X-Processed-Filename, X-Process-Summary",
  );
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 16 },
});

const uploadFields = upload.fields([
  { name: "occupantCount", maxCount: 1 },
  { name: "rentRoll", maxCount: 1 },
  { name: "sawsBill", maxCount: 16 },
  { name: "sawsDomestic", maxCount: 1 },
  { name: "sawsIrrigation", maxCount: 1 },
  { name: "gasBill", maxCount: 1 },
  { name: "electricBill", maxCount: 1 },
  { name: "previousBilling", maxCount: 1 },
]);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/properties", (_req, res) => {
  res.json({ properties: PROPERTIES });
});

app.post("/process", uploadFields, async (req, res) => {
  try {
    const propertyId = String(req.body.property ?? "");
    if (!propertyId) {
      res.status(400).json({ error: "Select a property." });
      return;
    }

    const grouped = req.files as Record<string, Express.Multer.File[]> | undefined;
    const uploaded: UploadedFile[] = [];
    for (const [field, list] of Object.entries(grouped ?? {})) {
      for (const file of list) {
        uploaded.push({
          field,
          originalName: file.originalname,
          mimeType: file.mimetype,
          buffer: file.buffer,
        });
      }
    }

    if (uploaded.length === 0) {
      res.status(400).json({ error: "Upload the required files for this property." });
      return;
    }

    const increasePercent = req.body.increasePercent
      ? Number(req.body.increasePercent)
      : undefined;
    const recaptureRate = req.body.recaptureRate
      ? Number(req.body.recaptureRate)
      : undefined;

    const result = await processProperty(propertyId, uploaded, {
      increasePercent,
      recaptureRate,
    });
    const zip = await zipOutputs(result.zipName, result.files);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(zip.zipName)}"`,
    );
    res.setHeader("X-Processed-Filename", zip.zipName);
    res.setHeader("X-Process-Summary", encodeURIComponent(JSON.stringify(result.summary)));
    res.send(zip.buffer);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process the uploaded files.";
    res.status(400).json({ error: message });
  }
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "A file is larger than 25 MB."
          : error.message;
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: "Unexpected server error." });
  },
);

app.listen(PORT, () => {
  console.log(`Utility bill API listening on http://localhost:${PORT}`);
});
