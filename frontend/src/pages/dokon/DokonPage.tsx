import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createOrder, getOrder } from "@/lib/api";
import type { Material, Order } from "@/lib/api";
import { errorMessage } from "./admin/errorMessage";
import { useAuthStore } from "@/store/authStore";
import {
  S1_ShopHome,
  S2_ProjectMaterials,
  S3_ProductDetail,
  S4_DealerComparison,
  S5_Cart,
  S6_Payment,
  S7_OrderTracking,
} from "@/components/dokon/screens";
import AdminCatalogPanel from "./AdminCatalogPanel";

type Screen =
  | "shop"
  | "project-materials"
  | "product-detail"
  | "dealer-comparison"
  | "cart"
  | "payment"
  | "order-tracking";

interface CartItem {
  id: string;
  /** Set for catalog materials; the server looks their price up itself. */
  materialId: string | null;
  /** Set for catalog furniture; likewise priced by the server. */
  furnitureId: string | null;
  /** The shop it belongs to — one order goes to one shop. Null for shop-less items. */
  storeId: string | null;
  name: string;
  price: number;
  quantity: number;
  dealer: string;
  unit: string;
}

/** What the shop home hands over: a catalog material, or a piece of furniture (no unit, maybe no price). */
interface MockMaterial extends Material {
  stage?: string;
  quantity?: number;
  store_name?: string | null;
  thumbnail_url?: string | null;
  placement?: string;
  footprint_w?: number | null;
  footprint_d?: number | null;
}

interface MockDealer {
  id: string;
  name: string;
  logo?: string;
  deliveryDays: string;
  price: number;
  deliveryFee: number;
  isBest?: boolean;
  badge?: string;
  phone: string;
  url: string;
}

/**
 * Main Do'kon (marketplace) page orchestrator
 * Manages all 7 screens with proper state and navigation
 */
export default function DokonPage() {
  // Admin-only catalog management (create shops, upload 3D models) — a
  // separate surface from the customer-facing marketplace screens below.
  const isAdmin = useAuthStore((s) => s.user)?.is_admin === true;

  // Navigation
  const [screen, setScreen] = useState<Screen>("shop");

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<MockMaterial | null>(null);

  // Orders placed in this visit (one per shop) and the state of the checkout
  const [placedOrders, setPlacedOrders] = useState<Order[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Mock data
  const mockMaterials: MockMaterial[] = [
    {
      id: "mat-1",
      name_uz: "Temir teshish uchun mashhur bo'yoq",
      price_uzs: 245000,
      unit: "litr",
      stage: "Poydevor",
      quantity: 2,
      color_hex: "#FF6B6B",
      category: "boyoq",
      store_id: "store-1",
      texture_key: null,
      pbr_roughness: 0.5,
    },
    {
      id: "mat-2",
      name_uz: "Premium sement",
      price_uzs: 185000,
      unit: "qop",
      stage: "Poydevor",
      quantity: 5,
      color_hex: "#A9A9A9",
      category: "sement",
      store_id: "store-1",
      texture_key: null,
      pbr_roughness: 0.8,
    },
    {
      id: "mat-3",
      name_uz: "Qum (qumlashdi)",
      price_uzs: 95000,
      unit: "tonna",
      stage: "Poydevor",
      quantity: 3,
      color_hex: "#F4D03F",
      category: "sement",
      store_id: "store-2",
      texture_key: null,
      pbr_roughness: 0.7,
    },
  ];

  const mockStores = [
    { id: "store-1", name: "Yashil Savdo" },
    { id: "store-2", name: "Qurilish Dunyosi" },
  ];

  const mockDealers: MockDealer[] = [
    {
      id: "dealer-1",
      name: "Yashil Savdo",
      deliveryDays: "2-3 kun",
      price: 245000,
      deliveryFee: 50000,
      badge: "Rasmiy diler",
      isBest: true,
      phone: "+998 90 123 45 67",
      url: "https://yashlsavdo.uz",
    },
    {
      id: "dealer-2",
      name: "Qurilish Dunyosi",
      deliveryDays: "1-2 kun",
      price: 255000,
      deliveryFee: 75000,
      isBest: false,
      phone: "+998 91 234 56 78",
      url: "https://qurilish.uz",
    },
    {
      id: "dealer-3",
      name: "Milliy Do'kon",
      deliveryDays: "3-5 kun",
      price: 235000,
      deliveryFee: 40000,
      isBest: false,
      phone: "+998 99 345 67 89",
      url: "https://milliy.uz",
    },
  ];

  // Totals. There is no delivery price anywhere in the catalog, so none is
  // invented: the order is for the goods, delivery is agreed with the shop.
  const cartSummary = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return { subtotal, deliveryFee: 0, total: subtotal };
  }, [cart]);

  // Handlers
  const handleProductSelect = (product: MockMaterial) => {
    setSelectedProduct(product);
    setScreen("product-detail");
  };

  const handleAddToCart = (productId: string, quantity: number) => {
    if (!selectedProduct) return;

    const existingItem = cart.find((item) => item.id === productId);
    const newItem: CartItem = {
      id: productId,
      // Furniture carries a placement; materials do not.
      materialId: "placement" in selectedProduct ? null : productId,
      furnitureId: "placement" in selectedProduct ? productId : null,
      storeId: selectedProduct.store_id ?? null,
      name: selectedProduct.name_uz,
      price: selectedProduct.price_uzs ?? 0,
      quantity,
      dealer: selectedProduct.store_name ?? mockStores.find((s) => s.id === selectedProduct.store_id)?.name ?? "Do'kon",
      unit: selectedProduct.unit ?? "dona",
    };

    if (existingItem) {
      setCart((prev) =>
        prev.map((item) =>
          item.id === productId ? { ...item, quantity: item.quantity + quantity } : item
        )
      );
    } else {
      setCart((prev) => [...prev, newItem]);
    }

    setScreen("shop");
  };

  const handleCartUpdate = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((item) => item.id !== itemId));
    } else {
      setCart((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, quantity } : item))
      );
    }
  };

  const handleCartRemove = (itemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleSelectDealer = (_dealerId: string, _dealerName: string) => {
    setScreen("cart");
  };

  const handleCheckout = () => {
    setScreen("payment");
  };

  // One order per shop: the API takes a single dealer per order. Lines are sent
  // shop by shop; whatever was ordered leaves the cart, so a failure half-way
  // leaves exactly the unordered shops there to try again.
  const handlePayment = async (data: {
    address: string;
    phone: string;
    paymentMethod: "cash" | "card";
  }) => {
    if (submitting) return;
    setSubmitting(true);
    setCheckoutError(null);

    // Grouped by shop id, not by name: two shops can share a name, and the
    // server refuses an order that mixes shops.
    const shopKey = (i: CartItem) => i.storeId ?? `name:${i.dealer}`;
    const byDealer = new Map<string, CartItem[]>();
    for (const item of cart) byDealer.set(shopKey(item), [...(byDealer.get(shopKey(item)) ?? []), item]);

    const created: Order[] = [];
    try {
      for (const [key, items] of byDealer) {
        const order = await createOrder({
          dealer_name: items[0].dealer,
          delivery_address: data.address,
          phone: data.phone,
          payment_method: data.paymentMethod,
          lines: items.map((i) => ({
            material_id: i.materialId,
            furniture_id: i.furnitureId,
            product_name: i.name,
            unit: i.unit,
            unit_price_uzs: i.price,
            quantity: i.quantity,
          })),
        });
        created.push(order);
        setCart((prev) => prev.filter((i) => shopKey(i) !== key));
      }
      setPlacedOrders(created);
      setScreen("order-tracking");
    } catch (err) {
      if (created.length > 0) setPlacedOrders(created);
      setCheckoutError(
        `${errorMessage(err, "Buyurtmani yuborib bo'lmadi")}${
          created.length > 0 ? ` (${created.length} ta buyurtma yuborildi, qolganlari savatda turibdi)` : ""
        }`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Render screens
  // Admin has no reason to ever see the customer marketplace stub below —
  // it's all "coming soon" placeholders, not a real shop to browse. Do'kon
  // in the sidebar IS the management panel for an admin, full stop.
  if (isAdmin) {
    return <AdminCatalogPanel />;
  }

  if (screen === "shop") {
    return (
      <S1_ShopHome
        cartCount={cart.length}
        onCart={() => setScreen("cart")}
        onProductSelect={handleProductSelect}
      />
    );
  }

  if (screen === "product-detail" && selectedProduct) {
    const p = selectedProduct;
    // Only what the catalog actually knows — no invented volume, composition or certificate.
    const specs: Array<{ label: string; value: string }> = [
      { label: "Kategoriya", value: p.category },
      ...(p.store_name ? [{ label: "Do'kon", value: p.store_name }] : []),
      ...(p.unit ? [{ label: "Birlik", value: p.unit }] : []),
      ...(p.footprint_w && p.footprint_d
        ? [{ label: "O'lcham", value: `${p.footprint_w} × ${p.footprint_d} m` }]
        : []),
    ];

    return (
      <S3_ProductDetail
        id={p.id}
        name={p.name_uz}
        price={p.price_uzs ?? null}
        images={p.thumbnail_url ? [p.thumbnail_url] : []}
        specs={specs}
        dealers={[]}
        description=""
        onAddToCart={handleAddToCart}
        onBack={() => setScreen("shop")}
      />
    );
  }

  if (screen === "dealer-comparison") {
    return (
      <S4_DealerComparison
        productName={selectedProduct?.name_uz ?? "Mahsulot"}
        dealers={mockDealers}
        onSelectDealer={handleSelectDealer}
        onBack={() => setScreen("shop")}
      />
    );
  }

  if (screen === "cart") {
    return (
      <S5_Cart
        items={cart}
        onUpdateQuantity={handleCartUpdate}
        onRemove={handleCartRemove}
        onCheckout={handleCheckout}
        onBack={() => setScreen("shop")}
      />
    );
  }

  if (screen === "payment") {
    return (
      <S6_Payment
        subtotal={cartSummary.subtotal}
        deliveryFee={cartSummary.deliveryFee}
        itemCount={cart.length}
        onSubmit={handlePayment}
        submitting={submitting}
        error={checkoutError}
        onBack={() => setScreen("cart")}
      />
    );
  }

  if (screen === "order-tracking" && placedOrders.length > 0) {
    return (
      <>
        {placedOrders.map((order) => (
          <TrackedOrder key={order.id} order={order} onBack={() => setScreen("shop")} />
        ))}
      </>
    );
  }

  if (screen === "project-materials") {
    return (
      <S2_ProjectMaterials
        projectName="Mening uyim tamirlash"
        materials={mockMaterials as any}
        onAddToCart={() => setScreen("cart")}
        onBack={() => setScreen("shop")}
      />
    );
  }

  return null;
}

/** One placed order, its status kept fresh while the screen is open. */
function TrackedOrder({ order, onBack }: { order: Order; onBack: () => void }) {
  const { data } = useQuery({
    queryKey: ["order", order.id],
    queryFn: () => getOrder(order.id),
    initialData: order,
    refetchInterval: 30_000,
  });

  return (
    <S7_OrderTracking
      orderId={`№ ${data.id.slice(0, 8).toUpperCase()}`}
      dealerName={data.dealer_name}
      status={data.status}
      orderDate={new Date(data.created_at).toLocaleDateString("uz-UZ")}
      address={data.delivery_address}
      phone={data.phone}
      paymentMethod={data.payment_method}
      items={data.lines.map((l) => ({ name: l.product_name, quantity: l.quantity, price: l.unit_price_uzs }))}
      total={data.total_uzs}
      onBack={onBack}
    />
  );
}
