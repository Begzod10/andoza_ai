import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getCatalogMaterials, getMebelProject, getPriceBook, saveMebelProject } from "@/lib/api";
import { computeProject, EMPTY_PRICE_BOOK } from "@/features/mebel/engine";
import type { CatalogPrices, FurnitureProject, Result } from "@/features/mebel/engine";
import type { CatalogOptions } from "./ui/ParamsPanel";

const SAVE_DELAY_MS = 1000;
const CATALOG_CATEGORIES = ["ldsp", "hdf", "kromka"] as const;

/** "invalid": there are edits, but they do not validate, so they are not saved. */
export type SaveState = "saved" | "saving" | "error" | "invalid";

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
      queryKey: ["mebel", "catalog", category],
      queryFn: () => getCatalogMaterials(category),
      staleTime: 10 * 60_000,
    })),
  });

  const [project, setProjectState] = useState<FurnitureProject | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const dirty = useRef(false);
  // The edit waiting for its save, so leaving the page can save it at once.
  const pending = useRef<FurnitureProject | null>(null);
  const saveSeq = useRef(0);

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

  const flush = useRef(() => {});
  flush.current = () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    dirty.current = false;
    // Only the latest save may report: an earlier one landing late says nothing.
    const seq = ++saveSeq.current;
    saveMebelProject(id, p.name.trim() || "—", p)
      .then(() => { if (seq === saveSeq.current && !pending.current) setSaveState("saved"); })
      .catch(() => { if (seq === saveSeq.current) setSaveState("error"); });
  };

  useEffect(() => {
    if (!project || !dirty.current || !result) return;
    if (result.errors.length > 0) {
      pending.current = null;
      setSaveState("invalid");
      return;
    }
    pending.current = project;
    setSaveState("saving");
    const timer = setTimeout(() => flush.current(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [id, project, result]);

  // Leaving the page (in the app or closing the tab) saves the pending edit now.
  useEffect(() => {
    const onHide = () => flush.current();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush.current();
    };
  }, []);

  return {
    project,
    setProject,
    result,
    priceBook,
    priceBookReady: priceBookQuery.isSuccess,
    catalog,
    options,
    saveState,
    selectedPartId,
    setSelectedPartId,
    isLoading: projectQuery.isLoading,
    isError: projectQuery.isError,
  };
}
