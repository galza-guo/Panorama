import { Github, Twitter } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils"; // We'll need to create this utility or just use clsx

interface HeaderProps {
  className?: string;
  showDocsLink?: boolean;
}

export default function Header({ className, showDocsLink = true }: HeaderProps) {
  return (
    <header
      className={cn(
        "border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur",
        className,
      )}
    >
      <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-2 text-lg font-bold">
          <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <img src="/logo.png" alt="Panorama Logo" className="size-8" />
            Panorama
          </Link>
        </div>
        <nav className="flex items-center gap-6 text-sm font-medium">
          {showDocsLink && (
            <Link to="/docs" className="hover:text-primary transition-colors">
              Docs
            </Link>
          )}
          <a
            href="https://github.com/galza-guo/Panorama"
            target="_blank"
            rel="noreferrer"
            className="hover:text-primary/80 transition-colors"
          >
            <Github className="size-5" />
            <span className="sr-only">GitHub</span>
          </a>
          <a
            href="https://x.com/Gallant_GUO"
            target="_blank"
            rel="noreferrer"
            className="hover:text-primary/80 transition-colors"
          >
            <Twitter className="size-5" />
            <span className="sr-only">X (Twitter)</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
