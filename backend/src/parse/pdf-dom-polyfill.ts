import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

const g = globalThis as unknown as Record<string, unknown>;
if (g.DOMMatrix == null) g.DOMMatrix = DOMMatrix;
if (g.ImageData == null) g.ImageData = ImageData;
if (g.Path2D == null) g.Path2D = Path2D;
