import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { deleteAccount } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { type FormError, formErrorText, requestError } from "@/lib/formError";

/** Confirm and permanently delete the signed-in account. The password is
 *  re-checked by the server before anything is removed. */
export function DeleteAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<FormError>(null);

  const remove = useMutation({
    mutationFn: () => deleteAccount(password || undefined),
    onSuccess: () => {
      // Same as the logout button: the account is gone, so drop local state too.
      useAuthStore.getState().logout();
      queryClient.clear();
      onOpenChange(false);
      navigate("/");
    },
    onError: (err) => setError(requestError(err, "profile.ochirib_bolmadi")),
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
      title={t("profile.hisobni_ochirish")}
      description={t("profile.qaytarib_bolmaydi")}
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
          {t("profile.ochirish_matn")}
        </p>
        <Input
          themed
          label={t("auth.parol")}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("profile.parol_placeholder")}
        />
        {error && <p role="alert" className="text-sm text-red-500">{formErrorText(t, error)}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="soft" onClick={() => onOpenChange(false)}>{t("common.bekor")}</Button>
          <Button type="submit" variant="danger" loading={remove.isPending}>{t("profile.hisobni_ochirish")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
