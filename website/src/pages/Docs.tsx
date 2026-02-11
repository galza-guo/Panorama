import "highlight.js/styles/github-dark.css";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useNavigate, useParams } from "react-router-dom";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import Header from "../components/Header";
import { cn } from "../lib/utils";

// Import all markdown files from the docs directory
const modules = import.meta.glob("../docs/**/*.md", { query: "?raw", import: "default" });

// Navigation configuration with categories and order
const NAV_CONFIG = {
  "Getting Started": [
    { path: "getting-started/introduction.md", label: "Introduction" },
    { path: "getting-started/installation.md", label: "Installation" },
    { path: "getting-started/privacy.md", label: "Privacy" },
  ],
  "Guides": [
    { path: "guides/dashboards.md", label: "Dashboards" },
    { path: "guides/activities.md", label: "Activities" },
    { path: "guides/accounts.md", label: "Accounts" },
    { path: "guides/goals.md", label: "Goals" },
    { path: "guides/settings.md", label: "Settings" },
    { path: "guides/export.md", label: "Export Data" },
  ],
  "Concepts": [
    { path: "concepts/activity-types.md", label: "Activity Types" },
    { path: "concepts/performance-metrics.md", label: "Performance Metrics" },
    { path: "concepts/market-data.md", label: "Market Data" },
  ],
  "Addons": [
    { path: "addons/overview.md", label: "Overview" },
    { path: "addons/getting-started.md", label: "Getting Started" },
    { path: "addons/api-reference.md", label: "API Reference" },
    { path: "addons/architecture.md", label: "Architecture" },
    { path: "addons/packages.md", label: "Packages" },
    { path: "addons/shared-query-client-design.md", label: "Query Client Design" },
  ],
  "Reference": [
    { path: "reference/features.md", label: "Features" },
    { path: "reference/faq.md", label: "FAQ" },
  ],
};

// Flatten nav items for quick lookup
const ALL_NAV_ITEMS = Object.values(NAV_CONFIG).flat();

export default function Docs() {
  const [content, setContent] = useState<string>("");
  const { "*": path } = useParams();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // Default to the first file if no path
    if (!path && ALL_NAV_ITEMS.length > 0) {
      navigate(`/docs/${ALL_NAV_ITEMS[0].path}`);
    }
  }, [path, navigate]);

  useEffect(() => {
    if (path) {
      const loadContent = async () => {
        // Handle file paths both with and without .md extension
        let filePath = `../docs/${path}`;

        // If exact path not found, try adding .md
        if (!modules[filePath] && !filePath.endsWith(".md")) {
          filePath = `../docs/${path}.md`;
        }

        if (modules[filePath]) {
          const text = (await modules[filePath]()) as string;
          setContent(text);
        } else {
          setContent("# 404 Not Found\nDocument not found.");
        }
      };
      loadContent();
    }
  }, [path]);

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
          {sidebarOpen ? "Close Menu" : "Menu"}
        </button>
      </div>

      <div className="container max-w-screen-2xl flex-1 items-start px-4 md:grid md:grid-cols-[240px_minmax(0,1fr)] md:gap-6 md:px-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10">
        {/* Sidebar */}
        <aside
          className={cn(
            "bg-background fixed inset-0 top-28 z-30 hidden h-[calc(100vh-7rem)] w-full shrink-0 overflow-y-auto border-r md:sticky md:top-14 md:block md:h-[calc(100vh-3.5rem)]",
            sidebarOpen && "!block",
          )}
        >
          <div className="py-6 pr-6 pl-4 md:pl-0">
            {Object.entries(NAV_CONFIG).map(([category, items]) => (
              <div key={category} className="mb-6">
                <h4 className="mb-2 font-bold tracking-tight text-sm uppercase text-muted-foreground">
                  {category}
                </h4>
                <div className="grid grid-flow-row auto-rows-max text-sm">
                  {items.map((item) => (
                    <Link
                      key={item.path}
                      to={`/docs/${item.path.replace(".md", "")}`}
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
