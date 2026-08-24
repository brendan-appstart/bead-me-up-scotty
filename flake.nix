{
  description = "Bead Me Up, Scotty — local web UI for the beads (bd) tracker";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          inherit (pkgs) lib;
          extraPath = [
            pkgs.beads
          ]
          ++ lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.xdg-utils ];
        in
        rec {
          scotty = pkgs.buildNpmPackage {
            pname = "bead-me-up-scotty";
            version = "0.1.0";
            src = ./.;

            npmDepsHash = "sha256-AIOJP4vFA6PyKIkhsxFqZEfizAuOe8BopgImw4eGx2U=";

            nodejs = pkgs.nodejs;

            npmBuildScript = "build";

            nativeBuildInputs = [
              pkgs.makeWrapper
            ]
            ++ lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.autoPatchelfHook ];

            buildInputs = lib.optionals pkgs.stdenv.hostPlatform.isLinux [
              pkgs.stdenv.cc.cc.lib
            ];

            # musl optional deps ship alongside glibc ones; they are unused on
            # NixOS and autoPatchelfHook would otherwise fail looking for musl libc.
            autoPatchelfIgnoreMissingDeps = [
              "libc.musl-x86_64.so.1"
              "libc.musl-aarch64.so.1"
            ];

            # Stripping native .node addons (sharp, next-swc) can break them.
            dontStrip = true;

            env = {
              NEXT_TELEMETRY_DISABLED = "1";
              BUILD_SHA = self.shortRev or self.dirtyShortRev or "";
              NODE_OPTIONS = "--max-old-space-size=4096";
            };

            postInstall = ''
              find "$out" \( -name '*linuxmusl*' -o -name '*linux-*-musl' \) -prune -exec rm -rf {} +
              wrapProgram $out/bin/scotty \
                --suffix PATH : ${lib.makeBinPath extraPath}
              wrapProgram $out/bin/bead-me-up-scotty \
                --suffix PATH : ${lib.makeBinPath extraPath}
            '';

            meta = {
              description = "Local web UI for the beads (bd) issue tracker";
              homepage = "https://github.com/brendan-appstart/bead-me-up-scotty";
              license = lib.licenses.mit;
              mainProgram = "scotty";
            };
          };
          default = scotty;
        }
      );

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.scotty}/bin/scotty";
        };
      });
    };
}
