export const REQUIRED_SEMANTIC_TOKENS = [
  "--accent",
  "--accent-strong",
  "--highlight",
  "--bg-canvas",
  "--bg-elevated",
  "--bg-muted",
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--line-strong",
  "--line-subtle",
  "--success",
  "--danger",
] as const;

export const REQUIRED_CHART_TOKENS = [
  "--chart-categorical-1",
  "--chart-categorical-2",
  "--chart-categorical-3",
  "--chart-categorical-4",
  "--chart-categorical-5",
  "--chart-categorical-6",
  "--chart-positive",
  "--chart-negative",
  "--chart-neutral",
] as const;

type RequiredSemanticToken = (typeof REQUIRED_SEMANTIC_TOKENS)[number];
type RequiredChartToken = (typeof REQUIRED_CHART_TOKENS)[number];

export type CoreToken = RequiredSemanticToken | RequiredChartToken;
export type ThemeId = string;

export type ThemeDescriptor = {
  id: ThemeId;
  extends?: ThemeId;
  core?: Partial<Record<CoreToken, string>>;
  aliases?: Partial<Record<string, CoreToken | string>>;
  metadata?: {
    strictBrand?: boolean;
  };
};

export type ThemePatch = {
  core?: Partial<Record<CoreToken, string>>;
  aliases?: Partial<Record<string, string>>;
};

export type ResolvedTheme = {
  id: ThemeId;
  core: Record<CoreToken, string>;
  cssVars: Record<string, string>;
  metadata: ThemeDescriptor["metadata"];
};

type ResolveInput = {
  themeId: ThemeId;
  overrides?: ThemePatch;
};

const REQUIRED_TOKENS = [
  ...REQUIRED_SEMANTIC_TOKENS,
  ...REQUIRED_CHART_TOKENS,
] as const;

function assertAllRequiredTokens(core: Partial<Record<CoreToken, string>>, themeId: string) {
  const missing = REQUIRED_TOKENS.filter((token) => !core[token]);
  if (missing.length > 0) {
    throw new Error(
      `Theme "${themeId}" is missing required tokens: ${missing.join(", ")}`,
    );
  }
}

function resolveAlias(
  aliasValue: string,
  core: Record<CoreToken, string>,
  aliases: Record<string, string>,
): string {
  if (aliasValue in core) {
    return core[aliasValue as CoreToken];
  }
  if (aliasValue in aliases) {
    return aliases[aliasValue]!;
  }
  return aliasValue;
}

export class ThemeEngine {
  private readonly themes = new Map<ThemeId, ThemeDescriptor>();

  define(theme: ThemeDescriptor): void {
    this.themes.set(theme.id, theme);
  }

  defineMany(themes: ThemeDescriptor[]): void {
    for (const theme of themes) {
      this.define(theme);
    }
  }

  resolve({ themeId, overrides }: ResolveInput): ResolvedTheme {
    const descriptor = this.themes.get(themeId);
    if (!descriptor) {
      throw new Error(`Theme "${themeId}" is not defined.`);
    }

    const inherited = descriptor.extends
      ? this.resolve({ themeId: descriptor.extends })
      : null;

    const core = {
      ...(inherited?.core ?? {}),
      ...(descriptor.core ?? {}),
      ...(overrides?.core ?? {}),
    } as Partial<Record<CoreToken, string>>;

    assertAllRequiredTokens(core, descriptor.id);

    const mergedAliasesEntries = Object.entries({
      ...(inherited?.cssVars ?? {}),
      ...(descriptor.aliases ?? {}),
      ...(overrides?.aliases ?? {}),
    }).filter((entry): entry is [string, string] => entry[1] != null);
    const mergedAliases: Record<string, string> =
      Object.fromEntries(mergedAliasesEntries);

    const resolvedCore = core as Record<CoreToken, string>;
    const cssVars: Record<string, string> = {};

    for (const token of REQUIRED_TOKENS) {
      cssVars[token] = resolvedCore[token];
    }

    for (const [aliasName, aliasValue] of Object.entries(mergedAliases)) {
      cssVars[aliasName] = resolveAlias(aliasValue, resolvedCore, cssVars);
    }

    return {
      id: descriptor.id,
      core: resolvedCore,
      cssVars,
      metadata: descriptor.metadata,
    };
  }

  toCssVars(theme: ResolvedTheme): Record<string, string> {
    return { ...theme.cssVars };
  }

  toChartPalette(
    theme: ResolvedTheme,
    kind: "bar" | "pie",
  ): { series: string[]; positive: string; negative: string; neutral: string } {
    const series =
      kind === "bar"
        ? [
            theme.core["--chart-categorical-1"],
            theme.core["--chart-categorical-2"],
            theme.core["--chart-categorical-3"],
          ]
        : [
            theme.core["--chart-categorical-1"],
            theme.core["--chart-categorical-2"],
            theme.core["--chart-categorical-3"],
            theme.core["--chart-categorical-4"],
            theme.core["--chart-categorical-5"],
            theme.core["--chart-categorical-6"],
          ];

    return {
      series,
      positive: theme.core["--chart-positive"],
      negative: theme.core["--chart-negative"],
      neutral: theme.core["--chart-neutral"],
    };
  }
}
