// Barrel re-export — frontend/src/lib/api.ts stays the stable import path for
// every consumer (`import { ... } from "@/lib/api"`). The implementation is
// split by domain under `frontend/src/lib/api/` to keep files within the
// project's size guideline; this file's only job is to expose the exact same
// public surface as before, unchanged.

// Only BASE_URL was ever part of the public surface here — `apiClient` and
// `handleUnauthorized` are internal helpers shared between domain modules.
export { BASE_URL } from "./api/client";
export * from "./api/auth";
export * from "./api/apartments";
export * from "./api/rooms";
export * from "./api/materials";
export * from "./api/catalog";
export * from "./api/stores";
export * from "./api/regions";
export * from "./api/ustalar";
export * from "./api/estimates";
export * from "./api/draftRooms";
export * from "./api/leads";
export * from "./api/ai";
export * from "./api/meshy";
export * from "./api/wallpapers";
export * from "./api/userModels";
export * from "./api/admin";
