import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountForm } from "./account-form";
import type { Account } from "@/lib/types";

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

vi.mock("./use-account-mutations", () => ({
  useAccountMutations: () => ({
    createAccountMutation: { mutate: vi.fn(), isPending: false },
    updateAccountMutation: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock("@/hooks/use-target-allocation", () => ({
  useTargetAllocation: () => ({ data: undefined }),
  useSetTargetAllocationAccountDefault: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@wealthfolio/ui/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@wealthfolio/ui/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <h2 className={className}>{children}</h2>,
}));

vi.mock("@wealthfolio/ui", async () => {
  const actual = await vi.importActual<typeof import("@wealthfolio/ui")>("@wealthfolio/ui");

  return {
    ...actual,
    CurrencyInput: ({ value, onChange }: { value?: string; onChange: (value: string) => void }) => (
      <input
        aria-label="Currency"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    ),
    ResponsiveSelect: ({
      value,
      onValueChange,
      options,
      placeholder,
    }: {
      value?: string;
      onValueChange: (value: string) => void;
      options: { value: string; label: string }[];
      placeholder?: string;
    }) => (
      <select
        aria-label={placeholder}
        value={value ?? ""}
        onChange={(event) => onValueChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
  };
});

const accounts = [
  { id: "acc-1", accountOwner: "Alice" },
  { id: "acc-2", accountOwner: "Bob" },
  { id: "acc-3", accountOwner: "Alice" },
  { id: "acc-4", accountOwner: null },
] as Account[];

describe("AccountForm", () => {
  it("shows existing account owners as owner suggestions", () => {
    render(
      <AccountForm
        accounts={accounts}
        defaultValues={{
          name: "Joint Brokerage",
          accountType: "SECURITIES",
          currency: "HKD",
          isActive: true,
          trackingMode: "TRANSACTIONS",
        }}
      />,
    );

    expect(screen.getByLabelText("Account Owner")).toBeInTheDocument();
    expect(
      [...document.querySelectorAll("datalist option")].map((option) =>
        option.getAttribute("value"),
      ),
    ).toEqual(["Alice", "Bob"]);
  });
});
