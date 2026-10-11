import { useCallback, useEffect } from "react";
import { useBlocker, type BlockerFunction } from "react-router-dom";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

/**
 * True when `pathname` is outside this room's studio. Moving between the
 * studio's own tabs (/studio/:roomId/<tab>) is not leaving — the edits live
 * in the room store and are all still there.
 */
export function leavesStudio(roomId: string, pathname: string): boolean {
  const base = `/studio/${roomId}`;
  return !(pathname === base || pathname.startsWith(`${base}/`));
}

/**
 * Asks before the user walks away from unsaved studio edits: the browser's own
 * prompt on tab close / reload, and a confirm dialog on in-app navigation that
 * leaves the studio (the back link, the Smeta tab, any other route).
 *
 * `isDirty` is a getter, read at the moment of navigation rather than at the
 * last render: a save calls `markSaved()` and may navigate in the same tick
 * (a new room's URL is replaced with its real id), before React re-renders.
 *
 * Needs a data router (`createBrowserRouter`) — `useBlocker` throws under a
 * plain <BrowserRouter>/<MemoryRouter>.
 */
export function UnsavedChangesGuard({
  roomId,
  isDirty,
}: {
  roomId: string;
  isDirty: () => boolean;
}) {
  // (a) Tab close / reload / leaving the SPA.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirty()) return;
      e.preventDefault();
      // Legacy browsers (and some WebViews) need returnValue set to prompt.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // (b) In-app navigation out of this room's studio.
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      isDirty() &&
      currentLocation.pathname !== nextLocation.pathname &&
      leavesStudio(roomId, nextLocation.pathname),
    [roomId, isDirty],
  );
  const blocker = useBlocker(shouldBlock);

  const open = blocker.state === "blocked";
  const stay = () => blocker.reset?.();
  const leave = () => blocker.proceed?.();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) stay(); }}
      title="Saqlanmagan o'zgarishlar"
      description="Xonadagi o'zgarishlar hali saqlanmagan. Chiqsangiz, ular yo'qolishi mumkin."
      themed
    >
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="soft" size="sm" onClick={stay}>
          Qolish
        </Button>
        <Button variant="danger" size="sm" onClick={leave}>
          Saqlamasdan chiqish
        </Button>
      </div>
    </Dialog>
  );
}
