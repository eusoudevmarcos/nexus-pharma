import Image from "next/image";
import Link from "next/link";

type BrandVariant = "horizontal" | "stacked" | "compact";

export function Brand({ compact = false, variant }: { compact?: boolean; variant?: BrandVariant }) {
  const resolvedVariant = variant ?? (compact ? "compact" : "horizontal");
  const isCompact = resolvedVariant === "compact";
  const isStacked = resolvedVariant === "stacked";

  return (
    <Link className={`brand brand-${resolvedVariant}`} href="/" aria-label="Nexus Pharma — início">
      <Image
        className="brand-image-primary"
        src={isCompact ? "/logo/icon-nexus-pharma.png" : isStacked ? "/logo/logo-nexus-pharma.png" : "/logo/logo-nexus-horizontal.png"}
        alt={isCompact ? "" : "Nexus Pharma"}
        width={2000}
        height={isStacked ? 1500 : isCompact ? 970 : 500}
        priority
      />
      {isStacked ? (
        <Image
          className="brand-image-compact"
          src="/logo/icon-nexus-pharma.png"
          alt=""
          width={2000}
          height={970}
          priority
        />
      ) : null}
    </Link>
  );
}
