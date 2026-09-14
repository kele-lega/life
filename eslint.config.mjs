import eslintConfig from "eslint-config-next/core-web-vitals";
import eslintConfigTypescript from "eslint-config-next/typescript";

const config = [
  ...eslintConfig,
  ...eslintConfigTypescript,
  { ignores: [".netlify/**", "android/**", "out/**", ".next-native/**", ".native-exclude/**"] },
];

export default config;
