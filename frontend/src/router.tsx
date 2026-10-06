import { lazy, Suspense, type ReactNode } from "react";
import {
  createBrowserRouter,
  Navigate,
  useLocation,
  type RouteObject,
} from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { AppShell } from "@/components/layout/AppShell";
import { BrandLoader } from "@/components/BrandLoader";
import { LandingIntro } from "@/components/LandingIntro";

// ---------- Auth guard ----------

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

// Public landing at "/" for guests; authenticated users skip straight to their
// projects so "/" keeps behaving like the app entry for logged-in users.
function LandingGate() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/projects" replace />;
  return (
    <>
      <LandingIntro />
      {withSuspense(<LandingPage />)}
    </>
  );
}

// ---------- Loading fallback ----------

function withSuspense(node: ReactNode) {
  return <Suspense fallback={<BrandLoader />}>{node}</Suspense>;
}

// ---------- 404 ----------

function NotFoundPage() {
  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-6xl font-extrabold text-brand">404</h1>
      <p className="text-muted text-lg">Sahifa topilmadi</p>
      <a
        href="/projects"
        className="bg-brand text-white px-6 py-2.5 rounded-card font-semibold hover:bg-brand/90 transition-colors"
      >
        Bosh sahifaga qaytish
      </a>
    </div>
  );
}

// ---------- Lazy pages ----------

const WizardPage = lazy(() => import("@/pages/wizard/WizardPage"));
const StudioPage = lazy(() => import("@/pages/studio/StudioPage"));
const ThreeDPage = lazy(() => import("@/pages/studio/ThreeDPage"));
const PlacementPage = lazy(() => import("@/pages/studio/PlacementPage"));
const IsometricPage = lazy(() => import("@/pages/studio/IsometricPage"));
const WalkthroughPage = lazy(() => import("@/pages/studio/WalkthroughPage"));
const SmetaPage = lazy(() => import("@/pages/smeta/SmetaPage"));
const ProjectsPage = lazy(() => import("@/pages/projects/ProjectsPage"));
const DokonPage = lazy(() => import("@/pages/dokon/DokonPage"));
const UstalarPage = lazy(() => import("@/pages/ustalar/UstalarPage"));
const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage"));
const SellerPage = lazy(() => import("@/pages/seller/SellerPage"));
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const SharedRoomPage = lazy(() => import("@/pages/share/SharedRoomPage"));
const LidarPage = lazy(() => import("@/pages/scan/LidarPage"));
const Photo360Page = lazy(() => import("@/pages/scan/Photo360Page"));
const DrawRoomPage = lazy(() => import("@/pages/scan/DrawRoomPage"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));

// ---------- Routes ----------

const routes: RouteObject[] = [
  {
    path: "/",
    element: <LandingGate />,
  },
  {
    path: "/landing",
    element: withSuspense(<LandingPage />),
  },
  {
    path: "/login",
    element: withSuspense(<LoginPage />),
  },
  // Public, unauthenticated read-only room view — NOT nested under the
  // RequireAuth-wrapped /studio/:roomId tree below, same sibling-of-the-
  // shell placement as /login above.
  {
    path: "/share/:token",
    element: withSuspense(<SharedRoomPage />),
  },

  // ── Main shell (Uy + Do'kon bottom nav) ──
  {
    element: <AppShell />,
    children: [
      {
        path: "/projects",
        element: withSuspense(<RequireAuth><ProjectsPage /></RequireAuth>),
      },
      {
        path: "/dokon",
        element: withSuspense(<DokonPage />),
      },
      {
        path: "/ustalar",
        element: withSuspense(<UstalarPage />),
      },
      {
        path: "/profile",
        element: withSuspense(<ProfilePage />),
      },
      {
        path: "/seller",
        element: withSuspense(<RequireAuth><SellerPage /></RequireAuth>),
      },
    ],
  },

  // ── Full-screen flows (no bottom nav) ──
  {
    path: "/scan/lidar",
    element: withSuspense(<LidarPage />),
  },
  {
    path: "/scan/360",
    element: withSuspense(<Photo360Page />),
  },
  {
    path: "/scan/draw",
    element: withSuspense(<DrawRoomPage />),
  },
  {
    path: "/wizard",
    element: withSuspense(<RequireAuth><WizardPage /></RequireAuth>),
  },
  {
    path: "/studio/:roomId",
    element: withSuspense(<RequireAuth><StudioPage /></RequireAuth>),
    children: [
      {
        index: true,
        element: <Navigate to="ichkarida" replace />,
      },
      {
        path: "yuqori",
        element: withSuspense(<IsometricPage />),
      },
      {
        path: "ichkarida",
        element: withSuspense(<ThreeDPage />),
      },
      {
        // Same editor, opened in the furnishing phase (Mebelirovka tab)
        path: "mebel",
        element: withSuspense(<ThreeDPage />),
      },
      {
        // Same editor, opened in the lighting phase (Chiroqlar tab)
        path: "chiroqlar",
        element: withSuspense(<ThreeDPage />),
      },
      {
        path: "elektr",
        element: withSuspense(<PlacementPage />),
      },
      {
        path: "aylanish",
        element: withSuspense(<WalkthroughPage />),
      },
    ],
  },
  {
    path: "/smeta/:roomId",
    element: withSuspense(<RequireAuth><SmetaPage /></RequireAuth>),
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
];

export const router = createBrowserRouter(routes);
