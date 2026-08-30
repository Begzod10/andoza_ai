import { useState, useMemo } from "react";
import type { Material } from "@/lib/api";
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
  name: string;
  price: number;
  quantity: number;
  dealer: string;
  unit: string;
}

interface MockMaterial extends Material {
  stage?: string;
  quantity?: number;
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
  // Admins land straight in the management panel — the marketplace screens
  // below are an unbuilt "coming soon" stub, not something an admin came
  // here to look at. "Do'konga qaytish" still lets them peek at it.
  const [showAdminPanel, setShowAdminPanel] = useState(isAdmin);

  // Navigation
  const [screen, setScreen] = useState<Screen>("shop");

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<MockMaterial | null>(null);

  // Order state
  const [currentOrder, setCurrentOrder] = useState<any>(null);

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

  // Calculate totals
  const cartSummary = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const dealerSet = new Set(cart.map((item) => item.dealer));
    const deliveryFee = Array.from(dealerSet).reduce((sum, dealer) => {
      const fees: Record<string, number> = {
        "Yashil Savdo": 50000,
        "Qurilish Dunyosi": 75000,
        "Milliy Do'kon": 60000,
        "Zamirad": 40000,
      };
      return sum + (fees[dealer] ?? 50000);
    }, 0);

    return { subtotal, deliveryFee, total: subtotal + deliveryFee };
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
      name: selectedProduct.name_uz,
      price: selectedProduct.price_uzs,
      quantity,
      dealer: mockStores.find((s) => s.id === selectedProduct.store_id)?.name || "Do'kon",
      unit: selectedProduct.unit,
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

  const handlePayment = (data: {
    address: string;
    phone: string;
    paymentMethod: string;
  }) => {
    const order = {
      id: `ORD-${Date.now()}`,
      status: "accepted",
      orderDate: new Date().toLocaleDateString("uz-UZ"),
      expectedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString("uz-UZ"),
      address: data.address,
      phone: data.phone,
      paymentMethod: data.paymentMethod,
      items: cart,
      total: cartSummary.total,
      courier: {
        name: "Abdullayev Bobur",
        phone: "+998 90 123 45 67",
        message: "@courier_bot",
      },
    };

    setCurrentOrder(order);
    setCart([]);
    setScreen("order-tracking");
  };

  // Render screens
  if (isAdmin && showAdminPanel) {
    return (
      <div>
        <div className="px-4 pt-4">
          <button
            onClick={() => setShowAdminPanel(false)}
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            ← Do'konga qaytish
          </button>
        </div>
        <AdminCatalogPanel />
      </div>
    );
  }

  if (screen === "shop") {
    return (
      <div>
        {isAdmin && (
          <div className="flex justify-end px-4 pt-3">
            <button
              onClick={() => setShowAdminPanel(true)}
              className="text-xs font-semibold text-brand hover:text-brand-light"
            >
              ⚙ Boshqaruv paneli
            </button>
          </div>
        )}
        <S1_ShopHome
          cartCount={cart.length}
          onCart={() => setScreen("cart")}
          onProductSelect={handleProductSelect}
        />
      </div>
    );
  }

  if (screen === "product-detail" && selectedProduct) {
    const dealersForDetail: Array<{
      id: string;
      name: string;
      phone: string;
      url: string;
      badge?: string;
    }> = mockDealers.slice(0, 2).map((d) => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      url: d.url,
      badge: d.badge,
    }));

    return (
      <S3_ProductDetail
        id={selectedProduct.id}
        name={selectedProduct.name_uz}
        price={selectedProduct.price_uzs}
        images={[]}
        specs={[
          { label: "Hajm", value: "10 litr" },
          { label: "Tarkibi", value: "Akrilik" },
          { label: "Rangi", value: "Oq" },
          { label: "Sertifikat", value: "ISO 9001" },
        ]}
        dealers={dealersForDetail}
        description="Bu mahsulot samarali va uzun davom etadi. Professional uy egalari tomonidan tavsiya etiladi."
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
        onBack={() => setScreen("cart")}
      />
    );
  }

  if (screen === "order-tracking" && currentOrder) {
    const mockOrderItems = cart.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    }));

    return (
      <S7_OrderTracking
        orderId={currentOrder.id}
        status={currentOrder.status}
        orderDate={currentOrder.orderDate}
        expectedDelivery={currentOrder.expectedDelivery}
        courierName={currentOrder.courier.name}
        courierPhone={currentOrder.courier.phone}
        courierMessage={currentOrder.courier.message}
        items={mockOrderItems}
        total={currentOrder.total}
        onBack={() => setScreen("shop")}
      />
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
