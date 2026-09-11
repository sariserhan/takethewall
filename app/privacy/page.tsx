import { DocumentPage, documentMetadata } from "@/components/document-page";
export const metadata = documentMetadata("privacy");
export default function Page() {
  return <DocumentPage info="privacy" />;
}
