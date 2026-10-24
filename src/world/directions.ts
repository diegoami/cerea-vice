import { nodeById, roads } from "./district";

export type SignDirection = "left" | "straight" | "right";
export interface DirectionRow {
  text: string;
  detail: string;
  direction: SignDirection;
}

/** A board belongs to one approach: arrows are relative to its approaching driver. */
export function junctionDirections(nodeId: string, approachId: string): DirectionRow[] {
  const node = nodeById(nodeId);
  const approach = nodeById(approachId);
  const heading = Math.atan2(node.x - approach.x, -(node.z - approach.z));
  return roads
    .filter((road) => road.a === nodeId || road.b === nodeId)
    .map((road) => ({ road, exit: nodeById(road.a === nodeId ? road.b : road.a) }))
    .filter(({ exit }) => exit.id !== approachId)
    .map(({ road, exit }): DirectionRow => {
      const exitHeading = Math.atan2(exit.x - node.x, -(exit.z - node.z));
      const turn = Math.atan2(Math.sin(exitHeading - heading), Math.cos(exitHeading - heading));
      let detail = exit.label;
      if (exit.id === "e" || exit.id === "ne") detail = "Blue Hotel";
      if (exit.id === "nw") detail = "Water Tower";
      if (exit.id === "w") detail = "Old Market";
      return {
        text: road.name.toUpperCase(),
        detail: detail.toUpperCase(),
        direction: Math.abs(turn) < 0.2 ? "straight" : turn < 0 ? "left" : "right",
      };
    })
    .sort((a, b) => ["left", "straight", "right"].indexOf(a.direction) - ["left", "straight", "right"].indexOf(b.direction));
}
