// @vitest-environment jsdom
import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Tree } from "../../src/react/Tree";
import type { TreeHandle } from "../../src/react/libs/types";

it("bounds mounted rows below 500 and preserves offscreen selection and search", async () => {
  const nodes = Array.from({ length: 450 }, (_, i) => ({
    id: `api-${i}`,
    name: `Endpoint ${i}`,
  }));

  const baseline = render(
    <Tree nodes={nodes} variant="api" maxHeight={400} />,
  );
  expect(screen.getAllByRole("treeitem")).toHaveLength(450);
  baseline.unmount();

  const ref = createRef<TreeHandle>();
  const view = render(
    <Tree
      nodes={nodes}
      variant="api"
      maxHeight={400}
      virtualized
      searchable
      ref={ref}
    />,
  );
  expect(screen.getAllByRole("treeitem").length).toBeLessThan(50);

  for (let i = 0; i < 20; i += 1) {
    const id = i % 2 ? "api-0" : "api-449";
    act(() => {
      ref.current?.locateNode((node) => node.id === id);
    });
    expect(ref.current?.getSelectedNode()?.id).toBe(id);
    expect(screen.getAllByRole("treeitem").length).toBeLessThan(50);
  }

  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Endpoint 449" },
  });
  expect(
    await screen.findByRole("treeitem", { name: "Endpoint 449" }),
  ).toBeInTheDocument();
  view.unmount();
});
