import { DocumentPage, documentMetadata } from "@/components/document-page";
export const metadata = documentMetadata("about");
export default function Page() {
  return <DocumentPage info="about" />;
}
