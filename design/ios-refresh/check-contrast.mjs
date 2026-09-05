import { readFileSync, writeFileSync } from "node:fs";

const css = readFileSync(new URL("../../src/app/design-system.css", import.meta.url), "utf8");
const split = css.split("@media (prefers-color-scheme: dark)");
const tokens = (text) => Object.fromEntries([...text.matchAll(/(--app-[\w-]+):\s*(#[\da-f]+);/gi)].map((match) => [match[1], match[2]]));
const light = tokens(split[0]);
const dark = { ...light, ...tokens(split[1].split("body {")[0]) };
const luminance = (hex) => {
  const raw = hex.slice(1);
  const normalized = raw.length === 3 ? [...raw].map((value) => value + value).join("") : raw;
  return [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
    const value = parseInt(normalized.slice(index * 2, index * 2 + 2), 16) / 255;
    return sum + weight * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  }, 0);
};
const checks = [
  ["正文 / 页面", "ink", "surface", 4.5], ["正文 / 内容面", "ink", "paper", 4.5],
  ["辅助文字 / 页面", "secondary", "surface", 4.5], ["辅助文字 / 内容面", "secondary", "paper", 4.5],
  ["辅助文字 / 分段底色", "secondary", "subtle", 4.5], ["主按钮文字", "action-text", "action", 4.5],
  ["强调文字 / 轻强调底色", "accent-ink", "accent-soft", 4.5], ["输入边界", "boundary", "paper", 3],
  ["键盘焦点", "focus", "paper", 3],
];
const report = Object.entries({ light, dark }).flatMap(([theme, palette]) => checks.map(([name, foreground, background, minimum]) => {
  const a = luminance(palette[`--app-${foreground}`]);
  const b = luminance(palette[`--app-${background}`]);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return { theme, name, ratio: Number(ratio.toFixed(2)), minimum, pass: ratio >= minimum };
}));
writeFileSync(new URL("contrast.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
if (report.some((check) => !check.pass)) process.exitCode = 1;
