{
  pkgs,
  lib,
  config,
  ...
}:
{
  # https://devenv.sh/packages/
  packages = with pkgs; [
    # nodePackages.prettier
    # nodePackages.prettier-plugin-organize-imports
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
  git-hooks.hooks.prettier.enable = true;

  # See full reference at https://devenv.sh/reference/options/
}
