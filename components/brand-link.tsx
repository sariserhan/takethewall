import Image from "next/image";
import Link from "next/link";
export function BrandLink({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`brand-link ${className}`}>
      <Image
        src="/brand/takethewall-icon.svg"
        alt=""
        width={32}
        height={32}
        unoptimized
      />
      <span>TAKE THE WALL</span>
    </Link>
  );
}
