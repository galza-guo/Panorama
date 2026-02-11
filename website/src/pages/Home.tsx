import { Code, Download, Lock, Monitor } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import Background from "../components/Background";
import Header from "../components/Header";

export default function Home() {
  const { t, i18n } = useTranslation();

  return (
    <div className="text-foreground selection:bg-primary selection:text-primary-foreground relative min-h-screen font-mono">
      <Background />
      <Header />

      <main className="relative z-10 flex-1">
        {/* Hero Section */}
        <section className="space-y-6 pt-6 pb-8 md:pt-10 md:pb-12 lg:py-32">
          <div className="container mx-auto flex max-w-[64rem] flex-col items-center gap-4 px-4 text-center sm:px-8">
            <div className="bg-muted text-muted-foreground rounded-2xl px-4 py-1.5 text-sm font-medium">
              {t("hero.badge")}
            </div>
            <h1 className="font-heading text-primary text-3xl font-bold tracking-tight whitespace-pre-line sm:text-5xl md:text-6xl lg:text-7xl">
              <span className="text-muted-foreground">{t("hero.title_start")}</span>
              <span className={i18n.language === "en" ? "italic" : ""}>{t("hero.title_end")}</span>
            </h1>
            <p className="text-muted-foreground max-w-[42rem] leading-normal whitespace-pre-line sm:text-xl sm:leading-8">
              <Trans
                i18nKey="hero.subtitle"
                components={[
                  <a
                    href="https://wealthfolio.app"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                    key="wealthfolio-link"
                  />,
                  <span className="text-foreground font-bold" key="highlight" />,
                ]}
              />
            </p>
            <div className="flex flex-col items-center gap-2 pt-4">
              <div className="space-x-4">
                <a
                  href="https://github.com/galza-guo/Panorama/releases/latest"
                  target="_blank"
                  rel="noreferrer"
                  className="focus-visible:ring-ring bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center justify-center rounded-md px-8 text-sm font-medium shadow transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {t("hero.download")}
                </a>
                <a
                  href="https://github.com/galza-guo/Panorama"
                  target="_blank"
                  rel="noreferrer"
                  className="focus-visible:ring-ring border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-11 items-center justify-center rounded-md border px-8 text-sm font-medium shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                >
                  <Code className="mr-2 h-4 w-4" />
                  {t("header.github")}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="container mx-auto max-w-screen-2xl space-y-6 px-4 py-8 sm:px-8 md:py-12 lg:py-24">
          <div className="mx-auto grid justify-center gap-4 sm:grid-cols-2 md:max-w-[64rem] md:grid-cols-3">
            <div className="bg-background relative overflow-hidden rounded-lg border p-2">
              <div className="flex h-[180px] flex-col justify-between rounded-md p-6">
                <Monitor className="text-primary h-12 w-12" />
                <div className="space-y-2">
                  <h3 className="font-bold">{t("features.desktop.title")}</h3>
                  <p className="text-muted-foreground text-sm">{t("features.desktop.desc")}</p>
                </div>
              </div>
            </div>
            <div className="bg-background relative overflow-hidden rounded-lg border p-2">
              <div className="flex h-[180px] flex-col justify-between rounded-md p-6">
                <Lock className="text-primary h-12 w-12" />
                <div className="space-y-2">
                  <h3 className="font-bold">{t("features.privacy.title")}</h3>
                  <p className="text-muted-foreground text-sm">{t("features.privacy.desc")}</p>
                </div>
              </div>
            </div>
            <div className="bg-background relative overflow-hidden rounded-lg border p-2">
              <div className="flex h-[180px] flex-col justify-between rounded-md p-6">
                <Code className="text-primary h-12 w-12" />
                <div className="space-y-2">
                  <h3 className="font-bold">{t("features.opensource.title")}</h3>
                  <p className="text-muted-foreground text-sm">{t("features.opensource.desc")}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Disclaimer / Fork Notice */}
        <section className="container mx-auto max-w-screen-2xl px-4 py-12 sm:px-8 md:py-24 lg:py-32">
          <div className="mx-auto flex max-w-[58rem] flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-3xl leading-[1.1] font-bold sm:text-3xl md:text-6xl">
              {t("footer.disclaimer_title")}
            </h2>
            <p className="text-muted-foreground max-w-[85%] leading-normal sm:text-lg sm:leading-7">
              {t("footer.disclaimer_text_1")}
              <a
                href="https://wealthfolio.app"
                className="hover:text-primary underline underline-offset-4"
              >
                Wealthfolio
              </a>
              {t("footer.disclaimer_text_2")}
              <br />
              <br />
              {t("footer.disclaimer_text_3")}
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 md:py-0">
        <div className="container mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-4 px-4 sm:px-8 md:h-24 md:flex-row">
          <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
            <div className="bg-primary hidden size-6 rounded-full md:block"></div>
            <p className="text-muted-foreground text-center text-sm leading-loose md:text-left">
              {t("footer.built_by")}
              <a
                href="https://x.com/Gallant_GUO"
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-4"
              >
                Gallant GUO
              </a>
              {t("footer.source_code")}
              <a
                href="https://github.com/galza-guo/Panorama"
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-4"
              >
                GitHub
              </a>
              .
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
