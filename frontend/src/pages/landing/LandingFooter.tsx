import { Logo } from "@/components/branding/Logo";

export function LandingFooter() {
  return (
    <footer className="bg-paper border-t border-border py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Logo variant="horizontal" width={120} height={40} />
        <p className="text-sm text-muted text-center sm:text-right">
          © {new Date().getFullYear()} AndozaAI. Barcha huquqlar himoyalangan.
        </p>
      </div>
    </footer>
  );
}
