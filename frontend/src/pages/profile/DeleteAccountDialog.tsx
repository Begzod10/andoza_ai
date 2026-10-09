import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { deleteAccount } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { errorMessage } from "@/pages/dokon/admin/errorMessage";

/** Confirm and permanently delete the signed-in account. Phone-code accounts
 *  have no password: the field may stay empty and the server decides. */
export function DeleteAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: () => deleteAccount(password || undefined),
    onSuccess: () => {
      // Same as the logout button: the account is gone, so drop local state too.
      useAuthStore.getState().logout();
      queryClient.clear();
      onOpenChange(false);
      navigate("/");
    },
    onError: (err) => setError(errorMessage(err, "Hisobni o'chirib bo'lmadi. Qayta urinib ko'ring.")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPassword("");
          setError(null);
        }
        onOpenChange(next);
      }}
      title="Hisobni o'chirish"
      description="Bu amalni qaytarib bo'lmaydi"
      themed
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          remove.mutate();
        }}
        className="space-y-4"
      >
        <p className="text-sm text-ink-muted">
          Hisobingiz va barcha ma'lumotlaringiz butunlay o'chiriladi: loyihalar, rasmlar, buyurtmalar hamda do'kon yoki usta profili
          (agar bo'lsa). Ularni qayta tiklab bo'lmaydi.
        </p>
        <Input
          themed
          label="Parol"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Telefon kodi bilan kirgan bo'lsangiz, bo'sh qoldiring"
        />
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="soft" onClick={() => onOpenChange(false)}>Bekor qilish</Button>
          <Button type="submit" variant="danger" loading={remove.isPending}>Hisobni o'chirish</Button>
        </div>
      </form>
    </Dialog>
  );
}
