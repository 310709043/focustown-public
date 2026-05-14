import { Link } from "@/i18n/routing";
import { LEGAL } from "@/lib/config/legal";

export function AppFooter() {
  return (
    <footer className="relative z-10 py-6 px-6 text-center text-[10px] text-muted">
      <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2">
        <span className="text-dim">© {new Date().getFullYear()} {LEGAL.companyName}</span>
        <Link href="/legal/terms" className="hover:text-accent-2">
          服務條款
        </Link>
        <Link href="/legal/privacy" className="hover:text-accent-2">
          隱私政策
        </Link>
        <Link href="/legal/refund" className="hover:text-accent-2">
          退款政策
        </Link>
      </div>
    </footer>
  );
}
