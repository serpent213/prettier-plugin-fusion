{
  pkgs,
  lib,
  config,
  ...
}:
{
  # https://devenv.sh/packages/
  packages = with pkgs; [
    nodePackages.ts-node
  ];

  # https://devenv.sh/languages/
  languages.javascript = {
    enable = true;
    pnpm = {
      enable = true;
      install.enable = true;
    };
  };

  languages.typescript.enable = true;

  # https://devenv.sh/git-hooks/
  git-hooks.hooks = {
    prettier.enable = true;
    prettier.files = "\\.(js|ts|json)$";
  };

  # See full reference at https://devenv.sh/reference/options/
}
