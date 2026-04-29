declare module "@iarna/toml/parse-string" {
  const parseToml: (toml: string) => Record<string, unknown>;
  export default parseToml;
}
