import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  ADMIN_PARTNER_TIERS,
  createAdminStore,
  listRegions,
  type AdminPartnerTier,
  type Region,
} from "@/lib/api";
import { errorMessage } from "./errorMessage";

/** Dialog form for creating a shop — Viloyat/Tuman cascade from the ported
 * Uzbekistan regions dataset instead of a free-text district field. */
export function StoreFormDialog({
  open,
  onOpenChange,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onError: (msg: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [viloyat, setViloyat] = useState("");
  const [district, setDistrict] = useState("");
  const [tier, setTier] = useState<AdminPartnerTier>("standard");

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ["regions"],
    queryFn: listRegions,
    staleTime: Infinity, // static reference data — never changes at runtime
  });
  const districtOptions = regions.find((r) => r.name === viloyat)?.districts ?? [];

  function reset() {
    setName("");
    setViloyat("");
    setDistrict("");
    setTier("standard");
  }

  const createMutation = useMutation({
    mutationFn: () => createAdminStore({ name, district: district || null, partner_tier: tier }),
    onSuccess: () => {
      reset();
      onError(null);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "stores"] });
    },
    onError: (err) => onError(errorMessage(err, "Do'konni yaratib bo'lmadi")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Yangi do'kon"
      description="Do'kon ma'lumotlarini kiriting"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createMutation.mutate();
        }}
        className="space-y-4"
      >
        <Input
          label="Nomi"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Do'kon nomi"
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Viloyat"
            value={viloyat}
            onChange={(e) => {
              setViloyat(e.target.value);
              setDistrict(""); // previous tuman may not exist in the new viloyat
            }}
          >
            <option value="">— tanlanmagan —</option>
            {regions.map((r) => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </Select>
          <Select
            label="Tuman"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            disabled={!viloyat}
          >
            <option value="">— tanlanmagan —</option>
            {districtOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
        </div>
        <Select label="Daraja" value={tier} onChange={(e) => setTier(e.target.value as AdminPartnerTier)}>
          {ADMIN_PARTNER_TIERS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="tertiary" onClick={() => onOpenChange(false)}>
            Bekor qilish
          </Button>
          <Button type="submit" disabled={!name.trim()} loading={createMutation.isPending}>
            Qo'shish
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
