import { openUrlInBrowser } from "@/adapters";
import { forwardRef, useCallback } from "react";

interface ExternalLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

export const ExternalLink = forwardRef<HTMLAnchorElement, ExternalLinkProps>(
  ({ href, children, ...props }, ref) => {
    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        openUrlInBrowser(href);
      },
      [href],
    );

    return (
      <a ref={ref} href={href} onClick={handleClick} {...props}>
        {children}
      </a>
    );
  },
);

ExternalLink.displayName = "ExternalLink";
