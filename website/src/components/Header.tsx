import { Github, Globe, Twitter } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";

interface HeaderProps {
  className?: string;
  showDocsLink?: boolean;
}

export default function Header({ className, showDocsLink = true }: HeaderProps) {
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === "en" ? "zh" : "en";
    i18n.changeLanguage(newLang);
  };

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
              {t("header.docs")}
            </Link>
          )}
          <button
            onClick={toggleLanguage}
            className="hover:text-primary flex items-center gap-1 transition-colors"
            aria-label="Toggle Language"
          >
            <Globe className="size-4" />
            <span>{i18n.language === "en" ? "EN" : "中文"}</span>
          </button>
          <a
            href="https://github.com/galza-guo/Panorama"
            target="_blank"
            rel="noreferrer"
            className="hover:text-primary/80 transition-colors"
          >
            <Github className="size-5" />
            <span className="sr-only">{t("header.github")}</span>
          </a>
          <a
            href="https://x.com/Gallant_GUO"
            target="_blank"
            rel="noreferrer"
            className="hover:text-primary/80 transition-colors"
          >
            <Twitter className="size-5" />
            <span className="sr-only">{t("header.twitter")}</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
