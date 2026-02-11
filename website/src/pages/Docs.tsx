import "highlight.js/styles/github-dark.css";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { Link, useNavigate, useParams } from "react-router-dom";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import Header from "../components/Header";
import { cn } from "../lib/utils";

// Import all markdown files including localized ones
const modules = import.meta.glob("../docs/**/*.md", { query: "?raw", import: "default" });

export default function Docs() {
  const { t, i18n } = useTranslation();
  const [content, setContent] = useState<string>("");
  const { "*": path } = useParams();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Navigation configuration using keys for translation
  const NAV_CONFIG = {
    [t("docs.nav.getting_started")]: [
      { path: "getting-started/introduction.md", label: t("docs.nav.introduction") },
      { path: "getting-started/installation.md", label: t("docs.nav.installation") },
      { path: "getting-started/privacy.md", label: t("docs.nav.privacy") },
    ],
    [t("docs.nav.guides")]: [
      { path: "guides/dashboards.md", label: t("docs.nav.dashboards") },
      { path: "guides/activities.md", label: t("docs.nav.activities") },
      { path: "guides/accounts.md", label: t("docs.nav.accounts") },
      { path: "guides/goals.md", label: t("docs.nav.goals") },
      { path: "guides/settings.md", label: t("docs.nav.settings") },
      { path: "guides/export.md", label: t("docs.nav.export") },
    ],
    [t("docs.nav.concepts")]: [
      { path: "concepts/activity-types.md", label: t("docs.nav.activity_types") },
      { path: "concepts/performance-metrics.md", label: t("docs.nav.performance_metrics") },
      { path: "concepts/market-data.md", label: t("docs.nav.market_data") },
    ],
    [t("docs.nav.addons")]: [
      { path: "addons/overview.md", label: t("docs.nav.overview") },
      { path: "addons/getting-started.md", label: t("docs.nav.getting_started") },
      { path: "addons/api-reference.md", label: t("docs.nav.api_reference") },
      { path: "addons/architecture.md", label: t("docs.nav.architecture") },
      { path: "addons/packages.md", label: t("docs.nav.packages") },
      { path: "addons/shared-query-client-design.md", label: t("docs.nav.query_client") },
    ],
    [t("docs.nav.reference")]: [
      { path: "reference/features.md", label: t("docs.nav.features") },
      { path: "reference/faq.md", label: t("docs.nav.faq") },
    ],
  };

  const ALL_NAV_ITEMS = Object.values(NAV_CONFIG).flat();

  useEffect(() => {
    // Default to the first file if no path
    // We use the raw path here, localization happens in loadContent
    if (!path && ALL_NAV_ITEMS.length > 0) {
      navigate(`/docs/${ALL_NAV_ITEMS[0].path}`);
    }
  }, [path, navigate, ALL_NAV_ITEMS]);

  useEffect(() => {
    if (path) {
      const loadContent = async () => {
        let basePath = `../docs/${path}`;

        // Ensure extension
        if (!basePath.endsWith(".md")) {
          basePath += ".md";
        }

        // Determine specific file based on language
        let targetPath = basePath;
        if (i18n.language === "zh") {
          const localizedPath = basePath.replace(".md", ".zh.md");
          if (modules[localizedPath]) {
            targetPath = localizedPath;
          }
        }

        if (modules[targetPath]) {
          const text = (await modules[targetPath]()) as string;
          setContent(text);
        } else if (modules[basePath]) {
          // Fallback to English if localized version missing
          const text = (await modules[basePath]()) as string;
          setContent(text);
        } else {
          setContent(`# ${t("docs.not_found")}\n${t("docs.not_found")}`);
        }
      };
      loadContent();
    }
  }, [path, i18n.language, t]);

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col font-mono">
      <Header showDocsLink={false} />

      {/* Mobile Sidebar Toggle */}
      <div className="border-border/40 bg-background sticky top-14 z-40 border-b p-4 md:hidden">
        <button
          className="flex items-center gap-2 text-sm font-medium"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <Menu className="h-4 w-4" />
          {sidebarOpen ? t("docs.menu_close") : t("docs.menu_open")}
        </button>
      </div>

      <div className="container mx-auto max-w-screen-2xl flex-1 items-start px-4 md:grid md:grid-cols-[240px_minmax(0,1fr)] md:gap-6 md:px-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10">
        {/* Sidebar */}
        <aside
          className={cn(
            "bg-background fixed inset-0 top-28 z-30 hidden h-[calc(100vh-7rem)] w-full shrink-0 overflow-y-auto border-r md:sticky md:top-14 md:block md:h-[calc(100vh-3.5rem)]",
            sidebarOpen && "!block",
          )}
        >
          <div className="py-6 pr-6 pl-4 md:pl-0">
            <h4 className="mb-4 text-lg font-bold tracking-tight">{t("docs.title")}</h4>
            {Object.entries(NAV_CONFIG).map(([category, items]) => (
              <div key={category} className="mb-6">
                <h4 className="text-muted-foreground mb-2 text-sm font-bold tracking-tight uppercase">
                  {category}
                </h4>
                <div className="grid grid-flow-row auto-rows-max text-sm">
                  {items.map((item) => (
                    <Link
                      key={item.path}
                      to={`/docs/${item.path}`} // Keep URL clean/standard
                      className={cn(
                        "group text-muted-foreground flex w-full items-center rounded-md border border-transparent px-2 py-1.5 transition-colors hover:underline",
                        (path === item.path || path === item.path.replace(".md", "")) &&
                          "text-foreground bg-muted/50 font-medium underline",
                      )}
                      onClick={() => setSidebarOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Main Content */}
        <main className="relative py-6 lg:gap-10 lg:py-8 xl:grid xl:grid-cols-[1fr_300px]">
          <div className="mx-auto w-full min-w-0">
            <article className="prose prose-neutral dark:prose-invert prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-img:rounded-lg prose-img:border prose-img:bg-muted max-w-none">
              <ReactMarkdown
                rehypePlugins={[rehypeHighlight, rehypeRaw]}
                components={{
                  img: ({ node, ...props }) => (
                    <img {...props} className="bg-muted rounded-lg border" />
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </article>
          </div>
        </main>
      </div>
    </div>
  );
}
