// Placeholder Do'kon (marketplace) screens.
//
// `DokonPage.tsx` was committed importing these 7 components from
// `@/components/dokon/screens`, but the module was never created — which broke
// the production build (`vite build` resolves every lazy route ahead of time).
// These stubs restore a buildable state and render a clear "coming soon"
// placeholder. Replace them with the real screens when the marketplace UI is
// implemented.

import type { ReactNode } from "react";

function Placeholder({
  title,
  onBack,
}: {
  title: string;
  onBack?: () => void;
}): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="text-4xl mb-3">🛒</div>
      <h2 className="text-lg font-semibold text-neutral-800">{title}</h2>
      <p className="text-sm text-neutral-500 mt-1 max-w-xs">
        Do'kon bo'limi tez orada ishga tushadi.
      </p>
      {onBack && (
        <button
          onClick={onBack}
          className="mt-6 px-5 py-2 rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 transition-colors"
        >
          Orqaga
        </button>
      )}
    </div>
  );
}

export function S1_ShopHome(_props: {
  cartCount: number;
  onCart: () => void;
  onProductSelect: (product: any) => void;
}) {
  return <Placeholder title="Do'kon" />;
}

export function S2_ProjectMaterials(props: {
  projectName: string;
  materials: any;
  onAddToCart: () => void;
  onBack: () => void;
}) {
  return <Placeholder title="Loyiha materiallari" onBack={props.onBack} />;
}

export function S3_ProductDetail(props: {
  id: string;
  name: string;
  price: number;
  images: string[];
  specs: Array<{ label: string; value: string }>;
  dealers: Array<{ id: string; name: string; phone: string; url: string; badge?: string }>;
  description: string;
  onAddToCart: (productId: string, quantity: number) => void;
  onBack: () => void;
}) {
  return <Placeholder title={props.name} onBack={props.onBack} />;
}

export function S4_DealerComparison(props: {
  productName: string;
  dealers: any;
  onSelectDealer: (dealerId: string, dealerName: string) => void;
  onBack: () => void;
}) {
  return <Placeholder title="Dilerlarni taqqoslash" onBack={props.onBack} />;
}

export function S5_Cart(props: {
  items: any;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  onCheckout: () => void;
  onBack: () => void;
}) {
  return <Placeholder title="Savat" onBack={props.onBack} />;
}

export function S6_Payment(props: {
  subtotal: number;
  deliveryFee: number;
  itemCount: number;
  onSubmit: (data: { address: string; phone: string; paymentMethod: string }) => void;
  onBack: () => void;
}) {
  return <Placeholder title="To'lov" onBack={props.onBack} />;
}

export function S7_OrderTracking(props: {
  orderId: string;
  status: string;
  orderDate: string;
  expectedDelivery: string;
  courierName: string;
  courierPhone: string;
  courierMessage: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  onBack: () => void;
}) {
  return <Placeholder title="Buyurtma holati" onBack={props.onBack} />;
}
