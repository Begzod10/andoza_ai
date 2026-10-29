import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getMaterials, getMebelProject, getPriceBook, saveMebelProject } from "@/lib/api";
import { computeProject, EMPTY_PRICE_BOOK } from "@/features/mebel/engine";
import type { CatalogPrices, FurnitureProject, Result } from "@/features/mebel/engine";
import type { CatalogOptions } from "./ui/ParamsPanel";

const SAVE_DELAY_MS = 1000;
const CATALOG_CATEGORIES = ["ldsp", "hdf", "kromka"] as const;

export type SaveState = "saved" | "saving" | "error";

/**
 * One /mebel project being edited: the saved project, the workshop's price
 * book and the shop catalogue's sheet goods, the engine's result for the
 * current edit, and a save a second after the last change. An edit that does
 * not validate is not saved (the server would refuse it); it is saved once
 * fixed.
 */
export function useMebelProject(id: string) {
  const projectQuery = useQuery({ queryKey: ["mebel", "project", id], queryFn: () => getMebelProject(id) });
  const priceBookQuery = useQuery({ queryKey: ["mebel", "price-book"], queryFn: getPriceBook });
  const catalogQueries = useQueries({
    queries: CATALOG_CATEGORIES.map((category) => ({
      queryKey: ["materials", { category, per_page: 100 }],
      queryFn: () => getMaterials({ category, per_page: 100 }),
      staleTime: 10 * 60_000,
    })),
  });

  const [project, setProjectState] = useState<FurnitureProject | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const dirty = useRef(false);

  // The saved project seeds the editor once; later refetches do not overwrite an edit.
  useEffect(() => {
    if (projectQuery.data && project == null) setProjectState({ ...projectQuery.data.data, name: projectQuery.data.name });
  }, [projectQuery.data, project]);

  const setProject = (fn: (p: FurnitureProject) => FurnitureProject) => {
    dirty.current = true;
    setProjectState((p) => (p ? fn(p) : p));
  };

  const catalogLists = catalogQueries.map((q) => q.data ?? []);
  const catalogKey = catalogQueries.map((q) => q.dataUpdatedAt).join("|");
  const { catalog, options } = useMemo(() => {
    const prices: CatalogPrices = {};
    const opts = {} as CatalogOptions;
    CATALOG_CATEGORIES.forEach((category, i) => {
      opts[category] = catalogLists[i].map((m) => {
        const name = m.store_name ? `${m.name_uz} · ${m.store_name}` : m.name_uz;
        prices[m.id] = { name, price: m.price_uzs };
        return { id: m.id, name };
      });
    });
    return { catalog: prices, options: opts };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalogKey stands for the lists
  }, [catalogKey]);

  const priceBook = priceBookQuery.data ?? EMPTY_PRICE_BOOK;
  const result: Result | null = useMemo(
    () => (project ? computeProject(project, priceBook, catalog) : null),
    [project, priceBook, catalog],
  );

  useEffect(() => {
    if (!project || !dirty.current || !result || result.errors.length > 0) return;
    setSaveState("saving");
    const timer = setTimeout(() => {
      dirty.current = false;
      saveMebelProject(id, project.name.trim() || "—", project)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [id, project, result]);

  return {
    project,
    setProject,
    result,
    priceBook,
    catalog,
    options,
    saveState,
    selectedPartId,
    setSelectedPartId,
    isLoading: projectQuery.isLoading,
    isError: projectQuery.isError,
  };
}
