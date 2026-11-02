{ inputs, pkgs, ... }:
let
  mod = inputs.treefmt-nix.lib.evalModule pkgs {
    projectRootFile = "flake.nix";
    settings.excludes = [
      "bun.lock"
      # vendored agent skills (npx skills); refreshed upstream, not ours to format
      "skills-lock.json"
      # Spec Kit scaffolding (`specify init`); refreshed upstream, not ours to format
      ".specify/**"
      ".claude/**"
    ];
    programs = {
      # nix — deadnix strips dead code, then nixfmt formats
      deadnix.enable = true;
      deadnix.no-lambda-pattern-names = true;
      deadnix.priority = 1;
      nixfmt.enable = true;
      nixfmt.priority = 2;

      # ts, tsx, css, html, json, yaml and markdown
      prettier.enable = true;
      just.enable = true;
    };
  };
  wrapper = mod.config.build.wrapper;
in
wrapper
// {
  passthru = wrapper.passthru // {
    tests.check = mod.config.build.check ../.;
  };
}
