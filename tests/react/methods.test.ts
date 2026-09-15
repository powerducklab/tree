import { describe, expect, it } from "vitest";

import { METHOD_LABEL_MAP, getMethodLabel } from "../../src/react/libs/methods";

describe("METHOD_LABEL_MAP", () => {
  it("contains all common HTTP methods", () => {
    expect(METHOD_LABEL_MAP.get).toBe("GET");
    expect(METHOD_LABEL_MAP.post).toBe("POST");
    expect(METHOD_LABEL_MAP.put).toBe("PUT");
    expect(METHOD_LABEL_MAP.delete).toBe("DEL");
    expect(METHOD_LABEL_MAP.patch).toBe("PATCH");
    expect(METHOD_LABEL_MAP.head).toBe("HEAD");
    expect(METHOD_LABEL_MAP.options).toBe("OPT");
    expect(METHOD_LABEL_MAP.trace).toBe("TRA");
    expect(METHOD_LABEL_MAP.connect).toBe("CONN");
  });

  it("abbreviates long methods to fit compact badge", () => {
    expect(METHOD_LABEL_MAP.delete).toBe("DEL");
    expect(METHOD_LABEL_MAP.options).toBe("OPT");
    expect(METHOD_LABEL_MAP.trace).toBe("TRA");
    expect(METHOD_LABEL_MAP.connect).toBe("CONN");
  });

  it("keeps short methods unchanged", () => {
    expect(METHOD_LABEL_MAP.get).toBe("GET");
    expect(METHOD_LABEL_MAP.put).toBe("PUT");
  });
});

describe("getMethodLabel", () => {
  it("returns mapped label for known methods", () => {
    expect(getMethodLabel("DELETE")).toBe("DEL");
    expect(getMethodLabel("delete")).toBe("DEL");
    expect(getMethodLabel("Delete")).toBe("DEL");
    expect(getMethodLabel("OPTIONS")).toBe("OPT");
    expect(getMethodLabel("GET")).toBe("GET");
  });

  it("falls back to first 4 uppercase chars for unknown methods", () => {
    expect(getMethodLabel("PROPFIND")).toBe("PROP");
    expect(getMethodLabel("MKCOL")).toBe("MKCO");
    expect(getMethodLabel("COPY")).toBe("COPY");
  });

  it("handles whitespace and case variations", () => {
    expect(getMethodLabel("  post  ")).toBe("POST");
    expect(getMethodLabel("PaTcH")).toBe("PATCH");
  });

  it("handles empty string gracefully", () => {
    expect(getMethodLabel("")).toBe("");
  });
});
