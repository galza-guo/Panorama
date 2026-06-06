import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProviderIcon } from "./provider-icons";

describe("ProviderIcon", () => {
  it("renders imported logo assets for additional providers", () => {
    const { container } = render(<ProviderIcon name="LogoSiliconFlow" size={20} />);

    const image = container.querySelector("img");
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("aria-hidden", "true");
    expect(image).toHaveAttribute("width", "20");
    expect(image).toHaveAttribute("height", "20");
    expect(image?.getAttribute("src")).toContain("siliconflow");
  });

  it("renders a neutral icon for the custom OpenAI-compatible provider", () => {
    const { container } = render(<ProviderIcon name="LogoOpenAICompatible" size={20} />);

    expect(container.querySelector("[data-provider-icon='openai-compatible']")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });
});
