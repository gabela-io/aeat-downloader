# End-to-end runs of the built extension in Chromium. No network: tests
# intercept every request and Chromium resolves no host names.
{ pkgs, perSystem, ... }:
let
  extension = perSystem.self.aeat-downloader;
  # Same Playwright release as @playwright/test in package.json.
  browsers = pkgs.playwright-driver.browsers.override {
    withFirefox = false;
    withWebkit = false;
  };
in
pkgs.stdenvNoCC.mkDerivation {
  name = "aeat-downloader-browser-tests";
  inherit (extension) src;
  nativeBuildInputs = [ pkgs.bun ];
  env = {
    PLAYWRIGHT_BROWSERS_PATH = browsers;
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
  };
  buildPhase = ''
    export HOME=$TMPDIR
    ln -s ${extension.nodeModules}/node_modules node_modules
    cp -r --no-preserve=mode ${extension} build
    bun --bun node_modules/@playwright/test/cli.js test
  '';
  installPhase = "touch $out";
  meta.platforms = pkgs.lib.platforms.linux;
}
