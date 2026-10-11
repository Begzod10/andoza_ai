import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRooms } from "@/lib/api";

/**
 * The apartment's rooms — what every neighbour is drawn from, and what the
 * active room borrows its neighbours' doors from (lib/flatOpenings).
 *
 * Fetched again whenever the ROOM changes, not only when the apartment does.
 * `/studio/:roomId` has no key on its route element, so switching rooms keeps
 * ThreeDPage mounted and only changes the param; the query key is per
 * apartment, so it did not change either, and react-query only refetches a
 * stale query on mount, focus or reconnect. The list therefore stayed exactly
 * as it was when the page first loaded. That is the user's "the far side has
 * no hole at all": draw a door in one room, tap the neighbour to open it, and
 * the neighbour — and the door it should have borrowed through the shared
 * wall — was drawn from the list as it stood BEFORE the door existed. The
 * room just left has always been saved by then (`onOpen` awaits `onSave`
 * before navigating), so a refetch on arrival is what brings its door in.
 *
 * Invalidated rather than keyed on the room: a new key would drop the data
 * while it loads and every neighbour would blink out on each room switch.
 */
export function useFlatRooms(aptId: string | null, roomId: string) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['apt-rooms', aptId],
    queryFn: () => getRooms(aptId!),
    enabled: !!aptId,
    staleTime: 5_000,
  });
  // The first room is fetched by the query's own mount; only a later switch
  // needs the push.
  const seenRoom = useRef(roomId);
  useEffect(() => {
    if (seenRoom.current === roomId) return;
    seenRoom.current = roomId;
    if (aptId) void queryClient.invalidateQueries({ queryKey: ['apt-rooms', aptId] });
  }, [aptId, roomId, queryClient]);
  return data;
}
