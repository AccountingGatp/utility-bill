import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

const g = globalThis as typeof globalThis & {
  DOMMatrix?: typeof DOMMatrix;
  ImageData?: typeof ImageData;
  Path2D?: typeof Path2D;
};

g.DOMMatrix ??= DOMMatrix;
g.ImageData ??= ImageData;
g.Path2D ??= Path2D;
