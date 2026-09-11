import Link from "next/link";
export function PublicFooter() {
  return (
    <footer className="public-footer">
      <Link href="/">TAKE THE WALL</Link>
      <nav>
        {[
          ["About", "/about"],
          ["Support", "/support"],
          ["Contact", "/contact"],
          ["Reward Rules", "/rewards"],
          ["Privacy", "/privacy"],
          ["Terms", "/terms"],
          ["Disclaimer", "/disclaimer"],
          ["Disclosure", "/disclosure"],
        ].map(([name, url]) => (
          <Link key={url} href={url}>
            {name}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
