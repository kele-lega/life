import eslintConfig from "eslint-config-next/core-web-vitals";
import eslintConfigTypescript from "eslint-config-next/typescript";

const config = [
  ...eslintConfig,
  ...eslintConfigTypescript,
  { ignores: ["android/**", "out/**", ".next-native/**", ".native-exclude/**", ".scratch/**"] },
];

export default config;
