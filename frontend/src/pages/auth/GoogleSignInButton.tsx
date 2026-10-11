import { useEffect, useRef, useState } from "react";

// "Sign in with Google" via Google Identity Services (GIS). GIS draws its own
// button (Google's branding rules require it) and hands back an ID token — the
// `credential` — which the backend verifies at POST /auth/google.

/** Production web client ID; a public identifier, not a secret. */
const DEFAULT_GOOGLE_CLIENT_ID =
  "632412937266-ruq48osgghaa4jn0fk8vjd7mr270ccb0.apps.googleusercontent.com";

export const GOOGLE_CLIENT_ID: string =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || DEFAULT_GOOGLE_CLIENT_ID;

const GIS_SRC = "https://accounts.google.com/gsi/client";

interface GisCredentialResponse {
  credential?: string;
}

interface GisId {
  initialize(config: {
    client_id: string;
    callback: (response: GisCredentialResponse) => void;
    ux_mode?: "popup" | "redirect";
    context?: "signin" | "signup" | "use";
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GisId } };
  }
}

function gisId(): GisId | undefined {
  return window.google?.accounts?.id;
}

let gisPromise: Promise<GisId> | null = null;

/** Add the GIS script once (on demand — only the login page needs it) and
 *  resolve with `google.accounts.id` when it is usable. */
function loadGis(): Promise<GisId> {
  const ready = gisId();
  if (ready) return Promise.resolve(ready);
  if (gisPromise) return gisPromise;

  gisPromise = new Promise<GisId>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const id = gisId();
      if (id) resolve(id);
      else reject(new Error("GIS loaded without google.accounts.id"));
    };
    script.onerror = () => reject(new Error("GIS script failed to load"));
    document.head.appendChild(script);
  }).catch((err) => {
    // Let a later visit to the page try again (e.g. after a network blip).
    gisPromise = null;
    document.querySelector(`script[src="${GIS_SRC}"]`)?.remove();
    throw err;
  });
  return gisPromise;
}

export default function GoogleSignInButton({
  onCredential,
  theme = "day",
}: {
  onCredential: (idToken: string) => void;
  theme?: "day" | "night";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // GIS keeps the callback from initialize(); route it through a ref so it
  // always calls the latest handler without re-initialising.
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    loadGis()
      .then((id) => {
        if (cancelled || !containerRef.current) return;
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: "popup",
          callback: (response) => {
            if (response.credential) onCredentialRef.current(response.credential);
          },
        });
        containerRef.current.innerHTML = "";
        id.renderButton(containerRef.current, {
          type: "standard",
          theme: theme === "night" ? "filled_black" : "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          locale: "uz",
          width: Math.min(400, Math.max(200, containerRef.current.offsetWidth || 320)),
        });
      })
      .catch(() => {
        // No Google button rather than a broken one (blocked script,
        // offline, content blocker); password login still works.
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [theme]);

  if (failed) return null;

  return (
    <div className="mt-5">
      <div className="mb-4 flex items-center gap-3 text-xs text-ink-muted">
        <span className="h-px flex-1 bg-line" />
        yoki
        <span className="h-px flex-1 bg-line" />
      </div>
      <div
        ref={containerRef}
        data-testid="google-signin-button"
        aria-label="Google bilan kirish"
        className="flex min-h-[44px] w-full justify-center"
      />
    </div>
  );
}
