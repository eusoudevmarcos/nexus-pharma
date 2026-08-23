import Image from "next/image";
import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={compact ? "brand brand-compact" : "brand"} href="/" aria-label="Nexus Pharma — início">
      <Image
        src={compact ? "/logo/icon-nexus-pharma.png" : "/logo/logo-nexus-horizontal.png"}
        alt={compact ? "" : "Nexus Pharma"}
        width={compact ? 2000 : 2000}
        height={compact ? 970 : 500}
        priority
      />
    </Link>
  );
}
