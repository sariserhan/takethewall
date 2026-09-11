import { DocumentPage, documentMetadata } from "@/components/document-page";
export const metadata = documentMetadata("terms");
export default function Page() {
  return <DocumentPage info="terms" />;
}
