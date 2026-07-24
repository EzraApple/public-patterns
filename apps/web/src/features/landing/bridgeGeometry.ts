export type BridgePixel = {
  x: number;
  y: number;
  tone: "lit" | "mid" | "dark";
};

export const BRIDGE_WIDTH = 208;
export const BRIDGE_HEIGHT = 86;

type MutablePixel = BridgePixel & { key: string };

function addPixel(
  pixels: Map<string, MutablePixel>,
  x: number,
  y: number,
  tone: BridgePixel["tone"] = "mid",
) {
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);
  const key = `${roundedX}:${roundedY}`;

  pixels.set(key, { key, x: roundedX, y: roundedY, tone });
}

function addLine(
  pixels: Map<string, MutablePixel>,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  tone: BridgePixel["tone"] = "mid",
) {
  const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY));

  for (let index = 0; index <= steps; index += 1) {
    const progress = steps === 0 ? 0 : index / steps;
    addPixel(
      pixels,
      fromX + (toX - fromX) * progress,
      fromY + (toY - fromY) * progress,
      tone,
    );
  }
}

function addTower(
  pixels: Map<string, MutablePixel>,
  centerX: number,
  topY: number,
  deckY: number,
) {
  const left = centerX - 4;
  const right = centerX + 4;

  for (let y = topY; y <= deckY + 8; y += 1) {
    const tone = y < topY + 10 ? "lit" : "mid";
    addPixel(pixels, left, y, tone);
    addPixel(pixels, left + 1, y, tone);
    addPixel(pixels, right - 1, y, tone);
    addPixel(pixels, right, y, tone);
  }

  for (const y of [topY + 10, topY + 23, topY + 37]) {
    addLine(pixels, left, y, right, y, "lit");
    addLine(pixels, left, y + 1, right, y + 1, "dark");
  }

  addLine(pixels, left, topY, centerX, topY - 4, "lit");
  addLine(pixels, right, topY, centerX, topY - 4, "lit");
  addLine(pixels, left - 1, deckY + 8, centerX - 1, deckY, "dark");
  addLine(pixels, right + 1, deckY + 8, centerX + 1, deckY, "dark");
}

function cableY(x: number) {
  const leftTower = 56;
  const rightTower = 152;
  const towerY = 18;
  const anchorY = 47;

  if (x < leftTower) {
    const progress = (x - 8) / (leftTower - 8);
    return anchorY - (anchorY - towerY) * progress * progress;
  }

  if (x > rightTower) {
    const progress = (200 - x) / (200 - rightTower);
    return anchorY - (anchorY - towerY) * progress * progress;
  }

  const progress = (x - leftTower) / (rightTower - leftTower);
  return towerY + 108 * progress * (1 - progress);
}

export function createBridgePixels(): BridgePixel[] {
  const pixels = new Map<string, MutablePixel>();
  const deckY = 63;

  for (let x = 6; x <= 202; x += 1) {
    addPixel(pixels, x, deckY, "lit");
    addPixel(pixels, x, deckY + 1, "mid");
    addPixel(pixels, x, deckY + 3, "dark");

    if (x % 4 === 0) {
      addPixel(pixels, x, deckY + 2, "dark");
    }
  }

  for (let x = 8; x <= 200; x += 1) {
    addPixel(pixels, x, cableY(x), x % 3 === 0 ? "lit" : "mid");
  }

  for (let x = 12; x <= 196; x += 8) {
    addLine(pixels, x, cableY(x), x, deckY - 1, "dark");
  }

  addTower(pixels, 56, 18, deckY);
  addTower(pixels, 152, 18, deckY);

  return Array.from(pixels.values(), ({ key: _key, ...pixel }) => pixel);
}
