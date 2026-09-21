import { Obstacle, Point } from "./obstacle";

export interface CostMapConfig {
  width: number; // canvas width in pixels
  height: number; // canvas height in pixels
  cellSize: number; // grid cell size in pixels
  safetyMargin: number; // buffer radius around lethal hazards
  wDistance: number;
  wSafety: number;
  wRoughness: number;
}

export class CostMap {
  public cols: number;
  public rows: number;
  public cellSize: number;
  public grid: number[][]; // [row][col] cost value (0 to 100)
  public roughnessGrid: number[][]; // [row][col] road condition penalty (potholes/debris)
  public config: CostMapConfig;

  constructor(config: CostMapConfig) {
    this.config = config;
    this.cellSize = config.cellSize;
    this.cols = Math.ceil(config.width / config.cellSize);
    this.rows = Math.ceil(config.height / config.cellSize);
    this.grid = Array(this.rows)
      .fill(0)
      .map(() => Array(this.cols).fill(1));
    this.roughnessGrid = Array(this.rows)
      .fill(0)
      .map(() => Array(this.cols).fill(0));
  }

  public update(obstacles: Obstacle[], roadBoundaries?: { top: number; bottom: number }) {
    // 1. Reset base grids
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        let baseCost = 1;
        const yWorld = r * this.cellSize;

        if (roadBoundaries) {
          if (yWorld < roadBoundaries.top || yWorld > roadBoundaries.bottom) {
            baseCost = 95; // lethal off-road shoulder / ditch
          } else if (
            yWorld < roadBoundaries.top + 30 ||
            yWorld > roadBoundaries.bottom - 30
          ) {
            baseCost = 25; // unpaved gravel shoulder
          }
        }

        this.grid[r][c] = baseCost;
        this.roughnessGrid[r][c] = 0;
      }
    }

    // 2. Inflate obstacles onto cost grid
    for (const obs of obstacles) {
      const isRoughness = obs.type === "pothole" || obs.type === "speed_breaker" || obs.type === "debris";
      const totalRadius = obs.radius + this.config.safetyMargin;
      const cellRadius = Math.ceil(totalRadius / this.cellSize);

      const centerCol = Math.floor(obs.x / this.cellSize);
      const centerRow = Math.floor(obs.y / this.cellSize);

      for (let dr = -cellRadius; dr <= cellRadius; dr++) {
        for (let dc = -cellRadius; dc <= cellRadius; dc++) {
          const r = centerRow + dr;
          const c = centerCol + dc;

          if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
            const cellCenterX = c * this.cellSize + this.cellSize / 2;
            const cellCenterY = r * this.cellSize + this.cellSize / 2;
            const dist = Math.hypot(cellCenterX - obs.x, cellCenterY - obs.y);

            if (dist <= obs.radius) {
              // Lethal footprint
              const lethalCost = isRoughness ? Math.min(85, 35 * obs.costMultiplier) : 100;
              this.grid[r][c] = Math.max(this.grid[r][c], lethalCost);
              if (isRoughness) {
                this.roughnessGrid[r][c] = Math.max(this.roughnessGrid[r][c], 65);
              }
            } else if (dist <= totalRadius) {
              // Smooth exponential decay buffer
              const factor = 1 - (dist - obs.radius) / this.config.safetyMargin;
              const inflationCost = Math.round(factor * 50 * (obs.costMultiplier * 0.7));
              this.grid[r][c] = Math.max(this.grid[r][c], inflationCost);
            }
          }
        }
      }
    }
  }

  public getCostAtWorld(x: number, y: number): number {
    const c = Math.floor(x / this.cellSize);
    const r = Math.floor(y / this.cellSize);
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return 100;

    return (
      this.grid[r][c] * this.config.wSafety +
      this.roughnessGrid[r][c] * this.config.wRoughness
    );
  }

  public isCellPassable(r: number, c: number, threshold = 90): boolean {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
    return this.grid[r][c] < threshold;
  }

  public worldToGrid(point: Point): { r: number; c: number } {
    return {
      r: Math.max(0, Math.min(this.rows - 1, Math.floor(point.y / this.cellSize))),
      c: Math.max(0, Math.min(this.cols - 1, Math.floor(point.x / this.cellSize))),
    };
  }

  public gridToWorld(r: number, c: number): Point {
    return {
      x: c * this.cellSize + this.cellSize / 2,
      y: r * this.cellSize + this.cellSize / 2,
    };
  }
}
