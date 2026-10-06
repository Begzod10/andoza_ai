import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { createShopInquiry } from "@/lib/api";
import { errorMessage } from "@/pages/dokon/admin/errorMessage";

const MAX_MESSAGE = 500;
// A draft room that has not been saved yet has a local id, which the server would refuse.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Do'konga murojaat": the customer asks the shop behind a catalog model about
 *  it. The server limits it to 5 inquiries per shop per day and answers with a
 *  readable detail, which is shown as-is. */
export function ShopInquiryDialog({
  open,
  onOpenChange,
  storeId,
  storeName,
  furnitureId,
  roomId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  storeName?: string | null;
  furnitureId: string;
  roomId?: string | null;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  function close(next: boolean) {
    if (!next) {
      setMessage("");
      setError(null);
      setSent(false);
    }
    onOpenChange(next);
  }

  async function send() {
    setError(null);
    setSending(true);
    try {
      const text = message.trim();
      await createShopInquiry(storeId, {
        furniture_id: furnitureId,
        ...(roomId && UUID_RE.test(roomId) ? { room_id: roomId } : {}),
        ...(text ? { message: text } : {}),
      });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, "Murojaatni yuborib bo'lmadi"));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close} title="Do'konga murojaat" description={storeName ?? undefined}>
      {sent ? (
        <div className="space-y-4">
          <p role="status" className="text-sm text-neutral-800">Murojaatingiz yuborildi. Do'kon siz bilan bog'lanadi.</p>
          <div className="flex justify-end">
            <Button type="button" onClick={() => close(false)}>Yopish</Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="shop-inquiry-message" className="block text-sm font-medium text-neutral-900 mb-1.5">
              Xabar (ixtiyoriy)
            </label>
            <textarea
              id="shop-inquiry-message"
              value={message}
              maxLength={MAX_MESSAGE}
              rows={4}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Masalan: Bu model omborda bormi?"
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <p className="mt-1 text-right text-xs text-neutral-500">{message.length}/{MAX_MESSAGE}</p>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="tertiary" onClick={() => close(false)}>Bekor qilish</Button>
            <Button type="submit" loading={sending}>Yuborish</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
