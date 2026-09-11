import { DocumentPage, documentMetadata } from "@/components/document-page";
export const metadata = documentMetadata("disclaimer");
export default function Page() {
  return <DocumentPage info="disclaimer" />;
}
