// JSX typing for the Web Awesome elements used by the pages.
import "preact";

type WaProps = preact.HTMLAttributes<HTMLElement> & {
  variant?: "brand" | "neutral" | "success" | "warning" | "danger";
  size?: "xs" | "s" | "m" | "l" | "xl";
  appearance?: string;
};

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      "wa-callout": WaProps;
      "wa-spinner": WaProps;
      "wa-progress-bar": WaProps & { value?: number; label?: string };
    }
  }
}
