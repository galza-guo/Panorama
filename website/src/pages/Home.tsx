import { Code, Download, Lock, Monitor } from "lucide-react";
import Header from "../components/Header";

export default function Home() {
  return (
    <div className="bg-background text-foreground selection:bg-primary selection:text-primary-foreground min-h-screen font-mono">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="space-y-6 pt-6 pb-8 md:pt-10 md:pb-12 lg:py-32">
          <div className="container flex max-w-[64rem] flex-col items-center gap-4 px-4 text-center sm:px-8">
            <div className="bg-muted text-muted-foreground rounded-2xl px-4 py-1.5 text-sm font-medium">
              Desktop-First Investment Tracking
            </div>
            <h1 className="font-heading text-primary text-3xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              Your wealth, <span className="text-muted-foreground">in panorama.</span>
            </h1>
            <p className="text-muted-foreground max-w-[42rem] leading-normal sm:text-xl sm:leading-8">
              A beautiful, private, and open-source investment tracker. Forked from Wealthfolio to
              provide a refined, standalone Desktop experience.
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
                  Download Latest Release
                </a>
                <a
                  href="https://github.com/galza-guo/Panorama"
                  target="_blank"
                  rel="noreferrer"
                  className="focus-visible:ring-ring border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-11 items-center justify-center rounded-md border px-8 text-sm font-medium shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                >
                  <Code className="mr-2 h-4 w-4" />
                  GitHub
                </a>
              </div>
              <p className="text-muted-foreground text-xs">
                Always points to the latest release for macOS, Windows, and Linux.
              </p>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="container max-w-screen-2xl space-y-6 px-4 py-8 sm:px-8 md:py-12 lg:py-24">
          <div className="mx-auto grid justify-center gap-4 sm:grid-cols-2 md:max-w-[64rem] md:grid-cols-3">
            <div className="bg-background relative overflow-hidden rounded-lg border p-2">
              <div className="flex h-[180px] flex-col justify-between rounded-md p-6">
                <Monitor className="text-primary h-12 w-12" />
                <div className="space-y-2">
                  <h3 className="font-bold">Desktop Focused</h3>
                  <p className="text-muted-foreground text-sm">
                    Optimized strictly for macOS and Windows. No mobile compromises.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-background relative overflow-hidden rounded-lg border p-2">
              <div className="flex h-[180px] flex-col justify-between rounded-md p-6">
                <Lock className="text-primary h-12 w-12" />
                <div className="space-y-2">
                  <h3 className="font-bold">Local & Private</h3>
                  <p className="text-muted-foreground text-sm">
                    Your data stays on your device. No servers, no tracking, complete privacy.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-background relative overflow-hidden rounded-lg border p-2">
              <div className="flex h-[180px] flex-col justify-between rounded-md p-6">
                <Code className="text-primary h-12 w-12" />
                <div className="space-y-2">
                  <h3 className="font-bold">Open Source</h3>
                  <p className="text-muted-foreground text-sm">
                    Transparent code. Forked from Wealthfolio, maintained by the community.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Disclaimer / Fork Notice */}
        <section className="container max-w-screen-2xl px-4 py-12 sm:px-8 md:py-24 lg:py-32">
          <div className="mx-auto flex max-w-[58rem] flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-3xl leading-[1.1] font-bold sm:text-3xl md:text-6xl">
              Honoring the Source
            </h2>
            <p className="text-muted-foreground max-w-[85%] leading-normal sm:text-lg sm:leading-7">
              Panorama is proudly a fork of{" "}
              <a
                href="https://wealthfolio.app"
                className="hover:text-primary underline underline-offset-4"
              >
                Wealthfolio
              </a>
              . We love what they've built, but we have a different vision for a pure, robust
              Desktop experience.
              <br />
              <br />
              We are not affiliated with Wealthfolio. All credit for the foundation goes to their
              amazing team.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 md:py-0">
        <div className="container flex max-w-screen-2xl flex-col items-center justify-between gap-4 px-4 sm:px-8 md:h-24 md:flex-row">
          <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
            <div className="bg-primary hidden size-6 rounded-full md:block"></div>
            <p className="text-muted-foreground text-center text-sm leading-loose md:text-left">
              Built by{" "}
              <a
                href="https://x.com/Gallant_GUO"
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-4"
              >
                Gallant GUO
              </a>
              . The source code is available on{" "}
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
