import { describe, expect, it } from "vitest";

import config from "../../../capacitor.config";

describe("capacitor production shell", () => {
  it("uses a shared Android/iOS application id and bundled static assets", () => {
    expect(config.appId).toBe("app.kelelega.life");
    expect(config.appName).toBe("Life");
    expect(config.webDir).toBe("out");
    expect(config.server?.androidScheme).toBe("https");
    expect(config.server?.hostname).toBe("localhost");
    expect(config.server && "url" in config.server).toBe(false);
    expect(config.android?.allowMixedContent).toBe(false);
  });
});