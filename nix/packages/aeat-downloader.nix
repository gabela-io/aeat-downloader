{ pkgs, ... }:
let
  inherit (pkgs) lib;
  fs = lib.fileset;
  version = (lib.importJSON ../../package.json).version;

  # Every dependency is plain JavaScript; `--os/--cpu '*'` keeps optional
  # platform packages too, so one hash fits every system.
  nodeModules = pkgs.stdenvNoCC.mkDerivation {
    pname = "aeat-downloader-node-modules";
    inherit version;
    src = fs.toSource {
      root = ../..;
      fileset = fs.unions [
        ../../package.json
        ../../bun.lock
      ];
    };
    nativeBuildInputs = [ pkgs.bun ];
    dontConfigure = true;
    buildPhase = ''
      export HOME=$TMPDIR
      bun install --frozen-lockfile --ignore-scripts --no-progress --os='*' --cpu='*'
    '';
    installPhase = "mkdir $out && mv node_modules $out/";
    dontFixup = true;
    outputHashMode = "recursive";
    outputHash = "sha256-rRbNgWpUD1Hj29XhXLqSZO9c1EEJ2LeUg0lkuEyKoCg=";
  };
in
pkgs.stdenvNoCC.mkDerivation {
  pname = "aeat-downloader";
  inherit version;
  src = fs.toSource {
    root = ../..;
    fileset = fs.unions [
      ../../package.json
      ../../tsconfig.json
      ../../build.ts
      ../../playwright.config.ts
      ../../src
      ../../test
    ];
  };
  nativeBuildInputs = [
    pkgs.bun
    pkgs.typescript
  ];
  configurePhase = ''
    export HOME=$TMPDIR
    # A copy, not a symlink: bundle comments would otherwise name the store path.
    cp -r ${nodeModules}/node_modules .
  '';
  buildPhase = "bun build.ts";
  doCheck = true;
  checkPhase = ''
    tsc --noEmit
    bun test test/*.test.ts
  '';
  # The unpacked extension, ready for chrome://extensions → "Load unpacked".
  installPhase = "cp -r build $out";
  passthru = { inherit nodeModules; };
  meta.description = "Read-only Chrome extension that downloads your filed AEAT returns";
}
