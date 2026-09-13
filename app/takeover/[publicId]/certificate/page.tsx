import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSharedTakeover } from "@/lib/shared-takeover";
import { CertificatePrint } from "@/components/certificate-print";
import { duration } from "@/lib/validation";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your Wall Certificate",
  robots: { index: false, follow: false },
};
export default async function Certificate({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const data = await getSharedTakeover(publicId);
  if (!data) notFound();
  const o = data.owner;
  return (
    <main className="certificate-page">
      <nav className="certificate-tools">
        <Link href={`/takeover/${publicId}`}>Back to placement</Link>
        <CertificatePrint />
      </nav>
      <article className="wall-certificate">
        <p className="eyebrow">TAKE THE WALL · A MOMENT ON THE INTERNET</p>
        <h1>Certificate of placement</h1>
        <p>
          On {new Date(o.activatedAt).toISOString().slice(0, 10)}, the wall
          displayed:
        </p>
        <h2>{o.displayName || o.domain}</h2>
        <blockquote>{o.description}</blockquote>
        <div className="certificate-facts">
          <p>
            <strong>Takeover</strong>
            <br />
            {o.takeoverNumber !== null
              ? `#${o.takeoverNumber}`
              : "Public placement"}
          </p>
          <p>
            <strong>Activated (UTC)</strong>
            <br />
            {new Date(o.activatedAt)
              .toISOString()
              .replace("T", " ")
              .replace(".000Z", " UTC")}
          </p>
          <p>
            <strong>Recorded unique visitors</strong>
            <br />
            {o.uniqueVisitors.toLocaleString("en-US")}
          </p>
          {data.replacedAt !== null && (
            <p>
              <strong>Completed reign</strong>
              <br />
              {duration(data.replacedAt - o.activatedAt)} (HH:MM:SS)
            </p>
          )}
        </div>
        <p className="certificate-id">Public record: {publicId}</p>
        <p>takethewall.com/takeover/{publicId}</p>
        <footer>
          This records the published message and activation time, not
          verification of the real-world event described. Content and visitor
          counts reflect the public record at export.
        </footer>
      </article>
    </main>
  );
}
