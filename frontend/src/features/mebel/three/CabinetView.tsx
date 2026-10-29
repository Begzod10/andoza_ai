import type { Part } from "@/features/mebel/engine";

/** Placeholder until the 3D view lands (Task 8). */
export function CabinetView(_props: { parts: Part[]; selectedPartId: string | null; onSelect(id: string): void }) {
  return <div className="h-full w-full rounded-2xl bg-neutral-100" />;
}
