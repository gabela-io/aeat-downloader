{ pkgs, perSystem }:
pkgs.mkShell {
  packages = [
    pkgs.bun
    pkgs.typescript
    pkgs.just
    perSystem.self.formatter
  ];
  # Playwright drives the Chromium that nixpkgs builds for the same release.
  env = pkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
    PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers.override {
      withFirefox = false;
      withWebkit = false;
    };
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
  };
}
