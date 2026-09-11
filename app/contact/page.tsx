import Link from "next/link";
import { ContactForm } from "@/components/contact-form";
import { PublicFooter } from "@/components/public-footer";
export const metadata = {
  title: "Contact | TakeTheWall",
  description:
    "Questions about your wall, purchase, or milestone reward? Contact TakeTheWall.",
};
export default function Page() {
  return (
    <main className="document-page">
      <Link href="/">TAKE THE WALL</Link>
      <h1>GET IN TOUCH.</h1>
      <p>Ask a question, report content, or get help with a purchase.</p>
      <ContactForm />
      <PublicFooter />
    </main>
  );
}
